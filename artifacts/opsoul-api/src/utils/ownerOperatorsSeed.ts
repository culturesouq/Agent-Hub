export const OWNER_EMAIL = process.env.SOVEREIGN_ADMIN_EMAIL || 'mohamedhajeri887@gmail.com';

export interface OwnerOperatorSeed {
  id?: string;
  name: string;
  slug: string;
  archetype: string[];
  mandate: string;
  rawIdentity: string;
  layer2Soul: Record<string, unknown>;
  coreValues: string[];
  ethicalBoundaries: string[];
  growLockLevel: string;
  safeMode: boolean;
}

// Operators are created through birth, not seeded.
export const OWNER_OPERATORS: OwnerOperatorSeed[] = [];
