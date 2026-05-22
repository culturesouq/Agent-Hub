import { AlertTriangle } from "lucide-react";
import { TokenDropCard } from "./TokenDropCard";
import type { WidgetPayload } from "./types";

interface Props {
  payload: WidgetPayload;
  operatorId: string;
}

/**
 * Renderer dispatch for operator-emitted widgets. New widget kinds get a
 * new case here + a new component next to TokenDropCard.tsx.
 *
 * Unknown kinds fall back to a small unsupported-card so the chat doesn't
 * silently swallow content — owner sees what came through.
 */
export function WidgetBlock({ payload, operatorId }: Props) {
  switch (payload.kind) {
    case "connect_form":
      return <TokenDropCard payload={payload} operatorId={operatorId} />;
    case "chart":
    case "mermaid":
    case "table":
      // Wired by later phases. Until then, render the title so the
      // owner sees something landed.
      return (
        <div className="my-3 rounded-xl border border-muted-foreground/20 bg-card/20 p-3 font-mono text-xs text-muted-foreground">
          <p className="font-bold text-foreground/80">{payload.title ?? payload.kind}</p>
          <p className="mt-0.5 text-[11px]">Widget type "{payload.kind}" — renderer ships in a later phase.</p>
        </div>
      );
    default:
      return (
        <div className="my-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 font-mono text-xs text-amber-600 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Unknown widget kind: {(payload as { kind?: string }).kind ?? "—"}</span>
        </div>
      );
  }
}
