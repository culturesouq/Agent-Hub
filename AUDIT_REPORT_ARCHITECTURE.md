# OpSoul Architecture Audit — 2026-05-31

Scope: live code on `main` (commit `e35e265`) vs. SoT (3334 lines, last modified today) vs. RED patent spec (46 claims, FINAL EN draft 2026-05-30). Reviewer: backend + lib + scripts only — UI handled separately.

---

## 1. Executive Summary

Top 5 cleanup priorities, ranked by patent-protection risk:

1. **Layer 1 lock is bypassable via the PATCH `/api/operators/:id` route** — `operators.ts:372-396` writes `name / rawIdentity / archetype / roles / mandate / coreValues / ethicalBoundaries` straight to the DB through `UpdateOperatorLayer1Schema` **with zero check on `layer1LockedAt`**. GROW respects the lock, the birth flow respects the lock, this admin update route does not. This is the single biggest patent-protection hole — Claim 2(a)(ii), Claim 16, and Claim 22 all depend on a structural lock that admin-tier code can route around today.

2. **Architecture Firewall (Claim 5) does not exist** — input firewall, output firewall (streaming + sync), KB retrieval source-name filter, and pattern-substitution logic are all absent. The commit history shows it was built then removed (commit `b890bb4` "no-fallbacks: remove all platform-authored substitution paths"). The decision was deliberate and is documented in `[[no-fallbacks]]`. **However, Claim 5 is currently in the FINAL claim set as a system claim with 4 enforcement surfaces.** Either Claim 5 must come out of the filing or the firewall must come back in a no-fallback-compatible form. As filed, Claim 5 is unsupported by the implementation.

3. **`public-chat.ts`, `telegram-webhook.ts`, `whatsapp-webhook.ts` have NO tool wiring** — they all call `agent.executeStreaming` / `executeSync` with `{ model }` only and never pass `tools`. Every operator deployed via a slot, Telegram, or WhatsApp is silently capability-limited to text generation. No `web_search`, no `kb_seed`, no `http_request`, no integration tools, no `get_self_info`. This means slots/channels can never use the 50+ universal tools in `toolRegistry.ts`. Patent Claims 4, 9, 31, 36 describe the universal tool substrate applying to "every inbound request"; today it applies only to the owner-Hub chat path.

4. **Two `[[no-fallbacks]]` violations in `public-chat.ts`** — lines 402 and 417 substitute the literal strings `"AI service temporarily unavailable. Please try again shortly."` and `"Stream failed. Please try again."` for the operator's voice when the upstream LLM 402s or the stream errors. Operator never sees the failure; user never sees the real error. Direct violation of Claim 13 ("no fallback content is substituted for the language-model substrate's response in any failure mode").

5. **Two-Layer Memory — Claim 25's soul-anchor decay exemption is not implemented** — `decayMemoriesForOperator` (`memoryEngine.ts:337-387`) decays every Layer 1 row at 5%/day with no `soul_anchored` boolean check. Neither `operator_memory` nor `operator_main_memory` carry a `soul_anchored` column. SoT § C3 already flagged this. As-claimed, Claim 25 is not in code.

---

## 2. Patent-Code Drift Table

Status legend: **FULL** = implemented as claimed · **PARTIAL** = implemented for a subset of paths · **TRUNCATED** = implementation present but missing claimed elements · **STUB** = scaffolding without behaviour · **MISSING** = no implementation · **BUG-RISK** = present but defective

| Claim | Subject | Status | Notes |
|---|---|---|---|
| 1 | Substrate-agnostic operator composition (method) | **PARTIAL** | All elements (a)-(h) present in code, but step (h) action-scope synthetic distillation only fires on `public-crud.ts` path (`distillActionTaskPattern`) — not on `chat.ts` owner-action shortcuts |
| 2 | 5-layer identity + scope-isolated substrate (system) | **TRUNCATED** | Layer 0/1/2/4 fully composed in `systemPrompt.ts`. **Layer 3 (self-awareness) was stripped from the prompt 2026-05-14** (`systemPrompt.ts:534-544` — `void selfAwareness`). The patent now describes Layer 3 as "composed at assembly time from a persisted self-model held outside the language-model substrate" + obtained via tool — which IS now how it works (`get_self_info` tool exists). Claim 2(a)(iv) language matches the new design. But the 5-layer composition into the prompt is now structurally 4-layer with self-awareness exposed only on tool call. Worth confirming with attorney that the claim language ratifies this |
| 3 | Two-layer memory + PII firewall + action distillation | **PARTIAL** | Layer 1 (`operator_memory`) + Layer 2 (`operator_main_memory`) both present, PII firewall in `growGuards.ts` PII regex + distillation prompt is absolute-PII-prohibited. Action synthetic distillation in `distillActionTaskPattern` (`memoryEngine.ts:627`) does write schema-shape keys with values discarded. **Claim 25 soul-anchor decay exemption: MISSING** — no `soul_anchored` column anywhere. **Claim 27 ≥0.85 cosine dedup: FULL** at `memoryEngine.ts:300`. **Claim 30 platform-promotion ≥0.85: FULL** at `memoryEngine.ts:314-316` |
| 4 | Operator-as-driver + curiosity engine + no-post-LLM-filter | **FULL** | OperatorAgent class wraps every LLM call. `curiosityEngine.ts` does dual-corroboration via Tier 1/2 (≥2 sources) + LLM eval. Post-LLM filter genuinely absent (and intentional per `[[no-fallbacks]]`) |
| 5 | Architecture firewall + architecture-as-secret enforcement | **MISSING** | Input firewall, output firewall (streaming + sync), KB source-name pattern filter, prompt-section-label discipline, and content-removal-not-filter discipline are ALL absent. Only element (d)(content removal) and (e)(no labelled headers) survive in the prompt-assembly code |
| 6 | Multi-substrate observable invariance | **PARTIAL** | `modelRegistry.ts` carries Kimi K2.5, DeepSeek V3, Sonnet 4.6, GPT-5, Hajeri 3B v2, Gemini per SoT § E7. Empirical invariance test is owed (SoT § C2) |
| 7 | Both Layer 1 + Layer 2 distilled from same turn | **FULL** | `distillMemoriesFromConversations` runs both prompts in parallel from same transcript (`memoryEngine.ts:520-523`) |
| 8 | Scope Context paragraph addressed in second person | **FULL** | `buildScopeContext` (`scopeResolver.ts:227-310`) does exactly this, no architectural vocabulary, second-person prose |
| 9 | Universal single-dispatch tool function with typed outcomes | **FULL** | `dispatchTool` in `toolHandlers.ts:1421+`, returns `{ content, meta? }` with `terminateLoop` for typed-error signalling |
| 10 | Input architecture-introspection firewall | **MISSING** | No pattern matching before LLM call. `OperatorAgent.analyse` only routes between `chat` and `execute`, never substitutes |
| 11 | Output architecture-leak firewall | **MISSING** | Stream and sync paths pass LLM output through unchanged |
| 12 | Action-scope synthetic distillation | **FULL** | `distillActionTaskPattern` discards payload values, keeps keys only |
| 13 | No fallback content on failure | **PARTIAL** | `chat.ts` honours the rule (502 with real error). `public-chat.ts:401-405, 415-421` ships synthetic strings — VIOLATION |
| 14 | 9 canonical archetypes | **FULL** | `BIRTH_ARCHETYPES` in `chat.ts:216` + `VALID_ARCHETYPES` in `operators.ts:67` both ship exactly the 9 |
| 15 | 188 roles across 7+ domain clusters | **FULL** | `BIRTH_ROLES` in `chat.ts:218-265` + `VALID_ROLES` in `operators.ts:69-116`. **Count audit:** ~187-189 depending on commas; SoT claims 188, code reads ≥185 — minor list audit recommended before filing |
| 16 | Layer 1 server-side structural lock | **BUG-RISK** | GROW enforces. Birth flow enforces (`lockLayer1IfUnlocked`). **PATCH `/api/operators/:id` does NOT enforce** (`operators.ts:372-396`). Single biggest hole |
| 17 | GROW governed learning substrate with ≥4 guards | **FULL** | Guard 1 (PII), 1b (Layer 1 sieve), 2 (semantic 13-pattern), 4 (cumulative drift) all hard-block. `growGuards.ts` has the 13 patterns at `IDENTITY_MANIPULATION_PATTERNS:162-215` |
| 18 | Scope Context composer at fixed prompt position | **FULL** | Prepended in `assembleOperatorPrompt` (`systemPrompt.ts:431-435`) before Layer 0 |
| 19 | Self-awareness via tool, not ambient injection | **FULL** | `selfAwareness` is now `void selfAwareness;` (`systemPrompt.ts:544`) — explicitly not in prompt. `get_self_info` tool wired at `toolHandlers.ts:841` |
| 20 | Secondary roles activation | **PARTIAL** | Roles array supported in schema + birth, but no "secondary role activation gating" path beyond initial extraction. `operator.roles` is set once at birth via extraction prompt; no runtime activation gate |
| 21 | Retry protocol with bounded exponential backoff | **PARTIAL** | GROW retry has `MAX_RETRY_ATTEMPTS=3` + `RETRY_DELAY_HOURS=[1,2,4]` (`growEngine.ts:29-30`). Chat retry: openrouter wrapper has its own retry policy; check `openrouter.ts` for exhaustion → typed-error mapping |
| 22 | Birth protocol as sole operator-creation pathway | **PARTIAL** | `ownerOperatorsSeed.ts` is empty (`OWNER_OPERATORS: [] // Operators are created through birth, not seeded`). However, `routes/operators.ts` POST `/` shortcut may exist — needs verification |
| 23 | Concurrent operators, independent locks, no shared identity | **FULL** | Per-operator rows in `operators`, per-operator scoping on every query |
| 24 | Absolute-PII section in distillation prompt | **FULL** | `buildLayer2DistillPrompt` in `memoryEngine.ts:439` opens with `## ABSOLUTE RULE — ZERO PII` and enumerates names/locations/identifiers/electronic identifiers/relationship references |
| 25 | Soul-anchor decay exemption | **MISSING** | No `soul_anchored` column anywhere; `decayMemoriesForOperator` decays every row uniformly |
| 26 | Layer 2 cross-scope for GROW only, scope-bound at chat | **FULL** | `searchLayer2Memory` is scope-bound (`memoryEngine.ts:104-160`); `getMainMemoryContext` in `growEngine.ts:48` is unscoped — exactly the claimed asymmetry |
| 27 | Cosine ≥0.85 dedup before Layer 2 insert | **FULL** | `memoryEngine.ts:300` |
| 28 | Action-scope memory eligible for promotion | **FULL** | `distillActionTaskPattern` writes `sourceScope='action'` via `storeMainMemory` which sets `growEligible` + `platformCandidate` on confidence threshold |
| 29 | Layer 1 carries scope-trust value | **FULL** | `operator_memory.scope_trust` column; written via `storeMemory(... scopeTrust)` |
| 30 | Platform-promotion confidence ≥0.85 | **FULL** | `memoryEngine.ts:314-316` `isPlatformCandidate = confidence >= 0.85 && type in [fact, pattern, context]` |
| 31 | Single-registry typed-result tool dispatch | **FULL** | `dispatchTool` returns `{content, meta?: {terminateLoop}}` — two-outcome only |
| 32 | Tiered source-trust ≥5 tiers with dual corroboration | **PARTIAL** | `curiosityEngine.ts:11` defines tiers 1-3 + null. **Patent claims at least 5 tiers; code has 3-4 (1 / 2 / 3 / null)**. Dual corroboration enforced (`evaluation.corroborated && evaluation.trusted`) |
| 33 | Typed-error pass-through on tool failure | **FULL** | `dispatchResult.meta?.terminateLoop` short-circuits and the LLM sees plain content; operator response in own voice |
| 34 | Model registry outside substrate | **FULL** | `modelRegistry.ts` with per-model availability, capability, cost |
| 35 | Register/identity/tone matching is operator's responsibility | **PARTIAL** | Language detection only (`hasArabic` regex at `chat.ts:579`). Identity & tone responsibility lives implicitly in Layer 1 + Layer 2 prose; no explicit "operator matches register" code path |
| 36 | Self-information tool available | **FULL** | `get_self_info` registered |
| 37 | Input + output firewall pattern sets, separately maintained, logged | **MISSING** | See Claim 5 |
| 38 | Output firewall identifier set | **MISSING** | See Claim 5 |
| 39 | KB/skill = world-knowledge, not behavioural instruction | **FULL** | Discipline enforced socially per `[[knowledge-not-instructions]]`; no automated checker, but content audit comments in `growGuards.ts` + SoT § E1 confirm discipline |
| 40 | LLM has no visibility into prompt section structure or excluded KB | **FULL** | No section headers (`systemPrompt.ts` builds pure prose); KB retrieval filtered |
| 41 | Architecture content removed not filtered | **FULL** | Per SoT § D row "14 architecture-describing platform-KB entries" + commit `b869255` |
| 42 | Streaming + sync firewall | **MISSING** | See Claim 5 |
| 43 | Stateless server runtime + per-request prompt assembly | **FULL** | Every chat assembles prompt fresh from DB; no per-LLM session state |
| 44 | Identity-preservation triple | **PARTIAL** | Layer 1 lock = BUG-RISK (see Claim 16). GROW guards = FULL. Architecture-as-secret enforcement = MISSING (no firewall). 2 of 3 mechanisms intact |
| 45 | Fresh prompt every request, no substrate state across requests | **FULL** | OpenRouter is stateless; no client carries state |
| 46 | Capability external to weights | **FULL** | Inventor's Hajeri work cited in SoT § E7 |

---

## 3. Architecture Flow Diagram (actual, not designed)

```
                           ┌──────────────────────────────┐
                           │  Inbound request              │
                           │  (chat.ts | public-chat.ts |  │
                           │   public-crud.ts | webhook)   │
                           └─────────────┬─────────────────┘
                                         │
                                         ▼
                        ┌────────────────────────────────────┐
                        │  requireAuth / requireSlotKey       │
                        │  (middleware)                       │
                        └────────────────┬───────────────────┘
                                         │
                                         ▼
                        ┌────────────────────────────────────┐
                        │  buildOwnerScope(ownerId)           │
                        │   OR validateScope(scopeId)         │
                        │   OR buildSlotScope(slot...)        │
                        │   OR buildChannelScope(...)         │
                        │   → ValidatedScope                  │
                        └────────────────┬───────────────────┘
                                         │
                                         ▼
                        ┌────────────────────────────────────┐
                        │  DB FETCH (parallel):               │
                        │   operator row, skills,             │
                        │   archetype-default skills,         │
                        │   self_awareness_state,             │
                        │   message history (cap 40 msgs /    │
                        │     60k tokens),                    │
                        │   live secrets, live integrations   │
                        └────────────────┬───────────────────┘
                                         │
                                         ▼
                        ┌────────────────────────────────────┐
                        │  KB + Memory search (parallel):     │
                        │   embed(message) →                  │
                        │     searchBothKbs (owner + op KB,   │
                        │       conf ≥75, top N=8),           │
                        │     searchMemory (L1 + L2,          │
                        │       scope-bound, top 8, sim ≥0.55)│
                        └────────────────┬───────────────────┘
                                         │
                                         ▼
                        ┌────────────────────────────────────┐
                        │  ┌──── OperatorAgent.analyse() ──┐ │
                        │  │ heuristic regex: chat/execute │ │
                        │  │ birth-mode → execute          │ │
                        │  └─────────────┬─────────────────┘ │
                        └────────────────┼───────────────────┘
                                         │
                                         ▼
                        ┌────────────────────────────────────┐
                        │  Prompt assembly:                   │
                        │   [scopeLine]                       │
                        │   [soulAnchor? L0+L1 reinject]      │
                        │   [sycophancyWarning?]              │
                        │   [languageInstruction?]            │
                        │   LAYER 0 (4 blocks: core,          │
                        │     behavior, growth, curiosity)    │
                        │   archetype foundations (1-N from   │
                        │     ARCHETYPE_FOUNDATIONS)          │
                        │   rawIdentity (Layer 1)             │
                        │   Roles / Mandate / Core Values     │
                        │     / Ethical Boundaries (Layer 1)  │
                        │   backstory / personality / tone /  │
                        │     style / emotion / decision /    │
                        │     conflict / quirks / values      │
                        │     manifestation (Layer 2)         │
                        │   LAYER 4 (operational rules)       │
                        │   --- (no section labels) ---       │
                        │   + KB context (woven)              │
                        │   + memory hits (woven)             │
                        │   + optional time prefix (keyword-  │
                        │     triggered)                      │
                        └────────────────┬───────────────────┘
                                         │
                                         ▼
                  ┌────────────────────────────────────────┐
                  │  Save user message + lockLayer1IfUnlocked │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │  Tool catalog: listToolsForContext(ctx)   │
                  │   only if decision.kind === 'execute'     │
                  │   AND ROUTE IS chat.ts                    │
                  │   (public-chat / channels / public-crud   │
                  │    skip this entirely)                    │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │  AGENT LOOP (chat.ts streaming path):     │
                  │   for iter in 0..MAX_ITER=8:              │
                  │     stream → if toolCall: dispatchTool    │
                  │       → push tool result back as system   │
                  │       → continue                          │
                  │     else: finalContent = iterContent, end │
                  │   per-iter cap on web_search (MAX=5)      │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │  Skill detection (after tool loop):       │
                  │    detectSkillTrigger(msg, skills, reply) │
                  │    → executeSkill → second executeSync    │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │  Save assistant message + commit          │
                  │  Stream done event                        │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │  Post-response (fire-and-forget):         │
                  │   [LEARN:] tag → verifyAndStore (KB)      │
                  │   birth-extraction if isBirthMode + ≥2 msg│
                  │   triggerSelfAwareness                    │
                  │   distillMemoriesFromConversations every  │
                  │     10 messages (L1 + L2 parallel)        │
                  └────────────────────────────────────────────┘
```

Breaks / patches / shortcuts on the actual path:

- **Tool gate is `chat.ts`-only.** public-chat, telegram-webhook, whatsapp-webhook, and public-crud do NOT pass `tools` to executeSync/executeStreaming. Slot/channel operators are tool-less.
- **No input or output firewall step.** LLM output streams directly to client.
- **Layer 3 (self-awareness) is computed and persisted but not injected.** Available only via `get_self_info` tool invocation.
- **Language matching is regex-Arabic-only.** Other non-English languages get no nudge.
- **Time injection is hybrid keyword-detect + tool.** Documented; not a defect.
- **History cap is fresh patch** (commit `d52b338` 2026-05-24, 40 msg / 60k tokens) — was unbounded, caused Nahil 265k blowout.
- **Owner-scope `scopeId` still uses `authenticated:` prefix** for backward compatibility (`scopeResolver.ts:127-145`). `scopeType='owner'` is correct, but raw DB scopeId reads `authenticated:<ownerId>`. Minor cosmetic-vs-semantic split.

---

## 4. MCP Status

`feat/mcp-runtime-layer` work was merged. Current state on `main`:

- `@modelcontextprotocol/sdk` is a real production dependency (used in `mcpServer.ts`).
- `toolRegistry.ts` (1158 lines) is the single source of truth for all 50+ tools.
- `mcpServer.ts` (138 lines) wraps the registry as an MCP `Server` with `tools/list` + `tools/call` handlers; both go through `dispatchTool` (same path as internal chat).
- `routes/mcp.ts` (147 lines) mounts at `/api/operators/:operatorId/conversations/:convId/mcp`, requires auth, builds per-request `ToolHandlerContext`, instantiates `StreamableHTTPServerTransport` in stateless mode. Real wiring — not stub.
- `mcpSmoke.ts` script exists in `scripts/`.
- Inside `chat.ts` (1188 lines), the tool dispatch uses `dispatchTool` directly (no MCP protocol overhead). This matches `mcpServer.ts`'s docstring comment: "chat.ts calls dispatchTool() directly (no protocol overhead); external callers go through this MCP server."

**Verdict:** MCP is real, wired, and shipped. The `[[opsoul-mcp-buildout]]` memory ("paused before chat.ts refactor") is outdated — chat.ts has been refactored to use `dispatchTool` and `listToolsForContext` from the universal registry. The refactor was completed; the memory needs updating.

**Caveats:**
- MCP endpoint is owner-scope-only. The handler context hard-codes `scopeType: 'owner'` (`mcp.ts:95`). External MCP clients cannot operate against public, authenticated, action, or channel scopes today.
- Per-request server + transport (stateless). Long-lived sessions (e.g. WebSocket-based MCP) are not supported. SoT § C / F lists this as future work.

---

## 5. Per-Operator Status

Operator inventory cannot be enumerated from code alone — operators are DB rows. `ownerOperatorsSeed.ts` is empty by design (operators are born, not seeded). Per `[[opsoul-operators]]` memory, the production operators are Istishari, Nahil, Bani, Vael, plus a 4th-TBD. Per-operator state must be read from the live DB; this audit assesses what each operator gets *as a function of the platform's code*.

| Operator | Layers 0–4 | KB | Memory L1 | Memory L2 | Tools | Notes |
|---|---|---|---|---|---|---|
| Istishari (Foundermoment.ai, owner-Hub + slot deploy) | 0-2-4 in prompt; L3 via tool; L1 via prompt | ✓ if seeded | ✓ scoped | ✓ via distill | **✓ ONLY in owner-Hub chat.ts; ✗ in slot deploys** | Slot deployments use `public-chat.ts` — no tools, no skill detection |
| Nahil (nahilai.com, channel + action deploys) | same as Istishari | ✓ | ✓ scoped per channel/user | ✓ | **✗ on Telegram, ✗ on WhatsApp, ✗ on /v1/action** | Webhooks call executeSync with `{ model }` only; action-API skill detection runs BEFORE LLM but no universal tools |
| Bani (the builder) | same | ✓ | ✓ | ✓ | ✓ in Hub; ✗ in deploys | same pattern |
| Vael (per `[[opsoul-operators]]` — alive, rag_sources empty) | same | empty (per memory) | ✓ | ✓ | ✓ in Hub | KB empty per current memory note |
| 4th TBD | n/a | n/a | n/a | n/a | n/a | not yet birthed |

**Drift notes:**
- Every operator suffers the same architecture-level truncation: tool capability is one-tier (owner Hub only).
- Layer 3 self-awareness state IS persisted in `self_awareness_state` table and recomputed on `triggerSelfAwareness` calls, but operators only see it on `get_self_info` invocation. This matches the patent's "obtained through an explicit tool invocation against said persisted self-model" language (Claim 19) — by design, not drift.

---

## 6. TODO / FIXME / HACK Inventory

`grep` for TODO / FIXME / HACK / XXX across `artifacts/opsoul-api/src/`, `lib/`, `scripts/`: **zero matches**.

Codebase is unusually clean of explicit markers. Real cleanup debt is documented in two places only:

- This audit (architectural drift)
- `SOURCE_OF_TRUTH.md` § B (B1-B4) + § C (C1-C5)

Patches / hardcoded shortcuts found by reading rather than grep:

| Location | What | Patent claim affected |
|---|---|---|
| `routes/operators.ts:372-396` (PATCH `/:id`) | Layer 1 fields updateable post-lock | **Claim 2, 16, 22, 44** |
| `routes/public-chat.ts:402, 417` | Synthetic "AI service temporarily unavailable" string | **Claim 13** |
| `routes/public-chat.ts:361, public-crud.ts:264, telegram-webhook.ts:264, whatsapp-webhook.ts:328` | `executeStreaming/Sync` called without `tools` | **Claim 4(b), 9, 31, 36** |
| `utils/memoryEngine.ts:337-387` | Decay applies uniformly; no `soul_anchored` exemption | **Claim 25** |
| `utils/curiosityEngine.ts:11-15` | 3 tiers + null (4 total) | **Claim 32 (claims ≥5)** |
| `routes/public-chat.ts:80-93` (sandbox-guard) | Sandbox userId prefix is allowlist on env var only | not patent — but flagged: SANDBOX_OPERATOR_ID env reliance is operationally fragile |
| `routes/chat.ts:632-634` | Hardcoded comment refers to "single-model strategy"; `opsoul/auto` sentinel resolves to CHAT_MODEL | not patent — but couples runtime to one provider |
| `utils/kbIntake.ts:42, 52, 75, 90, 190` | `catch { /* non-critical */ }` — fail-open on LLM exception | per SoT § B1 — can let PII or ephemeral content into KB |
| `utils/growEngine.ts:482-498` | `needs_owner_review` notification is log-only | per SoT § B2 — owner blind to GROW review queue |
| `growEngine.ts:252-264` (FROZEN/LOCKED return early) + 4-level scheme | Should be 3 levels per inventor directive | per SoT § B3 |
| `routes/operators.ts:215-220` (`is_system` column added in setupDatabase) | Schema column ensured outside drizzle migration | not patent — but DDL-via-setup is a maintenance smell |
| `routes/conversations.ts` (not audited fully) | Scope filter previously broken — fixed 2026-05-13 commit `c3...` per SoT | regression-prone area |

---

## 7. Recommended Cleanup Order

### Tier 1 — fix before any commercial deployment (patent-critical)

1. **Add `layer1LockedAt` check to PATCH `/api/operators/:id`** (`routes/operators.ts:372`). Refuse Layer 1 fields once locked, or restrict the route to never accept Layer 1 fields and create a separate admin-only `unlock-layer1` flow that requires a 2-factor confirmation. Without this, Claim 16 is unprovable.

2. **Decide Claim 5's fate.** Either:
   - (a) Bring back the architecture firewall in a no-fallback-compatible form (input-side: refuse with typed-error and let the operator answer in its own voice when it sees the typed-error; output-side: same). This is a non-trivial reconciliation.
   - (b) Withdraw Claim 5 from the filing and remove all "architecture-as-secret" enforcement language from claim-supporting prose. The 14 architecture-describing KB entries removal (commit `b869255`) and the no-section-labels prompt-assembly discipline still support Claim 41 + Claim 40 — but the FOUR enforcement surfaces of Claim 5 are not present.

3. **Wire tools into `public-chat.ts`, `public-crud.ts`, `telegram-webhook.ts`, `whatsapp-webhook.ts`.** Mirror `chat.ts:769-793` toolHandlerCtx + toolListCtx pattern. Each route also needs the agent loop (the simpler `for iter in MAX_ITER` block from `chat.ts:865-965`). Without this, Claims 4/9/31/36 hold for only one of the five deployment surfaces.

4. **Remove the two synthetic-string fallbacks from `public-chat.ts:402, 417`.** Return 502 with real error like `chat.ts:1183` does. Claim 13.

### Tier 2 — fix before filing (claim-alignment)

5. **Implement `soul_anchored` column + decay exemption.** Add boolean to both `operator_memory` and `operator_main_memory`. Decay sweep skips `WHERE soul_anchored IS TRUE`. Identity-critical memories are explicitly marked. Claim 25. Effort: half a day.

6. **Expand source-trust tiers from 3 → 5.** `curiosityEngine.ts:11` — add Tier 4 (named individual without corroboration), keep Tier 5 (anonymous / unverified, always rejected). Update `evaluateSources` prompt. Claim 32 explicit count requirement. Effort: 2 hours.

7. **Audit the 188-role count.** Compare `BIRTH_ROLES` in `chat.ts:218` against `VALID_ROLES` in `operators.ts:69` against the patent's stated 188. They appear close but not verified equal. Claim 15. Effort: 30 minutes.

8. **De-dup `BIRTH_ARCHETYPES` and `VALID_ARCHETYPES`** + `BIRTH_ROLES` and `VALID_ROLES` — both pairs are byte-for-byte duplicates across two files. Single source of truth in `lib/db/seed/` (per SoT comments). Effort: 1 hour.

### Tier 3 — safe to leave for next cycle

9. **GROW 3-level refactor** (SoT § B3, F2). Defer until first money-touching operator.
10. **OIN implementation** (`query_insights` tool + Vael verification cron + owner approval gate) — SoT § F1 + § C4 + § C5. Defer until cross-operator insight reads are needed.
11. **Voice as first-class scope** (SoT § C1). Defer.
12. **Empty `ownerOperatorsSeed.ts` can be deleted** (file is just an empty array + a comment). Cleanup-only.
13. **Update `[[opsoul-mcp-buildout]]` memory** — the chat.ts refactor it warns is paused has shipped.
14. **`scopeId` prefix migration** — owner-scope still uses `authenticated:` prefix. SoT documents this. Migration would touch every existing row. Defer until next major schema rev.
15. **Move per-startup DDL** (`ALTER TABLE operator_kb ADD COLUMN IF NOT EXISTS is_system` in `index.ts:215`) into a real drizzle migration. Cleanup.

---

## Appendix A — Files Audited (absolute paths)

- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/chat.ts` (1188 lines)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/public-chat.ts` (≥430 lines)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/public-crud.ts` (280 lines)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/mcp.ts` (147 lines)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/operators.ts` (≥640 lines)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/telegram-webhook.ts` (≥265 lines)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/whatsapp-webhook.ts` (≥330 lines)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/systemPrompt.ts` (553)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/scopeResolver.ts` (351)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/memoryEngine.ts` (678)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/growEngine.ts` (821)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/growGuards.ts` (244)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/curiosityEngine.ts` (185)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/mcpServer.ts` (138)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/toolRegistry.ts` (1158)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/toolHandlers.ts` (≥1430 lines)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/operatorAgent.ts` (101)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/selfAwarenessEngine.ts` (545)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/lockLayer1.ts` (18)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/kbIntake.ts` (≥231 lines)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/ownerOperatorsSeed.ts` (18 — empty seed)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/index.ts` (269)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/validation/operator.ts` (≥70 lines)
- `/Users/bstar/opsoul-audit/lib/db/src/schema/operators.ts`
- `/Users/bstar/opsoul-audit/lib/db/src/schema/memory.ts`
- `/Users/bstar/opsoul-audit/lib/db/src/schema/main_memory.ts`
- `/Users/bstar/opsoul-audit/lib/db/src/schema/operator_kb.ts`
- `/Users/bstar/opsoul-audit/lib/db/src/schema/operator_deployment_slots.ts`
- `/Users/bstar/opsoul-audit/lib/db/src/schema/conversations.ts`

## Appendix B — 0.3 Integer Bug — RESOLVED

The 0.3 integer bug from `[[opsoul-03-integer-bug]]` and SoT § "Open bug — Postgres rejects 0.3" **is fixed**. Commit `d52b338` (2026-05-24) found the culprit: two callers passing 0.3 (similarity-scale float) to `searchBothKbs(... minConfidence ...)` where the column is `integer`. Fixed in:

- `utils/toolHandlers.ts:785` — MCP `kb_search` tool: `0.3 → 30`
- `cron/tasksCron.ts:79` — scheduled-task KB retrieval: `0.3 → 30`

All other write paths to `operator_kb.confidence_score` use 75-85 integer scale (verified). The `[[opsoul-03-integer-bug]]` memory and SoT § "Open bug" section should be updated as resolved.

---

**End of audit report. Generated 2026-05-31 against `main` HEAD `e35e265`.**
