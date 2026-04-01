import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Unlock, AlertTriangle, RefreshCw, Settings } from "lucide-react";
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

export default function SettingsSection({ operator }: { operator: Operator }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const isLocked = !!operator.layer1LockedAt;
  const isFrozen = operator.growLockLevel === "FROZEN";

  const [name, setName] = useState(operator.name);
  const [purpose, setPurpose] = useState(operator.mandate);
  const [personality, setPersonality] = useState(operator.soul.personalityTraits.join(", "));
  const [evolutionMode, setEvolutionMode] = useState(operator.growLockLevel);

  const updateBasics = useMutation({
    mutationFn: (data: any) => apiFetch(`/operators/${operator.id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      queryClient.invalidateQueries({ queryKey: ["operators"] });
      toast({ title: "Settings saved" });
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const updatePersonality = useMutation({
    mutationFn: (data: any) => apiFetch(`/operators/${operator.id}/soul`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Personality saved" });
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const lockIdentity = useMutation({
    mutationFn: () => apiFetch(`/operators/${operator.id}/lock-layer1`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Identity locked permanently" });
    },
  });

  const resetPersonality = useMutation({
    mutationFn: () => apiFetch(`/operators/${operator.id}/soul/reset`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Personality reset to original" });
    },
  });

  const updateEvolutionMode = useMutation({
    mutationFn: (level: string) => apiFetch(`/operators/${operator.id}/grow-lock`, {
      method: "PATCH",
      body: JSON.stringify({ lockLevel: level }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Auto-evolution updated" });
    },
  });

  const deleteAgent = useMutation({
    mutationFn: () => apiFetch(`/operators/${operator.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators"] });
      toast({ title: "Agent deleted" });
      setLocation("/");
    },
  });

  const handleSaveBasics = () => {
    if (isLocked) return;
    updateBasics.mutate({
      name,
      mandate: purpose,
    });
  };

  const handleSavePersonality = () => {
    if (isFrozen) return;
    const traits = personality.split(",").map(s => s.trim()).filter(Boolean);
    updatePersonality.mutate({ personalityTraits: traits });
  };

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300 max-w-2xl">
      <div className="border-b border-border/50 pb-4">
        <h2 className="text-2xl font-bold font-mono tracking-tight text-primary flex items-center gap-2">
          <Settings className="w-6 h-6" /> Settings
        </h2>
        <p className="text-muted-foreground font-mono text-sm mt-1">Configure your agent</p>
      </div>

      {/* Basic info */}
      <div className="space-y-5">
        <h3 className="font-mono text-sm font-bold text-muted-foreground uppercase tracking-wider">Basic info</h3>

        <div className="space-y-2">
          <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={isLocked}
            className="font-mono bg-background/50 disabled:opacity-60 disabled:border-transparent max-w-sm"
          />
          {isLocked && (
            <p className="text-xs font-mono text-primary/60 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Identity is locked and cannot be edited
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Purpose</Label>
          <Textarea
            value={purpose}
            onChange={e => setPurpose(e.target.value)}
            disabled={isLocked}
            className="font-mono bg-background/50 disabled:opacity-60 disabled:border-transparent h-28"
          />
        </div>

        {!isLocked && (
          <Button onClick={handleSaveBasics} disabled={updateBasics.isPending} className="font-mono text-sm">
            {updateBasics.isPending ? "Saving..." : "Save changes"}
          </Button>
        )}
      </div>

      {/* Personality */}
      <div className="space-y-5 pt-6 border-t border-border/30">
        <h3 className="font-mono text-sm font-bold text-muted-foreground uppercase tracking-wider">Personality</h3>

        <div className="space-y-2">
          <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Traits (comma-separated)</Label>
          <Textarea
            value={personality}
            onChange={e => setPersonality(e.target.value)}
            disabled={isFrozen}
            className="font-mono bg-background/50 disabled:opacity-60 disabled:border-transparent h-20"
            placeholder="curious, empathetic, direct..."
          />
          {isFrozen && (
            <p className="text-xs font-mono text-muted-foreground">Frozen — personality cannot be changed</p>
          )}
        </div>

        {!isFrozen && (
          <Button onClick={handleSavePersonality} disabled={updatePersonality.isPending} variant="secondary" className="font-mono text-sm">
            {updatePersonality.isPending ? "Saving..." : "Save personality"}
          </Button>
        )}
      </div>

      {/* Auto-evolution */}
      <div className="space-y-5 pt-6 border-t border-border/30">
        <h3 className="font-mono text-sm font-bold text-muted-foreground uppercase tracking-wider">Auto-evolution</h3>
        <p className="text-xs font-mono text-muted-foreground leading-relaxed">
          Control how your agent learns and adapts over time based on conversations and feedback.
        </p>

        <Select
          value={evolutionMode}
          onValueChange={(val) => {
            setEvolutionMode(val as any);
            updateEvolutionMode.mutate(val);
          }}
        >
          <SelectTrigger className="w-full max-w-sm font-mono text-sm border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OPEN" className="font-mono text-sm">
              <span className="text-green-500 font-bold">Open</span> — evolves automatically
            </SelectItem>
            <SelectItem value="CONTROLLED" className="font-mono text-sm">
              <span className="text-amber-500 font-bold">Controlled</span> — needs your approval
            </SelectItem>
            <SelectItem value="LOCKED" className="font-mono text-sm">
              <span className="text-red-500 font-bold">Locked</span> — no AI-driven changes
            </SelectItem>
            <SelectItem value="FROZEN" className="font-mono text-sm">
              <span className="text-muted-foreground font-bold">Frozen</span> — no changes at all
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Danger zone */}
      <div className="space-y-4 pt-6 border-t border-destructive/20">
        <h3 className="font-mono text-sm font-bold text-destructive/70 uppercase tracking-wider">Danger zone</h3>

        <div className="flex flex-col sm:flex-row gap-3">
          {!isLocked && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="font-mono text-xs border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground">
                  <Lock className="w-3 h-3 mr-2" /> Lock identity forever
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="border-primary/20">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-mono text-primary flex items-center gap-2">
                    <Lock className="w-5 h-5" /> Lock identity permanently?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="font-mono">
                    Name and purpose will become permanently read-only. This cannot be undone.
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
          )}

          {!isFrozen && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="font-mono text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10">
                  <RefreshCw className="w-3 h-3 mr-2" /> Reset personality
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="border-amber-500/20">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-mono text-amber-500 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" /> Reset personality?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="font-mono">
                    This reverts all learned personality changes back to the original. Cannot be undone.
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
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="font-mono text-xs border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground">
                Delete this agent
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-destructive/20">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-mono text-destructive">Delete {operator.name}?</AlertDialogTitle>
                <AlertDialogDescription className="font-mono">
                  This permanently deletes {operator.name} including all memory, knowledge, and chat history. Cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="font-mono">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteAgent.mutate()} className="bg-destructive text-destructive-foreground font-mono font-bold">
                  Delete forever
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
