import OpenAI from 'openai';

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const embedCache = new Map<string, number[]>();

export async function embed(text: string): Promise<number[]> {
  const input = text.slice(0, 8000);
  const cached = embedCache.get(input);
  if (cached) return cached;

  const res = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input,
  });
  const embedding = res.data[0].embedding;
  embedCache.set(input, embedding);
  return embedding;
}

export async function cosineSimilarity(a: string, b: string): Promise<number> {
  const [embA, embB] = await Promise.all([embed(a), embed(b)]);
  const dot = embA.reduce((sum, v, i) => sum + v * embB[i], 0);
  const magA = Math.sqrt(embA.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(embB.reduce((s, v) => s + v * v, 0));
  return dot / (magA * magB);
}

export async function semanticDistance(a: string, b: string): Promise<number> {
  return 1.0 - await cosineSimilarity(a, b);
}
