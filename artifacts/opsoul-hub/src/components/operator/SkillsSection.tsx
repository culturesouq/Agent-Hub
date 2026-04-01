import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PlatformSkill, OperatorSkill } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Trash2 } from "lucide-react";
import { format } from "date-fns";

export default function SkillsSection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlatformSkill, setSelectedPlatformSkill] = useState<PlatformSkill | null>(null);

  const { data: platformSkills, isLoading: platLoading } = useQuery({
    queryKey: ["platform-skills"],
    queryFn: () => apiFetch<PlatformSkill[]>("/platform-skills"),
  });

  const { data: opSkills, isLoading: opLoading } = useQuery({
    queryKey: ["operators", operatorId, "skills"],
    queryFn: () => apiFetch<OperatorSkill[]>(`/operators/${operatorId}/skills`),
  });

  const installSkill = useMutation({
    mutationFn: ({ skillId, config }: { skillId: string; config?: any }) =>
      apiFetch(`/operators/${operatorId}/skills`, { method: "POST", body: JSON.stringify({ platformSkillId: skillId, config }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "skills"] });
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

  const isInstalled = (platformId: string) => opSkills?.some(s => s.platformSkillId === platformId);

  return (
    <div className="space-y-6 pt-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[400px]">
        {/* Available */}
        <div className="flex flex-col border border-border/50 rounded-lg bg-card/20 overflow-hidden">
          <div className="p-3 bg-card/50 border-b border-border/50">
            <h3 className="font-mono text-sm font-bold">Available Skills</h3>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">Skills you can add to your operator</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {platLoading ? (
              <div className="text-center font-mono text-xs text-muted-foreground animate-pulse mt-4">Loading...</div>
            ) : platformSkills?.length === 0 ? (
              <div className="text-center font-mono text-xs text-muted-foreground mt-4">No skills available</div>
            ) : (
              platformSkills?.map(skill => (
                <div key={skill.id} className="p-3 border border-border/50 rounded bg-background/50 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-mono text-sm font-bold text-primary">{skill.name}</div>
                      <Badge variant="outline" className="font-mono text-[9px] mt-1 bg-card/50">{skill.category}</Badge>
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
            <h3 className="font-mono text-sm font-bold text-primary">Installed Skills</h3>
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
              opSkills?.map(skill => (
                <div key={skill.id} className="p-3 border border-primary/30 rounded bg-primary/5 flex flex-col gap-2 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                  <div className="flex justify-between items-start pl-2">
                    <div>
                      <div className="font-mono text-sm font-bold">{skill.name}</div>
                      <Badge variant="outline" className="font-mono text-[9px] mt-1 border-primary/20 text-primary/80">{skill.category}</Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeSkill.mutate(skill.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground pl-2 border-t border-border/30 pt-2 flex justify-between">
                    <span>{Object.keys(skill.config || {}).length} configured</span>
                    <span>Added {format(new Date(skill.installedAt), 'MMM d, yyyy')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

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
