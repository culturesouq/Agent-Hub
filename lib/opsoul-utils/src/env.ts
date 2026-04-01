const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
] as const;

export function validateEnv(): void {
  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }
}
