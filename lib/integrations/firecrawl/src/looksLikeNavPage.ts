/**
 * Post-fetch filter for crawl results — reject pages that are clearly nav /
 * category / login / utility surfaces with no real content.
 *
 * Context (from [[srag]] $25 wasted-crawl incident):
 *   The previous Vael crawl ingested nav pages (login, cart, terms, /tag/,
 *   /category/, search results) into the SRAG pipeline, where they consumed
 *   embedding + verification cycles but carried zero usable content. The
 *   defensive `excludePaths` defaults in the crawl handler block the most
 *   common slugs at the Firecrawl level (they're never fetched); this helper
 *   is the second line of defence for nav-like pages that slipped past
 *   path matching (e.g. /products vs /products/widget-x).
 *
 * Discipline: heuristic-only. Returns true only when the page looks
 * structurally nav-like (short + heavy link ratio + nav-title). False
 * negatives are preferred to false positives.
 */
export function looksLikeNavPage(page: {
  markdown?: string | null;
  metadata?: { title?: string | null } | null;
}): boolean {
  const md = (page.markdown ?? '').trim();

  // Too short to carry content
  if (md.length < 300) return true;

  // Link-heavy = nav. Counts markdown link starts and compares against length.
  const links = md.match(/\]\(https?:/g)?.length ?? 0;
  const linkRatio = (links / Math.max(md.length, 1)) * 1000;
  if (linkRatio > 8) return true;

  // Known nav-page titles
  const title = (page.metadata?.title ?? '').toString().toLowerCase().trim();
  if (
    title === '' ||
    /^(login|log in|sign in|sign up|register|cart|checkout|search( results)?|tags?|categor(y|ies)|404|page not found|access denied|forbidden|privacy( policy)?|terms( of service)?|cookie( policy)?)$/i.test(title)
  ) {
    return true;
  }

  return false;
}
