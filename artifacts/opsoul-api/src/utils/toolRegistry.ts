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
export type Availability = 'always' | 'web' | 'secrets' | 'integration';

/** Categories for admin/UI grouping. */
export type ToolCategory = 'research' | 'workspace' | 'integration' | 'automation' | 'memory' | 'self' | 'communication';

export interface RegisteredTool {
  /** Tool name as sent to the LLM. Must match handler dispatch. snake_case. */
  name: string;
  /** Title-case label shown in the frontend SkillsSection.tsx grid. */
  displayName: string;
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
  /** Names of connected integration types for this operator (gates 'integration'-availability tools). */
  connectedIntegrations?: string[];
}

// ───────────────────────────────────────────────────────────────────────────
//  THE 12 UNIVERSAL TOOLS
//  Names, descriptions, and parameter schemas migrated verbatim from chat.ts.
//  Do not edit descriptions casually — they shape operator behavior.
// ───────────────────────────────────────────────────────────────────────────

export const UNIVERSAL_TOOLS: RegisteredTool[] = [
  {
    name: 'web_search',
    displayName: 'Web search',
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
    displayName: 'Knowledge seed',
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
    displayName: 'Write file',
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
    displayName: 'Read file',
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
    displayName: 'List files',
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
    displayName: 'Current time',
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
    displayName: 'Schedule task',
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
    displayName: 'Update task',
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
    displayName: 'Pause task',
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
    displayName: 'Resume task',
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
    displayName: 'Delete task',
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
    displayName: 'HTTP request',
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

  // ─────────────────────────────────────────────────────────────────────────
  //  WAVE 1 — INTEGRATION MGMT, TASK HELPERS, MEMORY, KB-LEARNED, SELF
  //  Pure runtime tools — no Layer 0/1 access, no systemPrompt mutation.
  // ─────────────────────────────────────────────────────────────────────────

  {
    name: 'list_integrations',
    displayName: 'List integrations',
    description:
      'Returns the operator\'s currently connected external services with status, integration type, and human-readable label. Read-only.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    scopes: '*',
    availability: 'always',
    category: 'integration',
  },
  {
    name: 'request_credential',
    displayName: 'Request credential',
    description:
      'Emits an inline connect-form card in the chat so the owner can drop a token mid-conversation. Used when the operator needs a credential it cannot derive from existing secrets. The card resolves to a real integration row on submit.',
    inputSchema: {
      type: 'object',
      properties: {
        integrationType: { type: 'string', description: 'Canonical integration identifier — e.g. "notion", "slack", "github", "linear", "hubspot", "telegram", "whatsapp", or any custom string for a one-off app.' },
        label:           { type: 'string', description: 'Human-readable label shown on the card (e.g. "Connect Notion").' },
        instructions:    { type: 'string', description: 'One short sentence explaining what the owner is about to do and why.' },
        docsUrl:         { type: 'string', description: 'Optional URL pointing to where the owner can generate the token.' },
        fields: {
          type: 'array',
          description: 'Form fields to render. The first field whose name is "token" is treated as the primary credential.',
          items: {
            type: 'object',
            properties: {
              name:        { type: 'string' },
              label:       { type: 'string' },
              type:        { type: 'string', enum: ['text', 'password', 'url', 'email', 'textarea'] },
              placeholder: { type: 'string' },
              required:    { type: 'boolean' },
              hint:        { type: 'string' },
            },
            required: ['name', 'label', 'type'],
          },
        },
      },
      required: ['integrationType', 'label', 'fields'],
    },
    scopes: '*',
    availability: 'always',
    category: 'integration',
  },
  {
    name: 'connect_with_secret',
    displayName: 'Connect with stored secret',
    description:
      'Creates a connected integration using a stored secret as the token, instead of asking the owner to paste one. Useful when the owner already saved the key under Keys & Secrets and tells the operator to use it.',
    inputSchema: {
      type: 'object',
      properties: {
        integrationType: { type: 'string', description: 'Canonical integration identifier (e.g. "github", "notion").' },
        label:           { type: 'string', description: 'Integration label (e.g. "GitHub — main account").' },
        secretKey:       { type: 'string', description: 'Name of the secret in Keys & Secrets (uppercase, e.g. "GITHUB_PAT"). Value is read server-side; never seen by the LLM.' },
        baseUrl:         { type: 'string', description: 'Optional base URL when the integration is a custom-app endpoint.' },
      },
      required: ['integrationType', 'label', 'secretKey'],
    },
    scopes: '*',
    availability: 'always',
    category: 'integration',
  },
  {
    name: 'disconnect_integration',
    displayName: 'Disconnect integration',
    description:
      'Removes a connected integration by integrationType. The operator may invoke this on the owner\'s instruction; it deletes the credential row but never touches Keys & Secrets.',
    inputSchema: {
      type: 'object',
      properties: {
        integrationType: { type: 'string', description: 'Integration to disconnect (e.g. "notion").' },
      },
      required: ['integrationType'],
    },
    scopes: '*',
    availability: 'always',
    category: 'integration',
  },
  {
    name: 'list_secrets',
    displayName: 'List secret labels',
    description:
      'Returns the names of all secrets stored under Keys & Secrets for this operator. Values are never returned — only the labels — so the operator can know what credentials it can reference in http_request or connect_with_secret.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    scopes: '*',
    availability: 'always',
    category: 'integration',
  },

  {
    name: 'run_task_now',
    displayName: 'Run task now',
    description:
      'Immediately executes a scheduled task by name, in-process, without waiting for its next cron tick. The task\'s recurrence schedule continues unchanged afterward.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Task name as shown in the Tasks tab.' },
      },
      required: ['name'],
    },
    scopes: '*',
    availability: 'always',
    category: 'automation',
  },
  {
    name: 'list_tasks',
    displayName: 'List tasks',
    description:
      'Returns the operator\'s scheduled automations with name, schedule, status, last run time, and last run summary.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    scopes: '*',
    availability: 'always',
    category: 'automation',
  },
  {
    name: 'get_task_history',
    displayName: 'Get task history',
    description:
      'Returns the most recent execution record for a task — last run time, duration, and the 300-character summary that was stored.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Task name.' },
      },
      required: ['name'],
    },
    scopes: '*',
    availability: 'always',
    category: 'automation',
  },

  {
    name: 'store_memory',
    displayName: 'Store memory',
    description:
      'Writes a memory the operator explicitly chooses to keep — distinct from the automatic post-turn distillation. Goes through the same embedding + decay pipeline as auto-stored memories. Use when something in the conversation is worth carrying forward and the operator wants to commit to it.',
    inputSchema: {
      type: 'object',
      properties: {
        content:    { type: 'string', description: 'The memory content as a self-contained sentence or short paragraph.' },
        memoryType: { type: 'string', enum: ['fact', 'preference', 'context', 'event'], description: 'Category of memory.' },
        weight:     { type: 'number', description: 'Importance 0.0–1.0. Higher weights survive decay longer. Default 1.0.' },
      },
      required: ['content', 'memoryType'],
    },
    scopes: '*',
    availability: 'always',
    category: 'memory',
  },
  {
    name: 'search_memory',
    displayName: 'Search memory',
    description:
      'Retrieves the operator\'s own memories matching a natural-language query. Returns the top-ranked hits with similarity scores. Use this when the operator needs to recall something specific mid-conversation that automatic retrieval did not surface.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What you\'re looking for, in natural language.' },
        topN:  { type: 'number', description: 'Number of hits to return. Default 5.' },
      },
      required: ['query'],
    },
    scopes: '*',
    availability: 'always',
    category: 'memory',
  },
  {
    name: 'list_memories',
    displayName: 'List recent memories',
    description:
      'Returns the operator\'s N most recent memories in reverse chronological order. Useful for surfacing recent context without a similarity query.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max entries to return. Default 10.' },
      },
      required: [],
    },
    scopes: '*',
    availability: 'always',
    category: 'memory',
  },

  {
    name: 'kb_search',
    displayName: 'Knowledge search',
    description:
      'Explicit query against the operator\'s knowledge base — both the owner-dropped KB and the operator-learned KB. Returns the most relevant entries with their source and confidence. Use when targeted recall is needed beyond the automatic context attached to each turn.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language query.' },
        topN:  { type: 'number', description: 'Number of entries to return. Default 4.' },
      },
      required: ['query'],
    },
    scopes: '*',
    availability: 'always',
    category: 'research',
  },
  {
    name: 'kb_delete_learned',
    displayName: 'Delete learned KB entry',
    description:
      'Removes an entry the operator added to its own learned knowledge base. Owner-dropped KB entries are in a separate table and cannot be reached by this tool. System-seeded entries (marked isSystem) are also protected.',
    inputSchema: {
      type: 'object',
      properties: {
        entryId: { type: 'string', description: 'ID of the learned KB entry to remove (from kb_search results).' },
      },
      required: ['entryId'],
    },
    scopes: '*',
    availability: 'always',
    category: 'research',
  },
  {
    name: 'kb_pending_list',
    displayName: 'List pending KB entries',
    description:
      'Returns the operator-learned KB entries currently in pending verification status — entries the operator seeded that have not yet been validated by the verification pipeline.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    scopes: '*',
    availability: 'always',
    category: 'research',
  },

  {
    name: 'get_self_info',
    displayName: 'Self info',
    description:
      'Returns the operator\'s own metadata: id, name, archetypes, mandate summary, current model, owner identity, identity-lock state. Read-only introspection.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    scopes: '*',
    availability: 'always',
    category: 'self',
  },
  {
    name: 'list_conversations',
    displayName: 'List conversations',
    description:
      'Returns the operator\'s recent conversation threads with title, scope, and last-message time. Useful for the operator to know what threads it has been part of.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max threads to return. Default 10.' },
      },
      required: [],
    },
    scopes: '*',
    availability: 'always',
    category: 'self',
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  WAVE 2 — OUTBOUND COMMS, FILE OPS, RESEARCH
  // ─────────────────────────────────────────────────────────────────────────

  {
    name: 'send_telegram',
    displayName: 'Send Telegram message',
    description:
      'Sends a text message via the connected Telegram bot. Requires a Telegram integration to be connected; the bot token is loaded server-side and never seen by the LLM.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'Telegram chat ID of the recipient (numeric string, e.g. "123456789" or "-1009876…" for groups).' },
        text:   { type: 'string', description: 'Message body. Supports Markdown.' },
      },
      required: ['chatId', 'text'],
    },
    scopes: '*',
    availability: 'integration',
    category: 'communication',
  },
  {
    name: 'send_whatsapp',
    displayName: 'Send WhatsApp message',
    description:
      'Sends a text message via WhatsApp Business API. Requires a WhatsApp integration to be connected; access token and phone number ID are loaded server-side.',
    inputSchema: {
      type: 'object',
      properties: {
        to:   { type: 'string', description: 'Recipient phone number in international format without "+" (e.g. "971501234567").' },
        text: { type: 'string', description: 'Message body.' },
      },
      required: ['to', 'text'],
    },
    scopes: '*',
    availability: 'integration',
    category: 'communication',
  },
  {
    name: 'send_slack',
    displayName: 'Send Slack message',
    description:
      'Posts a message to a Slack channel via the connected Slack bot. Requires a Slack integration to be connected.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel ID (e.g. "C01234ABCDE") or channel name with leading # (e.g. "#general").' },
        text:    { type: 'string', description: 'Message body. Supports Slack markdown.' },
      },
      required: ['channel', 'text'],
    },
    scopes: '*',
    availability: 'integration',
    category: 'communication',
  },
  {
    name: 'notify_owner',
    displayName: 'Notify owner',
    description:
      'Sends a short notification to the owner via the first available connected channel (Telegram > WhatsApp > Slack). The owner\'s primary chat/number/channel is configured at integration time. Use when something needs the owner\'s attention outside the chat.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Notification text — keep short and actionable.' },
      },
      required: ['text'],
    },
    scopes: '*',
    availability: 'integration',
    category: 'communication',
  },

  {
    name: 'delete_file',
    displayName: 'Delete file',
    description:
      'Removes a file from the operator\'s workspace by filename. Owner-uploaded and operator-written files are treated the same — there is no source distinction in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Exact filename to delete.' },
      },
      required: ['filename'],
    },
    scopes: '*',
    availability: 'always',
    category: 'workspace',
  },
  {
    name: 'append_to_file',
    displayName: 'Append to file',
    description:
      'Adds content to the end of an existing workspace file. Creates the file if it does not exist. Useful for running logs, notebooks, or accumulating notes across turns.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Workspace filename.' },
        content:  { type: 'string', description: 'Text to append.' },
      },
      required: ['filename', 'content'],
    },
    scopes: '*',
    availability: 'always',
    category: 'workspace',
  },
  {
    name: 'download_to_workspace',
    displayName: 'Download to workspace',
    description:
      'Fetches the content of a URL and stores it as a file in the operator\'s workspace. Text and JSON responses are stored verbatim; HTML is stripped to its visible text. Max 100 KB stored.',
    inputSchema: {
      type: 'object',
      properties: {
        url:      { type: 'string', description: 'URL to fetch.' },
        filename: { type: 'string', description: 'Destination filename in the workspace.' },
      },
      required: ['url', 'filename'],
    },
    scopes: '*',
    availability: 'always',
    category: 'workspace',
  },

  {
    name: 'fetch_url',
    displayName: 'Fetch URL',
    description:
      'Fetches a webpage and returns its visible text (HTML tags stripped). Different from web_search: this targets a single known URL. Max 10000 characters returned.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to fetch.' },
      },
      required: ['url'],
    },
    scopes: '*',
    availability: 'always',
    category: 'research',
  },
  {
    name: 'extract_pdf_text',
    displayName: 'Extract PDF text',
    description:
      'Downloads a PDF from a URL and returns its extracted text. Uses the same pdf-parse v2 pipeline as chat uploads. Max 12000 characters returned.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL of the PDF.' },
      },
      required: ['url'],
    },
    scopes: '*',
    availability: 'always',
    category: 'research',
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  WAVE 2 (cont.) — ARTIFACT RENDERERS
  //  Emit a fenced opsoul-widget block; ChatSection's WidgetBlock renders it.
  // ─────────────────────────────────────────────────────────────────────────

  {
    name: 'render_chart',
    displayName: 'Render chart',
    description:
      'Renders a bar, line, or pie chart inline in the chat. Pass an array of {label, value} points. The chat surface draws the chart with Recharts; the operator sees it the same as the owner.',
    inputSchema: {
      type: 'object',
      properties: {
        chartType: { type: 'string', enum: ['bar', 'line', 'pie'], description: 'Chart shape.' },
        title:     { type: 'string', description: 'Optional title shown above the chart.' },
        data: {
          type: 'array',
          description: 'Series points. Each item must have label (string) and value (number).',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'number' },
            },
            required: ['label', 'value'],
          },
        },
      },
      required: ['chartType', 'data'],
    },
    scopes: '*',
    availability: 'always',
    category: 'workspace',
  },
  {
    name: 'render_table',
    displayName: 'Render table',
    description:
      'Renders a tabular grid inline in the chat. Pass an array of column names and a 2D array of row values (strings).',
    inputSchema: {
      type: 'object',
      properties: {
        title:   { type: 'string', description: 'Optional title shown above the table.' },
        columns: {
          type: 'array',
          description: 'Column header strings.',
          items: { type: 'string' },
        },
        rows: {
          type: 'array',
          description: 'Array of rows. Each row is an array of cell strings in the same order as columns.',
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      required: ['columns', 'rows'],
    },
    scopes: '*',
    availability: 'always',
    category: 'workspace',
  },
  {
    name: 'render_diagram',
    displayName: 'Render diagram (Mermaid)',
    description:
      'Renders a Mermaid diagram source inline in the chat. The chat surface displays the source with a copy button and a render link to mermaid.live; inline rendering ships later. Use for flowcharts, sequence diagrams, mind maps, gantt charts.',
    inputSchema: {
      type: 'object',
      properties: {
        title:   { type: 'string', description: 'Optional title shown above the diagram.' },
        diagram: { type: 'string', description: 'Full Mermaid source (e.g. "flowchart TD\\n  A --> B\\n  B --> C").' },
      },
      required: ['diagram'],
    },
    scopes: '*',
    availability: 'always',
    category: 'workspace',
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  WAVE 3 — CONNECTED-APP FIRST-CLASS TOOLS
  //  Each routes through executeHttpWithOAuth() so the integration's stored
  //  token is injected server-side and Google OAuth refresh is automatic.
  //  All require their integration to be connected (availability:'integration').
  // ─────────────────────────────────────────────────────────────────────────

  // Gmail
  {
    name: 'gmail_send',
    displayName: 'Gmail send',
    description: 'Sends an email via the connected Gmail account. Standard RFC 2822 message — recipient, subject, body.',
    inputSchema: {
      type: 'object',
      properties: {
        to:      { type: 'string', description: 'Recipient email.' },
        subject: { type: 'string', description: 'Subject line.' },
        body:    { type: 'string', description: 'Plain-text body.' },
      },
      required: ['to', 'subject', 'body'],
    },
    scopes: '*', availability: 'integration', category: 'communication',
  },
  {
    name: 'gmail_search',
    displayName: 'Gmail search',
    description: 'Searches the connected Gmail mailbox using Gmail query syntax. Returns up to 10 message metadata records (id, subject, from, date).',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Gmail search query (e.g. "from:foo@bar.com is:unread").' } },
      required: ['query'],
    },
    scopes: '*', availability: 'integration', category: 'communication',
  },
  {
    name: 'gmail_read',
    displayName: 'Gmail read',
    description: 'Fetches the body of a Gmail message by message id (obtained from gmail_search).',
    inputSchema: {
      type: 'object',
      properties: { messageId: { type: 'string', description: 'Gmail message id.' } },
      required: ['messageId'],
    },
    scopes: '*', availability: 'integration', category: 'communication',
  },

  // Calendar
  {
    name: 'calendar_create_event',
    displayName: 'Calendar — create event',
    description: 'Creates a new event on the primary Google Calendar. Times in ISO-8601 (e.g. "2026-05-25T10:00:00+04:00").',
    inputSchema: {
      type: 'object',
      properties: {
        summary:     { type: 'string', description: 'Event title.' },
        startIso:    { type: 'string', description: 'Start time (ISO 8601 with timezone).' },
        endIso:      { type: 'string', description: 'End time (ISO 8601 with timezone).' },
        description: { type: 'string', description: 'Optional description.' },
        location:    { type: 'string', description: 'Optional location.' },
      },
      required: ['summary', 'startIso', 'endIso'],
    },
    scopes: '*', availability: 'integration', category: 'integration',
  },
  {
    name: 'calendar_list_events',
    displayName: 'Calendar — list events',
    description: 'Returns up to 10 upcoming events from the primary calendar within the given window.',
    inputSchema: {
      type: 'object',
      properties: {
        timeMinIso: { type: 'string', description: 'Window start (ISO 8601). Default: now.' },
        timeMaxIso: { type: 'string', description: 'Window end (ISO 8601). Default: 7 days from now.' },
      },
      required: [],
    },
    scopes: '*', availability: 'integration', category: 'integration',
  },

  // Drive
  {
    name: 'drive_search',
    displayName: 'Drive search',
    description: 'Searches the connected Google Drive for files matching a name fragment or query. Returns up to 10 results (id, name, mimeType).',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search text (filename fragment or Drive query syntax).' } },
      required: ['query'],
    },
    scopes: '*', availability: 'integration', category: 'integration',
  },
  {
    name: 'drive_read_file',
    displayName: 'Drive read file',
    description: 'Downloads a Drive file by id and returns its text content (up to 10 KB). Google Docs are exported as plain text.',
    inputSchema: {
      type: 'object',
      properties: { fileId: { type: 'string', description: 'Drive file id from drive_search.' } },
      required: ['fileId'],
    },
    scopes: '*', availability: 'integration', category: 'integration',
  },

  // GitHub
  {
    name: 'github_create_issue',
    displayName: 'GitHub — create issue',
    description: 'Opens a new issue on a GitHub repo via the connected PAT.',
    inputSchema: {
      type: 'object',
      properties: {
        repo:  { type: 'string', description: 'Repo in "owner/name" form.' },
        title: { type: 'string', description: 'Issue title.' },
        body:  { type: 'string', description: 'Issue body (Markdown).' },
      },
      required: ['repo', 'title'],
    },
    scopes: '*', availability: 'integration', category: 'integration',
  },
  {
    name: 'github_search',
    displayName: 'GitHub search',
    description: 'Searches GitHub for code, issues, or repositories. Up to 10 results returned.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['code', 'issues', 'repositories'], description: 'What to search.' },
        query: { type: 'string', description: 'GitHub search query.' },
      },
      required: ['scope', 'query'],
    },
    scopes: '*', availability: 'integration', category: 'integration',
  },
  {
    name: 'github_read_file',
    displayName: 'GitHub — read file',
    description: 'Reads a file from a GitHub repo at a specific path. Returns decoded text content.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/name' },
        path: { type: 'string', description: 'File path within the repo.' },
        ref:  { type: 'string', description: 'Branch/tag/commit ref. Default: default branch.' },
      },
      required: ['repo', 'path'],
    },
    scopes: '*', availability: 'integration', category: 'integration',
  },

  // Notion
  {
    name: 'notion_search',
    displayName: 'Notion search',
    description: 'Searches the connected Notion workspace for pages or databases matching the query. Returns up to 10 results.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search text.' } },
      required: ['query'],
    },
    scopes: '*', availability: 'integration', category: 'integration',
  },
  {
    name: 'notion_create_page',
    displayName: 'Notion — create page',
    description: 'Creates a new Notion page under a parent page or database.',
    inputSchema: {
      type: 'object',
      properties: {
        parentPageId: { type: 'string', description: 'Parent page id (32-char UUID without dashes also accepted).' },
        title:        { type: 'string', description: 'Page title.' },
        content:      { type: 'string', description: 'Body text (plain). Becomes a single paragraph block.' },
      },
      required: ['parentPageId', 'title'],
    },
    scopes: '*', availability: 'integration', category: 'integration',
  },

  // Slack
  {
    name: 'slack_search',
    displayName: 'Slack search',
    description: 'Searches messages across channels the connected Slack bot can read. Up to 10 results.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query (supports Slack search modifiers like in:#channel).' } },
      required: ['query'],
    },
    scopes: '*', availability: 'integration', category: 'communication',
  },

  // Linear
  {
    name: 'linear_create_issue',
    displayName: 'Linear — create issue',
    description: 'Creates a new issue in a Linear team. Title required, description optional.',
    inputSchema: {
      type: 'object',
      properties: {
        teamId:      { type: 'string', description: 'Linear team id (UUID).' },
        title:       { type: 'string', description: 'Issue title.' },
        description: { type: 'string', description: 'Optional description (Markdown).' },
      },
      required: ['teamId', 'title'],
    },
    scopes: '*', availability: 'integration', category: 'integration',
  },
  {
    name: 'linear_search',
    displayName: 'Linear search',
    description: 'Searches Linear issues by text. Returns up to 10 issues with id, title, state, and assignee.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search text.' } },
      required: ['query'],
    },
    scopes: '*', availability: 'integration', category: 'integration',
  },

  // HubSpot
  {
    name: 'hubspot_search_contact',
    displayName: 'HubSpot — search contact',
    description: 'Searches HubSpot contacts by name or email. Returns up to 10 contacts with id, name, email, company.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search text (name or email fragment).' } },
      required: ['query'],
    },
    scopes: '*', availability: 'integration', category: 'integration',
  },
  {
    name: 'hubspot_create_deal',
    displayName: 'HubSpot — create deal',
    description: 'Creates a new deal in HubSpot with a name, stage, and optional amount.',
    inputSchema: {
      type: 'object',
      properties: {
        name:    { type: 'string', description: 'Deal name.' },
        stage:   { type: 'string', description: 'Pipeline stage internal id (e.g. "appointmentscheduled").' },
        amount:  { type: 'number', description: 'Optional deal amount.' },
      },
      required: ['name', 'stage'],
    },
    scopes: '*', availability: 'integration', category: 'integration',
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
  if (tool.availability === 'integration') return (ctx.connectedIntegrations?.length ?? 0) > 0;
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
  /** snake_case LLM-facing identifier. */
  name: string;
  /** Title-case label for the frontend SkillsSection.tsx grid. */
  displayName: string;
  description: string;
  category: ToolCategory;
  scopes: ScopeType[] | '*';
  availability: Availability;
  available: boolean; // resolved for the given context
}

export function buildToolManifest(ctx: ToolContext): ToolManifestEntry[] {
  return UNIVERSAL_TOOLS.map(t => ({
    name: t.name,
    displayName: t.displayName,
    description: t.description,
    category: t.category,
    scopes: t.scopes,
    availability: t.availability,
    available: isAvailable(t, ctx) && isAllowedInScope(t, ctx.scopeType),
  }));
}
