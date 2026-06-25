import { persistKbSeedEntry, type KbSeedResult } from './kbIntake.js';

export async function seedKbEntry(
  operatorId: string,
  ownerId: string,
  content: string,
  source: string,
  confidence = 65,
): Promise<KbSeedResult> {
  return persistKbSeedEntry(operatorId, ownerId, content, source, confidence);
}
