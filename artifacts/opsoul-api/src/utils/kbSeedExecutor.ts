import { gateAndStoreOperatorKb } from './kbIntake.js';
import type { KbGateResult } from './kbIntake.js';

export async function seedKbEntry(
  operatorId: string,
  ownerId: string,
  content: string,
  source: string,
): Promise<KbGateResult> {
  return gateAndStoreOperatorKb(operatorId, ownerId, content, source);
}
