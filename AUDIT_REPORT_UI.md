# OpSoul Hub — UI Audit Report

Date: 2026-05-31
Auditor: Claude (UI lag-behind-backend audit)
Scope: `/Users/bstar/opsoul-audit/artifacts/opsoul-hub/src/`
Backend reference: `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/`
Architecture reference: `/Users/bstar/OPSOUL_RED/` (patent — confidential, not quoted)

---

## 1. Executive Summary

Top 5 UI cleanup priorities, in order of damage / ease ratio:

1. **AdminPage VAEL Desk is half-dead.** `AdminPage.tsx` (1097 lines) contains a fully-built VAEL Desk (Drop Zone, Pending Inbox, DNA Library, Sources, Verification Runs — all wired to `/admin/rag/*` endpoints) that the backend's `routes/admin.ts` **does not implement**. Every button calls a route that returns 404. SoT line 21 confirms `VAEL_INBOX_ENABLED=true` is now "legacy — no longer wired"; SoT 2026-05-22 §888-890 explicitly flags `VaelRunState/DnaEntry/RagSource/VaelVerificationRun` interfaces + state as "inert dead code". Most egregious broken-promise component in the whole hub.
2. **`OperatorDetail.tsx` uses external Unsplash URLs for operator portraits** (lines 30–34) while local persona images already exist at `/public/images/persona-{founder,executive,consultant}.png`. Dashboard already uses the local ones (line 74-78). Result: privacy leak (operator name letters indexed via Unsplash), broken offline, slow load, and visual mismatch between dashboard and detail.
3. **`Free Roaming` toggle (Settings → Behavior) ships, but `Tool Use Policy` editor it advertises does not exist.** SettingsSection.tsx:908-915 says "When enabled, the Operator can act autonomously … Tool Use Policy activates and controls what it is allowed to do." Backend `validation/operator.ts:37,50` exposes `toolUsePolicy` as a free-form record, chat.ts:388 honours it. No UI surface anywhere to view or edit it. Promise without product.
4. **`CapabilityRequestsSection.tsx` is built (161 lines) and the backend (`routes/capability-requests.ts`) is live, but the component is not routed from `OperatorDetail`'s navigation.** Operators that emit capability requests have nowhere for the owner to approve/deny them in-product. This is patent-relevant (capability-request flow, claim 11) and silently invisible to the owner.
5. **Architecture-secret leaks in user-facing copy.** Per § 4 architecture-as-secret + the architecture firewall (patent claim 17), internal terms (`Layer 0/1/2/3/4`, `GROW`, `Soul`, `DNA`) must not surface in any UI consumed by end-users. Violations: `DocsPage.tsx:255` "Growth (GROW)", `Dashboard.tsx:403` "GROW evolution engine" as a plan-feature bullet, `AdminPage.tsx:60-66` `l0_ai_builder`/`l1_foundation`/… constants. Sovereign-admin-only is still architectural noise that bleeds into screenshots/demos.

---

## 2. Broken-Promise Components Table

| Component / location | Promise to user | Actual backend state | Severity |
|---|---|---|---|
| `pages/AdminPage.tsx` — VAEL Desk (Drop / Inbox / DNA Library / Sources / Runs) | Drop URLs/files/text into VAEL, watch inbox, review DNA library, manage RAG sources, see verification runs | `routes/admin.ts` has **no `/admin/rag/*` routes at all**. Every call 404s. SoT flags it dead 2026-05-22. | CRITICAL |
| `components/operator/SettingsSection.tsx:898-919` (Free Roaming) | "Tool Use Policy activates and controls what it is allowed to do" | `toolUsePolicy` column exists + read at chat.ts:388 but **no UI** to view/edit/seed the policy. | HIGH |
| `components/operator/CapabilityRequestsSection.tsx` | Approve/deny/respond to operator-raised capability requests | Backend live (`routes/capability-requests.ts`); component built; **not wired into `OperatorDetail` nav**. Owner has no path to it. | HIGH |
| `pages/Dashboard.tsx:444-449` ("Upgrade to Pro — Coming Soon") | "Pro plans … you'll be first to know" + locked-in $29/mo | No billing backend, no waitlist captured. Toast-only response. | MED |
| `pages/Dashboard.tsx:493-498` (Delete Account) | "Permanently deletes your account…" | Button disabled, only text says "Contact support". UI shape implies a feature that doesn't exist. | MED |
| `pages/OperatorDetail.tsx:171` ("Leave Feedback") | Nav item → opens feedback form | Renders `ComingSoon` placeholder (line 274). Honest enough but dead nav item. | LOW |
| `components/operator/widgets/MermaidCard.tsx:6` | Mermaid diagram render | "not yet bundled in the Hub — for now this card renders the [fallback]" — own header acknowledges incomplete. | LOW |
| `pages/AdminPage.tsx:283-290` `toggleSafeMode` | Patches `/admin/operators/:id/safe-mode` | Backend exists, OK — but state shape uses outdated `safeMode` field; operator-side UI now uses both `safeMode` AND `freeRoaming` toggles which conflict semantically (Safe Mode = read-only + no learning; Free Roaming = autonomous tools). UI offers no hint about which wins if both engaged. | MED |
| `pages/AdminPage.tsx:604` `GROW_LEVELS = [OPEN, CONTROLLED, LOCKED, FROZEN]` | Admin can set any of 4 levels | SettingsSection (owner side) only allows 3 of them. Inconsistent surfacing. Per SoT 2026-05-19 the intended target is 3 levels (LOCKED / CONTROLLED / NO_GROW) — refactor parked. Admin surface has the legacy enum, owner surface has the half-cleaned one. | MED |

---

## 3. Outdated / Architecturally-Drifted Components

| File / line | Drift | Fix |
|---|---|---|
| `pages/AdminPage.tsx:60-66` | `LAYER_LABELS` const exposes patented Layer 0–4 taxonomy. Never rendered now (declared but unused) yet still in source. | Delete entirely; same applies to interfaces `VaelRunState`, `DnaEntry`, `RagSource`, `VaelVerificationRun` (lines 68-118) + all `vael*` state + 14 functions `loadVaelStatus`, `loadVaelInbox`, `loadDnaEntries`, `loadRagSources`, `loadVaelRuns`, `triggerVael`, `submitVaelUrls`, `submitVaelFiles`, `submitVaelText`, `deprecateDna`, `deleteDna`, `toggleSource`, `deleteSource`, `addSource`. SoT 2026-05-22 §890 already flagged this as cleanup debt. ~500 LOC to remove. |
| `pages/Dashboard.tsx:401-408` (`PLAN_FEATURES`) | "Persistent soul & memory", "GROW evolution engine", "Knowledge base (5MB)" | "Persistent soul" + "GROW" are internal architecture vocabulary leaking into a public/owner panel. "Knowledge base (5MB)" — no quota enforcement exists in `routes/owner-kb.ts` or `routes/operator-kb.ts`. Replace with user-facing language (e.g., "Always-on AI you own", "Improves with use", "Bring your own knowledge"). |
| `pages/DocsPage.tsx:252-257` "Growth (GROW)" stub | Names the internal engine to the user. | Rename to "Improvement" or "Refinement" if anything; remove parenthetical (GROW). |
| `pages/DocsPage.tsx:295-298` "Sovereign Admin" / "Admin" doc stub | Internal admin name "Sovereign" leaks. | Either remove the stub or rename to "Workspace administration". |
| `pages/OperatorDetail.tsx:30-34` | External Unsplash URLs for operator portraits. | Reuse the local `/public/images/persona-*.png` already used by Dashboard. Single source of truth. |
| `pages/OperatorDetail.tsx:34-35` `PERSONA_GLOWS = ["#9b59f4", "#22d3ee", "#ec4899"]` | Glow array declared, never read. | Remove. |
| `pages/OperatorDetail.tsx:38-48` `OperatorAvatar` color palette `bg-violet-500/...` | Hardcoded 8-color avatar bucket; Dashboard uses Material-style `PERSONA_ACCENTS = [#1B4FD8, #3B82F6, #6366F1]`. Visual inconsistency between dashboard card and detail header. | Pick one palette and centralize. |
| `components/operator/SettingsSection.tsx:36-38` `FALLBACK_MODELS` | OK pattern (registry-driven via `/api/models`), but the fallback only lists Kimi K2.5. If `/api/models` fails entirely the picker collapses to a single option with no escape hatch to the actual catalog (Hajeri 3B v2, GPT-5, Sonnet 4.6, Opus 4.7, Gemini 3 Pro, OpSoul Auto per SoT line 616). Cosmetic but if the API throttles, owner sees a misleading "one model" state. | Bake a wider fallback list mirroring the registry snapshot. |
| `components/operator/SettingsSection.tsx:40-61` `EVOLUTION_OPTIONS` | 3 levels (OPEN/CONTROLLED/LOCKED) — but `AdminPage.tsx:604` lists 4 (+FROZEN). Backend supports all 4. Conflict surface between owner and admin. | Settle on the 3-level model per SoT 2026-05-19 directive; remove FROZEN from AdminPage too. |
| `components/operator/MemorySection.tsx` | UI hides scope-isolation reality. Memory cards show `scopeLabel` badge (line 184) but the user has no model of why a memory has a particular scope, no filter by scope, no view of Layer-2 distilled cross-scope memories vs Layer-1 in-scope memories. The patent's two-layer architecture (PII-firewalled distillation) is invisible. | Add a scope filter chip row + a small Layer-1 vs Layer-2 toggle. Or — to honour architecture-secrecy — relabel as "Per-context" vs "Lifetime" memories without naming the layers. |
| `components/operator/IdentitySection.tsx:169` placeholder `"e.g. Nahil"` | Hardcoded internal operator name leaks into a public-facing field. | Replace with generic placeholder ("e.g. Aria"). |
| `components/operator/SettingsSection.tsx:91-110` `API_SLOT_META` | Three surface types (guest/auth/crud) — backend supports five scopes (owner/auth/public/action/channel per patent Figure 2). Channel scope is implicit (Integrations). Owner scope is implicit (Hub itself). User has no mental model of the mapping. | Add a one-liner explainer to API Access section ("There are 3 ways to embed; channels like Telegram/WhatsApp count separately under Connections"). |
| `hooks/use-api.ts` | File comment line 34 `// More hooks will be added as needed in the component files to save time, or I can add them all here if needed.` — agent-builder droppings + only 3 hooks actually defined, rest live inline in components. Pattern is inconsistent. | Either centralize all `useOperators/useOperator/useCreateOperator/use*` in this file, or delete it and inline. Pick one. |

---

## 4. Chat UI Assessment (`ChatSection.tsx`, 966 lines)

| Criterion | Status | Notes |
|---|---|---|
| Tool calls surfaced | YES | Lines 200-229 `ToolOutputBlock` collapses tool output behind an expand-chevron. SSE events `searching/seeding/reading/running/writing/calling` all rendered with spinner+label (lines 822-832). Good. |
| Source provenance (SRAG retrieval, KB lookups) | PARTIAL | `[Web Search]`, `[URL Content]`, `[HTTP Response]` system messages parsed and rendered (lines 720-734) — good. **KB lookups invisible to the user** — no `[KB:...]`-style block. The auto-injected KB context in `chat.ts:976` flows into the system prompt with no user-facing trace. Failing the patent's transparency-of-corroboration spirit. |
| Language-mismatch axis guard | NO | No client-side check. Bug observed in `[[operator-vs-llm-engine]]` memory (手动 Chinese leak) shows the operator wrap on the post-step is missing — UI has zero defence. |
| Streaming | YES | SSE reader handles all event types correctly; idle timer 90s (line 558); ABORT supported via Stop button (lines 944-951). Robust. |
| Error framing per `[[errors-as-investigation]]` | NO | Line 547: `Server error ${response.status}. Please try again.` Line 628: `Connection lost. Please try again.` Both are terminal-failure phrasings, not "we got a non-200, here's what we know, retry or check X". Per the feedback memory these should be reframed as investigation triggers ("The server returned 404 — the conversation may have been moved; click here to reload"). |
| Operator-as-author principle | YES (mostly) | UI never shows the LLM substrate name in the chat surface. Per `[[operator-vs-llm-engine]]`: LLM is wrapped on both sides. Good. |
| Message queue while busy | YES | Lines 880-893 — queues pending messages with cancel chips. Clean. |
| Markdown render | OK | Hand-rolled in `MarkdownMessage` (lines 124-198). Supports widget blocks via `opsoul-widget` fenced lang. Inline code, lists, headers, blockquote, hr. No tables; no syntax highlighting; no auto-link. Acceptable trade-off. |
| Mobile chat keyboard | OK | Textarea + send/stop button; touch handlers on mic (lines 918-919). Could not verify on device. |
| Slash-command `/render` | YES | Lines 647-675 — local widget preview command. Cute, working. |

### Chat UI structural issues

- **Snapshot-on-DONE flash gap.** Line 96-97: reducer drops `snapshot` immediately on DONE relying on optimistic cache injection. If `queryClient.setQueryData` is slow or the streamed content has no trim'd content, the bubble flashes blank for one frame. Tested only in `kind=msg`; user-visible micro-stutter. Low priority.
- **No "regenerate" / "retry" affordance** if a stream errored mid-flight. The error red-box sits there; user must re-type the whole message.
- **`accumulatedRef` parallel to reducer state** — anti-pattern but commented well (line 266). Works because reducer state is async; defer until proven harmful.

---

## 5. Operator Picker / Context Switcher

There is **no in-product operator switcher** beyond:
1. Click an operator card on Dashboard → routes to `/operators/:id` (OperatorDetail).
2. Click `← back` in OperatorDetail → returns to Dashboard.

Per current operator set (Istishari, Nahil, Bani, Vael per `[[project-opsoul-operators]]`) the owner has 4+ permanent operators yet there's no quick-switch (e.g., a popover, breadcrumb dropdown, or sidebar of all operators). Every switch is a full page round-trip.

**Operator-scoped memory visibility:** OperatorDetail header shows operator name, Safe Mode chip, health score. No surface for: which operator scope is active (chat is implicitly owner-scope), which integrations are active, recent memory hits. Hidden state.

**Visual identity per operator:** Currently `name.charCodeAt(0) % 3` picks portrait + accent color. So Nahil + Bani might map to the same image bucket. No real per-operator branding (archetype-driven color, mandate-driven persona). Cheap visual flavor; effective if rest of the experience is identity-stable.

**Recommendation:** Add a top-right "Operators" popover in OperatorDetail showing the other 3+ operators with click-to-switch. Avoids context loss for an owner running 4 operators in parallel (the most common Hajeri workflow).

---

## 6. KB / SRAG Surface Assessment

| Patent feature | UI status |
|---|---|
| Owner KB CRUD | YES — `KbSection.tsx` "Your Facts" tab (lines 277-320), full CRUD with file upload, source typing. Solid. |
| Operator KB (learned) CRUD + verify | YES — "Learned" tab (322-373), confidence pill, verify action. Solid. |
| KB semantic search | YES — "Search" tab (376-419) — `/operators/:id/kb/search` endpoint exists. Solid. |
| **SRAG entity / insight CRUD** | NO — SRAG (`[[srag]]`, `[[srag-vael-as-service]]`) is not surfaced in the Hub at all. SRAG lives in `nahil_2` / sovereign console only. AdminPage's RAG references are dead. |
| **Stop Crawl button** (per `[[srag]]` priority fix) | NO — not present anywhere in opsoul-hub. Lives in Nahil's SoT scope. |
| Tag-required enforcement | NO — Owner-KB add form has no tag field; backend `routes/owner-kb.ts` reads `sourceName` + `sourceType` but no tags. SRAG's tag-required architecture isn't carried into Hub. |
| Entity-type filter | NO — UI has source-type chip (manual/document/url) but no entity-type concept. |
| Curiosity engine surface (per Patent §28) | NO — operator-initiated corroboration is invisible to the user. No "verified by web source" badge, no dual-corroboration trail. The `confidenceScore` pill on Learned KB cards is the closest thing, but provenance isn't shown. |

**Assessment:** The Hub's KB surface is a clean owner-KB + operator-KB pair, but it does NOT carry the SRAG architecture. SRAG-as-service / Vael-as-Service (per `[[srag-vael-as-service]]`) needs a dedicated module if/when commercialised; the dead AdminPage VAEL Desk is NOT the right substrate to revive — that's an old approach.

---

## 7. Mobile / Responsive

- Hamburger menu present on both Dashboard (line 599-605) and OperatorDetail (309-315). Acceptable.
- Mobile nav overlay with `slide-in-from-left` animation; backdrop click closes. Good.
- Sidebar drops to overlay below `md:`; main content reflows. Good.
- **Chat input area is touch-optimized** (mic uses both mouse and touch handlers, lines 916-919).
- **Concerns:**
  - OperatorDetail sidebar profile image (h-20) takes 80px of vertical space on mobile — wastes prime real estate. Consider collapsing to a single header strip in the mobile drawer.
  - Settings page is constrained to `max-w-2xl` on desktop but feels tight on small phones because every section uses internal padding `p-6`. Stack works but very busy.
  - AdminPage table (`overflow-x-auto`) — readable but horizontal scroll on mobile; not ideal for power-admin work.

**Verdict:** Mobile is usable, not delightful. For a non-developer power user (per `[[user-hajeri]]`) it works for chat + KB + settings. The Admin page is desktop-first.

---

## 8. Design Consistency

| Issue | Where | Severity |
|---|---|---|
| Two different operator-portrait sources (local PNG in Dashboard, external Unsplash in OperatorDetail) | Dashboard.tsx vs OperatorDetail.tsx | MED |
| Two different operator-avatar color palettes (Material accents vs 8-color tailwind buckets) | Dashboard.tsx:80 vs OperatorDetail.tsx:39-43 | LOW |
| Mixed font-family naming: `font-headline`, `font-label`, `font-mono`, `font-sans`, `headline-lg` — used inconsistently | global | LOW |
| Inline `bg-white` rectangles vs `bg-card/30` cards vs `bg-white rounded-2xl border` — three card styles coexist | KbSection, MemorySection, SettingsSection, FilesSection | MED |
| AdminPage uses `Sovereign Console`, `Sovereign Command Center`, `Sovereign Admin` interchangeably | AdminPage.tsx:765,787,938 | LOW |
| Tailwind brand-stem-interpolation `from-${brand}-500/10` in `IntegrationsSection.tsx:151` | Tailwind cannot statically extract these — they'll be purged in prod. Card backgrounds may render without color. | MED |
| AdminPage `bg-surface-container` / `bg-primary-container` / `text-on-primary-container` — Material-style tokens used only on AdminPage; rest of the app uses plain Tailwind | AdminPage.tsx | MED |

The "patchwork" feeling is real: AdminPage looks like a Material Design 3 console; Dashboard + OperatorDetail look like a modern SaaS dashboard; integration cards have a third design style. Three eras visible in one codebase.

---

## 9. Quick Wins (15-min fixes)

1. **Delete dead VAEL state from AdminPage.tsx** (lines 68-118 interfaces + 175-219 state + 354-585 functions). ~500 LOC; tsc still clean. SoT 2026-05-22 §890 pre-approved.
2. **Swap Unsplash URLs in `OperatorDetail.tsx:30-34` for local `/public/images/persona-*.png`** (same array as Dashboard.tsx:74-78). 4 lines.
3. **Wire `CapabilityRequestsSection` into the OperatorDetail nav.** Add a `capabilities` leaf inside Brain group, render the existing component. 6 lines.
4. **Remove orphan `PERSONA_GLOWS` const in OperatorDetail.tsx:35.** 1 line.
5. **Rename Dashboard PLAN_FEATURES entries to user-facing terms** (replace "GROW evolution engine", "Persistent soul & memory", "Knowledge base (5MB)" with non-architectural copy). 3 lines.
6. **Replace `e.g. Nahil` placeholder in IdentitySection.tsx:169** with generic. 1 line.
7. **Reframe ChatSection error strings** (`Server error N. Please try again.` → "The server returned N. Try again, or reload — your message is preserved."). 3 lines.
8. **Remove `FROZEN` from AdminPage GROW_LEVELS (line 604)** to match SettingsSection 3-level model. 2 lines.
9. **Delete `LAYER_LABELS` const (AdminPage.tsx:60-66)** — unused and leaks patented L0-L4 names.
10. **Delete `hooks/use-api.ts` "More hooks will be added…" comment.** Or finish centralizing. 1 line either way.

---

## 10. Structural Refactors (multi-day work)

1. **Decide AdminPage's future.** It's a Sovereign Admin console (operator/owner inspection, drift alerts, GROW lock override) — that part is live and useful. Strip the VAEL Desk dead weight; keep the operational console; rename "Sovereign" everywhere to "Workspace admin" or "Platform admin". ~1 day.
2. **Build the `Tool Use Policy` editor.** Backend column is free-form JSON; needs a structured editor (allowed tools, allow/deny scopes, max-call-rate, …). Patent-relevant — controls Free Roaming. ~2 days incl. backend validation schema.
3. **Add an operator switcher (popover in OperatorDetail header).** Lists all of the owner's operators with one-click jump. Avoids dashboard round-trips. ~half a day.
4. **Tighten the "architecture firewall" in user-facing text.** Audit DocsPage, Dashboard, Pricing, Landing for all leaks of `Soul`, `GROW`, `Layer`, `Sovereign`, `DNA`, `Mandate`, `Substrate`, `Curiosity`. Rewrite with patron-facing language. ~1 day; needs owner approval per `[[no-prompt-changes-without-approval]]` for any prose changes.
5. **Unify operator portrait/identity branding.** One palette, one image source, archetype-driven accent color, name initial as fallback. Hub-wide consistency. ~half a day.
6. **Rebuild AdminPage in current Tailwind design system.** Move off Material tokens; match Dashboard look. ~1 day.
7. **Surface SRAG architecture in Hub for operators that use it.** Per `[[srag-vael-as-service]]` if Vael-as-Service is ever sold, customers need a SRAG UI here — entities, insights, tag-required forms, Stop Crawl. This is greenfield, not a cleanup. ~3 days when prioritised.
8. **Replace queryClient.setQueryData optimistic injection in ChatSection with proper streaming-message-store.** The current pattern works but has the flash-gap quirk and a couple of stale-closure traps (`accumulatedRef`). ~1 day.
9. **Memory section: scope-aware filters + Layer 1 vs Layer 2 split visibility.** Per Patent Figure 3. ~1 day, includes a small backend change to label distilled memories.
10. **Drift score / health score deeper UI.** Currently a single 0-100% pill. The patent's four-guard drift detection (PII / Layer-1 hard lock / semantic manipulation / cumulative drift) deserves a breakdown when a guard fires. ~1.5 days when needed.

---

## Appendix A — File-by-file size and status

| File | Lines | Status |
|---|---:|---|
| `pages/AdminPage.tsx` | 1097 | ~500 LOC of dead code (VAEL Desk). Strip. |
| `components/operator/SettingsSection.tsx` | 1063 | Live; OK; has the Tool-Use-Policy promise gap. |
| `components/operator/ChatSection.tsx` | 966 | Live; solid; error-tone needs adjusting. |
| `components/operator/IntegrationsSection.tsx` | 772 | Live; MCP endpoint card added (good); `from-${brand}-500` purge risk. |
| `pages/Dashboard.tsx` | 651 | Live; plan-feature copy leaks architecture terms. |
| `components/operator/GrowSection.tsx` | 505 | Live; good user-friendly proposal cards. |
| `components/operator/TasksSection.tsx` | 501 | Live; preset-to-cron mapping cleanly done. |
| `components/operator/DeploymentsSection.tsx` | 471 | Live; overlaps with SettingsSection API Access. Possible duplication. |
| `pages/OperatorDetail.tsx` | 433 | Live; Unsplash leak + glow array dead. |
| `components/operator/KbSection.tsx` | 425 | Live; SRAG-free. |
| `components/operator/SkillsSection.tsx` | 415 | Live; manifest-driven (good). |
| `components/operator/ApiKeysSection.tsx` | 413 | Live; not nav-referenced in OperatorDetail nav — likely orphan or used elsewhere. Verify. |
| `pages/login.tsx` | 305 | OK. |
| `components/operator/IdentitySection.tsx` | 261 | Live; "Nahil" placeholder. |
| `pages/DocsPage.tsx` | 331 | Public docs; leaks "GROW" / "Sovereign". |
| `components/operator/MemorySection.tsx` | 218 | Live; missing scope-aware filters. |
| `components/operator/FilesSection.tsx` | 219 | Live; OK. |
| `pages/LandingPage.tsx` | 201 | OK. |
| `components/operator/CapabilityRequestsSection.tsx` | 161 | **Built but not wired into nav.** |
| `components/operator/ArtifactsSection.tsx` | 145 | Live; OK. |
| `App.tsx` | 134 | OK. |
| `lib/api.ts` | 85 | OK; clean refresh-token flow. |
| `hooks/use-api.ts` | 36 | Minimal + comment droppings. |
| `components/operator/PersonalitySection.tsx` | 16 | Thin wrapper; fine. |

End of report.
