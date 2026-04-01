import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Lock, AlertTriangle, RefreshCw, Key, Globe, ShieldCheck } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type EvolutionLevel = "OPEN" | "CONTROLLED" | "LOCKED";

const EVOLUTION_OPTIONS: { value: EvolutionLevel; label: string; description: string; color: string }[] = [
  {
    value: "LOCKED",
    label: "Locked",
    description: "No changes at all — your assistant stays exactly as it is.",
    color: "border-red-500/40 text-red-500",
  },
  {
    value: "CONTROLLED",
    label: "Controlled",
    description: "Your assistant can improve, but changes need your approval first.",
    color: "border-amber-500/40 text-amber-500",
  },
  {
    value: "OPEN",
    label: "Open",
    description: "Your assistant learns and improves on its own over time.",
    color: "border-green-500/40 text-green-500",
  },
];

export default function SettingsSection({ operator }: { operator: Operator }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const currentLevel = (["OPEN", "CONTROLLED", "LOCKED"].includes(operator.growLockLevel ?? "")
    ? operator.growLockLevel
    : "CONTROLLED") as EvolutionLevel;

  const [evolutionMode, setEvolutionMode] = useState<EvolutionLevel>(currentLevel);

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

  return (
    <div className="space-y-10 animate-in fade-in zoom-in-95 duration-300 max-w-2xl">

      {/* Secrets & Keys */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-border/50 pb-3">
          <Key className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-mono font-bold text-base">Secrets & Keys</h2>
        </div>
        <div className="rounded-lg border border-border/40 bg-card/30 p-6 text-center space-y-2">
          <Key className="w-8 h-8 text-muted-foreground/40 mx-auto" />
          <p className="font-mono text-sm font-medium">Store private keys and tokens</p>
          <p className="font-mono text-xs text-muted-foreground max-w-sm mx-auto">
            Save API keys and tokens that only your assistant can access during conversations. Coming soon.
          </p>
        </div>
      </section>

      {/* API */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-border/50 pb-3">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-mono font-bold text-base">API Access</h2>
        </div>
        <div className="space-y-3">
          <p className="font-mono text-xs text-muted-foreground">
            Use your assistant from any app or script by calling the API with your auth token.
          </p>
          <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Operator ID</span>
              <button
                onClick={() => { navigator.clipboard.writeText(operator.id); toast({ title: "Copied" }); }}
                className="font-mono text-xs text-primary hover:underline"
              >
                Copy
              </button>
            </div>
            <div className="font-mono text-sm bg-background/60 border border-border/30 rounded px-3 py-2 break-all select-all">
              {operator.id}
            </div>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Chat endpoint</span>
              <button
                onClick={() => { navigator.clipboard.writeText(`/api/operators/${operator.id}/conversations`); toast({ title: "Copied" }); }}
                className="font-mono text-xs text-primary hover:underline"
              >
                Copy
              </button>
            </div>
            <div className="font-mono text-sm bg-background/60 border border-border/30 rounded px-3 py-2 break-all select-all text-muted-foreground">
              POST /api/operators/{operator.id}/conversations
            </div>
          </div>
        </div>
      </section>

      {/* Growth settings */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-border/50 pb-3">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-mono font-bold text-base">How it grows</h2>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          Choose how much your assistant is allowed to learn and adapt over time.
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
                  {isActive && (
                    <div className="w-2 h-2 rounded-full bg-current" />
                  )}
                </div>
                <p className={`text-xs mt-1 ${isActive ? "opacity-80" : "text-muted-foreground"}`}>
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Danger Zone */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-destructive/30 pb-3">
          <AlertTriangle className="w-4 h-4 text-destructive/70" />
          <h2 className="font-mono font-bold text-base text-destructive/80">Danger Zone</h2>
        </div>

        <div className="space-y-3">
          {!isLocked && (
            <div className="flex items-start justify-between p-4 border border-border/40 rounded-lg bg-card/20">
              <div>
                <p className="font-mono text-sm font-bold">Lock identity forever</p>
                <p className="font-mono text-xs text-muted-foreground mt-0.5">
                  Permanently prevents anyone from changing this assistant's name or purpose. Cannot be undone.
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
                      <Lock className="w-5 h-5" /> Lock identity permanently?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="font-mono">
                      Name and purpose will become read-only forever. This cannot be undone.
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
                Permanently deletes this assistant along with all memory, knowledge, and chat history.
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
    </div>
  );
}
