import { chatCompletion } from './openrouter.js';
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

export async function detectWebSearchIntent(
  userMessage: string,
  operatorResponse: string,
): Promise<string | null> {
  const combined = operatorResponse
    ? `User said: ${userMessage}\nOperator response so far: ${operatorResponse}`
    : `User said: ${userMessage}`;

  const result = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You detect whether a message requires searching the web for live, current, or external information that an AI would not know from training data alone. ' +
          'If yes — return ONLY the search query (concise, 3–8 words, no punctuation). ' +
          'If no — return exactly: NO',
      },
      { role: 'user', content: combined },
    ],
    'anthropic/claude-haiku-4-5',
  );

  const reply = result.content.trim();
  if (!reply || /^\s*no[.!?,;\s]*$/i.test(reply) || reply.toLowerCase().startsWith('no ')) return null;
  return reply;
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
