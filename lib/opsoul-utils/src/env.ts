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
      throw new Error(`[env] Missing required env var: ${key}`);
    }
  }

  const encKey = process.env.ENCRYPTION_KEY!;
  const encKeyBuf = Buffer.from(encKey, 'hex');
  if (!/^[0-9a-f]{64}$/i.test(encKey) || encKeyBuf.length !== 32) {
    const msg =
      `[env] ENCRYPTION_KEY is invalid.\n` +
      `  Current value: length=${encKey.length} chars, hex-decoded=${encKeyBuf.length} bytes.\n` +
      `  Required: exactly 64 lowercase hex characters (decodes to 32 bytes for AES-256-GCM).\n` +
      `  Fix: go to Replit Secrets, delete ENCRYPTION_KEY, and set it to the output of:\n` +
      `       node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"`;
    throw new Error(msg);
  }

  const jwtSecret = process.env.JWT_SECRET!;
  if (jwtSecret.length < 32) {
    console.warn(
      `[env] WARNING: JWT_SECRET is only ${jwtSecret.length} chars. ` +
      `v2.4 spec requires at least 64 chars. Consider regenerating.`,
    );
  }
}
