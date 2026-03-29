export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

function isValidHttpUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function braveWebSearch(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    const params = new URLSearchParams({
      q: query,
      count: "5",
      safesearch: "moderate",
    });

    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
      }
    );

    if (!response.ok) {
      console.error(`Brave Search API error: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as {
      web?: {
        results?: { title: string; description?: string; url: string }[];
      };
    };

    const results = data?.web?.results ?? [];
    return results
      .slice(0, 5)
      .map((r) => ({
        title: r.title ?? "",
        snippet: r.description ?? "",
        url: r.url ?? "",
      }))
      .filter((r) => isValidHttpUrl(r.url));
  } catch (err) {
    console.error("Brave Search error:", err);
    return [];
  }
}

export function formatSearchResultsForPrompt(
  query: string,
  results: SearchResult[]
): string {
  if (results.length === 0) {
    return `[Web search for "${query}" returned no results]`;
  }
  let block = `[Web search results for: "${query}"]\n`;
  for (const r of results) {
    block += `\nTitle: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}\n`;
  }
  return block;
}
