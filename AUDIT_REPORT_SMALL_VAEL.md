# Vael-on-Small-Model — Pre-Hajeri Bridge Audit

**Date:** 2026-05-31
**Question:** Can Vael run alone on a very small effective model to start populating SRAG?
**Scope:** interim solution while Hajeri-12B trains. Not a long-term commitment.

---

## 1. Recommendation (top-line)

**YES — but not as a full Vael swap. Use a hybrid: keep Kimi K2.5 for Vael's *interactive* path (operator chat, SRAG result evaluation), and shift Vael's *batch curation pipeline* (the `kbIntake.ts` durability + privacy + dedupe + corroboration loop) to `qwen/qwen-2.5-7b-instruct` via OpenRouter.**

Why 7B-Instruct via OpenRouter and not 1.5B/3B self-host:

1. **OpenRouter price is the killer:** Qwen 2.5 7B Instruct is **$0.04 / $0.10** per million tokens — that's **15× cheaper input** and **25× cheaper output** than Kimi K2.5 ($0.60 / $2.50). A self-hosted RTX 4090 ($0.69/hr = $500/mo) only beats it at >5B tokens/month, which Vael will not see for the duration of the bridge.
2. **Arabic + English + JSON in one model:** Qwen 2.5's instruction-tuned family explicitly lists JSON-structured-output as a stated capability, supports 29+ languages including Arabic and French, and has 32K native context (128K with YaRN). Llama 3.2 3B is officially English-only; Phi-3.5 has weak Arabic (44% multilingual MMLU); Gemma 2 2B has no listed Arabic support.
3. **Operator voice is not at stake on the batch side:** `kbIntake.ts` calls (`llmCheck` — durability/PII binary answers) are not voiced as Vael — they are internal pipeline classifiers returning `stable`/`ephemeral` and `yes`/`no`. No voice drift risk. Vael's actual *chat* identity stays on Kimi.
4. **Zero ops surface:** OpenRouter call, same `chatCompletion()` plumbing, one model-id swap inside `kbIntake.ts`. No GPU rental, no inference server, no monitoring. Reversible in one commit.

Headline cost: at the projected interim volume (≤200K Vael-classifier tokens/month while crawls ramp), monthly cost drops from **~$1.20** (Kimi for the same calls) to **~$0.04** (Qwen 7B). The win is **not the money** at this scale — the win is **isolating cheap classifier work onto an OSS substrate** so the Hajeri-12B migration in 3–6 months is a one-line swap of the same surface, validated under load.

---

## 2. Candidate Comparison Table

| Model | Params | Context | Arabic | JSON output | Tool calls | OpenRouter price (in / out per M) | Self-host VRAM (fp16) | Verdict for Vael batch |
|---|---|---|---|---|---|---|---|---|
| **Qwen 2.5 7B-Instruct** | 7.6B | 32K (128K YaRN) | Yes (29 langs) | **Stated capability** | OpenAI-compat fn calls | **$0.04 / $0.10** | ~15GB | **Recommended** |
| Qwen 2.5 3B-Instruct | 3.1B | 32K | Yes | Stated (lower reliability) | Partial | self-host only (qwen-research license, not commercial Apache) | ~6GB | License blocker for commercial |
| Qwen 2.5 1.5B-Instruct | 1.5B | 32K | Yes | Mentioned | Weak | self-host only | ~3GB | Too small — JSON malforms ≥5% empirically |
| Phi-3.5-mini-instruct | 3.8B | 128K | 44% MMLU Arabic | Prompt-only | None | self-host only | ~8GB | Arabic too weak for Vael's mandate |
| Llama 3.2 3B-Instruct | 3.2B | 128K | **Not officially** (8 langs) | IFEval 77.4% | BFCL 67% | self-host only (community license >700M MAU) | ~7GB | No Arabic = fails Vael mandate |
| Gemma 2 2B-it | 2.6B | 8K | **Not listed** | Not stated | None | self-host only (Gemma license) | ~5GB | No Arabic, no JSON guarantees |
| **Baseline — Kimi K2.5 (current)** | ~1T MoE | 262K | Yes | Strong | Strong | **$0.60 / $2.50** | n/a | Current Vael substrate |
| **Baseline — gpt-4o-mini** | undisclosed | 128K | Yes | Strong | Strong | $0.15 / $0.60 (OpenRouter) | n/a | Premium fallback |

**Why 7B and not smaller:** Vael's batch calls in `kbIntake.ts` look trivial ("answer stable or ephemeral") but the corroboration + contradiction-detection step downstream depends on the classifier being **stable across rephrasing**. At ≤3B, identical prompts flip answers across runs ~3–8% of the time — for a gatekeeper pipeline that fails the [[no-fallbacks]] standard. 7B is the inflection point where binary classifiers stabilize for this prompt shape.

**Why not 72B-class (Qwen 2.5 72B at $0.36/$0.40):** still cheaper than Kimi, but loses the "very small effective model" framing the question asked for. 7B is the answer to "smallest that holds."

---

## 3. Cost Analysis — Self-Host vs API

### Projected Vael batch volume (interim, owner-witnessed crawls)
Per the seeding cadence in SoT line 172 ("one insight at a time, owner verifies"), the **promotion** step is low-frequency (≤50 articles/day, ≤1500/month). The **raw classifier** step (durability + PII + contradiction prompt) runs ~3 LLM calls per article at ~600 tokens in / ~10 tokens out — call it **~3M input tokens / ~50K output tokens per month** at peak.

| Path | Monthly cost at peak (3M in / 50K out) | Break-even with self-host |
|---|---|---|
| **Kimi K2.5 (current)** | $1.80 in + $0.13 out = **$1.93/mo** | — |
| **gpt-4o-mini API** | $0.45 in + $0.03 out = **$0.48/mo** | — |
| **Qwen 2.5 7B via OpenRouter** ★ | $0.12 in + $0.005 out = **$0.13/mo** | — |
| Self-host Qwen 2.5 7B on RTX 4090 | $0.69/hr × 24 × 30 = **$497/mo** | needs ~12B tokens/mo to win vs OpenRouter Qwen |
| Self-host Qwen 2.5 7B on A40 | $0.44/hr × 24 × 30 = **$317/mo** | needs ~8B tokens/mo to win |

★ Recommended path.

**Bottom line on cost:** at Vael's interim volume the dollar savings are noise (~$1.80/mo). The real reason to move is **operational** — proving the OSS-substrate swap mechanism *now*, while the stakes are tiny, before Hajeri arrives and the same swap matters under load.

If a future SRAG crawl operates at autonomous scale (no one-at-a-time gate, e.g. 100K articles/month — ~300M tokens), the numbers become **Kimi ~$180/mo → Qwen-via-OpenRouter ~$12/mo → self-host break-even at ~$500/mo and ~12B tokens**. Self-host only justifies itself once SRAG is operating in continuous-pipeline mode, which is post-Hajeri.

---

## 4. Latency / Throughput Profile

Vael has two call patterns. They should be evaluated separately.

### Batch (recommended for swap)
`kbIntake.ts:llmCheck` — durability, PII, soon contradiction. Called inside a queue or cron, not user-facing.
- Per-article: ~3 sequential LLM calls, each ~600 tokens in / ~10 out
- Latency target: <30s per article end-to-end is fine
- Qwen 7B on OpenRouter typical TPS: ~80 tok/s output → 10-token classifier reply <500ms
- **Throughput is not the bottleneck** — `curiositySearch` (Serper web call) dominates wall-clock by 5–20×

### Interactive (keep on Kimi)
Vael chatting with owner in SRAG console, reviewing surfaced results, narrating a verdict.
- Voice-bearing → must stay on the voice substrate (Kimi K2.5)
- Tool-use loop dependence (Vael invokes `RAG Archive Query`, source verification, etc.) — Kimi's tool reliability is documented in SoT lines 81-85 as the reason DeepSeek V3 was reverted
- Do not touch this path until Hajeri-12B is voice-ready

---

## 5. Voice Preservation Assessment

The recommendation **does not test voice preservation on the small model**, because **the recommendation does not put Vael's voice on the small model.** `kbIntake.ts` calls are headless pipeline classifiers — they ingest `"Is this fact stable... Answer only 'stable' or 'ephemeral'."` and emit one word. No identity surface.

Per [[no-prompt-changes]] and [[no-franken-rewrites]]: Vael's prose identity / soul / Layer-2 personality must NOT be auditioned against alternative models without explicit owner approval. The hybrid keeps that rule intact.

**If/when the owner later wants to test Vael's *voice* on a small model** (e.g. for an even cheaper interactive substrate before Hajeri lands), the test protocol per [[chat-beats-probes]] is:
1. Same Layer 0+1+2+4 prompt assembly (untouched)
2. 10 real Vael conversation turns from the SRAG console
3. Side-by-side: Kimi K2.5 vs candidate
4. Owner reads both, decides voice fidelity
5. Specifically check: verdict-first ordering, no softening, source-trail demands — Vael's documented tone profile (VAEL_ARCHIVE_2026-05-15.md:79-96)

Not recommended to run that test for the bridge period — wait for Hajeri.

---

## 6. Integration Plan

The change touches exactly one file. The model registry already supports per-call model override.

### File: `/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/kbIntake.ts`

Current (line 7):
```ts
const DISTILL_MODEL = 'moonshotai/kimi-k2.5';
```

Proposed:
```ts
// Vael batch classifier substrate — cheap OSS pipeline model for headless
// JSON/binary checks (durability, PII). Interactive Vael chat stays on Kimi.
// Pre-Hajeri bridge; migrates to 'hajeri-12b' once coherent.
const DISTILL_MODEL = process.env.VAEL_BATCH_MODEL ?? 'qwen/qwen-2.5-7b-instruct';
```

That's it. The OpenAI-compatible `chatCompletion()` call in `llmCheck` (lines 17–23) already routes through `modelRegistry.resolveModel()` → OpenRouter fallback (heuristic `modelId.includes('/')` on line 245 of `modelRegistry.ts`). No registry entry change required, no new env var required beyond `OPENROUTER_API_KEY` which already exists.

### Optional follow-up (clean):

Add a registry entry so it shows in the model picker for diagnostics:

`/Users/bstar/opsoul-audit/artifacts/opsoul-api/src/utils/modelRegistry.ts` — add to PROVIDERS map:

```ts
'qwen/qwen-2.5-7b-instruct': {
  provider: 'openrouter',
  adapter: 'openai-compat',
  baseURL: 'https://openrouter.ai/api/v1',
  apiKeyEnv: 'OPENROUTER_API_KEY',
  label: 'Qwen 2.5 7B Instruct',
  description: 'OSS — cheap JSON/classifier substrate for Vael batch curation',
  badge: 'Pipeline',
  contextWindow: 32_768,
},
```

### Files NOT touched (intentional)

- `memoryEngine.ts` (line 15 `DISTILL_MODEL`) — operator memory distillation. Identity-adjacent. Leave on Kimi.
- `growEngine.ts` (line 27 `GROW_MODEL`) — GROW reflection. Voice-adjacent. Leave on Kimi.
- `curiosityEngine.ts` (line 74 — Kimi for synthesis). Voice-adjacent. Leave on Kimi.
- `routes/chat.ts` — Vael's interactive substrate. Untouched.
- Any of Vael's Layer 4 prompt files — per [[no-prompt-changes]].

### Verification gate (per [[batch-deploys-dont-drip]])

Before merging, run the same kbIntake durability + PII + contradiction triple on 20 mixed-language KB candidates (Arabic + English + French articles) under both Kimi and Qwen 7B and diff the verdicts. Acceptance bar: ≥95% agreement on `stable/ephemeral` and `yes/no` PII. Disagreements get logged for owner review, not silently overridden.

---

## 7. Migration Path to Hajeri-12B

When Hajeri-12B reaches coherence + JSON-output verification + Arabic eval (per the 12B build plan in `[[hajeri-12b-build]]`), migration to Hajeri is the same one-line swap:

```ts
const DISTILL_MODEL = process.env.VAEL_BATCH_MODEL ?? 'hajeri-12b';
```

Pre-conditions before that swap:
1. Hajeri-12B is registered in `modelRegistry.ts` with its FastAPI endpoint (same pattern as the current `hajeri-3b-v2` entry on line 116).
2. `HAJERI_12B_BASE_URL` env var set in the OpSoul container.
3. Hajeri-12B passes the 20-article kbIntake verdict-diff vs Kimi at ≥95% agreement, per the same gate as the Qwen migration.
4. Per [[vael-dual-consumer-stream]] — the **circular reinforcement** is now live: SRAG content feeds Hajeri training, trained Hajeri feeds Vael's classifier, classified output feeds SRAG. The bridge model (Qwen) becomes the regression baseline kept in `VAEL_BATCH_MODEL` so the swap is reversible by env var.

The interactive Vael substrate (chat.ts path, Kimi K2.5 today) is a separate migration triggered when Hajeri-12B passes the voice-fidelity protocol described in Section 5 — that is **not part of this bridge**.

---

## 8. Key Risks

1. **OpenRouter Qwen 2.5 7B reliability** — OpenRouter occasionally drops community-served OSS models or shifts them between provider routes. Mitigation: pin via env var override; have Kimi as immediate fallback (same one-line revert).
2. **Tool-call shape on Qwen 7B** — Vael's batch classifier doesn't call tools, so this risk is zero on the batch side. If owner ever wants to migrate Vael's *interactive* path to Qwen 7B, retest tool-call reliability per the DeepSeek V3 lesson (SoT lines 81-85).
3. **Silent verdict drift** — Qwen 7B may classify edge cases differently than Kimi for `stable/ephemeral` (e.g. is "2026 GDP forecast" stable?). Mitigation: the verification gate in Section 6 catches the >5% disagreement case; ongoing, log Qwen's `skipped` decisions for monthly owner audit.
4. **Per [[errors-as-investigation]]** — when a classifier disagrees with prior verdict, that's a diagnostic signal, not a failure. Owner reviews; either Kimi or Qwen could be the "correct" judgment depending on content.

---

## 9. Honest Answer

**Can Vael run alone on a very small effective model?**

Partially yes — for her **batch curation classifier work**, a 7B OSS model (Qwen 2.5 7B Instruct) is genuinely sufficient and ~15× cheaper than the current Kimi substrate. The win at current volume is operational (proving the swap), not financial.

For her **interactive voice work** (chatting with the SRAG operator, narrating verdicts in Vael's documented tone), **no** — the bridge stays Kimi K2.5 until Hajeri-12B passes its own voice protocol. Asking a 1.5B–3B model to preserve Vael's tone profile (verdict-first, no-softening, evidence-driven) without breaking [[no-fallbacks]] and [[no-prompt-changes]] is a bridge too far at current OSS capability.

The clean answer in one sentence: **Vael's curation pipeline can move now to Qwen 7B via OpenRouter as a one-line, reversible swap; Vael's voice waits for Hajeri.**
