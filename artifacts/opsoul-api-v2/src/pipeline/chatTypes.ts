import type { operatorsTable, conversationsTable } from '@workspace/db-v2';
import type { ChatMessage, ToolDefinition } from '../utils/openrouter.js';
import type { ActiveSkill, BuildSystemPromptOpts, LiveStationData, SelfAwarenessSnapshot } from '../utils/systemPrompt.js';
import type { MemoryHit } from '../utils/memoryEngine.js';

export type OperatorRecord = typeof operatorsTable.$inferSelect;
export type ConversationRecord = typeof conversationsTable.$inferSelect;

export interface TurnContext {
  operator: OperatorRecord;
  conv: ConversationRecord;
  history: ChatMessage[];
  kbContext: string;
  memoryHits: MemoryHit[];
  selfAwareness: SelfAwarenessSnapshot | null;
  skills: ActiveSkill[];
  liveStation: LiveStationData;
  chatModel: string;
  systemPrompt: string;
  promptOpts: BuildSystemPromptOpts;
  isBirthMode: boolean;
  tools: ToolDefinition[];
}

export interface TurnResult {
  finalContent: string;
  promptTokens: number;
  completionTokens: number;
  webSearchCount: number;
  kbSeedCount: number;
}

export type SseWriter = (event: Record<string, unknown>) => void;
