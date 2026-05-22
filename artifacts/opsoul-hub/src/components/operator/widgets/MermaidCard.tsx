import { useState } from "react";
import { GitBranch, Copy, Check, ExternalLink } from "lucide-react";
import type { MermaidWidget } from "./types";

/**
 * Mermaid is not yet bundled in the Hub — for now this card renders the
 * diagram source clearly + a copy button + a "render at mermaid.live" link.
 * When mermaid-js is added as a dep, this component swaps to inline render
 * without changing the widget protocol or the emitting tool.
 */
export function MermaidCard({ payload }: { payload: MermaidWidget }) {
  const [copied, setCopied] = useState(false);
  const liveUrl = `https://mermaid.live/edit#pako:${btoa(unescape(encodeURIComponent(payload.diagram))).slice(0, 800)}`;
  return (
    <div className="my-3 rounded-xl border border-primary/20 bg-card/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <p className="font-mono text-sm font-bold text-foreground">{payload.title ?? "Diagram"}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              navigator.clipboard.writeText(payload.diagram);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="p-1.5 rounded border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
            title="Copy diagram source"
          >
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          </button>
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
            title="Render at mermaid.live"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      <pre className="font-mono text-[11px] bg-background/60 border border-border/30 rounded-lg p-3 overflow-x-auto whitespace-pre text-foreground/90 leading-relaxed">
        {payload.diagram}
      </pre>
    </div>
  );
}
