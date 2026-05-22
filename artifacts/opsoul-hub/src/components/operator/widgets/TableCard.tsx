import { Table } from "lucide-react";
import type { TableWidget } from "./types";

export function TableCard({ payload }: { payload: TableWidget }) {
  if (payload.columns.length === 0 || payload.rows.length === 0) {
    return (
      <div className="my-3 rounded-xl border border-muted-foreground/20 bg-card/20 p-3 font-mono text-xs text-muted-foreground">
        <p className="font-bold text-foreground/80">{payload.title ?? "Table"}</p>
        <p className="mt-0.5">Empty.</p>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-primary/20 bg-card/30 p-4 overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <Table className="w-4 h-4 text-primary" />
        <p className="font-mono text-sm font-bold text-foreground">{payload.title ?? "Table"}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50">
              {payload.columns.map((c, i) => (
                <th
                  key={i}
                  className="font-mono font-bold text-left text-foreground/80 py-1.5 px-2 whitespace-nowrap"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-border/20 hover:bg-card/40">
                {payload.columns.map((_, ci) => (
                  <td key={ci} className="font-mono py-1.5 px-2 text-foreground/90 align-top">
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
