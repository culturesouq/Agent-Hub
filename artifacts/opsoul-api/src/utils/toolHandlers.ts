/**
 * Tool handlers — the execution side of OpSoul's universal MCP tool layer.
 *
 * For each of the 12 universal tools defined in toolRegistry.ts, this file
 * provides a handler that:
 *   1. Parses raw JSON arguments from the LLM
 *   2. Fires progress events for SSE streaming (so the UI shows "Searching..."
 *      while the actual work runs)
 *   3. Executes the tool (DB writes, HTTP calls, memory persistence, etc.)
 *   4. Returns { content, meta? } — content is the tool-result text the LLM
 *      sees in the next turn; meta is loop-control hints for chat.ts
 *
 * dispatchTool(name, rawArgs, ctx, onProgress) is the single entry point.
 * chat.ts calls it directly. mcpServer.ts (the external MCP endpoint) wraps
 * the same function in MCP protocol envelopes. Both use the same handlers —
 * single source of truth.
 *
 * Behavior migrated verbatim from the inline tool execution blocks in
 * chat.ts (streaming path lines 1306-1750, sync path lines 1883-2110). SSE
 * event names ('searching', 'seeding', 'writing', 'reading', 'listing',
 * 'checking_time', 'scheduling', 'updating_task', 'pausing_task',
 * 'resuming_task', 'deleting_task', 'calling') are preserved verbatim
 * because the frontend ChatSection.tsx regex-matches them.
 *
 * NO changes to: tool semantics, persistence shapes, memory distillation,
 * scope isolation, or any patent-protected mechanism.
 */

import crypto from 'crypto';
import { db } from '@workspace/db';
import {
  operatorFilesTable,
  tasksTable,
  messagesTable,
  operatorIntegrationsTable,
  operatorSecretsTable,
  operatorMemoryTable,
  operatorKbTable,
  ownerKbTable,
  operatorsTable,
  conversationsTable,
} from '@workspace/db';
import { and, eq, desc } from 'drizzle-orm';
import { buildTemporalContext } from './systemPrompt.js';
import { executeWebSearch } from './capabilityEngine.js';
import { persistKbSeedEntry } from './kbIntake.js';
import { storeMemory, searchMemory } from './memoryEngine.js';
import { searchBothKbs } from './vectorSearch.js';
import { embed } from '@workspace/opsoul-utils/ai';
import {
  persistWebSearchResult,
  executeHttpWithOAuth,
} from './toolPersistence.js';
import { getTool } from './toolRegistry.js';
import { runSingleTask } from '../cron/tasksCron.js';
import type { ScopeType } from './toolRegistry.js';

// ───────────────────────────────────────────────────────────────────────────
//  TYPES
// ───────────────────────────────────────────────────────────────────────────

/** Runtime context passed to every handler. */
export interface ToolHandlerContext {
  operatorId: string;
  ownerId: string;
  conversationId: string;
  /** Resolved scope from scopeResolver — handlers respect this when persisting. */
  scope: { scopeId?: string; scopeTrust?: string; scopeType: ScopeType };
  /** Operator mandate — used by web_search verifyAndStore. */
  mandate: string;
}

/** SSE-style progress event handlers can fire as work proceeds. */
export interface ToolProgressEvent {
  /** Stable event name. Matches frontend ChatSection.tsx parsers. */
  event:
    | 'searching'
    | 'seeding'
    | 'writing'
    | 'file_created'
    | 'reading'
    | 'listing'
    | 'checking_time'
    | 'scheduling'
    | 'updating_task'
    | 'pausing_task'
    | 'resuming_task'
    | 'deleting_task'
    | 'calling';
  /** Payload shape matches the JSON the SSE write() produced in chat.ts. */
  payload: Record<string, unknown>;
}

export type ToolProgressCallback = (e: ToolProgressEvent) => void;

/** Result of a tool dispatch. */
export interface ToolResult {
  /** Text returned to the LLM as the tool-result message in the next turn. */
  content: string;
  /** Loop-control hints for the caller. None of these affect the LLM. */
  meta?: {
    /** Set to true when web_search successfully ran (chat.ts increments its cap counter). */
    webSearchFired?: boolean;
    /** Set to true when http_request ran (chat.ts uses this to suppress skill trigger). */
    httpRequestFired?: boolean;
    /** True when the caller should break its agent loop after this tool —
     *  e.g. required args were missing, or the underlying operation could
     *  not produce a useful result. Mirrors the pre-refactor break-on-
     *  failure semantics of each inline tool block. */
    terminateLoop?: boolean;
  };
}

// ───────────────────────────────────────────────────────────────────────────
//  ARG PARSING
// ───────────────────────────────────────────────────────────────────────────

function parseArgs<T>(rawArgs: string): T {
  try {
    return JSON.parse(rawArgs) as T;
  } catch {
    return {} as T;
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  HANDLERS — one per tool, behavior verbatim from chat.ts
// ───────────────────────────────────────────────────────────────────────────

async function handleWebSearch(
  rawArgs: string,
  ctx: ToolHandlerContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult> {
  const { query } = parseArgs<{ query?: string }>(rawArgs);
  if (!query) {
    return { content: 'web_search requires a non-empty "query" argument.', meta: { terminateLoop: true } };
  }
  console.log(`[agency] web_search: "${query}"`);
  onProgress?.({ event: 'searching', payload: { searching: query } });

  const capResult = await executeWebSearch(query);
  if (!capResult.success) {
    // Mirror old chat.ts behavior: a failed search terminates the agent loop;
    // the caller falls back to whatever iterContent was streamed.
    return {
      content: `Web search returned no usable results for "${query}".`,
      meta: { terminateLoop: true },
    };
  }

  await persistWebSearchResult(
    ctx.operatorId,
    ctx.ownerId,
    ctx.conversationId,
    query,
    capResult,
    ctx.mandate,
    ctx.scope.scopeId,
    ctx.scope.scopeTrust,
  );

  return {
    content: capResult.output,
    meta: { webSearchFired: true },
  };
}

async function handleKbSeed(
  rawArgs: string,
  ctx: ToolHandlerContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult> {
  const { content, source, confidence } = parseArgs<{
    content?: string;
    source?: string;
    confidence?: number;
  }>(rawArgs);

  if (!content || !source) {
    return { content: 'kb_seed requires both "content" and "source".', meta: { terminateLoop: true } };
  }

  const conf = typeof confidence === 'number' ? confidence : 65;
  console.log(`[agency] kb_seed: "${source}" (confidence ${conf})`);
  onProgress?.({ event: 'seeding', payload: { seeding: source } });

  const seedResult = await persistKbSeedEntry(
    ctx.operatorId,
    ctx.ownerId,
    content,
    source,
    conf,
  );

  const toolResultText = seedResult.stored
    ? `Entry stored successfully. Confidence: ${Math.max(40, Math.min(85, Math.round(conf)))}. Status: pending — queued for VAEL pipeline verification.`
    : `Entry not stored: ${seedResult.reason}`;

  if (seedResult.stored) {
    storeMemory(
      ctx.operatorId,
      ctx.ownerId,
      `Knowledge entry seeded: "${source}". ${content.slice(0, 300)}`,
      'fact',
      'ai_distilled',
      conf / 100,
    ).catch(() => {});
  }

  return { content: toolResultText };
}

async function handleWriteFile(
  rawArgs: string,
  ctx: ToolHandlerContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult> {
  const { filename, content, action } = parseArgs<{
    filename?: string;
    content?: string;
    action?: string;
  }>(rawArgs);

  if (!filename || !content) {
    return { content: 'write_file requires both "filename" and "content".', meta: { terminateLoop: true } };
  }
  console.log(`[agency] write_file: "${filename}"`);
  onProgress?.({ event: 'writing', payload: { writing: filename } });

  const existing = await db
    .select({ id: operatorFilesTable.id })
    .from(operatorFilesTable)
    .where(and(eq(operatorFilesTable.operatorId, ctx.operatorId), eq(operatorFilesTable.filename, filename)))
    .limit(1);

  let fileId: string;
  const isUpdate = existing.length > 0 && action !== 'create';
  if (isUpdate) {
    fileId = existing[0].id;
    await db.update(operatorFilesTable).set({ content, updatedAt: new Date() }).where(eq(operatorFilesTable.id, fileId));
  } else {
    fileId = crypto.randomUUID();
    await db.insert(operatorFilesTable).values({
      id: fileId,
      operatorId: ctx.operatorId,
      ownerId: ctx.ownerId,
      filename,
      content,
    });
  }

  onProgress?.({ event: 'file_created', payload: { file_created: { id: fileId, filename } } });

  return {
    content: `File "${filename}" ${isUpdate ? 'updated' : 'created'}. Owner can see and download it from the Files tab.`,
  };
}

async function handleReadFile(
  rawArgs: string,
  ctx: ToolHandlerContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult> {
  const { filename } = parseArgs<{ filename?: string }>(rawArgs);
  if (!filename) {
    return { content: 'read_file requires a "filename".', meta: { terminateLoop: true } };
  }
  console.log(`[agency] read_file: "${filename}"`);
  onProgress?.({ event: 'reading', payload: { reading: filename } });

  const [file] = await db
    .select({ content: operatorFilesTable.content })
    .from(operatorFilesTable)
    .where(and(eq(operatorFilesTable.operatorId, ctx.operatorId), eq(operatorFilesTable.filename, filename)))
    .limit(1);

  return {
    content: file
      ? `File "${filename}":\n${file.content}`
      : `File "${filename}" not found in your workspace.`,
  };
}

async function handleListFiles(
  _rawArgs: string,
  ctx: ToolHandlerContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult> {
  console.log(`[agency] list_files`);
  onProgress?.({ event: 'listing', payload: { listing: 'workspace files' } });

  const files = await db
    .select({
      filename: operatorFilesTable.filename,
      updatedAt: operatorFilesTable.updatedAt,
      content: operatorFilesTable.content,
    })
    .from(operatorFilesTable)
    .where(eq(operatorFilesTable.operatorId, ctx.operatorId));

  const text = files.length === 0
    ? 'Your workspace has no files yet.'
    : files
        .map((f) => `- ${f.filename} (${f.content.length} chars, updated ${f.updatedAt?.toISOString() ?? 'unknown'})`)
        .join('\n');

  return { content: text };
}

async function handleGetCurrentTime(
  rawArgs: string,
  _ctx: ToolHandlerContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult> {
  const { timezone } = parseArgs<{ timezone?: string }>(rawArgs);
  const tz = timezone || 'Asia/Dubai';
  console.log(`[agency] get_current_time (${tz})`);
  onProgress?.({ event: 'checking_time', payload: { checking_time: tz } });

  try {
    return { content: buildTemporalContext(new Date(), tz) };
  } catch {
    return {
      content: `Invalid timezone "${tz}". The timezone parameter accepts IANA identifiers such as "Asia/Dubai", "America/New_York", "Europe/London", "UTC".`,
    };
  }
}

async function handleScheduleTask(
  rawArgs: string,
  ctx: ToolHandlerContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult> {
  const { name, prompt, schedule } = parseArgs<{
    name?: string;
    prompt?: string;
    schedule?: string;
  }>(rawArgs);

  if (!name || !prompt || (schedule !== 'daily' && schedule !== 'weekly')) {
    return { content: 'schedule_task requires "name", "prompt", and "schedule" (daily|weekly).', meta: { terminateLoop: true } };
  }
  console.log(`[agency] schedule_task: "${name}" (${schedule})`);
  onProgress?.({ event: 'scheduling', payload: { scheduling: name } });

  const intervalMs = schedule === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const taskId = crypto.randomUUID();
  await db.insert(tasksTable).values({
    id: taskId,
    operatorId: ctx.operatorId,
    conversationId: ctx.conversationId,
    contextName: name,
    taskType: schedule,
    integrationLabel: 'self_scheduled',
    prompt,
    payload: { description: prompt, scheduledBy: 'operator' },
    status: 'active',
    nextRunAt: new Date(Date.now() + intervalMs),
  });

  return {
    content: `Task "${name}" scheduled to run ${schedule}. First run at ${new Date(Date.now() + intervalMs).toISOString()}. Owner can pause or edit it from the Tasks tab.`,
  };
}

async function handleUpdateTask(
  rawArgs: string,
  ctx: ToolHandlerContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult> {
  const { name, newName, newPrompt, newSchedule } = parseArgs<{
    name?: string;
    newName?: string;
    newPrompt?: string;
    newSchedule?: string;
  }>(rawArgs);

  if (!name) {
    return { content: 'update_task requires the current task "name".', meta: { terminateLoop: true } };
  }

  const [task] = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(and(eq(tasksTable.operatorId, ctx.operatorId), eq(tasksTable.contextName, name)))
    .limit(1);

  if (!task) {
    return { content: `No task named "${name}" found in your station.` };
  }

  const patch: Record<string, unknown> = {};
  if (newName) patch.contextName = newName;
  if (newPrompt) patch.prompt = newPrompt;
  if (newSchedule === 'daily' || newSchedule === 'weekly') patch.taskType = newSchedule;

  if (Object.keys(patch).length === 0) {
    return { content: `No fields to update on "${name}".` };
  }

  await db.update(tasksTable).set(patch).where(eq(tasksTable.id, task.id));
  console.log(`[agency] update_task: "${name}"`);
  onProgress?.({ event: 'updating_task', payload: { updating_task: name } });

  return { content: `Task "${name}" updated.` };
}

async function handlePauseTask(
  rawArgs: string,
  ctx: ToolHandlerContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult> {
  const { name } = parseArgs<{ name?: string }>(rawArgs);
  if (!name) {
    return { content: 'pause_task requires a "name".', meta: { terminateLoop: true } };
  }

  const result = await db
    .update(tasksTable)
    .set({ status: 'paused' })
    .where(and(eq(tasksTable.operatorId, ctx.operatorId), eq(tasksTable.contextName, name)))
    .returning({ id: tasksTable.id });

  console.log(`[agency] pause_task: "${name}" (${result.length} rows)`);
  onProgress?.({ event: 'pausing_task', payload: { pausing_task: name } });

  return {
    content: result.length > 0
      ? `Task "${name}" paused. It will not fire until you resume it.`
      : `No task named "${name}" found in your station.`,
  };
}

async function handleResumeTask(
  rawArgs: string,
  ctx: ToolHandlerContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult> {
  const { name } = parseArgs<{ name?: string }>(rawArgs);
  if (!name) {
    return { content: 'resume_task requires a "name".', meta: { terminateLoop: true } };
  }

  const result = await db
    .update(tasksTable)
    .set({ status: 'active' })
    .where(and(eq(tasksTable.operatorId, ctx.operatorId), eq(tasksTable.contextName, name)))
    .returning({ id: tasksTable.id });

  console.log(`[agency] resume_task: "${name}" (${result.length} rows)`);
  onProgress?.({ event: 'resuming_task', payload: { resuming_task: name } });

  return {
    content: result.length > 0
      ? `Task "${name}" resumed.`
      : `No task named "${name}" found in your station.`,
  };
}

async function handleDeleteTask(
  rawArgs: string,
  ctx: ToolHandlerContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult> {
  const { name } = parseArgs<{ name?: string }>(rawArgs);
  if (!name) {
    return { content: 'delete_task requires a "name".', meta: { terminateLoop: true } };
  }

  const result = await db
    .delete(tasksTable)
    .where(and(eq(tasksTable.operatorId, ctx.operatorId), eq(tasksTable.contextName, name)))
    .returning({ id: tasksTable.id });

  console.log(`[agency] delete_task: "${name}" (${result.length} rows)`);
  onProgress?.({ event: 'deleting_task', payload: { deleting_task: name } });

  return {
    content: result.length > 0
      ? `Task "${name}" deleted.`
      : `No task named "${name}" found in your station.`,
  };
}

async function handleHttpRequest(
  rawArgs: string,
  ctx: ToolHandlerContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult> {
  const httpArgs = parseArgs<{
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string;
  }>(rawArgs);

  if (!httpArgs.url) {
    return { content: 'http_request requires a "url" and "method".', meta: { terminateLoop: true } };
  }
  const method = httpArgs.method || 'GET';

  console.log(`[agency] http_request: ${method} ${httpArgs.url}`);
  onProgress?.({ event: 'calling', payload: { calling: httpArgs.url } });

  let toolResultText: string;
  try {
    toolResultText = await executeHttpWithOAuth(ctx.operatorId, {
      method,
      url: httpArgs.url,
      headers: httpArgs.headers,
      body: httpArgs.body,
    });
  } catch (err: any) {
    toolResultText = `HTTP request failed: ${err?.message ?? 'unknown error'}`;
    console.error(`[agency] http_request error:`, err?.message);
  }

  // Persist HTTP response into conversation log (same shape chat.ts used).
  await db.insert(messagesTable).values({
    id: crypto.randomUUID(),
    conversationId: ctx.conversationId,
    operatorId: ctx.operatorId,
    role: 'system',
    content: `[HTTP Response]\n${toolResultText}`,
  });

  return {
    content: `[HTTP Response]\n${toolResultText}`,
    meta: { httpRequestFired: true },
  };
}

// ───────────────────────────────────────────────────────────────────────────
//  WAVE 1 — INTEGRATION MGMT, MEMORY, KB-LEARNED, SELF, TASK HELPERS
// ───────────────────────────────────────────────────────────────────────────

async function handleListIntegrations(_rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const rows = await db
    .select({
      integrationType: operatorIntegrationsTable.integrationType,
      integrationLabel: operatorIntegrationsTable.integrationLabel,
      status: operatorIntegrationsTable.status,
      isCustomApp: operatorIntegrationsTable.isCustomApp,
      baseUrl: operatorIntegrationsTable.baseUrl,
      createdAt: operatorIntegrationsTable.createdAt,
    })
    .from(operatorIntegrationsTable)
    .where(eq(operatorIntegrationsTable.operatorId, ctx.operatorId));

  if (rows.length === 0) return { content: 'No integrations connected yet.' };

  const lines = rows.map((r) =>
    `- ${r.integrationType} (${r.integrationLabel}) — status: ${r.status ?? 'connected'}${r.isCustomApp ? ' [custom_app]' : ''}${r.baseUrl ? ` @ ${r.baseUrl}` : ''}`,
  );
  return { content: `Connected integrations (${rows.length}):\n${lines.join('\n')}` };
}

async function handleRequestCredential(rawArgs: string, _ctx: ToolHandlerContext): Promise<ToolResult> {
  const args = parseArgs<{
    integrationType?: string;
    label?: string;
    instructions?: string;
    docsUrl?: string;
    fields?: Array<{ name: string; label: string; type: string; placeholder?: string; required?: boolean; hint?: string }>;
  }>(rawArgs);

  if (!args.integrationType || !args.label || !Array.isArray(args.fields) || args.fields.length === 0) {
    return { content: 'request_credential requires "integrationType", "label", and a non-empty "fields" array.', meta: { terminateLoop: true } };
  }

  const widget = {
    kind: 'connect_form',
    integrationType: args.integrationType,
    label: args.label,
    ...(args.instructions ? { instructions: args.instructions } : {}),
    ...(args.docsUrl ? { docsUrl: args.docsUrl } : {}),
    fields: args.fields,
  };

  // The widget is delivered as a fenced opsoul-widget block in the tool result.
  // The operator's next assistant turn quotes this block; ChatSection.tsx
  // detects the fence and renders TokenDropCard inline.
  return {
    content: `\`\`\`opsoul-widget\n${JSON.stringify(widget)}\n\`\`\`\n\nThe owner can drop the credential in the card above. The integration will be created the moment they hit Connect.`,
  };
}

async function handleConnectWithSecret(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const args = parseArgs<{ integrationType?: string; label?: string; secretKey?: string; baseUrl?: string }>(rawArgs);
  if (!args.integrationType || !args.label || !args.secretKey) {
    return { content: 'connect_with_secret requires "integrationType", "label", and "secretKey".', meta: { terminateLoop: true } };
  }

  const [secret] = await db
    .select()
    .from(operatorSecretsTable)
    .where(and(
      eq(operatorSecretsTable.operatorId, ctx.operatorId),
      eq(operatorSecretsTable.key, args.secretKey.toUpperCase()),
    ));

  if (!secret) {
    return { content: `No secret named "${args.secretKey.toUpperCase()}" in this operator's Keys & Secrets.` };
  }

  const { encryptToken, decryptToken } = await import('@workspace/opsoul-utils/crypto');
  const tokenPlain = decryptToken(secret.valueEncrypted);
  const tokenEncrypted = encryptToken(tokenPlain);

  await db.insert(operatorIntegrationsTable).values({
    id: crypto.randomUUID(),
    operatorId: ctx.operatorId,
    ownerId: ctx.ownerId,
    integrationType: args.integrationType,
    integrationLabel: args.label,
    tokenEncrypted,
    scopes: [args.integrationType],
    status: 'connected',
    ...(args.baseUrl ? { baseUrl: args.baseUrl, isCustomApp: true } : {}),
  });

  return { content: `Connected ${args.integrationType} ("${args.label}") using stored secret ${args.secretKey.toUpperCase()}.` };
}

async function handleDisconnectIntegration(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { integrationType } = parseArgs<{ integrationType?: string }>(rawArgs);
  if (!integrationType) {
    return { content: 'disconnect_integration requires "integrationType".', meta: { terminateLoop: true } };
  }

  const deleted = await db
    .delete(operatorIntegrationsTable)
    .where(and(
      eq(operatorIntegrationsTable.operatorId, ctx.operatorId),
      eq(operatorIntegrationsTable.integrationType, integrationType),
    ))
    .returning({ id: operatorIntegrationsTable.id });

  return {
    content: deleted.length > 0
      ? `Disconnected ${integrationType}. ${deleted.length} row(s) removed.`
      : `No connected integration of type "${integrationType}" was found.`,
  };
}

async function handleListSecrets(_rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const rows = await db
    .select({ key: operatorSecretsTable.key })
    .from(operatorSecretsTable)
    .where(eq(operatorSecretsTable.operatorId, ctx.operatorId));

  if (rows.length === 0) return { content: 'No secrets stored.' };
  return { content: `Stored secret labels:\n${rows.map(r => `- ${r.key}`).join('\n')}\n\nValues are never returned by this tool. Use {{LABEL}} placeholders in http_request or pass the label to connect_with_secret.` };
}

async function handleRunTaskNow(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { name } = parseArgs<{ name?: string }>(rawArgs);
  if (!name) return { content: 'run_task_now requires a "name".', meta: { terminateLoop: true } };

  const [task] = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(and(eq(tasksTable.operatorId, ctx.operatorId), eq(tasksTable.contextName, name)));

  if (!task) return { content: `No task named "${name}" in this station.` };

  const result = await runSingleTask(task.id, { rescheduleAfter: false });
  return {
    content: result.ok
      ? `Task "${name}" executed in ${result.durationSec.toFixed(1)}s. Result: ${result.summary}`
      : `Task "${name}" failed: ${result.summary}`,
  };
}

async function handleListTasks(_rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const rows = await db
    .select({
      name: tasksTable.contextName,
      schedule: tasksTable.taskType,
      status: tasksTable.status,
      lastRunAt: tasksTable.lastRunAt,
      nextRunAt: tasksTable.nextRunAt,
    })
    .from(tasksTable)
    .where(eq(tasksTable.operatorId, ctx.operatorId))
    .orderBy(desc(tasksTable.createdAt));

  if (rows.length === 0) return { content: 'No scheduled tasks.' };

  const lines = rows.map((r) =>
    `- "${r.name}" — ${r.schedule}, ${r.status ?? 'active'}` +
    (r.lastRunAt ? `, last run ${r.lastRunAt.toISOString()}` : ', not yet run') +
    (r.nextRunAt ? `, next ${r.nextRunAt.toISOString()}` : ''),
  );
  return { content: `Scheduled tasks (${rows.length}):\n${lines.join('\n')}` };
}

async function handleGetTaskHistory(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { name } = parseArgs<{ name?: string }>(rawArgs);
  if (!name) return { content: 'get_task_history requires a "name".', meta: { terminateLoop: true } };

  const [task] = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.operatorId, ctx.operatorId), eq(tasksTable.contextName, name)));

  if (!task) return { content: `No task named "${name}" in this station.` };

  const payload = (task.payload ?? {}) as { lastRunSummary?: string; lastRunDurationSec?: number };
  if (!task.lastRunAt) return { content: `Task "${name}" has not run yet.` };

  return {
    content: `Last run of "${name}":\n- At: ${task.lastRunAt.toISOString()}\n- Duration: ${payload.lastRunDurationSec ?? '?'}s\n- Summary: ${payload.lastRunSummary ?? '(empty)'}`,
  };
}

async function handleStoreMemory(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { content, memoryType, weight } = parseArgs<{ content?: string; memoryType?: string; weight?: number }>(rawArgs);
  if (!content || !memoryType) return { content: 'store_memory requires "content" and "memoryType".', meta: { terminateLoop: true } };
  const allowed = ['fact', 'preference', 'context', 'event'];
  if (!allowed.includes(memoryType)) return { content: `memoryType must be one of: ${allowed.join(', ')}.`, meta: { terminateLoop: true } };

  const w = typeof weight === 'number' ? Math.max(0, Math.min(1, weight)) : 1.0;
  // memoryType is validated against the allowed list above, so the cast to
  // MemoryType is safe.
  const stored = await storeMemory(
    ctx.operatorId,
    ctx.ownerId,
    content,
    memoryType as Parameters<typeof storeMemory>[3],
    'user',
    w,
    false,
    ctx.scope.scopeId,
    ctx.scope.scopeTrust,
  );
  return { content: `Memory stored (id ${stored.id}, type ${memoryType}, weight ${w.toFixed(2)}). It enters the same decay/retrieval pipeline as auto-stored memories.` };
}

async function handleSearchMemory(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { query, topN } = parseArgs<{ query?: string; topN?: number }>(rawArgs);
  if (!query) return { content: 'search_memory requires a "query".', meta: { terminateLoop: true } };

  const embedding = await embed(query);
  const hits = await searchMemory(ctx.operatorId, embedding, typeof topN === 'number' ? Math.max(1, Math.min(20, topN)) : 5);
  if (hits.length === 0) return { content: `No matching memories for: "${query}".` };

  const lines = hits.map((h, i) =>
    `${i + 1}. [${h.memoryType}, sim ${h.similarity.toFixed(2)}] ${h.content}`,
  );
  return { content: `Top ${hits.length} memory hits for "${query}":\n${lines.join('\n')}` };
}

async function handleListMemories(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { limit } = parseArgs<{ limit?: number }>(rawArgs);
  const n = typeof limit === 'number' ? Math.max(1, Math.min(50, limit)) : 10;

  const rows = await db
    .select({
      id: operatorMemoryTable.id,
      content: operatorMemoryTable.content,
      memoryType: operatorMemoryTable.memoryType,
      weight: operatorMemoryTable.weight,
      createdAt: operatorMemoryTable.createdAt,
    })
    .from(operatorMemoryTable)
    .where(eq(operatorMemoryTable.operatorId, ctx.operatorId))
    .orderBy(desc(operatorMemoryTable.createdAt))
    .limit(n);

  if (rows.length === 0) return { content: 'No memories stored yet.' };
  const lines = rows.map((r) =>
    `- [${r.memoryType}, w${(r.weight ?? 1).toFixed(2)}, ${r.createdAt?.toISOString() ?? ''}] ${r.content.slice(0, 200)}`,
  );
  return { content: `Most recent ${rows.length} memories:\n${lines.join('\n')}` };
}

async function handleKbSearch(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { query, topN } = parseArgs<{ query?: string; topN?: number }>(rawArgs);
  if (!query) return { content: 'kb_search requires a "query".', meta: { terminateLoop: true } };
  const n = typeof topN === 'number' ? Math.max(1, Math.min(15, topN)) : 4;

  const embedding = await embed(query);
  const hits = await searchBothKbs(ctx.operatorId, embedding, n, 0.3, []);
  if (hits.length === 0) return { content: `No KB entries matched: "${query}".` };

  const lines = hits.map((h: { source?: string; content: string; similarity?: number; confidence?: number; entryId?: string }, i: number) =>
    `${i + 1}. [${h.source ?? 'kb'}, sim ${(h.similarity ?? 0).toFixed(2)}, conf ${h.confidence ?? '?'}] (id ${h.entryId ?? '?'}) ${h.content.slice(0, 300)}`,
  );
  return { content: `Top ${hits.length} KB hits for "${query}":\n${lines.join('\n')}\n\nTo remove a learned entry the operator added, call kb_delete_learned with the id from this list.` };
}

async function handleKbDeleteLearned(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { entryId } = parseArgs<{ entryId?: string }>(rawArgs);
  if (!entryId) return { content: 'kb_delete_learned requires "entryId".', meta: { terminateLoop: true } };

  const [entry] = await db
    .select()
    .from(operatorKbTable)
    .where(and(
      eq(operatorKbTable.id, entryId),
      eq(operatorKbTable.operatorId, ctx.operatorId),
    ));

  if (!entry) {
    return { content: `No learned KB entry with id "${entryId}" belongs to this operator. (Owner-dropped KB entries cannot be reached by this tool.)` };
  }
  if (entry.isSystem) {
    return { content: `KB entry "${entryId}" is a platform seed (isSystem=true). System entries are protected and cannot be deleted by the operator.` };
  }

  await db.delete(operatorKbTable).where(eq(operatorKbTable.id, entryId));
  return { content: `Learned KB entry "${entryId}" deleted. (Source: ${entry.sourceName ?? '—'}.)` };
}

async function handleKbPendingList(_rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const rows = await db
    .select({
      id: operatorKbTable.id,
      content: operatorKbTable.content,
      sourceName: operatorKbTable.sourceName,
      confidenceScore: operatorKbTable.confidenceScore,
      createdAt: operatorKbTable.createdAt,
    })
    .from(operatorKbTable)
    .where(and(
      eq(operatorKbTable.operatorId, ctx.operatorId),
      eq(operatorKbTable.verificationStatus, 'pending'),
    ))
    .orderBy(desc(operatorKbTable.createdAt))
    .limit(20);

  if (rows.length === 0) return { content: 'No pending KB entries.' };
  const lines = rows.map((r) =>
    `- id ${r.id} [conf ${r.confidenceScore ?? '?'}, ${r.createdAt?.toISOString() ?? ''}] from "${r.sourceName ?? '—'}": ${r.content.slice(0, 150)}…`,
  );
  return { content: `Pending KB entries (${rows.length}):\n${lines.join('\n')}` };
}

async function handleGetSelfInfo(_rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const [op] = await db
    .select()
    .from(operatorsTable)
    .where(eq(operatorsTable.id, ctx.operatorId));

  if (!op) return { content: 'Operator record not found.' };

  const archetypes = (op.archetype as string[] | null) ?? [];
  const lines = [
    `Name: ${op.name}`,
    `Id: ${op.id}`,
    `Owner id: ${op.ownerId}`,
    `Archetypes: ${archetypes.length > 0 ? archetypes.join(', ') : '—'}`,
    `Model: ${op.defaultModel ?? '(platform default)'}`,
    `Identity locked: ${op.layer1LockedAt ? 'yes' : 'no'}`,
    `Safe Mode: ${op.safeMode ? 'on' : 'off'}`,
    `Free Roaming: ${op.freeRoaming ? 'on' : 'off'}`,
    `Evolution lock: ${op.growLockLevel ?? 'CONTROLLED'}`,
  ];
  return { content: lines.join('\n') };
}

async function handleListConversations(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { limit } = parseArgs<{ limit?: number }>(rawArgs);
  const n = typeof limit === 'number' ? Math.max(1, Math.min(50, limit)) : 10;

  const rows = await db
    .select({
      id: conversationsTable.id,
      contextName: conversationsTable.contextName,
      scopeId: conversationsTable.scopeId,
      lastMessageAt: conversationsTable.lastMessageAt,
    })
    .from(conversationsTable)
    .where(eq(conversationsTable.operatorId, ctx.operatorId))
    .orderBy(desc(conversationsTable.lastMessageAt))
    .limit(n);

  if (rows.length === 0) return { content: 'No conversations yet.' };
  const lines = rows.map((r) =>
    `- "${r.contextName ?? '(untitled)'}" — scope ${r.scopeId ?? 'legacy'}, last ${r.lastMessageAt?.toISOString() ?? '—'} (id ${r.id})`,
  );
  return { content: `Recent conversations (${rows.length}):\n${lines.join('\n')}` };
}

// ───────────────────────────────────────────────────────────────────────────
//  WAVE 2 — OUTBOUND COMMS, FILE OPS, RESEARCH
// ───────────────────────────────────────────────────────────────────────────

/** Decrypt the token + read appSchema for a connected integration by type. */
async function loadIntegration(operatorId: string, integrationType: string): Promise<{ token: string; appSchema: Record<string, unknown> } | null> {
  const [row] = await db
    .select()
    .from(operatorIntegrationsTable)
    .where(and(
      eq(operatorIntegrationsTable.operatorId, operatorId),
      eq(operatorIntegrationsTable.integrationType, integrationType),
    ));
  if (!row || !row.tokenEncrypted) return null;
  const { decryptToken } = await import('@workspace/opsoul-utils/crypto');
  return {
    token: decryptToken(row.tokenEncrypted),
    appSchema: (row.appSchema as Record<string, unknown> | null) ?? {},
  };
}

/**
 * Audit a successful outbound channel send into messagesTable so the
 * Connections page can show "X messages sent" per channel. Stored as a
 * system-role message with a `[OUTBOUND ${type}]` prefix in its content.
 * Failures are not audited — only successful deliveries count.
 */
async function logOutboundSend(
  ctx: ToolHandlerContext,
  channelType: 'telegram' | 'whatsapp' | 'slack',
  target: string,
  text: string,
): Promise<void> {
  try {
    await db.insert(messagesTable).values({
      id: crypto.randomUUID(),
      conversationId: ctx.conversationId,
      operatorId: ctx.operatorId,
      role: 'system',
      content: `[OUTBOUND ${channelType}] → ${target}: ${text.slice(0, 200)}`,
    });
  } catch { /* audit best-effort */ }
}

async function handleSendTelegram(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { chatId, text } = parseArgs<{ chatId?: string; text?: string }>(rawArgs);
  if (!chatId || !text) return { content: 'send_telegram requires "chatId" and "text".', meta: { terminateLoop: true } };

  const integration = await loadIntegration(ctx.operatorId, 'telegram');
  if (!integration) return { content: 'No Telegram integration connected. Ask the owner to connect one in Connections.' };

  const res = await fetch(`https://api.telegram.org/bot${integration.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  const body = await res.text();
  if (!res.ok) return { content: `Telegram sendMessage failed (HTTP ${res.status}): ${body.slice(0, 300)}` };
  await logOutboundSend(ctx, 'telegram', chatId, text);
  return { content: `Telegram message delivered to ${chatId}.` };
}

async function handleSendWhatsApp(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { to, text } = parseArgs<{ to?: string; text?: string }>(rawArgs);
  if (!to || !text) return { content: 'send_whatsapp requires "to" and "text".', meta: { terminateLoop: true } };

  const integration = await loadIntegration(ctx.operatorId, 'whatsapp');
  if (!integration) return { content: 'No WhatsApp integration connected. Ask the owner to connect one in Connections.' };

  const phoneNumberId = (integration.appSchema.phoneNumberId as string | undefined) ?? null;
  if (!phoneNumberId) return { content: 'WhatsApp integration is missing phoneNumberId in appSchema — reconnect to fix.' };

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${integration.token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  });
  const body = await res.text();
  if (!res.ok) return { content: `WhatsApp send failed (HTTP ${res.status}): ${body.slice(0, 300)}` };
  await logOutboundSend(ctx, 'whatsapp', to, text);
  return { content: `WhatsApp message delivered to ${to}.` };
}

async function handleSendSlack(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { channel, text } = parseArgs<{ channel?: string; text?: string }>(rawArgs);
  if (!channel || !text) return { content: 'send_slack requires "channel" and "text".', meta: { terminateLoop: true } };

  const integration = await loadIntegration(ctx.operatorId, 'slack');
  if (!integration) return { content: 'No Slack integration connected.' };

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${integration.token}` },
    body: JSON.stringify({ channel, text }),
  });
  const body = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
  if (!body.ok) return { content: `Slack post failed: ${body.error ?? 'unknown error'}` };
  await logOutboundSend(ctx, 'slack', channel, text);
  return { content: `Slack message posted to ${channel}.` };
}

async function handleNotifyOwner(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { text } = parseArgs<{ text?: string }>(rawArgs);
  if (!text) return { content: 'notify_owner requires "text".', meta: { terminateLoop: true } };

  // Probe channels in preference order: telegram > whatsapp > slack.
  const candidates = ['telegram', 'whatsapp', 'slack'] as const;
  for (const type of candidates) {
    const integration = await loadIntegration(ctx.operatorId, type);
    if (!integration) continue;

    const ownerTarget = (integration.appSchema.ownerChatId as string | undefined)
      ?? (integration.appSchema.ownerPhone as string | undefined)
      ?? (integration.appSchema.ownerChannel as string | undefined);
    if (!ownerTarget) continue;

    if (type === 'telegram') {
      const r = await fetch(`https://api.telegram.org/bot${integration.token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ownerTarget, text }),
      });
      if (r.ok) return { content: `Owner notified via Telegram (${ownerTarget}).` };
    } else if (type === 'whatsapp') {
      const phoneNumberId = integration.appSchema.phoneNumberId as string | undefined;
      if (!phoneNumberId) continue;
      const r = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${integration.token}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: ownerTarget, type: 'text', text: { body: text } }),
      });
      if (r.ok) return { content: `Owner notified via WhatsApp (${ownerTarget}).` };
    } else if (type === 'slack') {
      const r = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${integration.token}` },
        body: JSON.stringify({ channel: ownerTarget, text }),
      });
      const body = await r.json().catch(() => ({})) as { ok?: boolean };
      if (body.ok) return { content: `Owner notified via Slack (${ownerTarget}).` };
    }
  }
  return {
    content: 'No outbound channel is configured with an owner target. Set appSchema.ownerChatId on telegram, appSchema.ownerPhone on whatsapp, or appSchema.ownerChannel on slack — then call again.',
  };
}

async function handleDeleteFile(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { filename } = parseArgs<{ filename?: string }>(rawArgs);
  if (!filename) return { content: 'delete_file requires "filename".', meta: { terminateLoop: true } };

  const deleted = await db
    .delete(operatorFilesTable)
    .where(and(
      eq(operatorFilesTable.operatorId, ctx.operatorId),
      eq(operatorFilesTable.filename, filename),
    ))
    .returning({ id: operatorFilesTable.id });
  return {
    content: deleted.length > 0
      ? `Deleted "${filename}" from workspace.`
      : `No file named "${filename}" in workspace.`,
  };
}

async function handleAppendToFile(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { filename, content } = parseArgs<{ filename?: string; content?: string }>(rawArgs);
  if (!filename || content === undefined) return { content: 'append_to_file requires "filename" and "content".', meta: { terminateLoop: true } };

  const [existing] = await db
    .select()
    .from(operatorFilesTable)
    .where(and(
      eq(operatorFilesTable.operatorId, ctx.operatorId),
      eq(operatorFilesTable.filename, filename),
    ));

  if (existing) {
    const next = `${existing.content}${content}`;
    await db.update(operatorFilesTable)
      .set({ content: next, updatedAt: new Date() })
      .where(eq(operatorFilesTable.id, existing.id));
    return { content: `Appended ${content.length} chars to "${filename}" (total ${next.length} chars).` };
  }

  await db.insert(operatorFilesTable).values({
    id: crypto.randomUUID(),
    operatorId: ctx.operatorId,
    ownerId: ctx.ownerId,
    filename,
    content,
  });
  return { content: `Created "${filename}" with ${content.length} chars (no prior file existed — append created it).` };
}

async function handleDownloadToWorkspace(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { url, filename } = parseArgs<{ url?: string; filename?: string }>(rawArgs);
  if (!url || !filename) return { content: 'download_to_workspace requires "url" and "filename".', meta: { terminateLoop: true } };

  let res: Response;
  try { res = await fetch(url); }
  catch (err) { return { content: `Fetch failed: ${(err as Error).message}` }; }
  if (!res.ok) return { content: `Fetch returned HTTP ${res.status}.` };

  const ctype = res.headers.get('content-type') ?? '';
  let body = await res.text();

  // Crude HTML strip: drop tags + script/style blocks if the content type suggests HTML.
  if (ctype.includes('html')) {
    body = body
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  body = body.slice(0, 100 * 1024);

  await db.insert(operatorFilesTable).values({
    id: crypto.randomUUID(),
    operatorId: ctx.operatorId,
    ownerId: ctx.ownerId,
    filename,
    content: body,
  });
  return { content: `Downloaded ${body.length} chars from ${url} to workspace as "${filename}".` };
}

async function handleFetchUrl(rawArgs: string, _ctx: ToolHandlerContext): Promise<ToolResult> {
  const { url } = parseArgs<{ url?: string }>(rawArgs);
  if (!url) return { content: 'fetch_url requires "url".', meta: { terminateLoop: true } };

  let res: Response;
  try { res = await fetch(url); }
  catch (err) { return { content: `Fetch failed: ${(err as Error).message}` }; }
  if (!res.ok) return { content: `Fetch returned HTTP ${res.status}.` };

  const ctype = res.headers.get('content-type') ?? '';
  let body = await res.text();
  if (ctype.includes('html')) {
    body = body
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return { content: body.slice(0, 10000) };
}

async function handleExtractPdfText(rawArgs: string, _ctx: ToolHandlerContext): Promise<ToolResult> {
  const { url } = parseArgs<{ url?: string }>(rawArgs);
  if (!url) return { content: 'extract_pdf_text requires "url".', meta: { terminateLoop: true } };

  let res: Response;
  try { res = await fetch(url); }
  catch (err) { return { content: `Fetch failed: ${(err as Error).message}` }; }
  if (!res.ok) return { content: `Fetch returned HTTP ${res.status}.` };

  const buffer = Buffer.from(await res.arrayBuffer());
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  return { content: result.text.slice(0, 12000) };
}

// ───────────────────────────────────────────────────────────────────────────
//  WAVE 2 (cont.) — ARTIFACT RENDERERS
//  Each tool emits a fenced opsoul-widget block. ChatSection's WidgetBlock
//  detects it and renders the matching component (ChartCard/TableCard/
//  MermaidCard). No DB write — these are pure presentation payloads.
// ───────────────────────────────────────────────────────────────────────────

function emitWidget(payload: unknown, afterText?: string): string {
  return `\`\`\`opsoul-widget\n${JSON.stringify(payload)}\n\`\`\`${afterText ? `\n${afterText}` : ''}`;
}

async function handleRenderChart(rawArgs: string, _ctx: ToolHandlerContext): Promise<ToolResult> {
  const args = parseArgs<{ chartType?: string; title?: string; data?: Array<{ label?: string; value?: number }> }>(rawArgs);
  if (args.chartType !== 'bar' && args.chartType !== 'line' && args.chartType !== 'pie') {
    return { content: 'render_chart requires chartType ∈ {bar, line, pie}.', meta: { terminateLoop: true } };
  }
  if (!Array.isArray(args.data)) {
    return { content: 'render_chart requires a "data" array of {label, value} points.', meta: { terminateLoop: true } };
  }
  const data = args.data.filter((p): p is { label: string; value: number } =>
    typeof p?.label === 'string' && typeof p?.value === 'number',
  );
  return { content: emitWidget({ kind: 'chart', chartType: args.chartType, title: args.title, data }) };
}

async function handleRenderTable(rawArgs: string, _ctx: ToolHandlerContext): Promise<ToolResult> {
  const args = parseArgs<{ title?: string; columns?: string[]; rows?: string[][] }>(rawArgs);
  if (!Array.isArray(args.columns) || !Array.isArray(args.rows)) {
    return { content: 'render_table requires "columns" (string[]) and "rows" (string[][]).', meta: { terminateLoop: true } };
  }
  return { content: emitWidget({ kind: 'table', title: args.title, columns: args.columns, rows: args.rows }) };
}

async function handleRenderDiagram(rawArgs: string, _ctx: ToolHandlerContext): Promise<ToolResult> {
  const { title, diagram } = parseArgs<{ title?: string; diagram?: string }>(rawArgs);
  if (!diagram) return { content: 'render_diagram requires "diagram" (Mermaid source).', meta: { terminateLoop: true } };
  return { content: emitWidget({ kind: 'mermaid', title, diagram }) };
}

// ───────────────────────────────────────────────────────────────────────────
//  WAVE 3 — CONNECTED-APP FIRST-CLASS TOOLS
//  All route through executeHttpWithOAuth() so the integration's stored
//  token is injected server-side and Google OAuth refresh is automatic.
//  The LLM never sees raw credentials.
// ───────────────────────────────────────────────────────────────────────────

async function callOAuth(
  operatorId: string,
  method: string,
  url: string,
  body?: Record<string, unknown> | string,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const isString = typeof body === 'string';
  return executeHttpWithOAuth(operatorId, {
    method,
    url,
    headers: { 'Content-Type': isString ? 'text/plain' : 'application/json', ...extraHeaders },
    body: body === undefined ? undefined : isString ? (body as string) : JSON.stringify(body),
  });
}

// Gmail —————————————————————————————————————————————————————————————

async function handleGmailSend(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { to, subject, body } = parseArgs<{ to?: string; subject?: string; body?: string }>(rawArgs);
  if (!to || !subject || body === undefined) return { content: 'gmail_send requires "to", "subject", "body".', meta: { terminateLoop: true } };
  const raw = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`;
  const b64 = Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const result = await callOAuth(ctx.operatorId, 'POST', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { raw: b64 });
  return { content: result };
}

async function handleGmailSearch(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { query } = parseArgs<{ query?: string }>(rawArgs);
  if (!query) return { content: 'gmail_search requires "query".', meta: { terminateLoop: true } };
  const result = await callOAuth(ctx.operatorId, 'GET', `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`);
  return { content: result };
}

async function handleGmailRead(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { messageId } = parseArgs<{ messageId?: string }>(rawArgs);
  if (!messageId) return { content: 'gmail_read requires "messageId".', meta: { terminateLoop: true } };
  const result = await callOAuth(ctx.operatorId, 'GET', `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`);
  return { content: result };
}

// Google Calendar ——————————————————————————————————————————————————————

async function handleCalendarCreateEvent(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { summary, startIso, endIso, description, location } = parseArgs<{
    summary?: string; startIso?: string; endIso?: string; description?: string; location?: string;
  }>(rawArgs);
  if (!summary || !startIso || !endIso) return { content: 'calendar_create_event requires "summary", "startIso", "endIso".', meta: { terminateLoop: true } };
  const result = await callOAuth(ctx.operatorId, 'POST', 'https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    summary, start: { dateTime: startIso }, end: { dateTime: endIso }, description, location,
  });
  return { content: result };
}

async function handleCalendarListEvents(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { timeMinIso, timeMaxIso } = parseArgs<{ timeMinIso?: string; timeMaxIso?: string }>(rawArgs);
  const tMin = timeMinIso ?? new Date().toISOString();
  const tMax = timeMaxIso ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}&maxResults=10&singleEvents=true&orderBy=startTime`;
  return { content: await callOAuth(ctx.operatorId, 'GET', url) };
}

// Drive —————————————————————————————————————————————————————————————

async function handleDriveSearch(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { query } = parseArgs<{ query?: string }>(rawArgs);
  if (!query) return { content: 'drive_search requires "query".', meta: { terminateLoop: true } };
  const q = `name contains '${query.replace(/'/g, "\\'")}'`;
  return { content: await callOAuth(ctx.operatorId, 'GET', `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=10&fields=files(id,name,mimeType)`) };
}

async function handleDriveReadFile(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { fileId } = parseArgs<{ fileId?: string }>(rawArgs);
  if (!fileId) return { content: 'drive_read_file requires "fileId".', meta: { terminateLoop: true } };
  // Try export-as-text first (works for Google Docs). For binary files, fall back to alt=media.
  const exportRes = await callOAuth(ctx.operatorId, 'GET', `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`);
  if (exportRes.startsWith('HTTP') || exportRes.includes('"error"')) {
    return { content: (await callOAuth(ctx.operatorId, 'GET', `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`)).slice(0, 10000) };
  }
  return { content: exportRes.slice(0, 10000) };
}

// GitHub ————————————————————————————————————————————————————————————

async function handleGithubCreateIssue(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { repo, title, body } = parseArgs<{ repo?: string; title?: string; body?: string }>(rawArgs);
  if (!repo || !title) return { content: 'github_create_issue requires "repo" and "title".', meta: { terminateLoop: true } };
  return { content: await callOAuth(ctx.operatorId, 'POST', `https://api.github.com/repos/${repo}/issues`, { title, body: body ?? '' }) };
}

async function handleGithubSearch(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { scope, query } = parseArgs<{ scope?: string; query?: string }>(rawArgs);
  if (!scope || !query || !['code', 'issues', 'repositories'].includes(scope)) {
    return { content: 'github_search requires scope ∈ {code, issues, repositories} and "query".', meta: { terminateLoop: true } };
  }
  return { content: await callOAuth(ctx.operatorId, 'GET', `https://api.github.com/search/${scope}?q=${encodeURIComponent(query)}&per_page=10`) };
}

async function handleGithubReadFile(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { repo, path, ref } = parseArgs<{ repo?: string; path?: string; ref?: string }>(rawArgs);
  if (!repo || !path) return { content: 'github_read_file requires "repo" and "path".', meta: { terminateLoop: true } };
  const url = `https://api.github.com/repos/${repo}/contents/${path}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
  const result = await callOAuth(ctx.operatorId, 'GET', url, undefined, { Accept: 'application/vnd.github.raw' });
  return { content: result.slice(0, 12000) };
}

// Notion ————————————————————————————————————————————————————————————

async function handleNotionSearch(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { query } = parseArgs<{ query?: string }>(rawArgs);
  if (!query) return { content: 'notion_search requires "query".', meta: { terminateLoop: true } };
  return { content: await callOAuth(ctx.operatorId, 'POST', 'https://api.notion.com/v1/search', { query, page_size: 10 }, { 'Notion-Version': '2022-06-28' }) };
}

async function handleNotionCreatePage(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { parentPageId, title, content } = parseArgs<{ parentPageId?: string; title?: string; content?: string }>(rawArgs);
  if (!parentPageId || !title) return { content: 'notion_create_page requires "parentPageId" and "title".', meta: { terminateLoop: true } };
  const payload: Record<string, unknown> = {
    parent: { page_id: parentPageId },
    properties: { title: { title: [{ text: { content: title } }] } },
  };
  if (content) {
    payload.children = [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content } }] } }];
  }
  return { content: await callOAuth(ctx.operatorId, 'POST', 'https://api.notion.com/v1/pages', payload, { 'Notion-Version': '2022-06-28' }) };
}

// Slack ————————————————————————————————————————————————————————————

async function handleSlackSearch(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { query } = parseArgs<{ query?: string }>(rawArgs);
  if (!query) return { content: 'slack_search requires "query".', meta: { terminateLoop: true } };
  return { content: await callOAuth(ctx.operatorId, 'GET', `https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&count=10`) };
}

// Linear ————————————————————————————————————————————————————————————
//  Linear uses a GraphQL API at https://api.linear.app/graphql

async function handleLinearCreateIssue(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { teamId, title, description } = parseArgs<{ teamId?: string; title?: string; description?: string }>(rawArgs);
  if (!teamId || !title) return { content: 'linear_create_issue requires "teamId" and "title".', meta: { terminateLoop: true } };
  const mutation = `mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id title identifier } } }`;
  return { content: await callOAuth(ctx.operatorId, 'POST', 'https://api.linear.app/graphql', { query: mutation, variables: { input: { teamId, title, description } } }) };
}

async function handleLinearSearch(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { query } = parseArgs<{ query?: string }>(rawArgs);
  if (!query) return { content: 'linear_search requires "query".', meta: { terminateLoop: true } };
  const gql = `query Search($q: String!) { issues(filter: { title: { contains: $q } }, first: 10) { nodes { id identifier title state { name } assignee { name } } } }`;
  return { content: await callOAuth(ctx.operatorId, 'POST', 'https://api.linear.app/graphql', { query: gql, variables: { q: query } }) };
}

// HubSpot ————————————————————————————————————————————————————————————

async function handleHubspotSearchContact(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { query } = parseArgs<{ query?: string }>(rawArgs);
  if (!query) return { content: 'hubspot_search_contact requires "query".', meta: { terminateLoop: true } };
  return { content: await callOAuth(ctx.operatorId, 'POST', 'https://api.hubapi.com/crm/v3/objects/contacts/search', {
    query, limit: 10,
    properties: ['firstname', 'lastname', 'email', 'company'],
  }) };
}

async function handleHubspotCreateDeal(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const { name, stage, amount } = parseArgs<{ name?: string; stage?: string; amount?: number }>(rawArgs);
  if (!name || !stage) return { content: 'hubspot_create_deal requires "name" and "stage".', meta: { terminateLoop: true } };
  const properties: Record<string, unknown> = { dealname: name, dealstage: stage };
  if (typeof amount === 'number') properties.amount = String(amount);
  return { content: await callOAuth(ctx.operatorId, 'POST', 'https://api.hubapi.com/crm/v3/objects/deals', { properties }) };
}

// ───────────────────────────────────────────────────────────────────────────
//  DISPATCH — single entry point for chat.ts and mcpServer.ts
// ───────────────────────────────────────────────────────────────────────────

/**
 * Dispatch a tool call to the appropriate handler.
 *
 * Returns ToolResult with `content` (LLM-visible) and optional `meta`
 * (chat.ts loop-control hints). The optional `onProgress` callback is
 * invoked with SSE-style events that the chat route forwards to the
 * browser so the UI can show "Searching..." indicators while the
 * underlying work runs.
 *
 * If the tool name is not in the registry, returns a clear error string
 * (rather than throwing) so the LLM can see it and recover.
 */
export async function dispatchTool(
  name: string,
  rawArgs: string,
  ctx: ToolHandlerContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult> {
  // Validate against registry — a tool that isn't registered returns a
  // clear error message rather than silently failing.
  if (!getTool(name)) {
    return {
      content: `Tool "${name}" is not registered in OpSoul's universal toolset. Available tools are defined in toolRegistry.ts.`,
    };
  }

  switch (name) {
    case 'web_search':       return handleWebSearch(rawArgs, ctx, onProgress);
    case 'kb_seed':          return handleKbSeed(rawArgs, ctx, onProgress);
    case 'write_file':       return handleWriteFile(rawArgs, ctx, onProgress);
    case 'read_file':        return handleReadFile(rawArgs, ctx, onProgress);
    case 'list_files':       return handleListFiles(rawArgs, ctx, onProgress);
    case 'get_current_time': return handleGetCurrentTime(rawArgs, ctx, onProgress);
    case 'schedule_task':    return handleScheduleTask(rawArgs, ctx, onProgress);
    case 'update_task':      return handleUpdateTask(rawArgs, ctx, onProgress);
    case 'pause_task':       return handlePauseTask(rawArgs, ctx, onProgress);
    case 'resume_task':      return handleResumeTask(rawArgs, ctx, onProgress);
    case 'delete_task':      return handleDeleteTask(rawArgs, ctx, onProgress);
    case 'http_request':     return handleHttpRequest(rawArgs, ctx, onProgress);

    // Wave 1
    case 'list_integrations':      return handleListIntegrations(rawArgs, ctx);
    case 'request_credential':     return handleRequestCredential(rawArgs, ctx);
    case 'connect_with_secret':    return handleConnectWithSecret(rawArgs, ctx);
    case 'disconnect_integration': return handleDisconnectIntegration(rawArgs, ctx);
    case 'list_secrets':           return handleListSecrets(rawArgs, ctx);
    case 'run_task_now':           return handleRunTaskNow(rawArgs, ctx);
    case 'list_tasks':             return handleListTasks(rawArgs, ctx);
    case 'get_task_history':       return handleGetTaskHistory(rawArgs, ctx);
    case 'store_memory':           return handleStoreMemory(rawArgs, ctx);
    case 'search_memory':          return handleSearchMemory(rawArgs, ctx);
    case 'list_memories':          return handleListMemories(rawArgs, ctx);
    case 'kb_search':              return handleKbSearch(rawArgs, ctx);
    case 'kb_delete_learned':      return handleKbDeleteLearned(rawArgs, ctx);
    case 'kb_pending_list':        return handleKbPendingList(rawArgs, ctx);
    case 'get_self_info':          return handleGetSelfInfo(rawArgs, ctx);
    case 'list_conversations':     return handleListConversations(rawArgs, ctx);

    // Wave 2
    case 'send_telegram':          return handleSendTelegram(rawArgs, ctx);
    case 'send_whatsapp':          return handleSendWhatsApp(rawArgs, ctx);
    case 'send_slack':             return handleSendSlack(rawArgs, ctx);
    case 'notify_owner':           return handleNotifyOwner(rawArgs, ctx);
    case 'delete_file':            return handleDeleteFile(rawArgs, ctx);
    case 'append_to_file':         return handleAppendToFile(rawArgs, ctx);
    case 'download_to_workspace':  return handleDownloadToWorkspace(rawArgs, ctx);
    case 'fetch_url':              return handleFetchUrl(rawArgs, ctx);
    case 'extract_pdf_text':       return handleExtractPdfText(rawArgs, ctx);

    // Wave 2 — artifact renderers
    case 'render_chart':           return handleRenderChart(rawArgs, ctx);
    case 'render_table':           return handleRenderTable(rawArgs, ctx);
    case 'render_diagram':         return handleRenderDiagram(rawArgs, ctx);

    // Wave 3 — connected-app first-class tools
    case 'gmail_send':              return handleGmailSend(rawArgs, ctx);
    case 'gmail_search':            return handleGmailSearch(rawArgs, ctx);
    case 'gmail_read':              return handleGmailRead(rawArgs, ctx);
    case 'calendar_create_event':   return handleCalendarCreateEvent(rawArgs, ctx);
    case 'calendar_list_events':    return handleCalendarListEvents(rawArgs, ctx);
    case 'drive_search':            return handleDriveSearch(rawArgs, ctx);
    case 'drive_read_file':         return handleDriveReadFile(rawArgs, ctx);
    case 'github_create_issue':     return handleGithubCreateIssue(rawArgs, ctx);
    case 'github_search':           return handleGithubSearch(rawArgs, ctx);
    case 'github_read_file':        return handleGithubReadFile(rawArgs, ctx);
    case 'notion_search':           return handleNotionSearch(rawArgs, ctx);
    case 'notion_create_page':      return handleNotionCreatePage(rawArgs, ctx);
    case 'slack_search':            return handleSlackSearch(rawArgs, ctx);
    case 'linear_create_issue':     return handleLinearCreateIssue(rawArgs, ctx);
    case 'linear_search':           return handleLinearSearch(rawArgs, ctx);
    case 'hubspot_search_contact':  return handleHubspotSearchContact(rawArgs, ctx);
    case 'hubspot_create_deal':     return handleHubspotCreateDeal(rawArgs, ctx);

    default:
      return {
        content: `Tool "${name}" exists in the registry but has no handler implementation.`,
      };
  }
}
