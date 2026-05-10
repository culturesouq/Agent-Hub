/**
 * Scope validation for the Scope-Isolated Conversation Architecture.
 *
 * Rule: the platform always sets scopeId in the request body.
 * The server validates — never derives scope automatically.
 *
 * Scope types:
 *   public          — no userId, no DB history, Layer 1 in-memory only
 *   authenticated   — requires userId, persistent conversation + Layer 1 in DB
 *   action          — no userId, no conversation written, structured tool calls only
 *   channel_<name>  — requires userId (channel caller identifier), persistent per channel
 */

export type ScopeType = 'public' | 'authenticated' | 'action' | 'channel';

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
 * Owner workspace is always authenticated scope with elevated trust.
 */
export function buildOwnerScope(ownerId: string): ValidatedScope {
  return {
    scopeId:       `authenticated:${ownerId}`,
    scopeType:     'authenticated',
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
  if (value === 'owner' || value === 'authenticated') return 'Workspace';
  if (value === 'public') return 'Public widget';
  if (value === 'action') return 'Action API';

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
