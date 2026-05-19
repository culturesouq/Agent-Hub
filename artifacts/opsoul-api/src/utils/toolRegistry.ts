/**
 * Universal tool registry — OpSoul's platform-wide capability catalog.
 *
 * Every operator receives the SAME tool set at birth (per the platform-not-
 * per-operator rule). Tools are the *transport* the operator soul reaches
 * for to do work in the world — they are NOT part of the operator's
 * system prompt. Per the patent (Claim 12), the operator soul decides
 * when to invoke; this registry only defines WHAT is available.
 *
 * Tools defined here are exposed over MCP (Model Context Protocol) by
 * mcpServer.ts and consumed by chat.ts through mcpClient.ts. External
 * MCP-capable agents can call the same tools by connecting to the /mcp
 * HTTP+SSE endpoint.
 *
 * Migrated from inline definitions in routes/chat.ts lines ~957–1185.
 */

import type { ToolDefinition } from './openrouter';

/** Scope types match scopeResolver.ts. See utils/scopeResolver.ts for semantics. */
export type ScopeType = 'owner' | 'public' | 'authenticated' | 'action' | 'channel';

/** Conditions that gate whether a tool is offered in a given context. */
export type Availability = 'always' | 'web' | 'secrets';

/** Categories for admin/UI grouping. Matches utils/builtinSkills.ts. */
export type ToolCategory = 'research' | 'workspace' | 'integration' | 'automation';

export interface RegisteredTool {
  /** Tool name as sent to the LLM. Must match handler dispatch. */
  name: string;
  /** Human-readable description for the LLM. Sent verbatim in the tools array. */
  description: string;
  /** JSON-Schema for the tool's input parameters. */
  inputSchema: ToolDefinition['function']['parameters'];
  /** Which scope types may invoke this tool. '*' = all scopes (current production behavior). */
  scopes: ScopeType[] | '*';
  /** When this tool is offered at all. */
  availability: Availability;
  /** Display grouping. */
  category: ToolCategory;
}

/** Per-call context that decides which tools to expose for THIS turn. */
export interface ToolContext {
  /** Resolved scope of the current request (from scopeResolver). */
  scopeType: ScopeType;
  /** Is web search infrastructure available (API key configured)? */
  hasWebSearch: boolean;
  /** Names of stored secret labels for this operator (for http_request description). */
  liveSecrets: string[];
}

// ───────────────────────────────────────────────────────────────────────────
//  THE 12 UNIVERSAL TOOLS
//  Names, descriptions, and parameter schemas migrated verbatim from chat.ts.
//  Do not edit descriptions casually — they shape operator behavior.
// ───────────────────────────────────────────────────────────────────────────

export const UNIVERSAL_TOOLS: RegisteredTool[] = [
  {
    name: 'web_search',
    description:
      'Issues a search query and returns ranked results — URLs and text snippets from matching pages.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Concise search query, 3–8 words' },
      },
      required: ['query'],
    },
    scopes: '*',
    availability: 'web',
    category: 'research',
  },
  {
    name: 'kb_seed',
    description:
      "Adds an entry to the operator's knowledge base. The entry is embedded at insertion time and becomes retrievable in subsequent conversations. New entries land in pending state for verification.",
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            'The knowledge content to store — a self-contained factual chunk, typically 100–400 words.',
        },
        source: {
          type: 'string',
          description:
            'Source identifier(s) the entry was derived from (e.g. "Google AI Blog 2024, MIT study on transformer efficiency").',
        },
        confidence: {
          type: 'number',
          description: 'Confidence score 0–100 reflecting expected reliability of the entry.',
        },
      },
      required: ['content', 'source', 'confidence'],
    },
    scopes: '*',
    availability: 'web',
    category: 'research',
  },
  {
    name: 'write_file',
    description:
      "Creates or replaces a file in the operator's workspace under a chosen name. Files persist across conversations and appear in the Files tab.",
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Filename including extension (e.g. "report.md", "todo.txt")',
        },
        content: { type: 'string', description: 'Full file content as a string.' },
        action: {
          type: 'string',
          enum: ['create', 'update'],
          description: "'create' for a new file, 'update' to overwrite an existing one.",
        },
      },
      required: ['filename', 'content', 'action'],
    },
    scopes: '*',
    availability: 'always',
    category: 'workspace',
  },
  {
    name: 'read_file',
    description: 'Returns the contents of a workspace file by name.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Filename including extension. Must match an existing file exactly.',
        },
      },
      required: ['filename'],
    },
    scopes: '*',
    availability: 'always',
    category: 'workspace',
  },
  {
    name: 'list_files',
    description: 'Enumerates files present in the workspace with size and last-update timestamp.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    scopes: '*',
    availability: 'always',
    category: 'workspace',
  },
  {
    name: 'get_current_time',
    description:
      'Returns the current date and time. Defaults to Asia/Dubai (GST). Optional timezone parameter accepts an IANA timezone identifier (e.g. "America/New_York", "Asia/Tokyo", "Europe/London", "UTC") for time elsewhere in the world.',
    inputSchema: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'IANA timezone identifier. Defaults to Asia/Dubai when omitted.',
        },
      },
      required: [],
    },
    scopes: '*',
    availability: 'always',
    category: 'research',
  },
  {
    name: 'schedule_task',
    description:
      'Creates a recurring task with a daily or weekly schedule. The task fires on schedule, executing a stored prompt against the operator.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short label for the task (shown in the Tasks tab).' },
        prompt: {
          type: 'string',
          description:
            'The prompt that will execute on each scheduled run. Read by the next-run instance of the operator as its task brief.',
        },
        schedule: {
          type: 'string',
          enum: ['daily', 'weekly'],
          description: 'How often the task fires.',
        },
      },
      required: ['name', 'prompt', 'schedule'],
    },
    scopes: '*',
    availability: 'always',
    category: 'automation',
  },
  {
    name: 'update_task',
    description:
      'Modifies the name, prompt, or schedule of an existing task, identified by its current name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Current name of the task to update.' },
        newName: { type: 'string', description: 'Optional new name.' },
        newPrompt: {
          type: 'string',
          description: 'Optional new prompt — what each future run will read.',
        },
        newSchedule: {
          type: 'string',
          enum: ['daily', 'weekly'],
          description: 'Optional new schedule.',
        },
      },
      required: ['name'],
    },
    scopes: '*',
    availability: 'always',
    category: 'automation',
  },
  {
    name: 'pause_task',
    description:
      'Sets a task to paused state. A paused task is preserved but does not fire on its schedule.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the task to pause.' },
      },
      required: ['name'],
    },
    scopes: '*',
    availability: 'always',
    category: 'automation',
  },
  {
    name: 'resume_task',
    description: 'Sets a paused task to active state, resuming its scheduled firing.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the paused task to resume.' },
      },
      required: ['name'],
    },
    scopes: '*',
    availability: 'always',
    category: 'automation',
  },
  {
    name: 'delete_task',
    description: "Removes a task permanently from the operator's task list.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the task to delete.' },
      },
      required: ['name'],
    },
    scopes: '*',
    availability: 'always',
    category: 'automation',
  },
  {
    name: 'http_request',
    // NOTE: description is suffixed with the live secret labels list at runtime
    // in toToolDefinition() below. Base description here is the static part.
    description:
      'Issues an HTTP request to an external endpoint. Stored secrets are referenced via the {{SECRET_NAME}} syntax in URL, headers, or body; the label resolves to its value at call time.',
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          description: 'HTTP method',
        },
        url: { type: 'string', description: 'Full URL including query parameters' },
        headers: {
          type: 'object',
          description:
            'HTTP headers as key-value pairs. {{SECRET_NAME}} placeholders are resolved to stored secret values at call time.',
          additionalProperties: { type: 'string' },
        },
        body: {
          type: 'string',
          description:
            'Request body as a JSON string (for POST/PUT/PATCH). {{SECRET_NAME}} placeholders are resolved to stored secret values at call time.',
        },
      },
      required: ['method', 'url'],
    },
    scopes: '*',
    availability: 'secrets',
    category: 'integration',
  },
];

// ───────────────────────────────────────────────────────────────────────────
//  LOOKUP + CONTEXT-AWARE FILTERING
// ───────────────────────────────────────────────────────────────────────────

const TOOLS_BY_NAME = new Map<string, RegisteredTool>(UNIVERSAL_TOOLS.map(t => [t.name, t]));

/** Get a registered tool by name (used by handlers and MCP server). */
export function getTool(name: string): RegisteredTool | undefined {
  return TOOLS_BY_NAME.get(name);
}

/** All tool names — useful for admin / introspection. */
export function listAllToolNames(): string[] {
  return UNIVERSAL_TOOLS.map(t => t.name);
}

/** Determines whether a tool is available given the runtime context. */
function isAvailable(tool: RegisteredTool, ctx: ToolContext): boolean {
  if (tool.availability === 'always') return true;
  if (tool.availability === 'web') return ctx.hasWebSearch;
  if (tool.availability === 'secrets') return ctx.liveSecrets.length > 0;
  return false;
}

/** Determines whether the active scope is permitted to call this tool. */
function isAllowedInScope(tool: RegisteredTool, scopeType: ScopeType): boolean {
  return tool.scopes === '*' || tool.scopes.includes(scopeType);
}

/**
 * Converts a RegisteredTool into the wire-format ToolDefinition the LLM sees.
 * Some tools have dynamic description suffixes (http_request lists available
 * secret labels) — applied here.
 */
function toToolDefinition(tool: RegisteredTool, ctx: ToolContext): ToolDefinition {
  let description = tool.description;
  if (tool.name === 'http_request' && ctx.liveSecrets.length > 0) {
    description = `${tool.description} Available stored secret labels: ${ctx.liveSecrets.map(s => `{{${s}}}`).join(', ')}.`;
  }
  return {
    type: 'function',
    function: {
      name: tool.name,
      description,
      parameters: tool.inputSchema,
    },
  };
}

/**
 * Returns the ToolDefinition[] to attach to the LLM call for THIS turn.
 *
 * Filters by:
 *   1. availability (web requires web search; secrets requires stored secrets)
 *   2. scope (only tools whose scopes list includes ctx.scopeType — '*' = all)
 *
 * Used by chat.ts in place of the inline tool array. The output is the same
 * shape Kimi / OpenAI / OpenRouter expect.
 */
export function listToolsForContext(ctx: ToolContext): ToolDefinition[] {
  return UNIVERSAL_TOOLS.filter(t => isAvailable(t, ctx))
    .filter(t => isAllowedInScope(t, ctx.scopeType))
    .map(t => toToolDefinition(t, ctx));
}

/**
 * Manifest shape for the frontend SkillsSection — describes what the operator
 * carries, with availability resolved against current context. Used by the
 * /operators/:id/skills/manifest endpoint so the UI can show the same set the
 * operator actually sees.
 */
export interface ToolManifestEntry {
  name: string;
  description: string;
  category: ToolCategory;
  scopes: ScopeType[] | '*';
  availability: Availability;
  available: boolean; // resolved for the given context
}

export function buildToolManifest(ctx: ToolContext): ToolManifestEntry[] {
  return UNIVERSAL_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    category: t.category,
    scopes: t.scopes,
    availability: t.availability,
    available: isAvailable(t, ctx) && isAllowedInScope(t, ctx.scopeType),
  }));
}
