import { Agent, useListInstructions, useAddInstruction, useDeleteInstruction, getListInstructionsQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Terminal, Plus, Trash2 } from "lucide-react";

export function AgentInstructions({ agent }: { agent: Agent }) {
  const { t } = useI18n();
  const { data: instructions } = useListInstructions(agent.id);
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState("");

  const addMutation = useAddInstruction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInstructionsQueryKey(agent.id) });
        setIsOpen(false);
        setContent("");
      }
    }
  });

  const deleteMutation = useDeleteInstruction({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInstructionsQueryKey(agent.id) })
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content) return;
    addMutation.mutate({ agentId: agent.id, data: { content } });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-display text-white flex items-center">
          <Terminal className="w-5 h-5 me-2 text-primary" /> {t('instructions')}
        </h3>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-white/10 hover:bg-primary text-white border border-white/10">
              <Plus className="w-4 h-4 me-2" /> {t('addInstruction')}
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-white/10">
            <DialogHeader>
              <DialogTitle className="font-display">{t('addInstruction')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-xs font-mono text-muted-foreground uppercase">{t('content')}</label>
                <Textarea 
                  value={content} 
                  onChange={e => setContent(e.target.value)} 
                  className="bg-black/50 border-white/10 min-h-[100px] font-mono text-sm" 
                  placeholder="ALWAYS_RESPOND_WITH_..."
                  required 
                />
              </div>
              <Button type="submit" className="w-full bg-primary font-bold tracking-wider" disabled={!content || addMutation.isPending}>
                {t('save')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {instructions?.map((inst, i) => (
          <div key={inst.id} className="glass-panel p-4 rounded-xl border border-white/5 group relative overflow-hidden">
            <div className="absolute top-0 start-0 w-1 h-full bg-primary/50" />
            <div className="flex justify-between items-start ps-3">
              <div>
                <span className="text-[10px] text-primary font-mono tracking-widest uppercase block mb-2">DIRECTIVE_{i.toString().padStart(3, '0')}</span>
                <p className="text-white/90 font-mono text-sm whitespace-pre-wrap">{inst.content}</p>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => deleteMutation.mutate({ agentId: agent.id, id: inst.id })}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
        {instructions?.length === 0 && (
          <div className="text-center py-12 border border-white/5 border-dashed rounded-2xl">
            <p className="text-muted-foreground font-mono text-sm">{t('noData')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
