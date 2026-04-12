import type { RagSourceType } from '@workspace/db';

export interface FetchedChunk {
  title: string;
  rawContent: string;
  sourceUrl: string;
}

// ── HuggingFace Dataset API ───────────────────────────────────────────────────
// Uses the public Datasets Server — no token needed for public datasets.
// Supports datasets where rows have text-like fields.

async function fetchHuggingFace(url: string): Promise<FetchedChunk[]> {
  // url format: https://huggingface.co/datasets/<owner>/<dataset>
  // or just: <owner>/<dataset>
  const match = url.match(/(?:datasets\/)?([^/]+\/[^/\s?#]+)/);
  if (!match) throw new Error(`Invalid HuggingFace URL: ${url}`);
  const dataset = match[1];

  // Try to get dataset info first to find text column
  const infoRes = await fetch(
    `https://datasets-server.huggingface.co/info?dataset=${encodeURIComponent(dataset)}`,
    { headers: { Accept: 'application/json' } },
  );

  let textField = 'text';
  if (infoRes.ok) {
    const info = await infoRes.json() as any;
    const features = info?.dataset_info?.features ?? info?.dataset_info?.default?.features ?? {};
    const fields = Object.keys(features);
    textField = fields.find(f => ['text', 'content', 'instruction', 'output', 'description', 'body'].includes(f)) ?? fields[0] ?? 'text';
  }

  const rowsRes = await fetch(
    `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(dataset)}&config=default&split=train&offset=0&limit=50`,
    { headers: { Accept: 'application/json' } },
  );

  if (!rowsRes.ok) {
    throw new Error(`HuggingFace API error ${rowsRes.status}: ${await rowsRes.text().then(t => t.slice(0, 200))}`);
  }

  const data = await rowsRes.json() as { rows?: { row: Record<string, any> }[] };
  const rows = data.rows ?? [];

  return rows
    .map((r, i) => {
      const row = r.row;
      const fields = Object.keys(row);
      const titleField = fields.find(f => ['title', 'name', 'subject', 'topic'].includes(f));
      const title = titleField ? String(row[titleField]).slice(0, 120) : `${dataset} entry ${i + 1}`;
      const content = String(row[textField] ?? Object.values(row).filter(v => typeof v === 'string').join('\n')).slice(0, 800);
      return { title, rawContent: content, sourceUrl: url };
    })
    .filter(c => c.rawContent.trim().length > 50);
}

// ── GitHub Raw File ───────────────────────────────────────────────────────────
// Fetches a single file from GitHub (markdown, JSON, txt, etc.)
// and splits it into chunks based on headers or paragraph breaks.

async function fetchGitHubFile(url: string): Promise<FetchedChunk[]> {
  // Accept both github.com and raw.githubusercontent.com URLs
  let rawUrl = url;
  if (url.includes('github.com') && !url.includes('raw.githubusercontent.com')) {
    rawUrl = url
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');
  }

  const res = await fetch(rawUrl, { headers: { Accept: 'text/plain' } });
  if (!res.ok) throw new Error(`GitHub fetch error ${res.status}`);
  const text = await res.text();

  return splitIntoChunks(text, url);
}

// ── GitHub Repo (README + top-level markdown files) ──────────────────────────

async function fetchGitHubRepo(url: string): Promise<FetchedChunk[]> {
  const match = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
  if (!match) throw new Error(`Invalid GitHub repo URL: ${url}`);
  const [, owner, repo] = match;

  const contentsRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents`,
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'OpSoul-Vael/1.0' } },
  );
  if (!contentsRes.ok) throw new Error(`GitHub API error ${contentsRes.status}`);

  const files = await contentsRes.json() as { name: string; download_url: string; type: string }[];
  const mdFiles = files
    .filter(f => f.type === 'file' && /\.(md|txt)$/i.test(f.name))
    .slice(0, 5);

  const chunks: FetchedChunk[] = [];
  for (const file of mdFiles) {
    try {
      const res = await fetch(file.download_url);
      if (!res.ok) continue;
      const text = await res.text();
      chunks.push(...splitIntoChunks(text, url));
    } catch {
      // skip individual file failures
    }
  }
  return chunks;
}

// ── Raw URL ───────────────────────────────────────────────────────────────────

async function fetchRawUrl(url: string): Promise<FetchedChunk[]> {
  const res = await fetch(url, { headers: { 'User-Agent': 'OpSoul-Vael/1.0' } });
  if (!res.ok) throw new Error(`Fetch error ${res.status}`);
  const text = await res.text();
  return splitIntoChunks(text, url);
}

// ── Text splitter ─────────────────────────────────────────────────────────────
// Split markdown by level-2 headers, or plain text by double newlines.

function splitIntoChunks(text: string, sourceUrl: string): FetchedChunk[] {
  const headerSections = text.split(/\n(?=##\s)/);

  if (headerSections.length > 1) {
    return headerSections
      .map(section => {
        const lines = section.trim().split('\n');
        const title = lines[0].replace(/^#+\s*/, '').slice(0, 120);
        const rawContent = lines.slice(1).join('\n').trim().slice(0, 800);
        return { title, rawContent, sourceUrl };
      })
      .filter(c => c.rawContent.length > 50);
  }

  // Fall back to paragraph chunking
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 80);
  return paragraphs.slice(0, 20).map((p, i) => ({
    title: p.slice(0, 80).replace(/\n/g, ' '),
    rawContent: p.slice(0, 800),
    sourceUrl,
  }));
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export async function fetchSource(
  sourceType: RagSourceType,
  url: string,
): Promise<FetchedChunk[]> {
  switch (sourceType) {
    case 'huggingface':   return fetchHuggingFace(url);
    case 'github_file':   return fetchGitHubFile(url);
    case 'github_repo':   return fetchGitHubRepo(url);
    case 'raw_url':       return fetchRawUrl(url);
    default:              throw new Error(`Unknown source type: ${sourceType}`);
  }
}
