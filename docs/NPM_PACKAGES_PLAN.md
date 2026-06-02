# npm Packages — Map & Execution Plan

**Owner directive (paraphrased):** *"map the npm packages we need + how to execute, with the thought that if I meet the Sheikh I could just hand him one download. No code leak, no patent issue."*

This document maps what we publish on npm, what stays closed-backend, the order of publication, and a "Sheikh-demo" install path that gives a single `npm i` flavour without revealing any patented mechanism.

The locked distribution strategy is `[[closed-backend-distribution]]`: **only thin clients on npm; everything mechanism-bearing stays on the closed backend.** That memory is the authority — this document is the execution layer underneath it.

---

## 1. The four packages

All Apache-2.0. All under `@opsoul/` or `@hajeri/` scopes. All under 1,000 lines each — a code reviewer can audit any of them in 20 minutes and see they are pure HTTP/WebSocket clients with type declarations.

| Package | Scope | Purpose | Size target | What's in it | What's NOT in it |
|---|---|---|---|---|---|
| `@opsoul/types` | shared | TypeScript types — Operator, Memory, Tool, Scope, Conversation, KB envelopes | ~300 LoC | Zero-runtime `.d.ts`. Pure interfaces. Re-exported by the three runtime packages. | No values, no functions, no constants beyond enums. |
| `@hajeri/client` | inference | Talk to the Hajeri inference endpoint (chat, completion, embedding once we have it) | ~500 LoC | `new HajeriClient({ apiKey, baseUrl? })` → `.chat(messages, opts)`, `.stream(messages, opts)`. Auth header injection. Retry + backoff. SSE parsing. | No model weights, no prompt templates, no tool-handler logic. Hajeri's identity, soul, decoding parameters all live server-side. |
| `@opsoul/client` | platform | Talk to OpSoul's customer-facing REST API (operators, memory, KB, conversations, deployment slots, capability requests) | ~800 LoC | `new OpSoulClient({ apiKey, baseUrl? })` → `.operators.list()`, `.operators.get(id).chat(msg)`, `.kb.add(entry)`, `.memory.list(opId)`, etc. Pagination, error envelope, auth. | No operator-engine code, no GROW, no memory engine, no firewall, no scope resolver, no MCP runtime. All of those live on the backend; client only sees HTTP responses. |
| `@opsoul/mcp-bridge` | integration | Run a local MCP server that proxies tool calls to a customer's OpSoul operator (so any MCP-compliant client — Claude Desktop, Cursor, etc. — can talk to a hosted Operator) | ~400 LoC | Stateless MCP transport, schemas pulled from the backend at connect time, JSON-RPC bridge. | The 12 universal tools live on the backend. This bridge only forwards `tools/list` + `tools/call` over the wire. The bridge sees tool *names* and *arguments*, never the handler implementations. |

**Total exposed surface across all 4 packages: ~2,000 lines of HTTP/WebSocket/MCP plumbing.** Roughly equivalent to the official `@anthropic-ai/sdk` (~1,800 LoC) or the `@google/generative-ai` SDK (~2,400 LoC) in terms of what a customer can read. None of those SDKs reveal Anthropic's or Google's training, prompts, or model architecture — same shape here.

---

## 2. What stays closed (never npm)

The patent claims live here. None of this is ever published. Every line listed below is in the closed backend (`/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/`) and never leaves:

| Domain | Where it lives | Why it stays closed |
|---|---|---|
| Operator engine | `routes/chat.ts`, `routes/public-chat.ts`, webhook handlers, `utils/operatorAgent.ts`, `utils/operatorAgentLoop.ts` | The "operator wraps the LLM" architecture — the core differentiator. Cloning this is the whole game. |
| Tool runtime | `utils/toolRegistry.ts`, `utils/toolHandlers.ts`, `utils/operatorToolset.ts` | The universal-tool substrate + the operator-decided gating. Patent-bearing. |
| Memory layers | `utils/memoryEngine.ts`, `utils/decayEngine.ts`, soul-anchor logic | Two-layer memory + decay-exemption is a patented mechanism. |
| GROW (autonomous evolution) | `utils/growEngine.ts`, `utils/growGuards.ts`, scheduling | The autonomy loop. Cloned by a competitor = competitor has our autonomy story. |
| Firewall | `utils/operatorFirewall.ts` (Claim 5 stubs, real analyzer when wired) | Even the *interface* of input-tagger + output-leak-check is patent material. |
| Scope isolation | `utils/scopeResolver.ts` + DB partitioning | The customer-tenancy mechanism is what makes the hosted console safe. |
| Source-trust ladder | `utils/sourceTrust.ts` (5-tier) | Claim 32. |
| Soul / identity / DNA | The system-prompt structure, the Layer-1 / Layer-2 distinction, the constitution stack | Per `[[feedback-no-prompt-changes]]` — this is patent-protected. Never leaves the box. |
| Hajeri model weights + tokenizer | `~/hajeri_v2/` and remote VMs | Trade secret on top of patent. |
| MCP runtime | `utils/mcpServer.ts`, `routes/mcp.ts` | The server side of MCP, including how tools are filtered per-operator. The client bridge sees only the wire protocol. |

If we ever feel pressure to publish "more" — re-read this column. The instinct to publish more is the instinct to give the competitive moat away for free.

---

## 3. Execution order

Each step gates the next. Don't publish ahead of the pre-reqs — once a name is on npm, it can't be quietly redesigned.

| Step | Deliverable | Pre-requisite | Owner-decision point |
|---|---|---|---|
| 0 | Reserve npm scopes `@opsoul` and `@hajeri` (publish empty `0.0.0` placeholders to claim the namespace) | npm account with 2FA; team / org created | Confirm scopes are exactly `@opsoul` (not `@op-soul` or `@opsoulai`) |
| 1 | Customer-facing REST API on the backend, behind Bearer-key auth, with rate-limit + tenant scoping + OpenAPI spec | OpSoul backend already shipped (`opsoul--0000078` is the foundation) | Decide URL: `api.opsoul.dev` vs `opsoul.dev/api` |
| 2 | Publish `@opsoul/types@0.1.0` first — pure types, zero runtime | OpenAPI spec finalised; types generated from it | Pin SemVer policy for breaking changes |
| 3 | Publish `@hajeri/client@0.1.0` — inference SDK | Hajeri inference endpoint stabilised; auth model agreed | Token-counting / billing surface decided BEFORE publish (changes are breaking) |
| 4 | Publish `@opsoul/client@0.1.0` — platform SDK | REST API contract frozen for 0.1 | Which surfaces are 0.1 (operators, memory, KB, conversations) vs deferred (capability-requests, deployment-slots) |
| 5 | Publish `@opsoul/mcp-bridge@0.1.0` — MCP proxy | MCP server side stabilised; the wire contract is the public-facing thing | Whether to bundle a CLI (`npx @opsoul/mcp-bridge serve`) in 0.1 or 0.2 |
| 6 | Doc site at `docs.opsoul.dev` — install snippets, quickstart, recipes | All four packages live on npm | Theme + framework (recommend: Astro Starlight, ~1 day to ship) |
| 7 | The "Sheikh-demo" meta-package (see §4) | All four published + stable | Whether to publish or keep as a private gist that the Sheikh's office can run |

---

## 4. The "Sheikh-demo" install path

Owner's joke ("just download for him one") is actually the right design for any senior-decision-maker demo. One command, one terminal, one minute, a real Operator chatting back. The package itself reveals nothing patent-bearing — it's a glorified `curl` wrapper that needs an API key from us.

**Option A — `npx @opsoul/demo` (recommended)**

```bash
npx @opsoul/demo
# → prompts: paste your access key
# → spawns a local terminal chat with a demo Operator
# → 30 seconds from typing the command to first reply
```

The `@opsoul/demo` package is ~150 lines: depends on `@opsoul/client` + `@hajeri/client`, opens a readline loop, sends each line to a pre-provisioned "demo" operator on our backend, prints the reply. The access key the user pastes is a single-use 24h token we hand out from Hub. **Zero patent surface — the customer terminal only sees user input and operator text output.**

**Option B — Two-line snippet on a slide**

```bash
npm i @opsoul/client
node -e "const {OpSoulClient}=require('@opsoul/client');new OpSoulClient({apiKey:'…'}).operators.get('demo').chat('what are you?').then(r=>console.log(r))"
```

Same effect, no extra package. Better for a slide screenshot than for a live demo.

**Option C — A one-page hosted demo at `demo.opsoul.dev`**

Single textarea + chat bubble UI, points at a sandbox Operator. **No install needed at all.** This is actually the best demo for non-technical audiences — Sheikhs don't run `npm i`. The npm path is for the developer in the room who wants to verify it's real.

**Recommendation: ship A + C. Skip B.** A is for the technical advisor in the meeting; C is for the Sheikh himself. Both demos talk to the same backend.

---

## 5. License + IP rules per package

| Package | License | Copyright | Patent notice |
|---|---|---|---|
| `@opsoul/types` | Apache-2.0 | (c) OpSoul / owner entity | No patent notice (pure types — nothing to license) |
| `@hajeri/client` | Apache-2.0 | (c) OpSoul / owner entity | Apache-2.0's built-in patent grant covers *the code in the package* — explicitly NOT the backend it talks to |
| `@opsoul/client` | Apache-2.0 | (c) OpSoul / owner entity | Same |
| `@opsoul/mcp-bridge` | Apache-2.0 | (c) OpSoul / owner entity | Same |
| `@opsoul/demo` | Apache-2.0 | (c) OpSoul / owner entity | Same |

`LICENSE` file in each repo. `NOTICE` file referencing the backend Terms of Service URL and the patent priority filing. No patent claim numbers in the npm READMEs — those are for legal docs, not marketing.

**Apache-2.0 patent clause = key choice.** It grants patent rights *only for the contributed code*, not the surrounding system. If a competitor publishes a fork of `@opsoul/client` that talks to *their own clone* of our backend, they get zero patent protection from our Apache grant — they're infringing on their own. MIT would NOT give us this protection.

---

## 6. The accidental-leak checklist (run before every publish)

Before `npm publish` on any package, audit:

- [ ] No backend file paths in error messages (`/Users/bstar/...`, `artifacts/opsoul-api/...`)
- [ ] No internal layer names in user-facing strings ("Layer 1", "GROW", "soul-anchor", "scope isolation", "firewall", "MCP runtime")
- [ ] No model names in retry/error logic (no fallback to GPT/Claude/Kimi visible in client)
- [ ] No DB schema hints (column names, table names in error envelopes)
- [ ] No system-prompt fragments in any string constant
- [ ] No DSN, no DB URL, no internal hostname in `package.json` or `.npmignore`-able files
- [ ] `.npmignore` covers `src/__internal/` and any spec fixtures with real keys
- [ ] `package.json` `repository` field points at a public mirror (`github.com/opsoul/<pkg>`), NOT at the private monorepo

A single PR template for new publishes that bakes this checklist as required reviewers — costs 5 minutes per publish, saves the patent.

---

## 7. What the Sheikh actually sees if he opens the package

He won't, but his technical advisor will. Here is what they'll find when they `npm view @opsoul/client` and unpack the tarball:

```
@opsoul/client/
├── README.md          ← quickstart, no patent claims, no architecture diagrams
├── LICENSE            ← Apache-2.0
├── NOTICE             ← copyright + ToS URL
├── package.json       ← deps: @opsoul/types only (peer)
├── dist/
│   ├── index.js       ← bundled HTTP client, minified, ~30KB
│   ├── index.d.ts     ← re-exports from @opsoul/types
│   └── index.mjs      ← ESM
└── src/               ← (optional) unbundled TS source if we choose to ship it
    ├── client.ts      ← the HTTP wrapper class
    ├── auth.ts        ← Bearer key injection
    ├── errors.ts      ← error envelope parser
    └── pagination.ts  ← cursor helper
```

The Sheikh's advisor can read every line. They will see: an HTTP client. Auth. Retry. Pagination. JSON parsing. The closed-backend `baseUrl` is configurable but defaults to `api.opsoul.dev`. **Nothing in this tarball tells them how the backend produces its replies, what the operator's identity stack looks like, how memory persists, how tools are gated, or how the firewall works.** Same exposure as the Anthropic SDK or the OpenAI SDK — and those companies are worth $200B.

---

## 8. Timeline (calendar weeks, conservative)

| Week | Work | Output |
|---|---|---|
| Week 1 | Scopes reserved, OpenAPI spec finalised, types generated | `@opsoul/types@0.1.0` live |
| Week 2 | Hajeri inference SDK + smoke tests + docs | `@hajeri/client@0.1.0` live |
| Week 3 | OpSoul platform SDK + integration tests against `opsoul--0000079` | `@opsoul/client@0.1.0` live |
| Week 4 | MCP bridge + Claude-Desktop test recipe | `@opsoul/mcp-bridge@0.1.0` live |
| Week 5 | `@opsoul/demo` + hosted `demo.opsoul.dev` + Starlight doc site | Sheikh-demo ready |
| Week 6 | Quiet onboarding of 3-5 external testers via Stripe + console.opsoul.dev | First external signups |

Sequence assumes the customer-facing REST API doesn't exist yet on the backend. Most of Week 1-3 effort goes into the backend, not the npm packages themselves — the npm side is the small (and easy) part.

---

## 9. Open questions for owner before any of this ships

1. **Branding** — `@opsoul` is the obvious scope; should `@hajeri` be `@hajeri` or `@hajeri-ai`? (npm scope policy varies.)
2. **Pricing model surfaced via SDK** — do client errors include billing context (`{ error: 'over_quota', resetAt: '...' }`) or just generic 402? Affects DX significantly.
3. **MCP bridge transport** — stdio (Claude Desktop default) only, or also HTTP (Cursor / browser MCP)?
4. **Doc site host** — `docs.opsoul.dev` on the same Container App or separate static host (Cloudflare Pages / Vercel)?
5. **Sheikh-demo Operator persona** — should it be "Vael" (already alive), "Istishari" (your foundermoment one), or a purpose-built "OpSoul Demo" Operator with a tight, deterministic script?

Answer these and the four packages can ship in the calendar weeks above with no rework.
