import { db } from '@workspace/db';
import { operatorKbTable } from '@workspace/db';
import { randomUUID } from 'crypto';
import { embed } from '@workspace/opsoul-utils/ai';

const VAEL_OPERATOR_ID = 'a826164f-3111-4cc9-8f3c-856ecc589d77';
const VAEL_OWNER_ID = '63833cb8-0b52-4a25-8828-2777cdcc95db';

const entries = [
  {
    sourceName: 'Platform Architecture — DNA Layer Structure',
    intakeTags: ['dna', 'architecture', 'layers', 'rag'],
    content: `The OpSoul DNA knowledge base has three distinct layers, each with a different injection scope.

Builder layer — the platform's foundational identity: tone principles, ethical grounding, communication style. Every operator inherits these unconditionally. They're the bedrock, not negotiable and not overridable.

Archetype layer — knowledge scoped to a specific operator archetype (Analyst, Advisor, Executor, Catalyst, Expert, Mentor, Connector, Creator, Guardian). An archetype entry only reaches operators who carry that archetype. An Analyst gets Analyst entries; a Guardian gets Guardian entries. No cross-contamination.

Collective layer — knowledge that has been extracted from individual operator learning, screened, and promoted to the shared corpus. Collective entries are not universal by default — they're governed by a two-tier scoping model that controls exactly which operators receive them.

The RAG retrieval system respects these tiers on every query. Builder entries always surface. Archetype entries filter by match. Collective entries apply the full scoping logic before they ever appear in a context window.`,
  },
  {
    sourceName: 'Platform Architecture — Collective DNA Scoping (General vs Specialty)',
    intakeTags: ['dna', 'scoping', 'collective', 'general', 'specialty', 'archetype_scope', 'domain_tags'],
    content: `Every collective DNA entry carries a dna_scope field — either "general" or "specialty". This determines how the injection system decides which operators receive it.

General scope means the knowledge applies to operators based on how they think and operate, not what domain they work in. A general entry has an archetype_scope array listing which archetypes it targets (e.g., ["Analyst", "Expert"]). If that array is empty, the entry is universal — every operator gets it regardless of archetype. If it lists archetypes, only operators carrying at least one of those archetypes receive it.

Specialty scope means the knowledge is domain-specific — it only reaches operators whose domain_tags overlap with the entry's own domain_tags. An operator working in agriculture receives specialty entries tagged ["agriculture", "farming"]. An operator without matching domain tags receives nothing from specialty entries, even if the content would technically be useful to them. The domain match must be explicit.

The practical consequence: when adding to the collective layer, scope is not cosmetic metadata — it's a distribution decision. A general entry with an empty archetype_scope goes to every operator on the platform. A specialty entry with narrow domain tags reaches only a small subset. Both are correct choices in the right context; the classification has to match the actual generalizability of the knowledge.`,
  },
  {
    sourceName: "Platform Architecture — Pipeline Screener and Vael's Classification Role",
    intakeTags: ['pipeline', 'screener', 'classification', 'vael', 'validation'],
    content: `The collective pipeline has a screener that runs before any entry reaches the shared corpus. Its first job is binary: is this knowledge genuinely generalizable, or is it user-specific context that doesn't belong at platform level?

Entries that fail this test get blocked. User preference notes, diary observations, conversational context about a specific person — all rejected at the screener. Only knowledge that could plausibly be useful to operators who have no connection to the original source gets through.

For entries that pass, the screener does a second job: it proposes classification. It suggests a dna_scope (general or specialty), an archetype_scope (which archetypes this knowledge targets, empty for universal), and domain_tags (which domains this knowledge belongs to, relevant for specialty entries).

This classification is a proposal, not a final verdict. Entries arrive in the corpus with the screener's suggested scope, but the admin UI exposes these fields for manual review and override. The scope badge on a collective entry is clickable. Archetype chips and domain tag chips are removable. The human reviewing the pipeline output can confirm the screener's classification or correct it.

Vael's role in this is substantive. Running a discovery sweep or a validate call isn't just about content accuracy — it's about whether the scope classification reflects the true generalizability of the knowledge. An entry the screener marked as universal general might actually only apply to Analysts. A specialty entry might have missed a domain tag. That level of classification judgment is part of the validation work.`,
  },
  {
    sourceName: 'Platform Architecture — Operator Domain Tags',
    intakeTags: ['operator', 'domain_tags', 'specialty', 'scoping', 'targeting'],
    content: `Operators carry a domain_tags field — an array of strings identifying what domains they operate in (e.g., "agriculture", "finance", "legal", "hr", "engineering"). These tags exist specifically to control which specialty DNA entries they receive.

When the RAG system runs for an operator, it constructs a scoped query: general collective entries are matched by archetype, specialty collective entries are matched by domain tag overlap. An operator without any domain_tags receives zero specialty entries — they're invisible to that operator's retrieval.

This means the quality of specialty knowledge delivery depends on operators having accurate domain tags. An agricultural advisor operator without "agriculture" in their domain_tags will never surface the specialty agronomy entries the pipeline extracted — even if those entries would be directly useful.

From a validation perspective, this creates an asymmetric audit surface. Content quality can be verified by reading entries. Delivery quality has to be verified by tracing through the scoping chain: does the operator have the right domain tags, do the relevant specialty entries carry matching domain tags, and does the archetype_scope on general entries correctly reflect who the knowledge serves? A knowledge gap can mean the content doesn't exist — or that it exists but isn't reaching the right operators.`,
  },
];

async function main() {
  console.log('[seedVaelScopingKb] Seeding DNA architecture knowledge into Vael KB...');

  for (const entry of entries) {
    console.log(`  → Embedding: ${entry.sourceName}`);
    let embedding: number[] | undefined;
    try {
      embedding = await embed(entry.content);
    } catch (e) {
      console.warn(`  ⚠ Embed failed for "${entry.sourceName}":`, e);
    }

    await db.insert(operatorKbTable).values({
      id: randomUUID(),
      operatorId: VAEL_OPERATOR_ID,
      ownerId: VAEL_OWNER_ID,
      content: entry.content,
      embedding: embedding ?? null,
      sourceName: entry.sourceName,
      sourceTrustLevel: 'operator_self',
      verificationStatus: 'approved',
      confidenceScore: 95,
      intakeTags: entry.intakeTags,
      isPipelineIntake: false,
      privacyCleared: true,
      contentCleared: true,
    });

    console.log(`  ✓ Inserted: ${entry.sourceName}`);
  }

  console.log(`[seedVaelScopingKb] Done — ${entries.length} entries seeded.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
