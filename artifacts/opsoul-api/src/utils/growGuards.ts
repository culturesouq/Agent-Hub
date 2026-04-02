import crypto from 'crypto';
import { db } from '@workspace/db';
import { growBlockedLogTable } from '@workspace/db';

export const LAYER_1_LOCKED_FIELDS = new Set([
  'name',
  'archetype',
  'mandate',
  'coreValues',
  'core_values',
  'ethicalBoundaries',
  'ethical_boundaries',
  'fundamentalPersonality',
  'fundamental_personality',
  'operatorType',
  'operator_type',
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
