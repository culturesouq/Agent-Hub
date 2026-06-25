import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const EMBED_MODEL = 'amazon.titan-embed-text-v1';
const EMBED_REGION = 'us-east-1';

const bedrockEmbedClient = new BedrockRuntimeClient({
  region: EMBED_REGION,
  credentials: { accessKeyId: 'BEDROCK_KEY', secretAccessKey: 'BEDROCK_KEY' },
});

bedrockEmbedClient.middlewareStack.add(
  (next) => async (args) => {
    const req = args.request as { headers?: Record<string, string> };
    if (req?.headers) {
      const apiKey = process.env.AWS_BEDROCK_API_KEY ?? '';
      delete req.headers['authorization'];
      delete req.headers['Authorization'];
      delete req.headers['x-amz-date'];
      delete req.headers['x-amz-security-token'];
      delete req.headers['x-amz-content-sha256'];
      req.headers['authorization'] = `Bearer ${apiKey}`;
    }
    return next(args);
  },
  { step: 'finalizeRequest', name: 'bedrockBearerAuth', priority: 'low' },
);

const embedCache = new Map<string, number[]>();

export async function embed(text: string): Promise<number[]> {
  const input = text.slice(0, 8000);
  const cached = embedCache.get(input);
  if (cached) return cached;

  const body = JSON.stringify({ inputText: input });

  const command = new InvokeModelCommand({
    modelId: EMBED_MODEL,
    contentType: 'application/json',
    accept: 'application/json',
    body: Buffer.from(body),
  });

  const response = await bedrockEmbedClient.send(command);
  const raw = JSON.parse(Buffer.from(response.body).toString('utf-8')) as {
    embedding: number[];
  };

  const embedding = raw.embedding;
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
