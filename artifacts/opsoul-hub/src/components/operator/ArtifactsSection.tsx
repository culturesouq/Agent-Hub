import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Sparkles, BarChart3, Table, GitBranch, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { WidgetBlock } from "./widgets/WidgetBlock";
import type { WidgetPayload } from "./widgets/types";

interface ArtifactEntry {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string | null;
  conversationId: string;
  messageId: string;
}

const KIND_LABEL: Record<string, string> = {
  chart: "Chart",
  table: "Table",
  mermaid: "Diagram",
};

const KIND_ICON: Record<string, React.ElementType> = {
  chart: BarChart3,
  table: Table,
  mermaid: GitBranch,
};

const ALL_KINDS = ["chart", "table", "mermaid"] as const;

export default function ArtifactsSection({ operatorId }: { operatorId: string }) {
  const [filter, setFilter] = useState<string | "all">("all");

  const { data, isLoading } = useQuery<{ artifacts: ArtifactEntry[]; count: number }>({
    queryKey: ["operators", operatorId, "artifacts"],
    queryFn: () => apiFetch(`/operators/${operatorId}/artifacts`),
  });

  const artifacts = data?.artifacts ?? [];
  const filtered = filter === "all" ? artifacts : artifacts.filter(a => a.kind === filter);

  const countsByKind: Record<string, number> = {};
  for (const a of artifacts) countsByKind[a.kind] = (countsByKind[a.kind] ?? 0) + 1;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 bg-white rounded-2xl border border-border/30 p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <div>
            <h2 className="font-headline font-bold text-lg text-primary">Artifacts</h2>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">
              Charts, tables, and diagrams your operator drew across past conversations
            </p>
          </div>
        </div>

        {artifacts.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterChip label={`All (${artifacts.length})`} active={filter === "all"} onClick={() => setFilter("all")} />
            {ALL_KINDS.map(k => (
              countsByKind[k] ? (
                <FilterChip
                  key={k}
                  label={`${KIND_LABEL[k]} (${countsByKind[k]})`}
                  active={filter === k}
                  onClick={() => setFilter(k)}
                />
              ) : null
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-center p-8 font-mono text-muted-foreground animate-pulse">Loading...</div>
      ) : artifacts.length === 0 ? (
        <div className="text-center p-16 border border-dashed border-border/50 rounded-lg bg-card/20">
          <Sparkles className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="font-mono text-sm text-muted-foreground">No artifacts yet.</p>
          <p className="font-mono text-xs text-muted-foreground/60 mt-1">
            Ask your operator to chart something, draw a diagram, or render a table —
            it'll land here automatically and stay.
          </p>
          <div className="mt-4 max-w-md mx-auto text-left">
            <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1">Try in chat:</p>
            <ul className="font-mono text-[11px] text-muted-foreground space-y-0.5">
              <li>• "Show me a bar chart of the last 4 task durations"</li>
              <li>• "Draw a flowchart of how you handle a new message"</li>
              <li>• "Render a table of all my connected integrations"</li>
            </ul>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center p-12 border border-dashed border-border/50 rounded-lg bg-card/20">
          <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-30" />
          <p className="font-mono text-xs text-muted-foreground">No {filter} artifacts. Try a different filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(a => (
            <ArtifactCard key={a.id} entry={a} operatorId={operatorId} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`font-mono text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/40 bg-card/20 text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      {label}
    </button>
  );
}

function ArtifactCard({ entry, operatorId }: { entry: ArtifactEntry; operatorId: string }) {
  const Icon = KIND_ICON[entry.kind] ?? Sparkles;
  const title = (entry.payload.title as string | undefined) ?? KIND_LABEL[entry.kind] ?? entry.kind;
  return (
    <div className="border border-border/40 rounded-xl bg-card/20 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
          <p className="font-mono text-xs font-bold text-foreground truncate">{title}</p>
        </div>
        {entry.createdAt && (
          <span className="font-mono text-[10px] text-muted-foreground shrink-0">
            {format(new Date(entry.createdAt), "MMM d, HH:mm")}
          </span>
        )}
      </div>
      <WidgetBlock payload={entry.payload as unknown as WidgetPayload} operatorId={operatorId} />
    </div>
  );
}
