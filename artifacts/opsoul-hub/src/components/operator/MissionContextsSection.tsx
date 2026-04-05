import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { MissionContext } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LayoutGrid, Plus, Trash2, Power, Play } from "lucide-react";
import { format } from "date-fns";

export default function MissionContextsSection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", description: "", toneOverride: "", kbFilterTag: "", growLockOverride: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", toneOverride: "", kbFilterTag: "", growLockOverride: "" });

  const { data: contexts, isLoading } = useQuery({
    queryKey: ["operators", operatorId, "mission-contexts"],
    queryFn: () => apiFetch<{ contexts: MissionContext[] }>(`/operators/${operatorId}/mission-contexts`).then(r => r.contexts ?? []),
  });

  const addContext = useMutation({
    mutationFn: (data: any) => apiFetch(`/operators/${operatorId}/mission-contexts`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "mission-contexts"] });
      setIsAddOpen(false);
      setAddForm({ name: "", description: "", toneOverride: "", kbFilterTag: "", growLockOverride: "" });
      toast({ title: "Mission context created" });
    }
  });

  const updateContext = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => apiFetch(`/operators/${operatorId}/mission-contexts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "mission-contexts"] });
      setEditId(null);
      toast({ title: "Mission context updated" });
    }
  });

  const deleteContext = useMutation({
    mutationFn: (id: string) => apiFetch(`/operators/${operatorId}/mission-contexts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "mission-contexts"] });
      toast({ title: "Mission context removed" });
    }
  });

  const activateContext = useMutation({
    mutationFn: (id: string) => apiFetch(`/operators/${operatorId}/mission-contexts/${id}/activate`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "mission-contexts"] });
      toast({ title: "Mission context activated" });
    }
  });

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 glass-panel rounded-2xl border border-border/30 p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-4">
        <div>
          <h2 className="headline-lg text-2xl font-bold text-primary flex items-center gap-2">
            <LayoutGrid className="w-6 h-6" /> Mission Contexts
          </h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">Operational modes and situational overrides</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono font-bold text-xs tracking-wider">
              <Plus className="w-4 h-4 mr-2" /> NEW CONTEXT
            </Button>
          </DialogTrigger>
          <DialogContent className="border-primary/20 bg-card/95 backdrop-blur">
            <DialogHeader>
              <DialogTitle className="font-mono text-xl">Create Mission Context</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); addContext.mutate(addForm); }} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Context Name</Label>
                <Input value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} required className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Description / Directives</Label>
                <Textarea value={addForm.description} onChange={e => setAddForm({...addForm, description: e.target.value})} required className="font-mono h-20" />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Tone Override (Optional)</Label>
                <Input value={addForm.toneOverride} onChange={e => setAddForm({...addForm, toneOverride: e.target.value})} className="font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">KB Filter Tag</Label>
                  <Input value={addForm.kbFilterTag} onChange={e => setAddForm({...addForm, kbFilterTag: e.target.value})} className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">GROW Lock Override</Label>
                  <Input value={addForm.growLockOverride} onChange={e => setAddForm({...addForm, growLockOverride: e.target.value})} className="font-mono" placeholder="e.g. LOCKED" />
                </div>
              </div>
              <Button type="submit" className="w-full font-mono font-bold mt-4" disabled={addContext.isPending}>
                INITIALIZE CONTEXT
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center p-8 font-mono text-primary animate-pulse">LOADING CONTEXTS...</div>
      ) : contexts?.length === 0 ? (
        <div className="text-center p-12 border border-dashed border-border/50 rounded-lg bg-card/20 text-muted-foreground font-mono text-sm">
          No mission contexts defined. Operator running on default baseline.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contexts?.map(ctx => (
            <Card key={ctx.id} className={`bg-card/30 flex flex-col relative overflow-hidden transition-all ${ctx.isActive ? 'border-primary/50 shadow-[0_0_15px_rgba(var(--primary),0.1)]' : 'border-border/50'}`}>
              {ctx.isActive && <div className="absolute top-0 left-0 w-1 bottom-0 bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]" />}
              <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-widest ${ctx.isActive ? 'text-primary border-primary/30 bg-primary/10' : 'text-muted-foreground border-border/50 bg-background/50'}`}>
                      {ctx.isActive ? 'ACTIVE' : 'STANDBY'}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    {!ctx.isActive && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-primary hover:bg-primary/20" onClick={() => activateContext.mutate(ctx.id)} title="Activate">
                        <Power className="w-3 h-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteContext.mutate(ctx.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="font-mono text-lg mt-2">{ctx.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2 flex-1">
                <p className="text-sm font-mono text-muted-foreground mb-4">{ctx.description}</p>
                <div className="grid grid-cols-2 gap-2">
                  {ctx.toneOverride && (
                    <div className="bg-background/50 p-2 rounded border border-border/30">
                      <div className="text-[9px] font-mono text-muted-foreground uppercase mb-1">Tone Override</div>
                      <div className="text-xs font-mono text-foreground truncate">{ctx.toneOverride}</div>
                    </div>
                  )}
                  {ctx.kbFilterTag && (
                    <div className="bg-background/50 p-2 rounded border border-border/30">
                      <div className="text-[9px] font-mono text-muted-foreground uppercase mb-1">KB Filter</div>
                      <div className="text-xs font-mono text-foreground truncate">{ctx.kbFilterTag}</div>
                    </div>
                  )}
                  {ctx.growLockOverride && (
                    <div className="bg-background/50 p-2 rounded border border-border/30 col-span-2">
                      <div className="text-[9px] font-mono text-muted-foreground uppercase mb-1">GROW Lock Override</div>
                      <div className="text-xs font-mono text-amber-500 truncate">{ctx.growLockOverride}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}