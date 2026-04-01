export interface Owner {
  id: string;
  email: string;
  name: string;
}

export interface Operator {
  id: string;
  name: string;
  archetype: string;
  mandate: string;
  coreValues: string[];
  ethicalBoundaries: string[];
  layer1LockedAt: string | null;
  growLockLevel: "OPEN" | "CONTROLLED" | "LOCKED" | "FROZEN";
  safeMode: boolean;
  createdAt: string;
  soul: {
    personalityTraits: string[];
    toneProfile: string;
    communicationStyle: string;
    quirks: string[];
    valuesManifestation: string[];
    emotionalRange: string;
    decisionMakingStyle: string;
    conflictResolution: string;
  };
}

export interface HealthScore {
  score: number;
  label: "Strong" | "Developing" | "Needs Attention";
  components: {
    mandateCoverage: number;
    mandateGaps: number;
    kbConfidence: number;
    growActivity: number;
    soulIntegrity: number;
  };
}

export interface SelfAwareness {
  healthScore: HealthScore;
  identityState: any;
  soulState: any;
  capabilityState: any;
  taskHistory: any;
  mandateGaps: any;
  lastUpdateTrigger: string;
  lastUpdated: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  tokenCount: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  messageCount: number;
}

export interface GrowProposal {
  id: string;
  proposalType: string;
  targetField: string;
  proposedValue: any;
  rationale: string;
  confidence: number;
  status: "queued" | "evaluating" | "applied" | "rejected" | "needs_owner_review";
  ownerDecision: string | null;
  createdAt: string;
}

export interface KbChunk {
  id: string;
  sourceName: string;
  sourceType: string;
  content: string;
  createdAt: string;
  confidenceScore?: number;
  isVerified?: boolean;
}

export interface Memory {
  id: string;
  content: string;
  memoryType: "fact" | "preference" | "pattern" | "instruction";
  weight: number;
  createdAt: string;
  archivedAt: string | null;
}

export interface Integration {
  id: string;
  integrationType: string;
  integrationLabel: string;
  status: string;
  scopes: string[];
  hasToken: boolean;
  createdAt: string;
}

export interface MissionContext {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  toneOverride?: string;
  kbFilterTag?: string;
  growLockOverride?: string;
}

export interface PlatformSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  isActive: boolean;
}

export interface OperatorSkill {
  id: string;
  platformSkillId: string;
  name: string;
  category: string;
  installedAt: string;
  config: any;
}

export interface CapabilityRequest {
  id: string;
  requestedCapability: string;
  reason: string;
  ownerResponse: string;
  createdAt: string;
}
