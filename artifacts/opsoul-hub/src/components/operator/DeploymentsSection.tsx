import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Globe, Lock, Code2, Copy, CheckCircle2, Plus, Trash2,
  Eye, EyeOff, ChevronDown, ChevronUp, AlertTriangle, Zap,
  MessageSquare, User, Cpu, RefreshCw,
} from "lucide-react";

interface DeploymentSlot {
  id: string;
  operatorId: string;
  name: string;
  surfaceType: "workspace" | "crud" | "guest" | "authenticated";
  scopeTrust: string;
  apiKeyPreview: string;
  apiKey?: string;
  isActive: boolean | null;
  allowedOrigins: string[] | null;
  createdAt: string;
  revokedAt: string | null;
}

const SURFACE_META: Record<string, { label: string; color: string; icon: React.ElementType; description: string }> = {
  workspace: { label: "Workspace",     color: "bg-blue-500/15 text-blue-400 border-blue-500/30",       icon: Cpu,          description: "Internal owner workspace (full access)" },
  crud:      { label: "CRUD Agent",    color: "bg-violet-500/15 text-violet-400 border-violet-500/30", icon: Zap,          description: "Backend actions via POST /v1/action — no chat" },
  guest:     { label: "Guest Chat",    color: "bg-slate-500/15 text-slate-400 border-slate-500/30",    icon: Globe,        description: "Anonymous users, ephemeral sessions" },
  authenticated: { label: "Auth Chat", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: User, description: "Signed-in users, persistent memory per userId" },
};

function SurfaceBadge({ type }: { type: string }) {
  const meta = SURFACE_META[type] ?? SURFACE_META.guest;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold border ${meta.color}`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-black/40 border border-border/30 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 p-1.5 rounded bg-background/60 border border-border/40 text-muted-foreground hover:text-foreground transition-all opacity-0 group-hover:opacity-100"
        title="Copy code"
      >
        {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function codeExample(slot: DeploymentSlot, key: string): string {
  const displayKey = key || `${slot.apiKeyPreview}...`;
  if (slot.surfaceType === "guest") {
    return `// Guest chat — ephemeral, no userId needed
const res = await fetch("https://api.opsoul.io/v1/chat", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${displayKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    message: "Hello",
    stream: false
  })
});
const data = await res.json();
console.log(data.message.content);
// data.conversationId — pass back for multi-turn`;
  }
  if (slot.surfaceType === "authenticated") {
    return `// Authenticated chat — persistent memory per userId
const res = await fetch("https://api.opsoul.io/v1/chat", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${displayKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    message: "Hello",
    userId: "user_123",   // your app's user ID
    stream: false
  })
});
const data = await res.json();
console.log(data.message.content);`;
  }
  if (slot.surfaceType === "crud") {
    return `// CRUD action — operator executes and returns result, no chat
const res = await fetch("https://api.opsoul.io/v1/action", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${displayKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    action: "summarize_report",
    payload: { reportId: "rpt_456" }
  })
});
const data = await res.json();
console.log(data.result);`;
  }
  return `// Workspace slots are for internal use only`;
}

function KeyRevealModal({
  slot,
  onClose,
}: {
  slot: DeploymentSlot & { apiKey: string };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(slot.apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="font-headline font-bold text-base">Save your API key</h3>
        </div>
        <p className="text-sm text-muted-foreground font-mono mb-4 mt-1">
          This is shown <span className="text-amber-500 font-bold">once only</span>. Copy it now — we do not store it.
        </p>
        <div className="relative group mb-4">
          <div className="bg-black/50 border border-amber-500/30 rounded-lg p-3 font-mono text-xs text-amber-300 break-all leading-relaxed">
            {slot.apiKey}
          </div>
          <button
            onClick={copy}
            className="absolute top-2 right-2 p-1.5 rounded bg-background/60 border border-border/40 text-muted-foreground hover:text-foreground transition-all"
            title="Copy key"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="bg-muted/20 border border-border/30 rounded-lg p-3 mb-5 font-mono text-xs text-muted-foreground">
          <p className="font-semibold text-foreground/70 mb-1">Code example:</p>
          <p className="whitespace-pre-wrap">{codeExample(slot, slot.apiKey)}</p>
        </div>
        <Button className="w-full" onClick={onClose}>
          Done — I saved the key
        </Button>
      </div>
    </div>
  );
}

export default function DeploymentsSection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [newSlotData, setNewSlotData] = useState<DeploymentSlot & { apiKey: string } | null>(null);
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    surfaceType: "guest" as DeploymentSlot["surfaceType"],
    allowedOrigins: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["operators", operatorId, "slots"],
    queryFn: () => apiFetch<{ slots: DeploymentSlot[] }>(`/operators/${operatorId}/slots`),
  });

  const slots = data?.slots ?? [];

  const create = useMutation({
    mutationFn: () =>
      apiFetch<DeploymentSlot & { apiKey: string }>(`/operators/${operatorId}/slots`, {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          surfaceType: form.surfaceType,
          allowedOrigins: form.allowedOrigins
            ? form.allowedOrigins.split(",").map(s => s.trim()).filter(Boolean)
            : undefined,
        }),
      }),
    onSuccess: (slot) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "slots"] });
      setShowCreate(false);
      setForm({ name: "", surfaceType: "guest", allowedOrigins: "" });
      setNewSlotData(slot);
    },
    onError: () => toast({ title: "Failed to create slot", variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: (slotId: string) =>
      apiFetch(`/operators/${operatorId}/slots/${slotId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "slots"] });
      toast({ title: "Slot revoked" });
    },
    onError: () => toast({ title: "Failed to revoke slot", variant: "destructive" }),
  });

  const toggle = useMutation({
    mutationFn: ({ slotId, isActive }: { slotId: string; isActive: boolean }) =>
      apiFetch(`/operators/${operatorId}/slots/${slotId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "slots"] }),
    onError: () => toast({ title: "Failed to update slot", variant: "destructive" }),
  });

  const copyEndpoint = (slot: DeploymentSlot) => {
    const url = slot.surfaceType === "crud"
      ? "https://api.opsoul.io/v1/action"
      : "https://api.opsoul.io/v1/chat";
    navigator.clipboard.writeText(url);
    toast({ title: "Endpoint URL copied" });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {newSlotData && (
        <KeyRevealModal slot={newSlotData} onClose={() => setNewSlotData(null)} />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-headline font-bold text-lg">Deployment Slots</h2>
          <p className="text-sm text-muted-foreground font-mono mt-0.5">
            Deploy this operator across multiple surfaces with isolated sessions and API keys.
          </p>
        </div>
        <Button
          size="sm"
          className="font-mono text-xs gap-1.5"
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus className="w-3.5 h-3.5" />
          New Slot
        </Button>
      </div>

      {showCreate && (
        <div className="border border-border/50 rounded-xl p-5 bg-card/60 backdrop-blur space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <h3 className="font-headline font-semibold text-sm">Create Deployment Slot</h3>

          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground">Name</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. My Website Chat"
              className="w-full bg-background/60 border border-border/50 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground">Surface Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(["guest", "authenticated", "crud", "workspace"] as const).map(type => {
                const meta = SURFACE_META[type];
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    onClick={() => setForm(f => ({ ...f, surfaceType: type }))}
                    className={`flex items-start gap-2 p-3 rounded-lg border text-left transition-all ${
                      form.surfaceType === type
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/40 hover:border-border/80 bg-background/40"
                    }`}
                  >
                    <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-semibold font-mono">{meta.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{meta.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground">
              Allowed Origins <span className="text-muted-foreground/50">(optional, comma-separated)</span>
            </label>
            <input
              value={form.allowedOrigins}
              onChange={e => setForm(f => ({ ...f, allowedOrigins: e.target.value }))}
              placeholder="https://yourapp.com, https://app.yourapp.com"
              className="w-full bg-background/60 border border-border/50 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50 transition-colors"
            />
            <p className="text-[10px] text-muted-foreground font-mono">Leave blank to allow all origins</p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="font-mono text-xs"
              onClick={() => create.mutate()}
              disabled={!form.name.trim() || create.isPending}
            >
              {create.isPending ? (
                <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Creating...</>
              ) : "Create Slot"}
            </Button>
            <Button size="sm" variant="ghost" className="font-mono text-xs" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground font-mono text-sm animate-pulse">
          Loading slots...
        </div>
      ) : slots.length === 0 ? (
        <div className="border border-dashed border-border/40 rounded-xl p-10 text-center space-y-2">
          <Globe className="w-8 h-8 text-muted-foreground/30 mx-auto" />
          <p className="font-mono font-semibold text-sm text-foreground/60">No deployment slots yet</p>
          <p className="text-xs text-muted-foreground font-mono">
            Create a slot to deploy this operator on your website, app, or backend.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {slots.map(slot => {
            const meta = SURFACE_META[slot.surfaceType] ?? SURFACE_META.guest;
            const Icon = meta.icon;
            const isExpanded = expandedSlotId === slot.id;
            const isRevoked = !!slot.revokedAt || !slot.isActive;

            return (
              <div
                key={slot.id}
                className={`border rounded-xl transition-all ${
                  isRevoked
                    ? "border-border/20 bg-card/20 opacity-60"
                    : "border-border/40 bg-card/40 hover:border-border/70"
                }`}
              >
                <div className="flex items-center gap-3 p-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${meta.color} shrink-0`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm font-mono truncate">{slot.name}</span>
                      <SurfaceBadge type={slot.surfaceType} />
                      {isRevoked && (
                        <span className="text-[10px] font-mono font-bold text-destructive/80 border border-destructive/30 rounded px-1.5 py-0.5">
                          REVOKED
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {slot.apiKeyPreview}<span className="opacity-40">••••••••••••••••••</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(slot.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isRevoked && (
                      <button
                        onClick={() => copyEndpoint(slot)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                        title="Copy endpoint URL"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedSlotId(isExpanded ? null : slot.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border/30 p-4 space-y-4 animate-in fade-in slide-in-from-top-1 duration-150">

                    {!isRevoked && (
                      <>
                        <div>
                          <p className="text-xs font-mono font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Code2 className="w-3 h-3" /> Code Example
                          </p>
                          <CodeBlock code={codeExample(slot, "")} />
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className={`font-mono text-xs gap-1.5 h-7 ${slot.isActive ? "text-amber-400 border-amber-500/30 hover:bg-amber-500/10" : "text-green-400 border-green-500/30 hover:bg-green-500/10"}`}
                            onClick={() => toggle.mutate({ slotId: slot.id, isActive: !slot.isActive })}
                            disabled={toggle.isPending}
                          >
                            {slot.isActive ? (
                              <><EyeOff className="w-3 h-3" />Disable</>
                            ) : (
                              <><Eye className="w-3 h-3" />Enable</>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="font-mono text-xs gap-1.5 h-7 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => {
                              if (confirm(`Revoke slot "${slot.name}"? This cannot be undone.`)) {
                                revoke.mutate(slot.id);
                              }
                            }}
                            disabled={revoke.isPending}
                          >
                            <Trash2 className="w-3 h-3" />Revoke
                          </Button>
                        </div>
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-muted-foreground">
                      <div><span className="text-foreground/50">Trust level:</span> {slot.scopeTrust}</div>
                      <div><span className="text-foreground/50">Origins:</span> {slot.allowedOrigins?.join(", ") || "any"}</div>
                      <div><span className="text-foreground/50">Slot ID:</span> {slot.id.slice(0, 8)}...</div>
                      {slot.revokedAt && (
                        <div><span className="text-destructive/70">Revoked:</span> {new Date(slot.revokedAt).toLocaleDateString()}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
