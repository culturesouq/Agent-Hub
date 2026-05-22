import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Key, CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import type { ConnectFormWidget } from "./types";

interface Props {
  payload: ConnectFormWidget;
  operatorId: string;
}

export function TokenDropCard({ payload, operatorId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ ok: true } | { ok: false; message: string } | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const primary = payload.fields.find(f => f.name === "token") ?? payload.fields[0];
      const token = (values[primary.name] ?? "").trim();
      if (!token) throw new Error(`${primary.label} is required`);

      const appSchema: Record<string, string> = {};
      for (const f of payload.fields) {
        if (f.name === primary.name) continue;
        const v = (values[f.name] ?? "").trim();
        if (v) appSchema[f.name] = v;
      }

      return apiFetch(`/operators/${operatorId}/integrations`, {
        method: "POST",
        body: JSON.stringify({
          integrationType: payload.integrationType,
          integrationLabel: payload.label,
          token,
          scopes: [payload.integrationType],
          ...(Object.keys(appSchema).length > 0 ? { appSchema } : {}),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      setDone({ ok: true });
      toast({ title: `${payload.label} connected` });
    },
    onError: (err: Error) => {
      setDone({ ok: false, message: err.message });
    },
  });

  if (done?.ok) {
    return (
      <div className="my-3 rounded-xl border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
        <div>
          <p className="font-mono text-sm font-bold text-green-600">{payload.label} connected</p>
          <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
            Your operator can use it now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-primary/20 bg-card/30 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Key className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="font-mono text-sm font-bold">{payload.label}</p>
          {payload.instructions && (
            <p className="font-mono text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {payload.instructions}
            </p>
          )}
          {payload.docsUrl && (
            <a
              href={payload.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
            >
              Where to get this <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setDone(null);
          submit.mutate();
        }}
        className="space-y-3"
      >
        {payload.fields.map((f) => (
          <div key={f.name} className="space-y-1.5">
            <Label className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
              {f.label}
              {f.required === false && <span className="normal-case text-muted-foreground/50"> (optional)</span>}
            </Label>
            {f.type === "textarea" ? (
              <textarea
                value={values[f.name] ?? ""}
                onChange={(e) => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full font-mono text-xs rounded-md border border-border/40 bg-background/60 p-2 min-h-[60px] resize-y"
                autoComplete="off"
              />
            ) : (
              <Input
                type={f.type === "password" ? "password" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
                value={values[f.name] ?? ""}
                onChange={(e) => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                placeholder={f.placeholder}
                className="font-mono text-xs"
                autoComplete="off"
              />
            )}
            {f.hint && (
              <p className="font-mono text-[10px] text-muted-foreground/60">{f.hint}</p>
            )}
          </div>
        ))}

        {done && !done.ok && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-[11px] text-destructive flex items-start gap-2">
            <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{done.message}</span>
          </div>
        )}

        <Button
          type="submit"
          size="sm"
          disabled={submit.isPending}
          className="font-mono text-xs"
        >
          {submit.isPending ? (
            <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Connecting…</>
          ) : (
            <>Connect</>
          )}
        </Button>
      </form>
    </div>
  );
}
