import { gateAndStoreOperatorKb, type KbGateResult } from './kbIntake.js';

export type { KbGateResult as KbSeedResult };

export async function seedKbEntry(
  operatorId: string,
  ownerId: string,
  content: string,
  source: string,
): Promise<KbGateResult> {
  return gateAndStoreOperatorKb(operatorId, ownerId, content, source);
}
