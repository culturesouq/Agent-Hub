import { webSearch } from './webSearch.js';

// Source Trust Tier definitions
// Tier 1: Government / Official — .gov, who.int, worldbank.org, khalifafund.ae
// Tier 2: Established institutions — reuters.com, bbc.com, nature.com, ycombinator.com, harvard.edu
// Tier 3: Validated personal — named individual with corroborating sources
// Tier 4: Unknown single website — rejected
// Tier 5: Single source only — even Tier 1, never accepted alone

export type SourceTier = 1 | 2 | 3 | null;

export interface CuriositySource {
  url: string;
  title: string;
  snippet: string;
  tier: SourceTier;
}

export interface CuriosityResult {
  verified: boolean;          // true only if corroborated + tier 1 or 2
  tier: SourceTier;           // highest tier found across all sources
  sources: CuriositySource[]; // all sources found with their tiers
  corroborated: boolean;      // true if 2+ sources found (regardless of tier)
  bestSource: string;         // url of the highest-tier source
  confidence: number;         // 0–100 based on tiers + corroboration
}

const TIER1_DOMAINS = [
  '.gov', 'who.int', 'worldbank.org', 'khalifafund.ae',
  'un.org', 'unicef.org', 'imf.org', 'wto.org',
];

const TIER2_DOMAINS = [
  'reuters.com', 'bbc.com', 'nature.com', 'ycombinator.com',
  'harvard.edu', 'mit.edu', 'stanford.edu', 'apnews.com',
  'economist.com', 'ft.com', 'bloomberg.com', 'sciencedirect.com',
];

function classifyTier(url: string): SourceTier {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (TIER1_DOMAINS.some(d => lower.includes(d))) return 1;
  if (TIER2_DOMAINS.some(d => lower.includes(d))) return 2;
  return null; // Tier 4 — unknown, do not trust
}

function computeConfidence(
  tier: SourceTier,
  corroborated: boolean,
): number {
  if (!tier) return 0;         // no trusted source found
  if (!corroborated) return 0; // single source — never accepted

  // Two+ trusted sources found
  if (tier === 1) return 88;
  if (tier === 2) return 78;
  if (tier === 3) return 60;
  return 0;
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

  // Build a focused search query from the claim
  const query = context
    ? `${claim} ${context}`.slice(0, 200)
    : claim.slice(0, 200);

  // Fire Serper search
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

  // Classify each result by source tier
  const sources: CuriositySource[] = rawResults.map(r => ({
    url: r.url,
    title: r.title,
    snippet: r.snippet,
    tier: classifyTier(r.url),
  }));

  // Only count trusted sources (Tier 1 or 2)
  const trustedSources = sources.filter(s => s.tier === 1 || s.tier === 2);
  const corroborated = trustedSources.length >= 2;

  // Find the highest tier source
  const tier1Source = trustedSources.find(s => s.tier === 1);
  const tier2Source = trustedSources.find(s => s.tier === 2);
  const bestTierSource = tier1Source ?? tier2Source ?? null;
  const highestTier = bestTierSource?.tier ?? null;

  const confidence = computeConfidence(highestTier, corroborated);

  // Only verified if: corroborated + at least tier 2
  const verified = corroborated && highestTier !== null && confidence >= 60;

  return {
    verified,
    tier: highestTier,
    sources,
    corroborated,
    bestSource: bestTierSource?.url ?? '',
    confidence,
  };
}
