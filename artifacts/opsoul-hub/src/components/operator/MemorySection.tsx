import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Memory } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Brain, Plus, Trash2, Zap, ArrowDownToLine, Search } from "lucide-react";
import { format } from "date-fns";

export default function MemorySection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [addForm, setAddForm] = useState({ content: "", memoryType: "fact", weight: 0.5 });

  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["operators", operatorId, "memory"],
    queryFn: () => apiFetch<any>(`/operators/${operatorId}/memory`).then(r => r.memories ?? []),
  });

  const addMemory = useMutation({
    mutationFn: (data: any) => apiFetch(`/operators/${operatorId}/memory`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "memory"] });
      setIsAddOpen(false);
      setAddForm({ content: "", memoryType: "fact", weight: 0.5 });
      toast({ title: "Memory saved" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    }
  });

  const deleteMemory = useMutation({
    mutationFn: (id: string) => apiFetch(`/operators/${operatorId}/memory/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "memory"] })
  });

  const distillMemory = useMutation({
    mutationFn: () => apiFetch<{ count: number }>(`/operators/${operatorId}/memory/distill`, { method: "POST" }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "memory"] });
      toast({ title: "Memories summarized", description: `Summarized ${res.count} memory items.` });
    }
  });

  const runDecay = useMutation({
    mutationFn: () => apiFetch<{ archivedCount: number }>(`/operators/${operatorId}/memory/decay`, { method: "POST" }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "memory"] });
      toast({ title: "Old memories archived", description: `Archived ${res.archivedCount} memories.` });
    }
  });

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'fact':        return 'border-blue-500/30 text-blue-600 bg-blue-500/10';
      case 'preference':  return 'border-pink-500/30 text-pink-600 bg-pink-500/10';
      case 'interaction': return 'border-amber-500/30 text-amber-600 bg-amber-500/10';
      case 'pattern':     return 'border-purple-500/30 text-purple-600 bg-purple-500/10';
      case 'context':     return 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10';
      default:            return 'border-border/50 text-foreground bg-background';
    }
  };

  const filteredMemories = memories?.filter((m: Memory) => !m.archivedAt && (searchQuery === "" || m.content.toLowerCase().includes(searchQuery.toLowerCase())));
  const archivedMemories = memories?.filter((m: Memory) => m.archivedAt);

  return (
    <div className="space-y-6 bg-white p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6" /> Memory
          </h2>
          <p className="text-sm text-muted-foreground mt-1">What your operator remembers across conversations</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => runDecay.mutate()} disabled={runDecay.isPending}>
            <ArrowDownToLine className="w-4 h-4 mr-2" /> Archive old
          </Button>
          <Button variant="outline" size="sm" onClick={() => distillMemory.mutate()} disabled={distillMemory.isPending}>
            <Zap className="w-4 h-4 mr-2" /> Summarize
          </Button>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" /> Add memory
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a new memory</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!addForm.content.trim()) {
                    toast({ title: "Content required", description: "Please enter something to remember", variant: "destructive" });
                    return;
                  }
                  addMemory.mutate(addForm);
                }} className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Content</Label>
                  <Textarea
                    value={addForm.content}
                    onChange={e => setAddForm({...addForm, content: e.target.value})}
                    placeholder="What should your operator remember?"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Memory type</Label>
                  <Select value={addForm.memoryType} onValueChange={(val) => setAddForm({...addForm, memoryType: val})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fact">Fact</SelectItem>
                      <SelectItem value="preference">Preference</SelectItem>
                      <SelectItem value="interaction">Interaction</SelectItem>
                      <SelectItem value="pattern">Pattern</SelectItem>
                      <SelectItem value="context">Context</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-muted-foreground">Importance</Label>
                    <span className="text-sm font-bold text-primary">{Math.round(addForm.weight * 100)}%</span>
                  </div>
                  <Slider
                    value={[addForm.weight]}
                    onValueChange={(val) => setAddForm({...addForm, weight: val[0]})}
                    max={1} step={0.05}
                  />
                </div>
                <Button type="submit" className="w-full font-bold mt-4" disabled={addMemory.isPending}>
                  Save memory
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-2 max-w-md">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Filter memories..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-8 animate-pulse">Loading...</div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredMemories?.length === 0 ? (
              <div className="col-span-full text-center text-sm text-muted-foreground py-8 border border-dashed border-border/50 rounded-lg">
                No memories match the filter.
              </div>
            ) : (
              filteredMemories?.map((mem: Memory) => (
                <div key={mem.id} className="border rounded-lg p-3 flex flex-col gap-2 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] ${getTypeColor(mem.memoryType)}`}>
                        {mem.memoryType}
                      </Badge>
                      {mem.scopeLabel && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {mem.scopeLabel}
                        </Badge>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive" onClick={() => deleteMemory.mutate(mem.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-foreground/90">{mem.content}</p>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                    <span>{format(new Date(mem.createdAt), 'MMM d, HH:mm')}</span>
                    <span>Weight {Math.round(mem.weight * 100)}%</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {archivedMemories && archivedMemories.length > 0 && (
            <div className="pt-6 border-t">
              <h3 className="text-sm font-bold text-muted-foreground mb-3">Archived memories</h3>
              <div className="flex flex-wrap gap-2 opacity-60">
                {archivedMemories.map((mem: Memory) => (
                  <div key={mem.id} className="text-[10px] border border-border/30 px-2 py-1 rounded bg-background line-clamp-1 max-w-[220px]" title={mem.content}>
                    {mem.content}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
