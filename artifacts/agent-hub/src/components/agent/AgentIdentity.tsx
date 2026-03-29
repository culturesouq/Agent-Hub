import { Agent, useUpdateAgent, getGetAgentQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Save, Loader2, Cpu, User, Sparkles } from "lucide-react";

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
      { id: "openai/gpt-5.2", label: "GPT-5.2 (Most Capable)" },
      { id: "openai/gpt-5.2-pro", label: "GPT-5.2 Pro" },
      { id: "openai/gpt-5-mini", label: "GPT-5 Mini" },
      { id: "openai/o4-mini", label: "o4-mini (Deep Reasoning)" },
      { id: "openai/o3", label: "o3 (Advanced Reasoning)" },
    ],
  },
  {
    group: "Anthropic",
    models: [
      { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
      { id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6 (Premium)" },
      { id: "anthropic/claude-opus-4.5", label: "Claude Opus 4.5" },
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
      { id: "meta-llama/llama-3.1-405b-instruct", label: "Llama 3.1 405B (Max)" },
    ],
  },
  {
    group: "Mistral",
    models: [
      { id: "mistralai/mistral-large-2512", label: "Mistral Large" },
      { id: "mistralai/mistral-small-2603", label: "Mistral Small" },
      { id: "mistralai/mistral-small-creative", label: "Mistral Small Creative" },
    ],
  },
  {
    group: "DeepSeek",
    models: [
      { id: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2" },
      { id: "deepseek/deepseek-r1", label: "DeepSeek R1 (Reasoning)" },
    ],
  },
  {
    group: "Qwen (Alibaba)",
    models: [
      { id: "qwen/qwen3.5-122b-a10b", label: "Qwen 3.5 122B" },
      { id: "qwen/qwen3.5-27b", label: "Qwen 3.5 27B" },
      { id: "qwen/qwen3-max-thinking", label: "Qwen 3 Max (Thinking)" },
    ],
  },
];

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  avatarUrl: z.string().optional().nullable(),
  identity: z.string().optional().nullable(),
  soul: z.string().optional().nullable(),
  model: z.string(),
  language: z.string(),
});

type FormData = z.infer<typeof schema>;

export function AgentIdentity({ agent }: { agent: Agent }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const agentModel = (agent as Agent & { model?: string }).model || "openai/gpt-4.1-mini";

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: agent.name,
      avatarUrl: agent.avatarUrl ?? "",
      identity: agent.backstory ?? "",
      soul: agent.personality ?? "",
      model: agentModel,
      language: agent.language ?? "english",
    },
  });

  const updateMutation = useUpdateAgent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAgentQueryKey(agent.id) });
        toast({ title: "Saved", description: "Agent updated successfully." });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" });
      },
    },
  });

  const onSubmit = (data: FormData) => {
    updateMutation.mutate({
      id: agent.id,
      data: {
        name: data.name,
        avatarUrl: data.avatarUrl || null,
        backstory: data.identity || null,
        personality: data.soul || null,
        model: data.model,
        language: data.language,
      },
    });
  };

  const selectedModel = form.watch("model");
  const selectedModelLabel =
    MODELS.flatMap((g) => g.models).find((m) => m.id === selectedModel)?.label || selectedModel;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-2xl">
      {/* Name + Avatar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-white flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-primary" />
            {t('name')}
          </label>
          <Input
            {...form.register('name')}
            placeholder={t('agentNamePlaceholder')}
            className="bg-white/5 border-white/10 focus-visible:border-primary/50"
          />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-white">Avatar URL</label>
          <Input
            {...form.register('avatarUrl')}
            placeholder="https://example.com/avatar.png"
            className="bg-white/5 border-white/10 focus-visible:border-primary/50"
          />
        </div>
      </div>

      {/* Identity */}
      <div className="space-y-1.5">
        <div>
          <label className="text-sm font-semibold text-white flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-primary" />
            {t('identityLabel')}
          </label>
          <p className="text-xs text-muted-foreground mt-0.5">{t('identityHint')}</p>
        </div>
        <Textarea
          {...form.register('identity')}
          placeholder={t('identityPlaceholder')}
          className="bg-white/5 border-white/10 focus-visible:border-primary/50 min-h-[140px] resize-y leading-relaxed"
        />
      </div>

      {/* Soul */}
      <div className="space-y-1.5">
        <div>
          <label className="text-sm font-semibold text-white flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            {t('soulLabel')}
          </label>
          <p className="text-xs text-muted-foreground mt-0.5">{t('soulHint')}</p>
        </div>
        <Textarea
          {...form.register('soul')}
          placeholder={t('soulPlaceholder')}
          className="bg-white/5 border-white/10 focus-visible:border-primary/50 min-h-[140px] resize-y leading-relaxed"
        />
      </div>

      {/* Settings row: Model + Language */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* AI Model */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-white flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-primary" />
            {t('model')}
          </label>
          <Select onValueChange={(val) => form.setValue('model', val)} value={form.watch('model')}>
            <SelectTrigger className="bg-white/5 border-white/10 focus:border-primary/50">
              <SelectValue placeholder="Select model">
                <span className="text-sm">{selectedModelLabel}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-[#0d1117] border-white/10 max-h-[300px]">
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
              Auto-routing picks the best model for each message
            </p>
          )}
        </div>

        {/* Language */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-white">{t('languageVoice')}</label>
          <Select
            onValueChange={(val) => form.setValue('language', val)}
            value={form.watch('language')}
          >
            <SelectTrigger className="bg-white/5 border-white/10 focus:border-primary/50">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent className="bg-background border-white/10">
              <SelectItem value="english">English</SelectItem>
              <SelectItem value="arabic">Arabic (العربية)</SelectItem>
              <SelectItem value="both">Bilingual (EN + AR)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="pt-2">
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
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
