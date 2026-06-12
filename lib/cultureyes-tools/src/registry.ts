/**
 * L1 · Tool registry — the in-memory registry + executor.
 *
 * One source of truth for every tool the runtime can dispatch. Adding a tool
 * is ONE `register(def)` call — no rewrite, no switch statement. The registry
 * is brain-agnostic and MCP-native: locally-defined `ToolDef`s and tools
 * proxied from external MCP servers live side by side here, indistinguishable
 * to the agent loop.
 *
 * Provisioning: `list(provisioned)` returns only the consumer's slice. A
 * provisioned entry may be a concrete tool name (`web_search`) or a domain
 * (`web`) — the latter expands to every tool in that domain. `undefined`
 * means "no provisioning filter" → the full registry (e.g. for `list_tools`
 * discovery or single-tenant deployments).
 */

import type {
  ToolContext,
  ToolDef,
  ToolRegistry,
  ToolResult,
} from "@cultureyes/types";

/** Wraps a thrown error into the trained plain-text `ToolResult` envelope. */
function toErrorResult(name: string, err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    ok: false,
    // Plain sentence — the verifier reads this, never JSON.
    content: `Tool ${name} failed: ${message}.`,
    error: message,
  };
}

export interface Registry extends ToolRegistry {
  /** Removes a tool (e.g. when an MCP server disconnects). Idempotent. */
  unregister(name: string): void;
  /** True if a tool by this name is registered. */
  has(name: string): boolean;
  /** Number of registered tools. */
  size(): number;
}

/**
 * Creates a fresh, empty registry. Seed it with `seedCatalog(registry)` and/or
 * `registerMcpServer(registry, client)`.
 */
export function createRegistry(): Registry {
  const tools = new Map<string, ToolDef>();

  /** Expand a provisioned slice (names + domains) into a concrete name set. */
  function resolveProvisioned(provisioned: string[]): Set<string> {
    const names = new Set<string>();
    const requested = new Set(provisioned);
    for (const def of tools.values()) {
      if (requested.has(def.name)) names.add(def.name);
      else if (def.domain && requested.has(def.domain)) names.add(def.name);
    }
    return names;
  }

  const registry: Registry = {
    register(def: ToolDef): void {
      if (!def?.name) throw new Error("ToolDef.name is required");
      if (typeof def.execute !== "function") {
        throw new Error(`ToolDef ${def.name} is missing an execute() function`);
      }
      tools.set(def.name, def);
    },

    unregister(name: string): void {
      tools.delete(name);
    },

    has(name: string): boolean {
      return tools.has(name);
    },

    size(): number {
      return tools.size;
    },

    list(provisioned?: string[]): ToolDef[] {
      const all = [...tools.values()];
      if (provisioned === undefined) return all;
      const allowed = resolveProvisioned(provisioned);
      return all.filter((def) => allowed.has(def.name));
    },

    get(name: string): ToolDef | undefined {
      return tools.get(name);
    },

    async execute(
      name: string,
      params: Record<string, unknown>,
      ctx: ToolContext,
    ): Promise<ToolResult> {
      const def = tools.get(name);
      if (!def) {
        const msg = `Unknown tool: ${name}`;
        ctx.logger.error(msg, { name });
        return { ok: false, content: `${msg}.`, error: msg };
      }
      try {
        ctx.logger.info(`tool.execute ${name}`, {
          consumerId: ctx.consumerId,
          deploymentId: ctx.deploymentId,
        });
        return await def.execute(params ?? {}, ctx);
      } catch (err) {
        ctx.logger.error(`tool.error ${name}`, { err });
        return toErrorResult(name, err);
      }
    },
  };

  return registry;
}
