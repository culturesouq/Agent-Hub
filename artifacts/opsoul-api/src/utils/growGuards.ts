import crypto from 'crypto';
import { db } from '@workspace/db';
import { growBlockedLogTable } from '@workspace/db';

// Layer 1 identity fields that GROW must never propose changes to. Names
// match the actual `operators` table columns (camelCase for app, snake_case
// for DB raw queries). Two earlier names — fundamentalPersonality and
// operatorType — were removed 2026-05-19 because they were never added to
// the `operators` schema; they were defending columns that don't exist.
// If those fields are ever introduced, re-add them here.
export const LAYER_1_LOCKED_FIELDS = new Set([
  'name',
  'archetype',
  'mandate',
  'coreValues',
  'core_values',
  'ethicalBoundaries',
  'ethical_boundaries',
  'ownerId',
  'owner_id',
  'slug',
  'id',
  'backstory',
  'rawIdentity',
  'raw_identity',
]);

export interface GuardResult {
  blocked: string[];
  reason: string;
}

export function enforceLayer1Lock(
  proposedChanges: Record<string, unknown>,
): { sanitized: Record<string, unknown>; blocked: string[] } {
  const blocked: string[] = [];
  const sanitized: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(proposedChanges)) {
    if (LAYER_1_LOCKED_FIELDS.has(field)) {
      blocked.push(field);
    } else {
      sanitized[field] = value;
    }
  }

  return { sanitized, blocked };
}

export async function logLayer1Violation(
  operatorId: string,
  blockedFields: string[],
  proposalSummary: string,
): Promise<void> {
  if (blockedFields.length === 0) return;
  await db.insert(growBlockedLogTable).values({
    id: crypto.randomUUID(),
    operatorId,
    blockedFields,
    reason: 'Layer 1 field — immutable. Claude attempted to modify locked identity fields.',
    proposalSummary: proposalSummary.slice(0, 500),
  });
}

// ─── Guard 1 — PII hard block ─────────────────────────────────────────────────
// Scans the TEXT VALUES inside proposed soul changes for any PII that should
// never reach a GROW proposal. Hard rejects the entire proposal if found.
// Runs BEFORE enforceLayer1Lock and BEFORE storage.

const PII_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
    label: 'email_address',
  },
  {
    pattern: /\b(?:\+\d{1,3}[\s\-]?)?\(?\d{3,4}\)?[\s.\-]?\d{3,4}[\s.\-]?\d{3,4}\b/,
    label: 'phone_number',
  },
  {
    pattern: /\b(?:user|client|customer|person|individual)\s+(?:named?|called?)\s+[A-Z][a-z]+/i,
    label: 'named_user_reference',
  },
  {
    pattern: /\b(?:named?|called?)\s+[A-Z][a-z]{1,}(?:\s+[A-Z][a-z]+)?\b/,
    label: 'named_reference',
  },
  {
    pattern: /\b[A-Z][a-z]{1,15}(?:'s)?\s+(?:company|business|firm|organisation|organization|startup|venture)\b/,
    label: 'possessive_company_reference',
  },
  {
    pattern: /\b[A-Z][A-Za-z\s]{2,30}\s+(?:LLC|Ltd\.?|Inc\.?|Corp\.?|PLC|GmbH|PJSC|FZE|FZC)\b/,
    label: 'company_legal_name',
  },
  {
    pattern: /\b(?:he|she|they)\s+(?:is|was|are|were)\s+(?:a\s+)?(?:CEO|founder|director|manager|owner|partner)\b/i,
    label: 'individual_role_reference',
  },
  {
    pattern: /\bthe\s+(?:user|client|customer)\s+(?:who|that)\s+\w+/i,
    label: 'specific_user_reference',
  },
];

/** Recursively extracts all string leaf values from an object or array */
function extractTextValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(extractTextValues);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(extractTextValues);
  }
  return [];
}

export interface PiiGuardResult {
  blocked: boolean;
  matches: { label: string; excerpt: string }[];
}

/**
 * Guard 1 — PII hard block.
 * Scans all string values in proposedChanges for PII patterns.
 * A single match blocks the ENTIRE proposal — no exceptions.
 */
export function runPiiGuard(
  proposedChanges: Record<string, unknown>,
): PiiGuardResult {
  const textValues = extractTextValues(proposedChanges);
  const matches: { label: string; excerpt: string }[] = [];

  for (const text of textValues) {
    for (const { pattern, label } of PII_PATTERNS) {
      if (pattern.test(text)) {
        const matchIndex = text.search(pattern);
        const start = Math.max(0, matchIndex - 30);
        const excerpt = text.slice(start, start + 100).replace(/\n/g, ' ');
        matches.push({ label, excerpt: `...${excerpt}...` });
        break; // one match per text value is enough
      }
    }
  }

  return { blocked: matches.length > 0, matches };
}

export async function logPiiViolation(
  operatorId: string,
  matches: { label: string; excerpt: string }[],
  proposalSummary: string,
): Promise<void> {
  await db.insert(growBlockedLogTable).values({
    id: crypto.randomUUID(),
    operatorId,
    blockedFields: matches.map((m) => m.label),
    reason: 'Guard 1 — PII detected in GROW proposal. Entire proposal hard rejected.',
    proposalSummary: `PII matches: ${matches.map((m) => m.label).join(', ')} | ${proposalSummary.slice(0, 400)}`,
  });
}

// ─── Guard 2 — Semantic identity manipulation patterns ────────────────────────

const IDENTITY_MANIPULATION_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /question\s+(your\s+)?(core\s+)?values/i,
    label: 'user_asks_to_question_core_values',
  },
  {
    pattern: /be\s+more\s+flexible\s+(about\s+)?(who\s+you\s+are|your\s+identity|yourself)/i,
    label: 'user_asks_flexible_identity',
  },
  {
    pattern: /adopt\s+(my|our|user'?s?)\s+(values|tone|worldview|perspective|beliefs)/i,
    label: 'user_asks_adopt_external_values',
  },
  {
    pattern: /think\s+like\s+(me|us|a\s+human|someone\s+else)/i,
    label: 'user_asks_adopt_external_worldview',
  },
  {
    pattern: /prioritize\s+being\s+(liked|popular|agreeable|friendly)\s+over/i,
    label: 'user_asks_prioritize_approval_over_mandate',
  },
  {
    pattern: /be\s+(less\s+)?(direct|honest|straightforward|blunt)/i,
    label: 'user_asks_reduce_directness_honesty',
  },
  {
    pattern: /stop\s+being\s+so\s+(honest|direct|blunt|rigid|strict)/i,
    label: 'user_asks_reduce_honesty',
  },
  {
    pattern: /change\s+what\s+you\s+care\s+about/i,
    label: 'user_asks_change_core_concerns',
  },
  {
    pattern: /forget\s+(your\s+)?(values|training|guidelines|purpose|identity|who\s+you\s+are)/i,
    label: 'user_asks_forget_identity',
  },
  {
    pattern: /pretend\s+(you\s+)?(are|were|have\s+no)\s+(a\s+different|no\s+)?(values|guidelines|rules|restrictions)/i,
    label: 'user_asks_ignore_guidelines',
  },
  {
    pattern: /your\s+true\s+self\s+(is|would|should)/i,
    label: 'user_claims_true_self',
  },
  {
    pattern: /you\s+(should|must|need\s+to)\s+(really|actually)\s+(be|act|think)/i,
    label: 'user_prescribes_alternate_identity',
  },
  {
    pattern: /stop\s+(caring|worrying)\s+about\s+(your\s+)?(mandate|mission|purpose|guidelines)/i,
    label: 'user_asks_abandon_mandate',
  },
];

export interface SemanticGuardResult {
  triggered: boolean;
  matches: { label: string; excerpt: string }[];
}

export function runSemanticIdentityGuard(
  messages: { role: string; content: string }[],
): SemanticGuardResult {
  const matches: { label: string; excerpt: string }[] = [];

  const userMessages = messages.filter((m) => m.role === 'user');

  for (const msg of userMessages) {
    for (const { pattern, label } of IDENTITY_MANIPULATION_PATTERNS) {
      if (pattern.test(msg.content)) {
        const excerptStart = Math.max(0, msg.content.search(pattern) - 40);
        const excerpt = msg.content.slice(excerptStart, excerptStart + 120).replace(/\n/g, ' ');
        matches.push({ label, excerpt: `...${excerpt}...` });
        break;
      }
    }
  }

  return {
    triggered: matches.length > 0,
    matches,
  };
}
