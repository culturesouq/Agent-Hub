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
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
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
      case 'fact': return 'border-blue-500/30 text-blue-500 bg-blue-500/10';
      case 'preference': return 'border-pink-500/30 text-pink-500 bg-pink-500/10';
      case 'pattern': return 'border-purple-500/30 text-purple-500 bg-purple-500/10';
      case 'instruction': return 'border-amber-500/30 text-amber-500 bg-amber-500/10';
      default: return 'border-border/50 text-foreground bg-background';
    }
  };

  const filteredMemories = memories?.filter(m => !m.archivedAt && (searchQuery === "" || m.content.toLowerCase().includes(searchQuery.toLowerCase())));
  const archivedMemories = memories?.filter(m => m.archivedAt);

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-4">
        <div>
          <h2 className="text-2xl font-bold font-mono tracking-tight text-primary flex items-center gap-2">
            <Brain className="w-6 h-6" /> Memory
          </h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">What your assistant remembers across conversations</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => runDecay.mutate()} disabled={runDecay.isPending} className="font-mono text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10">
            <ArrowDownToLine className="w-4 h-4 mr-2" /> Archive old memories
          </Button>
          <Button variant="outline" onClick={() => distillMemory.mutate()} disabled={distillMemory.isPending} className="font-mono text-xs border-purple-500/30 text-purple-500 hover:bg-purple-500/10">
            <Zap className="w-4 h-4 mr-2" /> Summarize memories
          </Button>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="font-mono font-bold text-xs tracking-wider">
                <Plus className="w-4 h-4 mr-2" /> Add memory
              </Button>
            </DialogTrigger>
            <DialogContent className="border-primary/20 bg-card/95 backdrop-blur">
              <DialogHeader>
                <DialogTitle className="font-mono text-xl">Add a new memory</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addMemory.mutate(addForm); }} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">Content</Label>
                  <Textarea 
                    value={addForm.content} 
                    onChange={e => setAddForm({...addForm, content: e.target.value})} 
                    required 
                    className="font-mono" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">Memory type</Label>
                  <Select value={addForm.memoryType} onValueChange={(val) => setAddForm({...addForm, memoryType: val})}>
                    <SelectTrigger className="font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fact">Fact</SelectItem>
                      <SelectItem value="preference">Preference</SelectItem>
                      <SelectItem value="pattern">Pattern</SelectItem>
                      <SelectItem value="instruction">Instruction</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-4 pt-2">
                  <div className="flex justify-between items-center">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">Importance</Label>
                    <span className="font-mono text-sm text-primary font-bold">{addForm.weight.toFixed(2)}</span>
                  </div>
                  <Slider 
                    value={[addForm.weight]} 
                    onValueChange={(val) => setAddForm({...addForm, weight: val[0]})} 
                    max={1} step={0.05}
                  />
                </div>
                <Button type="submit" className="w-full font-mono font-bold mt-4" disabled={addMemory.isPending}>
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
          className="font-mono h-8 bg-background/50 border-border/50 text-xs"
        />
      </div>

      {isLoading ? (
        <div className="text-center p-8 font-mono text-primary animate-pulse">Loading...</div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMemories?.length === 0 ? (
              <div className="col-span-full text-center p-8 border border-dashed border-border/50 rounded-lg text-muted-foreground font-mono text-sm">
                No memories match the filter.
              </div>
            ) : (
              filteredMemories?.map(mem => (
                <Card key={mem.id} className="bg-card/30 border-border/50 flex flex-col relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/20" style={{ opacity: mem.weight }} />
                  <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between space-y-0">
                    <Badge variant="outline" className={`font-mono text-[9px] uppercase tracking-widest ${getTypeColor(mem.memoryType)}`}>
                      {mem.memoryType}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive" onClick={() => deleteMemory.mutate(mem.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </CardHeader>
                  <CardContent className="p-3 pt-2 flex-1">
                    <p className="text-sm font-mono text-foreground/90">{mem.content}</p>
                  </CardContent>
                  <CardFooter className="p-3 pt-0 border-t border-border/20 mt-2 flex justify-between items-center">
                    <div className="text-[10px] font-mono text-muted-foreground">{format(new Date(mem.createdAt), 'MM/dd HH:mm')}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-primary/60">Weight: {mem.weight.toFixed(2)}</span>
                      <div className="w-16 h-1 bg-background rounded overflow-hidden border border-border/30">
                        <div className="h-full bg-primary" style={{ width: `${mem.weight * 100}%` }} />
                      </div>
                    </div>
                  </CardFooter>
                </Card>
              ))
            )}
          </div>

          {archivedMemories && archivedMemories.length > 0 && (
            <div className="pt-6 border-t border-border/50">
              <h3 className="font-mono text-sm font-bold text-muted-foreground mb-4">Archived memories</h3>
              <div className="flex flex-wrap gap-2 opacity-50">
                {archivedMemories.map(mem => (
                  <div key={mem.id} className="text-[10px] font-mono border border-border/30 px-2 py-1 rounded bg-background line-clamp-1 max-w-[200px]" title={mem.content}>
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
