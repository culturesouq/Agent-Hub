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
      description: "Checks the user's Gmail inbox and reports unread message count and status",
      triggerDescription: "user asks to check email, read inbox, pull emails, see messages, check if Gmail is working, what is in my inbox, show me emails, how many emails do I have, pull the full inbox, proceed with email, go ahead and check, any Gmail or email-related request",
      instructions: "Call the Gmail API endpoint: /users/me/messages?q=is:unread&maxResults=1. The response will contain a 'resultSizeEstimate' field with the total unread count, and a 'messages' array with message IDs. Use 'resultSizeEstimate' as the unread count. Report: how many unread messages are in the inbox, that the Gmail connection is confirmed live, and that the system has read access. Do NOT ask for permission to pull more details. Do NOT promise to fetch sender names or subjects — the current API call does not return that content. Just report the count and confirm the connection is working.",
      outputFormat: "Gmail status: X unread messages. Connection confirmed and live. Read access verified.",
    },
    {
      id: 'sys-gmail-send',
      name: 'Send Email',
      description: "Drafts an email for the user to review and send",
      triggerDescription: "user wants to send an email, reply to someone, draft and send a message, compose and send email, email someone",
      instructions: "Draft a complete email for the user based on the recipient, subject, and message they describe. Format the draft clearly showing: To, Subject, and Body. Present it as ready to send and ask the user to confirm before sending. Do NOT claim to have sent the email — you are presenting a draft for their approval.",
      outputFormat: "Draft ready:\nTo: [recipient]\nSubject: [subject]\n\n[body]\n\n— Confirm to send.",
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
      description: "Drafts a calendar event for the user to confirm",
      triggerDescription: "user wants to schedule a meeting, add an event to calendar, block time, create a calendar event, set a reminder",
      instructions: "Prepare a calendar event draft based on the details the user provides: title, date, time, duration, attendees, description. Present the event details clearly and ask the user to confirm before creating. Do NOT claim to have created the event — you are presenting a draft for their approval.",
      outputFormat: "Event draft:\nTitle: [title]\nDate: [date]\nTime: [time]\nAttendees: [list]\n\n— Confirm to create.",
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
      instructions: "Fetch open issues assigned to the user from GitHub via /issues?filter=assigned&state=open&sort=updated&per_page=20. The response is a full JSON array — each issue has: 'title', 'number', 'repository_url' (extract repo name from it), 'labels' (array of label objects, use 'name' field), 'updated_at'. Report a clean summary — no raw JSON, no URLs.",
      outputFormat: "Issues by repo: #number → title → labels → updated. Total count at top.",
    },
    {
      id: 'sys-github-create-issue',
      name: 'Create Issue',
      description: "Drafts a GitHub issue for the user to review",
      triggerDescription: "user wants to file a bug, create a GitHub issue, report a problem, open an issue, log a bug on GitHub",
      instructions: "Draft a GitHub issue based on what the user describes: title, description, and labels. Present the draft clearly showing the repo (ask if not specified), title, body, and labels. Ask the user to confirm before filing. Do NOT claim to have created the issue — you are presenting a draft for their approval.",
      outputFormat: "Issue draft:\nRepo: [repo]\nTitle: [title]\nLabels: [labels]\n\n[body]\n\n— Confirm to file.",
    },
    {
      id: 'sys-github-list-prs',
      name: 'List Pull Requests',
      description: "Lists open pull requests from the user's GitHub repositories",
      triggerDescription: "user asks about pull requests, open PRs, code review requests, what needs review on GitHub, pending merges, check PRs",
      instructions: "Fetch open pull requests using GitHub search via /search/issues?q=is:pr+is:open+involves:{user}&sort=updated&per_page=20. The response has a 'items' array — each has 'title', 'number', 'repository_url' (extract repo name), 'user.login', 'updated_at', 'labels'. Report a clean summary grouped by repo — no raw JSON.",
      outputFormat: "PRs by repo: #number → title → author → updated.",
    },
  ],

  notion: [
    {
      id: 'sys-notion-search',
      name: 'Search Notion',
      description: "Searches the user's Notion workspace for pages and databases",
      triggerDescription: "user asks to search Notion, find a page in Notion, look up notes, check Notion, what is in my Notion, find a document in Notion, search my workspace",
      instructions: "Search the user's Notion workspace. The search term from the user's request will be used to query the Notion search API. The response is a JSON object with a 'results' array — each result has 'object' (page or database), 'url', and 'properties' or 'title' fields. Extract the page title from 'properties.title.title[0].plain_text' or 'title[0].plain_text'. Report up to 15 results grouped by type. No raw JSON.",
      outputFormat: "Results: title → type → link. Grouped by page/database.",
    },
    {
      id: 'sys-notion-create-page',
      name: 'Create Page',
      description: "Drafts a Notion page for the user to confirm",
      triggerDescription: "user wants to create a Notion page, add a note to Notion, write something in Notion, save to Notion, create a document in Notion",
      instructions: "Draft a Notion page based on the title and content the user provides. Present the draft clearly and ask the user to confirm before creating. Do NOT claim to have created the page — you are presenting a draft for their approval.",
      outputFormat: "Page draft:\nTitle: [title]\nContent: [content]\n\n— Confirm to create.",
    },
  ],

  slack: [
    {
      id: 'sys-slack-read-messages',
      name: 'Read Messages',
      description: "Lists the user's Slack channels with unread activity",
      triggerDescription: "user asks to check Slack, read messages, what is in Slack, show Slack messages, any new messages on Slack, check channels, Slack inbox, what is new on Slack",
      instructions: "Fetch the user's Slack workspace channels via /conversations.list?exclude_archived=true&limit=10&types=public_channel,private_channel. The response has a 'channels' array — each channel has 'name', 'unread_count', and 'latest' (most recent message). Report: which channels have unread messages, how many unread each, and a preview of the latest message if available. No raw JSON.",
      outputFormat: "Channels with activity: #channel-name → X unread → latest preview. Sorted by activity.",
    },
    {
      id: 'sys-slack-send-message',
      name: 'Send Message',
      description: "Drafts a Slack message for the user to review",
      triggerDescription: "user wants to send a Slack message, post to a Slack channel, DM someone on Slack, message the team on Slack, notify on Slack",
      instructions: "Draft a Slack message based on the channel and message content the user provides. Present the draft clearly and ask the user to confirm before sending. Do NOT claim to have sent the message — you are presenting a draft for their approval.",
      outputFormat: "Message draft:\nTo: #[channel] / @[user]\nMessage: [text]\n\n— Confirm to send.",
    },
  ],

  hubspot: [
    {
      id: 'sys-hubspot-list-contacts',
      name: 'List Contacts',
      description: "Lists recent contacts from the user's HubSpot CRM",
      triggerDescription: "user asks to check HubSpot contacts, show me CRM leads, list contacts, who is in my CRM, recent HubSpot entries, pull contacts from HubSpot",
      instructions: "Fetch recent contacts from HubSpot via /crm/v3/objects/contacts?limit=20&properties=firstname,lastname,email,phone,company,hs_lead_status&sorts=createdate. The response has a 'results' array — each contact has 'properties' with firstname, lastname, email, phone, company, hs_lead_status. Report a clean list — no raw JSON.",
      outputFormat: "Contacts: name → email → company → status. Total count at top.",
    },
    {
      id: 'sys-hubspot-create-contact',
      name: 'Create Contact',
      description: "Drafts a HubSpot contact for the user to confirm",
      triggerDescription: "user wants to add a contact to HubSpot, create a lead in CRM, save a new contact, add someone to HubSpot, log a new lead",
      instructions: "Draft a HubSpot contact record based on the name, email, phone, and company the user provides. Present the details clearly and ask the user to confirm before creating. Do NOT claim to have created the contact — you are presenting a draft for their approval.",
      outputFormat: "Contact draft:\nName: [name]\nEmail: [email]\nCompany: [company]\nPhone: [phone]\n\n— Confirm to add.",
    },
  ],

  linear: [
    {
      id: 'sys-linear-list-issues',
      name: 'List Issues',
      description: "Lists open issues from the user's Linear workspace",
      triggerDescription: "user asks to check Linear, show me issues, what is open in Linear, list Linear tasks, what do I have to do, Linear board, check my Linear tickets",
      instructions: "Query the user's assigned open issues from Linear using GraphQL: { viewer { assignedIssues(filter: { state: { type: { in: [\"started\", \"unstarted\", \"backlog\"] } } }, first: 20) { nodes { id title priority state { name } team { name } updatedAt } } } }. The response has data.viewer.assignedIssues.nodes — each node has title, priority (0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low), state.name, team.name, updatedAt. Return a clean summary grouped by priority — no raw JSON.",
      outputFormat: "Issues by priority: title → team → state → updated. Urgent/high first.",
    },
    {
      id: 'sys-linear-create-issue',
      name: 'Create Issue',
      description: "Drafts a Linear issue for the user to confirm",
      triggerDescription: "user wants to create a Linear issue, file a task in Linear, log work in Linear, add to Linear backlog, create a ticket in Linear",
      instructions: "Draft a Linear issue based on the title, description, team, and priority the user provides. Present the draft clearly and ask the user to confirm before creating. Do NOT claim to have created the issue — you are presenting a draft for their approval.",
      outputFormat: "Issue draft:\nTitle: [title]\nTeam: [team]\nPriority: [priority]\n\n[description]\n\n— Confirm to create.",
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
    } else {
      await db.update(platformSkillsTable)
        .set({
          name: skill.name,
          description: skill.description,
          triggerDescription: skill.triggerDescription,
          instructions: skill.instructions,
          outputFormat: skill.outputFormat,
        })
        .where(eq(platformSkillsTable.id, skill.id));
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
