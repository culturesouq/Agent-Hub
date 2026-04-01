import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { GrowProposal, HealthScore } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Activity, CheckCircle2, XCircle, AlertCircle, Play, RefreshCw } from "lucide-react";
import { format } from "date-fns";

export default function GrowSection({ operatorId, saData }: { operatorId: string, saData: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: proposals, isLoading: propsLoading } = useQuery({
    queryKey: ["operators", operatorId, "grow-proposals"],
    queryFn: () => apiFetch<GrowProposal[]>(`/operators/${operatorId}/grow/proposals`),
  });

  const triggerGrow = useMutation({
    mutationFn: () => apiFetch(`/operators/${operatorId}/grow/trigger`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "grow-proposals"] });
      toast({ title: "GROW cycle initiated", description: "The operator is analyzing its experience for potential growth." });
    }
  });

  const recomputeSa = useMutation({
    mutationFn: () => apiFetch(`/operators/${operatorId}/grow/recompute`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "self-awareness"] });
      toast({ title: "Self-Awareness Recomputed" });
    }
  });

  const decideProposal = useMutation({
    mutationFn: ({ id, action }: { id: string, action: 'approve' | 'reject' }) => 
      apiFetch(`/operators/${operatorId}/grow/decide/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "grow-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId] }); // Refresh operator state
      toast({ title: "Decision recorded" });
    }
  });

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'applied': return 'text-green-500 border-green-500/30 bg-green-500/10';
      case 'rejected': return 'text-red-500 border-red-500/30 bg-red-500/10';
      case 'needs_owner_review': return 'text-amber-500 border-amber-500/30 bg-amber-500/10';
      default: return 'text-primary border-primary/30 bg-primary/10';
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'applied': return <CheckCircle2 className="w-3 h-3 mr-1" />;
      case 'rejected': return <XCircle className="w-3 h-3 mr-1" />;
      case 'needs_owner_review': return <AlertCircle className="w-3 h-3 mr-1 animate-pulse" />;
      default: return <Activity className="w-3 h-3 mr-1" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-4">
        <div>
          <h2 className="text-2xl font-bold font-mono tracking-tight text-primary flex items-center gap-2">
            <Activity className="w-6 h-6" /> GROW Engine
          </h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">Autonomous evolution and self-awareness telemetry</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => recomputeSa.mutate()} disabled={recomputeSa.isPending} className="font-mono text-xs border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground">
            <RefreshCw className={`w-4 h-4 mr-2 ${recomputeSa.isPending ? 'animate-spin' : ''}`} />
            RECOMPUTE STATE
          </Button>
          <Button onClick={() => triggerGrow.mutate()} disabled={triggerGrow.isPending} className="font-mono text-xs font-bold tracking-widest bg-primary text-primary-foreground hover:bg-primary/90">
            <Play className="w-4 h-4 mr-2" />
            TRIGGER GROW CYCLE
          </Button>
        </div>
      </div>

      <Tabs defaultValue="awareness" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-card/50 border border-border/50 mb-6 h-auto p-1">
          <TabsTrigger value="awareness" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            SELF-AWARENESS
          </TabsTrigger>
          <TabsTrigger value="proposals" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            GROWTH PROPOSALS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="awareness" className="m-0 space-y-6">
          {saData?.healthScore ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="col-span-1 border-primary/20 bg-card/30 flex flex-col items-center justify-center p-8">
                <div className="text-center space-y-2">
                  <div className="text-sm font-mono text-muted-foreground uppercase tracking-widest">System Integrity</div>
                  <div className={`text-7xl font-bold font-mono tracking-tighter ${
                    saData.healthScore.score >= 80 ? 'text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 
                    saData.healthScore.score >= 50 ? 'text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 
                    'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                  }`}>
                    {saData.healthScore.score}<span className="text-3xl opacity-50">%</span>
                  </div>
                  <Badge variant="outline" className="font-mono uppercase tracking-widest mt-2 bg-background/50">
                    {saData.healthScore.label}
                  </Badge>
                </div>
              </Card>

              <Card className="col-span-1 md:col-span-2 border-border/50 bg-card/30 p-6">
                <h3 className="font-mono text-sm font-bold text-primary mb-6 flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Component Telemetry
                </h3>
                <div className="space-y-5">
                  {[
                    { key: 'mandateCoverage', label: 'Mandate Coverage', val: saData.healthScore.components.mandateCoverage },
                    { key: 'mandateGaps', label: 'Mandate Adherence', val: 100 - saData.healthScore.components.mandateGaps },
                    { key: 'kbConfidence', label: 'Knowledge Confidence', val: saData.healthScore.components.kbConfidence },
                    { key: 'growActivity', label: 'Growth Activity', val: saData.healthScore.components.growActivity },
                    { key: 'soulIntegrity', label: 'Soul Integrity', val: saData.healthScore.components.soulIntegrity },
                  ].map(comp => (
                    <div key={comp.key} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-muted-foreground uppercase">{comp.label}</span>
                        <span className={comp.val >= 80 ? 'text-green-500' : comp.val >= 50 ? 'text-amber-500' : 'text-red-500'}>
                          {comp.val}%
                        </span>
                      </div>
                      <Progress value={comp.val} className="h-1.5 bg-background border border-border/50" />
                    </div>
                  ))}
                </div>
              </Card>

              {saData.mandateGaps && saData.mandateGaps.length > 0 && (
                <Card className="col-span-1 md:col-span-3 border-amber-500/20 bg-amber-500/5 p-6">
                  <h3 className="font-mono text-sm font-bold text-amber-500 mb-4 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> Detected Mandate Gaps
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {saData.mandateGaps.map((gap: any, i: number) => (
                      <div key={i} className="p-3 border border-amber-500/20 bg-background/50 rounded flex flex-col gap-2">
                        <div className="font-mono text-xs text-foreground/90">{gap.description}</div>
                        <div className="font-mono text-[10px] text-amber-500/80 uppercase">Severity: {gap.severity}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          ) : (
             <div className="text-center p-12 font-mono text-primary animate-pulse">AWAITING TELEMETRY...</div>
          )}
        </TabsContent>

        <TabsContent value="proposals" className="m-0 space-y-4">
          <div className="bg-primary/5 border border-primary/20 rounded p-3 mb-4">
            <p className="font-mono text-xs text-primary/80">
              GROW proposals are autonomous suggestions to modify Layer 2 Soul or Operator KB based on experience. 
              Depending on the lock level, these may apply automatically or require your approval.
            </p>
          </div>

          {propsLoading ? (
            <div className="text-center p-8 font-mono text-primary animate-pulse">LOADING LOGS...</div>
          ) : proposals?.length === 0 ? (
            <div className="text-center p-12 border border-dashed border-border/50 rounded-lg bg-card/20">
              <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="font-mono text-sm text-muted-foreground">No growth proposals generated yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {proposals?.map(prop => (
                <div key={prop.id} className="border border-border/50 bg-card/30 rounded-lg overflow-hidden flex flex-col">
                  <div className="flex justify-between items-center p-3 border-b border-border/50 bg-background/50">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider ${getStatusColor(prop.status)}`}>
                        {getStatusIcon(prop.status)} {prop.status.replace(/_/g, ' ')}
                      </Badge>
                      <span className="font-mono text-xs font-bold text-foreground">Type: {prop.proposalType}</span>
                    </div>
                    <div className="flex gap-3 text-[10px] font-mono text-muted-foreground">
                      <span>CONF: {prop.confidence}%</span>
                      <span>{format(new Date(prop.createdAt), 'yy-MM-dd HH:mm')}</span>
                    </div>
                  </div>
                  
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div>
                        <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">Target Field</div>
                        <div className="font-mono text-sm bg-background/50 p-2 rounded border border-border/30">{prop.targetField}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">Proposed Modification</div>
                        <pre className="font-mono text-xs bg-primary/5 text-primary p-2 rounded border border-primary/20 whitespace-pre-wrap">
                          {typeof prop.proposedValue === 'object' ? JSON.stringify(prop.proposedValue, null, 2) : String(prop.proposedValue)}
                        </pre>
                      </div>
                    </div>
                    
                    <div className="space-y-3 flex flex-col">
                      <div className="flex-1">
                        <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">Rationale / Logic Chain</div>
                        <div className="font-mono text-xs text-foreground/80 leading-relaxed border-l-2 border-primary/30 pl-3 py-1">
                          {prop.rationale}
                        </div>
                      </div>
                      
                      {prop.status === 'needs_owner_review' && (
                        <div className="flex gap-2 pt-3 border-t border-border/30">
                          <Button 
                            variant="default" 
                            size="sm" 
                            className="w-full font-mono text-xs bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => decideProposal.mutate({ id: prop.id, action: 'approve' })}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-2" /> APPROVE
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            className="w-full font-mono text-xs"
                            onClick={() => decideProposal.mutate({ id: prop.id, action: 'reject' })}
                          >
                            <XCircle className="w-3 h-3 mr-2" /> REJECT
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}