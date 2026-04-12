import { db } from '@workspace/db-v2';
import { ragDnaTable } from '@workspace/db-v2';
import { eq, and } from 'drizzle-orm';
import { chatCompletion, CHAT_MODEL } from './openrouter.js';
import { webSearch } from './webSearch.js';

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
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
  const conditions: ReturnType<typeof eq>[] = [];
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
    .where(conditions.length === 1 ? conditions[0] : and(...conditions));

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
- Source: ${entry.sourceName ?? 'unspecified'}
- Current confidence: ${entry.confidence ?? 'unset'}
- Tags: ${entry.tags.join(', ') || 'none'}

Content:
"""
${entry.content}
"""

Existing DNA index (for consistency check):
${existingIndex.slice(0, 3000) || 'Empty.'}

Related entries (if any):
${relatedEntries.slice(0, 2000)}

---

Return your verdict as JSON only:
{
  "verdict": "approve" | "revise" | "reject",
  "confidence_suggested": <0.0-1.0>,
  "status_suggested": "current" | "upgraded" | "deprecated" | "draft",
  "issues": ["<specific issue>"],
  "strengths": ["<specific strength>"],
  "revised_content": "<only if verdict is revise — improved version of the content>",
  "reasoning": "<2-3 sentences explaining your decision>"
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
    return JSON.parse(extractJson(result.content)) as ValidationResult;
  } catch {
    return {
      verdict: 'reject',
      confidence_suggested: 0,
      status_suggested: 'deprecated',
      issues: ['Parse failed'],
      strengths: [],
      reasoning: `Parse failed — raw: ${result.content.slice(0, 200)}`,
    };
  }
}

export async function runDiscoverySweep(): Promise<DiscoveryResult> {
  const searchQueries = [
    'OpSoul AI operator platform features 2025',
    'AI operator persona soul identity evolution',
    'private AI operator deployment best practices',
  ];

  const searchResults: string[] = [];
  for (const query of searchQueries) {
    const hits = await webSearch(query);
    if (hits.length > 0) {
      searchResults.push(
        `Query: "${query}"\n` +
        hits.map(h => `- ${h.title}: ${h.snippet}`).join('\n')
      );
    }
  }

  const existingIndex = await getExistingTitlesContext();

  const userPrompt = `DISCOVERY SWEEP

Existing DNA index:
${existingIndex.slice(0, 4000) || 'Empty.'}

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
