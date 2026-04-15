import { db } from '@workspace/db';
import { operatorSecretsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { decryptToken } from '@workspace/opsoul-utils/crypto';

export async function executeHttpRequest(
  operatorId: string,
  args: { method: string; url: string; headers?: Record<string, string>; body?: string },
): Promise<string> {
  const secretRows = await db
    .select({ key: operatorSecretsTable.key, valueEncrypted: operatorSecretsTable.valueEncrypted })
    .from(operatorSecretsTable)
    .where(eq(operatorSecretsTable.operatorId, operatorId));

  const secretMap: Record<string, string> = {};
  for (const s of secretRows) {
    try { secretMap[s.key] = decryptToken(s.valueEncrypted); } catch { /* skip bad entry */ }
  }

  const resolve = (str: string) =>
    str.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, name) => secretMap[name] ?? `{{${name}}}`);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  for (const [k, v] of Object.entries(args.headers ?? {})) {
    headers[resolve(k)] = resolve(v);
  }

  const fetchOpts: RequestInit = { method: args.method, headers };
  if (args.body && ['POST', 'PUT', 'PATCH'].includes(args.method.toUpperCase())) {
    fetchOpts.body = resolve(args.body);
  }

  const resp = await fetch(resolve(args.url), fetchOpts);
  const text = await resp.text();
  let output: string;
  try { output = JSON.stringify(JSON.parse(text), null, 2); } catch { output = text.slice(0, 3000); }
  return `HTTP ${resp.status} ${resp.statusText}\n${output}`;
}
