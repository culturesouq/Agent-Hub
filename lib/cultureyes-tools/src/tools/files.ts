/**
 * Files + render tools.
 *
 * FILES (domain "files"): `write_file`, `read_file`, `list_files`,
 * `delete_file`, `append_to_file`, `download_to_workspace`, `extract_pdf_text`.
 * Each persistence op runs against a pluggable `FileStore` connector resolved
 * from `ctx.connectors.files` — a deployment swaps the backing substrate (DB
 * table, object store, real filesystem, …) without touching tool code. If no
 * store is wired the tool degrades gracefully with a non-fatal `ok:false`.
 *
 * RENDER (domain "render"): `render_chart`, `render_table`, `render_diagram`
 * are PURE — no backend. They validate the input and return a structured spec
 * in `data` so any UI surface can draw it. Fully real now.
 *
 * Ported from OpSoul handlers handleWriteFile / handleReadFile / handleListFiles
 * / handleDeleteFile / handleAppendToFile / handleDownloadToWorkspace /
 * handleExtractPdfText / handleRenderChart / handleRenderTable /
 * handleRenderDiagram (utils/toolHandlers.ts). OpSoul UI-meta (terminateLoop,
 * opsoul-widget fences) is dropped; useful payload is folded into `data`.
 */

import type { ToolContext, ToolDef } from "@cultureyes/types";
import { ok, requireString } from "./_shared.js";

// ─── pluggable backends (category-local connector interfaces) ───────────────

/** A workspace file store (DB table, object store, real FS, … — pluggable). */
export interface FileStore {
  name: string;
  /** Create or replace a file; returns its size in chars. */
  put(name: string, content: string): Promise<{ id?: string; size: number }>;
  /** Read a file's content, or null if it does not exist. */
  get(name: string): Promise<string | null>;
  /** Enumerate stored files with size + last-update time. */
  list(): Promise<FileEntry[]>;
  /** Delete a file; returns whether one was removed. */
  delete(name: string): Promise<boolean>;
  /** Append to a file (creating it if absent); returns the new total size. */
  append(name: string, content: string): Promise<{ created: boolean; size: number }>;
}
export interface FileEntry {
  filename: string;
  size: number;
  updatedAt?: string;
}

/** A PDF text extractor (pdf-parse, a render service, … — pluggable). */
export interface PdfExtractor {
  name: string;
  /** Extract plain text from a PDF given its URL or raw bytes. */
  extract(input: { url?: string; bytes?: Uint8Array }): Promise<string>;
}

/** A URL fetcher (HTTP, Firecrawl, Puppeteer, … — pluggable). */
export interface UrlFetcher {
  name: string;
  fetch(url: string): Promise<{ title?: string; text: string }>;
}

/** The category-local connector bag this file reads off the context. */
interface FilesConnectors {
  files?: FileStore;
  pdf?: PdfExtractor;
  urlFetcher?: UrlFetcher;
}

/**
 * Reads the additive connector bag without widening the public `ToolContext`.
 * (The single documented cast permitted by the build spec.)
 */
function filesConnectors(ctx: ToolContext): FilesConnectors {
  return (
    (ctx as unknown as { connectors?: FilesConnectors }).connectors ?? {}
  );
}

/** Non-fatal result returned when the file store isn't wired for a deployment. */
function noStore(): ReturnType<typeof ok> {
  return {
    ok: false,
    content: "File storage is not connected for this deployment.",
    error: "files connector not provisioned",
  };
}

// ─── FILES ──────────────────────────────────────────────────────────────────

export const writeFile: ToolDef = {
  name: "write_file",
  description:
    "Creates or replaces a file in the workspace under a chosen name. Files persist across conversations.",
  domain: "files",
  schema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: 'Filename including extension (e.g. "report.md", "todo.txt").',
      },
      content: { type: "string", description: "Full file content as a string." },
      action: {
        type: "string",
        enum: ["create", "update"],
        description:
          "'create' for a new file, 'update' to overwrite an existing one.",
      },
    },
    required: ["filename", "content"],
  },
  async execute(params, ctx) {
    const filename = requireString(params, "filename");
    const content = requireString(params, "content");
    const store = filesConnectors(ctx).files;
    if (!store) return noStore();

    // OpSoul: an existing file is updated unless action === 'create'.
    const action = typeof params.action === "string" ? params.action : undefined;
    const existing = await store.get(filename);
    const isUpdate = existing !== null && action !== "create";

    const { id, size } = await store.put(filename, content);
    return ok(`File "${filename}" ${isUpdate ? "updated" : "created"}.`, {
      filename,
      id,
      size,
      updated: isUpdate,
    });
  },
};

export const readFile: ToolDef = {
  name: "read_file",
  description: "Returns the contents of a workspace file by name.",
  domain: "files",
  schema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "Filename including extension. Must match an existing file exactly.",
      },
    },
    required: ["filename"],
  },
  async execute(params, ctx) {
    const filename = requireString(params, "filename");
    const store = filesConnectors(ctx).files;
    if (!store) return noStore();

    const content = await store.get(filename);
    if (content === null) {
      return ok(`File "${filename}" not found in the workspace.`, {
        filename,
        found: false,
      });
    }
    return ok(`File "${filename}":\n${content}`, {
      filename,
      found: true,
      content,
    });
  },
};

export const listFiles: ToolDef = {
  name: "list_files",
  description:
    "Enumerates files present in the workspace with size and last-update timestamp.",
  domain: "files",
  schema: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const store = filesConnectors(ctx).files;
    if (!store) return noStore();

    const files = await store.list();
    if (files.length === 0) {
      return ok("The workspace has no files yet.", { files });
    }
    const text = files
      .map(
        (f) =>
          `- ${f.filename} (${f.size} chars, updated ${f.updatedAt ?? "unknown"})`,
      )
      .join("\n");
    return ok(text, { files });
  },
};

export const deleteFile: ToolDef = {
  name: "delete_file",
  description: "Removes a file from the workspace by filename.",
  domain: "files",
  schema: {
    type: "object",
    properties: {
      filename: { type: "string", description: "Exact filename to delete." },
    },
    required: ["filename"],
  },
  async execute(params, ctx) {
    const filename = requireString(params, "filename");
    const store = filesConnectors(ctx).files;
    if (!store) return noStore();

    const deleted = await store.delete(filename);
    return ok(
      deleted
        ? `Deleted "${filename}" from the workspace.`
        : `No file named "${filename}" in the workspace.`,
      { filename, deleted },
    );
  },
};

export const appendToFile: ToolDef = {
  name: "append_to_file",
  description:
    "Adds content to the end of an existing workspace file. Creates the file if it does not exist. Useful for running logs or accumulating notes across turns.",
  domain: "files",
  schema: {
    type: "object",
    properties: {
      filename: { type: "string", description: "Workspace filename." },
      content: { type: "string", description: "Text to append." },
    },
    required: ["filename", "content"],
  },
  async execute(params, ctx) {
    const filename = requireString(params, "filename");
    // Match OpSoul: content may be empty string, so check presence not truthiness.
    if (typeof params.content !== "string") {
      return {
        ok: false,
        content: 'append_to_file requires a "content" string.',
        error: "missing content",
      };
    }
    const content = params.content;
    const store = filesConnectors(ctx).files;
    if (!store) return noStore();

    const { created, size } = await store.append(filename, content);
    return ok(
      created
        ? `Created "${filename}" with ${content.length} chars (no prior file existed — append created it).`
        : `Appended ${content.length} chars to "${filename}" (total ${size} chars).`,
      { filename, created, appended: content.length, size },
    );
  },
};

export const downloadToWorkspace: ToolDef = {
  name: "download_to_workspace",
  description:
    "Fetches the content of a URL and stores it as a file in the workspace. Text and JSON are stored verbatim; HTML is stripped to its visible text. Max 100 KB stored.",
  domain: "files",
  schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to fetch." },
      filename: {
        type: "string",
        description: "Destination filename in the workspace.",
      },
    },
    required: ["url", "filename"],
  },
  async execute(params, ctx) {
    const url = requireString(params, "url");
    const filename = requireString(params, "filename");
    const store = filesConnectors(ctx).files;
    if (!store) return noStore();

    let body: string;
    const fetcher = filesConnectors(ctx).urlFetcher;
    if (fetcher) {
      // A pluggable fetcher already returns extracted text.
      try {
        const res = await fetcher.fetch(url);
        body = res.text;
      } catch (err) {
        return {
          ok: false,
          content: `Fetch failed: ${(err as Error).message}`,
          error: "fetch failed",
        };
      }
    } else {
      // Default: native fetch + crude HTML strip (mirrors OpSoul).
      let res: Response;
      try {
        res = await fetch(url, { redirect: "follow" });
      } catch (err) {
        return {
          ok: false,
          content: `Fetch failed: ${(err as Error).message}`,
          error: "fetch failed",
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          content: `Fetch returned HTTP ${res.status}.`,
          error: `http ${res.status}`,
        };
      }
      const ctype = res.headers.get("content-type") ?? "";
      body = await res.text();
      if (ctype.includes("html")) {
        body = body
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    }
    // 100 KB cap (OpSoul).
    body = body.slice(0, 100 * 1024);

    await store.put(filename, body);
    return ok(
      `Downloaded ${body.length} chars from ${url} to the workspace as "${filename}".`,
      { url, filename, size: body.length },
    );
  },
};

export const extractPdfText: ToolDef = {
  name: "extract_pdf_text",
  description:
    "Downloads a PDF from a URL and returns its extracted text. Max 12000 characters returned.",
  domain: "files",
  schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL of the PDF." },
    },
    required: ["url"],
  },
  async execute(params, ctx) {
    const url = requireString(params, "url");
    const extractor = filesConnectors(ctx).pdf;
    if (!extractor) {
      return {
        ok: false,
        content: "PDF extraction is not connected for this deployment.",
        error: "pdf connector not provisioned",
      };
    }

    let text: string;
    try {
      text = await extractor.extract({ url });
    } catch (err) {
      return {
        ok: false,
        content: `PDF extraction failed: ${(err as Error).message}`,
        error: "extract failed",
      };
    }
    // 12000-char cap (OpSoul).
    const clipped = text.slice(0, 12000);
    return ok(clipped.length === 0 ? "No text extracted from the PDF." : clipped, {
      url,
      text: clipped,
      chars: clipped.length,
    });
  },
};

// ─── RENDER (pure — no backend) ──────────────────────────────────────────────

interface ChartPoint {
  label: string;
  value: number;
}

export const renderChart: ToolDef = {
  name: "render_chart",
  description:
    "Renders a bar, line, or pie chart inline. Pass an array of {label, value} points; the UI surface draws the chart.",
  domain: "render",
  schema: {
    type: "object",
    properties: {
      chartType: {
        type: "string",
        enum: ["bar", "line", "pie"],
        description: "Chart shape.",
      },
      title: { type: "string", description: "Optional title shown above the chart." },
      data: {
        type: "array",
        description: "Series points. Each item must have label (string) and value (number).",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "number" },
          },
          required: ["label", "value"],
        },
      },
    },
    required: ["chartType", "data"],
  },
  async execute(params) {
    const chartType = params.chartType;
    if (chartType !== "bar" && chartType !== "line" && chartType !== "pie") {
      return {
        ok: false,
        content: "render_chart requires chartType ∈ {bar, line, pie}.",
        error: "invalid chartType",
      };
    }
    if (!Array.isArray(params.data)) {
      return {
        ok: false,
        content: 'render_chart requires a "data" array of {label, value} points.',
        error: "invalid data",
      };
    }
    const title = typeof params.title === "string" ? params.title : undefined;
    // Keep only well-formed points (mirrors OpSoul's filter).
    const points = (params.data as unknown[]).filter(
      (p): p is ChartPoint =>
        typeof (p as ChartPoint)?.label === "string" &&
        typeof (p as ChartPoint)?.value === "number",
    );
    return ok("Rendered chart.", {
      type: "chart",
      chartType,
      title,
      data: points,
    });
  },
};

export const renderTable: ToolDef = {
  name: "render_table",
  description:
    "Renders a tabular grid inline. Pass an array of column names and a 2D array of row values (strings).",
  domain: "render",
  schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Optional title shown above the table." },
      columns: {
        type: "array",
        description: "Column header strings.",
        items: { type: "string" },
      },
      rows: {
        type: "array",
        description:
          "Array of rows. Each row is an array of cell strings in the same order as columns.",
        items: { type: "array", items: { type: "string" } },
      },
    },
    required: ["columns", "rows"],
  },
  async execute(params) {
    if (!Array.isArray(params.columns) || !Array.isArray(params.rows)) {
      return {
        ok: false,
        content: 'render_table requires "columns" (string[]) and "rows" (string[][]).',
        error: "invalid columns/rows",
      };
    }
    const title = typeof params.title === "string" ? params.title : undefined;
    const columns = (params.columns as unknown[]).map((c) => String(c));
    const rows = (params.rows as unknown[]).map((row) =>
      Array.isArray(row) ? row.map((cell) => String(cell)) : [],
    );
    return ok("Rendered table.", { type: "table", title, columns, rows });
  },
};

export const renderDiagram: ToolDef = {
  name: "render_diagram",
  description:
    "Renders a Mermaid diagram source inline. Use for flowcharts, sequence diagrams, mind maps, gantt charts.",
  domain: "render",
  schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Optional title shown above the diagram." },
      diagram: {
        type: "string",
        description: 'Full Mermaid source (e.g. "flowchart TD\\n  A --> B").',
      },
    },
    required: ["diagram"],
  },
  async execute(params) {
    const diagram = typeof params.diagram === "string" ? params.diagram : "";
    if (diagram.length === 0) {
      return {
        ok: false,
        content: "render_diagram requires a Mermaid source in \"diagram\".",
        error: "missing diagram",
      };
    }
    const title = typeof params.title === "string" ? params.title : undefined;
    return ok("Rendered diagram.", { type: "diagram", title, diagram });
  },
};

// ─── exported catalog slice ───────────────────────────────────────────────────

export const filesTools: ToolDef[] = [
  writeFile,
  readFile,
  listFiles,
  deleteFile,
  appendToFile,
  downloadToWorkspace,
  extractPdfText,
  renderChart,
  renderTable,
  renderDiagram,
];
