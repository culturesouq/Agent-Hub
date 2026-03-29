import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListGrowthLog, useRevertGrowth, getListGrowthLogQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Loader2, Dna, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  agentId: number;
}

interface GrowthEntry {
  id: number;
  agentId: number;
  field: string;
  oldValue?: string | null;
  newValue: string;
  appliedAt: string;
}

export function AgentGrowth({ agentId }: Props) {
  const { t, dir } = useI18n();
  const queryClient = useQueryClient();
  const { data: entries = [], isLoading } = useListGrowthLog(agentId);
  const { mutateAsync: revert } = useRevertGrowth();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [reverting, setReverting] = useState<Set<number>>(new Set());

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRevert = async (entry: GrowthEntry) => {
    setReverting(prev => new Set(prev).add(entry.id));
    try {
      await revert({ agentId, id: entry.id });
      await queryClient.invalidateQueries({ queryKey: getListGrowthLogQueryKey(agentId) });
    } finally {
      setReverting(prev => { const s = new Set(prev); s.delete(entry.id); return s; });
    }
  };

  const fieldLabel = (field: string) => {
    if (field === "backstory") return t("growthBackstory");
    if (field === "personality") return t("growthPersonality");
    return field;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center" dir={dir}>
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
          <Dna className="w-7 h-7 text-primary/50" />
        </div>
        <p className="text-white font-medium mb-1">{t("growthEmpty")}</p>
        <p className="text-sm text-muted-foreground max-w-sm">{t("growthEmptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" dir={dir}>
      {[...entries].reverse().map((entry: GrowthEntry) => {
        const isOpen = expanded.has(entry.id);
        const isReverting = reverting.has(entry.id);
        return (
          <div
            key={entry.id}
            className="rounded-xl border border-white/8 bg-white/3 overflow-hidden"
          >
            <button
              onClick={() => toggle(entry.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/4 transition-colors"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/15 text-primary shrink-0">
                {fieldLabel(entry.field)}
              </span>
              <span className="flex-1 text-sm text-muted-foreground truncate">
                {entry.newValue}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 me-2">
                {new Date(entry.appliedAt).toLocaleDateString()}
              </span>
              {isOpen
                ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              }
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-3 border-t border-white/8 pt-3">
                    {entry.oldValue && (
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5 font-semibold">
                          {t("growthFrom")}
                        </p>
                        <p className="text-sm text-muted-foreground bg-white/3 rounded-lg px-3 py-2.5 leading-relaxed whitespace-pre-wrap">
                          {entry.oldValue}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-primary mb-1.5 font-semibold">
                        {t("growthTo")}
                      </p>
                      <p className="text-sm text-white bg-primary/8 border border-primary/15 rounded-lg px-3 py-2.5 leading-relaxed whitespace-pre-wrap">
                        {entry.newValue}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-muted-foreground">
                        {t("growthApplied")}: {new Date(entry.appliedAt).toLocaleString()}
                      </span>
                      <button
                        onClick={() => handleRevert(entry)}
                        disabled={isReverting}
                        className="flex items-center gap-1.5 text-[11px] font-medium text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                      >
                        {isReverting
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <RotateCcw className="w-3 h-3" />
                        }
                        {isReverting ? t("growthReverting") : t("growthRevert")}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
