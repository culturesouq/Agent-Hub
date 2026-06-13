/**
 * sdkToolBridge.ts — CultureEyes SDK ↔ OpSoul tool dispatch adapter (Phase 1b).
 *
 * Five responsibilities:
 *   A. Lazy registry singleton — createRegistry() + seedCatalog() once.
 *   B. buildProvisionedList() — mirrors listToolsForContext() filtering logic
 *      but returns string[] (tool names) for registry.list(provisioned).
 *   C. buildSdkCtx() — assembles a ToolCtx from OpSoul's ToolHandlerContext.
 *   D. dispatchViaSdk() — single dispatch entry point; maps SDK ToolResult →
 *      OpSoul ToolResult (content + meta hints for the agent loop).
 *   E. listToolsViaSdk() — replaces listToolsForContext(); returns the same
 *      ToolDefinition[] shape the LLM call expects.
 *
 * Phase 1c will remove the old toolHandlers/toolRegistry dispatch paths.
 * Until then BOTH paths co-exist; chat.ts uses dispatchViaSdk from here.
 *
 * DO NOT TOUCH: system prompts, identity layers (L0-L4), GROW engine, memory
 * engine birth engine, operator soul/identity, or any patent-protected mechanism.
 */

import { createRegistry, seedCatalog } from '@cultureyes/tools';
import type { Registry } from '@cultureyes/tools';
import type { ToolCtx } from '@cultureyes/tools';
import type { AllConnectors } from '@cultureyes/tools';
import type {
  FileStore,
  FileEntry,
  PdfExtractor,
} from '@cultureyes/tools';
import type {
  MemoryConnector,
  KbAdminConnector,
  StoredMemoryRecord as SdkMemoryRecord,
  MemoryHit as SdkMemoryHit,
  KbSearchHit,
  KbPendingEntry,
  KbSeedResult as SdkKbSeedResult,
  KbDeleteResult,
} from '@cultureyes/tools';
import type {
  TaskStore,
  Task,
  TaskPatch,
  TaskStatus,
  TaskRunResult,
} from '@cultureyes/tools';
import type {
  IntegrationsConnector,
  SecretsAdmin,
  SelfInfoProvider,
  ConversationsStore,
  Integration,
  SelfInfo,
  ConversationSummary,
  WebSearchProvider,
  WebSearchHit,
} from '@cultureyes/tools';

import { db } from '@workspace/db';
import {
  operatorFilesTable,
  tasksTable,
  operatorMemoryTable,
  operatorKbTable,
  operatorSecretsTable,
  operatorIntegrationsTable,
  operatorsTable,
  conversationsTable,
} from '@workspace/db';
import { and, eq, desc } from 'drizzle-orm';
import crypto from 'crypto';

import { storeMemory, searchMemory } from './memoryEngine.js';
import { embed } from '@workspace/opsoul-utils/ai';
import { searchBothKbs } from './vectorSearch.js';
import { persistKbSeedEntry } from './kbIntake.js';
import { runSingleTask } from '../cron/tasksCron.js';

import type { ToolHandlerContext, ToolResult as OpSoulToolResult } from './toolHandlers.js';
import type { ScopeType, Availability } from './toolRegistry.js';
import { UNIVERSAL_TOOLS } from './toolRegistry.js';
// capabilityEngine (isWebSearchAvailable / isFirecrawlAvailable) is called by
// callers of buildProvisionedList() — not needed here directly.

// ───────────────────────────────────────────────────────────────────────────
//  A. REGISTRY SINGLETON
// ───────────────────────────────────────────────────────────────────────────

let _registry: Registry | null = null;

export function getRegistry(): Registry {
  if (!_registry) {
    _registry = createRegistry();
    seedCatalog(_registry);
  }
  return _registry;
}

// ───────────────────────────────────────────────────────────────────────────
//  B. PROVISIONED LIST — mirrors listToolsForContext() filtering logic
// ───────────────────────────────────────────────────────────────────────────

export interface ProvisionedListCtx {
  liveSecrets: string[];
  connectedIntegrations: string[];
  hasWebSearch: boolean;
  hasFirecrawl: boolean;
  scopeType: ScopeType;
  scopeTrust?: string;
}

/**
 * Returns the set of tool names the registry should provision for this turn.
 * Mirrors the availability + scope filtering in listToolsForContext() in
 * toolRegistry.ts — same gates, same output, different return shape (string[]).
 */
export function buildProvisionedList(ctx: ProvisionedListCtx): string[] {
  const names: string[] = [];

  for (const tool of UNIVERSAL_TOOLS) {
    // 1. Availability gate
    const avail: Availability = tool.availability;
    if (avail === 'web' && !ctx.hasWebSearch) continue;
    if (avail === 'secrets' && ctx.liveSecrets.length === 0) continue;
    if (avail === 'integration' && ctx.connectedIntegrations.length === 0) continue;
    if (avail === 'firecrawl' && !ctx.hasFirecrawl) continue;
    // 'always' always passes

    // 2. Scope gate — '*' or list includes the scope
    const scopes = tool.scopes;
    if (scopes !== '*' && !scopes.includes(ctx.scopeType)) continue;

    names.push(tool.name);
  }

  return names;
}

// ───────────────────────────────────────────────────────────────────────────
//  B2. LIST TOOLS — replaces listToolsForContext(), returns ToolDefinition[]
// ───────────────────────────────────────────────────────────────────────────

/**
 * Replica of ToolDefinition from openrouter.ts — defined locally to avoid a
 * cross-module import. The shape must stay byte-identical to the one chat.ts
 * and operatorToolset.ts use so all three callers interoperate.
 */
export interface SdkToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

/**
 * Replacement for listToolsForContext(). Returns the ToolDefinition[] the LLM
 * call expects, built from the SDK registry filtered by buildProvisionedList().
 *
 * Preserves the http_request dynamic-description suffix (live secret labels)
 * that was applied inside toToolDefinition() in toolRegistry.ts.
 */
export function listToolsViaSdk(ctx: ProvisionedListCtx): SdkToolDefinition[] {
  const provisioned = buildProvisionedList(ctx);
  const defs = getRegistry().list(provisioned);

  return defs.map(def => {
    let description = def.description;
    // Preserve the http_request live-secret-labels suffix from the old registry.
    if (def.name === 'http_request' && ctx.liveSecrets.length > 0) {
      description = `${description} Available stored secret labels: ${ctx.liveSecrets.map(s => `{{${s}}}`).join(', ')}.`;
    }
    const schema = def.schema as { type: 'object'; properties: Record<string, unknown>; required?: string[] };
    return {
      type: 'function' as const,
      function: {
        name: def.name,
        description,
        parameters: {
          type: 'object' as const,
          properties: schema.properties,
          required: schema.required ?? [],
        },
      },
    };
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  C. SDK CONTEXT BUILDER — assembles ToolCtx from OpSoul's handler context
// ───────────────────────────────────────────────────────────────────────────

const DEBUG = process.env.LOG_LEVEL === 'debug';

/**
 * Build the ToolCtx that the SDK registry passes into every tool execute().
 * Connectors wrap OpSoul's existing DB / engine functions — same data, same
 * persistence paths, just behind the SDK interface.
 */
export function buildSdkCtx(
  opCtx: ToolHandlerContext,
  _extraCtx: {
    operatorName: string;
    liveSecrets: string[];
    connectedIntegrations: string[];
  },
): ToolCtx {
  const { operatorId, ownerId } = opCtx;

  // ── secrets accessor ──────────────────────────────────────────────────────
  // Priority: operator DB secret → platform env var.
  // This lets platform-wide keys (FIRECRAWL_API_KEY, SERPER_API_KEY, etc.)
  // reach all SDK tools without per-operator setup, while still allowing
  // operators to override with their own key stored in the DB.
  const secrets = {
    get: async (name: string): Promise<string | undefined> => {
      const key = name.toUpperCase();
      const [row] = await db
        .select({ valueEncrypted: operatorSecretsTable.valueEncrypted })
        .from(operatorSecretsTable)
        .where(and(
          eq(operatorSecretsTable.operatorId, operatorId),
          eq(operatorSecretsTable.key, key),
        ))
        .limit(1);
      if (row) {
        const { decryptToken } = await import('@workspace/opsoul-utils/crypto');
        return decryptToken(row.valueEncrypted);
      }
      return process.env[key] ?? undefined;
    },
  };

  // ── logger ────────────────────────────────────────────────────────────────
  const logger = {
    info: (msg: string, meta?: unknown) => {
      if (DEBUG) console.log('[sdk]', msg, meta ?? '');
    },
    error: (msg: string, meta?: unknown) => {
      console.error('[sdk]', msg, meta ?? '');
    },
  };

  // ── files connector ────────────────────────────────────────────────────────
  const filesConnector: FileStore = {
    name: 'opsoul-files',
    async put(name: string, content: string) {
      const existing = await db
        .select({ id: operatorFilesTable.id })
        .from(operatorFilesTable)
        .where(and(eq(operatorFilesTable.operatorId, operatorId), eq(operatorFilesTable.filename, name)))
        .limit(1);
      if (existing.length > 0) {
        await db.update(operatorFilesTable)
          .set({ content, updatedAt: new Date() })
          .where(eq(operatorFilesTable.id, existing[0].id));
      } else {
        await db.insert(operatorFilesTable).values({
          id: crypto.randomUUID(),
          operatorId,
          ownerId,
          filename: name,
          content,
        });
      }
      return { size: content.length };
    },
    async get(name: string): Promise<string | null> {
      const [file] = await db
        .select({ content: operatorFilesTable.content })
        .from(operatorFilesTable)
        .where(and(eq(operatorFilesTable.operatorId, operatorId), eq(operatorFilesTable.filename, name)))
        .limit(1);
      return file?.content ?? null;
    },
    async list(): Promise<FileEntry[]> {
      const rows = await db
        .select({
          filename: operatorFilesTable.filename,
          content: operatorFilesTable.content,
          updatedAt: operatorFilesTable.updatedAt,
        })
        .from(operatorFilesTable)
        .where(eq(operatorFilesTable.operatorId, operatorId));
      return rows.map(r => ({
        filename: r.filename,
        size: r.content.length,
        updatedAt: r.updatedAt?.toISOString(),
      }));
    },
    async delete(name: string): Promise<boolean> {
      const result = await db
        .delete(operatorFilesTable)
        .where(and(eq(operatorFilesTable.operatorId, operatorId), eq(operatorFilesTable.filename, name)))
        .returning({ id: operatorFilesTable.id });
      return result.length > 0;
    },
    async append(name: string, content: string): Promise<{ created: boolean; size: number }> {
      const [existing] = await db
        .select()
        .from(operatorFilesTable)
        .where(and(eq(operatorFilesTable.operatorId, operatorId), eq(operatorFilesTable.filename, name)));
      if (existing) {
        const next = `${existing.content}${content}`;
        await db.update(operatorFilesTable)
          .set({ content: next, updatedAt: new Date() })
          .where(eq(operatorFilesTable.id, existing.id));
        return { created: false, size: next.length };
      }
      await db.insert(operatorFilesTable).values({
        id: crypto.randomUUID(),
        operatorId,
        ownerId,
        filename: name,
        content,
      });
      return { created: true, size: content.length };
    },
  };

  // ── PDF extractor connector — wraps the same pdf-parse path as the handler ──
  const pdfConnector: PdfExtractor = {
    name: 'opsoul-pdf',
    async extract(input: { url?: string; bytes?: Uint8Array }): Promise<string> {
      let buffer: Buffer;
      if (input.bytes) {
        buffer = Buffer.from(input.bytes);
      } else if (input.url) {
        const res = await fetch(input.url);
        if (!res.ok) throw new Error(`Fetch returned HTTP ${res.status}`);
        buffer = Buffer.from(await res.arrayBuffer());
      } else {
        throw new Error('extract_pdf_text requires url or bytes');
      }
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      await parser.destroy();
      return result.text;
    },
  };

  // ── memory connector ──────────────────────────────────────────────────────
  const memoryConnector: MemoryConnector = {
    name: 'opsoul-memory',
    async store(rec) {
      const type = rec.memoryType as Parameters<typeof storeMemory>[3];
      const stored = await storeMemory(
        operatorId,
        ownerId,
        rec.content,
        type,
        'user',
        rec.weight,
        false,
        opCtx.scope.scopeId,
        opCtx.scope.scopeTrust,
      );
      const result: SdkMemoryRecord = {
        id: stored.id,
        content: stored.content,
        memoryType: stored.memoryType as SdkMemoryRecord['memoryType'],
        weight: stored.weight ?? 1,
        createdAt: stored.createdAt?.toISOString(),
      };
      return result;
    },
    async search(query: string, k: number): Promise<SdkMemoryHit[]> {
      const embedding = await embed(query);
      const hits = await searchMemory(operatorId, embedding, k);
      return hits.map(h => ({
        content: h.content,
        memoryType: h.memoryType as SdkMemoryHit['memoryType'],
        similarity: h.similarity,
      }));
    },
    async list(n: number): Promise<SdkMemoryRecord[]> {
      const rows = await db
        .select({
          id: operatorMemoryTable.id,
          content: operatorMemoryTable.content,
          memoryType: operatorMemoryTable.memoryType,
          weight: operatorMemoryTable.weight,
          createdAt: operatorMemoryTable.createdAt,
        })
        .from(operatorMemoryTable)
        .where(eq(operatorMemoryTable.operatorId, operatorId))
        .orderBy(desc(operatorMemoryTable.createdAt))
        .limit(n);
      return rows.map(r => ({
        id: r.id,
        content: r.content,
        memoryType: r.memoryType as SdkMemoryRecord['memoryType'],
        weight: r.weight ?? 1,
        createdAt: r.createdAt?.toISOString(),
      }));
    },
  };

  // ── kbAdmin connector ─────────────────────────────────────────────────────
  const kbAdminConnector: KbAdminConnector = {
    name: 'opsoul-kb',
    async seed(entry): Promise<SdkKbSeedResult> {
      const result = await persistKbSeedEntry(
        operatorId,
        ownerId,
        entry.content,
        entry.source,
        entry.confidence,
      );
      return { stored: result.stored, reason: result.reason };
    },
    async search(query: string, topN: number): Promise<KbSearchHit[]> {
      const embedding = await embed(query);
      const hits = await searchBothKbs(operatorId, embedding, topN, 30, []);
      return hits.map((h: { source?: string; content: string; similarity?: number; confidence?: number; entryId?: string }) => ({
        entryId: h.entryId,
        content: h.content,
        source: h.source,
        similarity: h.similarity,
        confidence: h.confidence,
      }));
    },
    async deleteLearned(entryId: string): Promise<KbDeleteResult> {
      const [entry] = await db
        .select()
        .from(operatorKbTable)
        .where(and(
          eq(operatorKbTable.id, entryId),
          eq(operatorKbTable.operatorId, operatorId),
        ));
      if (!entry) return { deleted: false, reason: 'not_found' };
      if (entry.isSystem) return { deleted: false, reason: 'protected' };
      await db.delete(operatorKbTable).where(eq(operatorKbTable.id, entryId));
      return { deleted: true, source: entry.sourceName ?? undefined };
    },
    async pendingList(): Promise<KbPendingEntry[]> {
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
          eq(operatorKbTable.operatorId, operatorId),
          eq(operatorKbTable.verificationStatus, 'pending'),
        ))
        .orderBy(desc(operatorKbTable.createdAt))
        .limit(20);
      return rows.map(r => ({
        id: r.id,
        content: r.content,
        source: r.sourceName ?? undefined,
        confidence: r.confidenceScore ?? undefined,
        createdAt: r.createdAt?.toISOString(),
      }));
    },
  };

  // ── tasks connector ───────────────────────────────────────────────────────
  const tasksConnector: TaskStore = {
    name: 'opsoul-tasks',
    async create(task) {
      const intervalMs = task.schedule === 'daily'
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
      const taskId = crypto.randomUUID();
      await db.insert(tasksTable).values({
        id: taskId,
        operatorId,
        conversationId: opCtx.conversationId,
        contextName: task.name,
        taskType: task.schedule,
        integrationLabel: 'self_scheduled',
        prompt: task.prompt,
        payload: { description: task.prompt, scheduledBy: 'operator' },
        status: 'active',
        nextRunAt: new Date(Date.now() + intervalMs),
      });
      const result: Task = {
        name: task.name,
        prompt: task.prompt,
        schedule: task.schedule,
        status: 'active',
        nextRunAt: new Date(Date.now() + intervalMs).toISOString(),
      };
      return result;
    },
    async update(name: string, patch: TaskPatch): Promise<Task | null> {
      const [task] = await db
        .select()
        .from(tasksTable)
        .where(and(eq(tasksTable.operatorId, operatorId), eq(tasksTable.contextName, name)));
      if (!task) return null;
      const dbPatch: Record<string, unknown> = {};
      if (patch.name) dbPatch.contextName = patch.name;
      if (patch.prompt) dbPatch.prompt = patch.prompt;
      if (patch.schedule) dbPatch.taskType = patch.schedule;
      if (Object.keys(dbPatch).length > 0) {
        await db.update(tasksTable).set(dbPatch).where(eq(tasksTable.id, task.id));
      }
      return {
        name: (patch.name ?? task.contextName) as string,
        prompt: (patch.prompt ?? task.prompt) as string,
        schedule: (patch.schedule ?? task.taskType) as Task['schedule'],
        status: (task.status ?? 'active') as TaskStatus,
        lastRunAt: task.lastRunAt?.toISOString() ?? null,
        nextRunAt: task.nextRunAt?.toISOString() ?? null,
      };
    },
    async setStatus(name: string, status: TaskStatus): Promise<boolean> {
      const result = await db
        .update(tasksTable)
        .set({ status })
        .where(and(eq(tasksTable.operatorId, operatorId), eq(tasksTable.contextName, name)))
        .returning({ id: tasksTable.id });
      return result.length > 0;
    },
    async delete(name: string): Promise<boolean> {
      const result = await db
        .delete(tasksTable)
        .where(and(eq(tasksTable.operatorId, operatorId), eq(tasksTable.contextName, name)))
        .returning({ id: tasksTable.id });
      return result.length > 0;
    },
    async list(): Promise<Task[]> {
      const rows = await db
        .select({
          name: tasksTable.contextName,
          prompt: tasksTable.prompt,
          schedule: tasksTable.taskType,
          status: tasksTable.status,
          lastRunAt: tasksTable.lastRunAt,
          nextRunAt: tasksTable.nextRunAt,
          payload: tasksTable.payload,
        })
        .from(tasksTable)
        .where(eq(tasksTable.operatorId, operatorId))
        .orderBy(desc(tasksTable.createdAt));
      return rows.map(r => ({
        name: r.name as string,
        prompt: (r.prompt ?? '') as string,
        schedule: (r.schedule ?? 'daily') as Task['schedule'],
        status: (r.status ?? 'active') as TaskStatus,
        lastRunAt: r.lastRunAt?.toISOString() ?? null,
        nextRunAt: r.nextRunAt?.toISOString() ?? null,
      }));
    },
    async history(name: string): Promise<Task | null> {
      const [task] = await db
        .select()
        .from(tasksTable)
        .where(and(eq(tasksTable.operatorId, operatorId), eq(tasksTable.contextName, name)));
      if (!task) return null;
      const payload = (task.payload ?? {}) as { lastRunSummary?: string; lastRunDurationSec?: number };
      return {
        name: task.contextName as string,
        prompt: (task.prompt ?? '') as string,
        schedule: (task.taskType ?? 'daily') as Task['schedule'],
        status: (task.status ?? 'active') as TaskStatus,
        lastRunAt: task.lastRunAt?.toISOString() ?? null,
        nextRunAt: task.nextRunAt?.toISOString() ?? null,
        lastRunSummary: payload.lastRunSummary ?? null,
        lastRunDurationSec: payload.lastRunDurationSec ?? null,
      };
    },
    async runNow(name: string): Promise<TaskRunResult> {
      const [task] = await db
        .select({ id: tasksTable.id })
        .from(tasksTable)
        .where(and(eq(tasksTable.operatorId, operatorId), eq(tasksTable.contextName, name)));
      if (!task) return { ok: false, summary: `No task named "${name}".`, durationSec: 0 };
      const result = await runSingleTask(task.id, { rescheduleAfter: false });
      return {
        ok: result.ok,
        summary: result.summary,
        durationSec: result.durationSec,
      };
    },
  };

  // ── integrations connector ─────────────────────────────────────────────────
  const integrationsConnector: IntegrationsConnector = {
    name: 'opsoul-integrations',
    async list(): Promise<Integration[]> {
      const rows = await db
        .select({
          integrationType: operatorIntegrationsTable.integrationType,
          integrationLabel: operatorIntegrationsTable.integrationLabel,
          status: operatorIntegrationsTable.status,
          isCustomApp: operatorIntegrationsTable.isCustomApp,
          baseUrl: operatorIntegrationsTable.baseUrl,
        })
        .from(operatorIntegrationsTable)
        .where(eq(operatorIntegrationsTable.operatorId, operatorId));
      return rows.map(r => ({
        integrationType: r.integrationType as string,
        integrationLabel: r.integrationLabel as string,
        status: r.status ?? 'connected',
        isCustomApp: r.isCustomApp ?? false,
        baseUrl: r.baseUrl ?? undefined,
      }));
    },
    async connect(args): Promise<boolean> {
      const key = args.secretName.toUpperCase();
      const [secret] = await db
        .select()
        .from(operatorSecretsTable)
        .where(and(
          eq(operatorSecretsTable.operatorId, operatorId),
          eq(operatorSecretsTable.key, key),
        ));
      if (!secret) return false;
      const { encryptToken, decryptToken } = await import('@workspace/opsoul-utils/crypto');
      const plain = decryptToken(secret.valueEncrypted);
      const encrypted = encryptToken(plain);
      await db.insert(operatorIntegrationsTable).values({
        id: crypto.randomUUID(),
        operatorId,
        ownerId,
        integrationType: args.integrationType,
        integrationLabel: args.label,
        tokenEncrypted: encrypted,
        scopes: [args.integrationType],
        status: 'connected',
        ...(args.baseUrl ? { baseUrl: args.baseUrl, isCustomApp: true } : {}),
      });
      return true;
    },
    async disconnect(integrationType: string): Promise<number> {
      const result = await db
        .delete(operatorIntegrationsTable)
        .where(and(
          eq(operatorIntegrationsTable.operatorId, operatorId),
          eq(operatorIntegrationsTable.integrationType, integrationType),
        ))
        .returning({ id: operatorIntegrationsTable.id });
      return result.length;
    },
  };

  // ── secrets admin (label listing only — no values) ─────────────────────────
  const secretsAdmin: SecretsAdmin = {
    name: 'opsoul-secrets-admin',
    async listNames(): Promise<string[]> {
      const rows = await db
        .select({ key: operatorSecretsTable.key })
        .from(operatorSecretsTable)
        .where(eq(operatorSecretsTable.operatorId, operatorId));
      return rows.map(r => r.key);
    },
  };

  // ── self info provider ─────────────────────────────────────────────────────
  const selfInfoProvider: SelfInfoProvider = {
    name: 'opsoul-self',
    async getSelf(): Promise<SelfInfo | null> {
      const [op] = await db
        .select()
        .from(operatorsTable)
        .where(eq(operatorsTable.id, operatorId));
      if (!op) return null;
      return {
        id: op.id,
        name: op.name,
        archetypes: (op.archetype as string[] | null) ?? [],
        mandate: op.mandate ?? undefined,
        model: op.defaultModel ?? undefined,
        ownerId: op.ownerId,
        identityLocked: !!op.layer1LockedAt,
      };
    },
  };

  // ── conversations store ────────────────────────────────────────────────────
  const conversationsStore: ConversationsStore = {
    name: 'opsoul-conversations',
    async list(limit: number): Promise<ConversationSummary[]> {
      const rows = await db
        .select({
          id: conversationsTable.id,
          contextName: conversationsTable.contextName,
          scopeId: conversationsTable.scopeId,
          lastMessageAt: conversationsTable.lastMessageAt,
        })
        .from(conversationsTable)
        .where(eq(conversationsTable.operatorId, operatorId))
        .orderBy(desc(conversationsTable.lastMessageAt))
        .limit(limit);
      return rows.map(r => ({
        id: r.id,
        contextName: r.contextName ?? undefined,
        scopeId: r.scopeId ?? undefined,
        lastMessageAt: r.lastMessageAt?.toISOString() ?? undefined,
      }));
    },
  };

  // ── Serper web-search provider ────────────────────────────────────────────
  // Reads SERPER_API_KEY via the secrets accessor (operator DB → env fallback).
  // Wired as ctx.connectors.webSearch so web_search bypasses the generic
  // defaultWebSearchProvider (which needs WEB_SEARCH_ENDPOINT — not our shape).
  const serperWebSearch: WebSearchProvider = {
    name: 'serper',
    async search(query: string, opts?: { limit?: number }): Promise<WebSearchHit[]> {
      const apiKey = await secrets.get('SERPER_API_KEY');
      if (!apiKey) throw new Error('SERPER_API_KEY not configured');
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, num: opts?.limit ?? 5 }),
      });
      if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
      const json = await res.json() as { organic?: Array<{ title: string; link: string; snippet: string }> };
      return (json.organic ?? []).map((h): WebSearchHit => ({
        title: h.title,
        url: h.link,
        snippet: h.snippet,
      }));
    },
  };

  // ── assemble the full AllConnectors bag ───────────────────────────────────
  const connectors: AllConnectors = {
    webSearch: serperWebSearch,
    files: filesConnector,
    pdf: pdfConnector,
    memory: memoryConnector,
    kbAdmin: kbAdminConnector,
    tasks: tasksConnector,
    integrations: integrationsConnector,
    secretsAdmin,
    selfInfo: selfInfoProvider,
    conversations: conversationsStore,
    // Integration connectors (gmail, telegram, slack, etc.) are not wired here.
    // The SDK tools for those connectors will gracefully return ok:false
    // "not connected". Those tools go through the existing OAuth handler in
    // toolHandlers.ts until Phase 1c replaces them. When that phase arrives,
    // wire each connector by adapting loadIntegration() from toolHandlers.ts.
  };

  return {
    consumerId: operatorId,
    deploymentId: ownerId,
    secrets,
    logger,
    connectors,
  };
}

// ───────────────────────────────────────────────────────────────────────────
//  D. DISPATCH BRIDGE
// ───────────────────────────────────────────────────────────────────────────

// Tool names whose SDK content output needs to be re-wrapped in the
// opsoul-widget fence that ChatSection.tsx expects.
// render_chart / render_table / render_diagram emit their payload in
// result.data rather than result.content when going through the SDK.
const RENDER_TOOLS = new Set(['render_chart', 'render_table', 'render_diagram']);

function sdkDataToOpSoulContent(name: string, sdkResult: { ok: boolean; content: string; data?: unknown }): string {
  if (!RENDER_TOOLS.has(name) || !sdkResult.ok || !sdkResult.data) {
    return sdkResult.content;
  }
  // Reconstruct the opsoul-widget fence the frontend ChatSection.tsx expects.
  // SDK data shape: { type: 'chart'|'table'|'diagram', ... }
  const payload = sdkResult.data as Record<string, unknown>;
  const kind = payload.type === 'chart' ? 'chart'
    : payload.type === 'table' ? 'table'
    : payload.type === 'diagram' ? 'mermaid'
    : null;
  if (!kind) return sdkResult.content;
  const widget = { kind, ...payload, type: undefined };
  // Remove the extra 'type' key (already promoted to 'kind')
  delete widget.type;
  return `\`\`\`opsoul-widget\n${JSON.stringify(widget)}\n\`\`\``;
}

/**
 * Dispatch a tool call through the CultureEyes SDK registry.
 *
 * Maps the SDK ToolResult → OpSoul ToolResult:
 *   - content: always present; render tools get re-fenced in opsoul-widget.
 *   - meta.terminateLoop: true when sdk result.ok === false
 *   - meta.webSearchFired: true for web_search calls that succeeded
 *   - meta.httpRequestFired: true for http_request calls (for fullContent trim)
 */
export async function dispatchViaSdk(
  name: string,
  rawArgs: string,
  opCtx: ToolHandlerContext,
  extraCtx: {
    operatorName: string;
    liveSecrets: string[];
    connectedIntegrations: string[];
  },
): Promise<OpSoulToolResult> {
  const registry = getRegistry();
  const sdkCtx = buildSdkCtx(opCtx, extraCtx);

  let params: Record<string, unknown>;
  try {
    params = JSON.parse(rawArgs) as Record<string, unknown>;
  } catch {
    params = {};
  }

  const result = await registry.execute(name, params, sdkCtx);

  const content = sdkDataToOpSoulContent(name, result);

  return {
    content,
    meta: {
      terminateLoop: !result.ok,
      webSearchFired: name === 'web_search' && result.ok,
      httpRequestFired: name === 'http_request',
    },
  };
}
