/**
 * Dev + productivity + CRM + generic-HTTP tools.
 *
 * Ported from the OpSoul integration handlers (toolHandlers.ts) and their
 * registry schemas (toolRegistry.ts): GitHub, Notion, Linear, HubSpot, plus the
 * generic `http_request` with `{{SECRET_NAME}}` substitution (httpExecutor.ts).
 *
 * OpSoul authenticated these through a connected OAuth/integration row. In the
 * SDK each provider is a clean, pluggable connector resolved from
 * `ctx.connectors`; when absent it falls back to a default adapter that reads
 * the provider's named secret from `ctx.secrets` and calls the real REST/GraphQL
 * API with native `fetch`. A missing secret yields a graceful, non-fatal
 * `ok:false` "<tool> is not connected for this deployment." result — never a
 * throw and never a placeholder.
 */

import type { ToolContext, ToolDef, ToolResult } from "@cultureyes/types";
import { ok, requireString } from "./_shared.js";

// ─── pluggable connector interfaces ─────────────────────────────────────────

/** A GitHub backend (REST api.github.com, or a swapped enterprise host). */
export interface GithubConnector {
  name: string;
  createIssue(input: {
    repo: string;
    title: string;
    body?: string;
  }): Promise<string>;
  search(input: {
    scope: "code" | "issues" | "repositories";
    query: string;
  }): Promise<string>;
  readFile(input: {
    repo: string;
    path: string;
    ref?: string;
  }): Promise<string>;
}

/** A Notion backend (REST api.notion.com). */
export interface NotionConnector {
  name: string;
  search(input: { query: string }): Promise<string>;
  createPage(input: {
    parentPageId: string;
    title: string;
    content?: string;
  }): Promise<string>;
}

/** A Linear backend (GraphQL api.linear.app/graphql). */
export interface LinearConnector {
  name: string;
  createIssue(input: {
    teamId: string;
    title: string;
    description?: string;
  }): Promise<string>;
  search(input: { query: string }): Promise<string>;
}

/** A HubSpot backend (REST api.hubapi.com). */
export interface HubspotConnector {
  name: string;
  searchContact(input: { query: string }): Promise<string>;
  createDeal(input: {
    name: string;
    stage: string;
    amount?: number;
  }): Promise<string>;
}

/** The optional dev/productivity/CRM connector bag attached to the context. */
export interface DevConnectors {
  github?: GithubConnector;
  notion?: NotionConnector;
  linear?: LinearConnector;
  hubspot?: HubspotConnector;
}

/** Reads the dev connector bag off the context without widening `ToolContext`. */
function devConnectors(ctx: ToolContext): DevConnectors {
  return (
    (ctx as unknown as { connectors?: DevConnectors }).connectors ?? {}
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function notConnected(tool: string): ToolResult {
  return {
    ok: false,
    content: `${tool} is not connected for this deployment.`,
    error: `missing credential for ${tool}`,
  };
}

/** Formats a fetch Response into OpSoul's "HTTP <status> <statusText>\n<body>" shape. */
async function formatHttpResponse(resp: Response): Promise<string> {
  const text = await resp.text();
  let output: string;
  try {
    output = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    output = text.slice(0, 3000);
  }
  return `HTTP ${resp.status} ${resp.statusText}\n${output}`;
}

const stringParam = (
  params: Record<string, unknown>,
  key: string,
): string | undefined => {
  const v = params[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
};

// ─── default connectors (native fetch against the real APIs) ────────────────

function defaultGithub(token: string): GithubConnector {
  const base = "https://api.github.com";
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };
  return {
    name: "github",
    async createIssue({ repo, title, body }) {
      const resp = await fetch(`${base}/repos/${repo}/issues`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title, body: body ?? "" }),
      });
      return formatHttpResponse(resp);
    },
    async search({ scope, query }) {
      const resp = await fetch(
        `${base}/search/${scope}?q=${encodeURIComponent(query)}&per_page=10`,
        { method: "GET", headers },
      );
      return formatHttpResponse(resp);
    },
    async readFile({ repo, path, ref }) {
      const url = `${base}/repos/${repo}/contents/${path}${
        ref ? `?ref=${encodeURIComponent(ref)}` : ""
      }`;
      const resp = await fetch(url, {
        method: "GET",
        headers: { ...headers, Accept: "application/vnd.github.raw" },
      });
      const text = await resp.text();
      return text.slice(0, 12000);
    },
  };
}

function defaultNotion(token: string): NotionConnector {
  const base = "https://api.notion.com/v1";
  const headers = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
  return {
    name: "notion",
    async search({ query }) {
      const resp = await fetch(`${base}/search`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, page_size: 10 }),
      });
      return formatHttpResponse(resp);
    },
    async createPage({ parentPageId, title, content }) {
      const payload: Record<string, unknown> = {
        parent: { page_id: parentPageId },
        properties: { title: { title: [{ text: { content: title } }] } },
      };
      if (content) {
        payload.children = [
          {
            object: "block",
            type: "paragraph",
            paragraph: { rich_text: [{ type: "text", text: { content } }] },
          },
        ];
      }
      const resp = await fetch(`${base}/pages`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      return formatHttpResponse(resp);
    },
  };
}

function defaultLinear(apiKey: string): LinearConnector {
  const endpoint = "https://api.linear.app/graphql";
  // Linear API keys are sent in the Authorization header without a "Bearer" prefix.
  const headers = {
    Authorization: apiKey,
    "Content-Type": "application/json",
  };
  return {
    name: "linear",
    async createIssue({ teamId, title, description }) {
      const mutation =
        "mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id title identifier } } }";
      const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: mutation,
          variables: { input: { teamId, title, description } },
        }),
      });
      return formatHttpResponse(resp);
    },
    async search({ query }) {
      const gql =
        "query Search($q: String!) { issues(filter: { title: { contains: $q } }, first: 10) { nodes { id identifier title state { name } assignee { name } } } }";
      const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: gql, variables: { q: query } }),
      });
      return formatHttpResponse(resp);
    },
  };
}

function defaultHubspot(token: string): HubspotConnector {
  const base = "https://api.hubapi.com";
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  return {
    name: "hubspot",
    async searchContact({ query }) {
      const resp = await fetch(`${base}/crm/v3/objects/contacts/search`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query,
          limit: 10,
          properties: ["firstname", "lastname", "email", "company"],
        }),
      });
      return formatHttpResponse(resp);
    },
    async createDeal({ name, stage, amount }) {
      const properties: Record<string, unknown> = {
        dealname: name,
        dealstage: stage,
      };
      if (typeof amount === "number") properties.amount = String(amount);
      const resp = await fetch(`${base}/crm/v3/objects/deals`, {
        method: "POST",
        headers,
        body: JSON.stringify({ properties }),
      });
      return formatHttpResponse(resp);
    },
  };
}

/** Resolves a connector from the bag, else builds a default from its secret. */
async function resolveGithub(
  ctx: ToolContext,
): Promise<GithubConnector | undefined> {
  const wired = devConnectors(ctx).github;
  if (wired) return wired;
  const token = await ctx.secrets.get("GITHUB_TOKEN");
  return token ? defaultGithub(token) : undefined;
}

async function resolveNotion(
  ctx: ToolContext,
): Promise<NotionConnector | undefined> {
  const wired = devConnectors(ctx).notion;
  if (wired) return wired;
  const token = await ctx.secrets.get("NOTION_TOKEN");
  return token ? defaultNotion(token) : undefined;
}

async function resolveLinear(
  ctx: ToolContext,
): Promise<LinearConnector | undefined> {
  const wired = devConnectors(ctx).linear;
  if (wired) return wired;
  const key = await ctx.secrets.get("LINEAR_API_KEY");
  return key ? defaultLinear(key) : undefined;
}

async function resolveHubspot(
  ctx: ToolContext,
): Promise<HubspotConnector | undefined> {
  const wired = devConnectors(ctx).hubspot;
  if (wired) return wired;
  const token = await ctx.secrets.get("HUBSPOT_TOKEN");
  return token ? defaultHubspot(token) : undefined;
}

// ─── GitHub tools (domain: dev) ─────────────────────────────────────────────

const githubCreateIssue: ToolDef = {
  name: "github_create_issue",
  description: "Opens a new issue on a GitHub repo via the connected PAT.",
  domain: "dev",
  schema: {
    type: "object",
    properties: {
      repo: { type: "string", description: 'Repo in "owner/name" form.' },
      title: { type: "string", description: "Issue title." },
      body: { type: "string", description: "Issue body (Markdown)." },
    },
    required: ["repo", "title"],
  },
  async execute(params, ctx) {
    const repo = requireString(params, "repo");
    const title = requireString(params, "title");
    const body = stringParam(params, "body");
    const github = await resolveGithub(ctx);
    if (!github) return notConnected("github_create_issue");
    const result = await github.createIssue({ repo, title, body });
    return ok(result, { result });
  },
};

const githubSearch: ToolDef = {
  name: "github_search",
  description:
    "Searches GitHub for code, issues, or repositories. Up to 10 results returned.",
  domain: "dev",
  schema: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["code", "issues", "repositories"],
        description: "What to search.",
      },
      query: { type: "string", description: "GitHub search query." },
    },
    required: ["scope", "query"],
  },
  async execute(params, ctx) {
    const scope = requireString(params, "scope");
    const query = requireString(params, "query");
    if (!["code", "issues", "repositories"].includes(scope)) {
      return {
        ok: false,
        content:
          "github_search requires scope ∈ {code, issues, repositories} and a query.",
        error: "invalid scope",
      };
    }
    const github = await resolveGithub(ctx);
    if (!github) return notConnected("github_search");
    const result = await github.search({
      scope: scope as "code" | "issues" | "repositories",
      query,
    });
    return ok(result, { result });
  },
};

const githubReadFile: ToolDef = {
  name: "github_read_file",
  description:
    "Reads a file from a GitHub repo at a specific path. Returns decoded text content.",
  domain: "dev",
  schema: {
    type: "object",
    properties: {
      repo: { type: "string", description: "owner/name" },
      path: { type: "string", description: "File path within the repo." },
      ref: {
        type: "string",
        description: "Branch/tag/commit ref. Default: default branch.",
      },
    },
    required: ["repo", "path"],
  },
  async execute(params, ctx) {
    const repo = requireString(params, "repo");
    const path = requireString(params, "path");
    const ref = stringParam(params, "ref");
    const github = await resolveGithub(ctx);
    if (!github) return notConnected("github_read_file");
    const result = await github.readFile({ repo, path, ref });
    return ok(result, { result });
  },
};

// ─── Notion tools (domain: productivity) ────────────────────────────────────

const notionSearch: ToolDef = {
  name: "notion_search",
  description:
    "Searches the connected Notion workspace for pages or databases matching the query. Returns up to 10 results.",
  domain: "productivity",
  schema: {
    type: "object",
    properties: { query: { type: "string", description: "Search text." } },
    required: ["query"],
  },
  async execute(params, ctx) {
    const query = requireString(params, "query");
    const notion = await resolveNotion(ctx);
    if (!notion) return notConnected("notion_search");
    const result = await notion.search({ query });
    return ok(result, { result });
  },
};

const notionCreatePage: ToolDef = {
  name: "notion_create_page",
  description: "Creates a new Notion page under a parent page or database.",
  domain: "productivity",
  schema: {
    type: "object",
    properties: {
      parentPageId: {
        type: "string",
        description:
          "Parent page id (32-char UUID without dashes also accepted).",
      },
      title: { type: "string", description: "Page title." },
      content: {
        type: "string",
        description: "Body text (plain). Becomes a single paragraph block.",
      },
    },
    required: ["parentPageId", "title"],
  },
  async execute(params, ctx) {
    const parentPageId = requireString(params, "parentPageId");
    const title = requireString(params, "title");
    const content = stringParam(params, "content");
    const notion = await resolveNotion(ctx);
    if (!notion) return notConnected("notion_create_page");
    const result = await notion.createPage({ parentPageId, title, content });
    return ok(result, { result });
  },
};

// ─── Linear tools (domain: productivity) ────────────────────────────────────

const linearCreateIssue: ToolDef = {
  name: "linear_create_issue",
  description:
    "Creates a new issue in a Linear team. Title required, description optional.",
  domain: "productivity",
  schema: {
    type: "object",
    properties: {
      teamId: { type: "string", description: "Linear team id (UUID)." },
      title: { type: "string", description: "Issue title." },
      description: {
        type: "string",
        description: "Optional description (Markdown).",
      },
    },
    required: ["teamId", "title"],
  },
  async execute(params, ctx) {
    const teamId = requireString(params, "teamId");
    const title = requireString(params, "title");
    const description = stringParam(params, "description");
    const linear = await resolveLinear(ctx);
    if (!linear) return notConnected("linear_create_issue");
    const result = await linear.createIssue({ teamId, title, description });
    return ok(result, { result });
  },
};

const linearSearch: ToolDef = {
  name: "linear_search",
  description:
    "Searches Linear issues by text. Returns up to 10 issues with id, title, state, and assignee.",
  domain: "productivity",
  schema: {
    type: "object",
    properties: { query: { type: "string", description: "Search text." } },
    required: ["query"],
  },
  async execute(params, ctx) {
    const query = requireString(params, "query");
    const linear = await resolveLinear(ctx);
    if (!linear) return notConnected("linear_search");
    const result = await linear.search({ query });
    return ok(result, { result });
  },
};

// ─── HubSpot tools (domain: crm) ────────────────────────────────────────────

const hubspotSearchContact: ToolDef = {
  name: "hubspot_search_contact",
  description:
    "Searches HubSpot contacts by name or email. Returns up to 10 contacts with id, name, email, company.",
  domain: "crm",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search text (name or email fragment).",
      },
    },
    required: ["query"],
  },
  async execute(params, ctx) {
    const query = requireString(params, "query");
    const hubspot = await resolveHubspot(ctx);
    if (!hubspot) return notConnected("hubspot_search_contact");
    const result = await hubspot.searchContact({ query });
    return ok(result, { result });
  },
};

const hubspotCreateDeal: ToolDef = {
  name: "hubspot_create_deal",
  description:
    "Creates a new deal in HubSpot with a name, stage, and optional amount.",
  domain: "crm",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Deal name." },
      stage: {
        type: "string",
        description:
          'Pipeline stage internal id (e.g. "appointmentscheduled").',
      },
      amount: { type: "number", description: "Optional deal amount." },
    },
    required: ["name", "stage"],
  },
  async execute(params, ctx) {
    const name = requireString(params, "name");
    const stage = requireString(params, "stage");
    const amount =
      typeof params.amount === "number" ? params.amount : undefined;
    const hubspot = await resolveHubspot(ctx);
    if (!hubspot) return notConnected("hubspot_create_deal");
    const result = await hubspot.createDeal({ name, stage, amount });
    return ok(result, { result });
  },
};

// ─── Generic HTTP (domain: web) ─────────────────────────────────────────────

/**
 * Resolves `{{SECRET_NAME}}` placeholders in a string against stored secrets.
 * Ported from OpSoul's httpExecutor.ts: only [A-Z0-9_] labels match, and an
 * unresolved label is left verbatim so the failure is visible, not silent.
 */
async function resolvePlaceholders(
  str: string,
  ctx: ToolContext,
): Promise<string> {
  const labels = new Set<string>();
  for (const m of str.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)) {
    labels.add(m[1]);
  }
  const values: Record<string, string | undefined> = {};
  for (const label of labels) {
    values[label] = await ctx.secrets.get(label);
  }
  return str.replace(
    /\{\{([A-Z0-9_]+)\}\}/g,
    (_, name: string) => values[name] ?? `{{${name}}}`,
  );
}

const httpRequest: ToolDef = {
  name: "http_request",
  description:
    "Issues an HTTP request to an external endpoint. Stored secrets are referenced via the {{SECRET_NAME}} syntax in URL, headers, or body; the label resolves to its value at call time.",
  domain: "web",
  schema: {
    type: "object",
    properties: {
      method: {
        type: "string",
        enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        description: "HTTP method",
      },
      url: { type: "string", description: "Full URL including query parameters" },
      headers: {
        type: "object",
        description:
          "HTTP headers as key-value pairs. {{SECRET_NAME}} placeholders are resolved to stored secret values at call time.",
        additionalProperties: { type: "string" },
      },
      body: {
        type: "string",
        description:
          "Request body as a JSON string (for POST/PUT/PATCH). {{SECRET_NAME}} placeholders are resolved to stored secret values at call time.",
      },
    },
    required: ["method", "url"],
  },
  async execute(params, ctx) {
    const url = stringParam(params, "url");
    if (!url) {
      return {
        ok: false,
        content: 'http_request requires a "url" and "method".',
        error: "missing url",
      };
    }
    const method = (stringParam(params, "method") ?? "GET").toUpperCase();

    const rawHeaders =
      typeof params.headers === "object" && params.headers !== null
        ? (params.headers as Record<string, unknown>)
        : {};
    const rawBody = stringParam(params, "body");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    for (const [k, v] of Object.entries(rawHeaders)) {
      if (typeof v !== "string") continue;
      const key = await resolvePlaceholders(k, ctx);
      headers[key] = await resolvePlaceholders(v, ctx);
    }

    const resolvedUrl = await resolvePlaceholders(url, ctx);
    const fetchOpts: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(15000),
    };
    if (rawBody && ["POST", "PUT", "PATCH"].includes(method)) {
      fetchOpts.body = await resolvePlaceholders(rawBody, ctx);
    }

    let toolResultText: string;
    try {
      const resp = await fetch(resolvedUrl, fetchOpts);
      toolResultText = await formatHttpResponse(resp);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return {
        ok: false,
        content: `HTTP request failed: ${message}`,
        error: message,
      };
    }

    return ok(`[HTTP Response]\n${toolResultText}`, {
      method,
      url: resolvedUrl,
      response: toolResultText,
    });
  },
};

// ─── catalog export ─────────────────────────────────────────────────────────

export const devTools: ToolDef[] = [
  githubCreateIssue,
  githubSearch,
  githubReadFile,
  notionSearch,
  notionCreatePage,
  linearCreateIssue,
  linearSearch,
  hubspotSearchContact,
  hubspotCreateDeal,
  httpRequest,
];
