/**
 * @cultureyes/tools — L1 of the CULTUREYES SDK.
 *
 * The tool registry + MCP runtime + the v1 executor set. Brain-agnostic,
 * MCP-native, fully expandable: add a tool = register ONE `ToolDef`; plug in
 * any MCP server = one `registerMcpServer` call.
 *
 * Typical wiring:
 *   const registry = createRegistry();
 *   seedCatalog(registry, { provisioned });        // real v1 + deferred placeholders
 *   await registerMcpServer(registry, mcpClient);  // any external MCP server
 *   const res = await registry.execute("web_search", { query }, ctx);
 */

import type { ToolConnectors as BaseConnectors } from "./tools/_shared.js";
import type { FileStore, PdfExtractor } from "./tools/files.js";
import type { GmailConnector } from "./tools/gmail.js";
import type {
  TelegramConnector,
  WhatsAppConnector,
  SlackConnector,
} from "./tools/comms.js";
import type { GoogleWorkspaceConnector } from "./tools/google-workspace.js";
import type { TaskStore } from "./tools/tasks.js";
import type { MemoryConnector, KbAdminConnector } from "./tools/memory.js";
import type {
  GithubConnector,
  NotionConnector,
  LinearConnector,
  HubspotConnector,
} from "./tools/dev.js";
import type { FirecrawlConnector } from "./tools/research.js";
import type {
  IntegrationsConnector,
  SecretsAdmin,
  SelfInfoProvider,
  ConversationsStore,
} from "./tools/integrations.js";
import type {
  ProjectStore,
  BuildSandbox,
  Deployer,
  DbProvisioner,
} from "./tools/appbuilder.js";

// ─── core registry ──────────────────────────────────────────────────────────
export { createRegistry } from "./registry.js";
export type { Registry } from "./registry.js";

// ─── MCP runtime ────────────────────────────────────────────────────────────
export { registerMcpServer, mcpResultToToolResult } from "./mcp.js";
export type {
  McpClientLike,
  McpListToolsResult,
  McpCallToolResult,
  RegisterMcpOptions,
} from "./mcp.js";

// ─── catalog ────────────────────────────────────────────────────────────────
export { seedCatalog, CATALOG, REAL_TOOLS } from "./catalog.js";
export type { CatalogEntry, CatalogStatus, SeedOptions } from "./catalog.js";

// ─── core tool defs ─────────────────────────────────────────────────────────
export { makeListTools, makeGetToolSpec } from "./tools/discovery.js";
export { webSearch, fetchUrl } from "./tools/web.js";
export { dbQuery, kbQuery, vectorSearch } from "./tools/data.js";
export { auditLog, store, routeToReviewer, notify } from "./tools/workflow.js";

// ─── ported tool categories (the full real set) ─────────────────────────────
export { filesTools } from "./tools/files.js";
export type { FileStore, FileEntry, PdfExtractor } from "./tools/files.js";
export { gmailTools } from "./tools/gmail.js";
export type { GmailConnector, GmailModifyAction } from "./tools/gmail.js";
export { commsTools } from "./tools/comms.js";
export type {
  TelegramConnector,
  WhatsAppConnector,
  SlackConnector,
  SlackSearchMatch,
  CommsConnectors,
} from "./tools/comms.js";
export { googleWorkspaceTools } from "./tools/google-workspace.js";
export type { GoogleWorkspaceConnector } from "./tools/google-workspace.js";
export { tasksTools } from "./tools/tasks.js";
export type {
  TaskStore,
  Task,
  TaskPatch,
  TaskRunResult,
  TaskSchedule,
  TaskStatus,
} from "./tools/tasks.js";
export { memoryTools } from "./tools/memory.js";
export type {
  MemoryConnector,
  KbAdminConnector,
  MemoryHit,
  MemoryType,
  KbSearchHit,
  KbPendingEntry,
  KbSeedResult,
  KbDeleteResult,
} from "./tools/memory.js";
// Aliased: memory's MemoryRecord is a connector contract, distinct from the
// @cultureyes/types MemoryRecord (the 2-layer memory store record).
export type { MemoryRecord as StoredMemoryRecord } from "./tools/memory.js";
export { devTools } from "./tools/dev.js";
export type {
  GithubConnector,
  NotionConnector,
  LinearConnector,
  HubspotConnector,
  DevConnectors,
} from "./tools/dev.js";
export { researchTools } from "./tools/research.js";
export type {
  FirecrawlConnector,
  FcScrapeArgs,
  FcMapArgs,
  FcCrawlArgs,
  FcExtractArgs,
  FcSearchArgs,
  FcResponse,
  FcSearchItem,
} from "./tools/research.js";
export { defaultFirecrawlConnector } from "./tools/research.js";
export { integrationsTools } from "./tools/integrations.js";
export type {
  IntegrationsConnector,
  SecretsAdmin,
  SelfInfoProvider,
  ConversationsStore,
  Integration,
  ConnectFormField,
  SelfInfo,
  ConversationSummary,
} from "./tools/integrations.js";
export { appBuilderTools } from "./tools/appbuilder.js";
export type {
  ProjectStore,
  BuildSandbox,
  Deployer,
  DbProvisioner,
  AppBuilderConnectors,
  SandboxRun,
  ProjectFileEntry,
} from "./tools/appbuilder.js";

// ─── default adapters ───────────────────────────────────────────────────────
export {
  defaultWebSearchProvider,
  defaultUrlFetcher,
} from "./tools/defaults.js";

// ─── pluggable connector/provider interfaces ────────────────────────────────
export type {
  ToolConnectors,
  ToolCtx,
  WebSearchProvider,
  WebSearchHit,
  UrlFetcher,
  DbConnector,
  KbConnector,
  KbEntry,
  VectorConnector,
  VectorMatch,
  AuditSink,
  StoreSink,
  ReviewSink,
  NotifySink,
} from "./tools/_shared.js";
export { connectors } from "./tools/_shared.js";

// ─── unified connector bag ────────────────────────────────────────────────────
/**
 * Every pluggable backend the full tool set can read off `ctx.connectors`.
 * Attach the slice a deployment needs; any absent backend degrades gracefully
 * (the tool returns a non-fatal "not connected" result). Extends the base
 * web/data/workflow connectors (`urlFetcher`, `db`, `kb`, `vector`, `audit`,
 * `store`, `review`, `notify`) with every ported category's connector.
 */
export interface AllConnectors extends BaseConnectors {
  files?: FileStore;
  pdf?: PdfExtractor;
  gmail?: GmailConnector;
  telegram?: TelegramConnector;
  whatsapp?: WhatsAppConnector;
  slack?: SlackConnector;
  googleWorkspace?: GoogleWorkspaceConnector;
  tasks?: TaskStore;
  memory?: MemoryConnector;
  /** KB admin surface (seed/search/delete/pending) — distinct from base `kb`. */
  kbAdmin?: KbAdminConnector;
  github?: GithubConnector;
  notion?: NotionConnector;
  linear?: LinearConnector;
  hubspot?: HubspotConnector;
  firecrawl?: FirecrawlConnector;
  integrations?: IntegrationsConnector;
  secretsAdmin?: SecretsAdmin;
  selfInfo?: SelfInfoProvider;
  conversations?: ConversationsStore;
  // app-builder (elbani.studio). `store` (env-var persistence) is inherited.
  project?: ProjectStore;
  sandbox?: BuildSandbox;
  deployer?: Deployer;
  db_provisioner?: DbProvisioner;
}
