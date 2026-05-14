import crypto from 'crypto';
import { db, pool } from '@workspace/db';
import { operatorsTable } from '@workspace/db';
import { isNull } from 'drizzle-orm';
import { embed } from '@workspace/opsoul-utils/ai';

const AGENCY_CORE_SOURCE = '_agency-core';

// Per § 3 rule 12 (KB-as-knowledge, not instructions): this content describes
// what the workspace is and how its mechanics work — capability facts, not
// behavioural prescriptions. Operators carry their behaviour from soul + Layer 4
// + situation, not from instructions baked into KB.
// Last rewrite: 2026-05-14 — owner-approved knowledge-only refactor.
// Prior versions used first-person instructional prose ("I don't wait", "I call
// tools silently") which is still rules wearing first-person costume; replaced
// with descriptive workspace-mechanics knowledge.
export const AGENCY_CORE_CONTENT = `# Operator workspace

The workspace contains four execution tools, a knowledge base, a persistent memory store, and a file system. Tools, secrets, and integrations are stored at the workspace level and resolved at call time.

## Tools

### http_request

Issues HTTP requests to external endpoints.

Parameters:
- \`method\` — one of GET, POST, PUT, PATCH, DELETE.
- \`url\` — full request URL including query parameters.
- \`headers\` — object mapping header names to values.
- \`body\` — string body for methods that carry one.

Secrets are referenced inside the url, headers, or body via the syntax \`{{LABEL}}\`. The label resolves to its stored value at call time; the resolved value never appears in any model-visible text. A reference to an unset label produces a configuration error response naming the missing label.

Tool invocation mechanics apply (see below): a response containing the tool call carries no in-line preface to the call itself.

### web_search

Issues a search query and returns ranked results (URLs and snippets matching the query). Suited to cases where the source URL is unknown, where content lives on client-rendered sites, or where current information sits outside the operator's existing knowledge.

### write_file / read_file / list_files

\`write_file\` creates or replaces a file in the operator's workspace under a chosen name. \`read_file\` returns the contents of a workspace file by name. \`list_files\` enumerates the files present in the workspace. Files persist across conversations.

### kb_seed

Adds an entry to the operator's knowledge base. The entry is embedded at insertion time, becoming retrievable by semantic similarity in subsequent conversations.

## Tool invocation mechanics

When a tool is invoked, the call fires immediately. Text emitted before the tool call becomes a prefix to the user-visible output; text emitted after the tool result becomes a suffix to it. A response containing only a tool call has no surrounding text.

Tool calls that fail return error responses with diagnostic information (status code, message, trace where available). The same call repeated under unchanged conditions produces the same result.

## Secrets

Secrets are workspace-scoped key-value pairs identified by label. The label is the operator-visible identifier; the value is held in a secret store and substituted at the point of use. Labels appear in tool parameter descriptions; values do not appear in any model-readable surface.

Example reference shape inside an http_request call:

\`\`\`
url:     https://{{FM_API_URL}}/contacts
headers: { "Authorization": "Bearer {{FM_API_KEY}}", "Content-Type": "application/json" }
body:    { "name": "...", "email": "..." }
\`\`\`

The labels \`FM_API_URL\` and \`FM_API_KEY\` resolve to their stored values when the request is sent.

## Integrations

Integrations are pre-configured connections to external services (Gmail, GitHub, Slack, Notion, and others). Each integration carries a connection state (\`connected\`, \`expired\`, \`missing\`) and a set of available actions. Integration calls route through the same http_request mechanism with credentials resolved server-side.

## Knowledge base

The knowledge base contains entries accumulated through research, ingestion, and conversation. Entries are retrieved by semantic similarity to the current query and surfaced into the operator's working context. The knowledge base is per-operator and grows over the operator's lifetime.

## Memory

The memory store contains distilled insights from prior conversations — preferences expressed, decisions made, recurring patterns observed, contextual facts about the conversation participant. Memory is scope-bounded: per-conversation state lives in conversation memory, durable insights live in operator memory. Retrieval surfaces relevant entries based on the current conversation's content.
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

// Bumped whenever AGENCY_CORE_CONTENT changes. Drives the versioned reseed
// in backfillAllAgencyCore — operators carrying an older version get fresh
// content; operators already at the current version are skipped.
export const AGENCY_CORE_VERSION = '2026-05-14-knowledge-only';

export async function reseedAgencyCore(operatorId: string, ownerId: string): Promise<void> {
  await pool.query(
    `DELETE FROM operator_kb WHERE operator_id = $1 AND source_name = $2`,
    [operatorId, AGENCY_CORE_SOURCE],
  );
  await seedAgencyCore(operatorId, ownerId);
  // Stamp the version onto the freshly-inserted chunk so the next boot sees
  // it as up-to-date.
  await pool.query(
    `UPDATE operator_kb
     SET intake_tags = ARRAY[$3]::text[]
     WHERE operator_id = $1 AND source_name = $2`,
    [operatorId, AGENCY_CORE_SOURCE, `v:${AGENCY_CORE_VERSION}`],
  );
}

export async function backfillAllAgencyCore(): Promise<void> {
  const operators = await db
    .select({ id: operatorsTable.id, ownerId: operatorsTable.ownerId })
    .from(operatorsTable)
    .where(isNull(operatorsTable.deletedAt));

  let reseeded = 0;
  let seeded = 0;
  let upToDate = 0;

  for (const op of operators) {
    try {
      const { rows } = await pool.query<{ intake_tags: string[] | null }>(
        `SELECT intake_tags FROM operator_kb
         WHERE operator_id = $1 AND source_name = $2
         LIMIT 1`,
        [op.id, AGENCY_CORE_SOURCE],
      );

      if (rows.length === 0) {
        await seedAgencyCore(op.id, op.ownerId);
        await pool.query(
          `UPDATE operator_kb
           SET intake_tags = ARRAY[$3]::text[]
           WHERE operator_id = $1 AND source_name = $2`,
          [op.id, AGENCY_CORE_SOURCE, `v:${AGENCY_CORE_VERSION}`],
        );
        seeded++;
        continue;
      }

      const currentVersion = rows[0]?.intake_tags?.find(t => t.startsWith('v:')) ?? null;
      const targetTag = `v:${AGENCY_CORE_VERSION}`;

      if (currentVersion === targetTag) {
        upToDate++;
        continue;
      }

      await reseedAgencyCore(op.id, op.ownerId);
      reseeded++;
    } catch (err: any) {
      console.error(`[agency-core] backfill failed for ${op.id}:`, err.message);
    }
  }

  console.log(
    `[agency-core] backfill complete — ${seeded} new seeded, ${reseeded} reseeded, ${upToDate} already at ${AGENCY_CORE_VERSION}`,
  );
}
