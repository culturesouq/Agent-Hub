export interface Owner {
  id: string;
  email: string;
  name: string | null;
  isSovereignAdmin?: boolean;
  createdAt?: string;
}

export interface Operator {
  id: string;
  name: string;
  archetype: string[];
  mandate: string;
  rawIdentity?: string;
  coreValues: string[];
  ethicalBoundaries: string[];
  layer1LockedAt: string | null;
  growLockLevel: "OPEN" | "CONTROLLED" | "LOCKED" | "FROZEN";
  safeMode: boolean;
  freeRoaming: boolean;
  hasCustomApiKey: boolean;
  defaultModel: string | null;
  createdAt: string;
  soul: {
    backstory?: string;
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
  targetField: string;
  proposedValue: any;
  allProposedChanges: Record<string, unknown>;
  rationale: string;
  confidence: number;
  status: string;
  ownerDecision: string | null;
  createdAt: string;
  claudeReasoning?: string;
  proposedChanges?: Record<string, unknown>;
}

export interface TestResult {
  message: string;
  current: string;
  proposed: string;
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

export interface PlatformSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  archetype: string;
  isActive: boolean;
}

export interface OperatorSkill {
  id: string;
  skillId: string;
  skillName: string;
  skillDescription?: string;
  customInstructions?: string;
  isActive: boolean;
  installedAt: string;
}

export interface CapabilityRequest {
  id: string;
  requestedCapability: string;
  reason: string;
  ownerResponse: string;
  createdAt: string;
}

export interface Task {
  id: string;
  operatorId: string;
  name: string;
  schedule: "daily" | "weekly" | "custom";
  description: string;
  customSchedule?: string;
  status: string;
  createdAt: string;
}
