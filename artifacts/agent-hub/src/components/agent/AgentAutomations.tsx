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
  Clock, Plus, Play, Trash2, ToggleLeft, ToggleRight,
  Loader2, Zap, ChevronDown, ChevronUp
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Automation {
  id: number;
  agentId: number;
  name: string;
  description: string | null;
  triggerMessage: string;
  cronExpression: string;
  isActive: boolean;
  lastRunAt: string | null;
  createdAt: string;
}

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at 9am", value: "0 9 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Weekly on Monday", value: "0 9 * * 1" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
];

function CronHelp({ value }: { value: string }) {
  const descriptions: Record<string, string> = {
    "0 * * * *": "Runs every hour",
    "0 */6 * * *": "Runs every 6 hours",
    "0 9 * * *": "Runs every day at 9:00 AM",
    "0 0 * * *": "Runs every day at midnight",
    "0 9 * * 1": "Runs every Monday at 9:00 AM",
    "*/15 * * * *": "Runs every 15 minutes",
  };
  const desc = descriptions[value];
  if (!desc) return null;
  return <p className="text-[11px] text-primary/70 mt-1">{desc}</p>;
}

export function AgentAutomations({ agentId }: { agentId: number }) {
  const { toast } = useToast();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    triggerMessage: "",
    cronExpression: "0 9 * * *",
    customCron: false,
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
    setForm({ name: "", description: "", triggerMessage: "", cronExpression: "0 9 * * *", customCron: false });
    setDialogOpen(true);
  };

  const openEdit = (a: Automation) => {
    setEditingId(a.id);
    const isPreset = CRON_PRESETS.some(p => p.value === a.cronExpression);
    setForm({
      name: a.name,
      description: a.description ?? "",
      triggerMessage: a.triggerMessage,
      cronExpression: a.cronExpression,
      customCron: !isPreset,
    });
    setDialogOpen(true);
  };

  const saveAutomation = async () => {
    if (!form.name || !form.triggerMessage || !form.cronExpression) {
      toast({ title: "Missing fields", description: "Name, trigger and schedule are required.", variant: "destructive" });
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
          description: form.description || null,
          triggerMessage: form.triggerMessage,
          cronExpression: form.cronExpression,
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

  const toggleActive = async (a: Automation) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/automations/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !a.isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      setAutomations(prev => prev.map(au => au.id === a.id ? { ...au, isActive: !au.isActive } : au));
    } catch {
      toast({ title: "Error", description: "Toggle failed.", variant: "destructive" });
    }
  };

  const runNow = async (a: Automation) => {
    setRunningId(a.id);
    try {
      const res = await fetch(`/api/agents/${agentId}/automations/${a.id}/run`, { method: "POST" });
      const data = await res.json();
      toast({ title: "Automation ran", description: data.response?.slice(0, 100) + "..." });
      fetchAutomations();
    } catch {
      toast({ title: "Error", description: "Run failed.", variant: "destructive" });
    } finally {
      setRunningId(null);
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
            ? "No automations yet — add one to have the agent run tasks on a schedule"
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
            a.isActive ? "border-white/10 bg-white/3" : "border-white/5 bg-white/1 opacity-60"
          }`}
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              a.isActive ? "bg-primary/15 text-primary" : "bg-white/5 text-muted-foreground"
            }`}>
              <Clock className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white truncate">{a.name}</p>
                <span className="shrink-0 text-[9px] font-mono text-primary/60 bg-primary/8 border border-primary/15 rounded px-1.5 py-0.5">
                  {a.cronExpression}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {a.description || a.triggerMessage.slice(0, 60) + (a.triggerMessage.length > 60 ? "..." : "")}
              </p>
              {a.lastRunAt && (
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  Last ran {formatDistanceToNow(new Date(a.lastRunAt), { addSuffix: true })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
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
                checked={a.isActive}
                onCheckedChange={() => toggleActive(a)}
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
            <div className="px-4 pb-3.5 border-t border-white/5 pt-3 space-y-2">
              <div>
                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">Trigger Message</p>
                <p className="text-xs text-white/80 bg-black/20 rounded-lg p-2.5 whitespace-pre-wrap">{a.triggerMessage}</p>
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

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What does this automation do?"
                className="bg-white/5 border-white/10"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-primary" />
                Trigger Message
              </label>
              <p className="text-[11px] text-muted-foreground">This message is sent to the agent when the automation runs. The agent's response gets logged to the Activity tab.</p>
              <Textarea
                value={form.triggerMessage}
                onChange={e => setForm(f => ({ ...f, triggerMessage: e.target.value }))}
                placeholder="e.g. Generate a daily summary of what you remember about this week's priorities"
                className="bg-white/5 border-white/10 min-h-[80px] resize-none"
              />
            </div>

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
              <CronHelp value={form.cronExpression} />
            </div>
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
