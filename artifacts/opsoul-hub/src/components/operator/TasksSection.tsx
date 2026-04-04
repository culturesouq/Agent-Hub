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
import { Plus, Trash2, Play, Pause, CheckSquare, Clock } from "lucide-react";
import { format } from "date-fns";

export default function TasksSection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    schedule: "daily" as "daily" | "weekly" | "custom",
    description: "",
    customSchedule: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["operators", operatorId, "tasks"],
    queryFn: () => apiFetch<{ tasks: Task[] }>(`/operators/${operatorId}/tasks`).then(r => r.tasks ?? []),
  });

  const tasks: Task[] = Array.isArray(data) ? data : (data as any) ?? [];

  const createTask = useMutation({
    mutationFn: (body: any) =>
      apiFetch(`/operators/${operatorId}/tasks`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "tasks"] });
      setIsAddOpen(false);
      setAddForm({ name: "", schedule: "daily", description: "", customSchedule: "" });
      toast({ title: "Automation created" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/operators/${operatorId}/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: status === "active" ? "paused" : "active" }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "tasks"] }),
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/operators/${operatorId}/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "tasks"] });
      toast({ title: "Automation removed" });
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createTask.mutate({
      name: addForm.name,
      schedule: addForm.schedule,
      description: addForm.description,
      customSchedule: addForm.schedule === "custom" ? addForm.customSchedule : undefined,
    });
  };

  const scheduleLabel = (t: Task) => {
    if (t.schedule === "custom") return t.customSchedule || "Custom";
    return t.schedule.charAt(0).toUpperCase() + t.schedule.slice(1);
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 glass-panel rounded-2xl border border-border/30 p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-4">
        <div>
          <h2 className="headline-lg text-2xl font-bold text-primary flex items-center gap-2">
            <CheckSquare className="w-6 h-6" /> Automations
          </h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">
            Scheduled tasks your operator runs automatically
          </p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono font-bold tracking-wider">
              <Plus className="w-4 h-4 mr-2" /> Add automation
            </Button>
          </DialogTrigger>
          <DialogContent className="border-primary/20 bg-card/95 backdrop-blur">
            <DialogHeader>
              <DialogTitle className="font-mono text-xl">New automation</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Task name</Label>
                <Input
                  value={addForm.name}
                  onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                  required
                  className="font-mono"
                  placeholder="e.g. Daily briefing summary"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Schedule</Label>
                <Select
                  value={addForm.schedule}
                  onValueChange={(v) => setAddForm({ ...addForm, schedule: v as any })}
                >
                  <SelectTrigger className="font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {addForm.schedule === "custom" && (
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">Custom schedule</Label>
                  <Input
                    value={addForm.customSchedule}
                    onChange={e => setAddForm({ ...addForm, customSchedule: e.target.value })}
                    className="font-mono"
                    placeholder="e.g. Every Monday at 9am"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase text-muted-foreground">What to do</Label>
                <Textarea
                  value={addForm.description}
                  onChange={e => setAddForm({ ...addForm, description: e.target.value })}
                  required
                  className="font-mono min-h-[100px] resize-none"
                  placeholder="Describe what your operator should do when this task runs..."
                />
              </div>

              <Button
                type="submit"
                className="w-full font-mono font-bold"
                disabled={createTask.isPending}
              >
                {createTask.isPending ? "Creating..." : "Create automation"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
          {tasks.map(task => (
            <div
              key={task.id}
              className="border border-border/50 rounded-lg bg-card/20 p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center hover:bg-card/40 transition-colors"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-bold truncate">{task.name}</span>
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] shrink-0"
                  >
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
                  {task.description}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground/50">
                  Created {format(new Date(task.createdAt!), "MMM d, yyyy")}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title={task.status === "active" ? "Pause" : "Resume"}
                  onClick={() => toggleStatus.mutate({ id: task.id, status: task.status })}
                >
                  {task.status === "active" ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteTask.mutate(task.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
