import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Operator } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Lock, AlertTriangle, RefreshCw, SlidersHorizontal } from "lucide-react";
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

export default function IdentitySection({ operator }: { operator: Operator }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isLocked = !!operator.layer1LockedAt;

  const [coreData, setCoreData] = useState({
    name: operator.name,
    mandate: operator.mandate,
    coreValues: operator.coreValues.join(", "),
    ethicalBoundaries: operator.ethicalBoundaries.join(", "),
  });

  const [personalityData, setPersonalityData] = useState({
    personalityTraits: operator.soul.personalityTraits.join(", "),
    toneProfile: operator.soul.toneProfile,
    communicationStyle: operator.soul.communicationStyle,
    quirks: operator.soul.quirks.join(", "),
    emotionalRange: operator.soul.emotionalRange,
    decisionMakingStyle: operator.soul.decisionMakingStyle,
    conflictResolution: operator.soul.conflictResolution,
  });

  const updateCore = useMutation({
    mutationFn: (data: any) => apiFetch(`/operators/${operator.id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Saved" });
    },
  });

  const updatePersonality = useMutation({
    mutationFn: (data: any) => apiFetch(`/operators/${operator.id}/soul`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Saved" });
    },
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

  const handleCoreSubmit = () => {
    if (isLocked) return;
    updateCore.mutate({
      name: coreData.name,
      mandate: coreData.mandate,
      archetype: operator.archetype,
      coreValues: coreData.coreValues.split(",").map(s => s.trim()).filter(Boolean),
      ethicalBoundaries: coreData.ethicalBoundaries.split(",").map(s => s.trim()).filter(Boolean),
    });
  };

  const handlePersonalitySubmit = () => {
    updatePersonality.mutate({
      personalityTraits: personalityData.personalityTraits.split(",").map(s => s.trim()).filter(Boolean),
      toneProfile: personalityData.toneProfile,
      communicationStyle: personalityData.communicationStyle,
      quirks: personalityData.quirks.split(",").map(s => s.trim()).filter(Boolean),
      emotionalRange: personalityData.emotionalRange,
      decisionMakingStyle: personalityData.decisionMakingStyle,
      conflictResolution: personalityData.conflictResolution,
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-4">
        <div>
          <h2 className="text-2xl font-bold font-mono tracking-tight text-primary flex items-center gap-2">
            <SlidersHorizontal className="w-6 h-6" /> Instructions
          </h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">What this assistant is and how it behaves</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Identity panel */}
        <div className={`border rounded-lg p-6 space-y-4 transition-all ${isLocked ? "border-primary/20 bg-primary/5" : "border-border/50 bg-card/30"}`}>
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-base font-bold">Identity</h3>
            {isLocked ? (
              <div className="flex items-center gap-1.5 text-xs font-mono text-primary font-bold tracking-widest uppercase bg-primary/10 px-2 py-1 rounded">
                <Lock className="w-3 h-3" /> Locked
              </div>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="font-mono text-xs border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground">
                    <Lock className="w-3 h-3 mr-1.5" /> Lock forever
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
                    <AlertDialogAction onClick={() => lockCore.mutate()} className="font-mono font-bold">Lock forever</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
              <Input
                value={coreData.name}
                onChange={e => setCoreData({ ...coreData, name: e.target.value })}
                disabled={isLocked}
                className="font-mono bg-background/50 disabled:opacity-70 disabled:border-transparent"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Purpose</Label>
              <Textarea
                value={coreData.mandate}
                onChange={e => setCoreData({ ...coreData, mandate: e.target.value })}
                disabled={isLocked}
                className="font-mono h-24 bg-background/50 disabled:opacity-70 disabled:border-transparent"
                placeholder="What this assistant helps with..."
              />
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Core values (comma-separated)</Label>
              <Textarea
                value={coreData.coreValues}
                onChange={e => setCoreData({ ...coreData, coreValues: e.target.value })}
                disabled={isLocked}
                className="font-mono h-16 bg-background/50 disabled:opacity-70 disabled:border-transparent"
                placeholder="e.g. Honesty, Clarity, Reliability"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">What it won't do (comma-separated)</Label>
              <Textarea
                value={coreData.ethicalBoundaries}
                onChange={e => setCoreData({ ...coreData, ethicalBoundaries: e.target.value })}
                disabled={isLocked}
                className="font-mono h-16 bg-background/50 disabled:opacity-70 disabled:border-transparent"
                placeholder="e.g. Share private data, give medical advice"
              />
            </div>

            {!isLocked && (
              <Button onClick={handleCoreSubmit} disabled={updateCore.isPending} className="w-full font-mono mt-2">
                {updateCore.isPending ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
        </div>

        {/* Personality panel */}
        <div className="border rounded-lg p-6 space-y-4 border-border/50 bg-card/30">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-base font-bold">Personality</h3>
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
                    All personality changes will be reverted to the original. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="font-mono">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => resetPersonality.mutate()} className="bg-destructive text-destructive-foreground font-mono font-bold">Reset</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Traits (comma-separated)</Label>
              <Input
                value={personalityData.personalityTraits}
                onChange={e => setPersonalityData({ ...personalityData, personalityTraits: e.target.value })}
                className="font-mono bg-background/50"
                placeholder="e.g. Friendly, concise, patient"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Tone</Label>
                <Input
                  value={personalityData.toneProfile}
                  onChange={e => setPersonalityData({ ...personalityData, toneProfile: e.target.value })}
                  className="font-mono bg-background/50"
                  placeholder="e.g. Warm and professional"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Style</Label>
                <Input
                  value={personalityData.communicationStyle}
                  onChange={e => setPersonalityData({ ...personalityData, communicationStyle: e.target.value })}
                  className="font-mono bg-background/50"
                  placeholder="e.g. Direct, structured"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Emotional range</Label>
                <Input
                  value={personalityData.emotionalRange}
                  onChange={e => setPersonalityData({ ...personalityData, emotionalRange: e.target.value })}
                  className="font-mono bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Decision making</Label>
                <Input
                  value={personalityData.decisionMakingStyle}
                  onChange={e => setPersonalityData({ ...personalityData, decisionMakingStyle: e.target.value })}
                  className="font-mono bg-background/50"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Conflict handling</Label>
                <Input
                  value={personalityData.conflictResolution}
                  onChange={e => setPersonalityData({ ...personalityData, conflictResolution: e.target.value })}
                  className="font-mono bg-background/50"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Quirks (comma-separated)</Label>
                <Input
                  value={personalityData.quirks}
                  onChange={e => setPersonalityData({ ...personalityData, quirks: e.target.value })}
                  className="font-mono bg-background/50"
                  placeholder="e.g. Uses analogies, starts with a summary"
                />
              </div>
            </div>

            <Button onClick={handlePersonalitySubmit} disabled={updatePersonality.isPending} variant="secondary" className="w-full font-mono border border-secondary-foreground/20 mt-2">
              {updatePersonality.isPending ? "Saving..." : "Save personality"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
