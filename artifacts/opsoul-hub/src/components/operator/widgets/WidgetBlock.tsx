import { AlertTriangle } from "lucide-react";
import { TokenDropCard } from "./TokenDropCard";
import { ChartCard } from "./ChartCard";
import { TableCard } from "./TableCard";
import { MermaidCard } from "./MermaidCard";
import type { WidgetPayload } from "./types";

interface Props {
  payload: WidgetPayload;
  operatorId: string;
}

/**
 * Renderer dispatch for operator-emitted widgets. New widget kinds get a
 * new case here + a new component next to the existing cards.
 *
 * Unknown kinds fall back to a small unsupported-card so the chat doesn't
 * silently swallow content — owner sees what came through.
 */
export function WidgetBlock({ payload, operatorId }: Props) {
  switch (payload.kind) {
    case "connect_form":
      return <TokenDropCard payload={payload} operatorId={operatorId} />;
    case "chart":
      return <ChartCard payload={payload} />;
    case "mermaid":
      return <MermaidCard payload={payload} />;
    case "table":
      return <TableCard payload={payload} />;
    default:
      return (
        <div className="my-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 font-mono text-xs text-amber-600 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Unknown widget kind: {(payload as { kind?: string }).kind ?? "—"}</span>
        </div>
      );
  }
}
