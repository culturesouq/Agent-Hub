import { useState } from "react";
import {
  useListTools,
  useCreateTool,
  useUpdateTool,
  useDeleteTool,
  getListToolsQueryKey,
  type AgentTool,
} from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Wrench, Plus, Trash2, Pencil, ChevronDown, ChevronUp, X } from "lucide-react";

interface ToolParam {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
}

interface ToolFormState {
  name: string;
  description: string;
  webhookUrl: string;
  params: ToolParam[];
}

const EMPTY_FORM: ToolFormState = {
  name: "",
  description: "",
  webhookUrl: "",
  params: [],
};

const TYPE_OPTIONS: ToolParam["type"][] = ["string", "number", "boolean"];

function ToolForm({
  initial,
  onSubmit,
  isPending,
  submitLabel,
}: {
  initial: ToolFormState;
  onSubmit: (data: ToolFormState) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<ToolFormState>(initial);
  const [showParams, setShowParams] = useState(initial.params.length > 0);

  const addParam = () => {
    setForm(f => ({
      ...f,
      params: [...f.params, { name: "", type: "string", description: "", required: false }],
    }));
    setShowParams(true);
  };

  const updateParam = (i: number, patch: Partial<ToolParam>) => {
    setForm(f => {
      const params = [...f.params];
      params[i] = { ...params[i], ...patch };
      return { ...f, params };
    });
  };

  const removeParam = (i: number) => {
    setForm(f => ({ ...f, params: f.params.filter((_, idx) => idx !== i) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <label className="text-xs font-mono text-muted-foreground uppercase">{t("toolName")}</label>
        <Input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="bg-black/50 border-white/10 font-mono"
          placeholder="get_weather"
          required
        />
        <p className="text-[11px] text-muted-foreground">{t("toolNameHint")}</p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-mono text-muted-foreground uppercase">{t("toolDescription")}</label>
        <Textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          className="bg-black/50 border-white/10 min-h-[72px] text-sm"
          placeholder={t("toolDescriptionPlaceholder")}
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-mono text-muted-foreground uppercase">{t("webhookUrl")}</label>
        <Input
          value={form.webhookUrl}
          onChange={e => setForm(f => ({ ...f, webhookUrl: e.target.value }))}
          className="bg-black/50 border-white/10 font-mono text-sm"
          placeholder="https://your-api.com/webhook"
          type="url"
          required
        />
        <p className="text-[11px] text-muted-foreground">{t("webhookUrlHint")}</p>
      </div>

      <div className="border border-white/10 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowParams(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-white/80 hover:bg-white/5 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground uppercase">{t("parameters")}</span>
            {form.params.length > 0 && (
              <span className="text-[10px] bg-primary/20 text-primary rounded-full px-1.5 py-0.5 font-mono">
                {form.params.length}
              </span>
            )}
          </span>
          {showParams ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {showParams && (
          <div className="border-t border-white/10 p-4 space-y-3">
            {form.params.map((param, i) => (
              <div key={i} className="bg-black/30 rounded-lg p-3 space-y-2 relative">
                <button
                  type="button"
                  onClick={() => removeParam(i)}
                  className="absolute top-2 end-2 text-muted-foreground hover:text-destructive"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase font-mono block mb-1">{t("paramName")}</label>
                    <Input
                      value={param.name}
                      onChange={e => updateParam(i, { name: e.target.value })}
                      className="bg-black/50 border-white/10 font-mono text-xs h-8"
                      placeholder="city"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase font-mono block mb-1">{t("paramType")}</label>
                    <select
                      value={param.type}
                      onChange={e => updateParam(i, { type: e.target.value as ToolParam["type"] })}
                      className="w-full h-8 bg-black/50 border border-white/10 rounded-md px-2 text-xs font-mono text-white"
                    >
                      {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase font-mono block mb-1">{t("paramDescription")}</label>
                  <Input
                    value={param.description}
                    onChange={e => updateParam(i, { description: e.target.value })}
                    className="bg-black/50 border-white/10 text-xs h-8"
                    placeholder={t("paramDescriptionPlaceholder")}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={param.required}
                    onChange={e => updateParam(i, { required: e.target.checked })}
                    className="rounded border-white/20 bg-black/50"
                  />
                  {t("required")}
                </label>
              </div>
            ))}
            <Button
              type="button"
              onClick={addParam}
              variant="ghost"
              size="sm"
              className="w-full border border-dashed border-white/10 text-muted-foreground hover:text-white hover:border-white/20"
            >
              <Plus className="w-3.5 h-3.5 me-1.5" /> {t("addParameter")}
            </Button>
          </div>
        )}
      </div>

      <Button
        type="submit"
        className="w-full bg-primary font-bold tracking-wider"
        disabled={!form.name || !form.description || !form.webhookUrl || isPending}
      >
        {submitLabel}
      </Button>
    </form>
  );
}

function ToolCard({
  tool,
  agentId,
  onDeleted,
}: {
  tool: AgentTool;
  agentId: number;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const updateMutation = useUpdateTool({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListToolsQueryKey(agentId) });
        setEditOpen(false);
      },
    },
  });

  const deleteMutation = useDeleteTool({
    mutation: { onSuccess: onDeleted },
  });

  let params: ToolParam[] = [];
  try {
    params = JSON.parse(tool.parametersSchema);
    if (!Array.isArray(params)) params = [];
  } catch {
    params = [];
  }

  const editInitial: ToolFormState = {
    name: tool.name,
    description: tool.description,
    webhookUrl: tool.webhookUrl,
    params,
  };

  const handleUpdate = (data: ToolFormState) => {
    updateMutation.mutate({
      agentId,
      id: tool.id,
      data: {
        name: data.name,
        description: data.description,
        webhookUrl: data.webhookUrl,
        parametersSchema: JSON.stringify(data.params),
      },
    });
  };

  return (
    <div className="glass-panel p-4 rounded-xl border border-white/5 group relative overflow-hidden">
      <div className="absolute top-0 start-0 w-1 h-full bg-primary/50" />
      <div className="flex justify-between items-start ps-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-primary font-mono tracking-widest uppercase">TOOL</span>
            <code className="text-sm font-mono text-white font-bold">{tool.name}</code>
          </div>
          <p className="text-white/70 text-sm mb-2">{tool.description}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {params.map(p => (
              <span key={p.name} className="inline-flex items-center gap-1 text-[10px] font-mono bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                <span className="text-primary/80">{p.name}</span>
                <span className="text-muted-foreground">:{p.type}</span>
                {p.required && <span className="text-orange-400">*</span>}
              </span>
            ))}
            {params.length === 0 && (
              <span className="text-[10px] text-muted-foreground font-mono">{t("noParams")}</span>
            )}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground font-mono truncate">
            → {tool.webhookUrl}
          </div>
        </div>

        <div className="flex items-center gap-1 ms-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white h-8 w-8">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-panel border-white/10 max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">{t("editTool")}</DialogTitle>
              </DialogHeader>
              <ToolForm
                initial={editInitial}
                onSubmit={handleUpdate}
                isPending={updateMutation.isPending}
                submitLabel={t("save")}
              />
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="glass-panel border-white/10">
              <AlertDialogHeader>
                <AlertDialogTitle>{t("confirm")}</AlertDialogTitle>
                <AlertDialogDescription>{t("deleteWarning")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-white/10 border-white/10 hover:bg-white/20">{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive hover:bg-destructive/80"
                  onClick={() => deleteMutation.mutate({ agentId, id: tool.id })}
                >
                  {t("confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

export function AgentTools({ agentId }: { agentId: number }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: tools } = useListTools(agentId);
  const [createOpen, setCreateOpen] = useState(false);

  const createMutation = useCreateTool({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListToolsQueryKey(agentId) });
        setCreateOpen(false);
      },
    },
  });

  const handleCreate = (data: ToolFormState) => {
    createMutation.mutate({
      agentId,
      data: {
        name: data.name,
        description: data.description,
        webhookUrl: data.webhookUrl,
        parametersSchema: JSON.stringify(data.params),
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-display text-white flex items-center">
          <Wrench className="w-5 h-5 me-2 text-primary" /> {t("tools")}
        </h3>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-white/10 hover:bg-primary text-white border border-white/10">
              <Plus className="w-4 h-4 me-2" /> {t("addTool")}
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-white/10 max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">{t("addTool")}</DialogTitle>
            </DialogHeader>
            <ToolForm
              initial={EMPTY_FORM}
              onSubmit={handleCreate}
              isPending={createMutation.isPending}
              submitLabel={t("save")}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {tools?.map(tool => (
          <ToolCard
            key={tool.id}
            tool={tool}
            agentId={agentId}
            onDeleted={() => queryClient.invalidateQueries({ queryKey: getListToolsQueryKey(agentId) })}
          />
        ))}
        {tools?.length === 0 && (
          <div className="text-center py-12 border border-white/5 border-dashed rounded-2xl">
            <Wrench className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-mono text-sm mb-1">{t("noToolsYet")}</p>
            <p className="text-muted-foreground/60 text-xs">{t("noToolsHint")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
