/**
 * MCP server — exposes OpSoul's universal toolset via the Model Context
 * Protocol so external MCP-capable agents (Hajeri, Claude, GPT, anything
 * speaking MCP) can call the same tools that operators use internally.
 *
 * Architecture:
 *   - SAME source of truth as chat.ts: toolRegistry.ts + toolHandlers.ts
 *   - chat.ts calls dispatchTool() directly (no protocol overhead)
 *   - external callers go through this MCP server via /mcp HTTP+SSE endpoint
 *   - both paths produce identical behavior and identical persistence
 *
 * Built on the low-level Server class (not the high-level McpServer) so
 * the JSON Schema in toolRegistry feeds straight into ListToolsResult
 * without a Zod conversion step. JSON Schema is what OpenAI/OpenRouter/MCP
 * all consume natively; converting back and forth would be lossy.
 *
 * Per-request context: each external caller's tools execute against a
 * specific operator. The /mcp route builds a ToolHandlerContext from
 * request auth and passes it here as createMcpServerForContext(ctx).
 * Reasoning: persistence (DB writes, memory storage, file writes) is
 * always scoped to a particular operator + conversation + scope. Without
 * an operator binding, the tools would have nowhere to write.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  listToolsForContext,
  UNIVERSAL_TOOLS,
  type ToolContext,
} from './toolRegistry.js';
import {
  dispatchTool,
  type ToolHandlerContext,
} from './toolHandlers.js';

const SERVER_INFO = {
  name: 'opsoul-mcp',
  version: '1.0.0',
} as const;

const SERVER_CAPABILITIES = {
  capabilities: {
    tools: {},
  },
} as const;

/**
 * Builds the per-request ToolContext (used for tool list filtering by
 * availability and scope) from the per-request ToolHandlerContext (used
 * for actual execution).
 */
function buildListContext(
  handlerCtx: ToolHandlerContext,
  options: { hasWebSearch: boolean; liveSecrets: string[] },
): ToolContext {
  return {
    scopeType: handlerCtx.scope.scopeType,
    hasWebSearch: options.hasWebSearch,
    liveSecrets: options.liveSecrets,
  };
}

export interface CreateMcpServerOptions {
  /** Per-request handler context — every tool call executes against this operator. */
  handlerCtx: ToolHandlerContext;
  /** Whether web_search infrastructure is configured (mirrors isWebSearchAvailable()). */
  hasWebSearch: boolean;
  /** Names of stored secret labels for this operator (so http_request shows them). */
  liveSecrets: string[];
}

/**
 * Creates a fresh MCP Server instance bound to a specific operator context.
 *
 * Returns the server unconnected — the caller is responsible for wiring it
 * to a transport (StreamableHTTPServerTransport in routes/mcp.ts).
 *
 * One server per request: keeps the operator binding scoped to the call and
 * avoids cross-operator state leaks.
 */
export function createMcpServerForContext(opts: CreateMcpServerOptions): Server {
  const server = new Server(SERVER_INFO, SERVER_CAPABILITIES);

  const listCtx = buildListContext(opts.handlerCtx, {
    hasWebSearch: opts.hasWebSearch,
    liveSecrets: opts.liveSecrets,
  });

  // tools/list — return the operator's available tools, filtered by scope +
  // availability. Shape matches the MCP spec: each tool has name, description,
  // inputSchema (JSON Schema).
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const wireTools = listToolsForContext(listCtx);
    return {
      tools: wireTools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        inputSchema: t.function.parameters,
      })),
    };
  });

  // tools/call — execute via the SAME dispatchTool() chat.ts uses. The MCP
  // protocol doesn't carry SSE progress events back to the caller, so the
  // onProgress callback is omitted; chat.ts retains it for browser-side
  // live indicators on internal calls.
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const rawArgs = JSON.stringify(args ?? {});

    const result = await dispatchTool(name, rawArgs, opts.handlerCtx);

    return {
      content: [
        {
          type: 'text' as const,
          text: result.content,
        },
      ],
      // isError is signaled when the dispatch said the args were invalid or
      // the underlying operation failed. The MCP client (external agent)
      // can react to this and adjust.
      isError: result.meta?.terminateLoop === true,
    };
  });

  return server;
}

/**
 * Convenience export — the list of universal tool names this MCP server
 * surfaces. Used by /mcp endpoint introspection and by tests.
 */
export const UNIVERSAL_TOOL_NAMES: string[] = UNIVERSAL_TOOLS.map((t) => t.name);
