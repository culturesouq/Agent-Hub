import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Copy, CheckCircle2, Plus, Trash2, Key, Globe, User,
  AlertTriangle, RefreshCw, Circle,
} from "lucide-react";

const API_ENDPOINT = "https://opsoul.io/v1/chat";

const ENDPOINT_BLOCK = `POST ${API_ENDPOINT}

Headers:
  Authorization: Bearer <your-slot-key>
  Content-Type: application/json

Body:
  {
    "message": "Hello",
    "conversationId": "optional — for multi-turn",
    "stream": false
  }`;

interface Slot {
  id: string;
  name: string;
  surfaceType: "guest" | "authenticated" | "workspace" | "crud";
  scopeTrust: string;
  apiKeyPreview: string;
  apiKey?: string;
  isActive: boolean | null;
  createdAt: string;
  revokedAt: string | null;
}

const SURFACE_META = {
  guest: {
    label: "Guest Chat",
    icon: Globe,
    color: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    description: "Anonymous users — ephemeral sessions",
  },
  authenticated: {
    label: "Auth Chat",
    icon: User,
    color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    description: "Signed-in users — persistent memory per userId",
  },
} as const;

function CopyButton({ text, title }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      title={title ?? "Copy"}
      className="p-1.5 rounded border border-border/40 bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied
        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
        : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function EndpointBlock() {
  return (
    <div className="relative group">
      <pre className="bg-black/40 border border-border/30 rounded-xl p-4 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre leading-relaxed">
        {ENDPOINT_BLOCK}
      </pre>
      <div className="absolute top-2 right-2">
        <CopyButton text={API_ENDPOINT} title="Copy endpoint URL" />
      </div>
    </div>
  );
}

function KeyRevealCard({
  slot,
  onDone,
}: {
  slot: Slot & { apiKey: string };
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(slot.apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-amber-500/40 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="font-headline font-bold text-base">Copy this key now</h3>
        </div>
        <p className="font-mono text-xs text-muted-foreground mt-1 mb-4">
          It will <span className="text-amber-500 font-bold">never be shown again</span>. We do not store it.
        </p>

        <div className="relative group mb-3">
          <div className="bg-black/50 border border-amber-500/30 rounded-lg px-3 py-2.5 font-mono text-xs text-amber-300 break-all leading-relaxed pr-10">
            {slot.apiKey}
          </div>
          <button
            onClick={copy}
            className="absolute top-2 right-2 p-1.5 rounded border border-border/40 bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
            title="Copy key"
          >
            {copied
              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="bg-muted/10 border border-border/30 rounded-lg p-3 mb-5 font-mono text-[11px] text-muted-foreground space-y-1">
          <p className="text-foreground/60 font-semibold text-xs">Use it like this:</p>
          <p>
            <span className="text-slate-400">Authorization:</span>{" "}
            <span className="text-amber-300/80">Bearer {slot.apiKey.slice(0, 24)}…</span>
          </p>
          <p>
            <span className="text-slate-400">Endpoint:</span>{" "}
            <span className="text-blue-400/80">POST {API_ENDPOINT}</span>
          </p>
        </div>

        <Button className="w-full font-mono text-sm" onClick={onDone}>
          I've copied it — Done
        </Button>
      </div>
    </div>
  );
}

function SurfacePill({ type }: { type: keyof typeof SURFACE_META }) {
  const meta = SURFACE_META[type];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold border ${meta.color}`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

export default function ApiKeysSection({ operatorId }: { operatorId: string }) {
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [revealSlot, setRevealSlot] = useState<(Slot & { apiKey: string }) | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    surfaceType: "guest" as "guest" | "authenticated",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["operators", operatorId, "slots"],
    queryFn: () => apiFetch<{ slots: Slot[] }>(`/operators/${operatorId}/slots`),
  });

  const chatSlots = (data?.slots ?? []).filter(
    s => s.surfaceType === "guest" || s.surfaceType === "authenticated",
  );

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Slot & { apiKey: string }>(`/operators/${operatorId}/slots`, {
        method: "POST",
        body: JSON.stringify({ name: form.name.trim(), surfaceType: form.surfaceType }),
      }),
    onSuccess: (slot) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "slots"] });
      setShowForm(false);
      setForm({ name: "", surfaceType: "guest" });
      setRevealSlot(slot);
    },
  });

  const revoke = useMutation({
    mutationFn: (slotId: string) =>
      apiFetch(`/operators/${operatorId}/slots/${slotId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "slots"] });
      setRevokeConfirm(null);
    },
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {revealSlot && (
        <KeyRevealCard slot={revealSlot} onDone={() => setRevealSlot(null)} />
      )}

      {/* Section 1 — Your Endpoint */}
      <div className="space-y-3">
        <div>
          <h2 className="font-headline font-bold text-lg">API Keys</h2>
          <p className="font-mono text-sm text-muted-foreground mt-0.5">
            Embed this operator in your website, app, or any system that can make HTTP requests.
          </p>
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
            Your Endpoint
          </p>
          <EndpointBlock />
        </div>
      </div>

      {/* Section 2 — Create New Key */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
            Create New Key
          </p>
          {!showForm && (
            <Button
              size="sm"
              className="font-mono text-xs gap-1.5 h-7"
              onClick={() => setShowForm(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              New Key
            </Button>
          )}
        </div>

        {showForm && (
          <div className="border border-border/50 rounded-xl p-5 bg-card/60 backdrop-blur space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground">Key Name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. My Website, FM App, Telegram Bot"
                className="w-full bg-background/60 border border-border/50 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50 transition-colors"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground">Surface Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(["guest", "authenticated"] as const).map(type => {
                  const meta = SURFACE_META[type];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => setForm(f => ({ ...f, surfaceType: type }))}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                        form.surfaceType === type
                          ? "border-primary/50 bg-primary/10"
                          : "border-border/40 hover:border-border/80 bg-background/40"
                      }`}
                    >
                      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-semibold font-mono">{meta.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                          {meta.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="font-mono text-xs"
                onClick={() => create.mutate()}
                disabled={!form.name.trim() || create.isPending}
              >
                {create.isPending
                  ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Creating…</>
                  : <><Key className="w-3 h-3 mr-1.5" />Create Key</>}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="font-mono text-xs"
                onClick={() => { setShowForm(false); setForm({ name: "", surfaceType: "guest" }); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Section 3 — Active Keys */}
      <div className="space-y-3">
        <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
          Active Keys
        </p>

        {isLoading ? (
          <div className="text-center py-10 font-mono text-sm text-muted-foreground animate-pulse">
            Loading keys…
          </div>
        ) : chatSlots.length === 0 ? (
          <div className="border border-dashed border-border/40 rounded-xl p-10 text-center space-y-2">
            <Key className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="font-mono font-semibold text-sm text-foreground/60">No API keys yet</p>
            <p className="text-xs text-muted-foreground font-mono">
              Create a key to embed this operator in your product.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {chatSlots.map(slot => {
              const isRevoked = !!slot.revokedAt || !slot.isActive;
              const isConfirming = revokeConfirm === slot.id;

              return (
                <div
                  key={slot.id}
                  className={`border rounded-xl p-4 transition-all ${
                    isRevoked
                      ? "border-border/20 bg-card/20 opacity-50"
                      : "border-border/40 bg-card/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm font-mono truncate">
                          {slot.name}
                        </span>
                        <SurfacePill type={slot.surfaceType as keyof typeof SURFACE_META} />
                        <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-semibold ${isRevoked ? "text-muted-foreground/50" : "text-green-500"}`}>
                          <Circle className={`w-2 h-2 fill-current ${isRevoked ? "opacity-40" : ""}`} />
                          {isRevoked ? "Revoked" : "Active"}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {slot.apiKeyPreview}
                          <span className="opacity-30">••••••••••••••••••</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 font-mono">
                          {new Date(slot.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {!isRevoked && !isConfirming && (
                      <button
                        onClick={() => setRevokeConfirm(slot.id)}
                        className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        title="Revoke this key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Revoke
                      </button>
                    )}
                  </div>

                  {isConfirming && (
                    <div className="mt-3 pt-3 border-t border-border/30 animate-in fade-in duration-150">
                      <p className="font-mono text-xs text-muted-foreground mb-2.5">
                        Revoke <span className="text-foreground font-semibold">"{slot.name}"</span>? Apps using it will stop working immediately.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-mono text-xs h-7 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => revoke.mutate(slot.id)}
                          disabled={revoke.isPending}
                        >
                          {revoke.isPending
                            ? <RefreshCw className="w-3 h-3 animate-spin" />
                            : "Yes, revoke it"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="font-mono text-xs h-7"
                          onClick={() => setRevokeConfirm(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
