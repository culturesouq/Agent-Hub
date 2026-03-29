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
  category: "google" | "microsoft" | "dev" | "productivity" | "crm" | "finance" | "communication";
  description: string;
  icon: string;
  envVar: string;
  envVarLabel: string;
  setupNote: string;
  tools: IntegrationTool[];
}

export const INTEGRATION_CATALOG: IntegrationDefinition[] = [
  // ─── Google ─────────────────────────────────────────────────────────────────
  {
    id: "gmail",
    displayName: "Gmail",
    category: "google",
    description: "Send emails, read inbox, and search messages via Gmail",
    icon: "gmail",
    envVar: "GOOGLE_OAUTH_TOKEN",
    envVarLabel: "Google OAuth Access Token",
    setupNote: "Create a Google Cloud OAuth app, grant Gmail scopes (gmail.send, gmail.readonly), complete the consent flow, and paste the access token.",
    tools: [
      { name: "gmail_send_email", description: "Send an email via Gmail", parameters: { type: "object", properties: { to: { type: "string", description: "Recipient email address" }, subject: { type: "string", description: "Email subject" }, body: { type: "string", description: "Email body (plain text or HTML)" } }, required: ["to", "subject", "body"] } },
      { name: "gmail_list_inbox", description: "List recent emails in Gmail inbox", parameters: { type: "object", properties: { max_results: { type: "number", description: "Max emails to return (default 5)" }, query: { type: "string", description: "Gmail search query (e.g. 'from:alice@example.com is:unread')" } }, required: [] } },
    ],
  },
  {
    id: "google_calendar",
    displayName: "Google Calendar",
    category: "google",
    description: "List upcoming events and create calendar events",
    icon: "google_calendar",
    envVar: "GOOGLE_OAUTH_TOKEN",
    envVarLabel: "Google OAuth Access Token",
    setupNote: "Create a Google Cloud OAuth app, grant Calendar scopes, complete the consent flow, and paste the access token.",
    tools: [
      { name: "gcal_list_events", description: "List upcoming events from Google Calendar", parameters: { type: "object", properties: { max_results: { type: "number", description: "Max events (default 5)" }, time_min: { type: "string", description: "Start time ISO 8601 (defaults to now)" } }, required: [] } },
      { name: "gcal_create_event", description: "Create a new Google Calendar event", parameters: { type: "object", properties: { summary: { type: "string", description: "Event title" }, description: { type: "string", description: "Event description" }, start: { type: "string", description: "Start ISO 8601 (e.g. 2024-03-15T10:00:00)" }, end: { type: "string", description: "End ISO 8601" }, attendees: { type: "string", description: "Comma-separated attendee emails" } }, required: ["summary", "start", "end"] } },
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
    setupNote: "Create a Service Account in Google Cloud Console, download the JSON key, and share your spreadsheets with the service account email.",
    tools: [
      { name: "sheets_read_range", description: "Read a range of cells from a Google Sheet", parameters: { type: "object", properties: { spreadsheet_id: { type: "string", description: "Google Spreadsheet ID from the URL" }, range: { type: "string", description: "A1 notation range (e.g. Sheet1!A1:D10)" } }, required: ["spreadsheet_id", "range"] } },
      { name: "sheets_append_row", description: "Append a row to a Google Sheet", parameters: { type: "object", properties: { spreadsheet_id: { type: "string", description: "Google Spreadsheet ID" }, range: { type: "string", description: "Sheet name or range (e.g. Sheet1)" }, values: { type: "string", description: "Comma-separated values for the new row" } }, required: ["spreadsheet_id", "range", "values"] } },
    ],
  },
  {
    id: "google_drive",
    displayName: "Google Drive",
    category: "google",
    description: "Search, list, and read files in Google Drive",
    icon: "google_drive",
    envVar: "GOOGLE_OAUTH_TOKEN",
    envVarLabel: "Google OAuth Access Token",
    setupNote: "Create a Google Cloud OAuth app, grant Drive scopes (drive.readonly), complete the consent flow, and paste the access token.",
    tools: [
      { name: "gdrive_list_files", description: "List files in Google Drive", parameters: { type: "object", properties: { query: { type: "string", description: "Drive search query (e.g. mimeType='application/pdf')" }, max_results: { type: "number", description: "Max files (default 10)" }, folder_id: { type: "string", description: "Folder ID to list files in (optional)" } }, required: [] } },
      { name: "gdrive_get_file", description: "Get metadata or text content of a Drive file", parameters: { type: "object", properties: { file_id: { type: "string", description: "Google Drive file ID" }, export_as_text: { type: "string", description: "Export Google Doc/Sheet as text: yes/no", enum: ["yes", "no"] } }, required: ["file_id"] } },
    ],
  },
  {
    id: "google_docs",
    displayName: "Google Docs",
    category: "google",
    description: "Read, create, and update Google Docs documents",
    icon: "google_docs",
    envVar: "GOOGLE_OAUTH_TOKEN",
    envVarLabel: "Google OAuth Access Token",
    setupNote: "Create a Google Cloud OAuth app, grant Docs scopes, complete the consent flow, and paste the access token.",
    tools: [
      { name: "gdocs_get_document", description: "Get the content of a Google Docs document", parameters: { type: "object", properties: { document_id: { type: "string", description: "Google Docs document ID from the URL" } }, required: ["document_id"] } },
      { name: "gdocs_create_document", description: "Create a new Google Docs document", parameters: { type: "object", properties: { title: { type: "string", description: "Document title" }, content: { type: "string", description: "Initial content (plain text)" } }, required: ["title"] } },
      { name: "gdocs_append_text", description: "Append text to an existing Google Doc", parameters: { type: "object", properties: { document_id: { type: "string", description: "Document ID" }, text: { type: "string", description: "Text to append" } }, required: ["document_id", "text"] } },
    ],
  },
  // ─── Microsoft ───────────────────────────────────────────────────────────────
  {
    id: "outlook",
    displayName: "Microsoft Outlook",
    category: "microsoft",
    description: "Send emails and read calendar events via Microsoft 365",
    icon: "outlook",
    envVar: "MICROSOFT_GRAPH_TOKEN",
    envVarLabel: "Microsoft Graph OAuth Token",
    setupNote: "Register an Azure AD app, grant Mail.Send + Calendars.Read permissions, complete the OAuth flow, and paste the access token.",
    tools: [
      { name: "outlook_send_email", description: "Send an email via Microsoft Outlook", parameters: { type: "object", properties: { to: { type: "string", description: "Recipient email" }, subject: { type: "string", description: "Email subject" }, body: { type: "string", description: "Email body (HTML or text)" } }, required: ["to", "subject", "body"] } },
      { name: "outlook_list_calendar", description: "List upcoming calendar events from Outlook", parameters: { type: "object", properties: { top: { type: "number", description: "Number of events (default 5)" } }, required: [] } },
    ],
  },
  {
    id: "onedrive",
    displayName: "Microsoft OneDrive",
    category: "microsoft",
    description: "List, read, and access files in Microsoft OneDrive",
    icon: "onedrive",
    envVar: "MICROSOFT_GRAPH_TOKEN",
    envVarLabel: "Microsoft Graph OAuth Token",
    setupNote: "Register an Azure AD app, grant Files.Read permissions, complete the OAuth flow, and paste the access token.",
    tools: [
      { name: "onedrive_list_files", description: "List files in OneDrive", parameters: { type: "object", properties: { folder_path: { type: "string", description: "Folder path (e.g. /Documents), defaults to root" }, top: { type: "number", description: "Max files (default 10)" } }, required: [] } },
      { name: "onedrive_get_file", description: "Get metadata or download URL for a OneDrive file", parameters: { type: "object", properties: { item_id: { type: "string", description: "OneDrive item ID" } }, required: ["item_id"] } },
    ],
  },
  {
    id: "sharepoint",
    displayName: "SharePoint Online",
    category: "microsoft",
    description: "List sites, libraries, and documents in SharePoint",
    icon: "sharepoint",
    envVar: "MICROSOFT_GRAPH_TOKEN",
    envVarLabel: "Microsoft Graph OAuth Token",
    setupNote: "Register an Azure AD app, grant Sites.Read.All permissions, complete the OAuth flow, and paste the access token.",
    tools: [
      { name: "sharepoint_list_sites", description: "List SharePoint Online sites", parameters: { type: "object", properties: { top: { type: "number", description: "Max sites (default 10)" } }, required: [] } },
      { name: "sharepoint_list_documents", description: "List documents in a SharePoint library", parameters: { type: "object", properties: { site_id: { type: "string", description: "SharePoint site ID" }, drive_id: { type: "string", description: "Document library drive ID (optional)" }, top: { type: "number", description: "Max documents (default 10)" } }, required: ["site_id"] } },
    ],
  },
  // ─── Developer Tools ─────────────────────────────────────────────────────────
  {
    id: "github",
    displayName: "GitHub",
    category: "dev",
    description: "List repos, create/search issues, check PRs and code",
    icon: "github",
    envVar: "GITHUB_TOKEN",
    envVarLabel: "Personal Access Token",
    setupNote: "Go to github.com/settings/tokens → Generate new token → select repo scope.",
    tools: [
      { name: "github_list_repos", description: "List GitHub repositories for the authenticated user", parameters: { type: "object", properties: { per_page: { type: "number", description: "Number of repos (default 10)" }, visibility: { type: "string", description: "Filter: all, public, private", enum: ["all", "public", "private"] } }, required: [] } },
      { name: "github_list_issues", description: "List issues in a GitHub repository", parameters: { type: "object", properties: { owner: { type: "string", description: "Repository owner" }, repo: { type: "string", description: "Repository name" }, state: { type: "string", description: "Filter: open, closed, all", enum: ["open", "closed", "all"] }, per_page: { type: "number", description: "Number of issues (default 10)" } }, required: ["owner", "repo"] } },
      { name: "github_create_issue", description: "Create a new issue in a GitHub repository", parameters: { type: "object", properties: { owner: { type: "string", description: "Repository owner" }, repo: { type: "string", description: "Repository name" }, title: { type: "string", description: "Issue title" }, body: { type: "string", description: "Issue description (markdown)" }, labels: { type: "string", description: "Comma-separated label names" } }, required: ["owner", "repo", "title"] } },
      { name: "github_search_code", description: "Search for code across GitHub repositories", parameters: { type: "object", properties: { query: { type: "string", description: "Search query (e.g. 'useState repo:facebook/react')" } }, required: ["query"] } },
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
    setupNote: "Go to Linear → Settings → API → Personal API keys → Create key.",
    tools: [
      { name: "linear_list_issues", description: "List issues from Linear", parameters: { type: "object", properties: { team_key: { type: "string", description: "Team key to filter (optional)" }, state: { type: "string", description: "Filter by state name (e.g. Todo, In Progress)" }, limit: { type: "number", description: "Number of issues (default 10)" } }, required: [] } },
      { name: "linear_create_issue", description: "Create a new issue in Linear", parameters: { type: "object", properties: { title: { type: "string", description: "Issue title" }, description: { type: "string", description: "Issue description (markdown)" }, team_key: { type: "string", description: "Team key (e.g. ENG)" }, priority: { type: "number", description: "Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low" } }, required: ["title", "team_key"] } },
    ],
  },
  // ─── Productivity ────────────────────────────────────────────────────────────
  {
    id: "notion",
    displayName: "Notion",
    category: "productivity",
    description: "Search pages, read content, create and update pages",
    icon: "notion",
    envVar: "NOTION_TOKEN",
    envVarLabel: "Integration Token",
    setupNote: "Go to notion.so/my-integrations → New integration → Copy the token. Share your pages with the integration.",
    tools: [
      { name: "notion_search", description: "Search for pages and databases in Notion", parameters: { type: "object", properties: { query: { type: "string", description: "Search query" }, filter_type: { type: "string", description: "Filter by type: page or database", enum: ["page", "database"] } }, required: ["query"] } },
      { name: "notion_get_page", description: "Get the content of a Notion page by ID", parameters: { type: "object", properties: { page_id: { type: "string", description: "Notion page ID" } }, required: ["page_id"] } },
      { name: "notion_create_page", description: "Create a new page in a Notion database", parameters: { type: "object", properties: { parent_id: { type: "string", description: "Parent page or database ID" }, title: { type: "string", description: "Page title" }, content: { type: "string", description: "Page content in plain text" } }, required: ["parent_id", "title"] } },
    ],
  },
  {
    id: "airtable",
    displayName: "Airtable",
    category: "productivity",
    description: "Read and write records in Airtable bases and tables",
    icon: "airtable",
    envVar: "AIRTABLE_API_KEY",
    envVarLabel: "Personal Access Token",
    setupNote: "Go to airtable.com/create/tokens → Create token with data.records:read + data.records:write scopes.",
    tools: [
      { name: "airtable_list_records", description: "List records from an Airtable table", parameters: { type: "object", properties: { base_id: { type: "string", description: "Airtable Base ID (starts with app)" }, table_name: { type: "string", description: "Table name or ID" }, max_records: { type: "number", description: "Max records (default 20)" }, filter_formula: { type: "string", description: "Airtable formula to filter records" } }, required: ["base_id", "table_name"] } },
      { name: "airtable_create_record", description: "Create a new record in an Airtable table", parameters: { type: "object", properties: { base_id: { type: "string", description: "Airtable Base ID" }, table_name: { type: "string", description: "Table name" }, fields: { type: "string", description: "JSON string of field values" } }, required: ["base_id", "table_name", "fields"] } },
    ],
  },
  // ─── CRM ─────────────────────────────────────────────────────────────────────
  {
    id: "hubspot",
    displayName: "HubSpot",
    category: "crm",
    description: "Manage contacts, deals, and companies in HubSpot CRM",
    icon: "hubspot",
    envVar: "HUBSPOT_API_KEY",
    envVarLabel: "Private App Token",
    setupNote: "HubSpot → Settings → Integrations → Private Apps → Create private app. Grant CRM scopes.",
    tools: [
      { name: "hubspot_list_contacts", description: "List contacts from HubSpot CRM", parameters: { type: "object", properties: { limit: { type: "number", description: "Number of contacts (default 10)" }, search: { type: "string", description: "Search query" } }, required: [] } },
      { name: "hubspot_create_contact", description: "Create a new contact in HubSpot", parameters: { type: "object", properties: { email: { type: "string", description: "Email address" }, firstname: { type: "string", description: "First name" }, lastname: { type: "string", description: "Last name" }, phone: { type: "string", description: "Phone number" }, company: { type: "string", description: "Company name" } }, required: ["email"] } },
      { name: "hubspot_create_deal", description: "Create a new deal in HubSpot", parameters: { type: "object", properties: { dealname: { type: "string", description: "Deal name" }, amount: { type: "string", description: "Deal amount in USD" }, dealstage: { type: "string", description: "Deal stage" } }, required: ["dealname"] } },
    ],
  },
  {
    id: "linkedin",
    displayName: "LinkedIn",
    category: "crm",
    description: "Post updates, read profile, and send messages via LinkedIn",
    icon: "linkedin",
    envVar: "LINKEDIN_ACCESS_TOKEN",
    envVarLabel: "OAuth 2.0 Access Token",
    setupNote: "Create a LinkedIn app at developer.linkedin.com, request r_liteprofile + w_member_social permissions, complete the OAuth flow, and paste the access token.",
    tools: [
      { name: "linkedin_get_profile", description: "Get the authenticated user's LinkedIn profile", parameters: { type: "object", properties: {}, required: [] } },
      { name: "linkedin_create_post", description: "Create a text post on LinkedIn", parameters: { type: "object", properties: { text: { type: "string", description: "Post content" }, visibility: { type: "string", description: "Post visibility: PUBLIC or CONNECTIONS", enum: ["PUBLIC", "CONNECTIONS"] } }, required: ["text"] } },
    ],
  },
  // ─── Finance ─────────────────────────────────────────────────────────────────
  {
    id: "stripe",
    displayName: "Stripe",
    category: "finance",
    description: "List customers, invoices, and create payment links",
    icon: "stripe",
    envVar: "STRIPE_SECRET_KEY",
    envVarLabel: "Secret Key",
    setupNote: "Stripe Dashboard → Developers → API keys → Copy Secret key.",
    tools: [
      { name: "stripe_list_customers", description: "List customers in Stripe", parameters: { type: "object", properties: { limit: { type: "number", description: "Number of customers (default 10)" }, email: { type: "string", description: "Filter by email" } }, required: [] } },
      { name: "stripe_list_invoices", description: "List invoices in Stripe", parameters: { type: "object", properties: { limit: { type: "number", description: "Number of invoices (default 10)" }, status: { type: "string", description: "Filter: draft, open, paid, uncollectible, void", enum: ["draft", "open", "paid", "uncollectible", "void"] } }, required: [] } },
      { name: "stripe_create_payment_link", description: "Create a Stripe payment link", parameters: { type: "object", properties: { price_id: { type: "string", description: "Stripe price ID (starts with price_)" }, quantity: { type: "number", description: "Quantity (default 1)" } }, required: ["price_id"] } },
    ],
  },
  // ─── Communication ───────────────────────────────────────────────────────────
  {
    id: "slack",
    displayName: "Slack",
    category: "communication",
    description: "Send messages, list channels, read conversations",
    icon: "slack",
    envVar: "SLACK_BOT_TOKEN",
    envVarLabel: "Bot Token",
    setupNote: "Create a Slack app at api.slack.com → OAuth & Permissions → Add chat:write + channels:read scopes → Install to workspace.",
    tools: [
      { name: "slack_send_message", description: "Send a message to a Slack channel", parameters: { type: "object", properties: { channel: { type: "string", description: "Channel name (#general) or user ID" }, text: { type: "string", description: "Message text" } }, required: ["channel", "text"] } },
      { name: "slack_list_channels", description: "List channels in the Slack workspace", parameters: { type: "object", properties: { limit: { type: "number", description: "Max channels (default 20)" } }, required: [] } },
      { name: "slack_get_messages", description: "Get recent messages from a Slack channel", parameters: { type: "object", properties: { channel: { type: "string", description: "Channel ID or name" }, limit: { type: "number", description: "Number of messages (default 10)" } }, required: ["channel"] } },
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
    setupNote: "Create a bot via @BotFather on Telegram → copy the token it gives you.",
    tools: [
      { name: "telegram_send_message", description: "Send a text message via Telegram bot", parameters: { type: "object", properties: { chat_id: { type: "string", description: "Telegram chat ID or @username" }, text: { type: "string", description: "Message text (HTML or Markdown)" }, parse_mode: { type: "string", description: "Formatting: Markdown or HTML", enum: ["Markdown", "HTML"] } }, required: ["chat_id", "text"] } },
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

export async function testIntegrationConnection(serviceId: string): Promise<{ success: boolean; message: string }> {
  const def = getIntegrationById(serviceId);
  if (!def) return { success: false, message: "Unknown integration" };

  const token = process.env[def.envVar];
  if (!token) {
    return { success: false, message: `${def.envVar} is not set. ${def.setupNote}` };
  }

  return probeIntegration(serviceId, token);
}

async function probeIntegration(serviceId: string, token: string): Promise<{ success: boolean; message: string }> {
  try {
    switch (serviceId) {
      case "github": {
        const r = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
        const d = await r.json() as { login?: string; message?: string };
        return r.ok ? { success: true, message: `Connected as @${d.login}` } : { success: false, message: d.message || "Auth failed" };
      }
      case "linear": {
        const r = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { Authorization: token, "Content-Type": "application/json" }, body: JSON.stringify({ query: "{ viewer { name email } }" }) });
        const d = await r.json() as { data?: { viewer?: { name: string } } };
        return d.data?.viewer ? { success: true, message: `Connected as ${d.data.viewer.name}` } : { success: false, message: "Auth failed" };
      }
      case "notion": {
        const r = await fetch("https://api.notion.com/v1/users/me", { headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" } });
        const d = await r.json() as { name?: string; message?: string };
        return r.ok ? { success: true, message: `Connected as ${d.name || "Notion user"}` } : { success: false, message: d.message || "Auth failed" };
      }
      case "slack": {
        const r = await fetch("https://slack.com/api/auth.test", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
        const d = await r.json() as { ok: boolean; user?: string; error?: string };
        return d.ok ? { success: true, message: `Connected as ${d.user}` } : { success: false, message: d.error || "Auth failed" };
      }
      case "telegram": {
        const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const d = await r.json() as { ok: boolean; result?: { username: string }; description?: string };
        return d.ok ? { success: true, message: `Bot: @${d.result?.username}` } : { success: false, message: d.description || "Auth failed" };
      }
      case "hubspot": {
        const r = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", { headers: { Authorization: `Bearer ${token}` } });
        return r.ok ? { success: true, message: "HubSpot CRM connected" } : { success: false, message: `HTTP ${r.status}` };
      }
      case "stripe": {
        const r = await fetch("https://api.stripe.com/v1/customers?limit=1", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json() as { object?: string; error?: { message: string } };
        return r.ok ? { success: true, message: "Stripe connected" } : { success: false, message: d.error?.message || "Auth failed" };
      }
      case "airtable": {
        const r = await fetch("https://api.airtable.com/v0/meta/bases", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json() as { bases?: unknown[]; error?: { message: string } };
        return r.ok ? { success: true, message: `Airtable connected — ${d.bases?.length ?? 0} base(s)` } : { success: false, message: d.error?.message || "Auth failed" };
      }
      case "linkedin": {
        const r = await fetch("https://api.linkedin.com/v2/me", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json() as { localizedFirstName?: string; localizedLastName?: string; message?: string };
        return r.ok ? { success: true, message: `Connected as ${d.localizedFirstName} ${d.localizedLastName}` } : { success: false, message: d.message || "Auth failed" };
      }
      case "gmail":
      case "google_calendar":
      case "google_drive":
      case "google_docs": {
        const r = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(token)}`);
        const d = await r.json() as { email?: string; error?: string; expires_in?: number };
        return d.email ? { success: true, message: `Google connected (${d.email})` } : { success: false, message: d.error || "Token invalid or expired" };
      }
      case "google_sheets": {
        if (token.startsWith("{")) {
          return { success: true, message: "Service account key present — connection will be tested on first use" };
        }
        const r = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(token)}`);
        const d = await r.json() as { email?: string; error?: string };
        return d.email ? { success: true, message: `Google connected (${d.email})` } : { success: false, message: d.error || "Token invalid" };
      }
      case "outlook":
      case "onedrive":
      case "sharepoint": {
        const r = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json() as { displayName?: string; userPrincipalName?: string; error?: { message: string } };
        return r.ok ? { success: true, message: `Connected as ${d.displayName || d.userPrincipalName}` } : { success: false, message: d.error?.message || "Auth failed" };
      }
      default:
        return { success: true, message: "Token present — connection not specifically tested" };
    }
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

export async function executeIntegrationTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const integration = INTEGRATION_CATALOG.find(i => i.tools.some(t => t.name === toolName));
  if (!integration) return JSON.stringify({ error: `Unknown integration tool: ${toolName}` });

  const token = process.env[integration.envVar];
  if (!token) {
    return JSON.stringify({
      error: `Integration '${integration.displayName}' is not configured. Please add ${integration.envVar} to your environment secrets.`,
      setup_instructions: integration.setupNote,
    });
  }

  try {
    return await routeIntegrationCall(integration.id, toolName, args, token);
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}

async function routeIntegrationCall(
  integrationId: string,
  toolName: string,
  args: Record<string, unknown>,
  token: string
): Promise<string> {
  switch (integrationId) {
    case "github": return executeGitHub(toolName, args, token);
    case "linear": return executeLinear(toolName, args, token);
    case "notion": return executeNotion(toolName, args, token);
    case "slack": return executeSlack(toolName, args, token);
    case "telegram": return executeTelegram(toolName, args, token);
    case "hubspot": return executeHubSpot(toolName, args, token);
    case "stripe": return executeStripe(toolName, args, token);
    case "airtable": return executeAirtable(toolName, args, token);
    case "google_sheets": return executeGoogleSheets(toolName, args, token);
    case "gmail": return executeGmail(toolName, args, token);
    case "google_calendar": return executeGoogleCalendar(toolName, args, token);
    case "google_drive": return executeGoogleDrive(toolName, args, token);
    case "google_docs": return executeGoogleDocs(toolName, args, token);
    case "outlook": return executeOutlook(toolName, args, token);
    case "onedrive": return executeOneDrive(toolName, args, token);
    case "sharepoint": return executeSharePoint(toolName, args, token);
    case "linkedin": return executeLinkedIn(toolName, args, token);
    default: return JSON.stringify({ error: `No executor for: ${integrationId}` });
  }
}

// ─── GitHub ──────────────────────────────────────────────────────────────────
async function ghFetch(path: string, token: string, opts: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...((opts.headers as Record<string, string>) || {}) },
  });
  return res.json();
}

async function executeGitHub(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  if (toolName === "github_list_repos") {
    const per_page = (args.per_page as number) || 10;
    const visibility = (args.visibility as string) || "all";
    const data = await ghFetch(`/user/repos?per_page=${per_page}&visibility=${visibility}&sort=updated`, token) as {name:string;full_name:string;description:string;stargazers_count:number;private:boolean}[];
    return JSON.stringify({ repositories: data.map(r => ({ name: r.full_name, description: r.description, stars: r.stargazers_count, private: r.private })), count: data.length });
  }
  if (toolName === "github_list_issues") {
    const { owner, repo, state = "open", per_page = 10 } = args as Record<string, string | number>;
    const data = await ghFetch(`/repos/${owner}/${repo}/issues?state=${state}&per_page=${per_page}`, token) as {number:number;title:string;state:string;user:{login:string};created_at:string}[];
    return JSON.stringify({ issues: data.map(i => ({ number: i.number, title: i.title, state: i.state, author: i.user.login, created_at: i.created_at })), count: data.length });
  }
  if (toolName === "github_create_issue") {
    const { owner, repo, title, body, labels } = args as Record<string, string>;
    const data = await ghFetch(`/repos/${owner}/${repo}/issues`, token, { method: "POST", body: JSON.stringify({ title, body, labels: labels?.split(",").map(l => l.trim()) }) }) as {number:number;html_url:string;title:string};
    return JSON.stringify({ created: true, issue_number: data.number, url: data.html_url, title: data.title });
  }
  if (toolName === "github_search_code") {
    const { query } = args as Record<string, string>;
    const data = await ghFetch(`/search/code?q=${encodeURIComponent(query)}&per_page=5`, token) as {total_count:number;items:{name:string;path:string;repository:{full_name:string}}[]};
    return JSON.stringify({ total: data.total_count, results: data.items.map(i => ({ file: i.name, path: i.path, repo: i.repository.full_name })) });
  }
  return JSON.stringify({ error: `Unknown GitHub tool: ${toolName}` });
}

// ─── Linear ──────────────────────────────────────────────────────────────────
async function executeLinear(toolName: string, args: Record<string, unknown>, apiKey: string): Promise<string> {
  const gql = async (query: string, variables?: Record<string, unknown>) => {
    const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { Authorization: apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
    return res.json() as Promise<{ data: unknown; errors?: unknown[] }>;
  };
  if (toolName === "linear_list_issues") {
    const { state, limit = 10 } = args as Record<string, unknown>;
    const filter = state ? `filter: { state: { name: { eq: "${state}" } } }` : "";
    const result = await gql(`{ issues(first: ${limit} ${filter}) { nodes { id title state { name } priority assignee { name } createdAt } } }`);
    return JSON.stringify({ issues: (result.data as { issues: { nodes: unknown[] } }).issues.nodes });
  }
  if (toolName === "linear_create_issue") {
    const { title, description, team_key, priority = 0 } = args as Record<string, unknown>;
    const teamResult = await gql(`{ teams { nodes { id key } } }`);
    const teams = (teamResult.data as { teams: { nodes: {id:string;key:string}[] } }).teams.nodes;
    const team = teams.find(t => t.key === team_key);
    if (!team) return JSON.stringify({ error: `Team '${team_key}' not found. Available: ${teams.map(t => t.key).join(", ")}` });
    const result = await gql(`mutation($title:String!,$desc:String,$teamId:String!,$priority:Int){issueCreate(input:{title:$title,description:$desc,teamId:$teamId,priority:$priority}){success issue{id title url}}}`, { title, desc: description, teamId: team.id, priority });
    const data = result.data as { issueCreate: { success: boolean; issue: { id: string; title: string; url: string } } };
    return JSON.stringify({ created: data.issueCreate.success, issue: data.issueCreate.issue });
  }
  return JSON.stringify({ error: `Unknown Linear tool: ${toolName}` });
}

// ─── Notion ──────────────────────────────────────────────────────────────────
async function executeNotion(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const nFetch = async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`https://api.notion.com/v1${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json", ...((opts.headers as Record<string, string>) || {}) } });
    return res.json();
  };
  if (toolName === "notion_search") {
    const { query, filter_type } = args as Record<string, string>;
    const body: Record<string, unknown> = { query };
    if (filter_type) body.filter = { value: filter_type, property: "object" };
    const data = await nFetch("/search", { method: "POST", body: JSON.stringify(body) }) as { results: {id:string;object:string;url:string;properties?:{title?:{title:{plain_text:string}[]}}}[] };
    return JSON.stringify({ results: data.results.map(r => ({ id: r.id, type: r.object, url: r.url, title: r.properties?.title?.title?.[0]?.plain_text || "(untitled)" })), count: data.results.length });
  }
  if (toolName === "notion_get_page") {
    const { page_id } = args as Record<string, string>;
    const page = await nFetch(`/pages/${page_id}`) as { id: string; url: string };
    const blocks = await nFetch(`/blocks/${page_id}/children`) as { results: {type:string;[key:string]:unknown}[] };
    const text = blocks.results.map(b => { const blk = b[b.type] as { rich_text?: { plain_text: string }[] } | undefined; return blk?.rich_text?.map(t => t.plain_text).join("") || ""; }).filter(Boolean).join("\n");
    return JSON.stringify({ id: page.id, url: page.url, content: text.slice(0, 3000) });
  }
  if (toolName === "notion_create_page") {
    const { parent_id, title, content } = args as Record<string, string>;
    const page = await nFetch("/pages", { method: "POST", body: JSON.stringify({ parent: { page_id: parent_id }, properties: { title: { title: [{ type: "text", text: { content: title } }] } }, children: content ? [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content } }] } }] : [] }) }) as { id: string; url: string };
    return JSON.stringify({ created: true, id: page.id, url: page.url });
  }
  return JSON.stringify({ error: `Unknown Notion tool: ${toolName}` });
}

// ─── Slack ───────────────────────────────────────────────────────────────────
async function executeSlack(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const slFetch = async (method: string, params: Record<string, unknown>) => {
    const res = await fetch(`https://slack.com/api/${method}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(params) });
    return res.json() as Promise<{ ok: boolean; error?: string; [key: string]: unknown }>;
  };
  if (toolName === "slack_send_message") {
    const { channel, text } = args as Record<string, string>;
    const r = await slFetch("chat.postMessage", { channel, text });
    return r.ok ? JSON.stringify({ sent: true, channel, ts: r.ts }) : JSON.stringify({ error: r.error });
  }
  if (toolName === "slack_list_channels") {
    const r = await slFetch("conversations.list", { limit: (args.limit as number) || 20, types: "public_channel,private_channel" });
    const channels = (r.channels as {id:string;name:string;num_members:number}[] || []).map(c => ({ id: c.id, name: c.name, members: c.num_members }));
    return JSON.stringify({ channels, count: channels.length });
  }
  if (toolName === "slack_get_messages") {
    const { channel, limit = 10 } = args as Record<string, unknown>;
    const r = await slFetch("conversations.history", { channel, limit });
    const messages = (r.messages as {text:string;user:string;ts:string}[] || []).map(m => ({ text: m.text, user: m.user, ts: m.ts }));
    return JSON.stringify({ messages, count: messages.length });
  }
  return JSON.stringify({ error: `Unknown Slack tool: ${toolName}` });
}

// ─── Telegram ────────────────────────────────────────────────────────────────
async function executeTelegram(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  if (toolName === "telegram_send_message") {
    const { chat_id, text, parse_mode } = args as Record<string, string>;
    const body: Record<string, unknown> = { chat_id, text };
    if (parse_mode) body.parse_mode = parse_mode;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json() as { ok: boolean; description?: string };
    return d.ok ? JSON.stringify({ sent: true, chat_id }) : JSON.stringify({ error: d.description });
  }
  return JSON.stringify({ error: `Unknown Telegram tool: ${toolName}` });
}

// ─── HubSpot ─────────────────────────────────────────────────────────────────
async function executeHubSpot(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const hsGet = async (path: string) => (await fetch(`https://api.hubapi.com${path}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const hsPost = async (path: string, body: unknown) => (await fetch(`https://api.hubapi.com${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
  if (toolName === "hubspot_list_contacts") {
    const { limit = 10, search } = args as Record<string, unknown>;
    const data = search ? await hsPost("/crm/v3/objects/contacts/search", { query: search, limit }) : await hsGet(`/crm/v3/objects/contacts?limit=${limit}&properties=email,firstname,lastname,phone`);
    const contacts = ((data as { results: { id: string; properties: Record<string, string> }[] })?.results || []).map(c => ({ id: c.id, email: c.properties.email, name: `${c.properties.firstname || ""} ${c.properties.lastname || ""}`.trim(), phone: c.properties.phone }));
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

// ─── Stripe ──────────────────────────────────────────────────────────────────
async function executeStripe(toolName: string, args: Record<string, unknown>, secretKey: string): Promise<string> {
  const stFetch = async (path: string, method = "GET", body?: Record<string, string>) => {
    const res = await fetch(`https://api.stripe.com/v1${path}`, { method, headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" }, body: body ? new URLSearchParams(body).toString() : undefined });
    return res.json();
  };
  if (toolName === "stripe_list_customers") {
    const data = await stFetch(`/customers?limit=${(args.limit as number) || 10}${args.email ? `&email=${encodeURIComponent(args.email as string)}` : ""}`) as { data: {id:string;email:string;name:string}[] };
    return JSON.stringify({ customers: data.data.map(c => ({ id: c.id, email: c.email, name: c.name })) });
  }
  if (toolName === "stripe_list_invoices") {
    const data = await stFetch(`/invoices?limit=${(args.limit as number) || 10}${args.status ? `&status=${args.status}` : ""}`) as { data: {id:string;status:string;amount_due:number;customer_email:string}[] };
    return JSON.stringify({ invoices: data.data.map(i => ({ id: i.id, status: i.status, amount_due: i.amount_due / 100, customer_email: i.customer_email })) });
  }
  if (toolName === "stripe_create_payment_link") {
    const data = await stFetch("/payment_links", "POST", { "line_items[0][price]": args.price_id as string, "line_items[0][quantity]": String((args.quantity as number) || 1) }) as { id: string; url: string };
    return JSON.stringify({ created: true, payment_link: data.url, id: data.id });
  }
  return JSON.stringify({ error: `Unknown Stripe tool: ${toolName}` });
}

// ─── Airtable ────────────────────────────────────────────────────────────────
async function executeAirtable(toolName: string, args: Record<string, unknown>, apiKey: string): Promise<string> {
  const atFetch = async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`https://api.airtable.com/v0${path}`, { ...opts, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...((opts.headers as Record<string, string>) || {}) } });
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
    const data = await atFetch(`/${base_id}/${table_name}`, { method: "POST", body: JSON.stringify({ records: [{ fields: parsedFields }] }) }) as { records: {id:string}[] };
    return JSON.stringify({ created: true, id: data.records[0]?.id });
  }
  return JSON.stringify({ error: `Unknown Airtable tool: ${toolName}` });
}

// ─── Google Sheets ───────────────────────────────────────────────────────────
async function executeGoogleSheets(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  let accessToken = token;
  if (token.startsWith("{")) {
    let creds: { client_email: string; private_key: string };
    try { creds = JSON.parse(token); } catch { return JSON.stringify({ error: "Invalid GOOGLE_SHEETS_SERVICE_KEY" }); }
    const jwt = await buildGoogleJWT(creds.client_email, creds.private_key, "https://www.googleapis.com/auth/spreadsheets");
    const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString() });
    accessToken = ((await res.json()) as { access_token: string }).access_token;
  }
  const h = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  if (toolName === "sheets_read_range") {
    const { spreadsheet_id, range } = args as Record<string, string>;
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(range)}`, { headers: h });
    const data = await res.json() as { values?: string[][] };
    return JSON.stringify({ range, values: data.values || [], rows: (data.values || []).length });
  }
  if (toolName === "sheets_append_row") {
    const { spreadsheet_id, range, values } = args as Record<string, string>;
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`, { method: "POST", headers: h, body: JSON.stringify({ values: [values.split(",").map(v => v.trim())] }) });
    const data = await res.json() as { updates?: { updatedRows: number } };
    return JSON.stringify({ appended: true, rows_updated: data.updates?.updatedRows });
  }
  return JSON.stringify({ error: `Unknown Google Sheets tool: ${toolName}` });
}

async function buildGoogleJWT(email: string, privateKey: string, scope: string): Promise<string> {
  const enc = (s: string) => btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const header = enc(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = enc(JSON.stringify({ iss: email, scope, aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now }));
  const sigInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey("pkcs8", Buffer.from(privateKey.replace(/-----.*?-----/g, "").replace(/\s/g, ""), "base64"), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, Buffer.from(sigInput))).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${sigInput}.${sig}`;
}

// ─── Gmail ───────────────────────────────────────────────────────────────────
async function executeGmail(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (toolName === "gmail_send_email") {
    const { to, subject, body } = args as Record<string, string>;
    const raw = btoa(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: h, body: JSON.stringify({ raw }) });
    const data = await res.json() as { id?: string; error?: { message: string } };
    return data.id ? JSON.stringify({ sent: true, id: data.id }) : JSON.stringify({ error: data.error?.message });
  }
  if (toolName === "gmail_list_inbox") {
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${(args.max_results as number) || 5}&q=${encodeURIComponent((args.query as string) || "")}`, { headers: h });
    const listData = await listRes.json() as { messages?: { id: string }[] };
    if (!listData.messages?.length) return JSON.stringify({ messages: [], count: 0 });
    const msgs = await Promise.all(listData.messages.map(async m => {
      const mRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, { headers: h });
      const mData = await mRes.json() as { id: string; snippet: string; payload: { headers: { name: string; value: string }[] } };
      return { id: mData.id, from: mData.payload.headers.find(h => h.name === "From")?.value || "", subject: mData.payload.headers.find(h => h.name === "Subject")?.value || "", snippet: mData.snippet };
    }));
    return JSON.stringify({ messages: msgs, count: msgs.length });
  }
  return JSON.stringify({ error: `Unknown Gmail tool: ${toolName}` });
}

// ─── Google Calendar ─────────────────────────────────────────────────────────
async function executeGoogleCalendar(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (toolName === "gcal_list_events") {
    const timeMin = (args.time_min as string) || new Date().toISOString();
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${(args.max_results as number) || 5}&timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime`, { headers: h });
    const data = await res.json() as { items?: {id:string;summary:string;start:{dateTime?:string;date?:string};location?:string}[] };
    return JSON.stringify({ events: (data.items || []).map(e => ({ id: e.id, summary: e.summary, start: e.start.dateTime || e.start.date, location: e.location })) });
  }
  if (toolName === "gcal_create_event") {
    const { summary, description, start, end, attendees } = args as Record<string, string>;
    const body = { summary, description, start: { dateTime: start }, end: { dateTime: end }, attendees: attendees?.split(",").map(e => ({ email: e.trim() })) };
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", { method: "POST", headers: h, body: JSON.stringify(body) });
    const data = await res.json() as { id?: string; htmlLink?: string; error?: { message: string } };
    return data.id ? JSON.stringify({ created: true, id: data.id, link: data.htmlLink }) : JSON.stringify({ error: data.error?.message });
  }
  return JSON.stringify({ error: `Unknown Google Calendar tool: ${toolName}` });
}

// ─── Google Drive ────────────────────────────────────────────────────────────
async function executeGoogleDrive(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const h = { Authorization: `Bearer ${token}` };
  if (toolName === "gdrive_list_files") {
    const parts = [args.query as string | undefined, args.folder_id ? `'${args.folder_id}' in parents` : undefined].filter(Boolean);
    const q = parts.length ? `&q=${encodeURIComponent(parts.join(" and "))}` : "";
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=${(args.max_results as number) || 10}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)${q}`, { headers: h });
    const data = await res.json() as { files?: {id:string;name:string;mimeType:string;size?:string;modifiedTime:string;webViewLink?:string}[] };
    return JSON.stringify({ files: data.files || [], count: (data.files || []).length });
  }
  if (toolName === "gdrive_get_file") {
    const { file_id, export_as_text } = args as Record<string, string>;
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file_id}?fields=id,name,mimeType,webViewLink`, { headers: h });
    const meta = await metaRes.json() as { id: string; name: string; mimeType: string; webViewLink?: string };
    if (export_as_text === "yes" && meta.mimeType?.startsWith("application/vnd.google-apps")) {
      const exportRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file_id}/export?mimeType=text/plain`, { headers: h });
      return JSON.stringify({ ...meta, content: (await exportRes.text()).slice(0, 5000) });
    }
    return JSON.stringify(meta);
  }
  return JSON.stringify({ error: `Unknown Google Drive tool: ${toolName}` });
}

// ─── Google Docs ─────────────────────────────────────────────────────────────
async function executeGoogleDocs(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (toolName === "gdocs_get_document") {
    const { document_id } = args as Record<string, string>;
    const res = await fetch(`https://docs.googleapis.com/v1/documents/${document_id}`, { headers: h });
    const doc = await res.json() as { title?: string; body?: { content?: { paragraph?: { elements?: { textRun?: { content: string } }[] } }[] }; error?: { message: string } };
    if (doc.error) return JSON.stringify({ error: doc.error.message });
    const text = doc.body?.content?.flatMap(c => c.paragraph?.elements?.map(e => e.textRun?.content || "") || []).join("") || "";
    return JSON.stringify({ title: doc.title, content: text.slice(0, 5000) });
  }
  if (toolName === "gdocs_create_document") {
    const { title, content } = args as Record<string, string>;
    const res = await fetch("https://docs.googleapis.com/v1/documents", { method: "POST", headers: h, body: JSON.stringify({ title }) });
    const doc = await res.json() as { documentId?: string; title?: string; error?: { message: string } };
    if (doc.error) return JSON.stringify({ error: doc.error.message });
    if (content && doc.documentId) {
      await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, { method: "POST", headers: h, body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: content } }] }) });
    }
    return JSON.stringify({ created: true, document_id: doc.documentId, title: doc.title });
  }
  if (toolName === "gdocs_append_text") {
    const { document_id, text } = args as Record<string, string>;
    const docRes = await fetch(`https://docs.googleapis.com/v1/documents/${document_id}`, { headers: h });
    const doc = await docRes.json() as { body?: { content?: { endIndex?: number }[] } };
    const endIndex = Math.max(1, (doc.body?.content?.at(-1)?.endIndex ?? 2) - 1);
    const res = await fetch(`https://docs.googleapis.com/v1/documents/${document_id}:batchUpdate`, { method: "POST", headers: h, body: JSON.stringify({ requests: [{ insertText: { location: { index: endIndex }, text: `\n${text}` } }] }) });
    const data = await res.json() as { error?: { message: string } };
    return data.error ? JSON.stringify({ error: data.error.message }) : JSON.stringify({ appended: true });
  }
  return JSON.stringify({ error: `Unknown Google Docs tool: ${toolName}` });
}

// ─── Outlook ─────────────────────────────────────────────────────────────────
async function executeOutlook(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (toolName === "outlook_send_email") {
    const { to, subject, body } = args as Record<string, string>;
    const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", { method: "POST", headers: h, body: JSON.stringify({ message: { subject, body: { contentType: "HTML", content: body }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }) });
    return res.ok ? JSON.stringify({ sent: true }) : JSON.stringify({ error: `HTTP ${res.status}` });
  }
  if (toolName === "outlook_list_calendar") {
    const now = new Date().toISOString();
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now}&endDateTime=${new Date(Date.now() + 7 * 86400000).toISOString()}&$top=${(args.top as number) || 5}&$orderby=start/dateTime`, { headers: h });
    const data = await res.json() as { value?: {id:string;subject:string;start:{dateTime:string};location?:{displayName:string}}[]; error?: { message: string } };
    if (data.error) return JSON.stringify({ error: data.error.message });
    return JSON.stringify({ events: (data.value || []).map(e => ({ id: e.id, subject: e.subject, start: e.start.dateTime, location: e.location?.displayName })) });
  }
  return JSON.stringify({ error: `Unknown Outlook tool: ${toolName}` });
}

// ─── OneDrive ────────────────────────────────────────────────────────────────
async function executeOneDrive(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const h = { Authorization: `Bearer ${token}` };
  if (toolName === "onedrive_list_files") {
    const folder_path = (args.folder_path as string) || "/";
    const path = folder_path === "/" ? "/me/drive/root/children" : `/me/drive/root:${folder_path}:/children`;
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}?$top=${(args.top as number) || 10}&$select=id,name,size,lastModifiedDateTime,webUrl,file,folder`, { headers: h });
    const data = await res.json() as { value?: {id:string;name:string;size?:number;lastModifiedDateTime:string;webUrl:string;file?:unknown;folder?:unknown}[]; error?: { message: string } };
    if (data.error) return JSON.stringify({ error: data.error.message });
    return JSON.stringify({ files: (data.value || []).map(f => ({ id: f.id, name: f.name, size: f.size, type: f.folder ? "folder" : "file", modified: f.lastModifiedDateTime, url: f.webUrl })) });
  }
  if (toolName === "onedrive_get_file") {
    const { item_id } = args as Record<string, string>;
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${item_id}?$select=id,name,size,webUrl,@microsoft.graph.downloadUrl`, { headers: h });
    const data = await res.json() as { id?: string; name?: string; size?: number; webUrl?: string; "@microsoft.graph.downloadUrl"?: string; error?: { message: string } };
    if (data.error) return JSON.stringify({ error: data.error.message });
    return JSON.stringify({ id: data.id, name: data.name, size: data.size, url: data.webUrl, download_url: data["@microsoft.graph.downloadUrl"] });
  }
  return JSON.stringify({ error: `Unknown OneDrive tool: ${toolName}` });
}

// ─── SharePoint ──────────────────────────────────────────────────────────────
async function executeSharePoint(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const h = { Authorization: `Bearer ${token}` };
  if (toolName === "sharepoint_list_sites") {
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites?$top=${(args.top as number) || 10}&search=*`, { headers: h });
    const data = await res.json() as { value?: {id:string;name:string;displayName:string;webUrl:string}[]; error?: { message: string } };
    if (data.error) return JSON.stringify({ error: data.error.message });
    return JSON.stringify({ sites: (data.value || []).map(s => ({ id: s.id, name: s.name, displayName: s.displayName, url: s.webUrl })) });
  }
  if (toolName === "sharepoint_list_documents") {
    const { site_id, drive_id, top = 10 } = args as Record<string, unknown>;
    const drivePath = drive_id ? `/sites/${site_id}/drives/${drive_id}/root/children` : `/sites/${site_id}/drive/root/children`;
    const res = await fetch(`https://graph.microsoft.com/v1.0${drivePath}?$top=${top}&$select=id,name,size,lastModifiedDateTime,webUrl,file,folder`, { headers: h });
    const data = await res.json() as { value?: {id:string;name:string;size?:number;lastModifiedDateTime:string;webUrl:string;file?:unknown;folder?:unknown}[]; error?: { message: string } };
    if (data.error) return JSON.stringify({ error: data.error.message });
    return JSON.stringify({ documents: (data.value || []).map(f => ({ id: f.id, name: f.name, size: f.size, type: f.folder ? "folder" : "file", modified: f.lastModifiedDateTime, url: f.webUrl })) });
  }
  return JSON.stringify({ error: `Unknown SharePoint tool: ${toolName}` });
}

// ─── LinkedIn ────────────────────────────────────────────────────────────────
async function executeLinkedIn(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (toolName === "linkedin_get_profile") {
    const res = await fetch("https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName,profilePicture(displayImage~:playableStreams))", { headers: h });
    const data = await res.json() as { id?: string; localizedFirstName?: string; localizedLastName?: string; message?: string };
    if (!data.id) return JSON.stringify({ error: data.message || "Auth failed" });
    return JSON.stringify({ id: data.id, name: `${data.localizedFirstName} ${data.localizedLastName}` });
  }
  if (toolName === "linkedin_create_post") {
    const { text, visibility = "PUBLIC" } = args as Record<string, string>;
    const meRes = await fetch("https://api.linkedin.com/v2/me", { headers: h });
    const me = await meRes.json() as { id?: string };
    if (!me.id) return JSON.stringify({ error: "Could not get LinkedIn user ID" });
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST", headers: h,
      body: JSON.stringify({ author: `urn:li:person:${me.id}`, lifecycleState: "PUBLISHED", specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text }, shareMediaCategory: "NONE" } }, visibility: { "com.linkedin.ugc.MemberNetworkVisibility": visibility } }),
    });
    const data = await res.json() as { id?: string; message?: string };
    return data.id ? JSON.stringify({ posted: true, post_id: data.id }) : JSON.stringify({ error: data.message || "Post failed" });
  }
  return JSON.stringify({ error: `Unknown LinkedIn tool: ${toolName}` });
}
