import { getReplitConnectorToken, isReplitConnectorAvailable } from "./connector-token.js";

export interface IntegrationTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export type AuthType = "replit_connector" | "api_key";

export interface IntegrationDefinition {
  id: string;
  displayName: string;
  category: "google" | "microsoft" | "dev" | "productivity" | "crm" | "finance" | "communication";
  description: string;
  icon: string;
  authType: AuthType;
  replitConnectorId?: string;
  envVar?: string;
  envVarLabel?: string;
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
    authType: "replit_connector",
    replitConnectorId: "ccfg_github_01K4B9XD3VRVD2F99YM91YTCAF",
    envVar: "GITHUB_TOKEN",
    envVarLabel: "Personal Access Token (fallback)",
    setupNote: "Connect via Replit OAuth, or set GITHUB_TOKEN (github.com/settings/tokens with repo scope)",
    tools: [
      {
        name: "github_list_repos",
        description: "List GitHub repositories for the authenticated user",
        parameters: {
          type: "object",
          properties: {
            per_page: { type: "number", description: "Number of repos to return (default 10)" },
            visibility: { type: "string", description: "Filter: all, public, private", enum: ["all", "public", "private"] },
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
            state: { type: "string", description: "Filter: open, closed, all", enum: ["open", "closed", "all"] },
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
            body: { type: "string", description: "Issue description (markdown)" },
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
    authType: "replit_connector",
    replitConnectorId: "ccfg_linear_01K4B3DCSR7JEAJK400V1HTJAK",
    envVar: "LINEAR_API_KEY",
    envVarLabel: "API Key (fallback)",
    setupNote: "Connect via Replit OAuth, or set LINEAR_API_KEY (Linear → Settings → API → Personal API keys)",
    tools: [
      {
        name: "linear_list_issues",
        description: "List issues from Linear",
        parameters: {
          type: "object",
          properties: {
            team_key: { type: "string", description: "Team key to filter (optional)" },
            state: { type: "string", description: "Filter by state name (e.g. Todo, In Progress)" },
            limit: { type: "number", description: "Number of issues (default 10)" },
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
            description: { type: "string", description: "Issue description (markdown)" },
            team_key: { type: "string", description: "Team key (e.g. ENG)" },
            priority: { type: "number", description: "Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low" },
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
    authType: "replit_connector",
    replitConnectorId: "ccfg_notion_01K49R392Z3CSNMXCPWSV67AF4",
    envVar: "NOTION_TOKEN",
    envVarLabel: "Integration Token (fallback)",
    setupNote: "Connect via Replit OAuth, or set NOTION_TOKEN (notion.so/my-integrations)",
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
            page_id: { type: "string", description: "Notion page ID" },
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
    authType: "replit_connector",
    replitConnectorId: "ccfg_slack_01KH7W1T1D6TGP3BJGNQ2N9PEH",
    envVar: "SLACK_BOT_TOKEN",
    envVarLabel: "Bot Token (fallback)",
    setupNote: "Connect via Replit OAuth, or set SLACK_BOT_TOKEN (api.slack.com → Your Apps → OAuth)",
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
            limit: { type: "number", description: "Max number of channels (default 20)" },
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
    authType: "api_key",
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
            text: { type: "string", description: "Message text (HTML or Markdown)" },
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
    authType: "replit_connector",
    replitConnectorId: "ccfg_hubspot_96987450B7BE4A05A4843E3756",
    envVar: "HUBSPOT_API_KEY",
    envVarLabel: "Private App Token (fallback)",
    setupNote: "Connect via Replit OAuth, or set HUBSPOT_API_KEY (HubSpot → Settings → Integrations → Private Apps)",
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
            dealstage: { type: "string", description: "Deal stage (e.g. appointmentscheduled, closedwon)" },
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
    authType: "replit_connector",
    replitConnectorId: "ccfg_stripe_01K611P4YQR0SZM11XFRQJC44Y",
    envVar: "STRIPE_SECRET_KEY",
    envVarLabel: "Secret Key (fallback)",
    setupNote: "Connect via Replit OAuth, or set STRIPE_SECRET_KEY (Stripe Dashboard → Developers → API keys)",
    tools: [
      {
        name: "stripe_list_customers",
        description: "List customers in Stripe",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Number of customers (default 10)" },
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
            status: { type: "string", description: "Filter: draft, open, paid, uncollectible, void", enum: ["draft", "open", "paid", "uncollectible", "void"] },
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
    authType: "api_key",
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
            max_records: { type: "number", description: "Max records (default 20)" },
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
            fields: { type: "string", description: "JSON string of field values" },
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
    authType: "replit_connector",
    replitConnectorId: "ccfg_google-sheet_E42A9F6CA62546F68A1FECA0E8",
    envVar: "GOOGLE_SHEETS_SERVICE_KEY",
    envVarLabel: "Service Account JSON (fallback)",
    setupNote: "Connect via Replit OAuth, or set GOOGLE_SHEETS_SERVICE_KEY (Google Cloud → Service Accounts → JSON key)",
    tools: [
      {
        name: "sheets_read_range",
        description: "Read a range of cells from a Google Sheet",
        parameters: {
          type: "object",
          properties: {
            spreadsheet_id: { type: "string", description: "Google Spreadsheet ID from the URL" },
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
            spreadsheet_id: { type: "string", description: "Google Spreadsheet ID" },
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
    authType: "replit_connector",
    replitConnectorId: "ccfg_google-mail_B959E7249792448ABBA58D46AF",
    envVar: "GOOGLE_OAUTH_TOKEN",
    envVarLabel: "OAuth Access Token (fallback)",
    setupNote: "Connect via Replit OAuth for Gmail access",
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
    authType: "replit_connector",
    replitConnectorId: "ccfg_google-calendar_DDDBAC03DE404369B74F32E78D",
    envVar: "GOOGLE_OAUTH_TOKEN",
    envVarLabel: "OAuth Access Token (fallback)",
    setupNote: "Connect via Replit OAuth for Google Calendar access",
    tools: [
      {
        name: "gcal_list_events",
        description: "List upcoming events from Google Calendar",
        parameters: {
          type: "object",
          properties: {
            max_results: { type: "number", description: "Max events (default 5)" },
            time_min: { type: "string", description: "Start time in ISO 8601 (defaults to now)" },
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
            start: { type: "string", description: "Start time ISO 8601 (e.g. 2024-03-15T10:00:00)" },
            end: { type: "string", description: "End time ISO 8601" },
            attendees: { type: "string", description: "Comma-separated attendee emails" },
          },
          required: ["summary", "start", "end"],
        },
      },
    ],
  },
  {
    id: "google_drive",
    displayName: "Google Drive",
    category: "google",
    description: "Search, list, read, and upload files in Google Drive",
    icon: "google_drive",
    authType: "replit_connector",
    replitConnectorId: "ccfg_google-drive_0F6D7EF5E22543468DB221F94F",
    setupNote: "Connect via Replit OAuth for Google Drive access",
    tools: [
      {
        name: "gdrive_list_files",
        description: "List files in Google Drive",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Drive search query (e.g. mimeType='application/pdf')" },
            max_results: { type: "number", description: "Max files to return (default 10)" },
            folder_id: { type: "string", description: "Folder ID to list files in (optional)" },
          },
          required: [],
        },
      },
      {
        name: "gdrive_get_file",
        description: "Get metadata or content of a file in Google Drive",
        parameters: {
          type: "object",
          properties: {
            file_id: { type: "string", description: "Google Drive file ID" },
            export_as_text: { type: "string", description: "Export Google Doc/Sheet as plain text: yes/no", enum: ["yes", "no"] },
          },
          required: ["file_id"],
        },
      },
    ],
  },
  {
    id: "google_docs",
    displayName: "Google Docs",
    category: "google",
    description: "Read, create, and update Google Docs documents",
    icon: "google_docs",
    authType: "replit_connector",
    replitConnectorId: "ccfg_google-docs_587BECDAEBD441138D618E3ABD",
    setupNote: "Connect via Replit OAuth for Google Docs access",
    tools: [
      {
        name: "gdocs_get_document",
        description: "Get the content of a Google Docs document",
        parameters: {
          type: "object",
          properties: {
            document_id: { type: "string", description: "Google Docs document ID from the URL" },
          },
          required: ["document_id"],
        },
      },
      {
        name: "gdocs_create_document",
        description: "Create a new Google Docs document",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Document title" },
            content: { type: "string", description: "Initial document content (plain text)" },
          },
          required: ["title"],
        },
      },
      {
        name: "gdocs_append_text",
        description: "Append text to an existing Google Docs document",
        parameters: {
          type: "object",
          properties: {
            document_id: { type: "string", description: "Google Docs document ID" },
            text: { type: "string", description: "Text to append" },
          },
          required: ["document_id", "text"],
        },
      },
    ],
  },
  {
    id: "outlook",
    displayName: "Microsoft Outlook",
    category: "microsoft",
    description: "Send emails and read calendar events via Microsoft 365",
    icon: "outlook",
    authType: "replit_connector",
    replitConnectorId: "ccfg_outlook_01K4BBCKRJKP82N3PYQPZQ6DAK",
    envVar: "MICROSOFT_GRAPH_TOKEN",
    envVarLabel: "OAuth Access Token (fallback)",
    setupNote: "Connect via Replit OAuth, or set MICROSOFT_GRAPH_TOKEN (Azure AD app with Mail.Send + Calendars.Read)",
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
            top: { type: "number", description: "Number of events (default 5)" },
          },
          required: [],
        },
      },
    ],
  },
  {
    id: "onedrive",
    displayName: "Microsoft OneDrive",
    category: "microsoft",
    description: "List, read, and upload files in Microsoft OneDrive",
    icon: "onedrive",
    authType: "replit_connector",
    replitConnectorId: "ccfg_onedrive_01K4E4CFAKZ9ARQZBWZW4HD05Y",
    setupNote: "Connect via Replit OAuth for OneDrive access",
    tools: [
      {
        name: "onedrive_list_files",
        description: "List files in Microsoft OneDrive",
        parameters: {
          type: "object",
          properties: {
            folder_path: { type: "string", description: "Folder path to list (e.g. /Documents), defaults to root" },
            top: { type: "number", description: "Max files to return (default 10)" },
          },
          required: [],
        },
      },
      {
        name: "onedrive_get_file",
        description: "Get metadata or download URL for a OneDrive file",
        parameters: {
          type: "object",
          properties: {
            item_id: { type: "string", description: "OneDrive item ID" },
          },
          required: ["item_id"],
        },
      },
    ],
  },
  {
    id: "sharepoint",
    displayName: "SharePoint Online",
    category: "microsoft",
    description: "List sites, libraries, and documents in SharePoint",
    icon: "sharepoint",
    authType: "replit_connector",
    replitConnectorId: "ccfg_sharepoint_01K4E4GP3G31BE5PGVY2CNTDDK",
    setupNote: "Connect via Replit OAuth for SharePoint Online access",
    tools: [
      {
        name: "sharepoint_list_sites",
        description: "List SharePoint Online sites",
        parameters: {
          type: "object",
          properties: {
            top: { type: "number", description: "Max number of sites (default 10)" },
          },
          required: [],
        },
      },
      {
        name: "sharepoint_list_documents",
        description: "List documents in a SharePoint document library",
        parameters: {
          type: "object",
          properties: {
            site_id: { type: "string", description: "SharePoint site ID" },
            drive_id: { type: "string", description: "Document library drive ID (optional)" },
            top: { type: "number", description: "Max documents to return (default 10)" },
          },
          required: ["site_id"],
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

export async function isIntegrationAvailable(serviceId: string): Promise<boolean> {
  const def = getIntegrationById(serviceId);
  if (!def) return false;

  if (def.authType === "replit_connector") {
    if (isReplitConnectorAvailable()) return true;
    return !!(def.envVar && process.env[def.envVar]);
  }
  return !!(def.envVar && process.env[def.envVar]);
}

export async function getIntegrationToken(def: IntegrationDefinition): Promise<string | null> {
  if (def.authType === "replit_connector" && def.replitConnectorId) {
    const result = await getReplitConnectorToken(def.replitConnectorId);
    if (result?.token) return result.token;
  }
  if (def.envVar && process.env[def.envVar]) {
    return process.env[def.envVar]!;
  }
  return null;
}

export async function testIntegrationConnection(serviceId: string): Promise<{ success: boolean; message: string }> {
  const def = getIntegrationById(serviceId);
  if (!def) return { success: false, message: "Unknown integration" };

  const token = await getIntegrationToken(def);
  if (!token) {
    if (def.authType === "replit_connector") {
      return {
        success: false,
        message: `Replit OAuth connector not authorized. Connect this service in your Replit account settings, or add ${def.envVar || "an API key"} as a fallback secret.`,
      };
    }
    return {
      success: false,
      message: `${def.envVar} environment secret is not set. ${def.setupNote}`,
    };
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
        const d = await r.json() as { data?: { viewer?: { name: string; email: string } } };
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
        return r.ok ? { success: true, message: "HubSpot CRM connection verified" } : { success: false, message: `HTTP ${r.status}` };
      }
      case "stripe": {
        const r = await fetch("https://api.stripe.com/v1/customers?limit=1", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json() as { object?: string; error?: { message: string } };
        return r.ok ? { success: true, message: "Stripe connection verified" } : { success: false, message: d.error?.message || "Auth failed" };
      }
      case "airtable": {
        const r = await fetch("https://api.airtable.com/v0/meta/bases", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json() as { bases?: unknown[]; error?: { message: string } };
        return r.ok ? { success: true, message: `Airtable connected, ${d.bases?.length ?? 0} base(s) accessible` } : { success: false, message: d.error?.message || "Auth failed" };
      }
      case "google_sheets":
      case "gmail":
      case "google_calendar":
      case "google_drive":
      case "google_docs": {
        const r = await fetch("https://www.googleapis.com/oauth2/v1/tokeninfo", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `access_token=${encodeURIComponent(token)}` });
        const d = await r.json() as { email?: string; error?: string; expires_in?: number };
        return d.email ? { success: true, message: `Google connection verified (${d.email})` } : { success: false, message: d.error || "Token invalid" };
      }
      case "outlook":
      case "onedrive":
      case "sharepoint": {
        const r = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json() as { displayName?: string; userPrincipalName?: string; error?: { message: string } };
        return r.ok ? { success: true, message: `Connected as ${d.displayName || d.userPrincipalName}` } : { success: false, message: d.error?.message || "Auth failed" };
      }
      default:
        return { success: true, message: "Token present" };
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

  const token = await getIntegrationToken(integration);
  if (!token) {
    return JSON.stringify({
      error: `Integration '${integration.displayName}' is not connected. ${integration.authType === "replit_connector" ? "Please authorize the Replit connector or" : "Please"} add ${integration.envVar || "the required credential"} to your environment secrets.`,
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

async function executeGoogleSheets(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  let accessToken = token;

  if (token.startsWith("{")) {
    let creds: { client_email: string; private_key: string };
    try { creds = JSON.parse(token); } catch {
      return JSON.stringify({ error: "Invalid GOOGLE_SHEETS_SERVICE_KEY — must be a JSON service account key" });
    }
    const jwt = await buildGoogleJWT(creds.client_email, creds.private_key, "https://www.googleapis.com/auth/spreadsheets");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString(),
    });
    const data = await res.json() as { access_token: string };
    accessToken = data.access_token;
  }

  const headers = { Authorization: `Bearer ${accessToken}` };

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
  const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
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
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${maxResults}&timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime`, { headers });
    const data = await res.json() as { items?: {id:string;summary:string;start:{dateTime?:string;date?:string};location?:string}[] };
    const events = (data.items || []).map(e => ({ id: e.id, summary: e.summary, start: e.start.dateTime || e.start.date, location: e.location }));
    return JSON.stringify({ events, count: events.length });
  }
  if (toolName === "gcal_create_event") {
    const { summary, description, start, end, attendees } = args as Record<string, string>;
    const attendeeList = attendees ? attendees.split(",").map(e => ({ email: e.trim() })) : undefined;
    const body = { summary, description, start: { dateTime: start }, end: { dateTime: end }, attendees: attendeeList };
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST", headers, body: JSON.stringify(body),
    });
    const data = await res.json() as { id?: string; htmlLink?: string; error?: { message: string } };
    return data.id ? JSON.stringify({ created: true, id: data.id, link: data.htmlLink }) : JSON.stringify({ error: data.error?.message });
  }
  return JSON.stringify({ error: `Unknown Google Calendar tool: ${toolName}` });
}

async function executeGoogleDrive(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  if (toolName === "gdrive_list_files") {
    const maxResults = (args.max_results as number) || 10;
    const folder_id = args.folder_id as string | undefined;
    const q_parts = [args.query as string | undefined, folder_id ? `'${folder_id}' in parents` : undefined].filter(Boolean);
    const q = q_parts.length ? `&q=${encodeURIComponent(q_parts.join(" and "))}` : "";
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=${maxResults}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)${q}`, { headers });
    const data = await res.json() as { files?: {id:string;name:string;mimeType:string;size?:string;modifiedTime:string;webViewLink?:string}[] };
    return JSON.stringify({ files: data.files || [], count: (data.files || []).length });
  }
  if (toolName === "gdrive_get_file") {
    const { file_id, export_as_text } = args as Record<string, string>;
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file_id}?fields=id,name,mimeType,size,modifiedTime,webViewLink`, { headers });
    const meta = await metaRes.json() as { id: string; name: string; mimeType: string; webViewLink?: string };
    if (export_as_text === "yes" && meta.mimeType?.startsWith("application/vnd.google-apps")) {
      const exportRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file_id}/export?mimeType=text/plain`, { headers });
      const text = await exportRes.text();
      return JSON.stringify({ ...meta, content: text.slice(0, 5000) });
    }
    return JSON.stringify(meta);
  }
  return JSON.stringify({ error: `Unknown Google Drive tool: ${toolName}` });
}

async function executeGoogleDocs(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  if (toolName === "gdocs_get_document") {
    const { document_id } = args as Record<string, string>;
    const res = await fetch(`https://docs.googleapis.com/v1/documents/${document_id}`, { headers });
    const doc = await res.json() as { title?: string; body?: { content?: { paragraph?: { elements?: { textRun?: { content: string } }[] } }[] }; error?: { message: string } };
    if (doc.error) return JSON.stringify({ error: doc.error.message });
    const text = doc.body?.content?.flatMap(c => c.paragraph?.elements?.map(e => e.textRun?.content || "") || []).join("") || "";
    return JSON.stringify({ title: doc.title, content: text.slice(0, 5000) });
  }
  if (toolName === "gdocs_create_document") {
    const { title, content } = args as Record<string, string>;
    const res = await fetch("https://docs.googleapis.com/v1/documents", {
      method: "POST", headers, body: JSON.stringify({ title }),
    });
    const doc = await res.json() as { documentId?: string; title?: string; error?: { message: string } };
    if (doc.error) return JSON.stringify({ error: doc.error.message });
    if (content && doc.documentId) {
      await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
        method: "POST", headers,
        body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: content } }] }),
      });
    }
    return JSON.stringify({ created: true, document_id: doc.documentId, title: doc.title });
  }
  if (toolName === "gdocs_append_text") {
    const { document_id, text } = args as Record<string, string>;
    const docRes = await fetch(`https://docs.googleapis.com/v1/documents/${document_id}`, { headers });
    const doc = await docRes.json() as { body?: { content?: { endIndex?: number }[] } };
    const endIndex = Math.max(1, (doc.body?.content?.at(-1)?.endIndex ?? 2) - 1);
    const res = await fetch(`https://docs.googleapis.com/v1/documents/${document_id}:batchUpdate`, {
      method: "POST", headers,
      body: JSON.stringify({ requests: [{ insertText: { location: { index: endIndex }, text: `\n${text}` } }] }),
    });
    const data = await res.json() as { error?: { message: string } };
    return data.error ? JSON.stringify({ error: data.error.message }) : JSON.stringify({ appended: true });
  }
  return JSON.stringify({ error: `Unknown Google Docs tool: ${toolName}` });
}

async function executeOutlook(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  if (toolName === "outlook_send_email") {
    const { to, subject, body } = args as Record<string, string>;
    const msg = { message: { subject, body: { contentType: "HTML", content: body }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true };
    const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST", headers, body: JSON.stringify(msg),
    });
    return res.ok ? JSON.stringify({ sent: true }) : JSON.stringify({ error: `HTTP ${res.status}` });
  }
  if (toolName === "outlook_list_calendar") {
    const top = (args.top as number) || 5;
    const now = new Date().toISOString();
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now}&endDateTime=${new Date(Date.now() + 7 * 24 * 3600000).toISOString()}&$top=${top}&$orderby=start/dateTime`, { headers });
    const data = await res.json() as { value?: {id:string;subject:string;start:{dateTime:string};location?:{displayName:string}}[]; error?: { message: string } };
    if (data.error) return JSON.stringify({ error: data.error.message });
    const events = (data.value || []).map(e => ({ id: e.id, subject: e.subject, start: e.start.dateTime, location: e.location?.displayName }));
    return JSON.stringify({ events, count: events.length });
  }
  return JSON.stringify({ error: `Unknown Outlook tool: ${toolName}` });
}

async function executeOneDrive(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  if (toolName === "onedrive_list_files") {
    const folder_path = (args.folder_path as string) || "/";
    const top = (args.top as number) || 10;
    const path = folder_path === "/" ? "/me/drive/root/children" : `/me/drive/root:${folder_path}:/children`;
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}?$top=${top}&$select=id,name,size,lastModifiedDateTime,webUrl,file,folder`, { headers });
    const data = await res.json() as { value?: {id:string;name:string;size?:number;lastModifiedDateTime:string;webUrl:string;file?:unknown;folder?:unknown}[]; error?: { message: string } };
    if (data.error) return JSON.stringify({ error: data.error.message });
    const files = (data.value || []).map(f => ({ id: f.id, name: f.name, size: f.size, type: f.folder ? "folder" : "file", modified: f.lastModifiedDateTime, url: f.webUrl }));
    return JSON.stringify({ files, count: files.length });
  }
  if (toolName === "onedrive_get_file") {
    const { item_id } = args as Record<string, string>;
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${item_id}?$select=id,name,size,lastModifiedDateTime,webUrl,@microsoft.graph.downloadUrl`, { headers });
    const data = await res.json() as { id?: string; name?: string; size?: number; webUrl?: string; "@microsoft.graph.downloadUrl"?: string; error?: { message: string } };
    if (data.error) return JSON.stringify({ error: data.error.message });
    return JSON.stringify({ id: data.id, name: data.name, size: data.size, url: data.webUrl, download_url: data["@microsoft.graph.downloadUrl"] });
  }
  return JSON.stringify({ error: `Unknown OneDrive tool: ${toolName}` });
}

async function executeSharePoint(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  if (toolName === "sharepoint_list_sites") {
    const top = (args.top as number) || 10;
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites?$top=${top}&search=*`, { headers });
    const data = await res.json() as { value?: {id:string;name:string;displayName:string;webUrl:string}[]; error?: { message: string } };
    if (data.error) return JSON.stringify({ error: data.error.message });
    const sites = (data.value || []).map(s => ({ id: s.id, name: s.name, displayName: s.displayName, url: s.webUrl }));
    return JSON.stringify({ sites, count: sites.length });
  }
  if (toolName === "sharepoint_list_documents") {
    const { site_id, drive_id, top = 10 } = args as Record<string, unknown>;
    const drivePath = drive_id ? `/sites/${site_id}/drives/${drive_id}/root/children` : `/sites/${site_id}/drive/root/children`;
    const res = await fetch(`https://graph.microsoft.com/v1.0${drivePath}?$top=${top}&$select=id,name,size,lastModifiedDateTime,webUrl,file,folder`, { headers });
    const data = await res.json() as { value?: {id:string;name:string;size?:number;lastModifiedDateTime:string;webUrl:string;file?:unknown;folder?:unknown}[]; error?: { message: string } };
    if (data.error) return JSON.stringify({ error: data.error.message });
    const docs = (data.value || []).map(f => ({ id: f.id, name: f.name, size: f.size, type: f.folder ? "folder" : "file", modified: f.lastModifiedDateTime, url: f.webUrl }));
    return JSON.stringify({ documents: docs, count: docs.length });
  }
  return JSON.stringify({ error: `Unknown SharePoint tool: ${toolName}` });
}
