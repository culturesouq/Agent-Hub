import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { KbChunk } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Search, Database, Plus, Trash2, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

export default function KbSection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("owner");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const { data: ownerKb = [], isLoading: ownerLoading } = useQuery({
    queryKey: ["operators", operatorId, "owner-kb"],
    queryFn: () => apiFetch<any>(`/operators/${operatorId}/owner-kb`).then(r => r.entries ?? []),
  });

  const { data: opKb = [], isLoading: opLoading } = useQuery({
    queryKey: ["operators", operatorId, "operator-kb"],
    queryFn: () => apiFetch<any>(`/operators/${operatorId}/operator-kb`).then(r => r.entries ?? []),
  });

  const [addForm, setAddForm] = useState({ content: "", sourceName: "", sourceType: "manual", confidenceScore: 80 });
  const [isAddOpen, setIsAddOpen] = useState(false);

  const addOwnerKb = useMutation({
    mutationFn: (data: any) => apiFetch(`/operators/${operatorId}/owner-kb`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "owner-kb"] });
      setIsAddOpen(false);
      setAddForm({ content: "", sourceName: "", sourceType: "manual", confidenceScore: 80 });
      toast({ title: "Knowledge added" });
    }
  });

  const addOpKb = useMutation({
    mutationFn: (data: any) => apiFetch(`/operators/${operatorId}/operator-kb`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "operator-kb"] });
      setIsAddOpen(false);
      setAddForm({ content: "", sourceName: "", sourceType: "manual", confidenceScore: 80 });
      toast({ title: "Knowledge added" });
    }
  });

  const deleteOwnerKb = useMutation({
    mutationFn: (id: string) => apiFetch(`/operators/${operatorId}/owner-kb/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "owner-kb"] })
  });

  const deleteOpKb = useMutation({
    mutationFn: (id: string) => apiFetch(`/operators/${operatorId}/operator-kb/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "operator-kb"] })
  });

  const verifyOpKb = useMutation({
    mutationFn: ({ id, isVerified }: { id: string, isVerified: boolean }) =>
      apiFetch(`/operators/${operatorId}/operator-kb/${id}`, { method: "PATCH", body: JSON.stringify({ isVerified }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "operator-kb"] })
  });

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await apiFetch<any>(`/operators/${operatorId}/kb/search`, {
        method: "POST", body: JSON.stringify({ query: searchQuery })
      });
      setSearchResults(res.results ?? []);
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === "owner") {
      addOwnerKb.mutate({ content: addForm.content, sourceName: addForm.sourceName || "Manual Entry", sourceType: addForm.sourceType });
    } else {
      addOpKb.mutate({ content: addForm.content, sourceName: addForm.sourceName || "Manual Entry", sourceType: addForm.sourceType, confidenceScore: addForm.confidenceScore });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 glass-panel rounded-2xl border border-border/30 p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-4">
        <div>
          <h2 className="headline-lg text-2xl font-bold text-primary flex items-center gap-2">
            <Database className="w-6 h-6" /> Knowledge
          </h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">What your operator knows and can do</p>
        </div>

        {(activeTab === "owner" || activeTab === "operator") && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="font-mono font-bold tracking-wider">
                <Plus className="w-4 h-4 mr-2" /> Add Knowledge
              </Button>
            </DialogTrigger>
            <DialogContent className="border-primary/20 bg-card/95 backdrop-blur">
              <DialogHeader>
                <DialogTitle className="font-mono text-xl">
                  Add to {activeTab === "owner" ? "Your Facts" : "Learned Knowledge"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">Content</Label>
                  <Textarea
                    value={addForm.content}
                    onChange={e => setAddForm({ ...addForm, content: e.target.value })}
                    required
                    className="font-mono min-h-[120px]"
                    placeholder="Paste or type the knowledge here..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">Source name</Label>
                    <Input
                      value={addForm.sourceName}
                      onChange={e => setAddForm({ ...addForm, sourceName: e.target.value })}
                      className="font-mono"
                      placeholder="e.g. Company handbook"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">Type</Label>
                    <Select value={addForm.sourceType} onValueChange={(val) => setAddForm({ ...addForm, sourceType: val })}>
                      <SelectTrigger className="font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual entry</SelectItem>
                        <SelectItem value="document">Document</SelectItem>
                        <SelectItem value="link">Web link</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {activeTab === "operator" && (
                  <div className="space-y-4 pt-4 border-t border-border/50">
                    <div className="flex justify-between items-center">
                      <Label className="font-mono text-xs uppercase text-muted-foreground">How confident is this?</Label>
                      <span className="font-mono text-sm text-primary font-bold">{addForm.confidenceScore}%</span>
                    </div>
                    <Slider
                      value={[addForm.confidenceScore]}
                      onValueChange={(val) => setAddForm({ ...addForm, confidenceScore: val[0] })}
                      max={100} step={1}
                    />
                  </div>
                )}

                <Button type="submit" className="w-full font-mono font-bold mt-4" disabled={addOwnerKb.isPending || addOpKb.isPending}>
                  Save
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-card/50 border border-border/50 mb-6 h-auto p-1">
          <TabsTrigger value="owner" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Your Facts
          </TabsTrigger>
          <TabsTrigger value="operator" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Learned
          </TabsTrigger>
          <TabsTrigger value="search" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            <Search className="w-3 h-3 mr-1.5" /> Search
          </TabsTrigger>
        </TabsList>

        {/* Your Facts (Owner KB) */}
        <TabsContent value="owner" className="m-0 space-y-4">
          <div className="bg-primary/5 border border-primary/20 rounded p-3 mb-4">
            <p className="font-mono text-xs text-primary/80">
              These are facts you've provided directly. Your operator treats them as absolute truth.
            </p>
          </div>

          {ownerLoading ? (
            <div className="text-center p-8 font-mono text-muted-foreground animate-pulse">Loading...</div>
          ) : ownerKb?.length === 0 ? (
            <div className="text-center p-12 border border-dashed border-border/50 rounded-lg bg-card/20">
              <Database className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="font-mono text-sm text-muted-foreground">No facts added yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ownerKb?.map(chunk => (
                <Card key={chunk.id} className="bg-card/30 border-border/50 hover:border-primary/30 transition-colors flex flex-col">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex justify-between items-start">
                      <Badge variant="outline" className="font-mono text-[10px] bg-background/50">{chunk.sourceType}</Badge>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" onClick={() => deleteOwnerKb.mutate(chunk.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <CardTitle className="font-mono text-sm mt-2">{chunk.sourceName}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex-1">
                    <p className="text-xs text-muted-foreground line-clamp-4 font-mono">{chunk.content}</p>
                  </CardContent>
                  <CardFooter className="p-4 pt-0 text-[10px] text-muted-foreground/50 font-mono border-t border-border/20 mt-2">
                    {format(new Date(chunk.createdAt), 'MMM d, yyyy')}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Learned (Operator KB) */}
        <TabsContent value="operator" className="m-0 space-y-4">
          <div className="bg-secondary/50 border border-secondary-foreground/20 rounded p-3 mb-4">
            <p className="font-mono text-xs text-secondary-foreground/80">
              Things your operator has learned on its own. You can verify facts you trust to promote them.
            </p>
          </div>

          {opLoading ? (
            <div className="text-center p-8 font-mono text-muted-foreground animate-pulse">Loading...</div>
          ) : opKb?.length === 0 ? (
            <div className="text-center p-12 border border-dashed border-border/50 rounded-lg bg-card/20">
              <Database className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="font-mono text-sm text-muted-foreground">Nothing learned yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {opKb?.map(chunk => (
                <Card key={chunk.id} className="bg-card/30 border-border/50 hover:border-secondary-foreground/30 transition-colors flex flex-col">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex justify-between items-start">
                      <div className="flex gap-2">
                        <Badge variant="outline" className={`font-mono text-[10px] ${chunk.confidenceScore && chunk.confidenceScore > 80 ? 'text-green-500 border-green-500/30' : 'text-amber-500 border-amber-500/30'}`}>
                          {chunk.confidenceScore}% sure
                        </Badge>
                        {chunk.isVerified && (
                          <Badge variant="default" className="font-mono text-[10px] bg-primary">
                            <ShieldCheck className="w-3 h-3 mr-1" /> Verified
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {!chunk.isVerified && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-green-500 hover:bg-green-500/10" onClick={() => verifyOpKb.mutate({ id: chunk.id, isVerified: true })} title="Mark as verified">
                            <ShieldCheck className="w-3 h-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteOpKb.mutate(chunk.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <CardTitle className="font-mono text-sm mt-2">{chunk.sourceName}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex-1">
                    <p className="text-xs text-muted-foreground line-clamp-4 font-mono">{chunk.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Search */}
        <TabsContent value="search" className="m-0 space-y-6">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search your operator's knowledge..."
                className="font-mono pl-10 bg-card/50 h-12 text-sm border-primary/20 focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>
            <Button type="submit" disabled={isSearching || !searchQuery.trim()} className="h-12 px-8 font-mono font-bold">
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </form>

          {searchResults.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-mono text-sm font-bold text-primary">Results</h3>
              <div className="space-y-3">
                {searchResults.map((res, i) => (
                  <div key={i} className="p-4 border border-border/50 rounded-lg bg-card/20 relative overflow-hidden group hover:bg-card/40 transition-colors">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/50 group-hover:bg-primary transition-colors" />
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex gap-2 items-center">
                        <Badge variant="outline" className="font-mono text-[10px] border-primary/30 text-primary">
                          {(res.similarity * 100).toFixed(0)}% match
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">{res.sourceName || 'Unknown source'}</span>
                      </div>
                      <Badge variant="secondary" className="font-mono text-[10px] uppercase">{res.sourceType || 'KB'}</Badge>
                    </div>
                    <p className="font-mono text-sm text-foreground/90">{res.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchResults.length === 0 && searchQuery && !isSearching && (
            <div className="text-center p-12 border border-dashed border-border/50 rounded-lg bg-card/20">
              <p className="font-mono text-sm text-muted-foreground">No results found for "{searchQuery}"</p>
            </div>
          )}
        </TabsContent>

      </Tabs>
    </div>
  );
}
