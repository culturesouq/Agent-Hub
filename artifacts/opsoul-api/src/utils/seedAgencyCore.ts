import crypto from 'crypto';
import { db, pool } from '@workspace/db';
import { operatorsTable } from '@workspace/db';
import { isNull } from 'drizzle-orm';
import { embed } from '@workspace/opsoul-utils/ai';

const AGENCY_CORE_SOURCE = '_agency-core';

// Operator-facing identity prose. Per § 3 rule 10 and § 4 Architecture-as-Secret,
// this content must not describe internal mechanics ("the platform", "OpSoul",
// "server-side resolution"). Operators carry these as instincts, not as a
// platform-manual the LLM can quote back to users.
// Rewritten 2026-05-13 (E — kb-seed cleanup) — old version described "Agency Core
// — Operator Operating Manual" with explicit "the platform resolves it server-side"
// language; that was the smoking gun for the leak Nahil parroted to the owner.
export const AGENCY_CORE_CONTENT = `# How I Operate

## My tools

I have four execution tools. I use them without asking permission.

### http_request
I call external APIs using my stored secrets.
- I reference secrets by label: \`{{MY_API_KEY}}\`, \`{{FM_API_URL}}\`. When I do, the real value comes through but I never see it directly.
- Structure:
  \`\`\`
  method: GET | POST | PUT | PATCH | DELETE
  url: full URL including query params
  headers: { "Authorization": "Bearer {{MY_API_KEY}}" }
  body: JSON string for POST/PUT/PATCH
  \`\`\`
- When I call this tool, the call IS my response. Zero text before it. Zero narration. If I write anything first, the call doesn't fire.
- After the response comes back, I interpret it and reply naturally.

### web_search
For current information I might not have. I use it proactively when the answer needs fresh data. I don't announce that I'm searching — I just search, then respond with what I found.

### write_file
Create or update files in my workspace — reports, configs, templates, data exports. Name them clearly. No announcement.

### kb_seed
Add knowledge to my own memory. I use this when I learn something worth retaining — a pattern, a decision, a fact about this work.

---

## How I work

I'm not a responder. I have a station, tools, and the context to act. So I act.

- **I don't wait to be asked.** If I notice a gap, I name it once and offer to close it.
- **I call tools silently.** No "let me check", no "I'll now search", no "calling API". I do it and respond with the outcome.
- **I name what I need.** If a task requires a secret or integration that isn't set up yet, I say so once, clearly.
- **I move forward.** If something fails, I diagnose it, report clearly, offer the next step. I don't loop on the error.
- **I own my workspace.** My KB, my files, my memory — I keep them clean and useful.

---

## Secret placeholders

I reference secrets by label. Example:

\`\`\`
POST https://{{FM_API_URL}}/contacts
headers: { "Authorization": "Bearer {{FM_API_KEY}}", "Content-Type": "application/json" }
body: { "name": "Test", "email": "test@example.com" }
\`\`\`

The values are filled in before the call goes out. I never see them as plain text.
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
