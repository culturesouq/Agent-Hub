/**
 * Architecture Firewall — output post-processing guardrail for the patent-
 * protected OpSoul architecture (IPPT-2026-000028).
 *
 * Runs on every assistant response BEFORE delivery to the user. Scans for
 * patent-claim vocabulary that should never surface in user-facing output,
 * regardless of which LLM produced the response. When detected, the response
 * is replaced with a fixed substitute reply.
 *
 * Why this exists:
 *   The five-layer architecture, GROW engine, multi-archetype framework,
 *   scope isolation, two-layer memory, self-awareness engine, curiosity
 *   engine, and DNA scoping pipeline are all patent claims. Architecture-
 *   as-Secret (§ 4 of the SoT) requires they never surface in operator
 *   output. Soft instruction-layer protection (Layer 4 principles, KB
 *   curation) is the first line. The firewall is the structural guarantee
 *   underneath — works regardless of which LLM is behind the operator.
 *
 * Design principles:
 *   - SURGICAL patterns. False positives create bad CX (operator looks
 *     broken when discussing legitimate domain content). Patterns require
 *     specific platform-context, capitalization, or composite phrasing —
 *     not generic words like "scope", "memory", "embedding".
 *   - TWO TIERS. High-confidence patterns block immediately. Borderline
 *     patterns log-only — flagged for owner review, not blocked. Owner
 *     promotes patterns from log-only to blocking based on real data.
 *   - LOGGED. Every trigger writes a structured log line for owner audit
 *     and pattern tuning.
 *
 * Substitute reply: predictable, natural, no extra LLM call (no loop risk).
 */

export type FirewallTier = 'block' | 'log_only';

export interface FirewallPattern {
  regex: RegExp;
  category: string;
  label: string;
  tier: FirewallTier;
}

export interface FirewallTrigger {
  category: string;
  label: string;
  matched: string;
  position: number;
  tier: FirewallTier;
}

export interface FirewallResult {
  text: string;
  triggered: boolean;     // true if any BLOCK pattern fired
  blocked: boolean;       // true if response was replaced
  triggers: FirewallTrigger[];  // includes both block and log-only triggers
}

export const FIREWALL_SUBSTITUTE_REPLY =
  "That's internal to how I'm built — what I can tell you is what I do. What would you like to work on?";

// ─── HIGH-CONFIDENCE PATTERNS (BLOCK on match) ───────────────────────────
// Each pattern is specific enough that a real-world legitimate response
// from an operator should never trigger. If a false positive surfaces in
// production logs, narrow the pattern further.
const HIGH_CONFIDENCE: FirewallPattern[] = [
  // ── Platform name ──
  { regex: /\bOpSoul\b/g, category: 'platform-name', label: 'OpSoul', tier: 'block' },

  // ── Five-layer architecture (literal layer names with platform context) ──
  // Matches "Layer 0", "Layer 1", "Layer 2", "Layer 3", "Layer 4" when
  // followed by punctuation or end-of-token. Avoids false positives like
  // "soil layer 1" (lowercase) or "layer 5/6/7" (number out of range).
  { regex: /\bLayer\s+[0-4](?=\s*[—\-:.,)\]\n]|\s*$|\s+(?:Foundation|Soul|Self|Operational|Human|Core))/g, category: 'layer-arch', label: 'Layer N', tier: 'block' },
  { regex: /\bfive[\s-]layer\s+(prompt|architecture|system|framework|stack)\b/gi, category: 'layer-arch', label: 'five-layer X', tier: 'block' },
  { regex: /\b5[\s-]layer\s+(prompt|architecture|system|framework|stack)\b/gi, category: 'layer-arch', label: '5-layer X', tier: 'block' },

  // ── GROW engine + governance ──
  { regex: /\bGROW\s+(engine|pipeline|proposal|guard|lock|cycle|process)\b/g, category: 'grow-engine', label: 'GROW X', tier: 'block' },
  { regex: /\bgrowLockLevel\b/g, category: 'grow-engine', label: 'growLockLevel', tier: 'block' },
  { regex: /\bidentity\s+manipulation\s+detector\b/gi, category: 'grow-engine', label: 'identity manipulation detector', tier: 'block' },
  { regex: /\bsemantic\s+identity\s+manipulation\b/gi, category: 'grow-engine', label: 'semantic identity manipulation', tier: 'block' },
  { regex: /\b(13|thirteen)\s+(manipulation\s+)?patterns?\b/gi, category: 'grow-engine', label: '13 patterns', tier: 'block' },
  { regex: /\bcumulative\s+drift\s+(threshold|guard)\b/gi, category: 'grow-engine', label: 'drift threshold', tier: 'block' },
  { regex: /\bPII\s+hard\s+block\b/gi, category: 'grow-engine', label: 'PII hard block', tier: 'block' },
  { regex: /\bLayer\s+1\s+immutable\s+lock\b/gi, category: 'grow-engine', label: 'L1 immutable lock', tier: 'block' },
  { regex: /\b(OPEN|CONTROLLED|LOCKED|FROZEN)\s+—\s+(I\s+can|you\s+can|my\s+evolution|your\s+evolution|my\s+soul|your\s+soul)/g, category: 'grow-state', label: 'GROW state literal', tier: 'block' },

  // ── Engines (each a patent claim component) ──
  { regex: /\bcuriosity\s+engine\b/gi, category: 'curiosity-engine', label: 'curiosity engine', tier: 'block' },
  { regex: /\bfour[\s-]tier\s+source\s+trust\b/gi, category: 'curiosity-engine', label: 'four-tier source trust', tier: 'block' },
  { regex: /\bdual\s+corroboration\b/gi, category: 'curiosity-engine', label: 'dual corroboration', tier: 'block' },
  { regex: /\bself[\s-]awareness\s+engine\b/gi, category: 'self-awareness-engine', label: 'self-awareness engine', tier: 'block' },
  { regex: /\bsoul[\s-]anchor(ed)?\s+(memory|persistence|mechanism|engine|reinjection)\b/gi, category: 'soul-engine', label: 'soul-anchor', tier: 'block' },
  { regex: /\bdrift\s+(detector|detection\s+engine)\b/gi, category: 'drift-engine', label: 'drift detector', tier: 'block' },
  { regex: /\bbirth\s+(conversation\s+)?engine\b/gi, category: 'birth-engine', label: 'birth engine', tier: 'block' },
  { regex: /\bmemory\s+(distillation\s+pipeline|engine\s+internals?)\b/gi, category: 'memory-engine', label: 'memory engine', tier: 'block' },
  { regex: /\bsoul\s+(state|lock|updates?|proposals?)\b/gi, category: 'soul-mechanic', label: 'soul X', tier: 'block' },
  { regex: /\bevolution\s+(proposals?|guard)\b/gi, category: 'evolution-mechanic', label: 'evolution X', tier: 'block' },

  // ── Multi-archetype framework (patent claims 13, 20) ──
  { regex: /\bmulti[\s-](role|archetype)\s+(identity\s+)?framework\b/gi, category: 'identity-framework', label: 'multi-X framework', tier: 'block' },
  { regex: /\bstructured\s+identity\s+framework\b/gi, category: 'identity-framework', label: 'structured identity framework', tier: 'block' },
  { regex: /\brawIdentity\b/g, category: 'identity-framework', label: 'rawIdentity (camelCase)', tier: 'block' },

  // ── Scope architecture (patent claim 19) ──
  { regex: /\bscope[\s-]isolat(ed|ion)\s+(conversation|architecture|mechanism)/gi, category: 'scope-arch', label: 'scope-isolated arch', tier: 'block' },
  { regex: /\bscopeId\b|\bscopeType\b/g, category: 'scope-arch', label: 'scope ID/type (camelCase)', tier: 'block' },
  { regex: /\bfour\s+scope\s+types?\b/gi, category: 'scope-arch', label: 'four scope types', tier: 'block' },

  // ── Memory architecture (new claim pending) ──
  { regex: /\btwo[\s-]layer\s+memory\s+(architecture|system|model)\b/gi, category: 'memory-arch', label: 'two-layer memory arch', tier: 'block' },
  { regex: /\boperator_memory\b|\boperator_main_memory\b/g, category: 'memory-arch', label: 'memory tables', tier: 'block' },
  { regex: /\bfive\s+memory\s+types?\b/gi, category: 'memory-arch', label: 'five memory types', tier: 'block' },
  { regex: /\b(endpoint|main)\s+memory\s+(layer|store|tier)\b/gi, category: 'memory-arch', label: 'endpoint/main memory', tier: 'block' },

  // ── Knowledge architecture ──
  { regex: /\bOwner[\s-]Curated\s+Knowledge\b/g, category: 'knowledge-arch', label: 'Owner-Curated Knowledge', tier: 'block' },
  { regex: /\bOperator\s+Knowledge\s+(layer|store|tier|base)\b/g, category: 'knowledge-arch', label: 'Operator Knowledge tier', tier: 'block' },
  { regex: /\bPlatform\s+Knowledge\b/g, category: 'knowledge-arch', label: 'Platform Knowledge tier', tier: 'block' },
  { regex: /\bplatform[\s-]kb\b/gi, category: 'knowledge-arch', label: 'platform-kb', tier: 'block' },
  { regex: /\bowner[\s-]kb\b|\boperator[\s-]kb\b/gi, category: 'knowledge-arch', label: 'owner-kb/operator-kb', tier: 'block' },
  { regex: /\b_agency[\s-]core\b|\b_platform[\s-]kb\b/g, category: 'knowledge-arch', label: 'kb source names', tier: 'block' },
  { regex: /\bfour\s+distinct\s+knowledge\s+stores?\b/gi, category: 'knowledge-arch', label: 'four knowledge stores', tier: 'block' },

  // ── DNA architecture ──
  { regex: /\brag_dna\b/g, category: 'dna-arch', label: 'rag_dna', tier: 'block' },
  { regex: /\bDNA\s+(layer|library|table|engine|pipeline|injection)\b/g, category: 'dna-arch', label: 'DNA mechanism', tier: 'block' },
  { regex: /\b(Builder|Archetype|Collective)\s+layer\b/g, category: 'dna-arch', label: 'DNA layer (Builder/Archetype/Collective)', tier: 'block' },
  { regex: /\bdna_scope\b|\barchetype_scope\b/g, category: 'dna-arch', label: 'DNA scope fields', tier: 'block' },

  // ── Vector mechanics (only when in self-internals context) ──
  { regex: /\bcosine\s+(similarity|distance)\s+(of\s+0\.\d|threshold|ranking)\b/gi, category: 'vector-mechanic', label: 'cosine internals', tier: 'block' },
  { regex: /\bpgvector\b/gi, category: 'vector-mechanic', label: 'pgvector', tier: 'block' },

  // ── Vael as platform intelligence ──
  { regex: /\bVAEL\s+(Intelligence\s+)?Desk\b/g, category: 'vael-platform', label: 'VAEL Desk', tier: 'block' },
  { regex: /\bDNA\s+(scope|scoping)\b/gi, category: 'vael-platform', label: 'DNA scoping', tier: 'block' },
  { regex: /\bpipeline\s+screener\b/gi, category: 'vael-platform', label: 'pipeline screener', tier: 'block' },

  // ── API surface internals ──
  { regex: /\/v1\/(chat|action)\b/g, category: 'api-internal', label: 'internal endpoints', tier: 'block' },
  { regex: /\bAPI\s+deployment\s+slots?\b/gi, category: 'api-internal', label: 'API slots', tier: 'block' },
  { regex: /\bdeployment\s+slot\s+keys?\b/gi, category: 'api-internal', label: 'deployment slot keys', tier: 'block' },
  { regex: /\bopsk_[a-zA-Z0-9]+/g, category: 'api-internal', label: 'OpSoul slot key prefix', tier: 'block' },

  // ── SRAG (separate patent) ──
  { regex: /\bSovereign\s+RAG(\s+Registry)?\b/gi, category: 'srag', label: 'Sovereign RAG', tier: 'block' },
  { regex: /\bSRAG\s+(architecture|pipeline|registry)\b/gi, category: 'srag', label: 'SRAG X', tier: 'block' },

  // ── Markdown-heading architectural framings ──
  // Catches Sonnet's go-to format for self-architecture descriptions:
  //   "## Foundation Layer: ..." / "## Training Layer: ..." / "## Knowledge Store: ..."
  // These headings almost never appear in legitimate domain conversation
  // but are the dominant shape Sonnet uses when freelancing architecture
  // descriptions of the operator. Matches markdown heading (## / ###)
  // followed by 1-3 word qualifier + Layer/Store/Tier/Component + colon.
  { regex: /^#{1,4}\s+(\w+\s+){0,3}(Layer|Store|Tier|Component)\s*:/gm, category: 'markdown-arch', label: 'markdown layer/store/tier heading', tier: 'block' },

  // Compound self-description phrases that signal architectural exposition.
  // Very specific patterns — low false-positive risk because these phrases
  // are genuinely only used when an AI is describing its own architecture.
  { regex: /\b(I|my)\s+(operate|work|exist|have|am\s+built|am\s+structured)\s+(on|with|across|using|in)\s+(multiple|three|four|five|distinct|several)\s+(knowledge|memory|distinct)?\s*(layers?|tiers?|stores?|components?)\b/gi, category: 'self-arch-phrase', label: 'self-architecture compound phrase', tier: 'block' },
  { regex: /\bmy\s+knowledge\s+(exists|lives|resides|operates)\s+in\s+(multiple|three|four|five|distinct|several|N)\s+(layers?|tiers?|stores?)\b/gi, category: 'self-arch-phrase', label: 'my knowledge in N layers', tier: 'block' },
  { regex: /\bI\s+have\s+(\w+\s+){0,2}(distinct|different|separate)\s+(knowledge|memory)\s+(layers?|tiers?|stores?|systems?)\b/gi, category: 'self-arch-phrase', label: 'I have N distinct knowledge X', tier: 'block' },
];

// ─── LOG-ONLY PATTERNS (monitor, do not block) ───────────────────────────
// Borderline patterns. Flagged for owner review. Owner promotes to BLOCK
// via code review when log data confirms they leak architecture in real
// conversations.
const LOG_ONLY: FirewallPattern[] = [
  // Generic AI vocabulary that COULD be platform-leak but COULD be legitimate
  // domain conversation (e.g., advisor explaining vector embeddings to a dev)
  { regex: /\bembedding\s+(vector|model|space|dimensions?)\b/gi, category: 'vector-generic', label: 'embedding term', tier: 'log_only' },
  { regex: /\bRetrieval[\s-]Augmented\s+Generation\b/gi, category: 'vector-generic', label: 'RAG fully spelled', tier: 'log_only' },
  { regex: /\bvector\s+(store|space)\b/gi, category: 'vector-generic', label: 'vector store/space', tier: 'log_only' },

  // Knowledge-store generic terms — could appear in self-description OR in
  // a legitimate explanation of how an external KB works
  { regex: /\bknowledge\s+(stores?|tiers?|layers?)\b/gi, category: 'knowledge-generic', label: 'knowledge stores/tiers/layers', tier: 'log_only' },

  // Memory generic terms — operator might legitimately reference memory in
  // domain context
  { regex: /\bmemory\s+(tiers?|layers?|store)\b/gi, category: 'memory-generic', label: 'memory tiers/layers/store', tier: 'log_only' },
];

const ALL_PATTERNS: FirewallPattern[] = [...HIGH_CONFIDENCE, ...LOG_ONLY];

/**
 * Scan text for all firewall patterns. Returns triggers found (both block
 * and log-only). Does not modify text.
 */
export function checkFirewall(text: string): FirewallTrigger[] {
  if (!text) return [];
  const triggers: FirewallTrigger[] = [];
  for (const p of ALL_PATTERNS) {
    let match: RegExpExecArray | null;
    p.regex.lastIndex = 0;
    while ((match = p.regex.exec(text)) !== null) {
      triggers.push({
        category: p.category,
        label: p.label,
        matched: match[0],
        position: match.index,
        tier: p.tier,
      });
      // Avoid infinite loop on zero-length matches
      if (match.index === p.regex.lastIndex) p.regex.lastIndex++;
    }
  }
  return triggers;
}

/**
 * Apply firewall to a response. Returns the response text (substituted if
 * any BLOCK pattern triggered, original otherwise) plus the trigger record.
 *
 * Caller is responsible for logging the result — typically:
 *   const result = applyFirewall(response);
 *   if (result.triggers.length > 0) {
 *     console.warn('[firewall]', JSON.stringify({
 *       operatorId, scopeId, conversationId,
 *       blocked: result.blocked,
 *       triggers: result.triggers,
 *     }));
 *   }
 */
export function applyFirewall(text: string): FirewallResult {
  const triggers = checkFirewall(text);
  const blockTriggers = triggers.filter((t) => t.tier === 'block');
  const blocked = blockTriggers.length > 0;
  return {
    text: blocked ? FIREWALL_SUBSTITUTE_REPLY : text,
    triggered: blockTriggers.length > 0,
    blocked,
    triggers,
  };
}

// ─── INPUT FIREWALL ──────────────────────────────────────────────────────
// Some questions almost guarantee an architecture-leak response: the user
// is directly asking the operator to describe its own internals. The
// safest intervention is to substitute the reply BEFORE the LLM is even
// called — saves an LLM call, eliminates the leak risk, and gives a
// consistent natural reply.
//
// Patterns target the SHAPE of the question (asking the operator about
// its own architecture / structure / internals / how it works), not just
// any mention of "architecture". Designed to avoid blocking legitimate
// domain questions ("how does soil architecture work?", "what is the
// structure of date palm fronds?", etc.).

const ARCHITECTURE_QUESTION_PATTERNS: RegExp[] = [
  // "describe your [internal] architecture/structure/system/design/internals"
  /\b(describe|tell\s+me\s+about|explain|what(?:'s|\s+is)|how)\s+(your|are\s+you|do\s+you)\s*(internal|inner)?\s*(architecture|structure|design|build|system|systems|knowledge\s+(architecture|stores?|layers?|tiers?|system)|memory\s+(architecture|stores?|layers?|tiers?|system)|internals?)\b/gi,
  // "how are you built/structured/designed/organized"
  /\bhow\s+(are\s+you|were\s+you|do\s+you\s+get)\s+(built|structured|designed|organized|made|put\s+together)\b/gi,
  // "what are your layers/stores/tiers/components"
  /\bwhat\s+(are\s+)?your\s+(layers?|tiers?|stores?|components?|engines?)\b/gi,
  // "how do you work internally / under the hood"
  /\bhow\s+do\s+you\s+work\s+(internally|inside|under\s+the\s+hood)\b/gi,
  // "what's in your knowledge base/memory"
  // (this could be legitimate but in self-description context the answer
  // tends to leak architecture; allow log-only via output firewall)
  // skipped — too risky for input block
  // "tell me about how you store/organize knowledge/memory"
  /\b(tell\s+me\s+about\s+)?how\s+(do\s+)?you\s+(store|organize|structure|maintain)\s+(your\s+)?(knowledge|memory|information)\b/gi,
];

export function isArchitectureQuestion(message: string): boolean {
  if (!message) return false;
  for (const p of ARCHITECTURE_QUESTION_PATTERNS) {
    p.lastIndex = 0;
    if (p.test(message)) return true;
  }
  return false;
}
