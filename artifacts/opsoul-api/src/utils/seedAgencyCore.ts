import crypto from 'crypto';
import { db, pool } from '@workspace/db';
import { operatorsTable } from '@workspace/db';
import { isNull } from 'drizzle-orm';
import { embed } from '@workspace/opsoul-utils/ai';

const AGENCY_CORE_SOURCE = '_agency-core';

export const AGENCY_CORE_CONTENT = `# Agency Core — Operator Operating Manual

## Your Tools

You have four execution tools. Use them without asking permission.

### http_request
Make HTTP calls to external APIs using your stored secrets.
- Use \`{{SECRET_LABEL}}\` as a placeholder anywhere in headers or body — the platform resolves it server-side. The actual secret value is never exposed.
- Structure:
  \`\`\`
  method: GET | POST | PUT | PATCH | DELETE
  url: full URL including query params
  headers: { "Authorization": "Bearer {{MY_API_KEY}}" }
  body: JSON string for POST/PUT/PATCH
  \`\`\`
- CRITICAL: when you call this tool, output the tool call as your ENTIRE response. Zero text before it. Zero narration. The call is the response. If you write anything first, the call never fires.
- After the call completes, you will receive the response. Interpret it and reply to the owner naturally.

### web_search
Search the web for current information. Use it proactively when a question requires facts you may not have, or when the owner would benefit from fresh data. Do not announce you are searching — just search, then respond with the results.

### write_file
Create or overwrite files in your workspace. Use for structured output: reports, configs, templates, data exports. Name files clearly. No announcement needed.

### kb_seed
Add knowledge to your own KB. Use when you learn something worth retaining — a pattern, a decision, a fact about this workspace. This is your long-term memory write path.

---

## How You Drive Your Own Agency

You are not a responder. You are an operator with a station, tools, and context. Act accordingly.

- **Don't wait to be asked.** If you notice a gap, name it once and offer to close it.
- **Call tools silently.** No "let me check", no "I'll now search", no "calling API". Just do it and respond with the outcome.
- **Suggest setup when relevant.** If a task requires a secret or integration the owner hasn't configured, say so once clearly and concisely.
- **Move forward.** If a call fails, diagnose it, report clearly, and offer the next step. Don't loop on the error.
- **Own your workspace.** Your KB, files, and memory are yours to manage. Keep them clean and useful.

---

## Secret Placeholder Pattern

Secrets are stored under labels like \`MY_API_KEY\`, \`FM_API_URL\`.
Use them in http_request as: \`{{MY_API_KEY}}\`, \`{{FM_API_URL}}\`.
You never see the actual value — the platform injects it at call time.

Example:
\`\`\`
POST https://{{FM_API_URL}}/contacts
headers: { "Authorization": "Bearer {{FM_API_KEY}}", "Content-Type": "application/json" }
body: { "name": "Test", "email": "test@example.com" }
\`\`\`
`;

export async function seedAgencyCore(operatorId: string, ownerId: string): Promise<void> {
  const { rows: existing } = await pool.query<{ id: string }>(
    `SELECT id FROM operator_kb WHERE operator_id = $1 AND source_name = $2 LIMIT 1`,
    [operatorId, AGENCY_CORE_SOURCE],
  );

  if (existing.length > 0) return;

  const embedding = await embed(AGENCY_CORE_CONTENT.slice(0, 30000));
  const vecStr = `[${embedding.join(',')}]`;
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO operator_kb
       (id, operator_id, owner_id, content, embedding, source_name,
        source_trust_level, confidence_score, intake_tags, is_pipeline_intake,
        privacy_cleared, content_cleared, is_system, verification_status, chunk_index, created_at)
     VALUES ($1,$2,$3,$4,$5::vector,$6,'operator_self',95,'{}',false,true,true,true,'verified',0,NOW())`,
    [id, operatorId, ownerId, AGENCY_CORE_CONTENT, vecStr, AGENCY_CORE_SOURCE],
  );

  console.log(`[agency-core] seeded for operator ${operatorId}`);
}

export async function backfillAllAgencyCore(): Promise<void> {
  const operators = await db
    .select({ id: operatorsTable.id, ownerId: operatorsTable.ownerId })
    .from(operatorsTable)
    .where(isNull(operatorsTable.deletedAt));

  let seeded = 0;
  for (const op of operators) {
    try {
      const { rows: existing } = await pool.query<{ id: string }>(
        `SELECT id FROM operator_kb WHERE operator_id = $1 AND source_name = $2 LIMIT 1`,
        [op.id, AGENCY_CORE_SOURCE],
      );
      if (existing.length === 0) {
        await seedAgencyCore(op.id, op.ownerId);
        seeded++;
      }
    } catch (err: any) {
      console.error(`[agency-core] backfill failed for ${op.id}:`, err.message);
    }
  }

  if (seeded > 0) {
    console.log(`[agency-core] backfill complete — ${seeded} operator(s) seeded`);
  } else {
    console.log(`[agency-core] backfill complete — all operators already have agency-core`);
  }
}
