/**
 * The catalog — the comprehensive map of the CULTUREYES tool universe.
 *
 * Two halves, both first-class (Oracle pattern: build the whole, provision the
 * slice):
 *   1. REAL_TOOLS — every tool that actually runs in this build. `seedCatalog`
 *      registers them all. No throw-placeholders: a registered tool is always a
 *      working `ToolDef`. Backends are pluggable — a tool with no connector/secret
 *      returns a graceful "not connected" result, it never throws a stub error.
 *   2. CATALOG — the full known landscape (real + available-to-add). The
 *      `available` half documents what the platform can reach the moment a
 *      connector is wired or an MCP server is registered (Microsoft 365 / Graph,
 *      the rest of Google, AWS, more data stores, the web/comms/PM/CRM/media
 *      ecosystem). These are NOT registered as throwing stubs — they are the
 *      expansion roadmap + are reachable live via `registerMcpServer`.
 *
 * Adding a real tool = author its `ToolDef`, drop it in the right category array,
 * and (if new) include the array here. Adding an integration the world already
 * has = wire its connector or point an MCP server at it; the catalog just records
 * that it exists.
 */

import type { ToolDef } from "@cultureyes/types";
import type { Registry } from "./registry.js";
import { makeGetToolSpec, makeListTools } from "./tools/discovery.js";
import { fetchUrl, webSearch } from "./tools/web.js";
import { dbQuery, kbQuery, vectorSearch } from "./tools/data.js";
import { auditLog, notify, routeToReviewer, store } from "./tools/workflow.js";
import { filesTools } from "./tools/files.js";
import { gmailTools } from "./tools/gmail.js";
import { commsTools } from "./tools/comms.js";
import { googleWorkspaceTools } from "./tools/google-workspace.js";
import { tasksTools } from "./tools/tasks.js";
import { memoryTools } from "./tools/memory.js";
import { devTools } from "./tools/dev.js";
import { researchTools } from "./tools/research.js";
import { integrationsTools } from "./tools/integrations.js";
import { appBuilderTools } from "./tools/appbuilder.js";

/**
 * Every REAL tool in this build. Each is a working `ToolDef`; discovery tools
 * (`list_tools`/`get_tool_spec`) are registered separately by `seedCatalog`
 * because they need a handle to the live registry.
 */
export const REAL_TOOLS: ToolDef[] = [
  // A · Web / Research
  webSearch,
  fetchUrl,
  // C · Data / Databases  +  D · Knowledge (read)
  dbQuery,
  kbQuery,
  vectorSearch,
  // L · Workflow / Orchestration (core)
  auditLog,
  store,
  routeToReviewer,
  notify,
  // B · Files / Documents  +  J · Output / Render
  ...filesTools,
  // E · Communication (Gmail)
  ...gmailTools,
  // E · Communication (chat channels)
  ...commsTools,
  // F · Productivity (Google Calendar + Drive)
  ...googleWorkspaceTools,
  // L · Workflow / Automation (recurring tasks)
  ...tasksTools,
  // D · Knowledge / RAG / Memory (admin)
  ...memoryTools,
  // G · Dev  +  F · Productivity (Notion/Linear)  +  H · CRM  +  generic HTTP
  ...devTools,
  // A · Web / Research (Firecrawl)
  ...researchTools,
  // M · Integrations / Auth  +  N · Meta / Self (+ time)
  ...integrationsTools,
  // App-builder (elbani.studio / Bani Studio) — scaffold/codegen/build/deploy
  ...appBuilderTools,
];

/** Status of a catalog entry. `real` = registered + runnable now. */
export type CatalogStatus = "real" | "available";

/**
 * A single line of the master catalog: name + domain + status.
 * `available` entries are reachable by wiring a connector or registering an MCP
 * server; they are documented here, not registered as throwing placeholders.
 */
export interface CatalogEntry {
  name: string;
  domain: string;
  status: CatalogStatus;
}

/**
 * The available-to-add landscape — the rest of the known tool universe. These
 * are NOT registered (no stubs); they record what the platform expands into and
 * are usable live via an MCP server or a wired connector. Grouped by family.
 */
const AVAILABLE: CatalogEntry[] = [
  // ── Microsoft 365 / Graph ──────────────────────────────────────────────
  { name: "outlook_send", domain: "comms", status: "available" },
  { name: "outlook_search", domain: "comms", status: "available" },
  { name: "outlook_read", domain: "comms", status: "available" },
  { name: "ms_calendar_create_event", domain: "calendar", status: "available" },
  { name: "ms_calendar_list_events", domain: "calendar", status: "available" },
  { name: "onedrive_search", domain: "drive", status: "available" },
  { name: "onedrive_read_file", domain: "drive", status: "available" },
  { name: "onedrive_upload_file", domain: "drive", status: "available" },
  { name: "sharepoint_search", domain: "drive", status: "available" },
  { name: "teams_send_message", domain: "comms", status: "available" },
  { name: "teams_list_channels", domain: "comms", status: "available" },
  { name: "excel_read_range", domain: "data", status: "available" },
  { name: "excel_write_range", domain: "data", status: "available" },
  { name: "word_create_doc", domain: "files", status: "available" },
  { name: "ms_todo_create", domain: "productivity", status: "available" },
  { name: "planner_create_task", domain: "productivity", status: "available" },

  // ── Google (beyond Gmail/Calendar/Drive, already real) ─────────────────
  { name: "docs_create", domain: "files", status: "available" },
  { name: "docs_read", domain: "files", status: "available" },
  { name: "sheets_read_range", domain: "data", status: "available" },
  { name: "sheets_write_range", domain: "data", status: "available" },
  { name: "slides_create", domain: "files", status: "available" },
  { name: "youtube_search", domain: "web", status: "available" },
  { name: "maps_search_places", domain: "web", status: "available" },
  { name: "maps_directions", domain: "web", status: "available" },
  { name: "bigquery_query", domain: "data", status: "available" },
  { name: "vertex_ai_search", domain: "data", status: "available" },

  // ── AWS ────────────────────────────────────────────────────────────────
  { name: "s3_get_object", domain: "files", status: "available" },
  { name: "s3_put_object", domain: "files", status: "available" },
  { name: "s3_list_objects", domain: "files", status: "available" },
  { name: "dynamodb_query", domain: "data", status: "available" },
  { name: "lambda_invoke", domain: "dev", status: "available" },
  { name: "ses_send_email", domain: "comms", status: "available" },
  { name: "sqs_send_message", domain: "workflow", status: "available" },
  { name: "cloudwatch_query_logs", domain: "dev", status: "available" },

  // ── Data stores / vector ────────────────────────────────────────────────
  { name: "postgres_query", domain: "data", status: "available" },
  { name: "mysql_query", domain: "data", status: "available" },
  { name: "sqlite_query", domain: "data", status: "available" },
  { name: "snowflake_query", domain: "data", status: "available" },
  { name: "pinecone_search", domain: "data", status: "available" },
  { name: "weaviate_search", domain: "data", status: "available" },
  { name: "qdrant_search", domain: "data", status: "available" },
  { name: "pgvector_search", domain: "data", status: "available" },

  // ── Web / research ecosystem ────────────────────────────────────────────
  { name: "tavily_search", domain: "web", status: "available" },
  { name: "brave_search", domain: "web", status: "available" },
  { name: "exa_search", domain: "web", status: "available" },
  { name: "serper_search", domain: "web", status: "available" },
  { name: "perplexity_search", domain: "web", status: "available" },
  { name: "playwright_navigate", domain: "web", status: "available" },
  { name: "playwright_screenshot", domain: "web", status: "available" },
  { name: "puppeteer_scrape", domain: "web", status: "available" },
  { name: "wikipedia_search", domain: "web", status: "available" },
  { name: "arxiv_search", domain: "web", status: "available" },

  // ── Communication ecosystem ─────────────────────────────────────────────
  { name: "discord_send_message", domain: "comms", status: "available" },
  { name: "twilio_send_sms", domain: "comms", status: "available" },
  { name: "smtp_send_email", domain: "comms", status: "available" },

  // ── Productivity / project management ──────────────────────────────────
  { name: "jira_create_issue", domain: "productivity", status: "available" },
  { name: "jira_search", domain: "productivity", status: "available" },
  { name: "asana_create_task", domain: "productivity", status: "available" },
  { name: "trello_create_card", domain: "productivity", status: "available" },
  { name: "confluence_create_page", domain: "productivity", status: "available" },
  { name: "confluence_search", domain: "productivity", status: "available" },

  // ── CRM / business / payments ──────────────────────────────────────────
  { name: "salesforce_query", domain: "crm", status: "available" },
  { name: "salesforce_create_record", domain: "crm", status: "available" },
  { name: "pipedrive_create_deal", domain: "crm", status: "available" },
  { name: "stripe_create_payment_link", domain: "crm", status: "available" },
  { name: "stripe_list_charges", domain: "crm", status: "available" },

  // ── Media ───────────────────────────────────────────────────────────────
  { name: "image_generate", domain: "media", status: "available" },
  { name: "image_describe", domain: "media", status: "available" },
  { name: "tts_synthesize", domain: "media", status: "available" },
  { name: "stt_transcribe", domain: "media", status: "available" },

  // ── Dev / code execution ────────────────────────────────────────────────
  { name: "gitlab_create_issue", domain: "dev", status: "available" },
  { name: "gitlab_read_file", domain: "dev", status: "available" },
  { name: "code_execute_sandbox", domain: "dev", status: "available" },

  // ── Verify / compute (gatekeeper preset extras) ────────────────────────
  { name: "compute", domain: "verify", status: "available" },
  { name: "cross_reference", domain: "verify", status: "available" },
  { name: "classify", domain: "verify", status: "available" },
  { name: "privacy_scan", domain: "verify", status: "available" },
  { name: "redact", domain: "verify", status: "available" },
  { name: "source_verify", domain: "verify", status: "available" },
];

/**
 * The master catalog: every REAL tool (derived from `REAL_TOOLS` + discovery)
 * marked `real`, followed by the `available` landscape. The single source for
 * "what does the platform know about".
 */
export const CATALOG: CatalogEntry[] = [
  { name: "list_tools", domain: "discovery", status: "real" },
  { name: "get_tool_spec", domain: "discovery", status: "real" },
  ...REAL_TOOLS.map((d): CatalogEntry => ({
    name: d.name,
    domain: d.domain ?? "misc",
    status: "real",
  })),
  ...AVAILABLE,
];

export interface SeedOptions {
  /** Bind list_tools to a fixed provisioned slice (else it reflects the registry). */
  provisioned?: string[];
  /**
   * @deprecated No-op. The catalog no longer registers throw-placeholders;
   * every registered tool is real. Kept for call-site compatibility.
   */
  includeDeferred?: boolean;
}

/**
 * Registers every real tool, then the registry-aware discovery tools last (so
 * they reflect the now-populated registry). MCP servers add more via
 * `registerMcpServer`; the `available` catalog half is reached that way or by
 * wiring a connector — neither needs a placeholder here.
 */
export function seedCatalog(registry: Registry, opts: SeedOptions = {}): void {
  for (const def of REAL_TOOLS) registry.register(def);

  // Discovery tools last — they reflect everything already registered.
  registry.register(makeListTools(registry, opts.provisioned));
  registry.register(makeGetToolSpec(registry));
}
