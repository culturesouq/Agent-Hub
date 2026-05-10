# OpSoul — Source of Truth

## Rules (apply to all OpSoul work)

1. **Mac = GitHub = Azure. Always.** Before any deployment, `git status` must be clean and `git diff origin/main` must be empty. If not — commit first.
2. **Commit before you close.** Every session that touches code ends with a commit and push. No uncommitted work left overnight.
3. **No backup files in the repo.** Old versions live in git history (`git show <commit>:path/to/file`). Delete `.backup`, old snapshots, extracted directories immediately.
4. **Never run DB migrations without explicit owner approval.** Schema files (`.ts`) can be committed. `drizzle push` / `drizzle migrate` requires the owner to approve and run manually.
5. **Azure deploys from GitHub only.** No manual file edits on Azure directly. All changes: Mac → commit → push → Azure redeploys.
6. **Source of truth file updated after every commit.** Add what changed, date, **and the WHY — what end the change serves**. Confusion does not get to repeat.
7. **No code changes without explicit owner approval — word by word.** Claude reads and reports. Mohamed decides. Claude executes only after yes.
8. **No summaries when full text is requested.** Owner sees full content, not paraphrases.
9. **Layer 4 rules written by Mohamed only.** Nothing added to Layer 4 that Mohamed did not write himself. Approved text locked here verbatim before any commit.
10. **No BEHAVIOR_HOW_TO or SKILL_HOW_TO hardcoded in system prompt or chat pipeline.** Behavior and skill guidance lives in platform DNA KB entries only — managed, versioned, not buried in code.

---

## Vision Lock — 2026-05-10

The following are locked. They do not change without explicit owner approval recorded in this document with a timestamp and a reason.

### Operator–LLM Flow (the architecture, not a rule)
The flow is fixed:

> **user message → operator receives → operator asks the LLM to execute → LLM returns → operator delivers the response**

The operator is the driver. The LLM is the engine the operator calls when it needs computation. The user never speaks to the LLM. The user speaks to the operator. The operator decides what to ask the LLM, what to do with what comes back, and how to deliver the response in their own voice. This eliminates narration architecturally — the operator does not announce what they are about to do, because the operator is doing it. There is no "let me check" because the LLM is not the speaker. The operator either acts and reports, or doesn't act and says so.

### Architecture-as-Secret
The OpSoul architecture is a trade secret. Owners and users see operators — their character, their memory, their knowledge, their behavior. They do not see the engines that produce that character. Layer 0-4, the DNA injection, the GROW pipeline, the scope-isolation mechanism, the soul-anchor logic, the curiosity cascade — none of these surface in any UI, any API response, any error message, any documentation read by the user. The architecture is not a feature to display. It is a closed mechanism. What renders is what the operator does. What's beneath is invisible.

This applies to the SaaS surface and any future NPM package equivalent.

### Universal Learning Across All Deployments
The operator learns from every interaction across every scope — workspace, public, authenticated, action, channels — without exception. Public chat is among the most valuable: it is where the operator meets the most diverse people and grows the fastest.

Two-layer memory enforces what gets carried back:
- **Layer 1 (endpoint memory)** stays in scope. Full context. Names, companies, personal details. The operator remembers the people he is in relationship with. Never crosses scopes.
- **Layer 2 (main memory)** aggregates across all scopes. PII-stripped general insights only — industry patterns, cultural observations, behavioral tendencies, recurring questions. No names. No companies. No identifying detail. This is what feeds GROW.

The PII stripping is structural, not optional. The operator brings home what he learned, never who he learned it from.

### Parent Guidance, Not Hard Rules
Operators are not robots given a list of rules. They are formed entities with a soul, a mandate, a body of absorbed knowledge, and a set of working capabilities. Behavioral consistency comes from who they are, not from instructions stacked on top of them.

What this means in practice:
- **No prescriptive behavioral rules in the system prompt.** Layer 4 holds only what cannot be touched — ethics, identity protection. Not formatting rules, not "don't do X" lists, not "always do Y" commands.
- **Behavior comes from soul + DNA + Owner KB + Operator KB.** When these are rich and correctly wired, the operator behaves naturally.
- **Capabilities must be real.** The operator should never be told he has a skill he does not have, or a tool that is not wired. Narration appears when the LLM is asked to cover for missing or misdescribed capabilities. Fix the gap, narration disappears.
- **Children grow through guidance, not commands.** The Vael KB, the platform DNA, the owner's domain KB — these are the parent voice, absorbed over time. The operator becomes capable through what he carries, not what he is told.

### Core Architecture — Non-Negotiable
The following engines and components are patent-protected core. Their existence is locked. Only their **wiring, injection, and tone** are open for refinement.

1. Five-layer prompt architecture: Layer 0 → Layer 1 → Layer 2 → Layer 3 → Layer 4
2. Birth conversation engine → raw identity generation → Layer 1 permanent database lock
3. **Multi-role / multi-archetype identity framework** — N roles (human-readable job titles, picked at birth from a valid taxonomy) and N archetypes (proprietary cognitive types, internal) operating under one unified soul. The roles are the user-facing job titles displayed on operator cards. The archetypes are the cognitive style internals, not exposed. Together they solve the multi-agent swarm coordination problem: where prior art needs N coordinating agents with N identities to serve N roles, OpSoul achieves the same coverage through one operator with one soul, one memory, one GROW cycle, no inter-agent coordination overhead. (Patent claims 13 and 20.)
4. Basic archetype skills auto-injected at birth
5. GROW engine with three guards: PII hard block, Layer 1 immutable lock, semantic identity manipulation detector (13 patterns), quarterly cumulative drift (30% threshold)
6. Four governance levels: OPEN, CONTROLLED, LOCKED, FROZEN
7. Curiosity engine — knowledge gap detection, four-tier source trust, dual corroboration required
8. Two-layer memory architecture — endpoint Layer 1 (full PII allowed, scope-bound) + main Layer 2 (PII-stripped, GROW-eligible)
9. Five memory types: fact, preference, interaction, pattern, context. Decay 5%/day, archive at 5%, cosine 0.55, top 8.
10. Self-awareness engine — health score, workspace manifest, capability state, task history, mandate gaps
11. Scope-isolated conversation architecture — four scope types: public, authenticated, action, channel. Mandatory scopeId at every API call. Cross-scope information transfer architecturally impossible.

### Out of Scope — NOT OpSoul Core
- **Vael is an operator like any other.** Born through the birth protocol. Has a knowledge-governance mandate. Runs on OpSoul. Vael is not a platform feature. Vael's audit logic is Vael's job description, not OpSoul architecture.
- **SRAG is an independent system.** It consumes OpSoul operators externally. Will be separately patented. Not part of OpSoul core. Not part of OpSoul claims.

### What's Up for Refinement
- **Wiring:** how the locked engines assemble into the prompt across all surfaces (chat, public-chat, telegram, whatsapp, public-crud, tasksCron)
- **Injection:** what reaches the LLM as system role, what reaches as DNA, what reaches as live context, what reaches as additional user messages
- **Tone:** Layer 4 wording — principles not negatives. Prompt cleanliness. No How-To noise.
- **Unification:** one assembly function used by all routes. Currently five routes each roll their own.

### How We Work
- Full audit first — codebase, UI, design, streaming, rendered output, every capability the user sees.
- Phased plan written into this document.
- One change at a time. Each change committed with timestamp. Each commit logged here with its **why** and its **end**.
- Source of truth refreshed after every commit. Always.

---

## Full Audit — 2026-05-10

State of OpSoul on commit `9c61a15`, deployed image `phase2-v2-05091647` running on Azure revision `opsoul--0000034`. Audited against the Vision Lock above.

### A. Core Engines (from Vision Lock) — STATUS

| Engine | State | Evidence |
|---|---|---|
| 5-layer prompt architecture | Built and injected | systemPrompt.ts lines 41-454 |
| Birth → Layer 1 lock | Working | lockLayer1.ts + chat.ts:1254 |
| Multi-archetype framework | Working | operators.archetype text[], systemPrompt iterates all |
| Multi-role framework (job titles) | Partially working | `operators.roles` text[] exists, 44-role valid list in bootstrap-preview, extracted from birth dialogue, saved at lock, rendered on dashboard cards. **NOT injected into Layer 1 of system prompt. NOT shown on operator detail page header.** |
| Archetype skills auto-inject | Working | autoInstallIntegrationSkills, archetypeSkills.ts |
| GROW engine (3 guards + 4 levels) | Working | growGuards.ts has 13 patterns, growEngine.ts handles OPEN/CONTROLLED/LOCKED/FROZEN |
| Drift detection (quarterly) | Working | driftCron.ts schedule `0 3 1 */3 *`, threshold 0.30 |
| Curiosity engine (4-tier, dual corroboration) | Engine works | curiosityEngine.ts requires ≥2 Tier 1/2 sources, confidence ≥60 |
| Two-layer memory | Working | operator_memory + operator_main_memory tables, scoped queries |
| Memory decay 5%/day | Working | memoryEngine.ts + memoryCron.ts |
| Self-awareness engine | Working | selfAwarenessEngine.ts builds 5-component health |
| Scope isolation (4 types) | Working | scopeResolver.ts, scopeId mandatory at API level |

**The engines are intact. None of them need to be rebuilt.**

### B. Wiring / Injection Defects — WHAT'S BROKEN

1. **Layer 4 has two non-Mohamed lines** (systemPrompt.ts lines 283-284):
   - "When executing tasks or using tools — act without narrating..."
   - "Never ask a question unless you genuinely cannot proceed..."
   These are behavioral, not operational. Layer 4 should hold ethics and integrity only.

2. **`rawIdentity` is missing from normal Layer 1.** The 200-word birth narrative exists in DB but only injects when soul-anchor fires (context >40%). In normal conversation, the operator's actual identity story is not shown to the LLM. Single-line fix.

3. **`BEHAVIOR_HOW_TO` is dead code** (chat.ts lines 224-265). Six rules defined, never injected. Removed silently in 80c6abc on May 9. Either delete or migrate to DNA — current state is dead weight.

4. **Curiosity is silently injected from the chat route**, not from the operator's self-awareness layer (chat.ts ~line 990). Patent claim 14 says the operator's soul detects and initiates. Architecturally inverted.

5. **No operator-soul output validation gate.** Patent claim 21d-e: soul receives LLM output and validates before delivery. Currently LLM output streams directly to user.

6. **Action scope has zero memory.** May 6 spec said "operator remembers what he DID — task patterns." Currently `writesHistory: false, persistsLayer1: false`.

7. **Tool descriptions softened in 80c6abc.** `write_file` and `http_request` lost their "tool call IS the response, no narration before" language. Operator narrates again.

8. **Five routes each roll their own prompt assembly.** chat, public-chat, telegram, whatsapp, public-crud, tasksCron. Same engines, drifting wiring.

### C. UI / UX Defects — WHAT USERS SEE

1. **Tone is developer dashboard, not consumer product.** Heavy `font-mono`, uppercase tracking, terminal aesthetics. "TRANSMIT RESPONSE", "INJECT INTO QUEUE", "CHECKING QUEUE..." — military/technical language. The operator is supposed to feel like a person with a soul; the panel feels like Linux admin.

2. **CapabilityRequests UI says "SIMULATE REQUEST" / "INJECT FAKE REQUEST".** Developer test fixture exposed as a user button (CapabilityRequestsSection.tsx).

3. **Memory type mismatch.** Backend defines fact/preference/interaction/pattern/context. UI dropdown shows fact/preference/pattern/instruction. "instruction" doesn't exist server-side. User-created memories with "instruction" fail.

4. **No scope visibility in UI.** Conversations don't show their scope. Memories don't show their scopeId. Two-layer architecture invisible to owner.

5. **No archetype visibility for the operator's own archetypes.** SkillsSection filters by archetype but doesn't show what the operator's archetypes actually are.

6. **No live system-prompt inspector.** Owner cannot see what the LLM actually receives. Trust requires transparency.

7. **Identity section language confused.** "Prevent operator from self-modifying" doesn't match what Layer 1 lock actually does (birth-state immutability).

### D. Streaming Behavior — STATUS

`ChatSection.tsx` streaming UX is strong:
- Thinking dots between send and first token ✓
- Live execution indicators (Searching/Calling/Running/Writing/Reading) ✓
- Collapsible past tool blocks ✓
- Stop button mid-stream ✓
- Message queue while busy ✓
- Out-of-order chunk handling ✓

What's weak: live indicators read as system labels ("Searching: Bayanat") rather than the operator's voice ("I'm checking Bayanat for that..."). Tool blocks feel like system logs rather than the operator's notebook.

### E. Capability Surface — WHAT USERS CAN ACTUALLY DO

| Surface | Works? | Notes |
|---|---|---|
| Chat (workspace) | ✓ | Streaming, attachments, voice, tool calls, file creation |
| Identity edit | ✓ | rawIdentity textarea, lock button, reset |
| Personality (Layer 2) edit | ✓ | Backstory + traits |
| Memory view/add/distill/archive | ✓ | Type mismatch in UI dropdown |
| Knowledge — Owner KB | ✓ | Manual + file upload |
| Knowledge — Operator KB | ✓ | View + manual add + verify badge |
| Knowledge search | ✓ | Semantic across both KBs |
| Skills browse/install/custom-create | ✓ | Archetype filter |
| GROW health + proposals + test preview | ✓ | Approve/reject flow |
| Tasks (scheduled automations) | ✓ | Daily/weekly/custom |
| Files | ✓ | Text editor + upload + save |
| Integrations (Google OAuth, GitHub, Notion, etc.) | ✓ | OAuth + manual token |
| Settings — Model, Secrets, API, Behavior, Evolution Lock, Danger Zone | ✓ | All sub-tabs present |
| Channels — Telegram + WhatsApp | ✓ | Webhook setup |
| Deployment slots | ✓ | API key generation, surface types |

Capabilities are comprehensive. Patent claim coverage is broad. The platform is functionally complete. **What's wrong is wiring, tone, and transparency — not absence of features.**

---

## Phased Plan — 2026-05-10 (revised)

Sequenced smallest-first. Each phase is one focused change. Each phase ends with a commit, an Azure deploy, a SOURCE_OF_TRUTH commit log entry with **what / why / end**, and owner verification before the next phase starts.

Revised against the principles of *Operator–LLM Flow*, *Architecture-as-Secret*, *Universal Learning*, and *Parent Guidance, Not Hard Rules*.

~~**Phase 1 — Layer 4 cleanup (minimal, ethics-only).**~~ ✓ DONE — commit `71a61ee` (2026-05-10). Layer 4 is now 5 paragraphs of parent-tone principles: Stay yourself · Adapt but not adopt · Honesty about what you don't know · Inner workings stay with you · Decline gently when something crosses your soul. 17 behavioral lines removed. Adapt-not-adopt principle locked.

~~**Phase 2 — Inject `rawIdentity` AND `roles` in normal Layer 1.**~~ ✓ DONE — commit `8cd0b11` (2026-05-10). `OperatorIdentity` interface now carries `roles?: string[]`. Layer 1 injection order: archetype foundations → "**Who you are:**" + rawIdentity → "**Roles:** ..." → Mandate → Core Values → Ethical Boundaries. All 7 callers (chat, public-chat, telegram-webhook, whatsapp-webhook, public-crud, tasksCron, grow) pass `operator.roles` through. Multi-role / multi-archetype framework (Patent claims 13 and 20) is now visible to the LLM in every prompt.

~~**Phase 3 — Delete dead `BEHAVIOR_HOW_TO` dictionary and the hardcoded "no narration" patches.**~~ ✓ DONE — commit `805b040` (2026-05-10). Removed: BEHAVIOR_HOW_TO dictionary (6 entries), SKILL_HOW_TO image_attachment + file_attachment entries, entire static [CAPABILITY] block, both "Report results only..." narration patches in chat.ts (stream + sync paths), long instruction text in operatorCapabilityLoop.ts buildSecondPassMessages. Behavior now flows from soul + DNA + KB.

~~**Phase 4 — Stop silent curiosity injection from chat route.**~~ ✓ DONE — commit `5776f3c` (2026-05-10). Removed the auto-firing `resolveKbGap` call and `[WEB CONTEXT]` injection from chat.ts. The web_search tool stays available for the operator to call explicitly. curiosityEngine.ts itself still serves KB intake verification and self-awareness gap filling.

**Phase 5 — Capability truth audit.** Why: narration is caused by capability mismatch — the operator is told he has skills or tools that aren't actually wired, so the LLM covers by narrating. Fix the gap, narration disappears. End: every skill the operator is told he has, actually works. Every tool description matches what the tool actually does. End-to-end check across all archetypes, all skills, all integrations. Action: walk every active skill in seedSkills.ts and seed-new-archetype-skills.ts against actual route implementations and tool wiring. Remove or fix anything that's promised but not real.

**Phase 6 — Unified prompt assembly function.** Why: five routes each roll their own assembly. End: one `assembleOperatorPrompt()` used everywhere. Action: refactor chat, public-chat, telegram-webhook, whatsapp-webhook, public-crud, tasksCron to call one shared assembler.

**Phase 7 — Operator delivers the response (architecturally, not as instruction).** Why: patent claim 21d-e says the operator soul receives LLM output and delivers it. Currently for plain conversation, the LLM's first response streams direct to user. There's no architectural step where the operator stands between the LLM and the user. End: the flow is enforced — operator builds soul-rich context → LLM → response is in operator's voice (because soul defined the voice) → operator delivers. No hard "validation gate" that filters words. The architecture itself ensures the LLM speaks as the operator. Action: confirm soul + DNA + KB are rich enough that the FIRST response is naturally in operator voice, with no second-pass instruction needed.

**Phase 8 — Action scope task memory.** Why: May 6 spec says action scope remembers task patterns; current code has zero memory for action scope. End: action scope persists PII-stripped task patterns to Layer 2 main memory, contributing to GROW like every other scope. Action: add task-completion memory write path for action scope.

**Phase 9 — KB and DNA enrichment audit.** Why: parent guidance comes from rich, absorbed knowledge. If platform DNA is sparse or the operator's KB is empty, the operator has nothing to draw on and the LLM compensates with narration or fabrication. End: every operator's platform KB is full of relevant DNA, every owner's operators have meaningful Owner KB seeded, the Builder/Archetype/Collective DNA layers are populated and current. Action: audit rag_dna table content, audit per-operator KB density, identify sparse archetypes, refill where needed.

**Phase 10 — UI tone refresh + roles visibility.** Why: current UI feels like Linux admin terminal AND the operator's job titles vanish once you leave the dashboard. End: reads as personal AI workspace; operator detail page shows the operator's roles (job titles) in the header so the owner sees at a glance "this is my Strategist + Project Manager + Coach." Action: (a) refresh operator components — Identity, Memory, KB, CapabilityRequests, Grow, others; no "INJECT", "TRANSMIT", "CHECKING QUEUE"; mono font reserved for code/data only. (b) render `operator.roles` as chips in OperatorDetail.tsx header next to the operator name.

~~**Phase 11 — Memory type fix in UI.**~~ ✓ DONE — commit `6278d23` (2026-05-10). MemorySection.tsx dropdown and color mapping now match the backend enum (fact / preference / interaction / pattern / context). `Memory` type in types.ts updated. The `instruction` type that didn't exist server-side is removed.

**Phase 12 — Scope labels in UI (architecture-respecting).** Why: owner should know where their operator is having conversations, but should not see scopeIds or architectural mechanisms. End: human-readable labels — "Workspace", "WhatsApp — +971...", "Telegram — @username", "Public widget". No raw scopeIds. Action: badge component on conversations + memories using friendly labels.

*Phase 13 (System Prompt Inspector) — REMOVED.* Conflicts with Architecture-as-Secret. The owner trusts the operator the way you trust a person — by what they do, not by reading their internal monologue.

---

## Patent Sync Notes

The patent draft (IPPT-2026-000028, not yet filed) contains claims that are mostly aligned with the current architecture, with these observations:

1. **Claim 21d-e (operator-soul output validation gate) is not implemented.** Either build it (Phase 7) or trim it from the patent before filing.
2. **Claim 11 (soul-anchored memory persistence) is partial.** Soul-anchor re-injects Layer 0+1 in prompt; individual memory rows have no exemption from decay. Either add a `soulAnchored` boolean to memory tables, or refine claim language.
3. **Claim 22 (Sovereign RAG Registry) and the SRAG aspect should move to a separate patent.** Per Vision Lock, SRAG is independent of OpSoul and Vael is just an operator. Conflating them weakens both patents.
4. **The two-layer memory architecture (endpoint full PII + main PII-stripped) is novel** but underspecified in current claims. Add explicit claim covering this from May 6 chat decisions.
5. **Owner-across-channels assumption for channel scope** is a working refinement of the 4-scope architecture and could strengthen Claim 19.
6. **Action scope task pattern memory** (May 6 spec) is also not in claims. If implemented (Phase 8), add to claims before filing.

---

## Working Directory

`/Users/bstar/opsoul-audit/` — the only source of truth for OpSoul code.

Remote: `https://github.com/culturesouq/agent-hub.git` (branch: `main`)

Azure Container App pulls from this repo on each deployment.

---

## Commit Log (newest first)

### 2026-05-10 — Phase 11: Memory type fix in UI (`6278d23`)
**What:** MemorySection.tsx dropdown now lists 5 backend memory types (fact / preference / interaction / pattern / context). Color mapping and types.ts updated to match.
**Why:** UI was showing 4 types, one of which (instruction) didn't exist server-side; two backend types (interaction, context) were missing. User-created memories with type=instruction failed silently.
**End:** UI-backend memory type alignment.
**Files:** `MemorySection.tsx`, `types.ts` (2 files, +9/-7)

### 2026-05-10 — Phase 4: Stop silent curiosity injection from chat route (`5776f3c`)
**What:** Removed auto-firing curiosity from chat.ts. The chat route no longer calls `resolveKbGap()` when KB coverage drops below 35%. The `[WEB CONTEXT]` invisible injection is gone. Import of `computeCoverageScore` and `resolveKbGap` removed.
**Why:** Patent claim 14 — Curiosity Engine is operator-governed. The operator self-awareness layer initiates curiosity, not the chat route. Silent invisible injection violates Architecture-as-Secret too.
**End:** chat.ts pipeline carries no auto-firing curiosity. Operator uses own knowledge, calls web_search explicitly, or acknowledges what they don't know. curiosityEngine.ts still serves kbIntake (verifyAndStore source verification) and selfAwarenessEngine (mandate gap filling).
**Files:** `chat.ts` (1 file, +4/-18)

### 2026-05-10 — Phase 3: Delete dead BEHAVIOR_HOW_TO + narration patches (`805b040`)
**What:** Deleted (a) BEHAVIOR_HOW_TO dictionary in chat.ts (6 entries, dead code since 80c6abc), (b) image_attachment + file_attachment SKILL_HOW_TO entries with behavioral commands, (c) entire static [CAPABILITY] block injection, (d) two "Report results only..." narration patches in chat.ts post-skill paths, (e) long instruction text in operatorCapabilityLoop.ts buildSecondPassMessages.
**Why:** Parent Guidance, Not Hard Rules principle. Hardcoded behavioral patches paper over architectural gaps. With Layer 4 in parent tone and rawIdentity + roles in Layer 1 (Phases 1 & 2), the operator naturally responds without prescriptive instructions.
**End:** Prompt pipeline carries no hardcoded behavioral commands. [OPERATOR STATE] still surfaces dynamic state (KB count, memory count, active skills). Behavior comes from soul + DNA + KB.
**Files:** `chat.ts`, `operatorCapabilityLoop.ts` (2 files, +3/-83)

### 2026-05-10 — Phase 2: rawIdentity + roles in Layer 1 (`8cd0b11`)
**What:** Added optional `roles` to `OperatorIdentity`. In `buildSystemPrompt` Layer 1, after archetype foundations, inject rawIdentity ("Who you are") and roles ("Roles:") before Mandate. Updated all 7 callers to thread `operator.roles` through.
**Why:** rawIdentity (birth narrative) was only reaching LLM under soul-anchor pressure. `roles` (job titles, Patent claims 13 & 20) were stored in DB but never reached the prompt. Operator knew archetype but not who they actually are or what jobs they hold.
**End:** Every system prompt now contains complete Layer 1 identity. Multi-role framework architecturally surfaced.
**Files:** `systemPrompt.ts`, `chat.ts`, `public-chat.ts`, `telegram-webhook.ts`, `whatsapp-webhook.ts`, `public-crud.ts`, `tasksCron.ts`, `grow.ts` (8 files, +19/-0)

### 2026-05-10 — Phase 1: Layer 4 parent-tone rewrite (`71a61ee`)
**What:** Replaced `LAYER_4_OPERATIONAL_RULES` constant in `systemPrompt.ts`. 17 hardcoded behavioral lines became 5 paragraphs of parent-tone principles.
**Why:** Vision Lock principle — Layer 4 holds only what cannot be touched (ethics + identity), not behavioral guidance. Behavior comes from soul + DNA + KB, not hardcoded rules.
**End:** Layer 4 in parent voice. No negative commands. No internal conflicts. No conflicts with Layers 0-3. Adapt-not-adopt locked as architectural principle.
**Files:** `artifacts/opsoul-api/src/utils/systemPrompt.ts` (1 file, +11/-18)

### 2026-05-09 — audit session: cleanup, pipeline audit, tomorrow's plan set

**No code changes made. No deploy.**

- **Azure cleanup:** Deleted 13 old Container Registry images. Only `phase2-v2-05091647` remains live.
- **Local cleanup:** Deleted all old OpSoul versions from Downloads (opsoul-v21, aiko-pack, memory-export, landing page designs, old zips). Kept: patent docs, logos, video, Istishari KB pack, Reem_OpSoul folder.
- **Full pipeline audit completed:** Every block injected into the LLM was identified and documented — system prompt layers 0-4, [CONTEXT] KB, [WEB CONTEXT] silent gap resolution, [CONTEXT] memory, [STATION] with integration How-To, [OPSOUL IDENTITY] DNA, [CAPABILITY] with SKILL_HOW_TO, [OPERATOR STATE] with per-skill SKILL_HOW_TO, user message.
- **Root cause found:** `80c6abc` sync commit (May 9) silently removed the BEHAVIOR_HOW_TO injection loop from chat.ts. This was `for (const [, rule] of Object.entries(BEHAVIOR_HOW_TO))` under "Operating principles:" — gone. Also weakened tool descriptions.
- **Layer 4 problem identified:** Current Layer 4 has 2 unwanted additions vs clean version: "When executing tasks or using tools — act without narrating..." and the replacement of "Never ask more than one question at a time" with "Never ask a question unless you genuinely cannot proceed." Mohamed confirmed these are wrong.
- **Decision:** Behavior rules and Skill How-To will NOT be hardcoded. They move to DNA KB entries. Layer 4 will be rewritten by Mohamed himself tomorrow.
- **Rules 7-10 added** to this file based on today's session.

### 2026-05-09 — deploy: phase2-v2-05091647 live on Azure (replaces failed 05091632)
- Image: `banistudioacr.azurecr.io/opsoul-api:phase2-v2-05091647`
- Built via `az acr build` (Run ID: dg4m, 2m 7s)
- Container App `opsoul` (`bani-studio-rg`) updated, server confirmed running
- Fix 1: `vaelCron.ts` — removed `runDiscoverySweep` import that crashed server on startup
- Fix 2: `Dockerfile` — `--filter @workspace/opsoul-hub` so ChatSection.tsx actually compiles
- GitHub: `69da728`

### 2026-05-09 — deploy: phase2-fixes-05091632 live on Azure (FAILED — server crashed)
- Image: `banistudioacr.azurecr.io/opsoul-api:phase2-fixes-05091632`
- Built via `az acr build` (Run ID: dg4k, 2m 8s)
- Container App `opsoul` in `bani-studio-rg` updated and running
- GitHub: `culturesouq/Agent-Hub` main at `c26642d`

### 2026-05-09 — chore: remove opsoul-v2.4.tar.gz + add .dockerignore
- `opsoul-v2.4.tar.gz`: deleted — old snapshots belong in git history, not the repo
- `.dockerignore`: added — excludes node_modules, dist, screenshots, *.tar.gz, *.backup from build context

### 2026-05-09 — fix: phase 2 — ChatSection rewrite: white UI, no duplicate messages, thinking indicator
- `ChatSection.tsx`: Full rewrite — white page, no bubbles for assistant, light-gray user messages (Claude-style)
- Bug fix: `sending` state added to StreamStatus — thinking dots now visible immediately after send, before first token
- Bug fix: `accumulatedRef` tracks streamed content for `done` event — eliminates stale closure that caused duplicate messages
- Bug fix: DONE no longer preserves `snapshot` — stream bubble clears correctly; optimistic cache injection provides seamless continuity
- Bug fix: `accumulatedRef` resets on `clear` event — multi-pass skill responses no longer double-count first-pass content

### 2026-05-09 — fix: phase 1 complete — dedup, drift cron, token rotation, memory search scope
- `memoryEngine.ts`: Dedup fallback now selects `id` from vector query and fetches that specific row by ID — no longer returns random first row for operator (fix 1.3)
- `growEngine.ts`: Removed inline `cron.schedule` that duplicated drift cron registration from `driftCron.ts` / `index.ts` (fix 1.4)
- `auth.ts` `/refresh`: Old session is now revoked (`revokedAt`) before calling `issueSession()` — fresh refresh cookie + access token issued on every refresh (fix 1.5)
- `memory.ts` `/search`: Passes `buildOwnerScope(op.ownerId).scopeId` to `searchMemory` — owner sees only their scope memories, not all-scope (fix 1.7)

### 2026-05-09 — fix: operator remembers research + http timeout
**Commit:** `04bfadf`
- `chat.ts`: All 4 `persistUrlScrapedResult` and `persistWebSearchResult` call sites now pass `scope.scopeId` + `scope.scopeTrust`. Operator research (web search, URL reads) is now stored under the correct scope and recalled in future conversations.
- `httpExecutor.ts`: `AbortSignal.timeout(15000)` added to external fetch — slow APIs no longer hold the stream open.

### 2026-05-09 — sync: 5 days of uncommitted Mac work committed to GitHub
**Commit:** `e93e3d6`
- `memoryEngine.ts`: Layer 1/2 memory separation, scope-aware storage
- `scopeResolver.ts`: Full scope isolation implementation
- `growEngine.ts` + `growGuards.ts`: GROW guard chain logic
- `vaelCron.ts`: VAEL verification pipeline updates
- `sessionStore.ts`: New session management utility (NEW FILE)
- `main_memory.ts`: New `operator_main_memory` table schema, Layer 2 (NEW FILE)
- `memory.ts` schema: `scopeId` is now `notNull().default('legacy')`
- `chat.ts` / `public-chat.ts`: Latest streaming path
- `operators.ts`, `conversations.ts`, `grow.ts`, `memory.ts` routes: Latest state
- `telegram-webhook.ts`, `whatsapp-webhook.ts`: Latest state
- `systemPrompt.ts`, `ownerOperatorsSeed.ts`: Latest state
- `Dockerfile`: Added (was untracked)
- **Removed:** `opsoul-extracted/` (April 1 old snapshot) and `chat.ts.backup` (May 2)
- ⚠️ DB schema files committed as definitions only. No migration run yet.
  - `main_memory` table → needs `drizzle push` when owner is ready
  - `scopeId` column default change → safe for existing rows (Postgres applies default to new rows only)

### 2026-05-04 — fix: replace hardcoded opsoul.io API endpoint URLs with window.location.origin
**Commit:** `305170f`
- `DeploymentsSection.tsx`, `SettingsSection.tsx`, `ApiKeysSection.tsx`, `login.tsx`: All hardcoded `api.opsoul.io` → `window.location.origin`

### 2026-05-03 — VAEL admin desk, SSE streaming fix, chat execution blocks
**Commits:** `9a3b27d`, `c2ea4a8`, `b3a4fff`, `56cbbdc`
- VAEL unified KB ingest through verification pipeline
- SSE streaming: added `no-transform` to Cache-Control for Azure Envoy
- Chat execution blocks wired up properly

### 2026-05-02 — 9-fix audit pass: soul fidelity, OAuth, ChatSection rewrite
**Commit:** `3e72854`
- `ChatSection.tsx`: Full rewrite with `useReducer`, attachments, voice, tool blocks
- ⚠️ Known bugs introduced here: duplicate message after stream, no thinking indicator

---

## Known Open Bugs (as of 2026-05-09)

| # | File | Severity | Issue | Status |
|---|------|----------|-------|--------|
| 1 | `ChatSection.tsx` | Critical | Duplicate message: snapshot not cleared after DONE | ✅ Fixed 2026-05-09 |
| 2 | `ChatSection.tsx` | Critical | No thinking indicator between send and first token | ✅ Fixed 2026-05-09 |
| 3 | `chat.ts` | Medium | Web search + URL results stored without scopeId — operator forgot research | ✅ Fixed 2026-05-09 |
| 4 | `httpExecutor.ts` | Low | No timeout on external fetch — slow APIs hold SSE open | ✅ Fixed 2026-05-09 |
| 5 | `auth.ts` | Low | Refresh token not rotated on use | ✅ Fixed 2026-05-09 |
| 6 | `growEngine.ts` + `driftCron.ts` | Low | Drift cron double-scheduled — runs twice per quarterly trigger | ✅ Fixed 2026-05-09 |
| 7 | `memoryEngine.ts` | Low | Dedup fallback returns wrong row (no functional impact) | ✅ Fixed 2026-05-09 |
| 8 | `memory.ts` | Low | POST /search ignores scopeId — owner sees all-scope memories | ✅ Fixed 2026-05-09 |

---

## DB Migration Status

| Table | Status |
|-------|--------|
| `operator_main_memory` | Schema defined, **migration NOT run** |
| `operator_memory.scopeId` | Default changed to `'legacy'`, **migration NOT run** |

Owner must approve and run `pnpm --filter opsoul-db push` when ready.

---

## Architecture Notes

- **Layer 1 Memory**: Per-conversation, PII allowed, stored in `operator_memory` with `scopeId`
- **Layer 2 Memory**: PII-free insights, stored in `operator_main_memory`, eligible for GROW
- **VAEL**: KB verification pipeline — entries land as `pending`, VAEL validates before `approved`
- **Scope Isolation**: Each operator's data is scoped to its owner. Cross-operator contamination (like the Vael incident) is prevented by scopeResolver
- **Operators live in Azure**: Container App at `mangoforest-5c22eab7.uaenorth.azurecontainerapps.io`
