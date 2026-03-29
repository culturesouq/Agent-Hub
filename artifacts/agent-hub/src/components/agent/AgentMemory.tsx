import { useQueryClient } from "@tanstack/react-query";
import {
  AgentMemory as AgentMemoryType,
  useListMemories,
  useDeleteMemory,
  getListMemoriesQueryKey,
} from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Brain, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface AgentMemoryProps {
  agentId: number;
}

export function AgentMemory({ agentId }: AgentMemoryProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: memories, isLoading } = useListMemories(agentId);

  const deleteMutation = useDeleteMemory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMemoriesQueryKey(agentId) });
      },
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!memories || memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Brain className="w-5 h-5 text-primary/50" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">{t("noMemoriesYet")}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t("noMemoriesHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {memories.map((memory: AgentMemoryType) => (
        <div
          key={memory.id}
          className="group flex items-start gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/8 hover:border-white/15 transition-colors"
        >
          <Brain className="w-4 h-4 text-primary/60 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white leading-relaxed">{memory.content}</p>
            <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono">
              {format(new Date(memory.createdAt), "MMM d, yyyy • HH:mm")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => deleteMutation.mutate({ id: memory.id })}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
