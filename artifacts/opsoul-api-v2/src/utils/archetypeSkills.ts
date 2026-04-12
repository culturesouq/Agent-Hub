import { db } from '@workspace/db-v2';
import { platformSkillsTable } from '@workspace/db-v2';
import { inArray } from 'drizzle-orm';

export const ARCHETYPE_DEFAULT_SKILL_NAMES: Record<string, string[]> = {
  Advisor:   ['Decision Framework', 'Strategy Review', 'Vision Pressure Test', 'Tough Love Frame', 'Options Mapper'],
  Executor:  ['Task Breakdown', 'Action Extractor', 'Blocker Breaker', 'Deadline Monitor', 'Sprint Planner'],
  Expert:    ['Deep Research', 'Fact Checker', 'Source Validator', 'Knowledge Summarizer', 'Deep Dive Explainer'],
  Connector: ['Relationship Mapper', 'Network Gap Analysis', 'Intro Composer', 'Follow-up Composer', 'Bridge Builder'],
  Creator:   ['Idea Generator', 'Idea Expander', 'Draft Generator', 'Story Framer', 'Creative Brief Builder'],
  Guardian:  ['Boundary Enforcer', 'Risk Scan', 'Edge Case Spotter', 'Early Warning Brief', 'Decision Safety Check'],
  Builder:   ['System Scope', 'Ship Readiness Check', 'Technical Debt Read', 'First Version Frame', 'Blocker to Build Plan'],
  Catalyst:  ['Reframe Frame', 'Momentum Starter', 'Energy Read', 'Commitment Closer', 'Progress Amplifier'],
  Analyst:   ['Signal vs Noise Sort', 'Comparative Analysis', 'Pattern Report', 'Decision Brief', 'Assumption Audit'],
};

export interface ArchetypeSkill {
  installId:          string;
  skillId:            string;
  name:               string;
  instructions:       string;
  outputFormat:       string | null;
  triggerDescription: string;
  customInstructions: null;
  isArchetypeDefault: true;
  integrationType:    string | null;
}

export async function loadArchetypeSkills(archetypes: string[]): Promise<ArchetypeSkill[]> {
  const skillNames = new Set<string>();
  for (const a of archetypes) {
    const defaults = ARCHETYPE_DEFAULT_SKILL_NAMES[a] ?? [];
    defaults.forEach(n => skillNames.add(n));
  }
  if (skillNames.size === 0) return [];

  const rows = await db
    .select({
      id:                 platformSkillsTable.id,
      name:               platformSkillsTable.name,
      instructions:       platformSkillsTable.instructions,
      outputFormat:       platformSkillsTable.outputFormat,
      triggerDescription: platformSkillsTable.triggerDescription,
      integrationType:    platformSkillsTable.integrationType,
    })
    .from(platformSkillsTable)
    .where(inArray(platformSkillsTable.name, [...skillNames]));

  return rows.map(s => ({
    installId:          `archetype-${s.id}`,
    skillId:            s.id,
    name:               s.name,
    instructions:       s.instructions ?? '',
    outputFormat:       s.outputFormat ?? null,
    triggerDescription: s.triggerDescription ?? '',
    customInstructions: null,
    isArchetypeDefault: true as const,
    integrationType:    s.integrationType ?? null,
  }));
}
