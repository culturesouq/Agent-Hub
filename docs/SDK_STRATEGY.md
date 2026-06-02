# SDK Strategy — Should OpSoul have one, and what shape?

**Owner question (paraphrased):** *"We have Azure, we have all the apps, we have an inference server — so having an SDK (if I understand right) is better."*

Short answer: **yes, an SDK is better — but only if we're clear that "SDK" and "the four npm packages" are the same code, just packaged and positioned differently.** The SDK is a *product wrapper* around the packages, not a separate thing to build. This document explains the distinction, the upside, the cost, and what I'd recommend.

---

## 1. Packages vs SDK — they look the same, they're not

Both have the same code underneath. They differ in **how a customer encounters them.**

|  | npm packages alone | SDK product |
|---|---|---|
| **What customer types** | `npm i @opsoul/client @hajeri/client @opsoul/mcp-bridge @opsoul/types` (4 commands or 1 long one) | `npm i @opsoul/sdk` (1 command, 1 mental model) |
| **What customer reads** | 4 separate READMEs scattered across npm pages | 1 unified docs site, 1 versioned API surface, 1 changelog |
| **What customer learns** | "OpSoul publishes packages; I have to figure out which ones I need" | "OpSoul has an SDK; here's the quickstart" |
| **Versioning** | 4 independent SemVers — easy to ship a working `@opsoul/client@0.4` against `@opsoul/types@0.7` and have customer hit a type mismatch | 1 SemVer for the whole SDK — `@opsoul/sdk@0.4` always pins compatible internals |
| **Branding** | Each package looks like a utility | The SDK looks like a *product* — same gravitational pull as "the Stripe SDK," "the Anthropic SDK," "the OpenAI SDK" |
| **Sheikh / non-developer audience** | "We have 4 npm packages" sounds like infrastructure plumbing | "We have an SDK" sounds like a finished thing they can hand to their CTO |
| **Multi-language story** | "TypeScript only" forever, because each package is a hand-crafted JS module | An SDK can be a brand that ships TypeScript, Python, Go, etc. under the same name |

The SDK is the **packaging that turns 4 packages into 1 product.** That is what makes the difference for non-developer audiences and partnership conversations.

---

## 2. The recommended shape

Don't replace the 4 packages. **Add a fifth that bundles them**, plus the wrapper docs/CLI/examples. Customers can install either:

```bash
# the SDK — what most people install
npm i @opsoul/sdk

# the individual packages — what advanced users install when they need exactly one
npm i @opsoul/client     # platform only
npm i @hajeri/client     # inference only
npm i @opsoul/mcp-bridge # MCP bridge only
```

```ts
// SDK style — one import, one client, common surface
import { OpSoul } from '@opsoul/sdk';
const os = new OpSoul({ apiKey: '…' });
await os.operators.get('vael').chat('hello');
await os.hajeri.chat([{ role: 'user', content: 'hello' }]);
os.mcp.serve();              // spin up local MCP bridge
```

```ts
// Equivalent à-la-carte (advanced)
import { OpSoulClient } from '@opsoul/client';
import { HajeriClient } from '@hajeri/client';
const os = new OpSoulClient({ apiKey: '…' });
const hj = new HajeriClient({ apiKey: '…' });
```

The SDK is a thin orchestration layer (~300 LoC). It re-exports the underlying clients and adds:
- A unified `OpSoul` class that composes the three runtime packages
- Shared config (one `apiKey` flows to platform + inference + bridge)
- Shared error envelope (one `OpSoulError` type instead of three)
- Logging hooks once instead of per-package
- A CLI (`npx opsoul`) — quickstart, login, demo chat

**Same patent posture as the packages.** Nothing inside the SDK ever sees the backend mechanism. The SDK is to the packages what `@anthropic-ai/sdk` is to `node-fetch + JSON parsing` — convenience and consistency over raw HTTP, never revealing the model.

---

## 3. What an SDK earns you that packages don't

### a) A demo command worth showing the Sheikh

```bash
npx opsoul demo
```

That single line, on a fresh laptop with Node installed, downloads the SDK and opens a live chat with a real OpSoul Operator running on your backend. **You can't get that experience from 4 separate packages without a wrapper.** This is the "just download for him one" you joked about — and it lives at the SDK layer, not the package layer.

### b) Multi-language without naming chaos

Today: `@opsoul/client` (TS), tomorrow maybe `opsoul-py` on PyPI, and `github.com/opsoul/go-client`. Without an SDK brand, each language reinvents the install instruction and the naming.

With an SDK: every language ships under "the OpSoul SDK" name:
- `npm i @opsoul/sdk`
- `pip install opsoul-sdk`
- `go get github.com/opsoul/sdk-go`

Same mental model. Same docs structure (one quickstart, three install commands). One brand surface.

### c) A versioning story you can talk about

"OpSoul SDK 1.0 is stable" is a thing customers can build on. "@opsoul/client is at 0.4, @opsoul/types is at 0.7, @opsoul/mcp-bridge is at 0.2" is something they have to track. Partnerships need stable surfaces — the SDK gives you one to point at.

### d) Faster path to enterprise contracts

Procurement asks: *"Do you have an SDK? What languages? What's the support lifecycle?"* The right answer is one sentence with three nouns. With scattered packages, the answer is paragraph-long and sounds improvised.

---

## 4. What it costs you

Honest about the downsides:

1. **One more thing to publish + version.** Five packages instead of four. Each release means coordinating five SemVers. Mitigation: a release script that bumps the SDK's pinned versions when underlying packages change — 30 lines of TypeScript, write once.

2. **Bundle size.** The SDK pulls all four underlying packages even if the customer only wanted one. Mitigation: tree-shake-friendly exports, plus the à-la-carte option stays available. Real-world: total dependency footprint is ~2-3 MB, which is well under what any modern SDK ships.

3. **Surface area to maintain.** Every helper in the SDK is a contract you have to keep. Mitigation: ship 0.1 with the *minimum* surface — `new OpSoul({apiKey})`, `.operators`, `.hajeri`, `.mcp`, one CLI command. Resist adding helpers until customers ask for the same one three times.

4. **Pulls focus from the backend in early weeks.** Backend has more leverage right now. Mitigation: don't ship the SDK before Week 5 of the plan in `NPM_PACKAGES_PLAN.md`. Packages first, SDK on top after they're stable.

---

## 5. What I would NOT do

- **Don't make the SDK *replace* the packages.** Keep both. Some customers want `@opsoul/client` directly because they're already managing their own HTTP layer. The SDK is for the 80% who want convenience; the packages are for the 20% who want control. Killing the packages narrows the audience.
- **Don't put server-side anything in the SDK.** No `@opsoul/sdk-server` ever — same rule as for the packages. The SDK is client-side only, by design and by license.
- **Don't write a "self-host" SDK that mocks the backend.** It would inevitably leak architecture as we tried to match real behavior. The customer's backend IS our backend; that's the strategy, not a workaround.
- **Don't make the SDK depend on Hajeri specifically.** It should work with any backend model the customer's account is configured for. Hajeri is the default — not the requirement. This keeps the SDK valuable even to customers who haven't fully bought into Hajeri yet.

---

## 6. Three-line recommendation

1. **Ship the 4 packages first** (Weeks 1-4 per the npm plan) — they're the technical foundation.
2. **Add `@opsoul/sdk` in Week 5** — bundle them, add a CLI, add `npx opsoul demo`. ~300 LoC of wrapper + docs. This is the "product" face.
3. **Use the SDK name in every external conversation** — partnerships, Sheikh demo, hiring, press. Use the package names only in technical docs for advanced users.

The SDK is what turns "we publish some npm packages" into "we have a product line that any developer or partner can adopt in one command." That second sentence is what wins meetings.

---

## 7. Where this differs from what I said earlier

Earlier in our session I framed the packages and the SDK as the same thing (per `[[closed-backend-distribution]]` they share the same client-only constraint). That's still true at the patent / IP level. **The new framing here is about positioning** — the SDK is a product wrapper that costs almost nothing to build and unlocks audiences the bare packages don't reach. The memory entry doesn't need rewriting; this doc complements it.
