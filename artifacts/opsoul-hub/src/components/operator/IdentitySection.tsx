import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Operator } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Unlock, AlertTriangle, RefreshCw } from "lucide-react";
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
  const isL1Locked = !!operator.layer1LockedAt;
  const isFrozen = operator.growLockLevel === "FROZEN";

  const [l1Data, setL1Data] = useState({
    name: operator.name,
    archetype: operator.archetype,
    mandate: operator.mandate,
    coreValues: operator.coreValues.join(", "),
    ethicalBoundaries: operator.ethicalBoundaries.join(", ")
  });

  const [l2Data, setL2Data] = useState({
    personalityTraits: operator.soul.personalityTraits.join(", "),
    toneProfile: operator.soul.toneProfile,
    communicationStyle: operator.soul.communicationStyle,
    quirks: operator.soul.quirks.join(", "),
    valuesManifestation: operator.soul.valuesManifestation.join(", "),
    emotionalRange: operator.soul.emotionalRange,
    decisionMakingStyle: operator.soul.decisionMakingStyle,
    conflictResolution: operator.soul.conflictResolution
  });

  const [lockLevel, setLockLevel] = useState(operator.growLockLevel);

  const updateL1 = useMutation({
    mutationFn: (data: any) => apiFetch(`/operators/${operator.id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Identity updated", description: "Changes saved." });
    },
  });

  const lockL1 = useMutation({
    mutationFn: () => apiFetch(`/operators/${operator.id}/lock-layer1`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Identity locked", description: "The core identity is now locked permanently." });
    },
  });

  const updateL2 = useMutation({
    mutationFn: (data: any) => apiFetch(`/operators/${operator.id}/soul`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Personality updated", description: "Changes saved." });
    },
  });

  const resetSoul = useMutation({
    mutationFn: () => apiFetch(`/operators/${operator.id}/soul/reset`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Personality reset", description: "Reverted to original." });
    },
  });

  const updateGrowLock = useMutation({
    mutationFn: (level: string) => apiFetch(`/operators/${operator.id}/grow-lock`, { 
      method: "PATCH", 
      body: JSON.stringify({ lockLevel: level }) 
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operator.id] });
      toast({ title: "Evolution mode updated" });
    },
  });

  const handleL1Submit = () => {
    if (isL1Locked) return;
    updateL1.mutate({
      name: l1Data.name,
      archetype: l1Data.archetype,
      mandate: l1Data.mandate,
      coreValues: l1Data.coreValues.split(",").map(s=>s.trim()).filter(Boolean),
      ethicalBoundaries: l1Data.ethicalBoundaries.split(",").map(s=>s.trim()).filter(Boolean),
    });
  };

  const handleL2Submit = () => {
    if (isFrozen) return;
    updateL2.mutate({
      personalityTraits: l2Data.personalityTraits.split(",").map(s=>s.trim()).filter(Boolean),
      toneProfile: l2Data.toneProfile,
      communicationStyle: l2Data.communicationStyle,
      quirks: l2Data.quirks.split(",").map(s=>s.trim()).filter(Boolean),
      valuesManifestation: l2Data.valuesManifestation.split(",").map(s=>s.trim()).filter(Boolean),
      emotionalRange: l2Data.emotionalRange,
      decisionMakingStyle: l2Data.decisionMakingStyle,
      conflictResolution: l2Data.conflictResolution
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-4">
        <div>
          <h2 className="text-2xl font-bold font-mono tracking-tight text-primary">Identity & Personality</h2>
          <p className="text-muted-foreground font-mono text-sm">Edit core identity and personality traits</p>
        </div>
        <div className="flex items-center gap-3 border border-border/50 p-2 rounded-md bg-card/30">
          <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Evolution mode</Label>
          <Select 
            value={lockLevel} 
            onValueChange={(val) => { setLockLevel(val as any); updateGrowLock.mutate(val); }}
          >
            <SelectTrigger className="w-52 font-mono h-8 text-xs border-primary/20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN" className="font-mono text-xs text-green-500">Open — evolves automatically</SelectItem>
              <SelectItem value="CONTROLLED" className="font-mono text-xs text-amber-500">Controlled — needs your approval</SelectItem>
              <SelectItem value="LOCKED" className="font-mono text-xs text-red-500">Locked — no AI changes</SelectItem>
              <SelectItem value="FROZEN" className="font-mono text-xs text-muted-foreground">Frozen — no changes at all</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Core Identity Panel */}
        <div className={`border rounded-lg p-6 relative overflow-hidden transition-all ${isL1Locked ? 'border-primary/20 bg-primary/5' : 'border-border/50 bg-card/30'}`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-mono text-lg font-bold flex items-center gap-2">
              <span className="text-primary">L1</span> Core Identity
            </h3>
            {isL1Locked ? (
              <div className="flex items-center gap-1.5 text-xs font-mono text-primary font-bold tracking-widest uppercase bg-primary/10 px-2 py-1 rounded">
                <Lock className="w-3 h-3" /> Locked forever
              </div>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="font-mono text-xs border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground">
                    <Unlock className="w-3 h-3 mr-2" /> Lock identity
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-primary/20">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-mono text-primary flex items-center gap-2">
                      <Lock className="w-5 h-5" /> Lock core identity permanently?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="font-mono">
                      Locking the core identity will make Name, Archetype, Purpose, Core Values, and Ethical Limits permanently read-only. This action CANNOT BE REVERSED.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="font-mono">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => lockL1.mutate()} className="font-mono font-bold">Lock forever</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
              <Input 
                value={l1Data.name} 
                onChange={e => setL1Data({...l1Data, name: e.target.value})} 
                disabled={isL1Locked}
                className="font-mono bg-background/50 disabled:opacity-70 disabled:border-transparent" 
              />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Archetype</Label>
              <Input 
                value={l1Data.archetype} 
                onChange={e => setL1Data({...l1Data, archetype: e.target.value})} 
                disabled={isL1Locked}
                className="font-mono bg-background/50 disabled:opacity-70 disabled:border-transparent" 
              />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Purpose</Label>
              <Textarea 
                value={l1Data.mandate} 
                onChange={e => setL1Data({...l1Data, mandate: e.target.value})} 
                disabled={isL1Locked}
                className="font-mono h-24 bg-background/50 disabled:opacity-70 disabled:border-transparent" 
              />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Core values (comma-separated)</Label>
              <Textarea 
                value={l1Data.coreValues} 
                onChange={e => setL1Data({...l1Data, coreValues: e.target.value})} 
                disabled={isL1Locked}
                className="font-mono h-20 bg-background/50 disabled:opacity-70 disabled:border-transparent" 
              />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Ethical limits (comma-separated)</Label>
              <Textarea 
                value={l1Data.ethicalBoundaries} 
                onChange={e => setL1Data({...l1Data, ethicalBoundaries: e.target.value})} 
                disabled={isL1Locked}
                className="font-mono h-20 bg-background/50 disabled:opacity-70 disabled:border-transparent" 
              />
            </div>
            
            {!isL1Locked && (
              <Button onClick={handleL1Submit} disabled={updateL1.isPending} className="w-full font-mono mt-4">
                {updateL1.isPending ? "Saving..." : "Save changes"}
              </Button>
            )}
          </div>
        </div>

        {/* Personality Panel */}
        <div className={`border rounded-lg p-6 relative overflow-hidden transition-all ${isFrozen ? 'border-border/20 bg-muted/5' : 'border-border/50 bg-card/30'}`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-mono text-lg font-bold flex items-center gap-2">
              <span className="text-secondary-foreground">L2</span> Personality
            </h3>
            {isFrozen ? (
              <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground font-bold tracking-widest uppercase bg-muted/10 px-2 py-1 rounded">
                <Lock className="w-3 h-3" /> Frozen
              </div>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="font-mono text-xs text-muted-foreground hover:text-destructive">
                    <RefreshCw className="w-3 h-3 mr-2" /> Reset to original
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-destructive/20">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-mono text-destructive flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" /> Reset personality?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="font-mono">
                      This will reset all learned personality traits, quirks, and communication styles back to the starting point. This reverts all learned personality changes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="font-mono">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => resetSoul.mutate()} className="bg-destructive text-destructive-foreground font-mono font-bold">Reset</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Personality traits (comma-separated)</Label>
                <Input 
                  value={l2Data.personalityTraits} 
                  onChange={e => setL2Data({...l2Data, personalityTraits: e.target.value})} 
                  disabled={isFrozen}
                  className="font-mono bg-background/50" 
                />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Tone</Label>
                <Input 
                  value={l2Data.toneProfile} 
                  onChange={e => setL2Data({...l2Data, toneProfile: e.target.value})} 
                  disabled={isFrozen}
                  className="font-mono bg-background/50" 
                />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Communication style</Label>
                <Input 
                  value={l2Data.communicationStyle} 
                  onChange={e => setL2Data({...l2Data, communicationStyle: e.target.value})} 
                  disabled={isFrozen}
                  className="font-mono bg-background/50" 
                />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Emotional range</Label>
                <Input 
                  value={l2Data.emotionalRange} 
                  onChange={e => setL2Data({...l2Data, emotionalRange: e.target.value})} 
                  disabled={isFrozen}
                  className="font-mono bg-background/50" 
                />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Decision-making style</Label>
                <Input 
                  value={l2Data.decisionMakingStyle} 
                  onChange={e => setL2Data({...l2Data, decisionMakingStyle: e.target.value})} 
                  disabled={isFrozen}
                  className="font-mono bg-background/50" 
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Conflict resolution</Label>
                <Input 
                  value={l2Data.conflictResolution} 
                  onChange={e => setL2Data({...l2Data, conflictResolution: e.target.value})} 
                  disabled={isFrozen}
                  className="font-mono bg-background/50" 
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Quirks (comma-separated)</Label>
                <Input 
                  value={l2Data.quirks} 
                  onChange={e => setL2Data({...l2Data, quirks: e.target.value})} 
                  disabled={isFrozen}
                  className="font-mono bg-background/50" 
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Values in action (comma-separated)</Label>
                <Textarea 
                  value={l2Data.valuesManifestation} 
                  onChange={e => setL2Data({...l2Data, valuesManifestation: e.target.value})} 
                  disabled={isFrozen}
                  className="font-mono h-16 bg-background/50" 
                />
              </div>
            </div>
            
            {!isFrozen && (
              <Button onClick={handleL2Submit} disabled={updateL2.isPending} variant="secondary" className="w-full font-mono mt-4 border border-secondary-foreground/20">
                {updateL2.isPending ? "Saving..." : "Save personality"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
