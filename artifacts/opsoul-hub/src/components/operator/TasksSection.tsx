import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Task } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Play, Pause, CheckSquare, Clock, Pencil, Zap, Loader2 } from "lucide-react";
import { format } from "date-fns";

type Schedule = "hourly" | "daily" | "weekly" | "cron";

/**
 * UI-only preset modes. They map down to (schedule, customSchedule) the
 * backend accepts. Keeping the preset distinct from the wire schedule
 * lets the owner pick "every 6 hours" without writing free-text cron.
 */
type PresetMode = "every_minutes" | "every_hours" | "daily" | "weekly" | "at_time_daily" | "at_time_weekday" | "advanced";

interface TaskFormState {
  name: string;
  preset: PresetMode;
  intervalN: number;        // for every_minutes / every_hours
  timeHH: string;           // "HH" — for at_time_*
  timeMM: string;           // "MM"
  weekday: string;          // for at_time_weekday
  prompt: string;
  advancedExpr: string;     // for advanced
}

const EMPTY_FORM: TaskFormState = {
  name: "", preset: "daily", intervalN: 1,
  timeHH: "09", timeMM: "00", weekday: "monday",
  prompt: "", advancedExpr: "",
};

const ADVANCED_HINT =
  'Free-text examples: "every 15 minutes", "at 14:30 on tuesday", or a 5-field cron like "0 9 * * 1-5".';

/** Translate a UI preset to the backend's (schedule, customSchedule) pair. */
function presetToWire(f: TaskFormState): { schedule: Schedule; customSchedule?: string } {
  switch (f.preset) {
    case "every_minutes":   return { schedule: "cron", customSchedule: `every ${Math.max(5, f.intervalN)} minutes` };
    case "every_hours":     return { schedule: "cron", customSchedule: `every ${Math.max(1, f.intervalN)} hours` };
    case "daily":           return { schedule: "daily" };
    case "weekly":          return { schedule: "weekly" };
    case "at_time_daily":   return { schedule: "cron", customSchedule: `at ${f.timeHH}:${f.timeMM} daily` };
    case "at_time_weekday": return { schedule: "cron", customSchedule: `at ${f.timeHH}:${f.timeMM} on ${f.weekday}` };
    case "advanced":        return { schedule: "cron", customSchedule: f.advancedExpr.trim() };
  }
}

/** Best-effort reverse — open the edit dialog with the closest preset. */
function wireToPreset(schedule: string, customSchedule: string | null | undefined): Partial<TaskFormState> {
  const expr = (customSchedule ?? "").trim();
  if (schedule === "daily")   return { preset: "daily" };
  if (schedule === "weekly")  return { preset: "weekly" };
  if (schedule === "hourly")  return { preset: "every_hours", intervalN: 1 };
  if (schedule !== "cron")    return { preset: "daily" };

  const minM = expr.match(/^every\s+(\d+)\s+minutes?$/i);
  if (minM) return { preset: "every_minutes", intervalN: parseInt(minM[1], 10) };
  const hourM = expr.match(/^every\s+(\d+)\s+hours?$/i);
  if (hourM) return { preset: "every_hours", intervalN: parseInt(hourM[1], 10) };
  const dailyM = expr.match(/^at\s+(\d{1,2}):(\d{2})\s+daily$/i);
  if (dailyM) return { preset: "at_time_daily", timeHH: dailyM[1].padStart(2, "0"), timeMM: dailyM[2] };
  const wdM = expr.match(/^at\s+(\d{1,2}):(\d{2})\s+on\s+(\w+)$/i);
  if (wdM) return { preset: "at_time_weekday", timeHH: wdM[1].padStart(2, "0"), timeMM: wdM[2], weekday: wdM[3].toLowerCase() };
  return { preset: "advanced", advancedExpr: expr };
}

function scheduleLabel(t: Task): string {
  if (t.schedule === "cron") return t.customSchedule || "Custom";
  if (t.schedule === "hourly") return "Hourly";
  if (t.schedule === "daily") return "Daily";
  if (t.schedule === "weekly") return "Weekly";
  return t.schedule;
}

export default function TasksSection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskFormState>(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["operators", operatorId, "tasks"],
    queryFn: () => apiFetch<{ tasks: Task[] }>(`/operators/${operatorId}/tasks`).then(r => r.tasks ?? []),
  });
  const tasks: Task[] = Array.isArray(data) ? data : (data as Task[] | undefined) ?? [];

  const createTask = useMutation({
    mutationFn: (body: TaskFormState) => {
      const wire = presetToWire(body);
      return apiFetch(`/operators/${operatorId}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          name: body.name,
          schedule: wire.schedule,
          prompt: body.prompt,
          ...(wire.customSchedule ? { customSchedule: wire.customSchedule } : {}),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "tasks"] });
      setIsAddOpen(false);
      setForm(EMPTY_FORM);
      toast({ title: "Automation created" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const updateTask = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TaskFormState }) => {
      const wire = presetToWire(body);
      return apiFetch(`/operators/${operatorId}/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: body.name,
          schedule: wire.schedule,
          prompt: body.prompt,
          customSchedule: wire.customSchedule ?? "",
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "tasks"] });
      setEditingTask(null);
      setForm(EMPTY_FORM);
      toast({ title: "Automation updated" });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/operators/${operatorId}/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: status === "active" ? "paused" : "active" }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "tasks"] }),
  });

  const runNow = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean; summary: string; durationSec: number }>(
        `/operators/${operatorId}/tasks/${id}/run-now`,
        { method: "POST" },
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "tasks"] });
      toast({
        title: result.ok ? "Task ran" : "Task failed",
        description: `${result.durationSec.toFixed(1)}s — ${result.summary.slice(0, 140)}${result.summary.length > 140 ? "…" : ""}`,
        variant: result.ok ? "default" : "destructive",
      });
    },
    onError: (err: Error) => toast({ title: "Run failed", description: err.message, variant: "destructive" }),
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/operators/${operatorId}/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "tasks"] });
      toast({ title: "Automation removed" });
    },
  });

  const openEdit = (task: Task) => {
    setEditingTask(task);
    const presetFields = wireToPreset(task.schedule, task.customSchedule);
    setForm({
      ...EMPTY_FORM,
      ...presetFields,
      name: task.name,
      prompt: task.prompt,
      advancedExpr: presetFields.preset === "advanced" ? (task.customSchedule ?? "") : "",
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createTask.mutate(form);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    updateTask.mutate({ id: editingTask.id, body: form });
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 bg-white rounded-2xl border border-border/30 p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-4">
        <div>
          <h2 className="headline-lg text-2xl font-bold text-primary flex items-center gap-2">
            <CheckSquare className="w-6 h-6" /> Automations
          </h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">
            Scheduled tasks your operator runs automatically — daily, hourly, or any cron pattern
          </p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setForm(EMPTY_FORM); }}>
          <DialogTrigger asChild>
            <Button className="font-mono font-bold tracking-wider">
              <Plus className="w-4 h-4 mr-2" /> Add automation
            </Button>
          </DialogTrigger>
          <DialogContent className="border-primary/20 bg-card">
            <DialogHeader>
              <DialogTitle className="font-mono text-xl">New automation</DialogTitle>
            </DialogHeader>
            <TaskForm
              form={form}
              setForm={setForm}
              onSubmit={handleCreate}
              submitting={createTask.isPending}
              submitLabel="Create automation"
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editingTask} onOpenChange={(open) => { if (!open) { setEditingTask(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="border-primary/20 bg-card">
          <DialogHeader>
            <DialogTitle className="font-mono text-xl">Edit automation</DialogTitle>
          </DialogHeader>
          <TaskForm
            form={form}
            setForm={setForm}
            onSubmit={handleUpdate}
            submitting={updateTask.isPending}
            submitLabel="Save changes"
          />
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="text-center p-8 font-mono text-muted-foreground animate-pulse">Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center p-16 border border-dashed border-border/50 rounded-lg bg-card/20">
          <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="font-mono text-sm text-muted-foreground">No automations yet.</p>
          <p className="font-mono text-xs text-muted-foreground/60 mt-1">
            Add one to have your operator run tasks automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => {
            const isRunning = runNow.isPending && runNow.variables === task.id;
            return (
              <div
                key={task.id}
                className="border border-border/50 rounded-lg bg-card/20 p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center hover:bg-card/40 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold truncate">{task.name}</span>
                    <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                      <Clock className="w-2.5 h-2.5 mr-1" />
                      {scheduleLabel(task)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`font-mono text-[10px] shrink-0 ${
                        task.status === "active"
                          ? "border-green-500/30 text-green-500 bg-green-500/10"
                          : "border-muted-foreground/30 text-muted-foreground"
                      }`}
                    >
                      {task.status === "active" ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground line-clamp-2">
                    {task.prompt}
                  </p>
                  {task.lastRunAt ? (
                    <div className="space-y-0.5">
                      <p className="font-mono text-[10px] text-primary/70">
                        Last run {format(new Date(task.lastRunAt), "MMM d, yyyy 'at' HH:mm")}
                        {task.lastRunDurationSec ? ` · ${task.lastRunDurationSec.toFixed(0)}s` : ""}
                      </p>
                      {task.lastRunSummary && (
                        <p className="font-mono text-[10px] text-muted-foreground/70 line-clamp-1">
                          {task.lastRunSummary}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="font-mono text-[10px] text-muted-foreground/50">Not yet run</p>
                  )}
                  {task.nextRunAt && task.status === "active" && (
                    <p className="font-mono text-[10px] text-muted-foreground/50">
                      Next run {format(new Date(task.nextRunAt), "MMM d, HH:mm")}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    title="Run now"
                    onClick={() => runNow.mutate(task.id)}
                    disabled={isRunning}
                  >
                    {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    title="Edit"
                    onClick={() => openEdit(task)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    title={task.status === "active" ? "Pause" : "Resume"}
                    onClick={() => toggleStatus.mutate({ id: task.id, status: task.status })}
                  >
                    {task.status === "active" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Delete"
                    onClick={() => deleteTask.mutate(task.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function TaskForm({
  form, setForm, onSubmit, submitting, submitLabel,
}: {
  form: TaskFormState;
  setForm: React.Dispatch<React.SetStateAction<TaskFormState>>;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  submitLabel: string;
}) {
  // Preview line — shows the owner exactly what cron expression will be saved.
  const wire = presetToWire(form);
  const preview = wire.customSchedule
    ? `Saves as: schedule = "cron", expression = "${wire.customSchedule}"`
    : `Saves as: schedule = "${wire.schedule}"`;

  return (
    <form onSubmit={onSubmit} className="space-y-4 mt-2">
      <div className="space-y-2">
        <Label className="font-mono text-xs uppercase text-muted-foreground">Task name</Label>
        <Input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          required
          className="font-mono"
          placeholder="e.g. Daily briefing summary"
        />
      </div>

      <div className="space-y-2">
        <Label className="font-mono text-xs uppercase text-muted-foreground">Schedule</Label>
        <Select
          value={form.preset}
          onValueChange={(v) => setForm(f => ({ ...f, preset: v as PresetMode }))}
        >
          <SelectTrigger className="font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="every_minutes">Every N minutes</SelectItem>
            <SelectItem value="every_hours">Every N hours</SelectItem>
            <SelectItem value="daily">Once per day</SelectItem>
            <SelectItem value="weekly">Once per week</SelectItem>
            <SelectItem value="at_time_daily">Daily at a specific time</SelectItem>
            <SelectItem value="at_time_weekday">Weekly at a specific time</SelectItem>
            <SelectItem value="advanced">Advanced (free-text / cron)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(form.preset === "every_minutes" || form.preset === "every_hours") && (
        <div className="space-y-2">
          <Label className="font-mono text-xs uppercase text-muted-foreground">
            {form.preset === "every_minutes" ? "Minutes between runs" : "Hours between runs"}
          </Label>
          <Input
            type="number"
            min={form.preset === "every_minutes" ? 5 : 1}
            max={form.preset === "every_minutes" ? 59 : 23}
            value={form.intervalN}
            onChange={e => setForm(f => ({ ...f, intervalN: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
            className="font-mono w-32"
          />
          <p className="font-mono text-[11px] text-muted-foreground/70">
            {form.preset === "every_minutes" ? "Minimum 5 minutes." : "1–23 hours."}
          </p>
        </div>
      )}

      {(form.preset === "at_time_daily" || form.preset === "at_time_weekday") && (
        <div className="space-y-2">
          <Label className="font-mono text-xs uppercase text-muted-foreground">Time (UTC, 24-hour)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number" min={0} max={23}
              value={form.timeHH}
              onChange={e => setForm(f => ({ ...f, timeHH: String(Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0))).padStart(2, "0") }))}
              className="font-mono w-20"
            />
            <span className="font-mono">:</span>
            <Input
              type="number" min={0} max={59}
              value={form.timeMM}
              onChange={e => setForm(f => ({ ...f, timeMM: String(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0))).padStart(2, "0") }))}
              className="font-mono w-20"
            />
          </div>
          {form.preset === "at_time_weekday" && (
            <>
              <Label className="font-mono text-xs uppercase text-muted-foreground pt-2 block">Day</Label>
              <Select value={form.weekday} onValueChange={(v) => setForm(f => ({ ...f, weekday: v }))}>
                <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map(d => (
                    <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      )}

      {form.preset === "advanced" && (
        <div className="space-y-2">
          <Label className="font-mono text-xs uppercase text-muted-foreground">Expression</Label>
          <Input
            value={form.advancedExpr}
            onChange={e => setForm(f => ({ ...f, advancedExpr: e.target.value }))}
            required
            className="font-mono"
            placeholder='e.g. "every 15 minutes" or "0 9 * * 1-5"'
          />
          <p className="font-mono text-[11px] text-muted-foreground/70">{ADVANCED_HINT}</p>
        </div>
      )}

      <div className="rounded-md border border-border/30 bg-card/20 px-3 py-1.5 font-mono text-[10px] text-muted-foreground/80">
        {preview}
      </div>

      <div className="space-y-2">
        <Label className="font-mono text-xs uppercase text-muted-foreground">What to do</Label>
        <Textarea
          value={form.prompt}
          onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
          required
          className="font-mono min-h-[100px] resize-none"
          placeholder="Describe what your operator should do when this task runs..."
        />
      </div>

      <Button
        type="submit"
        className="w-full font-mono font-bold"
        disabled={submitting}
      >
        {submitting ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
