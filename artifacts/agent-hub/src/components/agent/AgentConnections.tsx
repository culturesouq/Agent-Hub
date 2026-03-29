import { Agent, useListConnections, useCreateConnection, useDeleteConnection, getListConnectionsQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Network, Plus, Copy, Check, Trash2, Key } from "lucide-react";
import { format } from "date-fns";

export function AgentConnections({ agent }: { agent: Agent }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { data: connections } = useListConnections(agent.id);
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [appName, setAppName] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const createMutation = useCreateConnection({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey(agent.id) });
        setIsOpen(false);
        setAppName("");
      }
    }
  });

  const deleteMutation = useDeleteConnection({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey(agent.id) })
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName) return;
    createMutation.mutate({ agentId: agent.id, data: { appName } });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    toast({ title: "Copied", description: "API Key copied to clipboard" });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-display text-white flex items-center">
          <Network className="w-5 h-5 me-2 text-primary" /> {t('connections')}
        </h3>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-white/10 hover:bg-primary text-white border border-white/10">
              <Plus className="w-4 h-4 me-2" /> {t('newConnection')}
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-white/10 sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="font-display">{t('newConnection')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-xs font-mono text-muted-foreground uppercase">{t('appName')}</label>
                <Input value={appName} onChange={e => setAppName(e.target.value)} className="bg-black/50 border-white/10" placeholder="e.g. My Next.js App" required autoFocus />
              </div>
              <Button type="submit" className="w-full bg-primary font-bold" disabled={!appName || createMutation.isPending}>
                {t('confirm')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {connections?.map(conn => (
          <div key={conn.id} className="glass-panel p-5 rounded-xl border border-white/5 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-white font-bold text-lg">{conn.appName}</h4>
                <div className="flex items-center text-xs font-mono text-muted-foreground mt-2 space-x-4 space-x-reverse">
                  <span>PING_COUNT: <span className="text-primary">{conn.requestCount}</span></span>
                  <span>LAST_PING: <span className="text-white/70">{conn.lastUsed ? format(new Date(conn.lastUsed), 'yyyy-MM-dd HH:mm') : 'NEVER'}</span></span>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => deleteMutation.mutate({ agentId: agent.id, id: conn.id })}
              >
                <Trash2 className="w-4 h-4 me-2" /> {t('revoke')}
              </Button>
            </div>
            
            <div className="bg-black/60 rounded-lg p-3 border border-white/5 flex items-center justify-between">
              <div className="flex items-center flex-1 overflow-hidden">
                <Key className="w-4 h-4 text-muted-foreground me-3 shrink-0" />
                <code className="text-sm text-primary font-mono truncate">{conn.apiKey}</code>
              </div>
              <Button variant="ghost" size="icon" onClick={() => copyToClipboard(conn.apiKey)} className="ms-2 shrink-0">
                {copiedKey === conn.apiKey ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
              </Button>
            </div>

            <div className="bg-white/5 rounded-lg p-4 font-mono text-xs text-muted-foreground overflow-x-auto whitespace-pre">
<span className="text-primary">const</span> response = <span className="text-primary">await</span> fetch(<span className="text-green-400">'https://{window.location.host}/api/public/chat'</span>, {'{'}
  method: <span className="text-green-400">'POST'</span>,
  headers: {'{'} <span className="text-green-400">'Content-Type'</span>: <span className="text-green-400">'application/json'</span> {'}'},
  body: <span className="text-blue-400">JSON</span>.stringify({'{'}
    apiKey: <span className="text-green-400">'{conn.apiKey}'</span>,
    message: <span className="text-green-400">"Hello agent!"</span>,
    conversationHistory: [] <span className="text-white/30">// optional</span>
  {'}'})
{'}'});</div>
          </div>
        ))}
        {connections?.length === 0 && (
          <div className="text-center py-12 border border-white/5 border-dashed rounded-2xl">
            <p className="text-muted-foreground font-mono text-sm">{t('noData')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
