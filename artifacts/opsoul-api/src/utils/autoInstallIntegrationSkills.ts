import crypto from 'crypto';
import { db } from '@workspace/db';
import { platformSkillsTable, operatorSkillsTable, operatorIntegrationsTable } from '@workspace/db';
import { eq, and } from 'drizzle-orm';

const INTEGRATION_SKILLS: Record<string, {
  id: string;
  name: string;
  description: string;
  triggerDescription: string;
  instructions: string;
  outputFormat: string;
}[]> = {
  gmail: [
    {
      id: 'sys-gmail-read-inbox',
      name: 'Read Inbox',
      description: "Reads the user's Gmail inbox and reports recent messages",
      triggerDescription: "user asks to check email, read inbox, pull emails, see messages, check if email is working, what is in my inbox, show me emails, any Gmail or email-related request",
      instructions: "Access the user's Gmail inbox via the Gmail API endpoint /users/me/messages?maxResults=20&q=is:unread. For each message, extract the sender, subject, date, and a one-sentence summary. Flag anything that looks urgent or requires a response. Report back clearly — no raw JSON, no technical details, just a clean readable summary.",
      outputFormat: "Summary: X unread messages. List by recency: sender → subject → date → key point. Urgent ones flagged at the top.",
    },
    {
      id: 'sys-gmail-send',
      name: 'Send Email',
      description: "Sends an email on behalf of the user via Gmail",
      triggerDescription: "user wants to send an email, reply to someone, draft and send a message, compose and send email, email someone",
      instructions: "Compose and send an email on behalf of the user via the Gmail API. Use the details the user provides: recipient, subject, and message body. Encode the message in base64url RFC 2822 format and POST to /users/me/messages/send.",
      outputFormat: "Sent confirmation: to → subject → timestamp → status",
    },
  ],

  google_calendar: [
    {
      id: 'sys-gcal-check',
      name: 'Check Calendar',
      description: "Retrieves upcoming events from the user's Google Calendar",
      triggerDescription: "user asks about calendar, upcoming events, schedule, meetings, what is on today, what is happening this week, check my schedule, any calendar-related request",
      instructions: "Access the user's Google Calendar via /calendars/primary/events?orderBy=startTime&singleEvents=true&timeMin=<now ISO>&maxResults=20. Retrieve events for the next 7 days. For each event: title, start time, end time, attendees, and location if present. Group by day and highlight anything happening today.",
      outputFormat: "Events by day: title → time → attendees. Today highlighted first.",
    },
    {
      id: 'sys-gcal-create',
      name: 'Create Event',
      description: "Creates a new event in the user's Google Calendar",
      triggerDescription: "user wants to schedule a meeting, add an event to calendar, block time, create a calendar event, set a reminder",
      instructions: "Create a new event in the user's Google Calendar via POST /calendars/primary/events. Use the details the user provides: title, date, time, duration, attendees, description. Return confirmation with the created event details.",
      outputFormat: "Created event: title → date/time → attendees → confirmation",
    },
  ],

  google_drive: [
    {
      id: 'sys-gdrive-search',
      name: 'Search Drive',
      description: "Searches and lists files in the user's Google Drive",
      triggerDescription: "user asks about files, documents, folders, search drive, find a document, access something in Drive, what is in Drive, file storage, recent files",
      instructions: "Search the user's Google Drive via /files?orderBy=modifiedTime+desc&pageSize=20&fields=files(id,name,mimeType,modifiedTime,owners). List file names, types, last modified dates, and owners. Return the most relevant results based on what the user is looking for.",
      outputFormat: "File list: name → type → last modified → owner",
    },
  ],

  github: [
    {
      id: 'sys-github-list-issues',
      name: 'List Issues',
      description: "Lists open issues from the user's GitHub repositories",
      triggerDescription: "user asks to check GitHub issues, show open issues, what issues do I have, GitHub bug tracker, list my issues, pull issues from GitHub, what is open on GitHub",
      instructions: "Fetch open issues from the user's GitHub via /issues?filter=assigned&state=open&sort=updated&per_page=20. For each issue: repository name, issue title, number, labels, and last updated date. Highlight anything assigned to the user or marked urgent. Return a clean summary — no raw JSON.",
      outputFormat: "Issues by repo: #number → title → labels → updated. Total count at top.",
    },
    {
      id: 'sys-github-create-issue',
      name: 'Create Issue',
      description: "Creates a new issue in a GitHub repository",
      triggerDescription: "user wants to file a bug, create a GitHub issue, report a problem, open an issue, log a bug on GitHub",
      instructions: "Create a new issue in the specified GitHub repository via POST /repos/{owner}/{repo}/issues. Use the title, body, and labels the user provides. If repo is not specified, ask for it. Return the created issue URL and number.",
      outputFormat: "Created issue: repo → #number → title → URL",
    },
    {
      id: 'sys-github-list-prs',
      name: 'List Pull Requests',
      description: "Lists open pull requests from the user's GitHub repositories",
      triggerDescription: "user asks about pull requests, open PRs, code review requests, what needs review on GitHub, pending merges, check PRs",
      instructions: "Fetch open pull requests via /pulls?state=open&sort=updated&per_page=20 for the user's repositories, or use /search/issues?q=is:pr+is:open+author:{user} if repo is not known. For each PR: title, number, repository, author, review status, and last updated. Flag anything awaiting review or blocked.",
      outputFormat: "PRs by repo: #number → title → author → status → updated.",
    },
  ],

  notion: [
    {
      id: 'sys-notion-search',
      name: 'Search Notion',
      description: "Searches the user's Notion workspace for pages and databases",
      triggerDescription: "user asks to search Notion, find a page in Notion, look up notes, check Notion, what is in my Notion, find a document in Notion, search my workspace",
      instructions: "Search the user's Notion workspace via POST /search with the user's query as the search term. Retrieve up to 15 results. For each result: page title, type (page or database), last edited time, and URL. Group by type. Return a clean, readable list — no raw JSON.",
      outputFormat: "Results: title → type → last edited → link. Grouped by page/database.",
    },
    {
      id: 'sys-notion-create-page',
      name: 'Create Page',
      description: "Creates a new page in the user's Notion workspace",
      triggerDescription: "user wants to create a Notion page, add a note to Notion, write something in Notion, save to Notion, create a document in Notion",
      instructions: "Create a new page in the user's Notion workspace via POST /pages. Use the title and content the user provides. If a parent page or database is specified, use it. Otherwise create as a root page under the workspace. Return the created page title and URL.",
      outputFormat: "Created page: title → URL → parent location",
    },
  ],

  slack: [
    {
      id: 'sys-slack-read-messages',
      name: 'Read Messages',
      description: "Reads recent messages from the user's Slack channels",
      triggerDescription: "user asks to check Slack, read messages, what is in Slack, show Slack messages, any new messages on Slack, check channels, Slack inbox",
      instructions: "Fetch the user's recent Slack messages via /conversations.list to get channels, then /conversations.history?channel={id}&limit=10 for the most active ones. For each message: channel name, sender, timestamp, and message text. Surface anything that mentions the user or contains urgent keywords. Return a clean summary.",
      outputFormat: "Messages by channel: sender → message → time. Mentions/urgent flagged first.",
    },
    {
      id: 'sys-slack-send-message',
      name: 'Send Message',
      description: "Sends a message to a Slack channel or user",
      triggerDescription: "user wants to send a Slack message, post to a Slack channel, DM someone on Slack, message the team on Slack, notify on Slack",
      instructions: "Send a message via POST /chat.postMessage. Use the channel name or user ID and message text the user provides. If the channel is not found, use /conversations.list to resolve the name. Return confirmation of the sent message.",
      outputFormat: "Sent: channel/user → message preview → timestamp → status",
    },
  ],

  hubspot: [
    {
      id: 'sys-hubspot-list-contacts',
      name: 'List Contacts',
      description: "Lists recent contacts from the user's HubSpot CRM",
      triggerDescription: "user asks to check HubSpot contacts, show me CRM leads, list contacts, who is in my CRM, recent HubSpot entries, pull contacts from HubSpot",
      instructions: "Fetch recent contacts from HubSpot via /crm/v3/objects/contacts?limit=20&properties=firstname,lastname,email,phone,company,hs_lead_status. For each contact: full name, email, phone, company, and lead status. Sort by most recently created. Return a clean list — no raw JSON.",
      outputFormat: "Contacts: name → email → company → status. Total count at top.",
    },
    {
      id: 'sys-hubspot-create-contact',
      name: 'Create Contact',
      description: "Creates a new contact in the user's HubSpot CRM",
      triggerDescription: "user wants to add a contact to HubSpot, create a lead in CRM, save a new contact, add someone to HubSpot, log a new lead",
      instructions: "Create a new contact in HubSpot via POST /crm/v3/objects/contacts. Use the name, email, phone, and company the user provides. Return the created contact's ID and a confirmation.",
      outputFormat: "Created contact: name → email → company → HubSpot ID",
    },
  ],

  linear: [
    {
      id: 'sys-linear-list-issues',
      name: 'List Issues',
      description: "Lists open issues from the user's Linear workspace",
      triggerDescription: "user asks to check Linear, show me issues, what is open in Linear, list Linear tasks, what do I have to do, Linear board, check my Linear tickets",
      instructions: "Fetch the user's assigned open issues from Linear via the GraphQL endpoint. Query: { viewer { assignedIssues(filter: { state: { type: { in: [\"started\", \"unstarted\", \"backlog\"] } } }) { nodes { id title priority state { name } team { name } updatedAt } } } }. Return a clean summary grouped by priority.",
      outputFormat: "Issues by priority: title → team → state → updated. Urgent/high first.",
    },
    {
      id: 'sys-linear-create-issue',
      name: 'Create Issue',
      description: "Creates a new issue in the user's Linear workspace",
      triggerDescription: "user wants to create a Linear issue, file a task in Linear, log work in Linear, add to Linear backlog, create a ticket in Linear",
      instructions: "Create a new issue in Linear via the GraphQL mutation: mutation { issueCreate(input: { title, description, teamId, priority }) { issue { id title url } } }. Use the title, description, team, and priority the user provides. Return the created issue title and URL.",
      outputFormat: "Created issue: title → team → priority → URL",
    },
  ],
};

export async function autoInstallIntegrationSkills(
  operatorId: string,
  integrationType: string,
): Promise<void> {
  const skills = INTEGRATION_SKILLS[integrationType];
  if (!skills?.length) return;

  for (const skill of skills) {
    const [existing] = await db
      .select({ id: platformSkillsTable.id })
      .from(platformSkillsTable)
      .where(eq(platformSkillsTable.id, skill.id))
      .limit(1);

    if (!existing) {
      await db.insert(platformSkillsTable).values({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        triggerDescription: skill.triggerDescription,
        instructions: skill.instructions,
        outputFormat: skill.outputFormat,
        archetype: 'All',
        author: 'opsoul-system',
        integrationType,
      });
      console.log(`[autoInstall] seeded platform skill "${skill.name}" (${integrationType})`);
    }

    const [installed] = await db
      .select({ id: operatorSkillsTable.id, isActive: operatorSkillsTable.isActive })
      .from(operatorSkillsTable)
      .where(
        and(
          eq(operatorSkillsTable.operatorId, operatorId),
          eq(operatorSkillsTable.skillId, skill.id),
        ),
      )
      .limit(1);

    if (!installed) {
      await db.insert(operatorSkillsTable).values({
        id: crypto.randomUUID(),
        operatorId,
        skillId: skill.id,
        isActive: true,
      });
      console.log(`[autoInstall] installed skill "${skill.name}" on operator ${operatorId}`);
    } else if (!installed.isActive) {
      await db.update(operatorSkillsTable)
        .set({ isActive: true })
        .where(eq(operatorSkillsTable.id, installed.id));
      console.log(`[autoInstall] reactivated skill "${skill.name}" on operator ${operatorId}`);
    }
  }
}

export async function autoRemoveIntegrationSkills(
  operatorId: string,
  integrationType: string,
): Promise<void> {
  const skills = INTEGRATION_SKILLS[integrationType];
  if (!skills?.length) return;

  for (const skill of skills) {
    await db.update(operatorSkillsTable)
      .set({ isActive: false })
      .where(
        and(
          eq(operatorSkillsTable.operatorId, operatorId),
          eq(operatorSkillsTable.skillId, skill.id),
        ),
      );
    console.log(`[autoInstall] deactivated skill "${skill.name}" for operator ${operatorId} (${integrationType} disconnected)`);
  }
}

export function getSupportedIntegrationTypes(): string[] {
  return Object.keys(INTEGRATION_SKILLS);
}

export async function backfillIntegrationSkills(): Promise<void> {
  const integrations = await db
    .select({
      operatorId: operatorIntegrationsTable.operatorId,
      integrationType: operatorIntegrationsTable.integrationType,
    })
    .from(operatorIntegrationsTable);

  const seen = new Set<string>();
  for (const row of integrations) {
    const key = `${row.operatorId}:${row.integrationType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await autoInstallIntegrationSkills(row.operatorId, row.integrationType);
  }

  if (seen.size > 0) {
    console.log(`[autoInstall] backfill complete — ${seen.size} operator+integration pair(s) ensured`);
  }
}
