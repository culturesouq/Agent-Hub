import { Agent, useUpdateAgent, getGetAgentQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, Cpu, Globe, Power, Languages } from "lucide-react";

const MODELS = [
  {
    group: "Auto",
    models: [
      { id: "openrouter/auto", label: "Auto — AI picks the best model per task" },
    ],
  },
  {
    group: "OpenAI",
    models: [
      { id: "openai/gpt-4.1", label: "GPT-4.1 (Powerful)" },
      { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini (Fast)" },
      { id: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano (Fastest)" },
      { id: "openai/o4-mini", label: "o4-mini (Deep Reasoning)" },
      { id: "openai/o3", label: "o3 (Advanced Reasoning)" },
    ],
  },
  {
    group: "Anthropic",
    models: [
      { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
      { id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6 (Premium)" },
      { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5 (Fast)" },
    ],
  },
  {
    group: "Google",
    models: [
      { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
      { id: "google/gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite" },
      { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash" },
    ],
  },
  {
    group: "xAI (Grok)",
    models: [
      { id: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast" },
      { id: "x-ai/grok-4.20-beta", label: "Grok 4.20 Beta" },
    ],
  },
  {
    group: "Meta (Llama)",
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
      { id: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B (Lightweight)" },
    ],
  },
  {
    group: "Mistral",
    models: [
      { id: "mistralai/mistral-large-2512", label: "Mistral Large" },
      { id: "mistralai/mistral-small-2603", label: "Mistral Small" },
    ],
  },
  {
    group: "DeepSeek",
    models: [
      { id: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2" },
      { id: "deepseek/deepseek-r1", label: "DeepSeek R1 (Reasoning)" },
    ],
  },
];

const schema = z.object({
  model: z.string(),
  language: z.string(),
  webSearchEnabled: z.boolean(),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof schema>;

export function AgentSettings({ agent }: { agent: Agent }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const agentModel = (agent as Agent & { model?: string }).model || "openai/gpt-4.1-mini";
  const agentWebSearch = (agent as Agent & { webSearchEnabled?: boolean }).webSearchEnabled ?? false;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      model: agentModel,
      language: agent.language ?? "english",
      webSearchEnabled: agentWebSearch,
      isActive: agent.isActive ?? true,
    },
  });

  const updateMutation = useUpdateAgent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAgentQueryKey(agent.id) });
        toast({ title: "Saved", description: "Settings updated." });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
      },
    },
  });

  const onSubmit = (data: FormData) => {
    updateMutation.mutate({
      id: agent.id,
      data: {
        model: data.model,
        language: data.language,
        webSearchEnabled: data.webSearchEnabled,
        isActive: data.isActive,
      },
    });
  };

  const selectedModel = form.watch("model");
  const selectedModelLabel =
    MODELS.flatMap((g) => g.models).find((m) => m.id === selectedModel)?.label || selectedModel;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">

      {/* Agent Status */}
      <div className="rounded-xl border border-white/8 bg-white/3 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <label className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Power className="w-3.5 h-3.5 text-primary" />
              Agent Status
            </label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {form.watch("isActive")
                ? "Agent is online and can receive messages"
                : "Agent is offline — all requests will be rejected"}
            </p>
          </div>
          <Controller
            name="isActive"
            control={form.control}
            render={({ field }) => (
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
        </div>
        {!form.watch("isActive") && (
          <p className="text-[11px] text-amber-400/70 mt-3">
            The agent won't respond to any messages while offline.
          </p>
        )}
      </div>

      {/* AI Model */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-white flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-primary" />
          {t("model")}
        </label>
        <p className="text-xs text-muted-foreground">
          The AI model powering this agent. More capable models are slower and may cost more.
        </p>
        <Select onValueChange={(val) => form.setValue("model", val)} value={form.watch("model")}>
          <SelectTrigger className="bg-white/5 border-white/10 focus:border-primary/50">
            <SelectValue placeholder="Select model">
              <span className="text-sm">{selectedModelLabel}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-[#0d1117] border-white/10 max-h-[320px]">
            {MODELS.map((group) => (
              <SelectGroup key={group.group}>
                <SelectLabel className="text-xs text-muted-foreground font-mono tracking-widest px-2 py-1">
                  {group.group}
                </SelectLabel>
                {group.models.map((model) => (
                  <SelectItem key={model.id} value={model.id} className="text-sm">
                    <div className="flex flex-col">
                      <span>{model.label}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{model.id}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {selectedModel === "openrouter/auto" && (
          <p className="text-[11px] text-primary/70">
            Auto-routing picks the best model for each message automatically.
          </p>
        )}
      </div>

      {/* Language */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-white flex items-center gap-1.5">
          <Languages className="w-3.5 h-3.5 text-primary" />
          {t("languageVoice")}
        </label>
        <p className="text-xs text-muted-foreground">
          The language this agent uses when responding.
        </p>
        <Select
          onValueChange={(val) => form.setValue("language", val)}
          value={form.watch("language")}
        >
          <SelectTrigger className="bg-white/5 border-white/10 focus:border-primary/50">
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent className="bg-background border-white/10">
            <SelectItem value="english">English only</SelectItem>
            <SelectItem value="arabic">Arabic only (العربية)</SelectItem>
            <SelectItem value="both">Bilingual — match user's language (EN + AR)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Web Search */}
      <div className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <label className="text-sm font-semibold text-white flex items-center gap-1.5 cursor-pointer">
              <Globe className="w-3.5 h-3.5 text-primary" />
              {t("webSearch")}
            </label>
            <p className="text-xs text-muted-foreground mt-0.5">{t("webSearchDesc")}</p>
          </div>
          <Controller
            name="webSearchEnabled"
            control={form.control}
            render={({ field }) => (
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
        </div>
        {form.watch("webSearchEnabled") && (
          <p className="text-[11px] text-primary/60 leading-relaxed">
            {t("webSearchNote")}
          </p>
        )}
      </div>

      <div className="pt-1">
        <Button
          type="submit"
          className="bg-primary text-primary-foreground font-semibold px-6"
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin me-2" />
          ) : (
            <Save className="w-4 h-4 me-2" />
          )}
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
