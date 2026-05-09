/**
 * In-memory session store for public scope Layer 1 context.
 * Public scope has no persistent Layer 1 — all within-session coherence
 * lives here and is discarded on refresh or TTL expiry.
 * Never touches the database.
 */

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface SessionEntry {
  messages: { role: string; content: string }[];
  operatorId: string;
  createdAt: number;
  lastActivityAt: number;
}

const store = new Map<string, SessionEntry>();

// Prune expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.lastActivityAt > SESSION_TTL_MS) {
      store.delete(id);
    }
  }
}, 10 * 60 * 1000).unref();

export function getSession(sessionId: string): SessionEntry | undefined {
  return store.get(sessionId);
}

export function appendToSession(
  sessionId: string,
  operatorId: string,
  messages: { role: string; content: string }[],
): void {
  const now = Date.now();
  const existing = store.get(sessionId);
  if (existing) {
    existing.messages.push(...messages);
    existing.lastActivityAt = now;
  } else {
    store.set(sessionId, { messages, operatorId, createdAt: now, lastActivityAt: now });
  }
}

export function getSessionMessages(sessionId: string): { role: string; content: string }[] {
  return store.get(sessionId)?.messages ?? [];
}

export function clearSession(sessionId: string): void {
  store.delete(sessionId);
}
