import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { CapabilityRequest } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ShieldAlert, Plus, Trash2, Reply } from "lucide-react";
import { format } from "date-fns";

export default function CapabilityRequestsSection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ requestedCapability: "", reason: "" });
  const [respondId, setRespondId] = useState<string | null>(null);
  const [responseForm, setResponseForm] = useState({ ownerResponse: "" });

  const { data: requests, isLoading } = useQuery({
    queryKey: ["operators", operatorId, "capability-requests"],
    queryFn: () => apiFetch<CapabilityRequest[]>(`/operators/${operatorId}/capability-requests`),
  });

  const addRequest = useMutation({
    mutationFn: (data: any) => apiFetch(`/operators/${operatorId}/capability-requests`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "capability-requests"] });
      setIsAddOpen(false);
      setAddForm({ requestedCapability: "", reason: "" });
      toast({ title: "Request submitted" });
    }
  });

  const respondRequest = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => apiFetch(`/operators/${operatorId}/capability-requests/${id}/respond`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "capability-requests"] });
      setRespondId(null);
      setResponseForm({ ownerResponse: "" });
      toast({ title: "Response sent" });
    }
  });

  const deleteRequest = useMutation({
    mutationFn: (id: string) => apiFetch(`/operators/${operatorId}/capability-requests/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "capability-requests"] });
      toast({ title: "Request removed" });
    }
  });

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-4">
        <div>
          <h2 className="text-2xl font-bold font-mono tracking-tight text-primary flex items-center gap-2">
            <ShieldAlert className="w-6 h-6" /> Capability Requests
          </h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">Autonomous requests for escalated permissions or skills</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="font-mono text-xs tracking-wider border-amber-500/30 text-amber-500 hover:bg-amber-500/10">
              <Plus className="w-4 h-4 mr-2" /> SIMULATE REQUEST
            </Button>
          </DialogTrigger>
          <DialogContent className="border-amber-500/30 bg-card/95 backdrop-blur">
            <DialogHeader>
              <DialogTitle className="font-mono text-xl text-amber-500">Inject Fake Request</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); addRequest.mutate(addForm); }} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Requested Capability</Label>
                <Input value={addForm.requestedCapability} onChange={e => setAddForm({...addForm, requestedCapability: e.target.value})} required className="font-mono" placeholder="e.g. Email Send Access" />
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Justification</Label>
                <Textarea value={addForm.reason} onChange={e => setAddForm({...addForm, reason: e.target.value})} required className="font-mono h-24" />
              </div>
              <Button type="submit" className="w-full font-mono font-bold mt-4 bg-amber-500 hover:bg-amber-600 text-white" disabled={addRequest.isPending}>
                INJECT INTO QUEUE
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center p-8 font-mono text-primary animate-pulse">CHECKING QUEUE...</div>
      ) : requests?.length === 0 ? (
        <div className="text-center p-12 border border-dashed border-border/50 rounded-lg bg-card/20 text-muted-foreground font-mono text-sm">
          No pending or historical capability requests.
        </div>
      ) : (
        <div className="space-y-4">
          {requests?.map(req => (
            <div key={req.id} className={`border rounded-lg p-4 flex flex-col gap-4 bg-card/30 ${!req.ownerResponse ? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.05)]' : 'border-border/50 opacity-70'}`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  {!req.ownerResponse ? (
                    <Badge variant="outline" className="font-mono text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30 animate-pulse">PENDING REVIEW</Badge>
                  ) : (
                    <Badge variant="outline" className="font-mono text-[10px] bg-background/50 border-border/50 text-muted-foreground">RESPONDED</Badge>
                  )}
                  <span className="font-mono text-sm font-bold text-foreground">Requested: <span className="text-primary">{req.requestedCapability}</span></span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="font-mono text-[10px] text-muted-foreground">{format(new Date(req.createdAt), 'yy-MM-dd HH:mm')}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteRequest.mutate(req.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              
              <div className="bg-background/50 p-3 rounded border border-border/30">
                <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">Operator Justification</div>
                <div className="font-mono text-xs text-foreground/90">{req.reason}</div>
              </div>

              {!req.ownerResponse ? (
                <div className="pt-2 border-t border-border/30 flex justify-end">
                  <Dialog open={respondId === req.id} onOpenChange={(open) => !open && setRespondId(null)}>
                    <DialogTrigger asChild>
                      <Button variant="default" size="sm" className="font-mono text-xs font-bold" onClick={() => setRespondId(req.id)}>
                        <Reply className="w-3 h-3 mr-2" /> PROVIDE DECISION
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="border-primary/20 bg-card/95 backdrop-blur">
                      <DialogHeader>
                        <DialogTitle className="font-mono text-xl">Respond to Request</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={(e) => { e.preventDefault(); respondRequest.mutate({ id: req.id, data: responseForm }); }} className="space-y-4 mt-4">
                        <div className="space-y-2">
                          <Label className="font-mono text-xs uppercase text-muted-foreground">Owner Directives / Response</Label>
                          <Textarea value={responseForm.ownerResponse} onChange={e => setResponseForm({ ownerResponse: e.target.value })} required className="font-mono h-32" placeholder="Explain approval bounds or reason for denial..." />
                        </div>
                        <Button type="submit" className="w-full font-mono font-bold mt-4" disabled={respondRequest.isPending}>
                          TRANSMIT RESPONSE
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              ) : (
                <div className="bg-primary/5 p-3 rounded border border-primary/20">
                  <div className="font-mono text-[10px] text-primary uppercase mb-1">Owner Response Transmitted</div>
                  <div className="font-mono text-xs text-primary/90">{req.ownerResponse}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}