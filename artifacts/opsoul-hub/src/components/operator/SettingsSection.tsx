import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Lock, AlertTriangle, RefreshCw, Key, Globe, ShieldCheck, Copy, Shield, Cpu, Eye, EyeOff, Check, Loader2, ChevronDown, Info, Zap } from "lucide-react";
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
  return (
    <div className="relative group">
      <pre className="font-mono text-xs bg-background/80 border border-border/30 rounded-lg p-4 overflow-x-auto text-muted-foreground leading-relaxed whitespace-pre-wrap break-all">
        {code}
      </pre>
      <button
        onClick={onCopy}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded border border-border/30 bg-card hover:bg-card/80 text-muted-foreground hover:text-foreground"
      >
        <Copy className="w-3 h-3" />
      </button>
    </div>
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
      const r = await apiFetch(`/operators/${operator.id}/model-settings/verify-key`, {
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

  const copy = (text: string, label = "Copied") => {
    navigator.clipboard.writeText(text);
    toast({ title: label });
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

  const isLocked = !!operator.layer1LockedAt;

  const show = (s: "model" | "secrets" | "api" | "evolution" | "danger" | "safemode") => !section || section === s;

  return (
    <div className="space-y-10 animate-in fade-in zoom-in-95 duration-300 max-w-2xl">

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
        <section className="space-y-4">
          <div>
            <h3 className="font-mono font-bold text-sm text-foreground">Keys & Secrets</h3>
            <p className="font-mono text-xs text-muted-foreground mt-1">
              Store API keys and tokens your operator can use during conversations — webhooks, third-party tools, external services.
            </p>
          </div>
          <div className="rounded-lg border border-border/30 bg-muted/20 px-4 py-3">
            <p className="font-mono text-xs text-muted-foreground">Coming soon — external integration secrets.</p>
          </div>
        </section>
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
              <button onClick={() => copy(operator.id)} className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
            <div className="font-mono text-sm bg-background/60 border border-border/30 rounded-lg px-3 py-2.5 break-all select-all text-primary/80">
              {operator.id}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Authentication header</span>
              <button onClick={() => copy("Authorization: Bearer <YOUR_TOKEN>")} className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
                <Copy className="w-3 h-3" /> Copy
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
              <button onClick={() => copy(curlExample)} className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
            <CodeBlock code={curlExample} onCopy={() => copy(curlExample)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">JavaScript</span>
              <button onClick={() => copy(jsExample)} className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
            <CodeBlock code={jsExample} onCopy={() => copy(jsExample)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Python</span>
              <button onClick={() => copy(pythonExample)} className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
            <CodeBlock code={pythonExample} onCopy={() => copy(pythonExample)} />
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
                  Permanently deletes this operator along with all memory, knowledge, and chat history.
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
                      This permanently removes {operator.name} including all memory, knowledge, and conversations. There is no way to undo this.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="font-mono">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteOperator.mutate()} className="bg-destructive text-destructive-foreground font-mono font-bold">
                      Delete forever
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
