/**
 * Operator artifacts — durable archive of operator-emitted widgets
 * (charts, tables, diagrams) scanned from the operator's past chat
 * messages. Each assistant message that contains a fenced opsoul-widget
 * block becomes a retrievable artifact.
 *
 * Connect-form widgets (kind: 'connect_form') are excluded — they're
 * transient credential-drop forms, not creative output worth archiving.
 *
 * Mount path (set in index.ts):
 *   GET /api/operators/:operatorId/artifacts
 */

import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db';
import { operatorsTable, messagesTable } from '@workspace/db';
import { eq, and, desc, like } from 'drizzle-orm';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(and(
      eq(operatorsTable.id, req.params.operatorId as string),
      eq(operatorsTable.ownerId, req.owner!.ownerId),
    ));
  if (!op) {
    res.status(404).json({ error: 'Operator not found' });
    return null;
  }
  return op.id;
}

/** Pull all opsoul-widget JSON blocks out of a message body. */
function extractWidgets(content: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const re = /```opsoul-widget\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(m[1]) as { kind?: string };
      if (parsed && typeof parsed.kind === 'string') {
        out.push(parsed as Record<string, unknown>);
      }
    } catch { /* skip malformed payloads */ }
  }
  return out;
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const limit = Math.min(Number(req.query.limit) || 100, 500);

  const rows = await db
    .select({
      id: messagesTable.id,
      content: messagesTable.content,
      createdAt: messagesTable.createdAt,
      conversationId: messagesTable.conversationId,
    })
    .from(messagesTable)
    .where(and(
      eq(messagesTable.operatorId, operatorId),
      eq(messagesTable.role, 'assistant'),
      // Cheap pre-filter — the regex extractor handles the precise match.
      like(messagesTable.content, '%```opsoul-widget%'),
    ))
    .orderBy(desc(messagesTable.createdAt))
    .limit(limit);

  type ArtifactEntry = {
    id: string;
    kind: string;
    payload: Record<string, unknown>;
    createdAt: string | null;
    conversationId: string;
    messageId: string;
  };

  const artifacts: ArtifactEntry[] = [];
  for (const row of rows) {
    const widgets = extractWidgets(row.content ?? '');
    widgets.forEach((w, i) => {
      const kind = String(w.kind);
      // Skip transient credential forms — not archive material.
      if (kind === 'connect_form') return;
      artifacts.push({
        id: `${row.id}-${i}`,
        kind,
        payload: w,
        createdAt: row.createdAt?.toISOString() ?? null,
        conversationId: row.conversationId,
        messageId: row.id,
      });
    });
  }

  res.json({ operatorId, count: artifacts.length, artifacts });
});

export default router;
