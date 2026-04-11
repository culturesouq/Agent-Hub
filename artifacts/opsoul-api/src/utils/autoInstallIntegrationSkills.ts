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

// Run on API startup — idempotent backfill for any operator that already has integrations connected
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
