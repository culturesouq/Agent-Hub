import { chatCompletion } from './openrouter.js';

export function isWebSearchAvailable(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

export interface WebSearchResult {
  success: boolean;
  output: string;
}

const SEARCH_MODEL = 'perplexity/llama-3.1-sonar-small-128k-online';

export async function executeWebSearch(query: string): Promise<WebSearchResult> {
  if (!query?.trim()) return { success: false, output: 'Empty search query' };

  try {
    const result = await chatCompletion(
      [
        {
          role: 'system',
          content: 'You are a research assistant. Answer the query with factual, up-to-date information. Cite sources when possible. Be concise but thorough. Focus only on the question asked.',
        },
        { role: 'user', content: query },
      ],
      { model: SEARCH_MODEL, maxTokens: 1500 },
    );

    if (!result.content) return { success: false, output: 'No search results returned' };
    return { success: true, output: result.content };
  } catch (err) {
    console.error('[web-search] Failed:', (err as Error).message);
    return { success: false, output: `Search failed: ${(err as Error).message}` };
  }
}
