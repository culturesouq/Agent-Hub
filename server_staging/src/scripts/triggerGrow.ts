/**
 * Direct GROW trigger — bypasses HTTP auth, calls runGrowCycle directly.
 * Run: pnpm --filter @workspace/opsoul-api tsx src/scripts/triggerGrow.ts [operatorId]
 * Default operator: Atlas stress test
 */
import { runGrowCycle } from '../utils/growEngine.js';
import { db } from '@workspace/db';
import { operatorsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { appendFileSync } from 'fs';

const operatorId = process.argv[2] ?? '587aa12d-2a85-4517-a41f-99771c74154f';
const EVIDENCE_LOG = '/home/runner/workspace/.local/logs/atlas_stress_log.md';

console.log(`\n[GROW TRIGGER] Operator: ${operatorId}`);
console.log(`[GROW TRIGGER] Time: ${new Date().toISOString()}\n`);

const [op] = await db.select({ id: operatorsTable.id, name: operatorsTable.name, growLockLevel: operatorsTable.growLockLevel })
  .from(operatorsTable)
  .where(eq(operatorsTable.id, operatorId));

if (!op) {
  console.error('[GROW TRIGGER] Operator not found.');
  process.exit(1);
}

console.log(`[GROW TRIGGER] ${op.name} — lock: ${op.growLockLevel}`);

const result = await runGrowCycle(operatorId);
console.log('\n[GROW TRIGGER] Result:', JSON.stringify(result, null, 2));

// Log to evidence file
const entry = `\n### GROW Cycle — ${new Date().toISOString()}\n- **Operator**: ${op.name} (\`${operatorId}\`)\n- **Status**: ${result.status}\n- **Details**: \`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n---\n`;
try {
  appendFileSync(EVIDENCE_LOG, entry, 'utf8');
  console.log('[GROW TRIGGER] Logged to evidence file.');
} catch (e) {
  console.warn('[GROW TRIGGER] Could not write to evidence log (running from different cwd?)');
}

process.exit(0);
