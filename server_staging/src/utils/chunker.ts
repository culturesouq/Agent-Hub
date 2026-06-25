const CHUNK_SIZE = 500;
const OVERLAP = 50;
const MIN_CHUNK = 40;

export interface TextChunk {
  content: string;
  chunkIndex: number;
}

export function chunkText(text: string): TextChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.length <= CHUNK_SIZE) {
    return [{ content: trimmed, chunkIndex: 0 }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < trimmed.length) {
    const end = Math.min(start + CHUNK_SIZE, trimmed.length);
    const chunk = trimmed.slice(start, end).trim();

    if (chunk.length >= MIN_CHUNK) {
      chunks.push({ content: chunk, chunkIndex: index++ });
    }

    if (end >= trimmed.length) break;
    start = end - OVERLAP;
  }

  return chunks;
}
