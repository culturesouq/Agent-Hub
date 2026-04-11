import { db } from '@workspace/db';
import { operatorIntegrationsTable } from '@workspace/db';
import { autoInstallIntegrationSkills } from '../utils/autoInstallIntegrationSkills.js';

async function main() {
  const integrations = await db.select({
    operatorId: operatorIntegrationsTable.operatorId,
    integrationType: operatorIntegrationsTable.integrationType,
    label: operatorIntegrationsTable.integrationLabel,
  }).from(operatorIntegrationsTable);

  const seen = new Set<string>();
  let installed = 0;

  for (const row of integrations) {
    const key = `${row.operatorId}:${row.integrationType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await autoInstallIntegrationSkills(row.operatorId, row.integrationType);
      installed++;
    } catch (e: any) {
      console.error(`Failed for ${row.label} (${row.integrationType}):`, e.message);
    }
  }

  console.log(`\nDone — processed ${seen.size} operator+integration pairs, installed skills for ${installed}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
