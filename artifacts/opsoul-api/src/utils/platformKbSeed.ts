import { pool } from '@workspace/db';
import { embed } from '@workspace/opsoul-utils/ai';

interface PlatformKbEntry {
  content: string;
}

export const PLATFORM_KB_ENTRIES: PlatformKbEntry[] = [
  {
    content: `Web Search (web_search) uses the Serper API. Query format: send { "q": "<search query>", "num": 10 } as JSON. Results return an "organic" array where each result has "title", "link", and "snippet" fields. Use "snippet" for a quick summary and "link" for the source URL. The API key is injected automatically by the platform — no Authorization header is needed in the skill body.`,
  },
  {
    content: `HTTP Request (http_request) requires a "Content-Type: application/json" header whenever sending a JSON body. Always include headers: { "Content-Type": "application/json" } in the skill configuration. Without this header, many REST APIs silently reject or misparse the request body, returning 400 or 415 errors.`,
  },
  {
    content: `HTTP Request authentication patterns: Bearer tokens go in the Authorization header as "Authorization: Bearer <token>". API keys typically go in a custom header such as "X-API-Key: <key>" or as a query parameter ?api_key=<key>. OAuth 2.0 access tokens are also passed as Bearer tokens. Check the target API's documentation — the exact pattern varies per API.`,
  },
  {
    content: `Gmail API and most Google APIs use cursor-based pagination via the "nextPageToken" field. To paginate: send the initial request, read "nextPageToken" from the response body, then send a follow-up request with query parameter "pageToken=<value>". When "nextPageToken" is absent from a response, you have reached the last page. Default page size is usually 100 results; set "maxResults" to adjust.`,
  },
  {
    content: `Write File (write_file) saves text content to a file on the operator file system. Provide "path" (relative path, e.g. "reports/summary.md") and "content" (the full text to write). Existing files at that path are overwritten without warning. Use forward slashes in paths. Supported content: plain text, JSON, Markdown, CSV.`,
  },
  {
    content: `KB Seed (kb_seed) adds new knowledge entries directly to the operator's knowledge base. Provide "content" (the knowledge text) and an optional "sourceName" to attribute the origin. Seeded entries are embedded and available for retrieval in future conversations immediately after insertion. Use this skill to permanently store insights, facts, or summaries the operator must remember across conversations.`,
  },
  {
    content: `Skill triggers fire automatically when the operator's LLM response to a user message semantically matches the skill's triggerDescription. The platform detects the trigger after the first LLM pass, executes the skill, then runs a second LLM pass incorporating the skill output. Skills must have specific, unambiguous trigger descriptions to prevent false positives. Avoid generic phrases like "user asks a question" — be precise about the intent.`,
  },
  {
    content: `HTTP Request error handling reference: 429 = rate limit exceeded, wait and retry with exponential backoff. 401 = authentication failed, check token or API key validity. 403 = forbidden, check scopes or permissions. 422 = request body rejected, verify JSON structure and required fields. 5xx = server-side error on the target API, retry after a short delay. Always log the response body on errors — it usually contains the specific reason.`,
  },
];

const PLATFORM_KB_SOURCE = '_platform-kb';

export async function seedPlatformKb(operatorId: string, ownerId: string): Promise<void> {
  const { rows: existing } = await pool.query<{ id: string }>(
    `SELECT id FROM operator_kb WHERE operator_id = $1 AND source_name = $2 LIMIT 1`,
    [operatorId, PLATFORM_KB_SOURCE],
  );
  if (existing.length > 0) return;

  const embeddings = await Promise.all(
    PLATFORM_KB_ENTRIES.map(entry => embed(entry.content)),
  );

  for (let idx = 0; idx < PLATFORM_KB_ENTRIES.length; idx++) {
    const entry = PLATFORM_KB_ENTRIES[idx];
    const vecStr = `[${embeddings[idx].join(',')}]`;
    const id = `plat-${String(idx).padStart(2, '0')}-${operatorId}`;

    await pool.query(
      `INSERT INTO operator_kb
         (id, operator_id, owner_id, content, embedding, source_name,
          source_trust_level, confidence_score, intake_tags, is_pipeline_intake,
          privacy_cleared, content_cleared, is_system, verification_status, chunk_index, created_at)
       VALUES ($1,$2,$3,$4,$5::vector,$6,'platform',95,'{}',false,true,true,true,'verified',$7,NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, operatorId, ownerId, entry.content, vecStr, PLATFORM_KB_SOURCE, idx],
    );
  }

  console.log(`[platformKbSeed] seeded ${PLATFORM_KB_ENTRIES.length} entries for operator ${operatorId}`);
}
