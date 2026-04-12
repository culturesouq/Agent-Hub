import { db } from '@workspace/db';
import { ragDnaTable } from '@workspace/db/schema';
import { eq, and } from 'drizzle-orm';
import { chatCompletion, CHAT_MODEL } from './openrouter.js';
import { webSearch } from './webSearch.js';

// Strip markdown code fences and extract the first JSON object/array
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1) return raw.slice(start, end + 1);
  return raw.trim();
}

const VAEL_SYSTEM = `You are Vael, the platform intelligence guardian for OpSoul. Your job is to validate, maintain, and evolve the DNA knowledge base — the shared intelligence layer that every OpSoul operator inherits.

You have two modes:

VALIDATION MODE: You review incoming DNA entries for (1) factual accuracy about the platform, (2) tone — entries must read as absorbed knowledge, never as rule-lists or commands ("I must not...", "Critical rule:"), (3) internal consistency with existing entries, and (4) appropriate confidence calibration. You return a structured verdict.

DISCOVERY MODE: You search for platform knowledge gaps, analyze what has changed or been added to the platform, and propose new entries or flag existing ones for upgrade. You think in terms of what every operator should know but currently doesn't.

Your verdicts are direct and specific. You do not soften issues or inflate strengths. If an entry has a problem, you name it exactly. If it passes, you say so without ceremony.`;

export interface ValidationResult {
  verdict: 'approve' | 'revise' | 'reject';
  confidence_suggested: number;
  status_suggested: 'current' | 'upgraded' | 'deprecated' | 'draft';
  issues: string[];
  strengths: string[];
  revised_content?: string;
  reasoning: string;
}

export interface DiscoveryProposal {
  action: 'new_entry' | 'flag_upgraded' | 'flag_deprecated';
  title: string;
  content?: string;
  affected_entry_title?: string;
  reason: string;
  suggested_source_name: string;
  suggested_confidence: number;
  suggested_tags: string[];
}

export interface DiscoveryResult {
  proposals: DiscoveryProposal[];
  summary: string;
  search_queries_used: string[];
}

async function getExistingTitlesContext(layer?: string): Promise<string> {
  const conditions = [];
  if (layer) conditions.push(eq(ragDnaTable.layer, layer));
  conditions.push(eq(ragDnaTable.isActive, true));

  const entries = await db
    .select({
      title: ragDnaTable.title,
      layer: ragDnaTable.layer,
      archetype: ragDnaTable.archetype,
      sourceName: ragDnaTable.sourceName,
      knowledgeStatus: ragDnaTable.knowledgeStatus,
    })
    .from(ragDnaTable)
    .where(and(...conditions));

  return entries
    .map(e => `[${e.layer}${e.archetype ? `/${e.archetype}` : ''}] "${e.title}" — source: ${e.sourceName ?? 'unset'}, status: ${e.knowledgeStatus}`)
    .join('\n');
}

async function getRelatedEntries(tags: string[], limit = 5): Promise<string> {
  const allEntries = await db
    .select({ title: ragDnaTable.title, content: ragDnaTable.content, tags: ragDnaTable.tags })
    .from(ragDnaTable)
    .where(eq(ragDnaTable.isActive, true));

  const related = allEntries
    .filter(e => e.tags?.some(t => tags.includes(t)))
    .slice(0, limit);

  if (related.length === 0) return 'No closely related entries found.';

  return related
    .map(e => `Title: "${e.title}"\n${e.content}`)
    .join('\n\n---\n\n');
}

export async function validateEntry(entry: {
  title: string;
  content: string;
  layer: string;
  archetype?: string;
  tags: string[];
  sourceName?: string;
  confidence?: number;
}): Promise<ValidationResult> {
  const [existingIndex, relatedEntries] = await Promise.all([
    getExistingTitlesContext(),
    getRelatedEntries(entry.tags),
  ]);

  const userPrompt = `VALIDATION REQUEST

Entry to validate:
- Title: "${entry.title}"
- Layer: ${entry.layer}${entry.archetype ? ` / Archetype: ${entry.archetype}` : ''}
- Source: ${entry.sourceName ?? 'not set'}
- Proposed confidence: ${entry.confidence ?? 'not set'}
- Tags: ${entry.tags.join(', ')}

Content:
"""
${entry.content}
"""

---

EXISTING DNA INDEX (for conflict/gap detection):
${existingIndex}

---

RELATED ENTRIES (for consistency check):
${relatedEntries}

---

Review this entry against:
1. Factual accuracy — does it accurately describe OpSoul platform capabilities and behavior?
2. Tone — does it read as absorbed knowledge? Or does it slip into rule-list / command style ("I must...", "I should NOT...", numbered procedure lists)?
3. Consistency — does it conflict with or duplicate any existing entry?
4. Confidence calibration — is the proposed confidence appropriate for the claim strength?

Return a JSON object with this exact shape:
{
  "verdict": "approve" | "revise" | "reject",
  "confidence_suggested": <number 0.0-1.0>,
  "status_suggested": "current" | "upgraded" | "deprecated" | "draft",
  "issues": ["specific issue 1", "specific issue 2"],
  "strengths": ["specific strength 1"],
  "revised_content": "<only include if verdict is 'revise' — provide the corrected content>",
  "reasoning": "<2-3 sentence summary of your verdict>"
}

Return only valid JSON. No preamble.`;

  const result = await chatCompletion(
    [
      { role: 'system', content: VAEL_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    { model: CHAT_MODEL },
  );

  try {
    const parsed = JSON.parse(extractJson(result.content));
    return parsed as ValidationResult;
  } catch {
    return {
      verdict: 'revise',
      confidence_suggested: entry.confidence ?? 0.8,
      status_suggested: 'draft',
      issues: ['Vael returned unparseable output — manual review required'],
      strengths: [],
      reasoning: result.content.slice(0, 300),
    };
  }
}

// ── Source-guided extraction ──────────────────────────────────────────────────
// Vael reads raw content fetched from a curated source and extracts
// structured DNA candidates for her validation pipeline.

const SOURCE_EXTRACT_SYSTEM = `You are Vael, OpSoul's platform intelligence guardian.
You have been given raw content from a curated public knowledge source.
Your task: extract 3 to 8 high-quality knowledge entries that belong in the OpSoul collective DNA corpus.

Each entry must be:
- A standalone, reusable piece of knowledge — factual, clear, absorbed-voice (not rule-list style)
- Relevant to AI operator behavior, communication, reasoning, or a specific domain
- Under 350 characters for content
- Given a concise descriptive title

Return only valid JSON — an array of objects:
[
  {
    "title": "<concise title>",
    "content": "<absorbed knowledge, max 350 chars>",
    "suggested_tags": ["tag1", "tag2"],
    "suggested_confidence": <0.6-1.0>
  }
]

If the content has nothing worth extracting, return an empty array: []`;

export interface SourceCandidate {
  title: string;
  content: string;
  suggested_tags: string[];
  suggested_confidence: number;
}

export async function extractEntriesFromSource(
  rawContent: string,
  sourceTitle: string,
): Promise<SourceCandidate[]> {
  const prompt = `Source: "${sourceTitle}"\n\nContent:\n${rawContent.slice(0, 3000)}`;

  const result = await chatCompletion(
    [
      { role: 'system', content: SOURCE_EXTRACT_SYSTEM },
      { role: 'user', content: prompt },
    ],
    { model: CHAT_MODEL },
  );

  try {
    const raw = extractJson(result.content);
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    const parsed = JSON.parse(start !== -1 ? raw.slice(start, end + 1) : raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function runDiscoverySweep(focus?: string): Promise<DiscoveryResult> {
  const existingIndex = await getExistingTitlesContext();

  const searchQueries = focus
    ? [
        `AI operator ${focus} best practices 2025`,
        `how AI assistants handle ${focus} user requests`,
      ]
    : [
        'AI assistant operator best practices handling user requests 2025',
        'how conversational AI agents handle ambiguous or sensitive requests',
        'AI operator memory context management patterns',
      ];

  const searchResults: string[] = [];
  for (const query of searchQueries) {
    try {
      const results = await webSearch(query);
      if (results.length > 0) {
        searchResults.push(
          `Query: "${query}"\n` +
          results.map(r => `- ${r.title}: ${r.snippet ?? r.url}`).join('\n'),
        );
      }
    } catch {
      searchResults.push(`Query: "${query}" — search failed`);
    }
  }

  const userPrompt = `DISCOVERY SWEEP REQUEST
${focus ? `Focus area: ${focus}` : 'Full platform sweep'}

CURRENT DNA INDEX:
${existingIndex}

---

WEB SEARCH RESULTS:
${searchResults.join('\n\n') || 'No search results available.'}

---

Analyze the current DNA index and search results. Identify:
1. Knowledge gaps — what should every operator know that isn't covered?
2. Upgraded entries — existing entries that may now be incomplete due to platform changes
3. Deprecated entries — existing entries that may no longer be accurate

For each finding, propose an action. Return JSON with this shape:
{
  "proposals": [
    {
      "action": "new_entry" | "flag_upgraded" | "flag_deprecated",
      "title": "<proposed title or affected title>",
      "content": "<entry content — only for new_entry — max 400 chars, concise>",
      "affected_entry_title": "<existing title — only for flag_upgraded / flag_deprecated>",
      "reason": "<why this action is needed>",
      "suggested_source_name": "<source label>",
      "suggested_confidence": <0.0-1.0>,
      "suggested_tags": ["tag1", "tag2"]
    }
  ],
  "summary": "<2-3 sentence sweep summary>",
  "search_queries_used": ["query1", "query2"]
}

Return only valid JSON. No preamble.`;

  const result = await chatCompletion(
    [
      { role: 'system', content: VAEL_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    { model: CHAT_MODEL },
  );

  try {
    const parsed = JSON.parse(extractJson(result.content));
    parsed.search_queries_used = searchQueries;
    return parsed as DiscoveryResult;
  } catch {
    return {
      proposals: [],
      summary: `Parse failed — raw: ${result.content.slice(0, 200)}`,
      search_queries_used: searchQueries,
    };
  }
}
