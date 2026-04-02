import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { GrowProposal, HealthScore } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Activity, CheckCircle2, XCircle, AlertCircle, Play, RefreshCw, FlaskConical, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { format } from "date-fns";

const FIELD_LABELS: Record<string, string> = {
  personalityTraits: "personality traits",
  toneProfile: "communication tone",
  communicationStyle: "communication style",
  emotionalRange: "emotional range",
  decisionMakingStyle: "decision-making approach",
  conflictResolution: "conflict resolution style",
  quirks: "unique characteristics",
  valuesManifestation: "how values show up",
  openingMessage: "opening message",
  mandate: "core purpose",
};

function humanizeField(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, " $1").toLowerCase().trim();
}

function confidenceColor(pct: number) {
  if (pct >= 80) return "text-green-500";
  if (pct >= 60) return "text-amber-500";
  return "text-muted-foreground";
}

interface TestResult {
  message: string;
  current: string;
  proposed: string;
}

function ProposalCard({
  prop,
  operatorId,
  onDecide,
  deciding,
}: {
  prop: GrowProposal;
  operatorId: string;
  onDecide: (id: string, action: "approve" | "reject") => void;
  deciding: boolean;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const statusConfig = {
    applied:            { color: "text-green-500 border-green-500/30 bg-green-500/10",  label: "Applied" },
    rejected:           { color: "text-red-500 border-red-500/30 bg-red-500/10",        label: "Rejected" },
    needs_owner_review: { color: "text-amber-500 border-amber-500/30 bg-amber-500/10",  label: "Needs review" },
    pending:            { color: "text-primary border-primary/30 bg-primary/10",         label: "Pending" },
  };
  const status = statusConfig[prop.status as keyof typeof statusConfig] ?? statusConfig.pending;

  const runTest = async () => {
    setTestLoading(true);
    setTestError(null);
    setTestResults(null);
    try {
      const res = await apiFetch<{ results: TestResult[] }>(
        `/operators/${operatorId}/grow/test-proposal/${prop.id}`,
        { method: "POST" }
      );
      setTestResults(res.results ?? []);
    } catch (err: any) {
      setTestError(err.message ?? "Test failed");
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="border border-border/50 bg-card/30 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between p-4 gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Badge variant="outline" className={`font-mono text-[10px] uppercase ${status.color}`}>
              {prop.status === "needs_owner_review" && <AlertCircle className="w-2.5 h-2.5 mr-1 animate-pulse" />}
              {prop.status === "applied" && <CheckCircle2 className="w-2.5 h-2.5 mr-1" />}
              {prop.status === "rejected" && <XCircle className="w-2.5 h-2.5 mr-1" />}
              {status.label}
            </Badge>
            <span className="font-mono text-[10px] text-muted-foreground">
              {format(new Date(prop.createdAt), "MMM d, yyyy")}
            </span>
          </div>

          <p className="font-mono text-sm font-bold text-foreground leading-snug">
            Wants to update <span className="text-primary">{humanizeField(prop.targetField)}</span>
          </p>

          <p className="font-mono text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">
            {prop.rationale}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`font-mono text-xs font-bold ${confidenceColor(prop.confidence)}`}>
            {prop.confidence}% confidence
          </span>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/30 px-4 pb-4 pt-3 space-y-3">
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Full reasoning</p>
            <p className="font-mono text-xs text-foreground/80 leading-relaxed border-l-2 border-primary/30 pl-3">
              {prop.rationale}
            </p>
          </div>
          {prop.proposedValue !== undefined && (
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Proposed change</p>
              {Array.isArray(prop.proposedValue) ? (
                <div className="flex flex-wrap gap-1.5 p-3 bg-primary/5 rounded-lg border border-primary/20">
                  {prop.proposedValue.map((item: string, i: number) => (
                    <span key={i} className="font-mono text-xs bg-primary/10 text-primary/90 px-2 py-0.5 rounded-full border border-primary/20">
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="font-mono text-xs text-primary/90 bg-primary/5 p-3 rounded-lg border border-primary/20 leading-relaxed">
                  {String(prop.proposedValue)}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Preview test results */}
      {testResults && (
        <div className="border-t border-border/30 px-4 pb-4 pt-3 space-y-4">
          <p className="font-mono text-xs font-bold text-foreground flex items-center gap-2">
            <FlaskConical className="w-3.5 h-3.5 text-primary" />
            Preview — how the operator would respond differently
          </p>
          <div className="space-y-4">
            {testResults.map((result, i) => (
              <div key={i} className="space-y-2">
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  Test message {i + 1}
                </p>
                <p className="font-mono text-xs text-foreground/60 bg-background/40 border border-border/20 rounded px-3 py-2 italic">
                  "{result.message}"
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <p className="font-mono text-[10px] text-muted-foreground uppercase">Current</p>
                    <div className="font-mono text-xs bg-card/50 border border-border/30 rounded-lg p-3 text-foreground/80 leading-relaxed min-h-16">
                      {result.current}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="font-mono text-[10px] text-primary/70 uppercase flex items-center gap-1">
                      <ArrowRight className="w-3 h-3" /> After change
                    </p>
                    <div className="font-mono text-xs bg-primary/5 border border-primary/20 rounded-lg p-3 text-foreground/90 leading-relaxed min-h-16">
                      {result.proposed}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {testError && (
        <div className="border-t border-destructive/20 px-4 py-2">
          <p className="font-mono text-xs text-destructive">{testError}</p>
        </div>
      )}

      {/* Actions row */}
      {prop.status === "needs_owner_review" && (
        <div className="border-t border-border/30 px-4 py-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs h-8 border-border/40 hover:bg-primary/10 hover:border-primary/30 hover:text-primary"
            onClick={runTest}
            disabled={testLoading}
          >
            <FlaskConical className={`w-3 h-3 mr-1.5 ${testLoading ? "animate-spin" : ""}`} />
            {testLoading ? "Running preview…" : testResults ? "Re-run preview" : "Preview changes"}
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm"
              className="font-mono text-xs h-8 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => onDecide(prop.id, "approve")}
              disabled={deciding}
            >
              <CheckCircle2 className="w-3 h-3 mr-1.5" /> Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="font-mono text-xs h-8"
              onClick={() => onDecide(prop.id, "reject")}
              disabled={deciding}
            >
              <XCircle className="w-3 h-3 mr-1.5" /> Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GrowSection({ operatorId, saData }: { operatorId: string; saData: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: proposals = [], isLoading: propsLoading } = useQuery({
    queryKey: ["operators", operatorId, "grow-proposals"],
    queryFn: () => apiFetch<any>(`/operators/${operatorId}/grow/proposals`).then(r => r.proposals ?? []),
  });

  const triggerGrow = useMutation({
    mutationFn: () => apiFetch(`/operators/${operatorId}/grow/trigger`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "grow-proposals"] });
      toast({ title: "Growth cycle started", description: "Your operator is analyzing recent experience for potential improvements." });
    },
  });

  const recomputeSa = useMutation({
    mutationFn: () => apiFetch(`/operators/${operatorId}/grow/recompute`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "self-awareness"] });
      toast({ title: "Health score refreshed" });
    },
  });

  const decideProposal = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      apiFetch(`/operators/${operatorId}/grow/decide/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "grow-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId] });
      toast({ title: "Decision recorded" });
    },
  });

  const pending = (proposals as GrowProposal[]).filter(p => p.status === "needs_owner_review");
  const rest = (proposals as GrowProposal[]).filter(p => p.status !== "needs_owner_review");

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/50 pb-4">
        <div>
          <h2 className="font-mono font-bold text-lg text-primary flex items-center gap-2">
            <Activity className="w-5 h-5" /> Growth
          </h2>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">
            Track your operator's health and manage improvement proposals
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => recomputeSa.mutate()}
            disabled={recomputeSa.isPending}
            className="font-mono text-xs border-border/40"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${recomputeSa.isPending ? "animate-spin" : ""}`} />
            Refresh score
          </Button>
          <Button
            size="sm"
            onClick={() => triggerGrow.mutate()}
            disabled={triggerGrow.isPending}
            className="font-mono text-xs font-bold"
          >
            <Play className="w-3.5 h-3.5 mr-1.5" />
            {triggerGrow.isPending ? "Running…" : "Run growth cycle"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="health" className="w-full">
        <TabsList className="grid w-full max-w-sm grid-cols-2 bg-card/50 border border-border/50 h-auto p-1 mb-6">
          <TabsTrigger value="health" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Health
          </TabsTrigger>
          <TabsTrigger value="proposals" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary relative">
            Proposals
            {pending.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Health Tab */}
        <TabsContent value="health" className="m-0 space-y-5">
          {saData?.healthScore ? (
            <>
              <div className="flex flex-col sm:flex-row gap-5">
                {/* Score */}
                <div className="rounded-xl border border-border/40 bg-card/30 p-6 flex flex-col items-center justify-center gap-2 min-w-36">
                  <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Health score</span>
                  <span className={`font-mono font-bold text-5xl leading-none ${
                    saData.healthScore.score >= 80 ? "text-green-500" :
                    saData.healthScore.score >= 50 ? "text-amber-500" : "text-red-500"
                  }`}>
                    {saData.healthScore.score}
                    <span className="text-2xl opacity-50">%</span>
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px] uppercase bg-background/50 mt-1">
                    {saData.healthScore.label}
                  </Badge>
                </div>

                {/* Components */}
                <div className="flex-1 rounded-xl border border-border/40 bg-card/30 p-5 space-y-4">
                  {[
                    { key: "mandateCoverage",  label: "Purpose coverage",       val: saData.healthScore.components.mandateCoverage },
                    { key: "mandateGaps",      label: "Purpose adherence",      val: saData.healthScore.components.mandateGaps ?? 0 },
                    { key: "kbConfidence",     label: "Knowledge confidence",   val: saData.healthScore.components.kbConfidence },
                    { key: "growActivity",     label: "Growth activity",        val: saData.healthScore.components.growActivity },
                    { key: "soulIntegrity",    label: "Personality integrity",  val: saData.healthScore.components.soulIntegrity },
                  ].map(comp => (
                    <div key={comp.key} className="space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-muted-foreground">{comp.label}</span>
                        <span className={comp.val >= 80 ? "text-green-500" : comp.val >= 50 ? "text-amber-500" : "text-red-500"}>
                          {comp.val}%
                        </span>
                      </div>
                      <Progress value={comp.val} className="h-1.5 bg-background border border-border/30" />
                    </div>
                  ))}
                </div>
              </div>

              {saData.mandateGaps && saData.mandateGaps.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
                  <h3 className="font-mono text-xs font-bold text-amber-500 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5" /> Coverage gaps detected
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {saData.mandateGaps.map((gap: string, i: number) => (
                      <div key={i} className="p-3 border border-amber-500/20 bg-background/50 rounded-lg">
                        <p className="font-mono text-xs text-foreground/90">{gap}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Activity className="w-8 h-8 text-muted-foreground/20" />
              <p className="font-mono text-sm text-muted-foreground">No health data yet.</p>
              <Button variant="outline" size="sm" onClick={() => recomputeSa.mutate()} disabled={recomputeSa.isPending} className="font-mono text-xs">
                <RefreshCw className="w-3 h-3 mr-1.5" /> Compute now
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Proposals Tab */}
        <TabsContent value="proposals" className="m-0 space-y-4">
          {propsLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-28 rounded-xl border border-border/30 bg-card/20 animate-pulse" />
              ))}
            </div>
          ) : proposals.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 border border-dashed border-border/40 rounded-xl bg-card/10">
              <Activity className="w-8 h-8 text-muted-foreground/20" />
              <p className="font-mono text-sm text-muted-foreground">No growth proposals yet.</p>
              <p className="font-mono text-xs text-muted-foreground/60">Run a growth cycle to generate the first proposals.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pending.length > 0 && (
                <div className="space-y-3">
                  <p className="font-mono text-xs text-amber-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3" /> Needs your review
                  </p>
                  {pending.map(prop => (
                    <ProposalCard
                      key={prop.id}
                      prop={prop}
                      operatorId={operatorId}
                      onDecide={(id, action) => decideProposal.mutate({ id, action })}
                      deciding={decideProposal.isPending}
                    />
                  ))}
                </div>
              )}
              {rest.length > 0 && (
                <div className="space-y-3">
                  {pending.length > 0 && (
                    <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider">History</p>
                  )}
                  {rest.map(prop => (
                    <ProposalCard
                      key={prop.id}
                      prop={prop}
                      operatorId={operatorId}
                      onDecide={(id, action) => decideProposal.mutate({ id, action })}
                      deciding={decideProposal.isPending}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
