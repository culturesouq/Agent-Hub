import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Clock, Plus, Play, Trash2, Loader2, Zap,
  ChevronDown, ChevronUp, Webhook, Copy, CheckCircle2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Automation {
  id: number;
  agentId: number;
  name: string;
  triggerType: "schedule" | "webhook";
  cronExpression: string | null;
  webhookSecret: string | null;
  webhookUrl: string | null;
  prompt: string;
  isEnabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  createdAt: string;
}

interface AutomationRun {
  id: number;
  automationId: number;
  triggeredAt: string;
  prompt: string;
  response: string | null;
  status: "pending" | "success" | "error" | string;
}

function RunStatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border border-green-400/20 bg-green-400/8 text-green-400">success</span>;
  }
  if (status === "error") {
    return <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border border-red-400/20 bg-red-400/8 text-red-400">error</span>;
  }
  return <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border border-yellow-400/20 bg-yellow-400/8 text-yellow-400">{status}</span>;
}

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at 9 AM", value: "0 9 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Weekly on Monday", value: "0 9 * * 1" },
  { label: "Every 15 min", value: "*/15 * * * *" },
];

const CRON_DESCRIPTIONS: Record<string, string> = {
  "0 * * * *": "Runs every hour",
  "0 */6 * * *": "Runs every 6 hours",
  "0 9 * * *": "Runs every day at 9:00 AM",
  "0 0 * * *": "Runs every day at midnight",
  "0 9 * * 1": "Runs every Monday at 9:00 AM",
  "*/15 * * * *": "Runs every 15 minutes",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="p-1 rounded text-muted-foreground hover:text-white transition-colors shrink-0">
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export function AgentAutomations({ agentId }: { agentId: number }) {
  const { toast } = useToast();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [runs, setRuns] = useState<Record<number, AutomationRun[]>>({});
  const [loadingRuns, setLoadingRuns] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: "",
    triggerType: "schedule" as "schedule" | "webhook",
    cronExpression: "0 9 * * *",
    customCron: false,
    prompt: "",
  });

  const fetchAutomations = async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/automations`);
      const data = await res.json();
      setAutomations(Array.isArray(data) ? data : []);
    } catch {
      setAutomations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAutomations(); }, [agentId]);

  const openNew = () => {
    setEditingId(null);
    setForm({ name: "", triggerType: "schedule", cronExpression: "0 9 * * *", customCron: false, prompt: "" });
    setDialogOpen(true);
  };

  const openEdit = (a: Automation) => {
    setEditingId(a.id);
    const isPreset = CRON_PRESETS.some(p => p.value === a.cronExpression);
    setForm({
      name: a.name,
      triggerType: a.triggerType,
      cronExpression: a.cronExpression ?? "0 9 * * *",
      customCron: !isPreset,
      prompt: a.prompt,
    });
    setDialogOpen(true);
  };

  const saveAutomation = async () => {
    if (!form.name.trim() || !form.prompt.trim()) {
      toast({ title: "Missing fields", description: "Name and prompt are required.", variant: "destructive" });
      return;
    }
    if (form.triggerType === "schedule" && !form.cronExpression.trim()) {
      toast({ title: "Missing schedule", description: "Please set a cron expression.", variant: "destructive" });
      return;
    }
    try {
      const url = editingId
        ? `/api/agents/${agentId}/automations/${editingId}`
        : `/api/agents/${agentId}/automations`;
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          triggerType: form.triggerType,
          cronExpression: form.triggerType === "schedule" ? form.cronExpression : undefined,
          prompt: form.prompt,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: editingId ? "Updated" : "Created", description: "Automation saved." });
      setDialogOpen(false);
      fetchAutomations();
    } catch {
      toast({ title: "Error", description: "Failed to save automation.", variant: "destructive" });
    }
  };

  const deleteAutomation = async (id: number) => {
    if (!confirm("Delete this automation?")) return;
    try {
      await fetch(`/api/agents/${agentId}/automations/${id}`, { method: "DELETE" });
      setAutomations(prev => prev.filter(a => a.id !== id));
    } catch {
      toast({ title: "Error", description: "Delete failed.", variant: "destructive" });
    }
  };

  const toggleEnabled = async (a: Automation) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/automations/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !a.isEnabled }),
      });
      if (!res.ok) throw new Error("Failed");
      setAutomations(prev => prev.map(au => au.id === a.id ? { ...au, isEnabled: !au.isEnabled } : au));
    } catch {
      toast({ title: "Error", description: "Toggle failed.", variant: "destructive" });
    }
  };

  const runNow = async (a: Automation) => {
    setRunningId(a.id);
    try {
      await fetch(`/api/automations/${a.id}/run`, { method: "POST" });
      toast({ title: "Triggered", description: "Automation is running in the background." });
      setTimeout(() => fetchAutomations(), 3000);
    } catch {
      toast({ title: "Error", description: "Run failed.", variant: "destructive" });
    } finally {
      setRunningId(null);
    }
  };

  const toggleExpanded = async (a: Automation) => {
    if (expandedId === a.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(a.id);
    if (!runs[a.id]) {
      setLoadingRuns(a.id);
      try {
        const res = await fetch(`/api/automations/${a.id}/runs`);
        const data = await res.json();
        setRuns(prev => ({ ...prev, [a.id]: Array.isArray(data) ? data.slice(0, 5) : [] }));
      } catch {
        setRuns(prev => ({ ...prev, [a.id]: [] }));
      } finally {
        setLoadingRuns(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {automations.length === 0
            ? "No automations yet — create a scheduled task or webhook trigger"
            : `${automations.length} automation${automations.length !== 1 ? "s" : ""}`}
        </p>
        <Button onClick={openNew} size="sm" className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground">
          <Plus className="w-3.5 h-3.5" />
          Add Automation
        </Button>
      </div>

      {automations.map(a => (
        <div
          key={a.id}
          className={`rounded-xl border transition-all ${
            a.isEnabled ? "border-white/10 bg-white/3" : "border-white/5 bg-white/1 opacity-60"
          }`}
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              a.isEnabled ? "bg-primary/15 text-primary" : "bg-white/5 text-muted-foreground"
            }`}>
              {a.triggerType === "webhook" ? <Webhook className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-white truncate">{a.name}</p>
                {a.triggerType === "schedule" && a.cronExpression && (
                  <span className="shrink-0 text-[9px] font-mono text-primary/60 bg-primary/8 border border-primary/15 rounded px-1.5 py-0.5">
                    {a.cronExpression}
                  </span>
                )}
                {a.triggerType === "webhook" && (
                  <span className="shrink-0 text-[9px] font-mono text-blue-400/70 bg-blue-400/8 border border-blue-400/20 rounded px-1.5 py-0.5">
                    webhook
                  </span>
                )}
                {a.lastRunStatus && <RunStatusBadge status={a.lastRunStatus} />}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {a.prompt.slice(0, 70)}{a.prompt.length > 70 ? "…" : ""}
              </p>
              {a.lastRunAt && (
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  Last ran {formatDistanceToNow(new Date(a.lastRunAt), { addSuffix: true })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => toggleExpanded(a)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
              >
                {expandedId === a.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => runNow(a)}
                disabled={runningId === a.id}
                className="p-1.5 rounded-lg text-green-400/70 hover:text-green-400 hover:bg-green-400/8 transition-colors"
                title="Run now"
              >
                {runningId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <Switch
                checked={a.isEnabled}
                onCheckedChange={() => toggleEnabled(a)}
                className="scale-75"
              />
              <button
                onClick={() => deleteAutomation(a.id)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {expandedId === a.id && (
            <div className="px-4 pb-3.5 border-t border-white/5 pt-3 space-y-3">
              <div>
                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">Prompt</p>
                <p className="text-xs text-white/80 bg-black/20 rounded-lg p-2.5 whitespace-pre-wrap">{a.prompt}</p>
              </div>

              {a.triggerType === "webhook" && a.webhookUrl && (
                <div>
                  <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">Webhook URL</p>
                  <div className="flex items-center gap-2 bg-black/20 rounded-lg px-2.5 py-2">
                    <code className="text-[11px] text-blue-300 flex-1 break-all">{a.webhookUrl}</code>
                    <CopyButton text={a.webhookUrl} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">POST to this URL to trigger the automation. Body fields available as <code className="text-primary/70">{`{{body.field}}`}</code> in the prompt.</p>
                </div>
              )}

              <div>
                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">Recent Runs</p>
                {loadingRuns === a.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                ) : runs[a.id]?.length ? (
                  <div className="space-y-1">
                    {runs[a.id].map(r => (
                      <div key={r.id} className="flex items-start gap-2 text-[11px]">
                        <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                          r.status === "success" ? "bg-green-400" : r.status === "error" ? "bg-red-400" : "bg-yellow-400"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <span className="text-muted-foreground">{formatDistanceToNow(new Date(r.triggeredAt), { addSuffix: true })}</span>
                          {r.response && (
                            <p className="text-white/60 truncate">{r.response.slice(0, 80)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground/60">No runs yet</p>
                )}
              </div>

              <button
                onClick={() => openEdit(a)}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                Edit automation →
              </button>
            </div>
          )}
        </div>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#0d1117] border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">{editingId ? "Edit" : "New"} Automation</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white">Name</label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Daily Briefing"
                className="bg-white/5 border-white/10"
              />
            </div>

            {!editingId && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white">Trigger Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["schedule", "webhook"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, triggerType: t }))}
                      className={`flex items-center gap-2 text-xs px-3 py-2.5 rounded-lg border text-left transition-all ${
                        form.triggerType === t
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-white/10 bg-white/3 text-muted-foreground hover:border-white/20 hover:text-white"
                      }`}
                    >
                      {t === "schedule" ? <Clock className="w-3.5 h-3.5 shrink-0" /> : <Webhook className="w-3.5 h-3.5 shrink-0" />}
                      {t === "schedule" ? "Schedule (cron)" : "Webhook (HTTP)"}
                    </button>
                  ))}
                </div>
                {form.triggerType === "webhook" && (
                  <p className="text-[11px] text-muted-foreground">A secret webhook URL will be generated. POST to it to trigger this automation.</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-primary" />
                Prompt
              </label>
              <p className="text-[11px] text-muted-foreground">The message sent to the agent when triggered. For webhooks, use <code className="text-primary/70">{`{{body.fieldName}}`}</code> to reference POST body fields.</p>
              <Textarea
                value={form.prompt}
                onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                placeholder="e.g. Generate a daily summary of priorities"
                className="bg-white/5 border-white/10 min-h-[80px] resize-none"
              />
            </div>

            {form.triggerType === "schedule" && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  Schedule
                </label>

                {!form.customCron ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {CRON_PRESETS.map(p => (
                        <button
                          key={p.value}
                          onClick={() => setForm(f => ({ ...f, cronExpression: p.value }))}
                          className={`text-xs px-3 py-2 rounded-lg border text-left transition-all ${
                            form.cronExpression === p.value
                              ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-white/10 bg-white/3 text-muted-foreground hover:border-white/20 hover:text-white"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setForm(f => ({ ...f, customCron: true }))}
                      className="text-[11px] text-muted-foreground hover:text-white transition-colors"
                    >
                      Use custom cron expression →
                    </button>
                  </>
                ) : (
                  <>
                    <Input
                      value={form.cronExpression}
                      onChange={e => setForm(f => ({ ...f, cronExpression: e.target.value }))}
                      placeholder="* * * * *"
                      className="bg-white/5 border-white/10 font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">Format: minute hour day month weekday</p>
                    <button
                      onClick={() => setForm(f => ({ ...f, customCron: false, cronExpression: "0 9 * * *" }))}
                      className="text-[11px] text-muted-foreground hover:text-white transition-colors"
                    >
                      ← Back to presets
                    </button>
                  </>
                )}
                {CRON_DESCRIPTIONS[form.cronExpression] && (
                  <p className="text-[11px] text-primary/70">{CRON_DESCRIPTIONS[form.cronExpression]}</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveAutomation} className="bg-primary text-primary-foreground">
              {editingId ? "Save Changes" : "Create Automation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
