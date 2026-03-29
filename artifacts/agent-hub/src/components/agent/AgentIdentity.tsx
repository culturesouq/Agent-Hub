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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2 } from "lucide-react";

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
});

type FormData = z.infer<typeof schema>;

export function AgentIdentity({ agent }: { agent: Agent }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
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
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">Arabic</SelectItem>
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
