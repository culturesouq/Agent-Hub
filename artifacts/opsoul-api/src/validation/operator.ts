import { z } from 'zod';

export const GROW_LOCK_LEVELS = ['OPEN', 'CONTROLLED', 'LOCKED', 'FROZEN'] as const;
export type GrowLockLevel = (typeof GROW_LOCK_LEVELS)[number];

export const Layer2SoulSchema = z.object({
  backstory: z.string().optional(),
  personalityTraits: z.array(z.string()).default([]),
  toneProfile: z.string().default(''),
  communicationStyle: z.string().default(''),
  quirks: z.array(z.string()).default([]),
  valuesManifestation: z.array(z.string()).default([]),
  emotionalRange: z.string().default(''),
  decisionMakingStyle: z.string().default(''),
  conflictResolution: z.string().default(''),
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
  mandate: z.string().default(''),
  coreValues: z.array(z.string()).default([]),
  ethicalBoundaries: z.array(z.string()).default([]),
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
