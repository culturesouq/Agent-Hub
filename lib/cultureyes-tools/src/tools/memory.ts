/**
 * Memory + knowledge-base tools — ported from OpSoul's memory/KB handlers.
 *
 *   store_memory       (handleStoreMemory)     write an explicit memory
 *   search_memory      (handleSearchMemory)    similarity search over memories
 *   list_memories      (handleListMemories)    N most recent, reverse-chron
 *   kb_seed            (handleKbSeed)          land a KB entry in PENDING state
 *   kb_search          (handleKbSearch)        query owner-dropped + learned KB
 *   kb_delete_learned  (handleKbDeleteLearned) remove a learned (non-system) entry
 *   kb_pending_list    (handleKbPendingList)   list pending-verification entries
 *
 * These are private/sovereign backends, so there is no "default HTTP" guess:
 * each tool resolves a pluggable connector (`MemoryConnector`, `KbAdminConnector`)
 * from `ctx.connectors`. When a connector is absent the tool returns a clear,
 * non-fatal `ok:false` "not connected" result rather than throwing.
 *
 * The `memory`/`kb` connectors are specific to this category, so they are read
 * off the context with a local connector-bag type rather than the shared
 * `ToolConnectors` interface.
 */

import type { ToolContext, ToolDef } from "@cultureyes/types";
import { ok, optionalNumber, requireString } from "./_shared.js";

// ─── pluggable connector interfaces (this category) ─────────────────────────

/** A stored memory as written/returned by the memory pipeline. */
export interface MemoryRecord {
  id: string;
  content: string;
  memoryType: MemoryType;
  /** Importance 0.0–1.0; higher weights survive decay longer. */
  weight: number;
  /** ISO timestamp of when the memory was stored, if the backend tracks it. */
  createdAt?: string;
}

export type MemoryType = "fact" | "preference" | "context" | "event";

/** A memory hit from a similarity search. */
export interface MemoryHit {
  content: string;
  memoryType: MemoryType;
  /** Cosine similarity 0.0–1.0. */
  similarity: number;
}

/**
 * The operator-memory backend (embedding + decay/retrieval pipeline — pluggable).
 * Explicit writes go through the same pipeline as auto-stored memories.
 */
export interface MemoryConnector {
  name: string;
  /** Write an explicit memory; returns the stored record (with its id). */
  store(rec: {
    content: string;
    memoryType: MemoryType;
    weight: number;
  }): Promise<MemoryRecord>;
  /** Similarity search; returns up to `k` top hits ordered by similarity. */
  search(query: string, k: number): Promise<MemoryHit[]>;
  /** The N most recent memories in reverse-chronological order. */
  list(n: number): Promise<MemoryRecord[]>;
}

/** A KB entry as returned by a search across owner-dropped + learned KBs. */
export interface KbSearchHit {
  /** Backend id (used by kb_delete_learned for learned entries). */
  entryId?: string;
  content: string;
  /** Source label (e.g. owner-drop vs learned vs system seed). */
  source?: string;
  /** Cosine similarity 0.0–1.0. */
  similarity?: number;
  /** Confidence score 0–100. */
  confidence?: number;
}

/** A pending-verification KB entry. */
export interface KbPendingEntry {
  id: string;
  content: string;
  source?: string;
  confidence?: number;
  createdAt?: string;
}

/** Outcome of seeding a KB entry. */
export interface KbSeedResult {
  stored: boolean;
  /** Reason the entry was not stored (only when `stored` is false). */
  reason?: string;
}

/** Outcome of deleting a learned KB entry. */
export interface KbDeleteResult {
  deleted: boolean;
  /** Why the delete did not happen: entry not owned, or a protected system seed. */
  reason?: "not_found" | "protected";
  /** Source label of the removed entry, when deleted. */
  source?: string;
}

/**
 * The knowledge-base admin backend (seed/search/delete/pending — pluggable).
 * Seeds land in PENDING verification; search spans owner-dropped + learned KBs;
 * delete only touches learned (non-system) entries owned by the deployment.
 */
export interface KbAdminConnector {
  name: string;
  /** Seed an entry; it lands in pending-verification state. */
  seed(entry: {
    content: string;
    source: string;
    confidence: number;
  }): Promise<KbSeedResult>;
  /** Query both owner-dropped + learned KB; returns top hits with source+confidence. */
  search(query: string, topN: number): Promise<KbSearchHit[]>;
  /** Delete a learned entry by id; refuses system seeds and unknown ids. */
  deleteLearned(entryId: string): Promise<KbDeleteResult>;
  /** Pending-verification entries, reverse-chronological. */
  pendingList(): Promise<KbPendingEntry[]>;
}

/** Local connector bag for this category, read defensively off the context. */
interface MemoryConnectors {
  memory?: MemoryConnector;
  /** KB *admin* surface (seed/search/delete/pending) — distinct from the
   * read-only `kb` (KbConnector.lookup) used by data.ts's `kb_query`. */
  kbAdmin?: KbAdminConnector;
}

function memoryConnectors(ctx: ToolContext): MemoryConnectors {
  return (
    (ctx as unknown as { connectors?: MemoryConnectors }).connectors ?? {}
  );
}

const MEMORY_TYPES: MemoryType[] = ["fact", "preference", "context", "event"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── tools ──────────────────────────────────────────────────────────────────

const storeMemory: ToolDef = {
  name: "store_memory",
  description:
    "Writes a memory the operator explicitly chooses to keep — distinct from the automatic post-turn distillation. Goes through the same embedding + decay pipeline as auto-stored memories. Use when something in the conversation is worth carrying forward and the operator wants to commit to it.",
  domain: "memory",
  schema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description:
          "The memory content as a self-contained sentence or short paragraph.",
      },
      memoryType: {
        type: "string",
        enum: ["fact", "preference", "context", "event"],
        description: "Category of memory.",
      },
      weight: {
        type: "number",
        description:
          "Importance 0.0–1.0. Higher weights survive decay longer. Default 1.0.",
      },
    },
    required: ["content", "memoryType"],
  },
  async execute(params, ctx) {
    const content = requireString(params, "content");
    const memoryType = requireString(params, "memoryType");
    if (!MEMORY_TYPES.includes(memoryType as MemoryType)) {
      return {
        ok: false,
        content: `memoryType must be one of: ${MEMORY_TYPES.join(", ")}.`,
        error: "invalid memoryType",
      };
    }
    const weightParam = optionalNumber(params, "weight");
    const weight = typeof weightParam === "number" ? clamp(weightParam, 0, 1) : 1.0;

    const memory = memoryConnectors(ctx).memory;
    if (!memory) {
      return {
        ok: false,
        content: "store_memory is not connected for this deployment.",
        error: "memory connector not connected",
      };
    }

    const stored = await memory.store({
      content,
      memoryType: memoryType as MemoryType,
      weight,
    });
    return ok(
      `Memory stored (id ${stored.id}, type ${memoryType}, weight ${weight.toFixed(2)}). It enters the same decay/retrieval pipeline as auto-stored memories.`,
      { memory: stored },
    );
  },
};

const searchMemory: ToolDef = {
  name: "search_memory",
  description:
    "Retrieves the operator's own memories matching a natural-language query. Returns the top-ranked hits with similarity scores. Use this when the operator needs to recall something specific mid-conversation that automatic retrieval did not surface.",
  domain: "memory",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "What you're looking for, in natural language.",
      },
      topN: {
        type: "number",
        description: "Number of hits to return. Default 5.",
      },
    },
    required: ["query"],
  },
  async execute(params, ctx) {
    const query = requireString(params, "query");
    const topNParam = optionalNumber(params, "topN");
    const topN = typeof topNParam === "number" ? clamp(topNParam, 1, 20) : 5;

    const memory = memoryConnectors(ctx).memory;
    if (!memory) {
      return {
        ok: false,
        content: "search_memory is not connected for this deployment.",
        error: "memory connector not connected",
      };
    }

    const hits = await memory.search(query, topN);
    if (hits.length === 0) {
      return ok(`No matching memories for: "${query}".`, { hits });
    }
    const lines = hits.map(
      (h, i) =>
        `${i + 1}. [${h.memoryType}, sim ${h.similarity.toFixed(2)}] ${h.content}`,
    );
    return ok(`Top ${hits.length} memory hits for "${query}": ${lines.join(" ")}`, {
      hits,
    });
  },
};

const listMemories: ToolDef = {
  name: "list_memories",
  description:
    "Returns the operator's N most recent memories in reverse chronological order. Useful for surfacing recent context without a similarity query.",
  domain: "memory",
  schema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Max entries to return. Default 10.",
      },
    },
    required: [],
  },
  async execute(params, ctx) {
    const limitParam = optionalNumber(params, "limit");
    const limit = typeof limitParam === "number" ? clamp(limitParam, 1, 50) : 10;

    const memory = memoryConnectors(ctx).memory;
    if (!memory) {
      return {
        ok: false,
        content: "list_memories is not connected for this deployment.",
        error: "memory connector not connected",
      };
    }

    const rows = await memory.list(limit);
    if (rows.length === 0) {
      return ok("No memories stored yet.", { memories: rows });
    }
    const lines = rows.map(
      (r) =>
        `- [${r.memoryType}, w${r.weight.toFixed(2)}, ${r.createdAt ?? ""}] ${r.content.slice(0, 200)}`,
    );
    return ok(`Most recent ${rows.length} memories: ${lines.join(" ")}`, {
      memories: rows,
    });
  },
};

const kbSeed: ToolDef = {
  name: "kb_seed",
  description:
    "Adds an entry to the operator's knowledge base. The entry is embedded at insertion time and becomes retrievable in subsequent conversations. New entries land in pending state for verification.",
  domain: "memory",
  schema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description:
          "The knowledge content to store — a self-contained factual chunk, typically 100–400 words.",
      },
      source: {
        type: "string",
        description:
          'Source identifier(s) the entry was derived from (e.g. "Google AI Blog 2024, MIT study on transformer efficiency").',
      },
      confidence: {
        type: "number",
        description:
          "Confidence score 0–100 reflecting expected reliability of the entry.",
      },
    },
    required: ["content", "source", "confidence"],
  },
  async execute(params, ctx) {
    const content = requireString(params, "content");
    const source = requireString(params, "source");
    const confidenceParam = optionalNumber(params, "confidence");
    const confidence =
      typeof confidenceParam === "number" ? confidenceParam : 65;

    const kb = memoryConnectors(ctx).kbAdmin;
    if (!kb) {
      return {
        ok: false,
        content: "kb_seed is not connected for this deployment.",
        error: "kb connector not connected",
      };
    }

    const result = await kb.seed({ content, source, confidence });
    if (!result.stored) {
      return {
        ok: false,
        content: `Entry not stored: ${result.reason ?? "unknown reason"}.`,
        error: result.reason ?? "kb_seed failed",
      };
    }
    const recorded = clamp(Math.round(confidence), 40, 85);
    return ok(
      `Entry stored successfully. Confidence: ${recorded}. Status: pending — queued for verification.`,
      { source, confidence: recorded, status: "pending" },
    );
  },
};

const kbSearch: ToolDef = {
  name: "kb_search",
  description:
    "Explicit query against the operator's knowledge base — both the owner-dropped KB and the operator-learned KB. Returns the most relevant entries with their source and confidence. Use when targeted recall is needed beyond the automatic context attached to each turn.",
  domain: "memory",
  schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Natural-language query." },
      topN: {
        type: "number",
        description: "Number of entries to return. Default 4.",
      },
    },
    required: ["query"],
  },
  async execute(params, ctx) {
    const query = requireString(params, "query");
    const topNParam = optionalNumber(params, "topN");
    const topN = typeof topNParam === "number" ? clamp(topNParam, 1, 15) : 4;

    const kb = memoryConnectors(ctx).kbAdmin;
    if (!kb) {
      return {
        ok: false,
        content: "kb_search is not connected for this deployment.",
        error: "kb connector not connected",
      };
    }

    const hits = await kb.search(query, topN);
    if (hits.length === 0) {
      return ok(`No KB entries matched: "${query}".`, { hits });
    }
    const lines = hits.map(
      (h, i) =>
        `${i + 1}. [${h.source ?? "kb"}, sim ${(h.similarity ?? 0).toFixed(2)}, conf ${h.confidence ?? "?"}] (id ${h.entryId ?? "?"}) ${h.content.slice(0, 300)}`,
    );
    return ok(
      `Top ${hits.length} KB hits for "${query}": ${lines.join(" ")} To remove a learned entry the operator added, call kb_delete_learned with the id from this list.`,
      { hits },
    );
  },
};

const kbDeleteLearned: ToolDef = {
  name: "kb_delete_learned",
  description:
    "Removes an entry the operator added to its own learned knowledge base. Owner-dropped KB entries are in a separate table and cannot be reached by this tool. System-seeded entries (marked isSystem) are also protected.",
  domain: "memory",
  schema: {
    type: "object",
    properties: {
      entryId: {
        type: "string",
        description: "ID of the learned KB entry to remove (from kb_search results).",
      },
    },
    required: ["entryId"],
  },
  async execute(params, ctx) {
    const entryId = requireString(params, "entryId");

    const kb = memoryConnectors(ctx).kbAdmin;
    if (!kb) {
      return {
        ok: false,
        content: "kb_delete_learned is not connected for this deployment.",
        error: "kb connector not connected",
      };
    }

    const result = await kb.deleteLearned(entryId);
    if (!result.deleted) {
      if (result.reason === "protected") {
        return {
          ok: false,
          content: `KB entry "${entryId}" is a platform seed (isSystem=true). System entries are protected and cannot be deleted by the operator.`,
          error: "protected system entry",
        };
      }
      return {
        ok: false,
        content: `No learned KB entry with id "${entryId}" belongs to this operator. (Owner-dropped KB entries cannot be reached by this tool.)`,
        error: "learned entry not found",
      };
    }
    return ok(
      `Learned KB entry "${entryId}" deleted. (Source: ${result.source ?? "—"}.)`,
      { entryId, source: result.source },
    );
  },
};

const kbPendingList: ToolDef = {
  name: "kb_pending_list",
  description:
    "Returns the operator-learned KB entries currently in pending verification status — entries the operator seeded that have not yet been validated by the verification pipeline.",
  domain: "memory",
  schema: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const kb = memoryConnectors(ctx).kbAdmin;
    if (!kb) {
      return {
        ok: false,
        content: "kb_pending_list is not connected for this deployment.",
        error: "kb connector not connected",
      };
    }

    const rows = await kb.pendingList();
    if (rows.length === 0) {
      return ok("No pending KB entries.", { pending: rows });
    }
    const lines = rows.map(
      (r) =>
        `- id ${r.id} [conf ${r.confidence ?? "?"}, ${r.createdAt ?? ""}] from "${r.source ?? "—"}": ${r.content.slice(0, 150)}…`,
    );
    return ok(`Pending KB entries (${rows.length}): ${lines.join(" ")}`, {
      pending: rows,
    });
  },
};

export const memoryTools: ToolDef[] = [
  storeMemory,
  searchMemory,
  listMemories,
  kbSeed,
  kbSearch,
  kbDeleteLearned,
  kbPendingList,
];
