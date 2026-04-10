import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Lock, AlertTriangle, RefreshCw, Key, Globe, ShieldCheck, Copy, Shield, Cpu, Eye, EyeOff, Check, Loader2, ChevronDown, Info, Zap, Plus, Trash2, CheckCircle2, User, Circle } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const MODELS = [
  {
    id: "opsoul/auto",
    label: "Auto",
    description: "OpSoul picks the right model per message — fast when simple, powerful when it matters.",
    badge: "Recommended",
  },
  {
    id: "anthropic/claude-sonnet-4-5",
    label: "Claude Sonnet",
    description: "Best quality — deep reasoning, rich responses, strong Arabic support.",
    badge: "Best Quality",
  },
  {
    id: "anthropic/claude-haiku-4-5",
    label: "Claude Haiku",
    description: "Fast and sharp — great for quick back-and-forth conversations.",
    badge: "Fast & Sharp",
  },
  {
    id: "google/gemini-flash-2.0",
    label: "Gemini Flash 2.0",
    description: "Fast, multimodal — handles images, files, and rapid queries.",
    badge: "Multimodal",
  },
] as const;

type EvolutionLevel = "OPEN" | "CONTROLLED" | "LOCKED";

const EVOLUTION_OPTIONS: { value: EvolutionLevel; label: string; description: string; color: string }[] = [
  {
    value: "LOCKED",
    label: "Locked",
    description: "No changes at all — your operator stays exactly as it is.",
    color: "border-red-500/40 text-red-500",
  },
  {
    value: "CONTROLLED",
    label: "Controlled",
    description: "Your operator can improve, but changes need your approval first.",
    color: "border-amber-500/40 text-amber-500",
  },
  {
    value: "OPEN",
    label: "Open",
    description: "Your operator learns and improves on its own over time.",
    color: "border-green-500/40 text-green-500",
  },
];

function CodeBlock({ code, onCopy }: { code: string; onCopy: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group">
      <pre className="font-mono text-xs bg-background/80 border border-border/30 rounded-lg p-4 overflow-x-auto text-muted-foreground leading-relaxed whitespace-pre-wrap break-all">
        {code}
      </pre>
      <button
        onClick={handleCopy}
        className={`absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded border bg-card hover:bg-card/80 ${
          copied
            ? "border-green-500/40 text-green-500"
            : "border-border/30 text-muted-foreground hover:text-foreground"
        }`}
        title="Copy"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

const PUBLIC_ENDPOINT = "https://api.opsoul.io/v1/chat";

const PUBLIC_ENDPOINT_BLOCK = `POST ${PUBLIC_ENDPOINT}

Headers:
  Authorization: Bearer <your-slot-key>
  Content-Type: application/json

Body:
  {
    "message": "Hello",
    "conversationId": "optional — for multi-turn",
    "stream": false
  }`;

interface ApiSlot {
  id: string;
  name: string;
  surfaceType: "guest" | "authenticated" | "workspace" | "crud";
  apiKeyPreview: string;
  apiKey?: string;
  isActive: boolean | null;
  createdAt: string;
  revokedAt: string | null;
}

const API_SLOT_META = {
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

function ApiCopyButton({ text, title }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      title={title ?? "Copy"}
      className="p-1.5 rounded border border-border/40 bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function PublicEndpointBlock() {
  return (
    <div className="relative group">
      <pre className="bg-black/40 border border-border/30 rounded-xl p-4 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre leading-relaxed">
        {PUBLIC_ENDPOINT_BLOCK}
      </pre>
      <div className="absolute top-2 right-2">
        <ApiCopyButton text={PUBLIC_ENDPOINT} title="Copy public endpoint URL" />
      </div>
    </div>
  );
}

function KeyRevealCard({ slot, onDone }: { slot: ApiSlot & { apiKey: string }; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
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
            onClick={() => { navigator.clipboard.writeText(slot.apiKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="absolute top-2 right-2 p-1.5 rounded border border-border/40 bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="bg-muted/10 border border-border/30 rounded-lg p-3 mb-5 font-mono text-[11px] text-muted-foreground space-y-1">
          <p className="text-foreground/60 font-semibold text-xs">Use it like this:</p>
          <p><span className="text-slate-400">Authorization:</span>{" "}<span className="text-amber-300/80">Bearer {slot.apiKey.slice(0, 24)}…</span></p>
          <p><span className="text-slate-400">Endpoint:</span>{" "}<span className="text-blue-400/80">POST {PUBLIC_ENDPOINT}</span></p>
        </div>
        <Button className="w-full font-mono text-sm" onClick={onDone}>I've copied it — Done</Button>
      </div>
    </div>
  );
}

function ApiSlotPill({ type }: { type: keyof typeof API_SLOT_META }) {
  const meta = API_SLOT_META[type];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold border ${meta.color}`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

interface OperatorSecret {
  id: string;
  key: string;
  createdAt: string;
}

function SecretsPanel({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [revealedIds, setRevealedIds] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["operators", operatorId, "secrets"],
    queryFn: () =>
      apiFetch<{ secrets: OperatorSecret[] }>(`/operators/${operatorId}/secrets`)
        .then((r) => r.secrets ?? []),
  });
  const secrets: OperatorSecret[] = data ?? [];

  const saveSecret = useMutation({
    mutationFn: () =>
      apiFetch(`/operators/${operatorId}/secrets`, {
        method: "POST",
        body: JSON.stringify({ key: newKey.trim().toUpperCase(), value: newValue.trim() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "secrets"] });
      toast({ title: "Secret saved" });
      setNewKey("");
      setNewValue("");
    },
    onError: (err: Error) =>
      toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const deleteSecret = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/operators/${operatorId}/secrets/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "secrets"] });
      setRevealedIds((prev) => { const n = { ...prev }; delete n[id]; return n; });
      toast({ title: "Secret deleted" });
    },
    onError: (err: Error) =>
      toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const handleReveal = async (id: string) => {
    if (revealedIds[id]) {
      setRevealedIds((prev) => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    setRevealingId(id);
    try {
      const { value } = await apiFetch<{ value: string }>(`/operators/${operatorId}/secrets/${id}/reveal`);
      setRevealedIds((prev) => ({ ...prev, [id]: value }));
    } catch (err: any) {
      toast({ title: "Could not reveal secret", description: err.message, variant: "destructive" });
    } finally {
      setRevealingId(null);
    }
  };

  const handleKeyInput = (v: string) => {
    setNewKey(v.toUpperCase().replace(/[^A-Z0-9_]/g, ""));
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2 border-b border-border/50 pb-3">
        <Key className="w-4 h-4 text-muted-foreground" />
        <div>
          <h2 className="font-headline font-bold text-base">Keys & Secrets</h2>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">
            Store API keys and tokens your operator can use during tasks — webhooks, third-party tools, external services.
          </p>
        </div>
      </div>

      {/* Add new */}
      <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-3">
        <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Add secret</p>
        <div className="flex gap-2 flex-col sm:flex-row">
          <Input
            placeholder="KEY_NAME"
            value={newKey}
            onChange={(e) => handleKeyInput(e.target.value)}
            className="font-mono text-xs sm:w-44 shrink-0 uppercase"
            autoComplete="off"
            spellCheck={false}
          />
          <Input
            type="password"
            placeholder="value / token"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="font-mono text-xs flex-1"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newKey.trim() && newValue.trim()) saveSecret.mutate();
            }}
          />
          <Button
            size="sm"
            onClick={() => saveSecret.mutate()}
            disabled={!newKey.trim() || !newValue.trim() || saveSecret.isPending}
            className="font-mono text-xs shrink-0"
          >
            {saveSecret.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-12 rounded-lg border border-border/20 bg-card/10 animate-pulse" />
          ))}
        </div>
      ) : secrets.length === 0 ? (
        <div className="rounded-xl border border-border/20 bg-card/10 p-6 text-center">
          <Key className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="font-mono text-xs text-muted-foreground">
            No secrets yet. Add API keys or tokens your operator can use during tasks.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {secrets.map((secret) => {
            const isRevealed = !!revealedIds[secret.id];
            const isRevealing = revealingId === secret.id;
            return (
              <div
                key={secret.id}
                className="flex items-center gap-3 rounded-lg border border-border/30 bg-card/20 px-4 py-3"
              >
                <code className="font-mono text-xs font-bold text-primary w-40 truncate shrink-0">
                  {secret.key}
                </code>
                <div className="flex-1 font-mono text-xs text-muted-foreground tracking-widest overflow-hidden">
                  {isRevealed ? (
                    <span className="text-foreground break-all tracking-normal">{revealedIds[secret.id]}</span>
                  ) : (
                    "••••••••••••"
                  )}
                </div>
                <button
                  onClick={() => handleReveal(secret.id)}
                  disabled={isRevealing}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title={isRevealed ? "Hide" : "Reveal"}
                >
                  {isRevealing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isRevealed ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => deleteSecret.mutate(secret.id)}
                  disabled={deleteSecret.isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function SettingsSection({ operator, section }: { operator: Operator; section?: "model" | "secrets" | "api" | "evolution" | "danger" | "safemode" }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [safeMode, setSafeMode] = useState(operator.safeMode ?? false);
  const [freeRoaming, setFreeRoaming] = useState(operator.freeRoaming ?? false);

  const defaultModelId = operator.defaultModel ?? "opsoul/auto";
  const [selectedModel, setSelectedModel] = useState<string>(defaultModelId);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "ok" | "fail">("idle");
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const selectedModelInfo = MODELS.find((m) => m.id === selectedModel) ?? MODELS[0];

  const saveModelSettings = useMutation({
    mutationFn: (payload: { apiKey?: string; model?: string; clearApiKey?: boolean }) =>
      apiFetch(`/operators/${operator.id}/model-settings`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Model settings saved" });
      setApiKeyInput("");
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const verifyKey = async () => {
    if (!apiKeyInput.trim()) return;
    setVerifyStatus("verifying");
    try {
      const r = await apiFetch<{ ok: boolean }>(`/operators/${operator.id}/model-settings/verify-key`, {
        method: "POST",
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      setVerifyStatus(r.ok ? "ok" : "fail");
      if (r.ok) toast({ title: "Key verified — it's working" });
      else toast({ title: "Key responded but check failed", variant: "destructive" });
    } catch {
      setVerifyStatus("fail");
      toast({ title: "Key verification failed — check the key and try again", variant: "destructive" });
    }
  };

  const currentLevel = (["OPEN", "CONTROLLED", "LOCKED"].includes(operator.growLockLevel ?? "")
    ? operator.growLockLevel
    : "CONTROLLED") as EvolutionLevel;

  const [evolutionMode, setEvolutionMode] = useState<EvolutionLevel>(currentLevel);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [revealSlot, setRevealSlot] = useState<(ApiSlot & { apiKey: string }) | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null);
  const [keyForm, setKeyForm] = useState({ name: "", surfaceType: "guest" as "guest" | "authenticated" });

  const copy = (text: string, field: string, label = "Copied") => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    } else {
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      } catch {}
    }
    toast({ title: label });
    setCopiedField(field);
    setTimeout(() => setCopiedField(f => f === field ? null : f), 1500);
  };

  const baseUrl = `${window.location.origin}/api`;
  const chatEndpoint = `${baseUrl}/operators/${operator.id}/conversations`;
  const messagesEndpoint = `${baseUrl}/operators/${operator.id}/conversations/{conversationId}/messages`;

  const curlExample = `curl -X POST "${messagesEndpoint.replace('{conversationId}', '<CONVERSATION_ID>')}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <YOUR_TOKEN>" \\
  -d '{"message": "Hello", "stream": false}'`;

  const jsExample = `const response = await fetch(
  "${messagesEndpoint.replace('{conversationId}', '<CONVERSATION_ID>')}",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer <YOUR_TOKEN>",
    },
    body: JSON.stringify({ message: "Hello", stream: false }),
  }
);
const data = await response.json();
console.log(data.content);`;

  const pythonExample = `import requests

response = requests.post(
    "${messagesEndpoint.replace('{conversationId}', '<CONVERSATION_ID>')}",
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer <YOUR_TOKEN>",
    },
    json={"message": "Hello", "stream": False},
)
print(response.json()["content"])`;

  const updateEvolutionMode = useMutation({
    mutationFn: (level: EvolutionLevel) => apiFetch(`/operators/${operator.id}/grow-lock`, {
      method: "PATCH",
      body: JSON.stringify({ level }),
    }),
    onSuccess: (_, level) => {
      setEvolutionMode(level);
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Evolution setting saved" });
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const toggleSafeMode = useMutation({
    mutationFn: (enabled: boolean) => apiFetch(`/operators/${operator.id}/safe-mode`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
    onSuccess: (_, enabled) => {
      setSafeMode(enabled);
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: enabled ? "Safe Mode enabled" : "Safe Mode disabled" });
    },
    onError: (err: Error) => toast({ title: "Failed to update Safe Mode", description: err.message, variant: "destructive" }),
  });

  const updateFreeRoaming = useMutation({
    mutationFn: (enabled: boolean) => apiFetch(`/operators/${operator.id}`, {
      method: "PATCH",
      body: JSON.stringify({ freeRoaming: enabled }),
    }),
    onSuccess: (_, enabled) => {
      setFreeRoaming(enabled);
      toast({ title: enabled ? "Free Roaming enabled" : "Free Roaming disabled" });
    },
    onError: (err: Error) => toast({ title: "Failed to update Free Roaming", description: err.message, variant: "destructive" }),
  });

  const lockIdentity = useMutation({
    mutationFn: () => apiFetch(`/operators/${operator.id}/lock-layer1`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Identity locked" });
    },
  });

  const resetPersonality = useMutation({
    mutationFn: () => apiFetch(`/operators/${operator.id}/soul/reset`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Personality reset" });
    },
  });

  const deleteOperator = useMutation({
    mutationFn: () => apiFetch(`/operators/${operator.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators"] });
      toast({ title: "Operator deleted" });
      setLocation("/");
    },
  });

  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ["operators", operator.id, "slots"],
    queryFn: () => apiFetch<{ slots: ApiSlot[] }>(`/operators/${operator.id}/slots`),
    enabled: section === "api" || !section,
  });

  const chatSlots = (slotsData?.slots ?? []).filter(
    (s) => s.surfaceType === "guest" || s.surfaceType === "authenticated",
  );

  const createSlot = useMutation({
    mutationFn: () =>
      apiFetch<ApiSlot & { apiKey: string }>(`/operators/${operator.id}/slots`, {
        method: "POST",
        body: JSON.stringify({ name: keyForm.name.trim(), surfaceType: keyForm.surfaceType }),
      }),
    onSuccess: (slot) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id, "slots"] });
      setShowKeyForm(false);
      setKeyForm({ name: "", surfaceType: "guest" });
      setRevealSlot(slot);
    },
  });

  const revokeSlot = useMutation({
    mutationFn: (slotId: string) =>
      apiFetch(`/operators/${operator.id}/slots/${slotId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id, "slots"] });
      setRevokeConfirm(null);
    },
  });

  const isLocked = !!operator.layer1LockedAt;

  const show = (s: "model" | "secrets" | "api" | "evolution" | "danger" | "safemode") => !section || section === s;

  return (
    <div className="space-y-10 animate-in fade-in zoom-in-95 duration-300 max-w-2xl glass-panel rounded-2xl border border-border/30 p-6">
      {revealSlot && <KeyRevealCard slot={revealSlot} onDone={() => setRevealSlot(null)} />}

      {show("model") && (
        <section className="space-y-5">
          <div className="flex items-center gap-2 border-b border-border/50 pb-3">
            <Cpu className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-headline font-bold text-base">Model & AI</h2>
          </div>

          {!operator.hasCustomApiKey && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-mono text-xs font-bold text-amber-500">Using OpSoul's shared key</p>
                <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
                  Your operator runs on OpSoul's OpenRouter key. Add your own key to get full model access and remove usage limits.
                </p>
              </div>
            </div>
          )}

          {operator.hasCustomApiKey && (
            <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3">
              <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-mono text-xs font-bold text-green-500">Custom OpenRouter key active</p>
                <p className="font-mono text-[11px] text-muted-foreground">Your operator uses your own API key.</p>
              </div>
              <button
                onClick={() => saveModelSettings.mutate({ clearApiKey: true })}
                className="ml-auto font-mono text-[10px] text-muted-foreground hover:text-destructive transition-colors shrink-0"
              >
                Remove key
              </button>
            </div>
          )}

          <div className="space-y-2">
            <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Default Model</label>
            <div className="relative">
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="w-full flex items-center justify-between p-4 rounded-lg border-2 border-border/40 bg-card/20 hover:border-border transition-all font-mono text-left"
              >
                <div>
                  <div className="text-sm font-bold">{selectedModelInfo.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{selectedModelInfo.description}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {selectedModelInfo.badge}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showModelDropdown ? "rotate-180" : ""}`} />
                </div>
              </button>

              {showModelDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border/40 bg-card shadow-xl z-20 overflow-hidden">
                  {MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModel(m.id); setShowModelDropdown(false); }}
                      className={`w-full flex items-center justify-between px-4 py-3 font-mono text-left hover:bg-card/80 transition-colors border-b border-border/20 last:border-0
                        ${selectedModel === m.id ? "bg-primary/5" : ""}`}
                    >
                      <div>
                        <div className="text-sm font-bold">{m.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{m.description}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-muted/30 text-muted-foreground border border-border/20">
                          {m.badge}
                        </span>
                        {selectedModel === m.id && <Check className="w-4 h-4 text-primary" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              size="sm"
              onClick={() => saveModelSettings.mutate({ model: selectedModel })}
              disabled={saveModelSettings.isPending}
              className="font-mono text-xs"
            >
              {saveModelSettings.isPending ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Saving...</> : "Save Settings"}
            </Button>
          </div>
        </section>
      )}

      {show("secrets") && (
        <SecretsPanel operatorId={operator.id} />
      )}

      {show("api") && (
        <section className="space-y-5">
          <div className="flex items-center gap-2 border-b border-border/50 pb-3">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-headline font-bold text-base">API Reference</h2>
          </div>

          <p className="font-mono text-xs text-muted-foreground">
            Connect your operator to any app, script, or automation using the REST API below.
          </p>

          <div className="space-y-1">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Operator ID</span>
              <button onClick={() => copy(operator.id, "opid")} className={`font-mono text-xs flex items-center gap-1 transition-colors ${copiedField === "opid" ? "text-green-500" : "text-primary hover:underline"}`}>
                {copiedField === "opid" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedField === "opid" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="font-mono text-sm bg-background/60 border border-border/30 rounded-lg px-3 py-2.5 break-all select-all text-primary/80">
              {operator.id}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Authentication header</span>
              <button onClick={() => copy("Authorization: Bearer <YOUR_TOKEN>", "auth")} className={`font-mono text-xs flex items-center gap-1 transition-colors ${copiedField === "auth" ? "text-green-500" : "text-primary hover:underline"}`}>
                {copiedField === "auth" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedField === "auth" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="font-mono text-sm bg-background/60 border border-border/30 rounded-lg px-3 py-2.5 text-muted-foreground">
              Authorization: Bearer {"<YOUR_TOKEN>"}
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">Use the token from your login response or refresh token endpoint.</p>
          </div>

          <div className="space-y-2">
            <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Chat endpoint</span>
            <div className="font-mono text-xs bg-background/60 border border-border/30 rounded-lg px-3 py-2.5 text-muted-foreground">
              POST {chatEndpoint}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">curl</span>
              <button onClick={() => copy(curlExample, "curl")} className={`font-mono text-xs flex items-center gap-1 transition-colors ${copiedField === "curl" ? "text-green-500" : "text-primary hover:underline"}`}>
                {copiedField === "curl" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedField === "curl" ? "Copied" : "Copy"}
              </button>
            </div>
            <CodeBlock code={curlExample} onCopy={() => copy(curlExample, "curl-block")} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">JavaScript</span>
              <button onClick={() => copy(jsExample, "js")} className={`font-mono text-xs flex items-center gap-1 transition-colors ${copiedField === "js" ? "text-green-500" : "text-primary hover:underline"}`}>
                {copiedField === "js" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedField === "js" ? "Copied" : "Copy"}
              </button>
            </div>
            <CodeBlock code={jsExample} onCopy={() => copy(jsExample, "js-block")} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Python</span>
              <button onClick={() => copy(pythonExample, "py")} className={`font-mono text-xs flex items-center gap-1 transition-colors ${copiedField === "py" ? "text-green-500" : "text-primary hover:underline"}`}>
                {copiedField === "py" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedField === "py" ? "Copied" : "Copy"}
              </button>
            </div>
            <CodeBlock code={pythonExample} onCopy={() => copy(pythonExample, "py-block")} />
          </div>

          {/* ── API Keys ── */}
          <div className="border-t border-border/40 pt-6 space-y-6">

            {/* Section 1 — Public Endpoint */}
            <div className="space-y-2">
              <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">Public Endpoint</p>
              <PublicEndpointBlock />
            </div>

            {/* Section 2 — Create New Key */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">Create New Key</p>
                {!showKeyForm && (
                  <Button size="sm" className="font-mono text-xs gap-1.5 h-7" onClick={() => setShowKeyForm(true)}>
                    <Plus className="w-3.5 h-3.5" />
                    New Key
                  </Button>
                )}
              </div>

              {showKeyForm && (
                <div className="border border-border/50 rounded-xl p-5 bg-card/60 backdrop-blur space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-muted-foreground">Key Name</label>
                    <input
                      value={keyForm.name}
                      onChange={(e) => setKeyForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. My Website, FM App, Telegram Bot"
                      className="w-full bg-background/60 border border-border/50 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50 transition-colors"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-muted-foreground">Surface Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["guest", "authenticated"] as const).map((type) => {
                        const meta = API_SLOT_META[type];
                        const Icon = meta.icon;
                        return (
                          <button
                            key={type}
                            onClick={() => setKeyForm((f) => ({ ...f, surfaceType: type }))}
                            className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                              keyForm.surfaceType === type
                                ? "border-primary/50 bg-primary/10"
                                : "border-border/40 hover:border-border/80 bg-background/40"
                            }`}
                          >
                            <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                            <div>
                              <p className="text-xs font-semibold font-mono">{meta.label}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{meta.description}</p>
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
                      onClick={() => createSlot.mutate()}
                      disabled={!keyForm.name.trim() || createSlot.isPending}
                    >
                      {createSlot.isPending
                        ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Creating…</>
                        : <><Key className="w-3 h-3 mr-1.5" />Create Key</>}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="font-mono text-xs"
                      onClick={() => { setShowKeyForm(false); setKeyForm({ name: "", surfaceType: "guest" }); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Section 3 — Active Keys */}
            <div className="space-y-3">
              <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">Active Keys</p>
              {slotsLoading ? (
                <div className="text-center py-8 font-mono text-sm text-muted-foreground animate-pulse">Loading keys…</div>
              ) : chatSlots.length === 0 ? (
                <div className="border border-dashed border-border/40 rounded-xl p-8 text-center space-y-2">
                  <Key className="w-7 h-7 text-muted-foreground/30 mx-auto" />
                  <p className="font-mono font-semibold text-sm text-foreground/60">No API keys yet</p>
                  <p className="text-xs text-muted-foreground font-mono">Create a key to embed this operator in your product.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {chatSlots.map((slot) => {
                    const isRevoked = !!slot.revokedAt || !slot.isActive;
                    const isConfirming = revokeConfirm === slot.id;
                    return (
                      <div
                        key={slot.id}
                        className={`border rounded-xl p-4 transition-all ${
                          isRevoked ? "border-border/20 bg-card/20 opacity-50" : "border-border/40 bg-card/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm font-mono truncate">{slot.name}</span>
                              <ApiSlotPill type={slot.surfaceType as keyof typeof API_SLOT_META} />
                              <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-semibold ${isRevoked ? "text-muted-foreground/50" : "text-green-500"}`}>
                                <Circle className={`w-2 h-2 fill-current ${isRevoked ? "opacity-40" : ""}`} />
                                {isRevoked ? "Revoked" : "Active"}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {slot.apiKeyPreview}<span className="opacity-30">••••••••••••••••••</span>
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
                                onClick={() => revokeSlot.mutate(slot.id)}
                                disabled={revokeSlot.isPending}
                              >
                                {revokeSlot.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Yes, revoke it"}
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
        </section>
      )}

      {show("safemode") && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border/50 pb-3">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-headline font-bold text-base">Safe Mode</h2>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/30 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="font-mono text-sm font-bold">Enable Safe Mode</p>
                <p className="font-mono text-xs text-muted-foreground mt-1 leading-relaxed">
                  When on: growth is paused, integrations become read-only, and nothing new is learned.
                  Use this when you want the operator to stay exactly as it is, without any changes.
                </p>
                {safeMode && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 font-mono text-xs font-bold">
                    <Shield className="w-3 h-3" /> Safe Mode is active
                  </div>
                )}
              </div>
              <Switch
                checked={safeMode}
                onCheckedChange={(checked) => toggleSafeMode.mutate(checked)}
                disabled={toggleSafeMode.isPending}
                className="mt-1 shrink-0"
              />
            </div>
          </div>
        </section>
      )}

      <section className="space-y-4">
        {show("safemode") && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-headline font-bold text-base">Free Roaming</h2>
              <Switch
                checked={freeRoaming}
                onCheckedChange={(val) => updateFreeRoaming.mutate(val)}
                disabled={updateFreeRoaming.isPending}
              />
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              When enabled, the Operator can act autonomously using connected integrations.
              Tool Use Policy activates and controls what it is allowed to do.
            </p>
            {freeRoaming && (
              <div className="flex items-center gap-1.5 text-xs text-amber-500 font-mono">
                <Zap className="w-3 h-3" /> Free Roaming is active — Tool Use Policy enforced
              </div>
            )}
          </>
        )}
      </section>

      {show("evolution") && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border/50 pb-3">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-headline font-bold text-base">Evolution Lock</h2>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            Choose how much your operator is allowed to learn and adapt over time.
          </p>
          <div className="space-y-3">
            {EVOLUTION_OPTIONS.map((opt) => {
              const isActive = evolutionMode === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => updateEvolutionMode.mutate(opt.value)}
                  disabled={updateEvolutionMode.isPending}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all font-mono
                    ${isActive
                      ? `${opt.color} bg-card/60`
                      : "border-border/40 text-foreground hover:border-border bg-card/20"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-bold text-sm ${isActive ? "" : "text-foreground"}`}>{opt.label}</span>
                    {isActive && <div className="w-2 h-2 rounded-full bg-current" />}
                  </div>
                  <p className={`text-xs mt-1 ${isActive ? "opacity-80" : "text-muted-foreground"}`}>
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {show("danger") && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-destructive/30 pb-3">
            <AlertTriangle className="w-4 h-4 text-destructive/70" />
            <h2 className="font-headline font-bold text-base text-destructive/80">Danger Zone</h2>
          </div>
          <div className="space-y-3">
            {!isLocked && (
              <div className="flex items-start justify-between p-4 border border-border/40 rounded-lg bg-card/20">
                <div>
                  <p className="font-mono text-sm font-bold">Prevent operator from self-modifying</p>
                  <p className="font-mono text-xs text-muted-foreground mt-0.5">
                    Stops your operator from changing its own identity during conversations. You as the owner can always edit it. Cannot be undone.
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="font-mono text-xs border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground ml-4 shrink-0">
                      <Lock className="w-3 h-3 mr-1.5" /> Lock
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="border-primary/20">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="font-mono text-primary flex items-center gap-2">
                        <Lock className="w-5 h-5" /> Prevent operator from self-modifying?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="font-mono">
                        Your operator will not be able to change its own identity during conversations. You as the owner can always edit it here. Cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="font-mono">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => lockIdentity.mutate()} className="font-mono font-bold">
                        Lock forever
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
            <div className="flex items-start justify-between p-4 border border-border/40 rounded-lg bg-card/20">
              <div>
                <p className="font-mono text-sm font-bold">Reset personality</p>
                <p className="font-mono text-xs text-muted-foreground mt-0.5">
                  Reverts all personality changes back to the original. Chat history stays intact.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="font-mono text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10 ml-4 shrink-0">
                    <RefreshCw className="w-3 h-3 mr-1.5" /> Reset
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-amber-500/20">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-mono text-amber-500 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" /> Reset personality?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="font-mono">
                      All personality changes will be reverted. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="font-mono">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => resetPersonality.mutate()} className="bg-amber-500 text-white font-mono font-bold">
                      Reset
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="flex items-start justify-between p-4 border border-destructive/30 rounded-lg bg-destructive/5">
              <div>
                <p className="font-mono text-sm font-bold text-destructive">Delete {operator.name}</p>
                <p className="font-mono text-xs text-muted-foreground mt-0.5">
                  Removes this operator from your dashboard. All data is recoverable for 30 days, then permanently purged.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="font-mono text-xs border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground ml-4 shrink-0">
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-destructive/20">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-mono text-destructive">Delete {operator.name}?</AlertDialogTitle>
                    <AlertDialogDescription className="font-mono">
                      This operator will be permanently deleted after 30 days. All memory, knowledge, and conversations will be removed. Contact support within 30 days to recover it.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="font-mono">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteOperator.mutate()} className="bg-destructive text-destructive-foreground font-mono font-bold">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
