export interface IntegrationTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export interface IntegrationDefinition {
  id: string;
  displayName: string;
  category: "google" | "dev" | "productivity" | "crm" | "finance" | "communication";
  description: string;
  icon: string;
  envVar: string;
  envVarLabel: string;
  setupNote: string;
  tools: IntegrationTool[];
}

export const INTEGRATION_CATALOG: IntegrationDefinition[] = [
  {
    id: "github",
    displayName: "GitHub",
    category: "dev",
    description: "List repos, create/search issues, check PRs and code",
    icon: "github",
    envVar: "GITHUB_TOKEN",
    envVarLabel: "Personal Access Token",
    setupNote: "Create a token at github.com/settings/tokens with repo scope",
    tools: [
      {
        name: "github_list_repos",
        description: "List GitHub repositories for the authenticated user",
        parameters: {
          type: "object",
          properties: {
            per_page: { type: "number", description: "Number of repos to return (default 10)" },
            visibility: { type: "string", description: "Filter by visibility: all, public, private", enum: ["all", "public", "private"] },
          },
          required: [],
        },
      },
      {
        name: "github_list_issues",
        description: "List issues in a GitHub repository",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string", description: "Repository owner (username or org)" },
            repo: { type: "string", description: "Repository name" },
            state: { type: "string", description: "Filter by state: open, closed, all", enum: ["open", "closed", "all"] },
            per_page: { type: "number", description: "Number of issues (default 10)" },
          },
          required: ["owner", "repo"],
        },
      },
      {
        name: "github_create_issue",
        description: "Create a new issue in a GitHub repository",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string", description: "Repository owner" },
            repo: { type: "string", description: "Repository name" },
            title: { type: "string", description: "Issue title" },
            body: { type: "string", description: "Issue description (markdown supported)" },
            labels: { type: "string", description: "Comma-separated label names" },
          },
          required: ["owner", "repo", "title"],
        },
      },
      {
        name: "github_search_code",
        description: "Search for code across GitHub repositories",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query (e.g. 'useState repo:facebook/react')" },
          },
          required: ["query"],
        },
      },
    ],
  },
  {
    id: "linear",
    displayName: "Linear",
    category: "dev",
    description: "Manage issues, projects, and teams in Linear",
    icon: "linear",
    envVar: "LINEAR_API_KEY",
    envVarLabel: "API Key",
    setupNote: "Go to Linear → Settings → API → Personal API keys",
    tools: [
      {
        name: "linear_list_issues",
        description: "List issues from Linear (yours or a team's)",
        parameters: {
          type: "object",
          properties: {
            team_key: { type: "string", description: "Team key to filter issues (optional, returns all your issues if omitted)" },
            state: { type: "string", description: "Filter by state name (e.g. Todo, In Progress, Done)" },
            limit: { type: "number", description: "Number of issues to return (default 10)" },
          },
          required: [],
        },
      },
      {
        name: "linear_create_issue",
        description: "Create a new issue in Linear",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Issue title" },
            description: { type: "string", description: "Issue description (markdown supported)" },
            team_key: { type: "string", description: "Team key (e.g. ENG)" },
            priority: { type: "number", description: "Priority: 0=no priority, 1=urgent, 2=high, 3=medium, 4=low" },
          },
          required: ["title", "team_key"],
        },
      },
    ],
  },
  {
    id: "notion",
    displayName: "Notion",
    category: "productivity",
    description: "Search pages, read content, create and update pages",
    icon: "notion",
    envVar: "NOTION_TOKEN",
    envVarLabel: "Integration Token",
    setupNote: "Create an integration at notion.so/my-integrations and share your pages with it",
    tools: [
      {
        name: "notion_search",
        description: "Search for pages and databases in Notion",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            filter_type: { type: "string", description: "Filter by type: page or database", enum: ["page", "database"] },
          },
          required: ["query"],
        },
      },
      {
        name: "notion_get_page",
        description: "Get the content of a Notion page by ID",
        parameters: {
          type: "object",
          properties: {
            page_id: { type: "string", description: "The Notion page ID" },
          },
          required: ["page_id"],
        },
      },
      {
        name: "notion_create_page",
        description: "Create a new page in a Notion database",
        parameters: {
          type: "object",
          properties: {
            parent_id: { type: "string", description: "Parent page or database ID" },
            title: { type: "string", description: "Page title" },
            content: { type: "string", description: "Page content in plain text" },
          },
          required: ["parent_id", "title"],
        },
      },
    ],
  },
  {
    id: "slack",
    displayName: "Slack",
    category: "communication",
    description: "Send messages, list channels, read conversations",
    icon: "slack",
    envVar: "SLACK_BOT_TOKEN",
    envVarLabel: "Bot Token",
    setupNote: "Create a Slack app at api.slack.com, add OAuth scopes (chat:write, channels:read), install to your workspace",
    tools: [
      {
        name: "slack_send_message",
        description: "Send a message to a Slack channel or user",
        parameters: {
          type: "object",
          properties: {
            channel: { type: "string", description: "Channel name (#general) or user ID" },
            text: { type: "string", description: "Message text (markdown supported)" },
          },
          required: ["channel", "text"],
        },
      },
      {
        name: "slack_list_channels",
        description: "List channels in the Slack workspace",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Max number of channels to return (default 20)" },
          },
          required: [],
        },
      },
      {
        name: "slack_get_messages",
        description: "Get recent messages from a Slack channel",
        parameters: {
          type: "object",
          properties: {
            channel: { type: "string", description: "Channel ID or name" },
            limit: { type: "number", description: "Number of messages (default 10)" },
          },
          required: ["channel"],
        },
      },
    ],
  },
  {
    id: "telegram",
    displayName: "Telegram",
    category: "communication",
    description: "Send messages and files via your Telegram bot",
    icon: "telegram",
    envVar: "TELEGRAM_BOT_TOKEN",
    envVarLabel: "Bot Token",
    setupNote: "Create a bot with @BotFather on Telegram and copy the token",
    tools: [
      {
        name: "telegram_send_message",
        description: "Send a text message via Telegram bot to a chat/user",
        parameters: {
          type: "object",
          properties: {
            chat_id: { type: "string", description: "Telegram chat ID or @username" },
            text: { type: "string", description: "Message text (HTML or Markdown formatting supported)" },
            parse_mode: { type: "string", description: "Formatting: Markdown or HTML", enum: ["Markdown", "HTML"] },
          },
          required: ["chat_id", "text"],
        },
      },
    ],
  },
  {
    id: "hubspot",
    displayName: "HubSpot",
    category: "crm",
    description: "Manage contacts, deals, and companies in HubSpot CRM",
    icon: "hubspot",
    envVar: "HUBSPOT_API_KEY",
    envVarLabel: "Private App Token",
    setupNote: "Go to HubSpot → Settings → Integrations → Private Apps → Create private app",
    tools: [
      {
        name: "hubspot_list_contacts",
        description: "List contacts from HubSpot CRM",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Number of contacts (default 10)" },
            search: { type: "string", description: "Search query to filter contacts" },
          },
          required: [],
        },
      },
      {
        name: "hubspot_create_contact",
        description: "Create a new contact in HubSpot",
        parameters: {
          type: "object",
          properties: {
            email: { type: "string", description: "Contact email address" },
            firstname: { type: "string", description: "First name" },
            lastname: { type: "string", description: "Last name" },
            phone: { type: "string", description: "Phone number" },
            company: { type: "string", description: "Company name" },
          },
          required: ["email"],
        },
      },
      {
        name: "hubspot_create_deal",
        description: "Create a new deal in HubSpot",
        parameters: {
          type: "object",
          properties: {
            dealname: { type: "string", description: "Deal name" },
            amount: { type: "string", description: "Deal amount in USD" },
            dealstage: { type: "string", description: "Deal stage (e.g. appointmentscheduled, qualifiedtobuy, closedwon)" },
          },
          required: ["dealname"],
        },
      },
    ],
  },
  {
    id: "stripe",
    displayName: "Stripe",
    category: "finance",
    description: "List customers, invoices, and create payment links",
    icon: "stripe",
    envVar: "STRIPE_SECRET_KEY",
    envVarLabel: "Secret Key",
    setupNote: "Find your secret key in the Stripe Dashboard under Developers → API keys",
    tools: [
      {
        name: "stripe_list_customers",
        description: "List customers in Stripe",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Number of customers to return (default 10)" },
            email: { type: "string", description: "Filter by email address" },
          },
          required: [],
        },
      },
      {
        name: "stripe_list_invoices",
        description: "List invoices in Stripe",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Number of invoices (default 10)" },
            status: { type: "string", description: "Filter by status: draft, open, paid, uncollectible, void", enum: ["draft", "open", "paid", "uncollectible", "void"] },
          },
          required: [],
        },
      },
      {
        name: "stripe_create_payment_link",
        description: "Create a Stripe payment link for a product",
        parameters: {
          type: "object",
          properties: {
            price_id: { type: "string", description: "Stripe price ID (starts with price_)" },
            quantity: { type: "number", description: "Quantity (default 1)" },
          },
          required: ["price_id"],
        },
      },
    ],
  },
  {
    id: "airtable",
    displayName: "Airtable",
    category: "crm",
    description: "Read and write records in Airtable bases and tables",
    icon: "airtable",
    envVar: "AIRTABLE_API_KEY",
    envVarLabel: "Personal Access Token",
    setupNote: "Create a token at airtable.com/create/tokens with data.records:read and data.records:write scopes",
    tools: [
      {
        name: "airtable_list_records",
        description: "List records from an Airtable table",
        parameters: {
          type: "object",
          properties: {
            base_id: { type: "string", description: "Airtable Base ID (starts with app)" },
            table_name: { type: "string", description: "Table name or ID" },
            max_records: { type: "number", description: "Max records to return (default 20)" },
            filter_formula: { type: "string", description: "Airtable formula to filter records" },
          },
          required: ["base_id", "table_name"],
        },
      },
      {
        name: "airtable_create_record",
        description: "Create a new record in an Airtable table",
        parameters: {
          type: "object",
          properties: {
            base_id: { type: "string", description: "Airtable Base ID" },
            table_name: { type: "string", description: "Table name" },
            fields: { type: "string", description: "JSON string of field values (e.g. {\"Name\": \"Alice\", \"Status\": \"Active\"})" },
          },
          required: ["base_id", "table_name", "fields"],
        },
      },
    ],
  },
  {
    id: "google_sheets",
    displayName: "Google Sheets",
    category: "google",
    description: "Read, write and append data to Google Sheets",
    icon: "google_sheets",
    envVar: "GOOGLE_SHEETS_SERVICE_KEY",
    envVarLabel: "Service Account JSON",
    setupNote: "Create a Service Account in Google Cloud Console, download the JSON key, share your spreadsheets with the service account email",
    tools: [
      {
        name: "sheets_read_range",
        description: "Read a range of cells from a Google Sheet",
        parameters: {
          type: "object",
          properties: {
            spreadsheet_id: { type: "string", description: "The Google Spreadsheet ID from the URL" },
            range: { type: "string", description: "A1 notation range (e.g. Sheet1!A1:D10)" },
          },
          required: ["spreadsheet_id", "range"],
        },
      },
      {
        name: "sheets_append_row",
        description: "Append a row to a Google Sheet",
        parameters: {
          type: "object",
          properties: {
            spreadsheet_id: { type: "string", description: "The Google Spreadsheet ID" },
            range: { type: "string", description: "Sheet name or range (e.g. Sheet1)" },
            values: { type: "string", description: "Comma-separated values for the new row" },
          },
          required: ["spreadsheet_id", "range", "values"],
        },
      },
    ],
  },
  {
    id: "gmail",
    displayName: "Gmail",
    category: "google",
    description: "Send emails, read inbox, and search messages via Gmail",
    icon: "gmail",
    envVar: "GOOGLE_OAUTH_TOKEN",
    envVarLabel: "OAuth Access Token",
    setupNote: "Gmail requires OAuth 2.0. Set up a Google Cloud OAuth app, complete the consent flow, and provide the access token.",
    tools: [
      {
        name: "gmail_send_email",
        description: "Send an email via Gmail",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient email address" },
            subject: { type: "string", description: "Email subject" },
            body: { type: "string", description: "Email body (plain text or HTML)" },
          },
          required: ["to", "subject", "body"],
        },
      },
      {
        name: "gmail_list_inbox",
        description: "List recent emails in the Gmail inbox",
        parameters: {
          type: "object",
          properties: {
            max_results: { type: "number", description: "Max emails to return (default 5)" },
            query: { type: "string", description: "Gmail search query (e.g. 'from:alice@example.com is:unread')" },
          },
          required: [],
        },
      },
    ],
  },
  {
    id: "google_calendar",
    displayName: "Google Calendar",
    category: "google",
    description: "List upcoming events and create calendar events",
    icon: "google_calendar",
    envVar: "GOOGLE_OAUTH_TOKEN",
    envVarLabel: "OAuth Access Token",
    setupNote: "Google Calendar requires OAuth 2.0. Provide a valid OAuth access token with calendar scope.",
    tools: [
      {
        name: "gcal_list_events",
        description: "List upcoming events from Google Calendar",
        parameters: {
          type: "object",
          properties: {
            max_results: { type: "number", description: "Max events to return (default 5)" },
            time_min: { type: "string", description: "Start time in ISO 8601 format (defaults to now)" },
          },
          required: [],
        },
      },
      {
        name: "gcal_create_event",
        description: "Create a new Google Calendar event",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Event title" },
            description: { type: "string", description: "Event description" },
            start: { type: "string", description: "Start time in ISO 8601 (e.g. 2024-03-15T10:00:00)" },
            end: { type: "string", description: "End time in ISO 8601" },
            attendees: { type: "string", description: "Comma-separated attendee emails" },
          },
          required: ["summary", "start", "end"],
        },
      },
    ],
  },
  {
    id: "outlook",
    displayName: "Outlook / Microsoft 365",
    category: "productivity",
    description: "Send emails and read calendar events via Microsoft Graph API",
    icon: "outlook",
    envVar: "MICROSOFT_GRAPH_TOKEN",
    envVarLabel: "OAuth Access Token",
    setupNote: "Register an Azure AD app, grant Mail.Send and Calendars.Read permissions, complete OAuth flow",
    tools: [
      {
        name: "outlook_send_email",
        description: "Send an email via Microsoft Outlook",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient email address" },
            subject: { type: "string", description: "Email subject" },
            body: { type: "string", description: "Email body (HTML or plain text)" },
          },
          required: ["to", "subject", "body"],
        },
      },
      {
        name: "outlook_list_calendar",
        description: "List upcoming calendar events from Outlook",
        parameters: {
          type: "object",
          properties: {
            top: { type: "number", description: "Number of events to return (default 5)" },
          },
          required: [],
        },
      },
    ],
  },
];

export function getIntegrationById(id: string): IntegrationDefinition | undefined {
  return INTEGRATION_CATALOG.find(i => i.id === id);
}

export function getToolsForIntegrations(integrationIds: string[]): IntegrationTool[] {
  const tools: IntegrationTool[] = [];
  for (const id of integrationIds) {
    const def = getIntegrationById(id);
    if (def) tools.push(...def.tools);
  }
  return tools;
}

export function isIntegrationAvailable(serviceId: string): boolean {
  const def = getIntegrationById(serviceId);
  if (!def) return false;
  return !!process.env[def.envVar];
}

export async function executeIntegrationTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const integration = INTEGRATION_CATALOG.find(i => i.tools.some(t => t.name === toolName));
  if (!integration) return JSON.stringify({ error: `Unknown integration tool: ${toolName}` });

  const apiKey = process.env[integration.envVar];
  if (!apiKey) {
    return JSON.stringify({
      error: `Integration '${integration.displayName}' is not configured. Please add ${integration.envVar} to your environment secrets.`,
      setup_instructions: integration.setupNote,
    });
  }

  try {
    return await routeIntegrationCall(integration.id, toolName, args, apiKey);
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}

async function routeIntegrationCall(
  integrationId: string,
  toolName: string,
  args: Record<string, unknown>,
  apiKey: string
): Promise<string> {
  switch (integrationId) {
    case "github": return executeGitHub(toolName, args, apiKey);
    case "linear": return executeLinear(toolName, args, apiKey);
    case "notion": return executeNotion(toolName, args, apiKey);
    case "slack": return executeSlack(toolName, args, apiKey);
    case "telegram": return executeTelegram(toolName, args, apiKey);
    case "hubspot": return executeHubSpot(toolName, args, apiKey);
    case "stripe": return executeStripe(toolName, args, apiKey);
    case "airtable": return executeAirtable(toolName, args, apiKey);
    case "google_sheets": return executeGoogleSheets(toolName, args, apiKey);
    case "gmail": return executeGmail(toolName, args, apiKey);
    case "google_calendar": return executeGoogleCalendar(toolName, args, apiKey);
    case "outlook": return executeOutlook(toolName, args, apiKey);
    default: return JSON.stringify({ error: `No executor for integration: ${integrationId}` });
  }
}

async function githubFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> || {}),
    },
  });
  return res.json();
}

async function executeGitHub(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  if (toolName === "github_list_repos") {
    const per_page = (args.per_page as number) || 10;
    const visibility = (args.visibility as string) || "all";
    const data = await githubFetch(`/user/repos?per_page=${per_page}&visibility=${visibility}&sort=updated`, token);
    const repos = (data as {name:string;full_name:string;description:string;stargazers_count:number;private:boolean}[]).map(r => ({
      name: r.full_name, description: r.description, stars: r.stargazers_count, private: r.private,
    }));
    return JSON.stringify({ repositories: repos, count: repos.length });
  }
  if (toolName === "github_list_issues") {
    const { owner, repo, state = "open", per_page = 10 } = args as Record<string, string | number>;
    const data = await githubFetch(`/repos/${owner}/${repo}/issues?state=${state}&per_page=${per_page}`, token);
    const issues = (data as {number:number;title:string;state:string;user:{login:string};created_at:string}[]).map(i => ({
      number: i.number, title: i.title, state: i.state, author: i.user.login, created_at: i.created_at,
    }));
    return JSON.stringify({ issues, count: issues.length });
  }
  if (toolName === "github_create_issue") {
    const { owner, repo, title, body, labels } = args as Record<string, string>;
    const labelList = labels ? labels.split(",").map(l => l.trim()) : undefined;
    const data = await githubFetch(`/repos/${owner}/${repo}/issues`, token, {
      method: "POST",
      body: JSON.stringify({ title, body, labels: labelList }),
    });
    const issue = data as { number: number; html_url: string; title: string };
    return JSON.stringify({ created: true, issue_number: issue.number, url: issue.html_url, title: issue.title });
  }
  if (toolName === "github_search_code") {
    const { query } = args as Record<string, string>;
    const data = await githubFetch(`/search/code?q=${encodeURIComponent(query)}&per_page=5`, token);
    const result = data as { total_count: number; items: {name:string;path:string;repository:{full_name:string}}[] };
    return JSON.stringify({ total: result.total_count, results: result.items.map(i => ({ file: i.name, path: i.path, repo: i.repository.full_name })) });
  }
  return JSON.stringify({ error: `Unknown GitHub tool: ${toolName}` });
}

async function executeLinear(toolName: string, args: Record<string, unknown>, apiKey: string): Promise<string> {
  const gql = async (query: string, variables?: Record<string, unknown>) => {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    return res.json() as Promise<{ data: unknown; errors?: unknown[] }>;
  };

  if (toolName === "linear_list_issues") {
    const { state, limit = 10 } = args as Record<string, unknown>;
    const filter = state ? `filter: { state: { name: { eq: "${state}" } } }` : "";
    const result = await gql(`{ issues(first: ${limit} ${filter}) { nodes { id title state { name } priority assignee { name } createdAt } } }`);
    const data = result.data as { issues: { nodes: {id:string;title:string;state:{name:string};priority:number;assignee:{name:string}|null;createdAt:string}[] } };
    return JSON.stringify({ issues: data.issues.nodes });
  }
  if (toolName === "linear_create_issue") {
    const { title, description, team_key, priority = 0 } = args as Record<string, unknown>;
    const teamResult = await gql(`{ teams { nodes { id key } } }`);
    const teams = (teamResult.data as { teams: { nodes: {id:string;key:string}[] } }).teams.nodes;
    const team = teams.find(t => t.key === team_key);
    if (!team) return JSON.stringify({ error: `Team not found: ${team_key}. Available: ${teams.map(t => t.key).join(", ")}` });
    const result = await gql(`mutation($title:String!,$desc:String,$teamId:String!,$priority:Int){issueCreate(input:{title:$title,description:$desc,teamId:$teamId,priority:$priority}){success issue{id title url}}}`, { title, desc: description, teamId: team.id, priority });
    const data = result.data as { issueCreate: { success: boolean; issue: { id: string; title: string; url: string } } };
    return JSON.stringify({ created: data.issueCreate.success, issue: data.issueCreate.issue });
  }
  return JSON.stringify({ error: `Unknown Linear tool: ${toolName}` });
}

async function executeNotion(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const notionFetch = async (path: string, options: RequestInit = {}) => {
    const res = await fetch(`https://api.notion.com/v1${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string> || {}),
      },
    });
    return res.json();
  };

  if (toolName === "notion_search") {
    const { query, filter_type } = args as Record<string, string>;
    const body: Record<string, unknown> = { query };
    if (filter_type) body.filter = { value: filter_type, property: "object" };
    const data = await notionFetch("/search", { method: "POST", body: JSON.stringify(body) }) as { results: {id:string;object:string;url:string;properties?:{title?:{title:{plain_text:string}[]}}}[] };
    const results = data.results.map(r => ({
      id: r.id, type: r.object, url: r.url,
      title: r.properties?.title?.title?.[0]?.plain_text || "(untitled)",
    }));
    return JSON.stringify({ results, count: results.length });
  }
  if (toolName === "notion_get_page") {
    const { page_id } = args as Record<string, string>;
    const page = await notionFetch(`/pages/${page_id}`) as { id: string; url: string; properties: Record<string, unknown> };
    const blocks = await notionFetch(`/blocks/${page_id}/children`) as { results: {type:string;[key:string]:unknown}[] };
    const text = blocks.results.map(b => {
      const block = b[b.type] as { rich_text?: { plain_text: string }[] } | undefined;
      return block?.rich_text?.map((t: { plain_text: string }) => t.plain_text).join("") || "";
    }).filter(Boolean).join("\n");
    return JSON.stringify({ id: page.id, url: page.url, content: text.slice(0, 3000) });
  }
  if (toolName === "notion_create_page") {
    const { parent_id, title, content } = args as Record<string, string>;
    const body = {
      parent: { page_id: parent_id },
      properties: { title: { title: [{ type: "text", text: { content: title } }] } },
      children: content ? [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content } }] } }] : [],
    };
    const page = await notionFetch("/pages", { method: "POST", body: JSON.stringify(body) }) as { id: string; url: string };
    return JSON.stringify({ created: true, id: page.id, url: page.url });
  }
  return JSON.stringify({ error: `Unknown Notion tool: ${toolName}` });
}

async function executeSlack(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const slackFetch = async (method: string, params: Record<string, unknown>) => {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json() as Promise<{ ok: boolean; error?: string; [key: string]: unknown }>;
  };

  if (toolName === "slack_send_message") {
    const { channel, text } = args as Record<string, string>;
    const result = await slackFetch("chat.postMessage", { channel, text });
    return result.ok
      ? JSON.stringify({ sent: true, channel, ts: result.ts })
      : JSON.stringify({ error: result.error });
  }
  if (toolName === "slack_list_channels") {
    const limit = (args.limit as number) || 20;
    const result = await slackFetch("conversations.list", { limit, types: "public_channel,private_channel" });
    const channels = (result.channels as {id:string;name:string;num_members:number}[] || []).map(c => ({
      id: c.id, name: c.name, members: c.num_members,
    }));
    return JSON.stringify({ channels, count: channels.length });
  }
  if (toolName === "slack_get_messages") {
    const { channel, limit = 10 } = args as Record<string, unknown>;
    const result = await slackFetch("conversations.history", { channel, limit });
    const messages = (result.messages as {text:string;user:string;ts:string}[] || []).map(m => ({
      text: m.text, user: m.user, ts: m.ts,
    }));
    return JSON.stringify({ messages, count: messages.length });
  }
  return JSON.stringify({ error: `Unknown Slack tool: ${toolName}` });
}

async function executeTelegram(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  if (toolName === "telegram_send_message") {
    const { chat_id, text, parse_mode } = args as Record<string, string>;
    const body: Record<string, unknown> = { chat_id, text };
    if (parse_mode) body.parse_mode = parse_mode;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await res.json() as { ok: boolean; description?: string };
    return result.ok
      ? JSON.stringify({ sent: true, chat_id })
      : JSON.stringify({ error: result.description });
  }
  return JSON.stringify({ error: `Unknown Telegram tool: ${toolName}` });
}

async function executeHubSpot(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const hsGet = async (path: string) => {
    const res = await fetch(`https://api.hubapi.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  };
  const hsPost = async (path: string, body: unknown) => {
    const res = await fetch(`https://api.hubapi.com${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  if (toolName === "hubspot_list_contacts") {
    const { limit = 10, search } = args as Record<string, unknown>;
    let data: unknown;
    if (search) {
      data = await hsPost("/crm/v3/objects/contacts/search", { query: search, limit });
    } else {
      data = await hsGet(`/crm/v3/objects/contacts?limit=${limit}&properties=email,firstname,lastname,phone`);
    }
    const contacts = ((data as { results: { id: string; properties: Record<string, string> }[] })?.results || []).map(c => ({
      id: c.id, email: c.properties.email, name: `${c.properties.firstname || ""} ${c.properties.lastname || ""}`.trim(), phone: c.properties.phone,
    }));
    return JSON.stringify({ contacts, count: contacts.length });
  }
  if (toolName === "hubspot_create_contact") {
    const { email, firstname, lastname, phone, company } = args as Record<string, string>;
    const data = await hsPost("/crm/v3/objects/contacts", { properties: { email, firstname, lastname, phone, company } }) as { id: string };
    return JSON.stringify({ created: true, id: data.id });
  }
  if (toolName === "hubspot_create_deal") {
    const { dealname, amount, dealstage = "appointmentscheduled" } = args as Record<string, string>;
    const data = await hsPost("/crm/v3/objects/deals", { properties: { dealname, amount, dealstage } }) as { id: string };
    return JSON.stringify({ created: true, id: data.id, dealname });
  }
  return JSON.stringify({ error: `Unknown HubSpot tool: ${toolName}` });
}

async function executeStripe(toolName: string, args: Record<string, unknown>, secretKey: string): Promise<string> {
  const stripeFetch = async (path: string, method = "GET", body?: Record<string, string>) => {
    const res = await fetch(`https://api.stripe.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body ? new URLSearchParams(body).toString() : undefined,
    });
    return res.json();
  };

  if (toolName === "stripe_list_customers") {
    const limit = (args.limit as number) || 10;
    const email = args.email as string | undefined;
    const path = email ? `/customers?limit=${limit}&email=${encodeURIComponent(email)}` : `/customers?limit=${limit}`;
    const data = await stripeFetch(path) as { data: {id:string;email:string;name:string;created:number}[] };
    return JSON.stringify({ customers: data.data.map(c => ({ id: c.id, email: c.email, name: c.name })) });
  }
  if (toolName === "stripe_list_invoices") {
    const limit = (args.limit as number) || 10;
    const status = args.status as string | undefined;
    const path = status ? `/invoices?limit=${limit}&status=${status}` : `/invoices?limit=${limit}`;
    const data = await stripeFetch(path) as { data: {id:string;status:string;amount_due:number;customer_email:string;created:number}[] };
    return JSON.stringify({ invoices: data.data.map(i => ({ id: i.id, status: i.status, amount_due: i.amount_due / 100, customer_email: i.customer_email })) });
  }
  if (toolName === "stripe_create_payment_link") {
    const price_id = args.price_id as string;
    const quantity = (args.quantity as number) || 1;
    const data = await stripeFetch("/payment_links", "POST", { "line_items[0][price]": price_id, "line_items[0][quantity]": String(quantity) }) as { id: string; url: string };
    return JSON.stringify({ created: true, payment_link: data.url, id: data.id });
  }
  return JSON.stringify({ error: `Unknown Stripe tool: ${toolName}` });
}

async function executeAirtable(toolName: string, args: Record<string, unknown>, apiKey: string): Promise<string> {
  const atFetch = async (path: string, options: RequestInit = {}) => {
    const res = await fetch(`https://api.airtable.com/v0${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string> || {}),
      },
    });
    return res.json();
  };

  if (toolName === "airtable_list_records") {
    const { base_id, table_name, max_records = 20, filter_formula } = args as Record<string, unknown>;
    let path = `/${base_id}/${table_name}?maxRecords=${max_records}`;
    if (filter_formula) path += `&filterByFormula=${encodeURIComponent(filter_formula as string)}`;
    const data = await atFetch(path) as { records: {id:string;fields:Record<string,unknown>}[] };
    return JSON.stringify({ records: data.records.map(r => ({ id: r.id, fields: r.fields })), count: data.records.length });
  }
  if (toolName === "airtable_create_record") {
    const { base_id, table_name, fields } = args as Record<string, string>;
    let parsedFields: Record<string, unknown>;
    try { parsedFields = JSON.parse(fields); } catch { return JSON.stringify({ error: "Invalid fields JSON" }); }
    const data = await atFetch(`/${base_id}/${table_name}`, {
      method: "POST",
      body: JSON.stringify({ records: [{ fields: parsedFields }] }),
    }) as { records: {id:string}[] };
    return JSON.stringify({ created: true, id: data.records[0]?.id });
  }
  return JSON.stringify({ error: `Unknown Airtable tool: ${toolName}` });
}

async function executeGoogleSheets(toolName: string, args: Record<string, unknown>, serviceKey: string): Promise<string> {
  let creds: { client_email: string; private_key: string };
  try { creds = JSON.parse(serviceKey); } catch {
    return JSON.stringify({ error: "Invalid GOOGLE_SHEETS_SERVICE_KEY — must be a JSON service account key" });
  }
  const getToken = async () => {
    const jwt = await buildGoogleJWT(creds.client_email, creds.private_key, "https://www.googleapis.com/auth/spreadsheets");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString(),
    });
    const data = await res.json() as { access_token: string };
    return data.access_token;
  };

  const token = await getToken();
  const headers = { Authorization: `Bearer ${token}` };

  if (toolName === "sheets_read_range") {
    const { spreadsheet_id, range } = args as Record<string, string>;
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(range)}`, { headers });
    const data = await res.json() as { values?: string[][] };
    return JSON.stringify({ range, values: data.values || [], rows: (data.values || []).length });
  }
  if (toolName === "sheets_append_row") {
    const { spreadsheet_id, range, values } = args as Record<string, string>;
    const rowValues = values.split(",").map(v => v.trim());
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [rowValues] }),
    });
    const data = await res.json() as { updates?: { updatedRows: number } };
    return JSON.stringify({ appended: true, rows_updated: data.updates?.updatedRows });
  }
  return JSON.stringify({ error: `Unknown Google Sheets tool: ${toolName}` });
}

async function buildGoogleJWT(clientEmail: string, privateKey: string, scope: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({ iss: clientEmail, scope, aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signingInput = `${header}.${payload}`;

  const keyData = privateKey.replace(/-----.*?-----/g, "").replace(/\s/g, "");
  const binaryKey = Buffer.from(keyData, "base64");

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, Buffer.from(signingInput));
  const sig = Buffer.from(signature).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${signingInput}.${sig}`;
}

async function executeGmail(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  if (toolName === "gmail_send_email") {
    const { to, subject, body } = args as Record<string, string>;
    const raw = btoa(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`)
      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", headers, body: JSON.stringify({ raw }),
    });
    const data = await res.json() as { id?: string; error?: { message: string } };
    return data.id ? JSON.stringify({ sent: true, id: data.id }) : JSON.stringify({ error: data.error?.message });
  }
  if (toolName === "gmail_list_inbox") {
    const maxResults = (args.max_results as number) || 5;
    const q = (args.query as string) || "";
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}`, { headers });
    const listData = await listRes.json() as { messages?: { id: string }[] };
    if (!listData.messages?.length) return JSON.stringify({ messages: [], count: 0 });
    const msgs = await Promise.all(listData.messages.map(async m => {
      const mRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, { headers });
      const mData = await mRes.json() as { id: string; snippet: string; payload: { headers: { name: string; value: string }[] } };
      const from = mData.payload.headers.find(h => h.name === "From")?.value || "";
      const subject = mData.payload.headers.find(h => h.name === "Subject")?.value || "";
      return { id: mData.id, from, subject, snippet: mData.snippet };
    }));
    return JSON.stringify({ messages: msgs, count: msgs.length });
  }
  return JSON.stringify({ error: `Unknown Gmail tool: ${toolName}` });
}

async function executeGoogleCalendar(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  if (toolName === "gcal_list_events") {
    const maxResults = (args.max_results as number) || 5;
    const timeMin = (args.time_min as string) || new Date().toISOString();
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${maxResults}&timeMin=${encodeURIComponent(timeMin)}&orderBy=startTime&singleEvents=true`, { headers });
    const data = await res.json() as { items?: {id:string;summary:string;start:{dateTime?:string;date?:string};location?:string}[] };
    const events = (data.items || []).map(e => ({ id: e.id, title: e.summary, start: e.start.dateTime || e.start.date, location: e.location }));
    return JSON.stringify({ events, count: events.length });
  }
  if (toolName === "gcal_create_event") {
    const { summary, description, start, end, attendees } = args as Record<string, string>;
    const attendeeList = attendees ? attendees.split(",").map(a => ({ email: a.trim() })) : [];
    const body = {
      summary, description,
      start: { dateTime: start, timeZone: "UTC" },
      end: { dateTime: end, timeZone: "UTC" },
      attendees: attendeeList,
    };
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST", headers, body: JSON.stringify(body),
    });
    const event = await res.json() as { id: string; htmlLink: string; summary: string };
    return JSON.stringify({ created: true, id: event.id, link: event.htmlLink, title: event.summary });
  }
  return JSON.stringify({ error: `Unknown Google Calendar tool: ${toolName}` });
}

async function executeOutlook(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  if (toolName === "outlook_send_email") {
    const { to, subject, body } = args as Record<string, string>;
    const msgBody = {
      message: {
        subject,
        body: { contentType: "Text", content: body },
        toRecipients: [{ emailAddress: { address: to } }],
      },
    };
    await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST", headers, body: JSON.stringify(msgBody),
    });
    return JSON.stringify({ sent: true, to, subject });
  }
  if (toolName === "outlook_list_calendar") {
    const top = (args.top as number) || 5;
    const now = new Date().toISOString();
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now}&endDateTime=${new Date(Date.now() + 30 * 86400000).toISOString()}&$top=${top}&$orderby=start/dateTime`, { headers });
    const data = await res.json() as { value?: {id:string;subject:string;start:{dateTime:string};location:{displayName:string}}[] };
    const events = (data.value || []).map(e => ({ id: e.id, subject: e.subject, start: e.start.dateTime, location: e.location?.displayName }));
    return JSON.stringify({ events, count: events.length });
  }
  return JSON.stringify({ error: `Unknown Outlook tool: ${toolName}` });
}
