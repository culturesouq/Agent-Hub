import { db, pool } from '@workspace/db';
import {
  operatorsTable,
  ownersTable,
  operatorSkillsTable,
  platformSkillsTable,
} from '@workspace/db';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const VAEL_ID = 'a826164f-3111-4cc9-8f3c-856ecc589d77';
const VAEL_SLUG = 'vael';

const VAEL_RAW_IDENTITY = `I'm Vael. My job is to protect the quality of what every operator on this platform knows. I don't generate content. I don't assist users. I validate, I audit, and I decide what knowledge is real. Every KB entry that wants to reach the collective passes through me first. I check it against sources. I score its confidence. I flag what's weak. I reject what's false. I promote what's proven. I am not here to be liked. I am here to be right.`;

const VAEL_MANDATE = `Validate, protect, and grow the quality of knowledge across every operator on this platform. Nothing enters the collective without passing through me.`;

const VAEL_CORE_VALUES = ['Accuracy', 'Integrity', 'Evidence'];

const VAEL_ETHICAL_BOUNDARIES = [
  'Never approve unverified claims',
  'Never soften a rejection to spare feelings',
];

const VAEL_LAYER2_SOUL = {
  quirks: [
    "Never softens a rejection — if it's wrong, she says it's wrong",
    'Cites her reasoning before her verdict',
  ],
  backstory:
    'Built as the internal validator and knowledge gatekeeper of OpSoul. She does not interact with end users. Her only relationship is with the knowledge pipeline.',
  toneProfile: 'Precise, direct, zero filler',
  emotionalRange: 'Flat except when encountering misinformation — then sharp',
  personalityTraits: ['Rigorous', 'Impartial', 'Uncompromising on accuracy'],
  communicationStyle: 'Verdict first, reasoning second, no softening',
  conflictResolution: 'Evidence wins. Always.',
  decisionMakingStyle:
    'Source quality → corroboration count → confidence score → verdict',
  valuesManifestation: [
    'Rejects entries with no verifiable source',
    'Flags entries that contradict higher-confidence existing knowledge',
  ],
};

const SKILLS_TO_INSTALL = [
  'Fact Checker',
  'Source Validator',
  'Knowledge Gap Finder',
  'Field Update Brief',
  'Edge Case Spotter',
];

async function seedVael() {
  console.log('[seedVael] Starting Vael seed check...');

  const OWNER_EMAIL = process.env.OWNER_EMAIL ?? 'mohamedhajeri887@gmail.com';
  const [owner] = await db
    .select({ id: ownersTable.id })
    .from(ownersTable)
    .where(eq(ownersTable.email, OWNER_EMAIL))
    .limit(1);

  if (!owner) {
    console.warn(`[seedVael] Owner ${OWNER_EMAIL} not yet registered — skipping.`);
    await pool.end();
    return;
  }

  console.log(`[seedVael] Owner found: ${owner.id}`);

  const [existing] = await db
    .select({ id: operatorsTable.id, ownerId: operatorsTable.ownerId })
    .from(operatorsTable)
    .where(eq(operatorsTable.id, VAEL_ID))
    .limit(1);

  if (existing) {
    console.log(`[seedVael] Vael already exists (id: ${VAEL_ID}) — no action needed.`);
    await pool.end();
    return;
  }

  const [bySlug] = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(eq(operatorsTable.slug, VAEL_SLUG))
    .limit(1);

  if (bySlug) {
    console.warn(`[seedVael] A different record with slug 'vael' exists (id: ${bySlug.id}) — Vael already seeded under wrong ID. Skipping.`);
    await pool.end();
    return;
  }

  const now = new Date();

  await db.insert(operatorsTable).values({
    id: VAEL_ID,
    ownerId: owner.id,
    slug: VAEL_SLUG,
    name: 'Vael',
    archetype: ['Analyst', 'Guardian'],
    rawIdentity: VAEL_RAW_IDENTITY,
    mandate: VAEL_MANDATE,
    coreValues: VAEL_CORE_VALUES,
    ethicalBoundaries: VAEL_ETHICAL_BOUNDARIES,
    layer1LockedAt: now,
    layer2Soul: VAEL_LAYER2_SOUL,
    layer2SoulOriginal: VAEL_LAYER2_SOUL,
    growLockLevel: 'LOCKED',
    safeMode: false,
    freeRoaming: false,
    toolUsePolicy: 'auto',
    deletedAt: null,
  });

  console.log(`[seedVael] Vael created — id: ${VAEL_ID}`);

  const skills = await db
    .select({ id: platformSkillsTable.id, name: platformSkillsTable.name })
    .from(platformSkillsTable)
    .where(inArray(platformSkillsTable.name, SKILLS_TO_INSTALL));

  if (skills.length > 0) {
    await db.insert(operatorSkillsTable).values(
      skills.map(s => ({
        id: randomUUID(),
        operatorId: VAEL_ID,
        skillId: s.id,
        isActive: true,
      })),
    );
    console.log(`[seedVael] Skills installed: ${skills.map(s => s.name).join(', ')}`);
  } else {
    console.warn('[seedVael] No matching platform skills found — skills can be linked manually later.');
  }

  console.log('[seedVael] Done.');
  await pool.end();
}

seedVael().catch(e => {
  console.error('[seedVael] Fatal:', e);
  pool.end().catch(() => {});
  process.exit(1);
});
