/**
 * Widget protocol — how the operator hands the chat surface a structured
 * interactive element. The operator emits a fenced code block tagged
 * `opsoul-widget` containing a JSON payload of one of the shapes below.
 * MarkdownMessage detects the tag and renders the matching component.
 *
 * Adding a new widget: add a variant here + a renderer in WidgetBlock.tsx.
 */

export type WidgetFieldType = "text" | "password" | "url" | "email" | "textarea";

export interface WidgetField {
  name: string;
  label: string;
  type: WidgetFieldType;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}

export interface ConnectFormWidget {
  kind: "connect_form";
  integrationType: string;
  label: string;
  instructions?: string;
  fields: WidgetField[];
  /** Optional URL where the credential token doc lives — shown as a link in the form. */
  docsUrl?: string;
}

export interface ChartWidget {
  kind: "chart";
  chartType: "bar" | "line" | "pie";
  title?: string;
  data: Array<{ label: string; value: number }>;
}

export interface MermaidWidget {
  kind: "mermaid";
  title?: string;
  diagram: string;
}

export interface TableWidget {
  kind: "table";
  title?: string;
  columns: string[];
  rows: string[][];
}

export type WidgetPayload =
  | ConnectFormWidget
  | ChartWidget
  | MermaidWidget
  | TableWidget;

export function parseWidgetPayload(raw: string): WidgetPayload | null {
  try {
    const parsed = JSON.parse(raw) as { kind?: string };
    if (!parsed || typeof parsed !== "object" || typeof parsed.kind !== "string") return null;
    if (parsed.kind !== "connect_form" && parsed.kind !== "chart" && parsed.kind !== "mermaid" && parsed.kind !== "table") return null;
    return parsed as WidgetPayload;
  } catch {
    return null;
  }
}
