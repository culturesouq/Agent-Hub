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
  roles?: string[];
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
  isInternal?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  messageCount: number;
  scopeId?: string | null;
  scopeLabel?: string | null;
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
  memoryType: "fact" | "preference" | "interaction" | "pattern" | "context";
  weight: number;
  createdAt: string;
  archivedAt: string | null;
  scopeId?: string | null;
  scopeLabel?: string | null;
}

export interface Integration {
  id: string;
  integrationType: string;
  integrationLabel: string;
  status: string;
  scopes: string[];
  hasToken: boolean;
  hasAppSecret?: boolean;
  appSchema?: Record<string, unknown> | null;
  createdAt: string;
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
  skillId: string;
  skillName: string;
  skillDescription?: string;
  customInstructions?: string;
  isActive: boolean;
  installedAt: string;
}

export interface BuiltinSkillCard {
  name: string;
  description: string;
  category: 'research' | 'workspace' | 'integration' | 'automation';
}

export interface SpecialtySkillCard {
  skillId: string;
  name: string;
  description: string;
  integrationType: string | null;
}

export interface SkillManifest {
  operatorId: string;
  builtin: BuiltinSkillCard[];
  specialty: SpecialtySkillCard[];
  custom: OperatorSkill[];
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
  schedule: "hourly" | "daily" | "weekly" | "cron";
  prompt: string;
  customSchedule?: string;
  status: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunSummary?: string;
  lastRunDurationSec?: number;
  createdAt: string;
}
