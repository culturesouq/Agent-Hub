/**
 * Scope validation for the Scope-Isolated Conversation Architecture.
 *
 * Rule: the platform always sets scopeId in the request body.
 * The server validates — never derives scope automatically.
 *
 * Five distinct scope types — the operator is told which one they are in,
 * who they are with, and which conversation reference applies, on every turn.
 * Memory and history never cross between scopes.
 *
 *   owner           — the operator's owner (the person who shaped the operator)
 *                     speaking from the Hub UI workspace. Persistent.
 *   public          — guest visitor. No userId. Session-only. Layer 1 in-memory.
 *                     Forgotten when the session ends.
 *   authenticated   — a third-party authenticated user (e.g. a Nahil farmer).
 *                     Persistent conversation + persistent Layer 1 in DB.
 *                     Memories from prior conversations with this same user
 *                     are available; nothing crosses to other users.
 *   action          — programmatic action call. No human reading. No conversation
 *                     written. Structured input/output. Layer 2 patterns distilled.
 *   channel         — webhook-driven channel (Telegram, WhatsApp, future).
 *                     Persistent per channel + caller. Caller identity comes from
 *                     the platform's caller field (chat_id, phone number, etc.).
 */

export type ScopeType = 'owner' | 'public' | 'authenticated' | 'action' | 'channel';

export interface ValidatedScope {
  /** Stored in DB — e.g. "authenticated:usr_123", "channel:whatsapp:+971..." */
  scopeId: string;
  scopeType: ScopeType;
  scopeTrust: string;
  userId?: string;
  channelName?: string;
  channelCallerId?: string;
  /** Whether this scope writes conversation history to the DB */
  writesHistory: boolean;
  /** Whether Layer 1 endpoint memory is persisted (false = in-memory session only) */
  persistsLayer1: boolean;
}

export interface ScopeError {
  error: string;
  statusCode: 400 | 401;
}

export function isScopeError(v: ValidatedScope | ScopeError): v is ScopeError {
  return 'error' in v;
}

/**
 * Validates a client-provided scopeId + userId from the request body.
 * Used by: /v1/public-chat and any future client-facing chat endpoints.
 *
 * Returns ScopeError if invalid — caller must send 400/401 and return.
 */
export function validateScope(
  rawScopeId: string | undefined,
  userId?: string,
): ValidatedScope | ScopeError {
  if (!rawScopeId?.trim()) {
    return { error: 'scopeId is required', statusCode: 400 };
  }

  const scopeId = rawScopeId.trim();

  if (scopeId === 'public') {
    return {
      scopeId:       'public',
      scopeType:     'public',
      scopeTrust:    'guest',
      writesHistory:  false,
      persistsLayer1: false,
    };
  }

  if (scopeId === 'authenticated') {
    if (!userId?.trim()) {
      return { error: 'userId is required for authenticated scope', statusCode: 400 };
    }
    return {
      scopeId:       `authenticated:${userId.trim()}`,
      scopeType:     'authenticated',
      scopeTrust:    'authenticated',
      userId:         userId.trim(),
      writesHistory:  true,
      persistsLayer1: true,
    };
  }

  if (scopeId === 'action') {
    return {
      scopeId:       'action',
      scopeType:     'action',
      scopeTrust:    'authenticated',
      writesHistory:  false,
      persistsLayer1: false,
    };
  }

  if (scopeId.startsWith('channel_')) {
    const channelName = scopeId.slice('channel_'.length);
    if (!channelName) {
      return { error: 'channel name is required in scopeId (e.g. channel_whatsapp)', statusCode: 400 };
    }
    if (!userId?.trim()) {
      return { error: `userId (channel caller identifier) is required for ${scopeId} scope`, statusCode: 400 };
    }
    return {
      scopeId:          `channel:${channelName}:${userId.trim()}`,
      scopeType:        'channel',
      scopeTrust:       'authenticated',
      channelName,
      channelCallerId:  userId.trim(),
      writesHistory:    true,
      persistsLayer1:   true,
    };
  }

  return {
    error: `Invalid scopeId: "${scopeId}". Valid values: public | authenticated | action | channel_<name>`,
    statusCode: 400,
  };
}

/**
 * Builds scope for the owner workspace.
 * Called by authenticated owner routes — ownerId is already verified by middleware.
 *
 * Note on scopeId format: kept as `authenticated:${ownerId}` for backward
 * compatibility with existing owner-chat conversations and memories already
 * persisted under that prefix. The scopeType is now distinctly 'owner', so
 * the operator is told precisely which scope they are in even though the
 * underlying DB key shape did not change. A separate owner-approved
 * migration may later rewrite scopeIds to the cleaner `owner:` prefix; until
 * then this preserves the owner's accumulated history.
 */
export function buildOwnerScope(ownerId: string): ValidatedScope {
  return {
    scopeId:       `authenticated:${ownerId}`,
    scopeType:     'owner',
    scopeTrust:    'owner',
    userId:         ownerId,
    writesHistory:  true,
    persistsLayer1: true,
  };
}

/**
 * Builds scope for webhook integrations (Telegram, WhatsApp).
 * Caller identity is verified by the webhook secret — server-trusted, not client-provided.
 */
export function buildChannelScope(
  channelName: 'telegram' | 'whatsapp',
  callerId: string,
): ValidatedScope {
  return {
    scopeId:         `channel:${channelName}:${callerId}`,
    scopeType:       'channel',
    scopeTrust:      'authenticated',
    channelName,
    channelCallerId: callerId,
    writesHistory:   true,
    persistsLayer1:  true,
  };
}

/**
 * Builds scope for deployment slot (public-chat endpoint).
 * The slot's surfaceType determines which scope type applies.
 */
export function buildSlotScope(
  surfaceType: string,
  scopeTrust: string,
  slotId: string,
  userId?: string,
): ValidatedScope {
  if (surfaceType === 'authenticated' && userId) {
    return {
      scopeId:       `authenticated:${userId}`,
      scopeType:     'authenticated',
      scopeTrust:    scopeTrust ?? 'authenticated',
      userId,
      writesHistory:  true,
      persistsLayer1: true,
    };
  }

  // guest / widget / any non-authenticated slot = public scope
  return {
    scopeId:       `public:${slotId}`,
    scopeType:     'public',
    scopeTrust:    'guest',
    writesHistory:  false,
    persistsLayer1: false,
  };
}

// ─── Scope Context — what the operator sees about WHERE they are ───────────
//
// Every chat turn opens with a short paragraph describing the current scope.
// The operator reads this BEFORE its identity, knowledge, or character. It
// establishes:
//   1. The place (private workspace / public conversation / channel / action)
//   2. The person (owner, authenticated user with id, anonymous visitor,
//      caller phone or handle, programmatic workflow)
//   3. The conversation reference (DB conversationId or session id)
//   4. What memory continuity applies — explicitly scope-bound prose, no
//      mention of tables, vectors, or retrieval mechanics. The operator
//      simply knows what they remember in this scope and what they don't.
//
// This is NOT architecture exposure — there is no platform vocabulary, no
// engine names, no internal mechanics. Just the operator's situational
// awareness of where it is and who it is with. Same way a person walking
// into a room reads the room before they speak.

export interface ScopeContextInput {
  scope: ValidatedScope;
  /** DB conversation id for owner / authenticated / channel scopes. Session id for public. Null for action. */
  conversationId?: string | null;
  /** Owner's display name, when available. Falls back to "your owner" if absent. */
  ownerName?: string | null;
  /** Action verb, when applicable to action scope. */
  actionName?: string | null;
}

export function buildScopeContext(input: ScopeContextInput): string {
  const { scope, conversationId, ownerName, actionName } = input;

  switch (scope.scopeType) {
    case 'owner': {
      const who = ownerName?.trim()
        ? `your owner ${ownerName.trim()}`
        : 'your owner';
      const lines = [
        `You are in your private workspace with ${who}.`,
      ];
      if (conversationId) {
        lines.push(`Conversation: ${conversationId}.`);
      }
      lines.push(
        'This is the person who shaped you. Everything you remember of prior conversations with them in this workspace is yours; it does not reach anyone else.',
      );
      return lines.join('\n');
    }

    case 'authenticated': {
      const who = scope.userId ? `an authenticated user (id: ${scope.userId})` : 'an authenticated user';
      const lines = [
        `You are speaking with ${who}.`,
      ];
      if (conversationId) {
        lines.push(`Conversation: ${conversationId}.`);
      }
      lines.push(
        'Whatever you remember from prior conversations with this same user is yours to draw on. Memories from other users, other channels, and the owner workspace are not available here.',
      );
      return lines.join('\n');
    }

    case 'public': {
      const lines = [
        'You are in a public guest conversation.',
        'The visitor is anonymous.',
      ];
      if (conversationId) {
        lines.push(`Session: ${conversationId}.`);
      }
      lines.push(
        'Nothing about this person carries forward after the session ends — no memory of them is kept. Anything they share stays inside this conversation only.',
      );
      return lines.join('\n');
    }

    case 'channel': {
      const channelLabel = scope.channelName
        ? scope.channelName.charAt(0).toUpperCase() + scope.channelName.slice(1)
        : 'a channel';
      const caller = scope.channelCallerId ? ` with ${scope.channelCallerId}` : '';
      const lines = [
        `You are speaking on ${channelLabel}${caller}.`,
      ];
      if (conversationId) {
        lines.push(`Conversation: ${conversationId}.`);
      }
      lines.push(
        `Whatever you remember from prior messages with this caller on ${channelLabel} is yours. Memories from other channels, other callers, and other scopes are not available here.`,
      );
      return lines.join('\n');
    }

    case 'action': {
      const lines = [
        'You are processing an automated action call.',
      ];
      if (actionName?.trim()) {
        lines.push(`Action: ${actionName.trim()}.`);
      }
      lines.push(
        'No human is reading this turn directly. Your output goes to a programmatic workflow. Be precise, structured, and concise — the consumer expects a clean machine-usable result.',
      );
      return lines.join('\n');
    }

    default: {
      // Defensive fallback: unknown scope type. Carries no PII, just enough
      // for the operator to know they are not in a known scope.
      return 'You are in an unrecognised scope. Treat this turn with caution and do not assume continuity with any prior conversation.';
    }
  }
}

/**
 * Convert a scopeId or sourceScope tag into a human-readable label for the UI.
 * Reveals where, not how — never exposes raw scopeIds, slot IDs, or session IDs.
 *
 * Examples:
 *   authenticated:usr_123        -> "Workspace"
 *   channel:whatsapp:+971...     -> "WhatsApp — +971..."
 *   channel:telegram:@malhajeri  -> "Telegram — @malhajeri"
 *   public:slot_widget_42        -> "Public widget"
 *   action:slot_crud_07          -> "Action API"
 *   action                       -> "Action API"
 *   owner / authenticated        -> "Workspace"
 *   legacy                       -> "Earlier (pre-scope)"
 */
export function formatScopeLabel(value: string | null | undefined): string {
  if (!value) return 'Workspace';

  if (value === 'legacy') return 'Earlier (pre-scope)';
  if (value === 'owner') return 'My workspace';
  if (value === 'authenticated') return 'Workspace';
  if (value === 'public') return 'Public widget';
  if (value === 'action') return 'Action API';

  if (value.startsWith('owner:')) return 'My workspace';

  if (value.startsWith('authenticated:')) return 'Workspace';
  if (value.startsWith('public:')) return 'Public widget';
  if (value.startsWith('action:')) return 'Action API';

  if (value.startsWith('channel:')) {
    const parts = value.split(':');
    const name = parts[1] ?? 'channel';
    const caller = parts.slice(2).join(':');
    const pretty = name.charAt(0).toUpperCase() + name.slice(1);
    return caller ? `${pretty} — ${caller}` : pretty;
  }

  return 'Workspace';
}
