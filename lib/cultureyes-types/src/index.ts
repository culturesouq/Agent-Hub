/**
 * @cultureyes/types — shared contracts for the whole CULTUREYES SDK.
 * Every package imports from here. Stable spine; changes are coordinated.
 */

// ─── Messages / roles ───────────────────────────────────────────────
export type Role = "system" | "user" | "assistant" | "hajeri" | "content" | "tool";
export interface Message { role: Role; content: string; }

// ─── L0 · Brains (any LLM; sampling, never greedy) ──────────────────
export interface BrainOptions {
  temperature?: number;            // default ~0.7 — NEVER greedy by default
  topP?: number;
  maxTokens?: number;
  stop?: string[];
  repetitionPenalty?: number;      // server-side rep penalty (1.0 = off; default 1.3)
}
export interface ToolCall { name: string; params: Record<string, unknown>; raw?: string; }
export interface BrainResponse {
  text: string;
  toolCalls?: ToolCall[];
  verdict?: Verdict;
  finishReason?: string;
}
export interface Brain {
  id: string;
  chat(messages: Message[], opts?: BrainOptions): Promise<BrainResponse>;
  chatStream?(messages: Message[], opts?: BrainOptions): AsyncIterable<string>;
}
export interface BrainProvider {
  id: string;
  kind: "hajeri" | "openai" | "anthropic" | "openrouter" | string;
  baseUrl: string;                 // e.g. https://hajerilm.cultureyes.ae/v1
  apiKeyEnv?: string;
  defaultModel?: string;
}

// ─── L1 · Tools (full catalog; MCP-native) ──────────────────────────
export interface ToolSchema { type: "object"; properties: Record<string, unknown>; required?: string[]; }
export interface ToolDef {
  name: string;
  description: string;
  domain?: string;                 // catalog domain: web|files|data|memory|comms|dev|verify|workflow|...
  schema: ToolSchema;
  execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
export interface ToolResult {
  ok: boolean;
  /** verifier mode returns the TRAINED plain-text content format:
   *  "Found tools: ...", "Found entry: ...", "Source: ... confirms/contradicts ..." */
  content: string;
  data?: unknown;
  error?: string;
}
export interface ToolContext { consumerId: string; deploymentId: string; secrets: SecretAccessor; logger: Logger; }
export interface ToolRegistry {
  register(def: ToolDef): void;
  list(provisioned?: string[]): ToolDef[];
  get(name: string): ToolDef | undefined;
  execute(name: string, params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

// ─── L2 · Agent loop ────────────────────────────────────────────────
export type AgentMode = "verifier" | "operator" | "chat";
export interface AgentTurn { role: Role; content: string; toolCall?: ToolCall; toolResult?: ToolResult; }
export interface AgentRunInput {
  brain?: Brain;                   // OPTIONAL — brain-requiring modes throw if absent
  tools: ToolRegistry;
  mode: AgentMode;
  policy?: Policy;
  system?: string;
  input: string;
  maxRounds?: number;              // guard
  ctx: ToolContext;
  profile?: FormatProfile;         // pluggable transcript grammar; default if absent
  genOpts?: Partial<BrainOptions>; // extra generation params merged over loop defaults
}
export interface AgentRunResult { output: string; verdict?: Verdict; trace: AgentTurn[]; }

// ─── Format profiles / presets ──────────────────────────────────────
/**
 * A FormatProfile is the pluggable transcript grammar the loop renders with.
 * It decides the default system prompt, how the user input is framed per mode,
 * and how tool-calls / tool-results / verdicts are turned into {@link AgentTurn}s
 * (roles + the token form in the content). The neutral DEFAULT profile uses
 * standard roles and plain rendering; the GATEKEEPER preset supplies the trained
 * Hajeri identity + `<TOOL>/<PARAM>/<VERDICT>` grammar and `hajeri`/`content`
 * roles, keeping the verifier loop byte-identical to the trained transcript.
 */
export interface FormatProfile {
  /** Profile id, e.g. "default" | "gatekeeper". */
  id: string;
  /** Default system prompt when the caller/policy supply none. May be undefined (no system turn). */
  defaultSystem?: string;
  /** Frame the user input for the given mode (e.g. verifier → "verify\n<claim>"). */
  frameInput(mode: AgentMode, input: string): string;
  /** Render a tool CALL into a transcript turn (role + token form in content). */
  renderToolCall(name: string, params: Record<string, unknown>): AgentTurn;
  /** Render a tool RESULT (observation) into a transcript turn. */
  renderToolResult(content: string, toolResult?: ToolResult): AgentTurn;
  /** Render a final VERDICT into a transcript turn. */
  renderVerdict(verdict: Verdict): AgentTurn;
  /** Render a plain model-voice prose answer into a transcript turn. */
  renderAnswer(content: string): AgentTurn;
}
/** Named presets the SDK/CLI/server can load by string. */
export type PresetName = "gatekeeper" | string;

// ─── Verifier verdict ───────────────────────────────────────────────
export type VerdictKind = "approve" | "reject" | "escalate";
export interface Verdict { verdict: VerdictKind; confidence: number; domain?: string; reason: string; insight?: string; }

// ─── L3 · Policy (GENERAL — not gatekeeper-only) ────────────────────
export interface OutputHandling { onVerdict?: Record<VerdictKind, string[]>; [k: string]: unknown; }
export interface Policy {
  consumerId: string;
  brain: string;
  tools: string[];                 // provisioned tool/domain names (the per-consumer slice)
  mode: AgentMode;
  systemPrompt?: string;
  outputHandling?: OutputHandling; // verdict→action is ONE instance of this
}

// ─── 2-layer memory ─────────────────────────────────────────────────
export interface MemoryRecord {
  id: string; source: string; kind: string; content: string;
  embedding?: number[]; verified?: boolean; ts: number; meta?: Record<string, unknown>;
}
export interface MemoryLayer {
  store(rec: MemoryRecord): Promise<void>;
  search(query: string, k?: number): Promise<MemoryRecord[]>;
}

// ─── Licensing ──────────────────────────────────────────────────────
export interface License { key: string; product: string; consumerId: string; scopes: string[]; expiresAt?: number; active: boolean; }

// ─── Cross-cutting ──────────────────────────────────────────────────
export interface SecretAccessor { get(name: string): Promise<string | undefined>; }
export interface Logger { info(msg: string, meta?: unknown): void; error(msg: string, meta?: unknown): void; }
