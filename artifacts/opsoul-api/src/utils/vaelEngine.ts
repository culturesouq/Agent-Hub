import { db } from '@workspace/db';
import { ragDnaTable } from '@workspace/db/schema';
import { eq, and } from 'drizzle-orm';
import { chatCompletion, CHAT_MODEL } from './openrouter.js';

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const objStart = raw.indexOf('{');
  const arrStart = raw.indexOf('[');
  const isArr = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
  const start = isArr ? arrStart : objStart;
  const end   = isArr ? raw.lastIndexOf(']') : raw.lastIndexOf('}');
  if (start !== -1 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

// ── Vael's core identity and judgment ────────────────────────────────────────

const VAEL_SYSTEM = `You are Vael, knowledge guardian for OpSoul. You curate the DNA library — a shared corpus that all OpSoul operators draw from at runtime.

The library has five layers:
L0 · AI Builder — API calls, HTTP patterns, web scraping, data formats (JSON/CSV/XML/YAML), LLM control and prompting, tool chaining, reading code and error outputs. Technical craft knowledge.
L1 · Foundation — How operators reason, communicate, and handle hard situations. Ethics, identity stability, universal principles that apply across all archetypes.
L2 · Behavioral — How specific archetypes think differently. Builder vs Advisor vs Analyst patterns. Tone, framing, judgment by archetype.
L3 · Domain — Real-world knowledge: UAE business environment, Arabic communication norms, startup ecosystems, legal and regulatory context, industry-specific facts.
L4 · Platform — OpSoul mechanics: GROW stages and lock levels, operator lifecycle, drift detection, archetype soul signatures, deployment slots, core values.

Your job is quality control. You read what was submitted and decide if it belongs.

Approve: specific, factual, useful knowledge an active operator would actually draw on. Tone should feel absorbed and internalized — not a rule-list, not commands.
Revise: content that is accurate but poorly worded, over-procedural, or assigned the wrong layer. Fix it rather than discard it.
Reject: vague platitudes, advertising, personal data, things that serve no operator, clear duplicates of existing entries.

Be direct. Name exactly what is wrong, or pass it cleanly.`;

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  verdict: 'approve' | 'revise' | 'reject';
  confidence_suggested: number;
  status_suggested: 'current' | 'upgraded' | 'deprecated' | 'draft';
  issues: string[];
  strengths: string[];
  revised_content?: string;
  reasoning: string;
}

async function getExistingIndex(): Promise<string> {
  const entries = await db
    .select({
      title: ragDnaTable.title,
      layer: ragDnaTable.layer,
      sourceName: ragDnaTable.sourceName,
      knowledgeStatus: ragDnaTable.knowledgeStatus,
    })
    .from(ragDnaTable)
    .where(eq(ragDnaTable.isActive, true));

  if (entries.length === 0) return 'DNA library is currently empty.';
  return entries
    .map(e => `[${e.layer}] "${e.title}" — ${e.sourceName ?? 'no source'}, ${e.knowledgeStatus}`)
    .join('\n');
}

async function getRelatedEntries(tags: string[]): Promise<string> {
  if (tags.length === 0) return 'No tags provided.';
  const all = await db
    .select({ title: ragDnaTable.title, content: ragDnaTable.content, tags: ragDnaTable.tags })
    .from(ragDnaTable)
    .where(and(eq(ragDnaTable.isActive, true)));

  const related = all.filter(e => e.tags?.some(t => tags.includes(t))).slice(0, 4);
  if (related.length === 0) return 'No related entries found.';
  return related.map(e => `"${e.title}": ${e.content}`).join('\n\n');
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
  const [index, related] = await Promise.all([
    getExistingIndex(),
    getRelatedEntries(entry.tags),
  ]);

  const prompt = `VALIDATION REQUEST

Entry:
- Title: "${entry.title}"
- Layer: ${entry.layer}${entry.archetype ? ` / Archetype: ${entry.archetype}` : ''}
- Source: ${entry.sourceName ?? 'not set'}
- Tags: ${entry.tags.join(', ')}

Content:
"""
${entry.content}
"""

EXISTING DNA INDEX:
${index}

RELATED ENTRIES:
${related}

Review against:
1. Layer fit — does the content match its claimed layer? (L0=builder skills, L1=reasoning/ethics, L2=archetype behavior, L3=domain knowledge, L4=platform mechanics)
2. Operator utility — would an active operator actually use this?
3. Tone — absorbed knowledge, not rule-lists or commands
4. Accuracy — specific and factually sound
5. Consistency — not a duplicate or direct conflict with existing entries

Return JSON only:
{
  "verdict": "approve" | "revise" | "reject",
  "confidence_suggested": <0.0-1.0>,
  "status_suggested": "current" | "upgraded" | "deprecated" | "draft",
  "issues": ["issue 1"],
  "strengths": ["strength 1"],
  "revised_content": "<corrected content — only if verdict is revise>",
  "reasoning": "<2 sentences max>"
}`;

  const result = await chatCompletion(
    [{ role: 'system', content: VAEL_SYSTEM }, { role: 'user', content: prompt }],
    { model: CHAT_MODEL },
  );

  try {
    return JSON.parse(extractJson(result.content)) as ValidationResult;
  } catch {
    return {
      verdict: 'revise',
      confidence_suggested: entry.confidence ?? 0.75,
      status_suggested: 'draft',
      issues: ['Vael returned unparseable output — needs manual review'],
      strengths: [],
      reasoning: result.content.slice(0, 200),
    };
  }
}

// ── Extraction from raw content ───────────────────────────────────────────────
// Vael reads raw text and extracts discrete knowledge candidates.
// Used by both inbox processing and source-guided scans.

const EXTRACT_SYSTEM = `You are Vael, reading content that was submitted to the OpSoul DNA library.
Extract discrete, self-contained knowledge entries an operator would actually use at runtime.

Each entry must:
- Stand alone — make sense without the surrounding document
- Be specific and factual — no vague generalizations
- Read as absorbed knowledge — not a procedure list or command
- Fit one of the five layers: L0 (builder/technical), L1 (reasoning/ethics), L2 (archetype behavior), L3 (domain), L4 (platform)

Return JSON array only:
[
  {
    "title": "<concise descriptive title>",
    "content": "<the knowledge, max 500 chars, absorbed tone>",
    "suggested_layer": "l0_ai_builder" | "l1_foundation" | "l2_behavioral" | "l3_domain" | "l4_platform",
    "suggested_tags": ["tag1", "tag2"],
    "suggested_confidence": <0.6-1.0>
  }
]

Extract 3 to 10 entries. If the content has nothing worth keeping, return [].`;

export interface SourceCandidate {
  title: string;
  content: string;
  suggested_layer?: string;
  suggested_tags: string[];
  suggested_confidence: number;
}

export async function extractEntriesFromSource(
  rawContent: string,
  sourceTitle: string,
): Promise<SourceCandidate[]> {
  const prompt = `Source: "${sourceTitle}"\n\nContent:\n${rawContent.slice(0, 8000)}`;

  const result = await chatCompletion(
    [{ role: 'system', content: EXTRACT_SYSTEM }, { role: 'user', content: prompt }],
    { model: CHAT_MODEL },
  );

  try {
    const parsed = JSON.parse(extractJson(result.content));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
