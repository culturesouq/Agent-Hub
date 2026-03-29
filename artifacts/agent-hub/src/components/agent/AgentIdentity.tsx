import { Agent } from "@workspace/api-client-react";
import { useUpdateAgent } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAgentQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, Cpu } from "lucide-react";

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
  backstory: z.string().optional().nullable(),
  personality: z.string().optional().nullable(),
  coreValues: z.string().optional().nullable(),
  expertiseAreas: z.string().optional().nullable(),
  communicationStyle: z.string().optional().nullable(),
  emotionalIntelligence: z.string().optional().nullable(),
  language: z.string(),
  model: z.string(),
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
      avatarUrl: agent.avatarUrl,
      backstory: agent.backstory,
      personality: agent.personality,
      coreValues: agent.coreValues,
      expertiseAreas: agent.expertiseAreas,
      communicationStyle: agent.communicationStyle,
      emotionalIntelligence: agent.emotionalIntelligence,
      language: agent.language,
      model: agentModel,
    }
  });

  const updateMutation = useUpdateAgent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAgentQueryKey(agent.id) });
        toast({ title: "System updated", description: "Agent parameters committed successfully." });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update parameters.", variant: "destructive" });
      }
    }
  });

  const onSubmit = (data: FormData) => {
    updateMutation.mutate({ id: agent.id, data });
  };

  const selectedModel = form.watch("model");
  const selectedModelLabel = MODELS.flatMap(g => g.models).find(m => m.id === selectedModel)?.label || selectedModel;

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/5">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-mono text-primary uppercase tracking-wider">{t('name')}</label>
            <Input {...form.register('name')} className="bg-black/50 border-white/10" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-mono text-primary uppercase tracking-wider">Avatar URL</label>
            <Input {...form.register('avatarUrl')} placeholder="https://..." className="bg-black/50 border-white/10" />
          </div>

          {/* AI Model Selector */}
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-mono text-primary uppercase tracking-wider flex items-center gap-2">
              <Cpu className="w-3 h-3" />
              AI Model
            </label>
            <div className="flex items-center gap-3">
              <Select onValueChange={(val) => form.setValue('model', val)} value={form.watch("model")}>
                <SelectTrigger className="bg-black/50 border-white/10 flex-1">
                  <SelectValue placeholder="Select AI model">
                    <span className="flex items-center gap-2">
                      <span className="text-primary font-mono text-xs">{selectedModelLabel}</span>
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-[#0d1117] border-white/10 max-h-[320px]">
                  {MODELS.map((group) => (
                    <SelectGroup key={group.group}>
                      <SelectLabel className="text-xs text-muted-foreground font-mono tracking-widest px-2 py-1">{group.group}</SelectLabel>
                      {group.models.map((model) => (
                        <SelectItem key={model.id} value={model.id} className="font-mono text-sm">
                          <div className="flex flex-col">
                            <span>{model.label}</span>
                            <span className="text-xs text-muted-foreground">{model.id}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <div className="px-3 py-1 rounded-md bg-primary/10 border border-primary/20 text-primary text-xs font-mono truncate max-w-[200px]">
                {form.watch("model")}
              </div>
            </div>
            {selectedModel === "openrouter/auto" ? (
              <p className="text-xs text-primary/70 font-mono">OpenRouter Auto-routing — analyzes each message and picks the optimal model automatically (cost + capability balanced)</p>
            ) : (
              <p className="text-xs text-muted-foreground">This model will be used for all conversations with this agent (owner chat + connected apps)</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-mono text-primary uppercase tracking-wider">{t('backstory')}</label>
            <Textarea {...form.register('backstory')} className="bg-black/50 border-white/10 min-h-[100px]" placeholder="Define the origin protocol..." />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-mono text-primary uppercase tracking-wider">{t('personality')}</label>
            <Textarea {...form.register('personality')} className="bg-black/50 border-white/10" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-mono text-primary uppercase tracking-wider">{t('coreValues')}</label>
            <Textarea {...form.register('coreValues')} className="bg-black/50 border-white/10" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-mono text-primary uppercase tracking-wider">{t('expertiseAreas')}</label>
            <Textarea {...form.register('expertiseAreas')} className="bg-black/50 border-white/10" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-mono text-primary uppercase tracking-wider">{t('communicationStyle')}</label>
            <Input {...form.register('communicationStyle')} className="bg-black/50 border-white/10" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-mono text-primary uppercase tracking-wider">{t('emotionalIntelligence')}</label>
            <Input {...form.register('emotionalIntelligence')} className="bg-black/50 border-white/10" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-mono text-primary uppercase tracking-wider">{t('language')}</label>
            <Select onValueChange={(val) => form.setValue('language', val)} defaultValue={agent.language}>
              <SelectTrigger className="bg-black/50 border-white/10">
                <SelectValue placeholder="Select primary language" />
              </SelectTrigger>
              <SelectContent className="bg-background border-white/10">
                <SelectItem value="english">English</SelectItem>
                <SelectItem value="arabic">Arabic</SelectItem>
                <SelectItem value="both">Bilingual (EN/AR)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-white/5">
          <Button
            type="submit"
            className="glow-effect bg-primary text-primary-foreground font-bold tracking-wider"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Save className="w-4 h-4 me-2" />}
            {t('save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
