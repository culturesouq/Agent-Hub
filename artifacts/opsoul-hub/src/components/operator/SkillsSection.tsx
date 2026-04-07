import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PlatformSkill, OperatorSkill } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Download, Trash2, Plus } from "lucide-react";
import { format } from "date-fns";

export default function SkillsSection({ operatorId, archetype }: { operatorId: string; archetype: string | string[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlatformSkill, setSelectedPlatformSkill] = useState<PlatformSkill | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSkill, setNewSkill] = useState({
    name: '',
    description: '',
    triggerDescription: '',
    instructions: '',
    outputFormat: '',
  });

  const { data: platformSkills = [], isLoading: platLoading } = useQuery({
    queryKey: ["platform-skills"],
    queryFn: () => apiFetch<any>("/platform-skills").then(r => r.skills ?? []),
  });

  const { data: opSkills = [], isLoading: opLoading } = useQuery({
    queryKey: ["operators", operatorId, "skills"],
    queryFn: () => apiFetch<any>(`/operators/${operatorId}/skills`).then(r => r.skills ?? []),
  });

  const installSkill = useMutation({
    mutationFn: ({ skillId }: { skillId: string }) =>
      apiFetch(`/operators/${operatorId}/skills`, { method: "POST", body: JSON.stringify({ skillId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "skills"], refetchType: 'all' });
      queryClient.refetchQueries({ queryKey: ["operators", operatorId, "skills"] });
      setSelectedPlatformSkill(null);
      toast({ title: "Skill installed" });
    },
  });

  const removeSkill = useMutation({
    mutationFn: (id: string) => apiFetch(`/operators/${operatorId}/skills/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "skills"] });
      toast({ title: "Skill removed" });
    },
  });

  const createSkill = useMutation({
    mutationFn: (data: typeof newSkill) =>
      apiFetch(`/platform-skills`, {
        method: "POST",
        body: JSON.stringify({ ...data, archetype }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-skills"] });
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "skills"] });
      setShowCreateDialog(false);
      setNewSkill({ name: '', description: '', triggerDescription: '', instructions: '', outputFormat: '' });
      toast({ title: "Skill created and ready to install" });
    },
  });

  const filteredSkills = showAll
    ? platformSkills
    : platformSkills.filter((s: PlatformSkill) => {
        const archetypes = Array.isArray(archetype) ? archetype : [archetype];
        return archetypes.includes(s.archetype) || s.archetype === 'All';
      });

  const isInstalled = (platformId: string) => opSkills?.some((s: OperatorSkill) => s.skillId === platformId);

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 glass-panel rounded-2xl border border-border/30 p-6">
      <div className="flex items-center gap-2 border-b border-border/50 pb-4">
        <Download className="w-5 h-5 text-primary" />
        <div>
          <h2 className="font-headline font-bold text-lg text-primary">Skills</h2>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">Extend what your operator can do</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[400px]">
        {/* Available */}
        <div className="flex flex-col border border-border/50 rounded-lg bg-card/20 overflow-hidden">
          <div className="p-3 bg-card/50 border-b border-border/50 flex items-center justify-between">
            <div>
              <h3 className="font-headline text-sm font-bold">Available Skills</h3>
              <p className="font-mono text-xs text-muted-foreground mt-0.5">Skills you can add to your operator</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAll(v => !v)}
                className="font-mono text-xs text-primary/60 hover:text-primary underline underline-offset-2"
              >
                {showAll ? 'Relevant only' : 'Show all'}
              </button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 font-mono text-xs border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="w-3 h-3 mr-1" /> Create
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {platLoading ? (
              <div className="text-center font-mono text-xs text-muted-foreground animate-pulse mt-4">Loading...</div>
            ) : filteredSkills?.length === 0 ? (
              <div className="text-center font-mono text-xs text-muted-foreground mt-4">No skills available</div>
            ) : (
              filteredSkills?.map((skill: PlatformSkill) => (
                <div key={skill.id} className="p-3 border border-border/50 rounded bg-background/50 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-mono text-sm font-bold text-primary">{skill.name}</div>
                    </div>
                    {isInstalled(skill.id) ? (
                      <Badge variant="default" className="font-mono text-[10px] bg-primary/20 text-primary border-primary/30">Installed</Badge>
                    ) : (
                      <Button variant="outline" size="sm" className="h-7 font-mono text-xs border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground" onClick={() => setSelectedPlatformSkill(skill)}>
                        <Download className="w-3 h-3 mr-1" /> Add
                      </Button>
                    )}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground line-clamp-2">{skill.description}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Installed */}
        <div className="flex flex-col border border-border/50 rounded-lg bg-card/20 overflow-hidden">
          <div className="p-3 bg-primary/10 border-b border-primary/20">
            <h3 className="font-headline text-sm font-bold text-primary">Installed Skills</h3>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">Active on your operator right now</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {opLoading ? (
              <div className="text-center font-mono text-xs text-primary animate-pulse mt-4">Loading...</div>
            ) : opSkills?.length === 0 ? (
              <div className="text-center p-8 border border-dashed border-border/50 rounded text-muted-foreground font-mono text-sm">
                No skills installed yet.
              </div>
            ) : (
              opSkills?.map((skill: OperatorSkill) => (
                <div key={skill.id} className="p-3 border border-primary/30 rounded bg-primary/5 flex flex-col gap-2 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                  <div className="flex justify-between items-start pl-2">
                    <div>
                      <div className="font-mono text-sm font-bold">{skill.skillName}</div>
                      <Badge variant="outline" className="font-mono text-[9px] mt-1 border-primary/20 text-primary/80">{skill.isActive ? 'Active' : 'Inactive'}</Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeSkill.mutate(skill.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground pl-2 border-t border-border/30 pt-2 flex justify-between">
                    <span>{skill.customInstructions ? 'Custom instructions set' : 'Default instructions'}</span>
                    <span>Added {format(new Date(skill.installedAt), 'MMM d, yyyy')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-xl text-primary">Create Custom Skill</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="font-mono text-xs text-muted-foreground">Skill Name *</Label>
              <Input
                className="font-mono text-sm mt-1 bg-background/50 border-border/50"
                placeholder="e.g. Competitor Analysis"
                value={newSkill.name}
                onChange={e => setNewSkill(s => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div>
              <Label className="font-mono text-xs text-muted-foreground">Description *</Label>
              <Input
                className="font-mono text-sm mt-1 bg-background/50 border-border/50"
                placeholder="One line — what this skill does"
                value={newSkill.description}
                onChange={e => setNewSkill(s => ({ ...s, description: e.target.value }))}
              />
            </div>
            <div>
              <Label className="font-mono text-xs text-muted-foreground">When to trigger</Label>
              <Input
                className="font-mono text-sm mt-1 bg-background/50 border-border/50"
                placeholder="e.g. user asks about competitors or market analysis"
                value={newSkill.triggerDescription}
                onChange={e => setNewSkill(s => ({ ...s, triggerDescription: e.target.value }))}
              />
            </div>
            <div>
              <Label className="font-mono text-xs text-muted-foreground">Instructions *</Label>
              <Textarea
                className="font-mono text-sm mt-1 bg-background/50 border-border/50 min-h-[100px]"
                placeholder="What should the operator do when this skill fires? Be specific."
                value={newSkill.instructions}
                onChange={e => setNewSkill(s => ({ ...s, instructions: e.target.value }))}
              />
            </div>
            <div>
              <Label className="font-mono text-xs text-muted-foreground">Output Format</Label>
              <Input
                className="font-mono text-sm mt-1 bg-background/50 border-border/50"
                placeholder="e.g. Three competitors → strengths → gaps"
                value={newSkill.outputFormat}
                onChange={e => setNewSkill(s => ({ ...s, outputFormat: e.target.value }))}
              />
            </div>
            <Button
              className="w-full font-mono font-bold mt-2"
              onClick={() => createSkill.mutate(newSkill)}
              disabled={createSkill.isPending || !newSkill.name || !newSkill.description || !newSkill.instructions}
            >
              {createSkill.isPending ? 'Creating...' : 'Create Skill'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedPlatformSkill} onOpenChange={(open) => !open && setSelectedPlatformSkill(null)}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur">
          <DialogHeader>
            <DialogTitle className="font-mono text-xl text-primary">Install {selectedPlatformSkill?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="font-mono text-sm text-muted-foreground">{selectedPlatformSkill?.description}</p>
            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded">
              <p className="font-mono text-xs text-amber-500">Make sure any required connections are set up in Integrations before installing.</p>
            </div>
            <Button className="w-full font-mono font-bold mt-4" onClick={() => {
              if (selectedPlatformSkill) installSkill.mutate({ skillId: selectedPlatformSkill.id });
            }} disabled={installSkill.isPending}>
              Install
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
