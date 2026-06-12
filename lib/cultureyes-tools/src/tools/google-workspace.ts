/**
 * Google Workspace tools — Calendar (6) + Drive (7).
 *
 * Ported from OpSoul's `handleCalendar*` / `handleDrive*` handlers: identical
 * Google API endpoints, payload shapes, ISO-8601 time handling, partial PATCH
 * updates, free/busy query, 10-result caps, Drive query syntax, Google-Docs
 * text export (10 KB cap), multipart upload (text + base64 binary), folder
 * create, add/remove-parent move + rename, trash soft-delete, and permission
 * sharing.
 *
 * PLUGGABLE BACKEND: each tool resolves a `GoogleWorkspaceConnector` from
 * `ctx.connectors.googleWorkspace`; absent that, a default connector talks to
 * the Google Calendar/Drive REST APIs with the OAuth bearer token read from
 * `ctx.secrets.get("GOOGLE_OAUTH_TOKEN")`. When the token is missing the tools
 * return a graceful, non-fatal `ok:false` "not connected" result rather than
 * throwing.
 */

import type { ToolContext, ToolDef, ToolResult } from "@cultureyes/types";
import { ok, requireString } from "./_shared.js";

// ─── Pluggable connector ────────────────────────────────────────────────────
//
// One adapter surface for both Calendar and Drive. A deployment swaps the whole
// backend by attaching its own implementation; the default below speaks the
// real Google REST APIs. `request` returns the raw response text exactly like
// OpSoul's `callOAuth` did, so callers stay backend-agnostic.

/** A Google Workspace backend (default = Google REST APIs — pluggable). */
export interface GoogleWorkspaceConnector {
  name: string;
  /**
   * Perform an authenticated HTTP call against a Google API and return the raw
   * response body as text. `body` may be a JSON object (sent as
   * application/json) or a pre-built string (e.g. multipart); pass
   * `extraHeaders` to override Content-Type for multipart uploads.
   */
  request(
    method: string,
    url: string,
    body?: Record<string, unknown> | string,
    extraHeaders?: Record<string, string>,
  ): Promise<string>;
}

/** Reads `ctx.connectors.googleWorkspace` without widening the public type. */
function workspaceConnector(
  ctx: ToolContext,
): GoogleWorkspaceConnector | undefined {
  const bag = (ctx as unknown as {
    connectors?: { googleWorkspace?: GoogleWorkspaceConnector };
  }).connectors;
  return bag?.googleWorkspace;
}

/**
 * Default connector: calls the Google REST APIs with the OAuth bearer token
 * from `ctx.secrets`. Resolves to `null` when the token is absent so the tool
 * can return a clean "not connected" result instead of throwing.
 */
async function defaultConnector(
  ctx: ToolContext,
): Promise<GoogleWorkspaceConnector | null> {
  const token = await ctx.secrets.get("GOOGLE_OAUTH_TOKEN");
  if (!token) return null;
  return {
    name: "google-rest",
    async request(method, url, body, extraHeaders) {
      const isString = typeof body === "string";
      const res = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": isString ? "text/plain" : "application/json",
          ...extraHeaders,
        },
        body:
          body === undefined
            ? undefined
            : isString
              ? (body as string)
              : JSON.stringify(body),
      });
      return await res.text();
    },
  };
}

/** Standard "not connected" failure when no token/connector is available. */
function notConnected(tool: string): ToolResult {
  return {
    ok: false,
    content: `${tool} is not connected for this deployment.`,
    error: "GOOGLE_OAUTH_TOKEN not provisioned",
  };
}

/** Resolve the connector to use, or `null` when Google is not connected. */
async function resolveConnector(
  ctx: ToolContext,
): Promise<GoogleWorkspaceConnector | null> {
  return workspaceConnector(ctx) ?? (await defaultConnector(ctx));
}

// ─── local param helpers ────────────────────────────────────────────────────

/** Optional string param: returns the value only when it is a non-empty string. */
function optionalString(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = params[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** True when a string param key was explicitly provided (any string value). */
function hasString(params: Record<string, unknown>, key: string): boolean {
  return typeof params[key] === "string";
}

const enc = encodeURIComponent;

// ─── Calendar ───────────────────────────────────────────────────────────────

const calendarCreateEvent: ToolDef = {
  name: "calendar_create_event",
  description:
    'Creates a new event on the primary Google Calendar. Times in ISO-8601 (e.g. "2026-05-25T10:00:00+04:00").',
  domain: "calendar",
  schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Event title." },
      startIso: {
        type: "string",
        description: "Start time (ISO 8601 with timezone).",
      },
      endIso: {
        type: "string",
        description: "End time (ISO 8601 with timezone).",
      },
      description: { type: "string", description: "Optional description." },
      location: { type: "string", description: "Optional location." },
    },
    required: ["summary", "startIso", "endIso"],
  },
  async execute(params, ctx) {
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("calendar_create_event");
    const summary = requireString(params, "summary");
    const startIso = requireString(params, "startIso");
    const endIso = requireString(params, "endIso");
    const body: Record<string, unknown> = {
      summary,
      start: { dateTime: startIso },
      end: { dateTime: endIso },
    };
    const description = optionalString(params, "description");
    const location = optionalString(params, "location");
    if (description !== undefined) body.description = description;
    if (location !== undefined) body.location = location;
    const result = await conn.request(
      "POST",
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      body,
    );
    return ok(`Created calendar event "${summary}".`, { raw: result });
  },
};

const calendarListEvents: ToolDef = {
  name: "calendar_list_events",
  description:
    "Returns up to 10 upcoming events from the primary calendar within the given window.",
  domain: "calendar",
  schema: {
    type: "object",
    properties: {
      timeMinIso: {
        type: "string",
        description: "Window start (ISO 8601). Default: now.",
      },
      timeMaxIso: {
        type: "string",
        description: "Window end (ISO 8601). Default: 7 days from now.",
      },
    },
    required: [],
  },
  async execute(params, ctx) {
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("calendar_list_events");
    const tMin = optionalString(params, "timeMinIso") ?? new Date().toISOString();
    const tMax =
      optionalString(params, "timeMaxIso") ??
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${enc(
      tMin,
    )}&timeMax=${enc(tMax)}&maxResults=10&singleEvents=true&orderBy=startTime`;
    const result = await conn.request("GET", url);
    return ok("Listed calendar events for the requested window.", {
      raw: result,
    });
  },
};

const calendarUpdateEvent: ToolDef = {
  name: "calendar_update_event",
  description:
    "Modify an existing calendar event (reschedule, rename, change location/description). Partial update: only the fields you pass are changed. Get the eventId from calendar_list_events or calendar_search_events first.",
  domain: "calendar",
  schema: {
    type: "object",
    properties: {
      eventId: {
        type: "string",
        description: "Event id from calendar_list_events.",
      },
      summary: { type: "string", description: "Optional new title." },
      startIso: {
        type: "string",
        description: "Optional new start time (ISO 8601).",
      },
      endIso: {
        type: "string",
        description: "Optional new end time (ISO 8601).",
      },
      description: { type: "string", description: "Optional new description." },
      location: { type: "string", description: "Optional new location." },
    },
    required: ["eventId"],
  },
  async execute(params, ctx) {
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("calendar_update_event");
    const eventId = requireString(params, "eventId");
    // Build partial body — only set fields the caller passed.
    const body: Record<string, unknown> = {};
    if (hasString(params, "summary")) body.summary = params.summary;
    if (hasString(params, "description"))
      body.description = params.description;
    if (hasString(params, "location")) body.location = params.location;
    if (hasString(params, "startIso"))
      body.start = { dateTime: params.startIso };
    if (hasString(params, "endIso")) body.end = { dateTime: params.endIso };
    if (Object.keys(body).length === 0) {
      return {
        ok: false,
        content:
          "calendar_update_event: at least one field to update must be provided.",
        error: "no update fields",
      };
    }
    const result = await conn.request(
      "PATCH",
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${enc(
        eventId,
      )}`,
      body,
    );
    return ok(`Updated calendar event ${eventId}.`, { raw: result });
  },
};

const calendarDeleteEvent: ToolDef = {
  name: "calendar_delete_event",
  description:
    "Permanently remove an event from the primary calendar. Cannot be undone via this tool — get user confirmation if the event is high-importance.",
  domain: "calendar",
  schema: {
    type: "object",
    properties: {
      eventId: { type: "string", description: "Event id to delete." },
    },
    required: ["eventId"],
  },
  async execute(params, ctx) {
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("calendar_delete_event");
    const eventId = requireString(params, "eventId");
    const result = await conn.request(
      "DELETE",
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${enc(
        eventId,
      )}`,
    );
    return ok(`Deleted event ${eventId}.`, { raw: result });
  },
};

const calendarSearchEvents: ToolDef = {
  name: "calendar_search_events",
  description:
    "Find events by keyword across summary/description/location/attendees. Optional time window. Returns up to 10 matches with ids.",
  domain: "calendar",
  schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free-text search query." },
      timeMinIso: {
        type: "string",
        description: "Optional window start (ISO 8601). Default: 30 days ago.",
      },
      timeMaxIso: {
        type: "string",
        description:
          "Optional window end (ISO 8601). Default: 90 days from now.",
      },
    },
    required: ["query"],
  },
  async execute(params, ctx) {
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("calendar_search_events");
    const query = requireString(params, "query");
    const tMin =
      optionalString(params, "timeMinIso") ??
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const tMax =
      optionalString(params, "timeMaxIso") ??
      new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${enc(
      query,
    )}&timeMin=${enc(tMin)}&timeMax=${enc(
      tMax,
    )}&maxResults=10&singleEvents=true&orderBy=startTime`;
    const result = await conn.request("GET", url);
    return ok(`Searched calendar events for "${query}".`, { raw: result });
  },
};

const calendarFreeBusy: ToolDef = {
  name: "calendar_free_busy",
  description:
    "Find open time slots between two timestamps on the primary calendar. Returns busy blocks; the operator infers the free gaps. Use when scheduling meetings.",
  domain: "calendar",
  schema: {
    type: "object",
    properties: {
      timeMinIso: { type: "string", description: "Window start (ISO 8601)." },
      timeMaxIso: { type: "string", description: "Window end (ISO 8601)." },
    },
    required: ["timeMinIso", "timeMaxIso"],
  },
  async execute(params, ctx) {
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("calendar_free_busy");
    const timeMinIso = requireString(params, "timeMinIso");
    const timeMaxIso = requireString(params, "timeMaxIso");
    const result = await conn.request(
      "POST",
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        timeMin: timeMinIso,
        timeMax: timeMaxIso,
        items: [{ id: "primary" }],
      },
    );
    return ok("Retrieved free/busy blocks for the requested window.", {
      raw: result,
    });
  },
};

// ─── Drive ──────────────────────────────────────────────────────────────────

const driveSearch: ToolDef = {
  name: "drive_search",
  description:
    "Searches the connected Google Drive for files matching a name fragment or query. Returns up to 10 results (id, name, mimeType).",
  domain: "drive",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search text (filename fragment or Drive query syntax).",
      },
    },
    required: ["query"],
  },
  async execute(params, ctx) {
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("drive_search");
    const query = requireString(params, "query");
    const q = `name contains '${query.replace(/'/g, "\\'")}'`;
    const result = await conn.request(
      "GET",
      `https://www.googleapis.com/drive/v3/files?q=${enc(
        q,
      )}&pageSize=10&fields=files(id,name,mimeType)`,
    );
    return ok(`Searched Drive for "${query}".`, { raw: result });
  },
};

const driveReadFile: ToolDef = {
  name: "drive_read_file",
  description:
    "Downloads a Drive file by id and returns its text content (up to 10 KB). Google Docs are exported as plain text.",
  domain: "drive",
  schema: {
    type: "object",
    properties: {
      fileId: { type: "string", description: "Drive file id from drive_search." },
    },
    required: ["fileId"],
  },
  async execute(params, ctx) {
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("drive_read_file");
    const fileId = requireString(params, "fileId");
    // Try export-as-text first (works for Google Docs). For binary files, fall
    // back to alt=media. Mirror OpSoul's HTTP/error sniff + 10 KB cap.
    const exportRes = await conn.request(
      "GET",
      `https://www.googleapis.com/drive/v3/files/${enc(
        fileId,
      )}/export?mimeType=text/plain`,
    );
    if (exportRes.startsWith("HTTP") || exportRes.includes('"error"')) {
      const media = await conn.request(
        "GET",
        `https://www.googleapis.com/drive/v3/files/${enc(fileId)}?alt=media`,
      );
      return ok(`Read Drive file ${fileId}.`, { text: media.slice(0, 10000) });
    }
    return ok(`Read Drive file ${fileId}.`, { text: exportRes.slice(0, 10000) });
  },
};

const driveUploadFile: ToolDef = {
  name: "drive_upload_file",
  description:
    "Upload a new text file to Drive (or a specific folder). For binary uploads use base64-encoded content with the correct mimeType.",
  domain: "drive",
  schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: 'File name (with extension, e.g. "notes.md").',
      },
      content: {
        type: "string",
        description:
          "File content (plain text by default; base64 if mimeType is binary).",
      },
      mimeType: {
        type: "string",
        description:
          'MIME type (default "text/plain"). Use "text/markdown", "application/pdf", etc. as needed.',
      },
      parentFolderId: {
        type: "string",
        description:
          "Optional parent folder id. If omitted, file lands in My Drive root.",
      },
    },
    required: ["name", "content"],
  },
  async execute(params, ctx) {
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("drive_upload_file");
    const name = requireString(params, "name");
    if (typeof params.content !== "string") {
      return {
        ok: false,
        content: 'drive_upload_file requires "name" and "content".',
        error: "missing content",
      };
    }
    const content = params.content;
    const mt = optionalString(params, "mimeType") ?? "text/plain";
    const parentFolderId = optionalString(params, "parentFolderId");
    // Multipart upload — metadata + content in one request.
    const boundary = `cultureyes_boundary_${Date.now()}`;
    const metadata: Record<string, unknown> = { name, mimeType: mt };
    if (parentFolderId) metadata.parents = [parentFolderId];
    const multipartBody =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mt}\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;
    const result = await conn.request(
      "POST",
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink",
      multipartBody,
      { "Content-Type": `multipart/related; boundary=${boundary}` },
    );
    return ok(`Uploaded "${name}" to Drive.`, { raw: result });
  },
};

const driveCreateFolder: ToolDef = {
  name: "drive_create_folder",
  description:
    "Create a new folder in Google Drive. Returns the folder id for use with drive_upload_file or drive_move_file.",
  domain: "drive",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Folder name." },
      parentFolderId: {
        type: "string",
        description: "Optional parent folder id. Omit for root.",
      },
    },
    required: ["name"],
  },
  async execute(params, ctx) {
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("drive_create_folder");
    const name = requireString(params, "name");
    const body: Record<string, unknown> = {
      name,
      mimeType: "application/vnd.google-apps.folder",
    };
    const parentFolderId = optionalString(params, "parentFolderId");
    if (parentFolderId) body.parents = [parentFolderId];
    const result = await conn.request(
      "POST",
      "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",
      body,
    );
    return ok(`Created Drive folder "${name}".`, { raw: result });
  },
};

const driveMoveFile: ToolDef = {
  name: "drive_move_file",
  description:
    "Move a Drive file to a different folder, rename it, or both. Pass newName to rename, newParentFolderId to move, oldParentFolderId so the old parent is removed cleanly.",
  domain: "drive",
  schema: {
    type: "object",
    properties: {
      fileId: { type: "string", description: "File id to move/rename." },
      newName: { type: "string", description: "Optional new name." },
      newParentFolderId: {
        type: "string",
        description: "Optional new parent folder id.",
      },
      oldParentFolderId: {
        type: "string",
        description:
          "Optional old parent folder id (provide to cleanly move; omit if file currently in root).",
      },
    },
    required: ["fileId"],
  },
  async execute(params, ctx) {
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("drive_move_file");
    const fileId = requireString(params, "fileId");
    const newName = optionalString(params, "newName");
    const newParentFolderId = optionalString(params, "newParentFolderId");
    const oldParentFolderId = optionalString(params, "oldParentFolderId");
    if (!newName && !newParentFolderId) {
      return {
        ok: false,
        content:
          'drive_move_file: provide "newName" or "newParentFolderId" (or both).',
        error: "no move/rename target",
      };
    }
    // Build URL query for parent changes.
    const query: string[] = ["fields=id,name,parents,webViewLink"];
    if (newParentFolderId) query.push(`addParents=${enc(newParentFolderId)}`);
    if (oldParentFolderId) query.push(`removeParents=${enc(oldParentFolderId)}`);
    const url = `https://www.googleapis.com/drive/v3/files/${enc(
      fileId,
    )}?${query.join("&")}`;
    const body: Record<string, unknown> = {};
    if (newName) body.name = newName;
    const result = await conn.request("PATCH", url, body);
    return ok(`Moved/renamed Drive file ${fileId}.`, { raw: result });
  },
};

const driveDeleteFile: ToolDef = {
  name: "drive_delete_file",
  description:
    "Soft-delete a Drive file (moves to Trash; recoverable for 30 days). Use this rather than permanent deletion — preserves user safety.",
  domain: "drive",
  schema: {
    type: "object",
    properties: {
      fileId: { type: "string", description: "File id to trash." },
    },
    required: ["fileId"],
  },
  async execute(params, ctx) {
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("drive_delete_file");
    const fileId = requireString(params, "fileId");
    // Soft-delete: PATCH trashed=true. Recoverable for 30 days.
    const result = await conn.request(
      "PATCH",
      `https://www.googleapis.com/drive/v3/files/${enc(
        fileId,
      )}?fields=id,name,trashed`,
      { trashed: true },
    );
    return ok(`Trashed file ${fileId} (recoverable for 30 days).`, {
      raw: result,
    });
  },
};

const driveShareFile: ToolDef = {
  name: "drive_share_file",
  description:
    "Add a permission to a Drive file: share with a specific person (by email), a domain, or anyone-with-the-link. Choose role: reader, commenter, or writer.",
  domain: "drive",
  schema: {
    type: "object",
    properties: {
      fileId: { type: "string", description: "File id to share." },
      role: {
        type: "string",
        enum: ["reader", "commenter", "writer"],
        description: "Permission level granted.",
      },
      type: {
        type: "string",
        enum: ["user", "group", "domain", "anyone"],
        description: "Permission type.",
      },
      emailAddress: {
        type: "string",
        description: "Required when type is user or group. Recipient email.",
      },
      domain: {
        type: "string",
        description: 'Required when type is domain. e.g. "example.com".',
      },
    },
    required: ["fileId", "role", "type"],
  },
  async execute(params, ctx) {
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("drive_share_file");
    const fileId = requireString(params, "fileId");
    const role = requireString(params, "role");
    const type = requireString(params, "type");
    const emailAddress = optionalString(params, "emailAddress");
    const domain = optionalString(params, "domain");
    if ((type === "user" || type === "group") && !emailAddress) {
      return {
        ok: false,
        content: "drive_share_file: type=user|group requires \"emailAddress\".",
        error: "missing emailAddress",
      };
    }
    if (type === "domain" && !domain) {
      return {
        ok: false,
        content: 'drive_share_file: type=domain requires "domain".',
        error: "missing domain",
      };
    }
    const body: Record<string, unknown> = { role, type };
    if (emailAddress) body.emailAddress = emailAddress;
    if (domain) body.domain = domain;
    const result = await conn.request(
      "POST",
      `https://www.googleapis.com/drive/v3/files/${enc(
        fileId,
      )}/permissions?fields=id,role,type,emailAddress`,
      body,
    );
    return ok(`Shared Drive file ${fileId} (${role}/${type}).`, {
      raw: result,
    });
  },
};

// ─── export ─────────────────────────────────────────────────────────────────

export const googleWorkspaceTools: ToolDef[] = [
  calendarCreateEvent,
  calendarListEvents,
  calendarUpdateEvent,
  calendarDeleteEvent,
  calendarSearchEvents,
  calendarFreeBusy,
  driveSearch,
  driveReadFile,
  driveUploadFile,
  driveCreateFolder,
  driveMoveFile,
  driveDeleteFile,
  driveShareFile,
];
