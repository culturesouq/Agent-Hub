import { webSearch } from './webSearch.js';

export function isWebSearchAvailable(): boolean {
  return !!process.env.SERPER_API_KEY;
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
