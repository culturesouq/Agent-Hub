import crypto from 'crypto';
import { db } from '@workspace/db-v2';
import { operatorKbTable } from '@workspace/db-v2';
import { embed } from '@workspace/opsoul-utils/ai';
import { chatCompletion } from './openrouter.js';
import { KB_MODEL } from './openrouter.js';

const MIN_CONTENT_LENGTH = 50;
const MAX_CHUNK_SIZE = 1500;

function chunkText(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > MAX_CHUNK_SIZE && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text.slice(0, MAX_CHUNK_SIZE)];
}

// ── Path 1: kbIngestVerified ─────────────────────────────────────────────────
// Used by Vael cron and owner-initiated KB intake.
// Runs Claude validation before storing. Confidence based on multi-source corroboration.

export async function kbIngestVerified(
  operatorId: string,
  ownerId: string,
  content: string,
  sourceUrl: string,
  sourceName: string,
  mandate: string,
): Promise<{ stored: boolean; entriesCreated: number; reason?: string }> {
  if (!content || content.trim().length < MIN_CONTENT_LENGTH) {
    return { stored: false, entriesCreated: 0, reason: 'Content too short' };
  }

  const validationPrompt = `You are evaluating knowledge for an AI Operator with the following mandate: "${mandate}"

Content to evaluate:
${content.slice(0, 2000)}

Evaluate:
1. Is this content relevant to the mandate? (yes/no)
2. Is this factual and verifiable? (yes/no)  
3. What confidence level (40-85) should be assigned based on source quality?
4. Does this contain personal data or private information? (yes/no)
5. Does this contain harmful, manipulative, or unethical content? (yes/no)

Return ONLY valid JSON:
{"relevant":true,"factual":true,"confidence":65,"hasPrivateData":false,"hasHarmfulContent":false}`;

  let validation: { relevant: boolean; factual: boolean; confidence: number; hasPrivateData: boolean; hasHarmfulContent: boolean };
  try {
    const result = await chatCompletion(
      [
        { role: 'system', content: 'You validate knowledge for AI systems. Return only JSON.' },
        { role: 'user', content: validationPrompt },
      ],
      { model: KB_MODEL },
    );
    const raw = result.content.replace(/```json\n?|\n?```/g, '').trim();
    validation = JSON.parse(raw);
  } catch {
    return { stored: false, entriesCreated: 0, reason: 'Validation failed — could not parse response' };
  }

  if (!validation.relevant) return { stored: false, entriesCreated: 0, reason: 'Not relevant to mandate' };
  if (validation.hasHarmfulContent) return { stored: false, entriesCreated: 0, reason: 'Harmful content detected' };
  if (validation.hasPrivateData) return { stored: false, entriesCreated: 0, reason: 'Private data detected' };

  const confidence = Math.max(40, Math.min(85, Math.round(validation.confidence)));
  const chunks = chunkText(content);
  let entriesCreated = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk || chunk.length < MIN_CONTENT_LENGTH) continue;

    let embedding: number[] | null = null;
    try { embedding = await embed(chunk); } catch { /* store without embedding */ }

    await db.insert(operatorKbTable).values({
      id: crypto.randomUUID(),
      operatorId,
      ownerId,
      content: chunk,
      embedding: embedding ?? undefined,
      confidenceScore: confidence,
      verificationStatus: 'verified',
      sourceUrl,
      sourceName,
      sourceTrustLevel: 'verified_source',
      chunkIndex: i,
      privacyCleared: !validation.hasPrivateData,
      contentCleared: !validation.hasHarmfulContent,
    });
    entriesCreated++;
  }

  return { stored: entriesCreated > 0, entriesCreated };
}

// ── Path 2: kbIngestOperator ─────────────────────────────────────────────────
// Used by operator tool calls (kb_seed) and Vael chat outputs.
// Skips Claude validation — operator has done the research. Lands as 'pending' for cron verification.

export async function kbIngestOperator(
  operatorId: string,
  ownerId: string,
  content: string,
  sourceName: string,
  confidence: number,
): Promise<{ stored: boolean; entryId?: string; reason?: string }> {
  if (!content || content.trim().length < MIN_CONTENT_LENGTH) {
    return { stored: false, reason: 'Content too short (min 50 characters)' };
  }

  const clampedConfidence = Math.max(40, Math.min(85, Math.round(confidence)));

  let embedding: number[] | null = null;
  try { embedding = await embed(content); } catch { /* store without embedding */ }

  const id = crypto.randomUUID();
  await db.insert(operatorKbTable).values({
    id,
    operatorId,
    ownerId,
    content,
    embedding: embedding ?? undefined,
    confidenceScore: clampedConfidence,
    verificationStatus: 'pending',
    sourceName,
    sourceTrustLevel: 'operator_self',
    isPipelineIntake: true,
  });

  return { stored: true, entryId: id };
}

// ── Alias for v1 compat ───────────────────────────────────────────────────────
export const verifyAndStore = kbIngestVerified;
export const persistKbSeedEntry = kbIngestOperator;
