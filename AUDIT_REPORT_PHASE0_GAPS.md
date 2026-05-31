# OpSoul Phase 0 — Cross-Verification + Gap Audit

**Date:** 2026-05-31
**Auditor:** Phase 0 reviewer (independent cross-check of Agents A/B/C/D)
**Branch:** `main` (HEAD `e35e265`)
**Reference points used:** live code + SOURCE_OF_TRUTH.md (3334 lines) + RED patent spec (46 claims, final EN draft 2026-05-30) + 4 prior audit reports

---

## 1. Executive Summary

Phase 0 confirmed all of Agent A's critical findings and most of Agents B/C/D, but found **five issues prior audits missed** and **two cases where the prior verdicts were too harsh / too generous**.

**Biggest miss (NEW CRITICAL — not in any prior report):** Claim 14 conformance failure. The patent specifies 9 archetypes as *Sage, Mentor, Hero, Magician, Sovereign, Caregiver, Creator, Explorer, Healer*. The code's 9 archetypes are *Executor, Advisor, Expert, Connector, Creator, Guardian, Builder, Catalyst, Analyst*. Only "Creator" overlaps. Either the patent claim is wrong about which archetypes exist, or the code is — they cannot both be filed. Agent A graded this FULL after counting 9 entries; nobody checked the names against the claim text. This is the single most filing-fatal finding of the phase.

**Second-biggest miss (NEW HIGH):** Telegram + WhatsApp webhooks each substitute "Sorry, I encountered an error. Please try again." for the operator's voice on LLM failure (`telegram-webhook.ts:284`, `whatsapp-webhook.ts:348`) AND persist that string into the conversation history as `role: 'assistant'`. This is worse than the two `public-chat.ts` violations Agent A found — the fake voice becomes part of the operator's permanent memory.

**Third miss (NEW HIGH):** No retry policy in `openrouter.ts`. Claim 21 requires "a maximum retry count, an exponential backoff schedule, and a per-conversation-turn budget" for LLM invocations; chat.ts gets one shot per turn. GROW's own retry (3 attempts) is separate and operates on a different timescale.

**Fourth miss (MEDIUM):** Layer 2 PII firewall is LLM-trust only. `storeMainMemory` (`memoryEngine.ts:278-333`) has no regex backstop — if the distiller LLM produces PII despite the prompt, it writes unfiltered. Compare to GROW which has both LLM-side and regex-side enforcement.

**Fifth miss (MEDIUM):** `public-crud.ts:258` has no try/catch around `executeSync`. LLM failure → 500 crash, not an operator-voiced error. Also hardcodes `'moonshotai/kimi-k2.5'` as default model (couples runtime to one provider).

**Where prior audits were too harsh:** Agent A graded **Claim 5 as MISSING** for all four enforcement surfaces. In fact `vectorSearch.ts:70,98,101` implements 5(c) (KB retrieval source-name filter excluding `Platform Architecture — %`); 5(d) (content removal, commit `b869255`) and 5(e) (no labelled section headers in prompt) are also present. Only 5(a) input firewall and 5(b) output firewall are actually missing. Claim 5 is **PARTIAL**, not MISSING.

**Where prior audits were too generous:** Agent A graded **Claim 14 FULL** based on the 9-element count. The names are completely different from the patent's 9. Agent A also graded **Claim 32 PARTIAL on tier-count grounds** but understated — the type union `1|2|3|null` (line 11) shows only 3 actual tiers; the "5 tiers" in the comment header is aspirational. Tier 4 is an LLM-classifier label meaning "do not trust" (not a trust tier), and Tier 5 in the comment is a meta-rule (single-source rejection), not a tier value.

**Biggest contradiction:** Agent A says "MCP shipped, the `[[opsoul-mcp-buildout]]` memory is outdated" — that memory describes the integration as paused before chat.ts refactor. Cross-verification confirms Agent A is right: `mcpServer.ts:115` calls the same `dispatchTool()` used by `chat.ts`, and `routes/mcp.ts` mounts a stateless `StreamableHTTPServerTransport`. Memory needs an update note.

**Biggest untested assumption:** Agent D's Qwen swap assumes voice preservation isn't at stake because the swap is on `kbIntake.ts` only. True for that file, but no test gate is proposed to confirm Qwen 7B's `stable/ephemeral` classifier verdicts match Kimi's at the claimed ≥95% rate. Agent D mentions the 20-article verification gate but does not pre-commit pass/fail criteria.

**Recommended phasing adjustment:** the 4-phase plan stands, but Phase 1 must additionally include (a) the archetype-name reconciliation (1-line owner decision: rewrite patent claim or rewrite code), (b) the telegram/whatsapp fallback removal, and (c) reclassifying Claim 5 status before filing. None of these are deep work but all are pre-filing blockers.

---

## 2. Patent-Claim Coverage Matrix

Status legend: **FULL** = implemented as claimed · **PARTIAL** = implemented for a subset · **TRUNCATED** = present but missing claimed elements · **STUB** = scaffolding without behaviour · **MISSING** = no implementation · **BUG-RISK** = present but defective · **UNKNOWN** = not investigated by any audit. Audited-by column: A=architecture, B=UI, C=Firecrawl, D=Vael-small, P0=this report's independent verify.

| Claim | Topic | Audited by | Verdict | Code location |
|---|---|---|---|---|
| 1 | Substrate-agnostic operator composition (method) | A, P0 | **PARTIAL** | end-to-end across `routes/chat.ts` + `utils/systemPrompt.ts` + `utils/memoryEngine.ts`; action-scope distill only on `public-crud.ts` |
| 2 | 5-layer identity + scope-isolated substrate (system) | A, P0 | **TRUNCATED** | Layer 3 stripped from prompt at `systemPrompt.ts:544` (`void selfAwareness`); claim language now matches tool-only path |
| 3 | Two-layer memory + PII firewall + action distillation | A, P0 | **PARTIAL** | L1 + L2 + action distill all present; **NEW: no regex PII backstop at write — see §5**; Claim 25 soul-anchor MISSING |
| 4 | Operator-as-driver + curiosity + no-post-LLM-filter | A, P0 | **FULL** | `operatorAgent.ts` wraps every call; `curiosityEngine.ts` dual-corroborates; intentional no-filter per `[[no-fallbacks]]` |
| 5 | Architecture firewall + 4 enforcement surfaces | A, P0 | **PARTIAL** (Agent A: MISSING) | **NEW: 5(c) IS present at `vectorSearch.ts:70,98,101` — Agent A missed.** 5(d) removal in commit `b869255`. 5(e) no labels in `systemPrompt.ts`. Only 5(a) input + 5(b) output firewalls actually missing. |
| 6 | Multi-substrate observable invariance | A | **PARTIAL** | `modelRegistry.ts` carries the claimed set; empirical invariance test owed |
| 7 | Both Layer 1 + Layer 2 distilled from same turn | A, P0 | **FULL** | `memoryEngine.ts:520-523` parallel allSettled |
| 8 | Scope Context paragraph addressed in second person | A, P0 | **FULL** | `scopeResolver.ts:227-310` per-scope prose, no architectural vocabulary |
| 9 | Universal single-dispatch tool function | A, P0 | **PARTIAL** (Agent A: FULL) | `dispatchTool` exists. **But only `chat.ts` route wires tools to LLM call. public-chat, public-crud, telegram-webhook, whatsapp-webhook do not pass tools.** Claim language reads "every inbound request"; today only owner Hub gets tools. |
| 10 | Input architecture-introspection firewall | A, P0 | **MISSING** | Removed in commit `b890bb4` |
| 11 | Output architecture-leak firewall | A, P0 | **MISSING** | Removed in commit `b890bb4` |
| 12 | Action-scope synthetic distillation | A, P0 | **FULL** | `memoryEngine.ts:627`+ `distillActionTaskPattern` discards values |
| 13 | No fallback content on failure | A, P0 | **PARTIAL** | chat.ts honours; **NEW: telegram-webhook.ts:284 + whatsapp-webhook.ts:348 + public-chat.ts:402,417 all violate**; webhook violations are worse — strings persisted as `role:assistant` |
| 14 | 9 canonical archetypes | A (FULL), P0 (**FAIL**) | **CONFORMANCE FAIL** | **NEW CRITICAL: patent claims `Sage, Mentor, Hero, Magician, Sovereign, Caregiver, Creator, Explorer, Healer`; code has `Executor, Advisor, Expert, Connector, Creator, Guardian, Builder, Catalyst, Analyst`. Only Creator overlaps.** `chat.ts:216` + `operators.ts` |
| 15 | 188 roles across 7+ domain clusters | A, P0 | **FULL** | Confirmed count = 188 exactly. 11 domain clusters present. |
| 16 | Layer 1 server-side structural lock | A, P0 | **BUG-RISK** | **PATCH `/api/operators/:id` (operators.ts:372-396) writes Layer 1 fields straight through with no `layer1LockedAt` check.** GROW path enforces. Birth path enforces. Admin path does not. |
| 17 | GROW governed learning ≥4 guards | A, P0 | **FULL** | Guard 1 PII (`growEngine.ts:404`), 1b Layer-1 sieve (line 429), 3 semantic 13-pattern (line 330), 4 cumulative drift (line 283) |
| 18 | Scope Context composer at fixed prompt position | A, P0 | **FULL** | Prepended in `systemPrompt.ts:431-435` before Layer 0 |
| 19 | Self-awareness via tool, not ambient injection | A, P0 | **FULL** | `void selfAwareness` at `systemPrompt.ts:544`; `get_self_info` registered at `toolRegistry.ts:554` |
| 20 | Secondary role activation | A, P0 | **MISSING** (Agent A: PARTIAL) | **NEW: no runtime activation gate at all.** Roles array is read once at birth; no runtime add/enter/exit role path |
| 21 | Retry protocol with bounded exponential backoff | A, P0 | **PARTIAL → MISSING for chat** | **NEW: `openrouter.ts` has zero retry logic.** GROW has its own (`growEngine.ts:29-30`), but chat-path LLM calls get one shot. Claim language reads "language-model invocations" plural |
| 22 | Birth protocol as sole creation pathway | A | **PARTIAL** | `ownerOperatorsSeed.ts` empty. POST `/api/operators/` exists; needs spot-check it goes through birth flow not a direct insert |
| 23 | Concurrent operators, independent locks | A | **FULL** | Per-operator rows + per-operator scoping |
| 24 | Absolute-PII section in distillation prompt | A, P0 | **FULL** | `memoryEngine.ts:449` "## ABSOLUTE RULE — ZERO PII" + enumerated categories |
| 25 | Soul-anchor decay exemption | A, P0 | **MISSING** | No `soul_anchored` column anywhere. `decayMemoriesForOperator` (`memoryEngine.ts:337`) decays uniformly |
| 26 | Layer 2 cross-scope for GROW only | A | **FULL** | scope-bound retrieval at conversation time; unscoped in GROW's `getMainMemoryContext` |
| 27 | Cosine ≥0.85 dedup | A, P0 | **FULL** | `memoryEngine.ts:300` `(1 - dupCheck.rows[0].distance) > 0.85` |
| 28 | Action-scope memory eligible for promotion | A | **FULL** | `storeMainMemory` sets growEligible + platformCandidate flags |
| 29 | Layer 1 scope-trust value | A | **FULL** | `scope_trust` column written via `storeMemory(... scopeTrust)` |
| 30 | Platform-promotion confidence ≥0.85 | A, P0 | **FULL** | `memoryEngine.ts:314-316` |
| 31 | Single-registry typed-result tool dispatch | A | **FULL** | `dispatchTool` returns `{content, meta?:{terminateLoop}}` |
| 32 | Tiered source-trust ≥5 tiers with dual corroboration | A (PARTIAL), P0 | **TRUNCATED** | **NEW: only 3 actual trust tiers** (`SourceTier = 1|2|3|null` at `curiosityEngine.ts:11`). Tier 4 in prompt = "do not trust" label (not a trust tier). Tier 5 in comment = single-source rejection (a meta-rule, not a tier). Patent says "at least five tiers" — actual count is 3. |
| 33 | Typed-error pass-through on tool failure | A | **FULL** | `terminateLoop` short-circuits without synthetic substitute |
| 34 | Model registry outside substrate | A, P0 | **FULL** | `modelRegistry.ts` |
| 35 | Register/identity/tone matching is operator's responsibility | A | **PARTIAL** | Language detection regex-Arabic-only (`chat.ts:579`); tone responsibility lives implicitly in Layer 1/2 prose |
| 36 | Self-information tool available | A | **FULL** | `get_self_info` registered |
| 37 | Input + output firewall pattern sets, logged | A, P0 | **MISSING** | See Claim 5 |
| 38 | Output firewall identifier set | A, P0 | **MISSING** | See Claim 5 |
| 39 | KB/skill = world-knowledge, not behavioural | A, P0 | **FULL** | Discipline confirmed in `platformKbV1Data.ts:10-20` header comment + content review of 5 entries |
| 40 | LLM has no visibility into prompt section structure | A, P0 | **FULL** | `systemPrompt.ts` builds prose without labelled headers; KB retrieval filtered (now also confirmed via Claim 5(c) finding) |
| 41 | Architecture content removed not filtered | A | **FULL** | Per commit `b869255` (14 KB entries removed) |
| 42 | Streaming + sync firewall | A | **MISSING** | See Claim 5 |
| 43 | Stateless server runtime + per-request assembly | A | **FULL** | Every chat assembles prompt fresh from DB |
| 44 | Identity-preservation triple | A, P0 | **PARTIAL** | Layer 1 lock = BUG-RISK (Claim 16); GROW guards = FULL; architecture-as-secret = PARTIAL (was MISSING per Agent A; Claim 5(c)/(d)/(e) actually present). 3 of 3 mechanisms intact but the first is incomplete |
| 45 | Fresh prompt every request | A | **FULL** | OpenRouter stateless; no client-side state |
| 46 | Capability external to weights | A | **FULL** | Inventor's Hajeri work cited in SoT § E7 |

**Summary counts (P0 reading):**
- FULL: 18
- PARTIAL: 9
- TRUNCATED: 3 (Claims 2, 14*, 32) — *Claim 14 actually a CONFORMANCE FAIL pending owner decision
- MISSING: 6 (Claims 10, 11, 20, 25, 37/38, 42)
- BUG-RISK: 1 (Claim 16)
- Other: Claim 14 = CONFORMANCE FAIL pending owner reconciliation

---

## 3. Cross-Verification Results — Prior Audit Claims

### Agent A (Architecture)

| Claim made | P0 verify | Evidence |
|---|---|---|
| Layer 1 lock bypass at `operators.ts:372-396` | **AGREE** | Read confirms PATCH route uses `UpdateOperatorLayer1Schema` which includes `name, rawIdentity, archetype, roles, mandate, coreValues, ethicalBoundaries`. No `layer1LockedAt` check anywhere in the route handler. |
| `public-chat.ts:402, 417` fallback strings | **AGREE** | Read confirms exact strings 'AI service temporarily unavailable. Please try again shortly.' (line 402+417) and 'Stream failed. Please try again.' (line 403). |
| 0.3 integer bug at commit `d52b338` | **AGREE** | git show confirms commit message + 2 file diffs (toolHandlers.ts:785 + cron/tasksCron.ts:79, both `0.3 → 30`). |
| MCP shipped, refactor complete | **AGREE** | `mcpServer.ts` exists (138 lines), `routes/mcp.ts` exists (147 lines), both wire to `dispatchTool` from the same registry chat.ts uses. `chat.ts` does NOT call MCP protocol — it calls `dispatchTool` directly. Memory `[[opsoul-mcp-buildout]]` ("paused before chat.ts refactor") is stale. |
| Claim 5 entirely MISSING | **DISAGREE** | Claim 5(c) IS present at `vectorSearch.ts:98` (`source_name NOT LIKE 'Platform Architecture — %'`). 5(d) confirmed via commit `b869255`. 5(e) confirmed (`systemPrompt.ts` emits prose without layer headers). Only 5(a) input firewall + 5(b) output firewall are actually MISSING. Reframe Claim 5 as PARTIAL. |
| Claim 25 soul-anchor MISSING | **AGREE** | grep across `lib/db/src/schema/` + utils shows zero `soul_anchored` / `soulAnchored` column. The `soulAnchor` in `systemPrompt.ts` is a per-request L0+L1 reinjection flag, not a decay-exemption column. |
| Claim 32 only 3-4 tiers | **AGREE — sharpen** | Actual: `SourceTier = 1|2|3|null` (line 11). Tier 4 in prompt = "do not trust" label. Tier 5 in comment = meta-rule. Only **3** trust tiers, not 4. Sharpening from PARTIAL toward TRUNCATED. |
| Claim 14 9 archetypes FULL | **DISAGREE — fail** | The 9 names in code (`Executor, Advisor, Expert, Connector, Creator, Guardian, Builder, Catalyst, Analyst`) do not match the patent's 9 (`Sage, Mentor, Hero, Magician, Sovereign, Caregiver, Creator, Explorer, Healer`). Only 'Creator' overlaps. **Patent-conformance failure.** |

### Agent B (UI)

| Claim made | P0 verify | Evidence |
|---|---|---|
| AdminPage VAEL Desk dead code ~500 LOC | **AGREE** | `AdminPage.tsx` lines 175-219 (state) + 352-585 (functions) + interfaces. Backend `routes/admin.ts` has zero `/admin/rag/*` route handlers (grep confirms). |
| `CapabilityRequestsSection.tsx` built but unrouted | **AGREE** | `grep -rn CapabilityRequestsSection` returns only the file's own export — never imported elsewhere. |
| Architecture leaks: Layer 0-4 in AdminPage, GROW in Dashboard, Sovereign in admin | **AGREE** | `AdminPage.tsx:60` `LAYER_LABELS`, Dashboard.tsx:404 'GROW evolution engine', AdminPage.tsx:769/788 'Sovereign Console / Command Center'. All confirmed. |
| Free Roaming toggle / Tool Use Policy gap | **AGREE** | `validation/operator.ts:50` exposes `toolUsePolicy: z.record(z.unknown())`. No UI editor in SettingsSection. |

### Agent C (Firecrawl)

| Claim made | P0 verify | Evidence |
|---|---|---|
| `mcpServer.ts` + `routes/mcp.ts` exist on main | **AGREE** | confirmed via direct read |
| Tools follow Gmail/Notion/GitHub Wave-3 shape | **AGREE (spot-check)** | `toolRegistry.ts` size = 1158 lines, registry pattern visible at `RegisteredTool` shape per `mcpServer.ts:32-34` import. (Did not deep-audit all 50+ tools but pattern is consistent.) |
| `SERPER_API_KEY` env var pattern already in production | **AGREE** | `curiosityEngine.ts:133` reads `process.env.SERPER_API_KEY`; gate matches Agent C's described shape. |
| Plan to add 5 Firecrawl tools as in-process REST wrappers, not as MCP child process | **AGREE — sound** | This is consistent with OpSoul's own architecture (it IS the MCP server). Bolting on the official `firecrawl-mcp` would be MCP-to-MCP which is the failure mode Agent C correctly avoids. |

### Agent D (Small Vael)

| Claim made | P0 verify | Evidence |
|---|---|---|
| `kbIntake.ts:7` is the swap point | **AGREE** | Line 7: `const DISTILL_MODEL = 'moonshotai/kimi-k2.5';` — confirmed exact match. |
| `modelRegistry.ts:245` has `'/' = OpenRouter` heuristic | **AGREE** | Line 245: `if (modelId.includes('/'))` returns OpenRouter-shaped ProviderConfig. Exact match. |
| `memoryEngine.ts` / `growEngine.ts` / `curiosityEngine.ts` / `chat.ts` are voice-bearing paths | **AGREE — partial** | memoryEngine and growEngine are identity-distillation paths — voice-adjacent in the sense that they shape what the operator learns about itself. curiosityEngine uses Kimi for both evaluation AND synthesis (line 74), so swapping that model affects classifier verdicts directly. chat.ts dispatches via `resolveModel()` so per-operator default model is honoured. Agent D's "leave on Kimi" call is sound for all four. |
| Voice preservation untested on small Vael path | **NEEDS-MORE-INFO** | Agent D explicitly notes voice isn't on the small model in the recommendation, BUT defers Qwen-vs-Kimi verdict diff to "before merging" with no pre-committed pass criteria. The 95% agreement bar should be locked in writing, not "owner reviews disagreements". |

---

## 4. Contradictions Found

| # | Contradiction | Resolution |
|---|---|---|
| 1 | Agent A says MCP refactor complete; `[[opsoul-mcp-buildout]]` memory says "paused before chat.ts refactor — needs owner sign-off" | **Agent A wins.** `chat.ts` lines 769-793 + 865-965 (per Agent A's note) wire `listToolsForContext` + agent loop. The memory is outdated. Recommend an explicit memory update note. |
| 2 | Agent A grades Claim 5 entirely MISSING; the SoT § E7 / commit `b869255` references claim-supporting work | **Agent A is too harsh.** Claim 5 has 3 of 4 enforcement surfaces present (5(c) KB filter, 5(d) content removal, 5(e) no labels). Only firewalls 5(a)/(b) are missing. Reclassify Claim 5 PARTIAL. |
| 3 | `[[scope-isolation]]` memory says "NOT yet in OpSoul, must build before scaling operators"; Agent A grades Claim 2 PARTIAL with all 5 scope types implemented | **Code wins.** `scopeResolver.ts` has all 5 scope types, all discipline flags, all server-trusted classification. Memory needs updating. |
| 4 | Agent A grades Claim 14 FULL with 9 archetypes; patent Claim 14 names a different 9 | **Patent vs code mismatch.** Owner decision required. |
| 5 | `[[opsoul-03-integer-bug]]` memory describes bug as open and needing "stack trace before fixing"; commit `d52b338` says fixed | **Commit wins.** Memory needs updating. |

---

## 5. Untested Assumptions

| # | Assumption | Held by | Risk if wrong |
|---|---|---|---|
| 1 | Voice preservation on Qwen 7B for `kbIntake.ts` classifier work | Agent D | Verdict drift — Vael's "stable/ephemeral" calls flip, downstream corroboration breaks. Mitigation in Agent D's §6 needs pass/fail criteria locked. |
| 2 | All 4 GROW guards exist and enforce | Agent A | **VERIFIED** via direct read of `growEngine.ts` — guards 1, 1b, 3, 4 all hard-block. (P0 promotes to confirmed.) |
| 3 | Firecrawl tier choice fits volume | Agent C | Volume estimates (30K-60K/mo for Vael) are not validated against historical Vael activity logs. No Vael activity logs exist yet to validate — SRAG is pre-launch. Estimate is intuition not data. |
| 4 | `public-chat.ts` is the only fallback path | Agent A | **WRONG.** P0 sweep found telegram-webhook.ts:284 + whatsapp-webhook.ts:348 each substitute fallback strings AND persist them as `assistant` messages. |
| 5 | Layer 2 PII firewall is sufficient (prompt-only) | implicit, all audits | **WEAK.** No regex backstop at write time. If distiller LLM ever produces PII despite the prompt, it lands in `operator_main_memory` unfiltered. Claim 3(c) language ("structural prohibition... embedded in the prompt") is consistent with this design but reads more conservatively than what's there. |
| 6 | KB retrieval source-name filter pattern `'Platform Architecture — %'` matches any architecture-describing content that could be seeded | implicit, none audited | The pattern is exact-prefix-match. If a knowledge source ever uses a different prefix ("Platform DNA", "OpSoul Internals", "Layer Stack"), it bypasses the filter. Discipline holds because all 14 removed entries used the matching prefix, but is brittle. |
| 7 | Tool wiring gap (Claims 4/9/31/36) is a "fix-by-mirroring" pattern | Agent A | P0 read of `public-crud.ts:258` finds no try/catch around `executeSync`. Mirroring chat.ts will also bring in the agent loop logic — non-trivial port, not 50 lines as Agent A's recommendation implies. |
| 8 | `[[opsoul-03-integer-bug]]` (SoT B-section open bug) is closed by `d52b338` | Agent A | **VERIFIED.** Both call sites match. Memory + SoT need closing updates. |

---

## 6. Final Unified Priority List

### CRITICAL (patent-litigation risk — head independent claims at risk)

1. **C-1 — Archetype-name conformance failure (NEW, P0).** Patent Claim 14 lists 9 archetypes; code has 9 completely different ones. Either claim or code must change before filing. Single owner decision: rewrite the claim to match Executor/Advisor/Expert/Connector/Creator/Guardian/Builder/Catalyst/Analyst, or rewrite code + migrate operators to the patent's Sage/Mentor/Hero/Magician/Sovereign/Caregiver/Creator/Explorer/Healer. **Filing-fatal as currently drafted.**

2. **C-2 — Layer 1 lock bypass (Agent A — P0 confirmed).** `operators.ts:372-396` PATCH route writes Layer 1 fields with no `layer1LockedAt` check. Defeats Claims 2(a)(ii), 16, 22, 44.

3. **C-3 — Claim 5 reclassification + firewall decision (Agent A flagged, P0 refined).** Claim 5 currently filed; code has 3 of 4 enforcement surfaces (NOT zero as Agent A said). Decision: (a) narrow the claim to the 3 present surfaces + drop language about firewalls, OR (b) bring back the 2 missing firewalls in a `[[no-fallbacks]]`-compatible form.

4. **C-4 — Claim 14 + Claim 32 numeric conformance.** Patent says 9 archetypes (different ones — see C-1) and "at least 5 trust tiers"; code has 9 (wrong names) and 3 trust tiers. Both numbers don't line up with claim text.

### HIGH (patent-dependent claims + ship-blocker)

5. **H-1 — Telegram + WhatsApp fallback violations (NEW, P0).** `telegram-webhook.ts:284` + `whatsapp-webhook.ts:348` each substitute "Sorry, I encountered an error. Please try again." for operator voice AND persist as `role: 'assistant'`. Worse than public-chat.ts because fake voice enters permanent memory. Claim 13 violation across two more surfaces.

6. **H-2 — public-chat.ts fallback violations (Agent A).** Lines 402, 417. Claim 13.

7. **H-3 — Tool wiring missing on 4 of 5 routes (Agent A).** public-chat, public-crud, telegram, whatsapp all call `executeStreaming/Sync` without `tools`. Claims 4/9/31/36 hold for only the owner Hub. NEW: `public-crud.ts:258` also has no try/catch — LLM failure crashes the request.

8. **H-4 — Soul-anchor decay exemption missing (Agent A — Claim 25).** No `soul_anchored` column anywhere; decay sweep uniform.

9. **H-5 — Claim 32 tier-count gap (Agent A flagged, P0 sharpened).** Patent says ≥5 tiers; code has 3 actual trust tiers. Expand `SourceTier` to `1|2|3|4|5|null` + adjust evaluation prompt + retest classifier output stability.

10. **H-6 — Claim 21 retry policy missing for chat path (NEW, P0).** `openrouter.ts` has no retry/backoff/budget. Add bounded retry consistent with `[[no-fallbacks]]` (final exhaustion = typed error, not synthetic content).

11. **H-7 — Layer 2 PII firewall is LLM-trust only (NEW, P0).** Add regex backstop at `storeMainMemory` (`memoryEngine.ts:278`) mirroring the GROW Guard-1 PII patterns. Belt + suspenders.

12. **H-8 — AdminPage VAEL Desk ~500 LOC dead code (Agent B).** Backend 404s; pre-approved by SoT §890 for cleanup. Ship-blocker for any user seeing the admin panel.

13. **H-9 — `CapabilityRequestsSection` unrouted (Agent B).** Component built, endpoint live, no nav entry. Owner blind to capability requests.

14. **H-10 — Architecture-as-secret leaks in UI copy (Agent B).** `GROW`, `Sovereign`, `Layer 0-4`, `DNA` surfaced to user-facing screens. Supports Claim 5 enforcement spirit; current leaks weaken it.

### MEDIUM (cleanup-class, no immediate patent risk)

15. **M-1 — `[[opsoul-mcp-buildout]]` memory outdated (Agent A flagged).** Update memory note: chat.ts refactor shipped; MCP live.

16. **M-2 — `[[scope-isolation]]` memory outdated (P0 finding).** scopeResolver.ts has all 5 scopes today. Update memory.

17. **M-3 — `[[opsoul-03-integer-bug]]` memory + SoT open-bug section outdated.** Closed by commit `d52b338`. Update both.

18. **M-4 — Secondary-role activation gate missing (Agent A — Claim 20).** Today roles are set once at birth, no runtime entry/exit. Claim 20 language requires "controlled activation path independent of the LLM substrate".

19. **M-5 — Operator portrait Unsplash leak (Agent B).** Privacy + offline + brand consistency.

20. **M-6 — Tool Use Policy editor missing (Agent B).** Backend honors `toolUsePolicy`; no UI exists.

21. **M-7 — `BIRTH_ARCHETYPES` / `VALID_ARCHETYPES` duplicated across files (Agent A).** Centralize.

22. **M-8 — `BIRTH_ROLES` / `VALID_ROLES` duplicated across files (Agent A).** Centralize.

23. **M-9 — Hub Memory section has no scope filter (Agent B).** UI hides Layer-1 vs Layer-2 split.

24. **M-10 — `public-crud.ts` hardcodes `'moonshotai/kimi-k2.5'` default (NEW, P0).** Couples action API to one provider. Should read from registry/operator default.

25. **M-11 — KB source-name filter pattern is brittle exact-prefix (NEW, P0).** Pattern `'Platform Architecture — %'` only catches that exact prefix. Future architecture content with different prefix bypasses. Move to a `kb_visibility` boolean column.

26. **M-12 — `kbIntake.ts:42, 52, 75, 90, 190` fail-open `catch { /* non-critical */ }` (Agent A flagged via SoT B1).** Can let PII or ephemeral content into KB.

27. **M-13 — `needs_owner_review` GROW notification is log-only (Agent A flagged via SoT B2).** Owner blind to GROW review queue.

28. **M-14 — Inconsistent design systems across Hub (Agent B).** Material on AdminPage, Tailwind elsewhere.

29. **M-15 — Reframe ChatSection error strings (Agent B).** Per `[[errors-as-investigation]]`.

### LOW (polish)

30. **L-1 — Empty `ownerOperatorsSeed.ts` can be deleted (Agent A).**
31. **L-2 — `scopeId` `authenticated:` prefix migration deferred (Agent A).**
32. **L-3 — `index.ts:215` per-startup DDL → real migration (Agent A).**
33. **L-4 — Replace `e.g. Nahil` placeholder (Agent B).**
34. **L-5 — Delete dead `PERSONA_GLOWS` const (Agent B).**
35. **L-6 — `from-${brand}-500/10` Tailwind purge risk (Agent B).**

---

## 7. Decision Points for Owner

These are calls the audit agents can't make:

1. **D-1 (CRITICAL) — Archetype naming: rewrite patent claim or rewrite code?** The 9 names diverge entirely. Code names (Executor, Advisor, Expert, Connector, Creator, Guardian, Builder, Catalyst, Analyst) look like role-aligned function archetypes; patent names (Sage, Mentor, Hero, Magician, Sovereign, Caregiver, Creator, Explorer, Healer) look like classical Jungian archetypes. The code's set is what every operator born to date has chosen from. The patent set requires a code rewrite + migration of existing operators' `archetype` arrays. **Recommend: rewrite the patent claim to match code, since (a) code reflects birth flow that's been used in production and (b) existing operator identities depend on the current set.**

2. **D-2 (CRITICAL) — Claim 5 firewall reconciliation.** Three options: (a) narrow Claim 5 to the 3 present surfaces (drop firewall language); (b) restore input/output firewalls in `[[no-fallbacks]]`-compatible form (firewall returns a typed error, operator responds in own voice); (c) drop Claim 5 entirely and rely on Claims 40/41 for architecture-secrecy support. Owner alone has the patent-strategy call.

3. **D-3 (HIGH) — Trust tier expansion.** Claim 32 says ≥5; code has 3. Either (a) expand to 5 actual trust tiers (rewrite curiosityEngine prompt + retest verdict stability), or (b) revise Claim 32 to "at least three trust tiers". (b) is much less work; (a) is a meaningful capability improvement (finer-grained source trust).

4. **D-4 (HIGH) — Public surface tool scope.** Should public/channel/action scopes have access to the full universal tool set, a subset, or none? Today they have none. Patent claims read "every inbound request"; today only owner Hub honours that.

5. **D-5 (MEDIUM) — Vael Qwen swap pass criteria.** Agent D proposes ≥95% agreement on `stable/ephemeral` and `yes/no` PII across 20 articles. Owner needs to commit this in writing before the swap merges, or define a different bar.

6. **D-6 (MEDIUM) — Firecrawl tier.** Agent C recommends Standard ($83/mo yearly). Volume estimates are intuition not data. Owner needs to ratify the bet.

---

## 8. Recommended Phasing Adjustments

The 4-phase plan still works, but Phase 1 must absorb the new CRITICAL findings:

**Phase 1 (pre-filing patent reconciliation) — was 1 week, now ~1.5 weeks:**
- D-1 archetype-name decision + code-or-claim update
- C-2 Layer 1 lock fix on PATCH route
- D-2 Claim 5 decision + (narrow OR restore firewall)
- D-3 Claim 32 decision + (narrow OR expand to 5 tiers)
- H-1 + H-2 fallback string removal (telegram + whatsapp + public-chat)
- H-4 soul-anchor column + decay exemption
- M-1, M-2, M-3 memory updates (5 minutes each)

**Phase 2 (capability completion) — unchanged scope:**
- H-3 tool wiring on 4 routes
- H-6 retry policy in openrouter.ts
- H-7 Layer 2 PII regex backstop
- M-4 secondary role activation gate
- M-10, M-11, M-12 cleanups

**Phase 3 (UI parity) — unchanged scope:**
- H-8 + H-9 + H-10 + UI-related M items + L items

**Phase 4 (capability expansion):**
- Agent C Firecrawl integration (after Phase 1's D-6 ratification)
- Agent D Vael Qwen swap (after Phase 1's D-5 commit)

**Total scope change:** +1 week to Phase 1 to absorb the patent-reconciliation work that prior audits didn't surface.

---

## Appendix — Files Independently Read in P0

- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/operators.ts` (lines 340-460)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/public-chat.ts` (lines 380-430)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/public-crud.ts` (lines 240-279)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/telegram-webhook.ts` (lines 270-300)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/whatsapp-webhook.ts` (lines 330-360)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/chat.ts` (lines 1040-1060, 214-225)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/mcp.ts` (full)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/owner-kb.ts` (full)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/routes/admin.ts` (route enumeration)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/mcpServer.ts` (full)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/scopeResolver.ts` (full)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/curiosityEngine.ts` (full)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/growGuards.ts` (full)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/growEngine.ts` (guard-invocation sites)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/memoryEngine.ts` (lines 276-340, 439-530)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/systemPrompt.ts` (lines 525-552)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/vectorSearch.ts` (lines 65-105)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/kbIntake.ts` (lines 1-25, 105-200)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/modelRegistry.ts` (lines 230-265)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/openrouter.ts` (lines 1-60 + retry-grep)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/lockLayer1.ts` (full)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/platformKbSeed.ts` (lines 1-80)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/scripts/platformKbV1Data.ts` (lines 1-100, header + 6 entries)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/validation/operator.ts` (full)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-hub/src/pages/AdminPage.tsx` (arch-leak + dead-code grep)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-hub/src/pages/Dashboard.tsx` (arch-leak grep)
- `/Users/bstar/opsoul-audit/artifacts/opsoul-hub/src/pages/DocsPage.tsx` (arch-leak grep)
- `/Users/bstar/OPSOUL_RED/OpSoul_Patent_FINAL_Claims_EN.md` (full)
- `/Users/bstar/OPSOUL_RED/OpSoul_Patent_FINAL_Diagrams.md` (full — Figures 1-4)
- `/Users/bstar/opsoul-audit/AUDIT_REPORT_ARCHITECTURE.md` (full)
- `/Users/bstar/opsoul-audit/AUDIT_REPORT_UI.md` (full)
- `/Users/bstar/opsoul-audit/AUDIT_REPORT_FIRECRAWL_MCP.md` (full)
- `/Users/bstar/opsoul-audit/AUDIT_REPORT_SMALL_VAEL.md` (full)

**End of Phase 0 audit. Owner action items: D-1 (CRITICAL), D-2 (CRITICAL), D-3 (HIGH).**
