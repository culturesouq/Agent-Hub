/**
 * MCP runtime layer smoke test — no DB required.
 *
 * Run:  pnpm --filter @workspace/opsoul-api tsx src/scripts/mcpSmoke.ts
 *
 * Verifies the in-process integrity of the universal MCP runtime layer
 * without spinning up Postgres / Redis / external APIs. Useful as a
 * pre-deploy sanity check and as a developer reference for "what does
 * the registry actually expose right now".
 *
 * Checks performed:
 *   1. toolRegistry has expected universal toolset
 *   2. listToolsForContext() returns the right shape for the LLM call
 *   3. buildToolManifest() returns the right shape for the frontend
 *   4. modelRegistry has all expected providers
 *   5. resolveModel() routes known + unknown ids correctly
 *
 * Exits non-zero on any failure so CI can gate on it.
 */

import {
  UNIVERSAL_TOOLS,
  listAllToolNames,
  listToolsForContext,
  buildToolManifest,
  getTool,
} from '../utils/toolRegistry.js';
import {
  listAvailableModels,
  resolveModel,
  DEFAULT_MODEL_ID,
} from '../utils/modelRegistry.js';

let pass = 0;
let fail = 0;

function expect(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`);
}

// ── Tool registry checks ────────────────────────────────────────────────
section('Tool Registry');

const expectedToolNames = [
  'web_search', 'kb_seed',
  'write_file', 'read_file', 'list_files',
  'get_current_time',
  'schedule_task', 'update_task', 'pause_task', 'resume_task', 'delete_task',
  'http_request',
];

const actualToolNames = listAllToolNames();
expect(
  `12 universal tools registered (got ${actualToolNames.length})`,
  actualToolNames.length === 12,
);

for (const expected of expectedToolNames) {
  expect(`tool "${expected}" present`, actualToolNames.includes(expected));
}

// displayName present on every tool
const missingDisplayName = UNIVERSAL_TOOLS.filter((t) => !t.displayName);
expect(
  `every tool has a displayName (${missingDisplayName.length} missing)`,
  missingDisplayName.length === 0,
);

// inputSchema shape: { type:'object', properties, required }
const badSchemas = UNIVERSAL_TOOLS.filter(
  (t) => t.inputSchema.type !== 'object' || !t.inputSchema.properties || !Array.isArray(t.inputSchema.required),
);
expect(
  `every tool has a valid JSON Schema inputSchema (${badSchemas.length} bad)`,
  badSchemas.length === 0,
);

// ── Context filtering ──────────────────────────────────────────────────
section('listToolsForContext()');

const fullCtx = { scopeType: 'owner' as const, hasWebSearch: true, liveSecrets: ['MY_SECRET'] };
const fullList = listToolsForContext(fullCtx);
expect(
  `owner scope + web + secrets → all 12 tools (got ${fullList.length})`,
  fullList.length === 12,
);

const noWebCtx = { scopeType: 'owner' as const, hasWebSearch: false, liveSecrets: ['MY_SECRET'] };
const noWebList = listToolsForContext(noWebCtx);
expect(
  `without web search → web_search + kb_seed dropped (expect 10, got ${noWebList.length})`,
  noWebList.length === 10,
);
expect(
  `web_search not offered when hasWebSearch=false`,
  !noWebList.some((t) => t.function.name === 'web_search'),
);
expect(
  `kb_seed not offered when hasWebSearch=false`,
  !noWebList.some((t) => t.function.name === 'kb_seed'),
);

const noSecretsCtx = { scopeType: 'owner' as const, hasWebSearch: true, liveSecrets: [] };
const noSecretsList = listToolsForContext(noSecretsCtx);
expect(
  `without stored secrets → http_request dropped (expect 11, got ${noSecretsList.length})`,
  noSecretsList.length === 11,
);
expect(
  `http_request not offered when liveSecrets empty`,
  !noSecretsList.some((t) => t.function.name === 'http_request'),
);

// http_request description includes secret labels when present
const httpDef = fullList.find((t) => t.function.name === 'http_request');
expect(
  `http_request description mentions live secret label "MY_SECRET"`,
  !!httpDef && httpDef.function.description.includes('{{MY_SECRET}}'),
);

// ── Manifest shape (frontend SkillsSection feed) ───────────────────────
section('buildToolManifest()');

const manifest = buildToolManifest(fullCtx);
expect(`manifest has 12 entries (got ${manifest.length})`, manifest.length === 12);
expect(
  `all manifest entries marked available in full context`,
  manifest.every((m) => m.available),
);
expect(
  `every manifest entry has a displayName`,
  manifest.every((m) => typeof m.displayName === 'string' && m.displayName.length > 0),
);

// ── Lookup ─────────────────────────────────────────────────────────────
section('getTool() lookup');
expect(`getTool("web_search") returns a tool`, !!getTool('web_search'));
expect(`getTool("does_not_exist") returns undefined`, getTool('does_not_exist') === undefined);

// ── Model registry ─────────────────────────────────────────────────────
section('Model Registry');

const models = listAvailableModels();
expect(`at least 5 models catalogued (got ${models.length})`, models.length >= 5);

const expectedModels = [
  'deepseek/deepseek-chat-v3',
  'hajeri-3b-v2',
  'openai/gpt-5',
  'anthropic/claude-sonnet-4.6',
  'opsoul/auto',
];
for (const expected of expectedModels) {
  expect(`model "${expected}" registered`, models.some((m) => m.id === expected));
}

// Every model has label + description + provider
const badModels = models.filter((m) => !m.label || !m.description || !m.provider);
expect(
  `every model has label + description + provider (${badModels.length} bad)`,
  badModels.length === 0,
);

// ── Model resolution ──────────────────────────────────────────────────
section('resolveModel()');

const kimi = resolveModel('deepseek/deepseek-chat-v3');
expect(`Kimi resolves to OpenRouter`, kimi.config.provider === 'openrouter');
expect(`Kimi sendAs is unchanged`, kimi.sendAs === 'deepseek/deepseek-chat-v3');

const gpt5 = resolveModel('openai/gpt-5');
expect(`GPT-5 resolves to OpenAI`, gpt5.config.provider === 'openai');
expect(`GPT-5 sendAs is stripped to "gpt-5"`, gpt5.sendAs === 'gpt-5');

const hajeri = resolveModel('hajeri-3b-v2');
expect(`Hajeri resolves to "hajeri" provider`, hajeri.config.provider === 'hajeri');

// Unknown slashed model → OpenRouter fallback
const unknown = resolveModel('mistralai/codestral-22b');
expect(
  `unknown OpenRouter-shaped model falls back to OpenRouter`,
  unknown.config.provider === 'openrouter',
);

// Unknown bare model → default
const bare = resolveModel('totally-made-up');
expect(
  `unknown bare model falls back to default (${DEFAULT_MODEL_ID})`,
  bare.config.provider === resolveModel(DEFAULT_MODEL_ID).config.provider,
);

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
}
