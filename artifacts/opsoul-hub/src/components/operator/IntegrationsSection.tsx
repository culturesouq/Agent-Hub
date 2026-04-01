import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Integration } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Network, Plus, Trash2, Key, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";

export default function IntegrationsSection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ integrationType: "", integrationLabel: "", token: "", scopes: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ integrationLabel: "", scopes: "" });

  const { data: integrations, isLoading } = useQuery({
    queryKey: ["operators", operatorId, "integrations"],
    queryFn: () => apiFetch<Integration[]>(`/operators/${operatorId}/integrations`),
  });

  const addIntegration = useMutation({
    mutationFn: (data: any) => apiFetch(`/operators/${operatorId}/integrations`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      setIsAddOpen(false);
      setAddForm({ integrationType: "", integrationLabel: "", token: "", scopes: "" });
      toast({ title: "Integration added" });
    }
  });

  const updateIntegration = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => apiFetch(`/operators/${operatorId}/integrations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      setEditId(null);
      toast({ title: "Integration updated" });
    }
  });

  const deleteIntegration = useMutation({
    mutationFn: (id: string) => apiFetch(`/operators/${operatorId}/integrations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "Integration removed" });
    }
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addIntegration.mutate({
      ...addForm,
      scopes: addForm.scopes.split(",").map(s => s.trim()).filter(Boolean)
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    updateIntegration.mutate({
      id: editId,
      data: {
        integrationLabel: editForm.integrationLabel,
        scopes: editForm.scopes.split(",").map(s => s.trim()).filter(Boolean)
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-4">
        <div>
          <h2 className="text-2xl font-bold font-mono tracking-tight text-primary flex items-center gap-2">
            <Network className="w-6 h-6" /> External Integrations
          </h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">API connections and third-party access</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono font-bold text-xs tracking-wider">
              <Plus className="w-4 h-4 mr-2" /> ADD CONNECTION
            </Button>
          </DialogTrigger>
          <DialogContent className="border-primary/20 bg-card/95 backdrop-blur">
            <DialogHeader>
              <DialogTitle className="font-mono text-xl">New API Connection</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">Type (e.g. github)</Label>
                  <Input value={addForm.integrationType} onChange={e => setAddForm({...addForm, integrationType: e.target.value})} required className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">Label</Label>
                  <Input value={addForm.integrationLabel} onChange={e => setAddForm({...addForm, integrationLabel: e.target.value})} required className="font-mono" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Access Token / Key</Label>
                <Input value={addForm.token} onChange={e => setAddForm({...addForm, token: e.target.value})} type="password" placeholder="Leave blank if OAuth" className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Scopes (comma separated)</Label>
                <Input value={addForm.scopes} onChange={e => setAddForm({...addForm, scopes: e.target.value})} className="font-mono" placeholder="read:user, repo" />
              </div>
              <Button type="submit" className="w-full font-mono font-bold mt-4" disabled={addIntegration.isPending}>
                INITIALIZE CONNECTION
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center p-8 font-mono text-primary animate-pulse">CHECKING CONNECTIONS...</div>
      ) : integrations?.length === 0 ? (
        <div className="text-center p-12 border border-dashed border-border/50 rounded-lg bg-card/20 text-muted-foreground font-mono text-sm">
          No external integrations configured.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations?.map(int => (
            <Card key={int.id} className="bg-card/30 border-border/50 flex flex-col">
              <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start">
                  <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-widest ${int.status === 'active' ? 'text-green-500 border-green-500/30 bg-green-500/10' : 'text-amber-500 border-amber-500/30 bg-amber-500/10'}`}>
                    {int.status}
                  </Badge>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => {
                      setEditForm({ integrationLabel: int.integrationLabel, scopes: int.scopes.join(", ") });
                      setEditId(int.id);
                    }}>
                      <Plus className="w-3 h-3" /> {/* Use Plus as edit icon placeholder or pencil if available */}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteIntegration.mutate(int.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="font-mono text-lg mt-2">{int.integrationLabel}</CardTitle>
                <div className="font-mono text-[10px] text-muted-foreground uppercase">{int.integrationType}</div>
              </CardHeader>
              <CardContent className="p-4 pt-2 flex-1">
                <div className="flex items-center gap-2 text-xs font-mono mb-3">
                  <Key className="w-3 h-3 text-muted-foreground" />
                  {int.hasToken ? (
                    <span className="text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Token Stored</span>
                  ) : (
                    <span className="text-amber-500 flex items-center gap-1"><XCircle className="w-3 h-3"/> No Token</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {int.scopes.map(s => (
                    <span key={s} className="text-[10px] font-mono border border-border/30 px-1.5 py-0.5 rounded bg-background">
                      {s}
                    </span>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="p-4 pt-0 border-t border-border/20 mt-2 text-[10px] font-mono text-muted-foreground">
                Added: {format(new Date(int.createdAt), 'yy-MM-dd HH:mm')}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur">
          <DialogHeader>
            <DialogTitle className="font-mono text-xl">Modify Connection</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase text-muted-foreground">Label</Label>
              <Input value={editForm.integrationLabel} onChange={e => setEditForm({...editForm, integrationLabel: e.target.value})} required className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase text-muted-foreground">Scopes (comma separated)</Label>
              <Input value={editForm.scopes} onChange={e => setEditForm({...editForm, scopes: e.target.value})} className="font-mono" />
            </div>
            <Button type="submit" className="w-full font-mono font-bold mt-4" disabled={updateIntegration.isPending}>
              UPDATE CONNECTION
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}