const MAX_CHARS = 3000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function scrapeUrl(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpSoulBot/1.0)' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const html = await response.text();
    const text = stripHtml(html);
    return text.slice(0, MAX_CHARS);
  } finally {
    clearTimeout(timeout);
  }
}
