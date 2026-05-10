import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PlatformSkill, OperatorSkill, SkillManifest, BuiltinSkillCard, SpecialtySkillCard } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Download, Trash2, Plus, Sparkles, Search, Layers } from "lucide-react";
import { format } from "date-fns";

const CATEGORY_COLORS: Record<string, string> = {
  research:    "bg-blue-500/10 text-blue-600 border-blue-500/30",
  workspace:   "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  integration: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  automation:  "bg-amber-500/10 text-amber-600 border-amber-500/30",
};

export default function SkillsSection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlatformSkill, setSelectedPlatformSkill] = useState<PlatformSkill | null>(null);
  const [showBrowse, setShowBrowse] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSkill, setNewSkill] = useState({
    name: '',
    description: '',
    triggerDescription: '',
    instructions: '',
    outputFormat: '',
  });

  const { data: manifest, isLoading: manifestLoading } = useQuery<SkillManifest>({
    queryKey: ["operators", operatorId, "skills", "manifest"],
    queryFn: () => apiFetch<SkillManifest>(`/operators/${operatorId}/skills/manifest`),
  });

  const { data: platformSkills = [] } = useQuery({
    queryKey: ["platform-skills"],
    queryFn: () => apiFetch<{ skills: PlatformSkill[] }>("/platform-skills").then(r => r.skills ?? []),
    enabled: showBrowse,
  });

  const installSkill = useMutation({
    mutationFn: ({ skillId }: { skillId: string }) =>
      apiFetch(`/operators/${operatorId}/skills`, { method: "POST", body: JSON.stringify({ skillId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "skills"] });
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "skills", "manifest"] });
      setSelectedPlatformSkill(null);
      toast({ title: "Skill added" });
    },
  });

  const removeSkill = useMutation({
    mutationFn: (id: string) => apiFetch(`/operators/${operatorId}/skills/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "skills"] });
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "skills", "manifest"] });
      toast({ title: "Skill removed" });
    },
  });

  const createSkill = useMutation({
    mutationFn: (data: typeof newSkill) =>
      apiFetch(`/platform-skills`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-skills"] });
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "skills", "manifest"] });
      setShowCreateDialog(false);
      setNewSkill({ name: '', description: '', triggerDescription: '', instructions: '', outputFormat: '' });
      toast({ title: "Skill created" });
    },
  });

  const isInstalled = (platformId: string) =>
    manifest?.custom?.some((s) => s.skillId === platformId) ?? false;

  const builtin: BuiltinSkillCard[] = manifest?.builtin ?? [];
  const specialtySkills: SpecialtySkillCard[] = manifest?.specialty ?? [];
  const customSkills: OperatorSkill[] = manifest?.custom ?? [];

  return (
    <div className="space-y-6 bg-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <div>
            <h2 className="font-bold text-lg text-primary">Skills</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Everything your operator can do</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBrowse(true)}>
            <Search className="w-3 h-3 mr-1" /> Browse library
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-3 h-3 mr-1" /> Create skill
          </Button>
        </div>
      </div>

      {manifestLoading ? (
        <div className="text-center text-sm text-muted-foreground py-8 animate-pulse">Loading...</div>
      ) : (
        <>
          {/* Built-in capabilities */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground">Built-in capabilities</h3>
              <span className="text-xs text-muted-foreground">Every operator gets these</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {builtin.map((s) => (
                <div key={s.name} className="p-3 border border-border/50 rounded-lg bg-card/30 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-foreground">{s.name}</span>
                    <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[s.category] ?? ''}`}>
                      {s.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Specialty skills (operator-specific, derived backend-side) */}
          {specialtySkills.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary/70" />
                  Specialty skills
                </h3>
                <span className="text-xs text-muted-foreground">Comes with your operator</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {specialtySkills.map((s) => (
                  <div key={s.skillId} className="p-3 border border-border/50 rounded-lg bg-card/20 flex flex-col gap-1">
                    <span className="text-sm font-bold text-foreground">{s.name}</span>
                    {s.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{s.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom (owner-added) skills */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground">Added by you</h3>
              <span className="text-xs text-muted-foreground">{customSkills.length} custom {customSkills.length === 1 ? 'skill' : 'skills'}</span>
            </div>
            {customSkills.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground p-6 border border-dashed border-border/50 rounded-lg bg-card/10">
                No custom skills yet. Browse the library or create your own.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {customSkills.map((skill) => (
                  <div key={skill.id} className="p-3 border border-primary/30 rounded-lg bg-primary/5 flex flex-col gap-1.5 relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                    <div className="flex justify-between items-start pl-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold text-foreground">{skill.skillName}</span>
                        <Badge variant="outline" className="text-[10px] ml-2 border-primary/20 text-primary/80">
                          {skill.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeSkill.mutate(skill.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    {skill.skillDescription && (
                      <p className="pl-2 text-xs text-muted-foreground line-clamp-2">{skill.skillDescription}</p>
                    )}
                    <div className="pl-2 text-[10px] text-muted-foreground border-t border-border/30 pt-2 flex justify-between">
                      <span>{skill.customInstructions ? 'Custom instructions' : 'Default instructions'}</span>
                      <span>Added {format(new Date(skill.installedAt), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Browse library dialog */}
      <Dialog open={showBrowse} onOpenChange={setShowBrowse}>
        <DialogContent className="bg-card max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Skill library</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <p className="text-xs text-muted-foreground">
              Add any skill from the platform catalog to your operator.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 py-2">
            {platformSkills.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8">No skills available.</div>
            ) : (
              platformSkills.map((skill: PlatformSkill) => (
                <div key={skill.id} className="p-3 border border-border/50 rounded-lg bg-background/50 flex flex-col gap-1.5">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-bold text-foreground">{skill.name}</span>
                    {isInstalled(skill.id) ? (
                      <Badge variant="default" className="text-[10px] bg-primary/20 text-primary border-primary/30">
                        Added
                      </Badge>
                    ) : (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedPlatformSkill(skill)}>
                        <Download className="w-3 h-3 mr-1" /> Add
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{skill.description}</p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create custom skill dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-card max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a custom skill</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Skill name *</Label>
              <Input
                className="mt-1 bg-background/50"
                placeholder="e.g. Competitor Analysis"
                value={newSkill.name}
                onChange={e => setNewSkill(s => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description *</Label>
              <Input
                className="mt-1 bg-background/50"
                placeholder="One line — what this skill does"
                value={newSkill.description}
                onChange={e => setNewSkill(s => ({ ...s, description: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">When to trigger</Label>
              <Input
                className="mt-1 bg-background/50"
                placeholder="e.g. user asks about competitors or market analysis"
                value={newSkill.triggerDescription}
                onChange={e => setNewSkill(s => ({ ...s, triggerDescription: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Instructions *</Label>
              <Textarea
                className="mt-1 bg-background/50 min-h-[100px]"
                placeholder="What should the operator do when this skill fires? Be specific."
                value={newSkill.instructions}
                onChange={e => setNewSkill(s => ({ ...s, instructions: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Output format</Label>
              <Input
                className="mt-1 bg-background/50"
                placeholder="e.g. Three competitors → strengths → gaps"
                value={newSkill.outputFormat}
                onChange={e => setNewSkill(s => ({ ...s, outputFormat: e.target.value }))}
              />
            </div>
            <Button
              className="w-full font-bold"
              onClick={() => createSkill.mutate(newSkill)}
              disabled={createSkill.isPending || !newSkill.name || !newSkill.description || !newSkill.instructions}
            >
              {createSkill.isPending ? 'Creating...' : 'Create skill'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm install dialog */}
      <Dialog open={!!selectedPlatformSkill} onOpenChange={(open) => !open && setSelectedPlatformSkill(null)}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>Add {selectedPlatformSkill?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">{selectedPlatformSkill?.description}</p>
            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                If this skill needs an integration (Google, GitHub, etc.), set it up in Integrations first.
              </p>
            </div>
            <Button
              className="w-full font-bold"
              onClick={() => {
                if (selectedPlatformSkill) installSkill.mutate({ skillId: selectedPlatformSkill.id });
              }}
              disabled={installSkill.isPending}
            >
              {installSkill.isPending ? 'Adding...' : 'Add to operator'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
