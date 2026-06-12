/**
 * Discovery tools — how the agent learns what it can do.
 *
 * These are special: they need a handle to the registry itself. They're built
 * via factories that close over the registry, so the agent's view of "what
 * tools exist" is always live and provisioning-aware.
 */

import type { ToolContext, ToolDef, ToolRegistry } from "@cultureyes/types";
import { ok, requireString } from "./_shared.js";

/**
 * `list_tools` — returns the provisioned tool names in the TRAINED format the
 * gatekeeper expects: `"Found tools: a, b, c."`.
 *
 * `provisioned` lets a deployment bind the slice once; if omitted, the call
 * may pass a `provisioned` param, else it lists everything.
 */
export function makeListTools(
  registry: ToolRegistry,
  provisioned?: string[],
): ToolDef {
  return {
    name: "list_tools",
    description: "List the tools available to this agent.",
    domain: "discovery",
    schema: {
      type: "object",
      properties: {
        provisioned: {
          type: "array",
          items: { type: "string" },
          description: "Optional override slice of tool/domain names.",
        },
      },
    },
    async execute(params) {
      const slice =
        (params.provisioned as string[] | undefined) ?? provisioned;
      const names = registry
        .list(slice)
        .map((d) => d.name)
        .filter((n) => n !== "list_tools");
      const content =
        names.length > 0
          ? `Found tools: ${names.join(", ")}.`
          : "Found tools: none.";
      return ok(content, { tools: names });
    },
  };
}

/**
 * `get_tool_spec` — returns one tool's spec as a plain sentence the verifier
 * can read, with the full JSON schema in `data` for the agent loop.
 */
export function makeGetToolSpec(registry: ToolRegistry): ToolDef {
  return {
    name: "get_tool_spec",
    description: "Get the description and input schema for one tool by name.",
    domain: "discovery",
    schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
    async execute(params, _ctx: ToolContext) {
      const name = requireString(params, "name");
      const def = registry.get(name);
      if (!def) {
        return {
          ok: false,
          content: `No tool named ${name}.`,
          error: `unknown tool: ${name}`,
        };
      }
      const required = def.schema.required ?? [];
      const props = Object.keys(def.schema.properties);
      const content =
        `Tool ${def.name}: ${def.description} ` +
        `Parameters: ${props.length ? props.join(", ") : "none"}` +
        (required.length ? ` (required: ${required.join(", ")}).` : ".");
      return ok(content, {
        name: def.name,
        description: def.description,
        domain: def.domain,
        schema: def.schema,
      });
    },
  };
}
