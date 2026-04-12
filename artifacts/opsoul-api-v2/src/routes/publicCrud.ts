import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
import {
  operatorsTable,
  operatorDeploymentSlotsTable,
} from '@workspace/db-v2';
import { eq, and } from 'drizzle-orm';
import { chatCompletion } from '../utils/openrouter.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { embed } from '@workspace/opsoul-utils/ai';

const router = Router();

function getSlotKey(req: Request): string | null {
  const auth = req.headers.authorization;
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

const CrudActionSchema = z.object({
  action:  z.string().min(1).max(500),
  payload: z.record(z.unknown()).optional(),
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const rawKey = getSlotKey(req);
  if (!rawKey) { res.status(401).json({ error: 'Slot key required' }); return; }

  const hashedKey = hashKey(rawKey);
  const [slot] = await db.select().from(operatorDeploymentSlotsTable)
    .where(and(eq(operatorDeploymentSlotsTable.apiKey, hashedKey), eq(operatorDeploymentSlotsTable.isActive, true)));

  if (!slot) { res.status(401).json({ error: 'Invalid or revoked slot key' }); return; }

  if (slot.surfaceType !== 'crud') {
    res.status(403).json({ error: 'Only crud slots can use this endpoint' });
    return;
  }

  const parsed = CrudActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const { action, payload } = parsed.data;

  const [operator] = await db.select().from(operatorsTable).where(eq(operatorsTable.id, slot.operatorId));
  if (!operator) { res.status(404).json({ error: 'Operator not found' }); return; }

  const actionText = payload
    ? `${action}\n\nPayload:\n${JSON.stringify(payload, null, 2)}`
    : action;

  let ragContext = '';
  try {
    const embedding = await embed(action);
    const kbHits = await searchBothKbs(
      slot.operatorId,
      embedding,
      5,
      30,
      operator.archetype ?? [],
      operator.domainTags ?? [],
    );
    ragContext = buildRagContext(kbHits);
  } catch { /* non-fatal */ }

  const soul = operator.layer2Soul as Record<string, unknown> | null;
  const systemLines = [
    `You are ${operator.name}, an AI operator executing a backend action.`,
    soul?.mandate ? `Mandate: ${soul.mandate as string}` : '',
    ragContext ? `\n## Relevant Knowledge\n${ragContext}` : '',
    '\nExecute the action precisely. Return structured output when possible.',
  ].filter(Boolean).join('\n');

  const result = await chatCompletion(
    [
      { role: 'system', content: systemLines },
      { role: 'user', content: actionText },
    ],
    { model: operator.defaultModel ?? 'anthropic/claude-haiku-4-5' },
  );

  res.json({ result: result.content });
});

export default router;
