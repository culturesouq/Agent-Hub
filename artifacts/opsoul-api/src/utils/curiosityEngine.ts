import { webSearch } from './webSearch.js';
import { chatCompletion } from './openrouter.js';

// Source Trust Tiers — evaluated by LLM, not hardcoded domains
// Tier 1: Government body / official regulatory authority / international institution
// Tier 2: Established news outlet / academic institution / verified research organization
// Tier 3: Named individual with verifiable track record + corroborating mentions
// Tier 4: Unknown / unverifiable / anonymous — rejected
// Tier 5: Single source only — even Tier 1/2, rejected without corroboration

export type SourceTier = 1 | 2 | 3 | null;

export interface CuriositySource {
  url: string;
  title: string;
  snippet: string;
  tier: SourceTier;
}

export interface CuriosityResult {
  verified: boolean;
  tier: SourceTier;
  sources: CuriositySource[];
  corroborated: boolean;
  bestSource: string;
  confidence: number;
}

interface LLMEvaluation {
  trusted: boolean;
  tier: SourceTier;
  confidence: number;
  corroborated: boolean;
  trustedSources: Array<{ url: string; tier: SourceTier }>;
  summary: string;
}

async function evaluateSources(
  query: string,
  rawSources: Array<{ url: string; title: string; snippet: string }>,
): Promise<LLMEvaluation> {
  const prompt = `You are evaluating web search results for factual reliability. Your job is to determine whether the sources found are credible and whether the information is corroborated.

Query: "${query}"

Sources found:
${rawSources.slice(0, 8).map((s, i) => `${i + 1}. ${s.title}\n   URL: ${s.url}\n   Content: ${s.snippet}`).join('\n\n')}

Classify each source by tier — apply globally, not regionally:
- Tier 1: Any government body, official regulatory authority, or official international institution (applies worldwide — UAE, US, EU, UK, any country)
- Tier 2: Major established news outlet, peer-reviewed academic institution, well-known research or professional organization (applies globally)
- Tier 3: Named individual with a verifiable track record AND multiple corroborating mentions elsewhere
- Tier 4: Unknown blog, unverifiable site, anonymous author — do not trust

Rules:
- A single Tier 1 or Tier 2 source alone is NOT sufficient — corroboration requires 2+ trusted sources
- "Trusted" means Tier 1 or Tier 2 only
- Tier 3 requires explicit corroboration from multiple references before being considered
- If fewer than 2 trusted sources found → trusted: false

Return ONLY valid JSON, no explanation:
{
  "trusted": boolean,
  "tier": 1 or 2 or 3 or null,
  "confidence": integer 0-100,
  "corroborated": boolean,
  "trustedSources": [{ "url": "...", "tier": 1 or 2 or 3 }],
  "summary": "one sentence summary of what the trusted sources say, or empty string if not trusted"
}`;

  try {
    const result = await chatCompletion(
      [{ role: 'user', content: prompt }],
      'anthropic/claude-haiku-4-5',
    );

    const text = result.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallbackEval();

    const parsed: LLMEvaluation = JSON.parse(jsonMatch[0]);

    if (
      typeof parsed.trusted !== 'boolean' ||
      typeof parsed.confidence !== 'number' ||
      typeof parsed.corroborated !== 'boolean'
    ) {
      return fallbackEval();
    }

    return parsed;
  } catch {
    return fallbackEval();
  }
}

function fallbackEval(): LLMEvaluation {
  return {
    trusted: false,
    tier: null,
    confidence: 0,
    corroborated: false,
    trustedSources: [],
    summary: '',
  };
}

export function computeCoverageScore(kbHits: { confidenceScore?: number }[]): number {
  if (!kbHits.length) return 0;
  const sum = kbHits.reduce((acc, hit) => acc + (hit.confidenceScore ?? 0), 0);
  return (sum / kbHits.length) / 100;
}

export async function resolveKbGap(query: string, operatorId: string): Promise<string | null> {
  try {
    const result = await curiositySearch(query, operatorId);
    const tieredSources = result.sources.filter(s => s.tier !== null);
    if (!tieredSources.length) return null;
    return tieredSources
      .slice(0, 3)
      .map(s => `${s.title}: ${s.snippet}`)
      .join('\n');
  } catch {
    return null;
  }
}

export async function curiositySearch(
  claim: string,
  operatorId: string,
  context?: string,
): Promise<CuriosityResult> {
  if (!process.env.SERPER_API_KEY) {
    console.warn('[curiosityEngine] SERPER_API_KEY not set — skipping web search');
    return {
      verified: false,
      tier: null,
      sources: [],
      corroborated: false,
      bestSource: '',
      confidence: 0,
    };
  }

  const query = context
    ? `${claim} ${context}`.slice(0, 200)
    : claim.slice(0, 200);

  const rawResults = await webSearch(query);

  if (!rawResults || rawResults.length === 0) {
    return {
      verified: false,
      tier: null,
      sources: [],
      corroborated: false,
      bestSource: '',
      confidence: 0,
    };
  }

  const evaluation = await evaluateSources(query, rawResults);

  const sources: CuriositySource[] = rawResults.map(r => {
    const trusted = evaluation.trustedSources?.find(ts => ts.url === r.url);
    return {
      url: r.url,
      title: r.title,
      snippet: r.snippet,
      tier: trusted?.tier ?? null,
    };
  });

  const bestTrusted = evaluation.trustedSources?.[0];
  const verified = evaluation.trusted && evaluation.corroborated && evaluation.confidence >= 60;

  return {
    verified,
    tier: evaluation.tier,
    sources,
    corroborated: evaluation.corroborated,
    bestSource: bestTrusted?.url ?? '',
    confidence: evaluation.confidence,
  };
}
