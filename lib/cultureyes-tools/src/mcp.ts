/**
 * L1 · MCP runtime — plug ANY MCP server into the registry.
 *
 * `registerMcpServer(registry, client)` lists an external MCP server's tools
 * (via a `@modelcontextprotocol/sdk` `Client`) and registers each as a local
 * `ToolDef` whose `execute` proxies to the server's `callTool`. From the agent
 * loop's perspective the proxied tools are indistinguishable from native ones —
 * this is what makes the SDK MCP-native: any server in the world plugs in with
 * zero per-server code.
 *
 * We type against a minimal STRUCTURAL interface (`McpClientLike`) rather than
 * importing the concrete `Client` class, so:
 *   - this package compiles without the SDK present at build time, and
 *   - any transport (stdio, SSE, streamable-HTTP) or compatible client works.
 * The real `@modelcontextprotocol/sdk` `Client` satisfies this shape exactly.
 */

import type { ToolDef, ToolResult, ToolSchema } from "@cultureyes/types";
import type { Registry } from "./registry.js";

/** The shape of an MCP `listTools()` result we rely on. */
export interface McpListToolsResult {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
  }>;
}

/** The shape of an MCP `callTool()` result we rely on. */
export interface McpCallToolResult {
  content?: Array<{ type: string; text?: string; [k: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
}

/** Minimal structural view of the SDK `Client` — the real Client satisfies it. */
export interface McpClientLike {
  listTools(): Promise<McpListToolsResult>;
  callTool(args: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<McpCallToolResult>;
}

export interface RegisterMcpOptions {
  /** Prefix applied to every tool name to avoid collisions (e.g. "github_"). */
  namespace?: string;
  /** Catalog domain to tag the imported tools with. Default: "mcp". */
  domain?: string;
}

/** Coerce an MCP JSON-Schema-ish inputSchema into our `ToolSchema`. */
function toToolSchema(input: McpListToolsResult["tools"][number]["inputSchema"]): ToolSchema {
  return {
    type: "object",
    properties: input?.properties ?? {},
    required: input?.required,
  };
}

/** Flatten an MCP call result into the trained plain-text `ToolResult`. */
export function mcpResultToToolResult(
  name: string,
  res: McpCallToolResult,
): ToolResult {
  const text = (res.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (res.isError) {
    const msg = text || `MCP tool ${name} reported an error`;
    return { ok: false, content: `${msg}.`, error: msg };
  }

  // Verifier reads `content` as a plain sentence. MCP text servers already
  // return prose; if a server returned only structured data, summarize it.
  const content =
    text.length > 0
      ? text
      : res.structuredContent !== undefined
        ? `Result: ${JSON.stringify(res.structuredContent)}.`
        : `Tool ${name} returned no content.`;

  return { ok: true, content, data: res.structuredContent ?? res.content };
}

/**
 * Lists `client`'s tools and registers each as a proxy `ToolDef`. Returns the
 * registered tool names. Call again after a reconnect to refresh.
 */
export async function registerMcpServer(
  registry: Registry,
  client: McpClientLike,
  opts: RegisterMcpOptions = {},
): Promise<string[]> {
  const ns = opts.namespace ?? "";
  const domain = opts.domain ?? "mcp";

  const { tools } = await client.listTools();
  const registered: string[] = [];

  for (const tool of tools) {
    const localName = `${ns}${tool.name}`;
    const def: ToolDef = {
      name: localName,
      description: tool.description ?? `MCP tool ${tool.name}`,
      domain,
      schema: toToolSchema(tool.inputSchema),
      async execute(params, ctx) {
        ctx.logger.info(`mcp.callTool ${tool.name}`, {
          server: domain,
          consumerId: ctx.consumerId,
        });
        const res = await client.callTool({
          name: tool.name, // proxy to the server's ORIGINAL (un-namespaced) name
          arguments: params,
        });
        return mcpResultToToolResult(localName, res);
      },
    };
    registry.register(def);
    registered.push(localName);
  }

  return registered;
}
