import { webSearch } from './webSearch.js';
import { isFirecrawlAvailable as fcAvailable } from '@workspace/integrations-firecrawl';

export function isWebSearchAvailable(): boolean {
  return !!process.env.SERPER_API_KEY;
}

/**
 * Firecrawl availability gate (Wave 4). Mirrors isWebSearchAvailable() so
 * the MCP server + chat.ts can decide whether to surface the firecrawl_*
 * tools in this request's ToolContext.
 */
export function isFirecrawlAvailable(): boolean {
  return fcAvailable();
}

export interface WebSearchCapabilityResult {
  type:    'web_search';
  query:   string;
  output:  string;
  success: boolean;
}


export async function executeWebSearch(query: string): Promise<WebSearchCapabilityResult> {
  const results = await webSearch(query);

  if (!results.length) {
    return {
      type:    'web_search',
      query,
      output:  'No results found for this query.',
      success: false,
    };
  }

  const formatted = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`)
    .join('\n\n');

  return {
    type:    'web_search',
    query,
    output:  formatted,
    success: true,
  };
}
