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
} from '@workspace/db';
import { and, eq } from 'drizzle-orm';
import { buildTemporalContext } from './systemPrompt.js';
import { executeWebSearch } from './capabilityEngine.js';
import { persistKbSeedEntry } from './kbIntake.js';
import { storeMemory } from './memoryEngine.js';
import {
  persistWebSearchResult,
  executeHttpWithOAuth,
} from './toolPersistence.js';
import { getTool } from './toolRegistry.js';
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
    default:
      return {
        content: `Tool "${name}" exists in the registry but has no handler implementation.`,
      };
  }
}
