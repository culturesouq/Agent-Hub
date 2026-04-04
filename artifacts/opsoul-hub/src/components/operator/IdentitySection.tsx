import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Operator } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Lock, AlertTriangle, RefreshCw, User, Smile } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  operator: Operator;
  panel?: "identity" | "personality";
}

export default function IdentitySection({ operator, panel }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isLocked = !!operator.layer1LockedAt;

  const [identityDesc, setIdentityDesc] = useState(
    operator.rawIdentity ?? operator.mandate ?? operator.name
  );

  const [soulDesc, setSoulDesc] = useState(
    operator.soul?.backstory ?? operator.soul?.communicationStyle ?? ""
  );

  const [needsName, setNeedsName] = useState(false);
  const [confirmedName, setConfirmedName] = useState("");

  const updateIdentity = useMutation({
    mutationFn: ({ description, confirmedName }: { description: string; confirmedName?: string }) =>
      apiFetch(`/operators/${operator.id}/identity-from-description`, {
        method: "PATCH",
        body: JSON.stringify({ description, ...(confirmedName ? { confirmedName } : {}) }),
      }),
    onSuccess: (data: any) => {
      if (data?.needsName) {
        setNeedsName(true);
        return;
      }
      setNeedsName(false);
      setConfirmedName("");
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Saved" });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const saveSoul = useMutation({
    mutationFn: async (text: string) => {
      await apiFetch(`/operators/${operator.id}/soul`, {
        method: "PATCH",
        body: JSON.stringify({ backstory: text }),
      });
      return apiFetch(`/operators/${operator.id}/soul/from-description`, {
        method: "PATCH",
        body: JSON.stringify({ description: text }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Saved" });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const resetPersonality = useMutation({
    mutationFn: () => apiFetch(`/operators/${operator.id}/soul/reset`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Personality reset to original" });
    },
  });

  const lockCore = useMutation({
    mutationFn: () => apiFetch(`/operators/${operator.id}/lock-layer1`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Identity locked" });
    },
  });

  const showIdentity = !panel || panel === "identity";
  const showPersonality = !panel || panel === "personality";

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300 glass-panel rounded-2xl border border-border/30 p-6">
      {showIdentity && (
        <div className={`border rounded-lg p-6 space-y-4 transition-all ${isLocked ? "border-primary/20 bg-primary/5" : "border-border/50 bg-card/30"}`}>
          <div className="flex items-center justify-between">
            <h3 className="font-headline text-base font-bold flex items-center gap-2">
              <User className="w-4 h-4" /> Identity
            </h3>
            {isLocked ? (
              <div className="flex items-center gap-1.5 text-xs font-mono text-primary font-bold tracking-widest uppercase bg-primary/10 px-2 py-1 rounded">
                <Lock className="w-3 h-3" /> Self-modification locked
              </div>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="font-mono text-xs border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground">
                    <Lock className="w-3 h-3 mr-1.5" /> Prevent operator from self-modifying
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-primary/20">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-mono text-primary flex items-center gap-2">
                      <Lock className="w-5 h-5" /> Prevent operator from self-modifying?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="font-mono">
                      Your operator will not be able to change its own identity. You as the owner can always edit it here.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="font-mono">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => lockCore.mutate()} className="font-mono font-bold">
                      Lock it
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Who is this operator?
            </Label>
            <Textarea
              value={identityDesc}
              onChange={e => setIdentityDesc(e.target.value)}
              className="font-mono h-36 bg-background/50 resize-none"
              placeholder="Describe your operator in your own words — their name, what they do, how they think."
            />
          </div>

          {needsName && (
            <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4 space-y-3">
              <p className="font-mono text-sm text-amber-400">
                What should we call your operator?
              </p>
              <Input
                value={confirmedName}
                onChange={e => setConfirmedName(e.target.value)}
                className="font-mono bg-background/50"
                placeholder="e.g. Nahil"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => updateIdentity.mutate({ description: identityDesc, confirmedName })}
                  disabled={!confirmedName.trim() || updateIdentity.isPending}
                  className="font-mono"
                  size="sm"
                >
                  {updateIdentity.isPending ? "Saving..." : "Confirm"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-mono text-muted-foreground"
                  onClick={() => { setNeedsName(false); setConfirmedName(""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {!needsName && (
            <Button
              onClick={() => updateIdentity.mutate({ description: identityDesc })}
              disabled={updateIdentity.isPending}
              className="w-full font-mono"
            >
              {updateIdentity.isPending ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      )}

      {showPersonality && (
        <div className="border rounded-lg p-6 space-y-4 border-border/50 bg-card/30">
          <div className="flex items-center justify-between">
            <h3 className="font-headline text-base font-bold flex items-center gap-2">
              <Smile className="w-4 h-4" /> Who is your operator?
            </h3>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="font-mono text-xs text-muted-foreground hover:text-destructive">
                  <RefreshCw className="w-3 h-3 mr-1.5" /> Reset
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="border-destructive/20">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-mono text-destructive flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" /> Reset personality?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="font-mono">
                    All personality changes will revert to the original. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="font-mono">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => resetPersonality.mutate()}
                    className="bg-destructive text-destructive-foreground font-mono font-bold"
                  >
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <p className="font-mono text-xs text-muted-foreground leading-relaxed">
            Describe your operator in your own words. Who they are, how they speak, what they care about. This is yours — it won't change unless you change it.
          </p>

          <Textarea
            value={soulDesc}
            onChange={e => setSoulDesc(e.target.value)}
            className="font-mono min-h-48 bg-background/50"
            placeholder="Write freely — personality, voice, values, backstory. No length limit."
          />

          <Button
            onClick={() => saveSoul.mutate(soulDesc)}
            disabled={saveSoul.isPending}
            className="w-full font-mono"
          >
            {saveSoul.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
