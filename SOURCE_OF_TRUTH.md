# OpSoul — Source of Truth

> One file. Read top to bottom.
> Live state at the top. Principles in the middle. Full history at the bottom.

---

## 1. Live Deployment (as of 2026-05-10)

| What | Value |
|---|---|
| **Live URL** | `https://opsoul.mangoforest-5c22eab7.uaenorth.azurecontainerapps.io/` |
| **Container App** | `opsoul` (resource group `bani-studio-rg`, region `uaenorth`) |
| **Active Revision** | `opsoul--0000037` |
| **Image** | `banistudioacr.azurecr.io/opsoul-api:memdistill-ae32a8a` |
| **Source commit** | `ae32a8a` (HEAD of `main`) |
| **Build** | ACR Run ID `dg4q` (2m 7s, 2026-05-10) |

### ACR (Azure Container Registry) — `banistudioacr`

| Repository | Tags | Status |
|---|---|---|
| `opsoul-api` | `memdistill-ae32a8a` (only) | Live — used by revision 0000037 |
| `opsoul` | — | **DELETED** (was holding old `v20260504…` `v20260505…` tags) |
| `opsoul-hub` | — | **DELETED** (no longer used; hub is built into the `opsoul-api` image) |
| `bani-studio`, `foundermoment`, `hafeet-tutoring`, `nahilai`, `sovereign-rag` | — | Untouched (other projects) |

Old `opsoul-api:phase2-v2-05091647` tag also deleted. Only the live image remains.

Old container app revisions (`opsoul--0000001` through `opsoul--0000034` plus `opsoul--dg13…dg19`, `opsoul--r2`, `opsoul--r3`, `opsoul--06p2you`) are deactivated. Azure auto-prunes inactive revisions; CLI does not allow hard-delete.

---

## 2. Working Directory & Repos

| Layer | Location |
|---|---|
| **Mac (source of truth)** | `/Users/bstar/opsoul-audit/` |
| **GitHub** | `https://github.com/culturesouq/Agent-Hub.git` (branch `main`) |
| **Azure** | Pulls image from `banistudioacr.azurecr.io` on each `az containerapp update` |

Mac = GitHub = Azure. Always.

---

## 3. Rules

1. **Mac = GitHub = Azure. Always.** Before any deployment, `git status` must be clean and `git diff origin/main` must be empty. If not — commit first.
2. **Commit before you close.** Every session that touches code ends with a commit and push. No uncommitted work left overnight.
3. **No backup files in the repo.** Old versions live in git history (`git show <commit>:path/to/file`). Delete `.backup`, old snapshots, extracted directories immediately.
4. **Never run DB migrations without explicit owner approval.** Schema files (`.ts`) can be committed. `drizzle push` / `drizzle migrate` requires the owner to approve and run manually.
5. **Azure deploys via `az acr build` + `az containerapp update`.** No manual file edits on Azure directly. All changes: Mac → commit → push → build → roll revision.
6. **Source of truth file updated after every commit.** Add what changed, date, **and the WHY — what end the change serves**. Confusion does not get to repeat.
7. **No code changes without explicit owner approval — word by word.** Claude reads and reports. Mohamed decides. Claude executes only after yes.
8. **No summaries when full text is requested.** Owner sees full content, not paraphrases.
9. **Layer 4 rules written by Mohamed only.** Nothing added to Layer 4 that Mohamed did not write himself. Approved text locked here verbatim before any commit.
10. **No BEHAVIOR_HOW_TO or SKILL_HOW_TO hardcoded in system prompt or chat pipeline.** Behavior and skill guidance lives in platform DNA KB entries only — managed, versioned, not buried in code.
11. **Be careful what you feed the operator.** Memory and KB receive *filtered facts*, never raw output. Web search results, scraped pages, and skill outputs flow through a distillation step before they reach `operator_memory`. **Never paste structured data (YAML, JSON, key:value blocks) into prose fields like `backstory` or `rawIdentity`.** Backstory is for prose. Layer 2 fields (toneProfile, emotionalRange, etc.) are for the structured slots. Mixing them confuses GROW and the operator's self-awareness.

---

## 4. Vision Lock — 2026-05-10

The following are locked. They do not change without explicit owner approval recorded in this document with a timestamp and a reason.

### Operator–LLM Flow (the architecture, not a rule)

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

---

## 5. Architecture — Locked Engines

The following engines and components are patent-protected core. Their existence is locked. Only their **wiring, injection, and tone** are open for refinement.

1. Five-layer prompt architecture: Layer 0 → Layer 1 → Layer 2 → Layer 3 → Layer 4
2. Birth conversation engine → raw identity generation → Layer 1 permanent database lock
3. **Multi-role / multi-archetype identity framework** — N roles (human-readable job titles, picked at birth from a valid taxonomy) and N archetypes (proprietary cognitive types, internal) operating under one unified soul. The roles are the user-facing job titles displayed on operator cards. The archetypes are the cognitive style internals, not exposed. Together they solve the multi-agent swarm coordination problem: where prior art needs N coordinating agents with N identities to serve N roles, OpSoul achieves the same coverage through one operator with one soul, one memory, one GROW cycle, no inter-agent coordination overhead. (Patent claims 13 and 20.)
4. Basic archetype skills auto-injected at birth (loaded virtually per-request via `loadArchetypeSkills`)
5. **Universal "Built-in" skills** — every operator has these regardless of archetype: `web_search`, `kb_seed`, `write_file`, `read_file`, `list_files`, `schedule_task`, `update_task`, `pause_task`, `resume_task`, `delete_task`, `http_request` (when secrets stored)
6. GROW engine with three guards: PII hard block, Layer 1 immutable lock, semantic identity manipulation detector (13 patterns), quarterly cumulative drift (30% threshold)
7. Four governance levels: OPEN, CONTROLLED, LOCKED, FROZEN
8. Curiosity engine — knowledge gap detection, four-tier source trust, dual corroboration required (operator-initiated only — no auto-injection from chat route)
9. Two-layer memory architecture — endpoint Layer 1 (full PII allowed, scope-bound) + main Layer 2 (PII-stripped, GROW-eligible)
10. Five memory types: fact, preference, interaction, pattern, context. Decay 5%/day, archive at 5%, cosine 0.55, top 8.
11. Self-awareness engine — health score, workspace manifest, capability state, task history, mandate gaps
12. Scope-isolated conversation architecture — four scope types: public, authenticated, action, channel. Mandatory scopeId at every API call. Cross-scope information transfer architecturally impossible. **All four feed Layer 2 main memory** (action scope contributes via task pattern distillation).

### Out of Scope — NOT OpSoul Core

- **Vael is an operator like any other.** Born through the birth protocol. Has a knowledge-governance mandate. Runs on OpSoul. Vael is not a platform feature.
- **VAEL Intelligence Desk** (in `AdminPage.tsx`) is the live interface for DNA enrichment. Hajeri drops content there; Vael verifies, classifies, scores, populates the DNA Library.
- **SRAG is an independent system.** It consumes OpSoul operators externally. Will be separately patented. Not part of OpSoul core. Not part of OpSoul claims.

---

## 6. Patent Sync Notes

The patent draft (IPPT-2026-000028, not yet filed) needs these reconciliations before filing:

1. **Claim 21d-e (operator-soul output validation gate)** — confirmed met by architecture, not by output filter. The LLM speaks in operator voice because soul + DNA + rawIdentity + roles all reach it in the prompt. No second-pass gate exists or is wanted (would violate Architecture-as-Secret). Either rewrite the claim to describe architectural enforcement, or trim it.
2. **Claim 11 (soul-anchored memory persistence)** — partial. Soul-anchor re-injects Layer 0+1 in prompt; individual memory rows have no exemption from decay. Either add a `soulAnchored` boolean to memory tables, or refine claim language.
3. **Claim 22 (Sovereign RAG Registry)** — should move to a separate patent. Per Vision Lock, SRAG is independent of OpSoul. Conflating them weakens both patents.
4. **Two-layer memory architecture (endpoint full PII + main PII-stripped)** is novel but underspecified in current claims. Add explicit claim covering this from May 6 chat decisions.
5. **Owner-across-channels assumption for channel scope** is a working refinement of the 4-scope architecture and could strengthen Claim 19.
6. **Action scope task pattern memory** (May 6 spec) — IMPLEMENTED in commit `2aae497`. Add to claims before filing as a clause under Claim 19 (multi-scope deployment with isolated learning).

---

## 7. Open Items

| Item | Status |
|---|---|
| **Phase 5 — Capability truth audit** | Initial fix shipped (`7051478` — archetype skills now actually execute). Full skill-by-skill walk against route implementations still owed. |
| **Phase 9b — Vael `rag_sources` population** | Open. Vael needs ground truth to validate against. Drop documents/URLs through the Submit to VAEL panel. |
| **Phase 10b — Tone refresh remainder** | Done in cleanup commit `fd20792`. (IdentitySection, KbSection, MemorySection, GrowSection, SkillsSection, OperatorCard, login all retoned.) |
| **DB migration — `operator_main_memory`** | Schema in repo, NOT run on prod. Owner must approve and run `pnpm --filter opsoul-db push`. |
| **DB migration — `operator_memory.scopeId`** | Default changed to `'legacy'`, NOT run. Safe (Postgres applies default to new rows only). |
| **Known bugs (May 9 list)** | All 8 fixed and shipped. See history below. |
| **LLM provider alternative — DeepSeek R + Kimi K2** | Open. Conversation started 2026-05-09 evening: explore replacing/supplementing OpenRouter with direct DeepSeek (reasoning) and Kimi (Moonshot) model access — both have free tiers usable for development and lower-cost paths for production. Never finished because the OpSoul cleanup work took over the session. Resume when stable. |
| **UI/backend default model mismatch** | Open. `SettingsSection.tsx:416` reads `operator.defaultModel ?? "opsoul/auto"`. When `defaultModel` is NULL, the UI shows "OpSoul Auto" but the backend treats NULL as Sonnet (`chat.ts:833` falls back to `CHAT_MODEL`). If the owner clicks Save in Settings without changing the dropdown, the form submits `'opsoul/auto'` and silently flips the operator from Sonnet to auto-routing (which can downgrade to Haiku on short messages). Fix: make UI display match backend behavior — either NULL → Sonnet label, or NULL → genuinely auto on backend too. |
| **OpenRouter credit monitoring** | Open. Low-credit conditions cause silent quirky behavior (model substitution, narration drift). Add a credit-balance check + UI banner when balance drops below a threshold. |
| **Per-message model record** | Open. Currently no DB column captures which model handled which message — only console.log of auto-routing decisions. Hard to audit operator behavior after the fact. Add `model` column to `messages` table when migration window opens. |

---

## 8. Commit History — newest first

### 2026-05-10 — Filter web/URL/skill output before persisting to memory (`ae32a8a`)

**What:** Memory was storing raw search snippets, scraped pages, and skill outputs as the first 400-600 chars sliced from the source. The operator was learning from URLs, navigation boilerplate, and snippet fragments instead of facts. Added `distillRawContentForMemory()` in memoryEngine.ts — a Haiku one-shot that extracts ONE clean factual sentence (max 240 chars, URLs/dates/markdown stripped). Returns `null` ("NONE") when there's nothing worth remembering. Wired into all three persist paths: `persistUrlScrapedResult`, `persistWebSearchResult`, `persistSkillResult`. Conversation log keeps full raw content; only long-term memory gets the filtered version.

**Why:** Operators couldn't actually learn from raw scrape junk. Filtered facts = real recall. (Hajeri caught this looking at memory entries.)

**Deploy:** Built as `memdistill-ae32a8a` (ACR Run `dg4q`). Rolled to revision `opsoul--0000037`. Old image `hide-archetype-7895e75` deleted from ACR.

**Files:** 2 changed, +95 / −31.

### 2026-05-10 — Hide archetype from owner-facing surfaces (`7895e75`)

**What:** Owner caught the Skills page leaking the archetype concept — section header "From your archetypes" with archetype names listed underneath, plus per-skill archetype badges in the browse library. That violated Architecture-as-Secret. Removed every owner-facing reference to archetypes:
- SkillsSection: "From your archetypes" → "Specialty skills" with sub-header "Comes with your operator". Archetype name list deleted. Browse library: no archetype filter, no per-skill archetype badge, no "Show all" toggle.
- OperatorDetail: stops passing archetype prop to SkillsSection.
- AdminPage DNA Library: row label no longer shows archetype.
- DocsPage: Soul description "name, archetype, mandate" → "name, role, mandate".
- LandingPage: image alt text "archetype portrait" → "portrait".
- API responses: `/operators/:id/skills/manifest` dropped `archetypes` array, renamed `archetype` field → `specialty`. `/operators` GET, `/admin/operators` list: dropped archetype field.
- Frontend types: `Operator`, `PlatformSkill`, AdminPage local types — archetype field removed. `ArchetypeSkillCard` renamed `SpecialtySkillCard`.

**Kept internal:** DB column `operators.archetype`, `OperatorIdentity.archetype` in systemPrompt.ts (sent to LLM in prompt — invisible to user), Vael's classifier logic in adminRag.ts.

**Why:** Patent claims 13 and 20 depend on the archetype machinery being non-obvious. The owner sees roles (job titles), not the cognitive types beneath. Architecture-as-Secret enforced.

**Verification:** `grep -ri archetype hub/src/` → zero hits in any user-rendered string.

**Deploy:** Built as image `hide-archetype-7895e75` (ACR Run `dg4p`). Rolled to revision `opsoul--0000036`. Old `cleanup-fd20792` image deleted from ACR.

**Files:** 9 changed, +23 / −53.

### 2026-05-10 — full cleanup & deploy session

19 commits. Pushed to GitHub at `fd20792`. Built as image `cleanup-fd20792`. Live as revision `opsoul--0000035`.

#### Cleanup pass (`fd20792`)
**What:** Station control + UI tone + visual flatten + dead code, all in one commit. (a) Added 4 task-management tools — `update_task`, `pause_task`, `resume_task`, `delete_task` — wired in both stream and sync paths, plus matching cards in BUILTIN_SKILLS. Operator can now fully manage its own automations from chat. (b) Stripped `font-mono` / `uppercase` / `tracking-widest` / `tracking-[0.22em]` from every operator workspace component (Memory, Identity, Files, Grow, KB, Settings, ApiKeys, Deployments, CreateAgentChat, Dashboard, OperatorDetail, login). Kept `font-mono` only on actual code (chat code blocks, API key display, endpoint examples, file editor textarea). (c) Dashboard operator cards lost gradient overlay, hover-scale-105, 500ms transitions. MemorySection cards lost left accent bar, bg-card/30 nesting, nested progress bars. (d) Deleted 33 unused UI components (accordion, calendar, carousel, etc.) — none referenced anywhere. Verified `skill.isActive` is real (DB column + PATCH endpoint), badge stays.
**Why:** Workspace UI was reading like Linux admin. ChatSection is the gold standard — white page, plain English. This pass aligns the rest of the workspace with that tone, and gives the operator full station agency from chat.
**Files:** 48 changed, +655 / −4,092
**Commit:** `fd20792`

#### Phase B — Built-in skills system (3 commits)

| | What | Commit |
|---|---|---|
| **B1** | Added 3 universal agent tools: `read_file`, `list_files`, `schedule_task` (operator creates own daily/weekly automation, inserts into tasks table with `status='active'`, `integrationLabel='self_scheduled'`). Both stream and sync paths. | `0386eb9` |
| **B2** | New `utils/builtinSkills.ts` defines BUILTIN_SKILLS catalog with availability flags (always / web / secrets). New endpoint `GET /operators/:id/skills/manifest` returns the 3-layer stack `{ builtin, archetype, custom }`. | `3673773` |
| **B3** | SkillsSection rewritten — terminal-style left/right panels became three stacked sections: Built-in capabilities · From your archetypes · Added by you. Browse library moved to a modal. | `2dcd299` |
| log | SOURCE_OF_TRUTH update + Phase 9 reframe (VAEL Desk handles enrichment, not seed scripts). | `86ef701` |

#### Phase 1-12 — Audit-driven cleanup (sequenced)

| Phase | What | Commit |
|---|---|---|
| 1 | Layer 4 rewrite — 17 hardcoded behavioral lines → 5 paragraphs of parent-tone principles (Stay yourself · Adapt but not adopt · Honesty · Inner workings stay · Decline gently). | `71a61ee` |
| 2 | rawIdentity + roles injected in Layer 1 of every prompt. Multi-role / multi-archetype framework (Patent claims 13, 20) now reaches the LLM. All 7 callers updated. | `8cd0b11` |
| 3 | Deleted dead BEHAVIOR_HOW_TO dictionary, image_attachment + file_attachment SKILL_HOW_TO entries, [CAPABILITY] static block, narration patches in chat.ts (stream + sync), long buildSecondPassMessages text. | `805b040` |
| 4 | Removed silent curiosity injection from chat route. Operator self-awareness initiates curiosity now. | `5776f3c` |
| 5 | Capability truth fix — archetype skills (no integrationType) now actually execute via LLM synthesis instead of failing at "could not run". | `7051478` |
| 6 | Unified prompt assembly — new `assembleOperatorPrompt()` used by all 6 routes (chat, public-chat, telegram, whatsapp, public-crud, tasksCron). 90 lines deleted, 43 added. | `a77fa91` |
| 7 | Confirmed operator-as-deliverer is architectural (not a gate). Cleaned behavioral fragments from tool descriptions and SKILL_HOW_TO. | `e74520d` |
| 8 | Action scope task pattern memory — new `distillActionTaskPattern()`. PII-free patterns flow into Layer 2 main memory. All 4 scopes now feed GROW. | `2aae497` |
| 9 | KB/DNA enrichment audit — re-framed: VAEL Desk handles ongoing enrichment live. Only open follow-up: populate Vael `rag_sources`. | (no code) |
| 10 | UI tone refresh + roles in operator detail header. (Completed in `fd20792` cleanup pass.) | `d3db2be` |
| 11 | Memory type fix in UI — dropdown matches backend enum (5 types). | `6278d23` |
| 12 | Scope labels in UI — `formatScopeLabel()` helper, badges on memories and conversations ("Workspace", "WhatsApp — +971…", etc.). | `6b58548` |

#### Deploy & cleanup (`fd20792` → revision `0000035`)

| Step | Outcome |
|---|---|
| `git push origin main` | 26 commits pushed to `culturesouq/Agent-Hub`. |
| `az acr build` | Built `opsoul-api:cleanup-fd20792` (Run ID `dg4n`, 2m 8s). |
| `az containerapp update` | Rolled to revision `opsoul--0000035`. Old `0000034` retired. |
| Live test | `curl https://opsoul…` → HTTP 200. |
| ACR cleanup | Deleted `opsoul` repo (all old `v20260504…` `v20260505…` tags). Deleted `opsoul-hub` repo. Deleted `opsoul-api:phase2-v2-05091647` tag. Only `opsoul-api:cleanup-fd20792` remains. |

---

### 2026-05-09 — pre-cleanup state

**No code changes. Audit + planning session.**

- Pipeline audit completed — every block injected into the LLM identified.
- Root cause of regression found: `80c6abc` sync commit (May 9) silently removed `BEHAVIOR_HOW_TO` injection loop.
- Layer 4 unwanted additions identified.
- Decision locked: behavior rules move out of code into DNA KB entries. Layer 4 to be rewritten by Mohamed.
- Local cleanup: deleted old OpSoul versions from Downloads.
- Azure cleanup: deleted 13 old container registry images. Only `phase2-v2-05091647` remained at the time.
- Rules 7-10 added to this file.

#### Earlier 2026-05-09 deploys

| Image | Outcome | Commit |
|---|---|---|
| `phase2-v2-05091647` | Live (was the running revision until 2026-05-10 cleanup) | `69da728` |
| `phase2-fixes-05091632` | FAILED — server crashed | `c26642d` |

#### 2026-05-09 fixes (Phase 1 & 2)

- ChatSection rewrite — white UI, no duplicate messages, thinking indicator (Phase 2)
- 9 bugs fixed (dedup, drift cron, token rotation, memory search scope, web research persistence, http timeout, etc.) (Phase 1)
- 5 days of uncommitted Mac work synced (`e93e3d6`) — included Layer 1/2 memory separation, scope-aware storage, GROW guards, VAEL pipeline, sessionStore, main_memory schema. Removed `opsoul-extracted/` and `chat.ts.backup`.
- `chore: remove opsoul-v2.4.tar.gz + add .dockerignore`
- `fix: replace hardcoded opsoul.io endpoints with window.location.origin` (`305170f`)

### 2026-05-03 to 2026-05-04

- VAEL admin desk live (`9a3b27d`, `c2ea4a8`, `b3a4fff`, `56cbbdc`)
- SSE streaming Cache-Control fix for Azure Envoy
- `fix: replace hardcoded opsoul.io API endpoint URLs` (`305170f`)

### 2026-05-02

- `9-fix audit pass`: ChatSection rewrite with `useReducer`, attachments, voice, tool blocks (`3e72854`)
- ⚠️ Known bugs introduced here, fixed in 2026-05-09 phase 2.

---

## 9. Historical — Audit findings (2026-05-09 snapshot)

Preserved for context. State of OpSoul on commit `9c61a15`, image `phase2-v2-05091647`, revision `opsoul--0000034`. **All items below have since been addressed in the 2026-05-10 cleanup work above.**

### A. Core Engines — STATUS

| Engine | State (May 9) | Resolution |
|---|---|---|
| 5-layer prompt architecture | Built and injected | No change needed |
| Birth → Layer 1 lock | Working | No change needed |
| Multi-archetype framework | Working | No change needed |
| Multi-role framework (job titles) | Partially working — not in Layer 1, not in operator detail | ✓ Phase 2 (Layer 1) + Phase 10 (operator detail) |
| Archetype skills auto-inject | Working | No change needed |
| GROW engine | Working | No change needed |
| Drift detection | Working | No change needed |
| Curiosity engine | Working | No change needed |
| Two-layer memory | Working | No change needed |
| Memory decay | Working | No change needed |
| Self-awareness engine | Working | No change needed |
| Scope isolation (4 types) | Working | ✓ Phase 8 added action scope memory |

### B. Wiring / Injection Defects — RESOLVED

| # | Defect | Resolution |
|---|---|---|
| 1 | Layer 4 had 2 non-Mohamed behavioral lines | ✓ Phase 1 |
| 2 | `rawIdentity` missing from normal Layer 1 | ✓ Phase 2 |
| 3 | `BEHAVIOR_HOW_TO` dead code | ✓ Phase 3 |
| 4 | Curiosity silently injected from chat route | ✓ Phase 4 |
| 5 | No operator-soul output validation gate | ✓ Phase 7 (architecturally enforced, no gate needed) |
| 6 | Action scope had zero memory | ✓ Phase 8 |
| 7 | Tool descriptions softened | ✓ Phase 7 cleanup |
| 8 | 5 routes each rolled their own prompt assembly | ✓ Phase 6 |

### C. UI / UX Defects — RESOLVED

| # | Defect | Resolution |
|---|---|---|
| 1 | Tone reads as developer dashboard | ✓ Cleanup pass `fd20792` |
| 2 | "INJECT INTO QUEUE" / "TRANSMIT RESPONSE" terminology | ✓ Phase 10 |
| 3 | Memory type mismatch | ✓ Phase 11 |
| 4 | No scope visibility | ✓ Phase 12 |
| 5 | No archetype visibility on operator detail | ✓ Phase 10 (roles chips) + Phase B3 (skills manifest shows archetypes) |
| 6 | No live system-prompt inspector | Removed from plan — conflicts with Architecture-as-Secret |
| 7 | Identity section language confused | Open — copy refinement deferred |

### D. Streaming Behavior

`ChatSection.tsx` UX strong as of May 9. Live indicators read as system labels — not addressed in this cleanup; deferred. Style untouched as ChatSection is the gold standard for tone.

### E. Capability Surface

All 15 capability surfaces working as of May 9 (Chat, Identity, Personality, Memory, Owner KB, Operator KB, Skills, GROW, Tasks, Files, Integrations, Settings, Channels, Deployments, API Keys). The 2026-05-10 work expanded the operator's tool count from 4 to 11 universal tools.
