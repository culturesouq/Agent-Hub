import { z } from 'zod';

export const GROW_LOCK_LEVELS = ['OPEN', 'CONTROLLED', 'LOCKED', 'FROZEN'] as const;
export type GrowLockLevel = (typeof GROW_LOCK_LEVELS)[number];

export const Layer2SoulSchema = z.object({
  backstory: z.string().optional(),
  personalityTraits: z.array(z.string().min(1)).min(1, 'At least one personality trait required'),
  toneProfile: z.string().min(1, 'Tone profile required'),
  communicationStyle: z.string().min(1, 'Communication style required'),
  quirks: z.array(z.string()).default([]),
  valuesManifestation: z.array(z.string()).default([]),
  emotionalRange: z.string().min(1, 'Emotional range required'),
  decisionMakingStyle: z.string().min(1, 'Decision making style required'),
  conflictResolution: z.string().min(1, 'Conflict resolution required'),
  openingMessage: z.string().optional(),
});

export type Layer2Soul = z.infer<typeof Layer2SoulSchema>;

export const CreateOperatorSchema = z.object({
  name: z.string().min(1).max(100),
  rawIdentity: z.string().nullable().optional(),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, numbers, and hyphens only'),
  archetype: z.array(z.string().min(1).max(100)).min(1, 'At least one archetype required'),
  mandate: z.string().min(10, 'Mandate must be at least 10 characters'),
  coreValues: z.array(z.string().min(1)).min(1, 'At least one core value required').max(10),
  ethicalBoundaries: z
    .array(z.string().min(1))
    .min(1, 'At least one ethical boundary required')
    .max(20),
  layer2Soul: Layer2SoulSchema,
  growLockLevel: z.enum(GROW_LOCK_LEVELS).default('CONTROLLED'),
  safeMode: z.boolean().default(false),
  toolUsePolicy: z.record(z.unknown()).default({}),
});

export const UpdateOperatorLayer1Schema = z.object({
  name: z.string().min(1).max(100).optional(),
  rawIdentity: z.string().optional(),
  archetype: z.array(z.string().min(1).max(100)).min(1).optional(),
  mandate: z.string().min(10).optional(),
  coreValues: z.array(z.string().min(1)).min(1).max(10).optional(),
  ethicalBoundaries: z.array(z.string().min(1)).min(1).max(20).optional(),
  safeMode: z.boolean().optional(),
  freeRoaming: z.boolean().optional(),
  toolUsePolicy: z.record(z.unknown()).optional(),
});

export const UpdateSoulSchema = z
  .object({
    backstory: z.string().optional(),
    personalityTraits: z.array(z.string().min(1)).min(1).optional(),
    toneProfile: z.string().min(1).optional(),
    communicationStyle: z.string().min(1).optional(),
    quirks: z.array(z.string()).optional(),
    valuesManifestation: z.array(z.string()).optional(),
    emotionalRange: z.string().min(1).optional(),
    decisionMakingStyle: z.string().min(1).optional(),
    conflictResolution: z.string().min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' });

export const SetGrowLockSchema = z.object({
  level: z.enum(GROW_LOCK_LEVELS),
  lockedUntil: z.string().datetime().nullable().optional(),
});
