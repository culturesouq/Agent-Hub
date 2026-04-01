import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator, HealthScore } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { LogOut, Plus, Trash2, Activity, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function HealthBadge({ operatorId }: { operatorId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["operators", operatorId, "self-awareness"],
    queryFn: () => apiFetch<{ healthScore: HealthScore }>(`/operators/${operatorId}/grow/self-awareness`),
    staleTime: 60000, // 1 min
  });

  if (isLoading) return <Badge variant="outline" className="animate-pulse">...</Badge>;
  if (!data?.healthScore) return null;

  const { score, label } = data.healthScore;
  const colorClass = score >= 80 ? "text-green-500 border-green-500/20 bg-green-500/10" : 
                     score >= 50 ? "text-amber-500 border-amber-500/20 bg-amber-500/10" : 
                     "text-red-500 border-red-500/20 bg-red-500/10";

  return (
    <Badge variant="outline" className={`${colorClass} font-mono uppercase tracking-wider text-xs px-2 py-0.5`} data-testid={`badge-health-${operatorId}`}>
      {score}% - {label}
    </Badge>
  );
}

export default function Dashboard() {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "", archetype: "", mandate: "", coreValues: "", ethicalBoundaries: "",
    personalityTraits: "", toneProfile: "", communicationStyle: "", quirks: "", 
    valuesManifestation: "", emotionalRange: "", decisionMakingStyle: "", conflictResolution: ""
  });

  const { data: operators, isLoading } = useQuery({
    queryKey: ["operators"],
    queryFn: () => apiFetch<Operator[]>("/operators"),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiFetch<Operator>("/operators", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: (newOp) => {
      queryClient.invalidateQueries({ queryKey: ["operators"] });
      setIsCreateOpen(false);
      toast({ title: "Agent created", description: `${newOp.name} is ready.` });
      setLocation(`/operators/${newOp.id}`);
    },
    onError: (err: Error) => toast({ title: "Failed to create agent", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/operators/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators"] });
      toast({ title: "Agent deleted" });
    },
    onError: (err: Error) => toast({ title: "Failed to delete agent", description: err.message, variant: "destructive" }),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formData.name,
      archetype: formData.archetype,
      mandate: formData.mandate,
      coreValues: formData.coreValues.split(",").map(s => s.trim()).filter(Boolean),
      ethicalBoundaries: formData.ethicalBoundaries.split(",").map(s => s.trim()).filter(Boolean),
      soul: {
        personalityTraits: formData.personalityTraits.split(",").map(s => s.trim()).filter(Boolean),
        toneProfile: formData.toneProfile,
        communicationStyle: formData.communicationStyle,
        quirks: formData.quirks.split(",").map(s => s.trim()).filter(Boolean),
        valuesManifestation: formData.valuesManifestation.split(",").map(s => s.trim()).filter(Boolean),
        emotionalRange: formData.emotionalRange,
        decisionMakingStyle: formData.decisionMakingStyle,
        conflictResolution: formData.conflictResolution
      }
    };
    createMutation.mutate(payload);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-primary" />
            <span className="font-mono text-xl font-bold tracking-tight text-primary">OpSoul Hub</span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="font-mono text-muted-foreground hover:text-foreground" data-testid="button-logout">
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold font-mono tracking-tight">My Agents</h1>
            <p className="text-muted-foreground mt-1 font-mono text-sm">Your AI agents</p>
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="font-mono font-bold tracking-wider" data-testid="button-create-operator">
                <Plus className="w-4 h-4 mr-2" /> New Agent
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto border-primary/20 bg-background/95 backdrop-blur">
              <DialogHeader>
                <DialogTitle className="font-mono text-2xl">Create a New Agent</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-6 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Identity */}
                  <div className="space-y-4">
                    <h3 className="font-mono font-bold text-primary border-b border-border/50 pb-2">Identity</h3>
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required className="font-mono text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label>Archetype</Label>
                      <Input value={formData.archetype} onChange={e => setFormData({...formData, archetype: e.target.value})} required className="font-mono text-sm" placeholder="e.g. Wise Counselor" />
                    </div>
                    <div className="space-y-2">
                      <Label>Purpose</Label>
                      <Textarea value={formData.mandate} onChange={e => setFormData({...formData, mandate: e.target.value})} required className="font-mono text-sm h-24" />
                    </div>
                    <div className="space-y-2">
                      <Label>Core values (comma-separated)</Label>
                      <Input value={formData.coreValues} onChange={e => setFormData({...formData, coreValues: e.target.value})} required className="font-mono text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label>Ethical limits (comma-separated)</Label>
                      <Input value={formData.ethicalBoundaries} onChange={e => setFormData({...formData, ethicalBoundaries: e.target.value})} required className="font-mono text-sm" />
                    </div>
                  </div>
                  
                  {/* Personality */}
                  <div className="space-y-4">
                    <h3 className="font-mono font-bold text-primary border-b border-border/50 pb-2">Personality</h3>
                    <div className="space-y-2">
                      <Label>Personality traits (comma-separated)</Label>
                      <Input value={formData.personalityTraits} onChange={e => setFormData({...formData, personalityTraits: e.target.value})} required className="font-mono text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label>Tone</Label>
                      <Input value={formData.toneProfile} onChange={e => setFormData({...formData, toneProfile: e.target.value})} required className="font-mono text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label>Communication style</Label>
                      <Input value={formData.communicationStyle} onChange={e => setFormData({...formData, communicationStyle: e.target.value})} required className="font-mono text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label>Emotional range</Label>
                      <Input value={formData.emotionalRange} onChange={e => setFormData({...formData, emotionalRange: e.target.value})} required className="font-mono text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label>Decision-making style</Label>
                      <Input value={formData.decisionMakingStyle} onChange={e => setFormData({...formData, decisionMakingStyle: e.target.value})} required className="font-mono text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label>Conflict resolution</Label>
                      <Input value={formData.conflictResolution} onChange={e => setFormData({...formData, conflictResolution: e.target.value})} required className="font-mono text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label>Quirks (comma-separated)</Label>
                      <Input value={formData.quirks} onChange={e => setFormData({...formData, quirks: e.target.value})} required className="font-mono text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label>Values in action (comma-separated)</Label>
                      <Input value={formData.valuesManifestation} onChange={e => setFormData({...formData, valuesManifestation: e.target.value})} required className="font-mono text-sm" />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-4 border-t border-border/50">
                  <Button type="submit" disabled={createMutation.isPending} className="font-mono font-bold tracking-wider w-full md:w-auto">
                    {createMutation.isPending ? "Creating..." : "Create Agent"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Card key={i} className="h-64 animate-pulse bg-muted/20 border-border/20" />
            ))}
          </div>
        ) : operators?.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border/50 rounded-lg bg-card/20">
            <Cpu className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="font-mono text-xl font-bold mb-2">No agents yet</h3>
            <p className="text-muted-foreground font-mono text-sm mb-6 max-w-md mx-auto">
              Create your first AI agent to get started.
            </p>
            <Button onClick={() => setIsCreateOpen(true)} variant="outline" className="font-mono border-primary/30 text-primary hover:bg-primary/10">
              <Plus className="w-4 h-4 mr-2" /> Create Agent
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {operators?.map((operator) => (
              <Card key={operator.id} className="group relative overflow-hidden bg-card border-border/50 hover:border-primary/50 transition-all duration-300 flex flex-col cursor-pointer" onClick={() => setLocation(`/operators/${operator.id}`)} data-testid={`card-operator-${operator.id}`}>
                <div className="absolute top-0 right-0 p-4 z-10 flex gap-2">
                  <HealthBadge operatorId={operator.id} />
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all" onClick={(e) => e.stopPropagation()} data-testid={`button-delete-${operator.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()} className="border-destructive/20">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-mono text-destructive">Delete this agent?</AlertDialogTitle>
                        <AlertDialogDescription className="font-mono">
                          This will permanently delete <span className="font-bold text-foreground">{operator.name}</span>, including all memory, knowledge, and identity data. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="font-mono">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(operator.id); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono font-bold tracking-wider">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                
                <CardHeader className="pb-4">
                  <CardTitle className="font-mono text-2xl pr-16 truncate">{operator.name}</CardTitle>
                  <CardDescription className="font-mono text-xs uppercase tracking-wider text-primary/80">
                    {operator.archetype}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground line-clamp-3 font-mono leading-relaxed opacity-80">
                    {operator.mandate}
                  </p>
                </CardContent>
                <CardFooter className="pt-4 border-t border-border/20 flex items-center justify-between text-xs text-muted-foreground font-mono">
                  <span>ID: {operator.id.substring(0, 8)}</span>
                  <span className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${operator.layer1LockedAt ? 'bg-primary' : 'bg-amber-500 animate-pulse'}`} />
                    {operator.layer1LockedAt ? 'Locked' : 'Unlocked'}
                  </span>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
