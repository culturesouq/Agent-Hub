export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

export async function webSearch(query: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: 5 }),
    });

    if (!res.ok) return [];

    const data = await res.json() as { organic?: { title?: string; snippet?: string; link?: string }[] };
    const results = data.organic ?? [];

    return results.slice(0, 5).map((r) => ({
      title: r.title ?? '',
      snippet: r.snippet ?? '',
      url: r.link ?? '',
    }));
  } catch {
    return [];
  }
}
