import { webSearch } from './webSearch.js';
import { chatCompletion } from './openrouter.js';

// Source Trust Tiers — canonical 5-tier ladder (Claim 32 / D-3).
// Tier 1 — Owner-direct statement: KB entries authored by the owner, SoT log.
//          Never produced by this curiosity engine (web search never hits
//          owner-authored content) — annotated at KB retrieval time.
// Tier 2 — Owner-curated source: KB entries the owner imported and reviewed.
//          Likewise KB-retrieval-only.
// Tier 3 — Verified external authority: wikipedia.org, *.gov / *.edu / *.int
//          / regulator domains, peer-reviewed academic journals, official
//          international institutions. Highest trust ANY web result can earn.
// Tier 4 — General external with dual-corroboration: major news, established
//          professional org, verified research outfit — trusted only when
//          corroborated by ≥1 other Tier 3-4 source.
// Tier 5 — LLM-generated synthesis or unverified single source. Lowest trust
//          tier; retrieval payload always flagged so callers can refuse the
//          content or surface the low-trust mark to the operator.
//
// The curiosity engine produces tiers 3-5 (web sources). Tiers 1-2 are KB
// concerns annotated by `vectorSearch` at retrieval time.

export type SourceTier = 1 | 2 | 3 | 4 | 5 | null;

/** Domain classifier — used as a fast-path verdict before the LLM evaluator
 *  reads each web result. Matches host-suffix only (case-insensitive). The
 *  LLM is still consulted for content corroboration; this helper only fixes
 *  the tier ceiling for unambiguous authority domains.
 */
const TIER_3_DOMAIN_SUFFIXES = [
  '.gov', '.gov.uk', '.gov.au', '.gov.ae', '.gc.ca',
  '.edu', '.ac.uk', '.ac.ae', '.edu.au',
  '.int', // international institutions (UN, WHO etc.)
  '.who.int', '.un.org', '.worldbank.org', '.imf.org', '.oecd.org',
  'wikipedia.org',
];

export function classifyDomainTier(url: string): SourceTier {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const suffix of TIER_3_DOMAIN_SUFFIXES) {
      if (host === suffix.replace(/^\./, '') || host.endsWith(suffix)) return 3;
    }
  } catch {
    // malformed URL — leave tier unset
  }
  return null;
}

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
  /**
   * Tier 5 explicit flag — set true when the synthesised answer is the
   * lowest-trust tier of the 5-tier ladder (Claim 32). Callers (KB writer,
   * GROW evaluator, drift cron) MUST decide whether to surface, refuse, or
   * mark this content. Never silently treated as a trusted source.
   */
  lowestTrustTier: boolean;
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
  // Provide the LLM with the domain-classifier pre-verdict so it doesn't
  // contradict obvious-authority calls. Anything the classifier marks as
  // Tier 3 (gov / edu / wikipedia / int / regulator) the LLM may keep at
  // 3 or downgrade to 4; never upgrade past 3 (Tiers 1 + 2 are KB-only).
  const sourcesWithDomain = rawSources.slice(0, 8).map((s, i) => {
    const domainTier = classifyDomainTier(s.url);
    return `${i + 1}. ${s.title}\n   URL: ${s.url}\n   Domain classifier: ${domainTier ? `Tier ${domainTier}` : 'unmarked'}\n   Content: ${s.snippet}`;
  }).join('\n\n');

  const prompt = `You are evaluating web search results for factual reliability. Your job is to determine whether the sources found are credible and whether the information is corroborated.

Query: "${query}"

Sources found:
${sourcesWithDomain}

Classify each source by tier on the canonical 5-tier source-trust ladder:
- Tier 1 (Owner-direct) and Tier 2 (Owner-curated): NEVER produced by web search. These belong to operator KB only. Do not assign 1 or 2 to any web source.
- Tier 3 — Verified external authority: any government body, official regulatory authority, official international institution, peer-reviewed academic journal, wikipedia.org. Use the Domain classifier hint when set — if it says Tier 3, the source is Tier 3 unless its content is plainly off-topic or contradicted.
- Tier 4 — General external with corroboration: major established news outlet, well-known research or professional organization, or any other source that is corroborated by at least one Tier 3-4 source for the same claim.
- Tier 5 — LLM-synthesis or unverified single source: unknown blog, anonymous author, unverifiable site, or any source that is alone with no corroboration. Lowest trust — caller will flag the retrieval payload accordingly.

Rules:
- A single Tier 3 or 4 source alone is NOT sufficient for trusted=true — corroboration requires ≥2 trusted sources (Tier 3 or 4).
- "Trusted" means at least 2 sources from Tier 3 or Tier 4.
- Tier 5 is never trusted on its own.
- If fewer than 2 trusted sources found → trusted: false, tier: 5 or null.

Return ONLY valid JSON, no explanation:
{
  "trusted": boolean,
  "tier": 3 or 4 or 5 or null,
  "confidence": integer 0-100,
  "corroborated": boolean,
  "trustedSources": [{ "url": "...", "tier": 3 or 4 or 5 }],
  "summary": "one sentence summary of what the trusted sources say, or empty string if not trusted"
}`;

  try {
    const result = await chatCompletion(
      [{ role: 'user', content: prompt }],
      'moonshotai/kimi-k2.5',
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
      lowestTrustTier: false,
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
      lowestTrustTier: false,
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
  const lowestTrustTier = evaluation.tier === 5 || (!verified && evaluation.tier !== 3 && evaluation.tier !== 4);

  return {
    verified,
    tier: evaluation.tier,
    sources,
    corroborated: evaluation.corroborated,
    bestSource: bestTrusted?.url ?? '',
    confidence: evaluation.confidence,
    lowestTrustTier,
  };
}
