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
| **Phase 9b — Vael `rag_sources` population** | **Vael connected (2026-05-11).** Continue dropping ground-truth documents through Submit to VAEL — **one at a time**, owner verifies Vael's review of each before the next (see "Seeding cadence" below). |
| **Nahil operator — app wiring + first insight drops** | **Nahil operator created in OpSoul on 2026-05-11.** Tomorrow (2026-05-12): connect Nahil app's chat route to OpSoul (`OPSOUL_NAHIL_KEY` already in env), then begin one-at-a-time KB drops via Nahil Desk (EJFA → ICBA → ADAFSA). Same one-at-a-time rule as Vael — see "Seeding cadence" below. |
| **Phase 10b — Tone refresh remainder** | Done in cleanup commit `fd20792`. (IdentitySection, KbSection, MemorySection, GrowSection, SkillsSection, OperatorCard, login all retoned.) |
| **DB migration — `operator_main_memory`** | Schema in repo, NOT run on prod. Owner must approve and run `pnpm --filter opsoul-db push`. |
| **DB migration — `operator_memory.scopeId`** | Default changed to `'legacy'`, NOT run. Safe (Postgres applies default to new rows only). |
| **Known bugs (May 9 list)** | All 8 fixed and shipped. See history below. |
| **LLM provider alternative — Kimi K2.6 + DeepSeek V3** | **Direction set 2026-05-11, validation pending.** See "LLM Routing Strategy" below this table. |
| **UI/backend default model mismatch** | Open. `SettingsSection.tsx:416` reads `operator.defaultModel ?? "opsoul/auto"`. When `defaultModel` is NULL, the UI shows "OpSoul Auto" but the backend treats NULL as Sonnet (`chat.ts:833` falls back to `CHAT_MODEL`). If the owner clicks Save in Settings without changing the dropdown, the form submits `'opsoul/auto'` and silently flips the operator from Sonnet to auto-routing (which can downgrade to Haiku on short messages). Fix: make UI display match backend behavior — either NULL → Sonnet label, or NULL → genuinely auto on backend too. |
| **OpenRouter credit monitoring** | Open. Low-credit conditions cause silent quirky behavior (model substitution, narration drift). Add a credit-balance check + UI banner when balance drops below a threshold. |
| **Per-message model record** | Open. Currently no DB column captures which model handled which message — only console.log of auto-routing decisions. Hard to audit operator behavior after the fact. Add `model` column to `messages` table when migration window opens. |
| **Universal temporal substrate** | **Shipped 2026-05-13** (`d5df3f8`). Every operator's system prompt opens with `**Now:** <weekday, date, time> · GST (Asia/Dubai)`. First version included a behavioral clause (`"Use this for any question..."`) which violated § 4 line 93 — hotfix `42657dd` stripped it. Note: hotfix did NOT fix the Vael tool-loop issue that was observed concurrently — that issue has a separate, unrelated root cause (see "Vael tool-loop" below). Substrate itself works as intended; Nahil correctly reports today's date now. Live as image `hotfix-42657dd`, revision `opsoul--0000039`. |
| **Vael "hi" → tool-loop soul-failure** | **Open, root cause not yet confirmed.** Vael "hi" returns the `soulFailureResponse(operator, 'execution', 'tool loop', 'No result was produced.')` string from `chat.ts:1926`. Hypothesis: Sonnet 4.5 streaming with 11 tools (web_search + kb_seed + 7 task tools + http_request — enabled because Vael has `SOVEREIGN_RAG_*` secrets) + 16-message history of past web_search calls → LLM tool-calls on the new "hi" without producing user text → MAX_ITER (8) hit → empty content → soul-failure. Not caused by temporal substrate (hotfix proved that — still fails after fix). Needs deeper investigation: reproduce on a fresh conversation, check if Vael's KB pushes tools, possibly trim Vael's history or reduce iter eagerness for short inputs. Do NOT modify Vael's soul/skills/identity. |
| **Nahil "hi" → "Server error 404"** | **Root cause confirmed + fixed 2026-05-13.** Nahil's owner conv list contained a stray conversation (`cc494a1d`) I accidentally created at 10:30 today via a smoke test (POST /v1/chat with `userId: "farmer-test-42"`). That conv was stored with `owner_id = <real owner>` but `scope_id = "authenticated:farmer-test-42"`. The `/api/operators/:id/conversations` GET endpoint filtered by `owner_id` + `scope_type='authenticated'` but NOT by `scope_id`, so Hub UI received both convs, picked the newer one (the polluted one) as active. The subsequent POST to `/messages` was correctly rejected by `chat.ts:298` because the chat handler DOES filter by `scope_id` — returns 404 "Conversation not found" — and Hub UI displayed "Server error 404. Please try again." Two fixes: (a) deleted the stray conv row + its 2 messages via SQL admin op, (b) patched `conversations.ts` list query to filter `scope_id = buildOwnerScope().scopeId` exactly. List endpoint and messages endpoint now agree on the scope. Architectural fix — applies to every operator going forward. |

### Seeding cadence — one insight at a time (rule, 2026-05-11)

For every operator (Vael, Nahil, future), **knowledge is seeded one insight at a time**. The owner drops one document/URL, the operator reviews it (classify, approve/reject, score, atomize), the owner confirms the operator's review, and **only then** the next drop. No CSV imports, no batch URL lists, no parallel multi-article seeding into the operator-review step.

The raw collection step (crawling, scraping, parsing) may be bulk — that's plumbing. The promotion step where the operator turns a raw item into a stored insight must be sequential and human-witnessed.

**Why:** Owner stated 2026-05-11: bulk drops are confusing, the owner cannot verify each insight against the operator's understanding, and tone/framing drift goes undetected. Sequential seeding is a quality-control mechanism on the operator's growth, not a workflow preference. This is enforced for all operators.

**How it shapes UI / tooling:** Nahil Desk and Submit-to-VAEL must present items one-at-a-time for review (not as a queue dashboard tempting the owner to mass-approve). If a queue view is ever built, "approve all" / "bulk approve" must be absent. SRAG promotion-to-insight inherits the same rule.

### LLM Routing Strategy — pending validation (2026-05-11)

Direction locked, not yet swapped in code. Trigger: Moonshot released **Kimi K2.6** on 2026-04-20 — open-weight 1T-param MoE, 256K context, with an **Agent Swarm system scaling to 300 sub-agents and 4,000 coordinated steps**. That swarm architecture is the closest external analogue to OpSoul's multi-role / multi-archetype framework (§5 item 3 + patent claims 13, 20), making it the right candidate to host operator brains at ~4× lower cost than Claude Sonnet 4.5.

**OpenRouter pricing snapshot (2026-05-11):**

| Model | Input $/M | Output $/M | Context | Role |
|---|---|---|---|---|
| Claude Sonnet 4.5 | $3.00 | $15.00 | 1M | current baseline for operator brains |
| **Kimi K2.6** | $0.75 | $3.50 | 256K | target for operator brains (post-validation) |
| **DeepSeek V3** | $0.32 | $0.89 | 164K | bulk / cheap tasks (distillation, classification) |
| DeepSeek R1 | $0.70 | $2.50 | 64K | not selected — context too small for full prompt stack |

**Target routing (post-validation):**

1. **Operator brains** (chat, public-chat, telegram, whatsapp, action runs) → Kimi K2.6
2. **Distillation jobs** (`distillRawContentForMemory`, `distillActionTaskPattern`, GROW summarization) → DeepSeek V3
3. **Translation** (OpSoul does not own this — Authentic Tour does, stays on OpenAI free tier)
4. **Sonnet** → kept as fallback flag per operator until Kimi K2.6 is proven on the dimensions below

**Validation gate — must pass before any production swap:**

The "no LLM fallbacks" rule and "no prompt changes without approval" rule together mean a cheaper model that flattens an operator is worse than an expensive one that holds. Validation runs against the four risk vectors specific to OpSoul:

| Risk | Test |
|---|---|
| **Identity / soul fidelity** | Side-by-side: same Layer 0+1 prompt, 10 real user messages each for Vael, Istishari, Nahil, Bani. Sonnet vs Kimi K2.6. Owner reads both outputs. K2.6 must hold soul voice, not flatten to generic helpful-assistant tone. |
| **Scope isolation** (§5 item 12 — patent claim) | K2.6's Agent Swarm explicitly *coordinates* across sub-agents — that is the architectural opposite of OpSoul's scope isolation. Need to confirm a single K2.6 call serving one operator/scope does not leak into another concurrent operator/scope. Run two operators in parallel on same K2.6 key, inspect for cross-bleed in memory + responses. |
| **Arabic + cultural fidelity** | Chinese-origin model. Test Vael (Arabic-mode), Istishari, Nahil on real Arabic conversations. Compare against Sonnet baseline for dialect accuracy, cultural register, RTL formatting. |
| **Tool use** (multi-step skill chains) | OpSoul's 11 built-in skills + archetype skills depend on function-calling fidelity. Test Bani spinning up an app (read_file → write_file → http_request chain) end-to-end on K2.6. |

**Validation procedure (suggested):**

1. Add Kimi K2.6 to the model dropdown in SettingsSection without touching any operator's `defaultModel`.
2. Set Vael's `defaultModel = "moonshotai/kimi-k2.6"` only. Run for 1 week. Owner reviews.
3. If pass → roll Istishari + Bani to Kimi K2.6. If fail → record failure mode in this doc, keep on Sonnet.
4. Per-message model column (next row up in this table) must ship before/during this rollout so post-hoc audits can compare K2.6 vs Sonnet output on real conversations.

**Not chosen, and why:**
- **DeepSeek R1** — 64K context cannot hold full L0-L4 stack + recent memory + RAG hits without truncation. Reasoning model wastes output tokens you pay for.
- **DeepSeek V3 for operator brains** — strong price/perf but no Agent Swarm coordination story; weaker on identity preservation than K2.6 in early reports. Reserved for distillation jobs where voice doesn't matter.

**Implementation work owed (do not start until validation gate passes for at least Vael):**

- Add Kimi K2.6 + DeepSeek V3 to the model catalog (`SettingsSection.tsx`, backend model registry).
- Add a `distillModel` config separate from operator `defaultModel` so distillation calls can be routed to DeepSeek V3 independently.
- Fix the existing UI/backend default-model mismatch (open items table above) before adding more options — otherwise the K2.6 rollout will inherit the same silent flip bug.
- Ship the per-message `model` column before rollout so K2.6 vs Sonnet can be A/B'd post-hoc.

---

## 8. Commit History — newest first

### 2026-05-13 — Fix conversations list scope filter + delete polluted Nahil conv (hash forthcoming, this commit)

**What:** `conversations.ts` list endpoint (`GET /api/operators/:id/conversations`) was filtering by `owner_id` + `scope_type='authenticated'` but NOT `scope_id`. A smoke-test conversation created earlier today via `/v1/chat` with a non-owner `userId` (`farmer-test-42`) appeared in the owner's Hub UI list because it shared `owner_id` and `scope_type`, but its `scope_id` was `authenticated:farmer-test-42` instead of `authenticated:<ownerId>`. Hub UI picked the stray conv as `activeConvId` (newer by `last_message_at`), the subsequent POST to `/messages` was correctly rejected by `chat.ts:298` (which DOES filter scope_id), and Hub frontend showed "Server error 404. Please try again."

**Fix:** patched list query to filter `scope_id = buildOwnerScope(ownerId).scopeId` exactly. The list endpoint and the messages endpoint now agree on the scope — no more cross-scope conversations leaking into the owner's Hub list. Architectural fix — applies to every operator.

**Cleanup:** DELETE'd the stray conv `cc494a1d-0a64-48e9-bdea-23b0bd6efb0d` and its 2 messages (`11bf2fb3...`, `6b152b2c...`) directly via psql admin op. Nahil now has only the real owner conv `b38dda2c-...` (31 messages, scope `authenticated:f1a2b3c4-...`).

**Why:** Nahil's owner-side chat was returning "Server error 404" since 10:30 UTC today. Funder visited around then. Root-caused by tracing the 404 string back through Hub frontend `ChatSection.tsx:472` → API response status → `chat.ts:298/299` → conversation lookup failing scope filter.

**Files:** `artifacts/opsoul-api/src/routes/conversations.ts`, `SOURCE_OF_TRUTH.md`.

**Deploy:** pending — build + roll in flight as `nahil-404-fix-<hash>`.

### 2026-05-13 — Hotfix temporal substrate: strip behavioral clause (`42657dd`)

**What:** Earlier today's commit `d5df3f8` added `buildTemporalContext()` to `systemPrompt.ts`, injected as the first line of every operator's prompt. Format included an instruction: `"Use this for any question that depends on the current date or time — never substitute training-era assumptions for 'now'."` That instruction violated § 4 line 93 ("No prescriptive behavioral rules in the system prompt"). Stripped the clause; kept only the fact: `**Now:** Wednesday, 13 May 2026 at 16:49 · GST (Asia/Dubai).`

**Why:** Hypothesized this clause was triggering Vael's tool-loop soul-failure ("I tried a execution call to tool loop — it failed with: No result was produced."). Hotfix did NOT resolve Vael's issue — she still fails identically after the fix. So the behavioral clause wasn't the actual cause of the tool-loop, but it was still architecturally wrong and needed removal anyway. Vael's tool-loop has a separate root cause (see § 7).

**Deploy:** Built as `opsoul-api:hotfix-42657dd` (ACR Run `dg52`). Rolled to revision `opsoul--0000039`.

**Files:** `artifacts/opsoul-api/src/utils/systemPrompt.ts`, `SOURCE_OF_TRUTH.md`.

### 2026-05-13 — Universal temporal substrate (`d5df3f8`)

**What:** Added `buildTemporalContext(now?: Date)` to `systemPrompt.ts`. Injected as the first line of every operator's system prompt — universal across all operators (Vael, Nahil, Istishari, Bani, future). Output: `**Now (authoritative):** Wednesday, 13 May 2026 at 13:47 · GST (Asia/Dubai). Use this for any question...` (the trailing clause was hotfixed out same day — see above).

**Why:** Nahil hallucinated `"recent ET of 1.3mm/day"` and `"mid-January, winter growing season"` in test answers on 2026-05-12 — Layer 4 says "guessing is not" but the LLM had no current date to ground itself. Substrate gives the LLM the fact. After hotfix: Nahil correctly answers "Wednesday, 13 May 2026", "mid-May", "winter season has ended, daytime 40-43°C" — temporal grounding is now reliable.

**Deploy:** Built as `opsoul-api:temporal-d5df3f8` (ACR Run `dg4y`). Rolled to revision `opsoul--0000038` (later replaced by hotfix `0000039`).

**Files:** `artifacts/opsoul-api/src/utils/systemPrompt.ts`, `SOURCE_OF_TRUTH.md`.

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
