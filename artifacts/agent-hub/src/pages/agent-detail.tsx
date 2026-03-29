import { useRoute } from "wouter";
import { useGetAgent } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Layout } from "@/components/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentIdentity } from "@/components/agent/AgentIdentity";
import { AgentKnowledge } from "@/components/agent/AgentKnowledge";
import { AgentInstructions } from "@/components/agent/AgentInstructions";
import { AgentChat } from "@/components/agent/AgentChat";
import { AgentConnections } from "@/components/agent/AgentConnections";
import { AgentActivity } from "@/components/agent/AgentActivity";
import { Loader2, Fingerprint, Database, Terminal, MessageSquare, Network, Activity } from "lucide-react";
import { motion } from "framer-motion";

export default function AgentDetail() {
  const [, params] = useRoute("/agents/:id");
  const agentId = parseInt(params?.id || "0", 10);
  const { data: agent, isLoading } = useGetAgent(agentId, { query: { enabled: !!agentId } });
  const { t, dir } = useI18n();

  if (isLoading) return (
    <Layout>
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    </Layout>
  );

  if (!agent) return (
    <Layout>
      <div className="text-center py-20 text-muted-foreground font-mono">AGENT_NOT_FOUND</div>
    </Layout>
  );

  return (
    <Layout>
      <div className="mb-8 flex items-center space-x-4 space-x-reverse">
        {agent.avatarUrl ? (
          <img src={agent.avatarUrl} alt={agent.name} className="w-16 h-16 rounded-2xl object-cover border-2 border-primary shadow-[0_0_20px_rgba(0,190,255,0.2)]" />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border-2 border-primary flex items-center justify-center text-primary text-xl font-bold shadow-[0_0_20px_rgba(0,190,255,0.2)]">
            {agent.name.substring(0, 2).toUpperCase()}
          </div>
        )}
        <div>
          <h2 className="text-3xl font-display font-bold text-white tracking-wide">{agent.name}</h2>
          <div className="flex items-center mt-1 text-sm font-mono uppercase tracking-wider text-muted-foreground">
            <span className={`w-2 h-2 rounded-full me-2 ${agent.isActive ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-red-500'}`} />
            STATUS: {agent.isActive ? 'ONLINE' : 'OFFLINE'}
          </div>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Tabs defaultValue="identity" className="w-full" dir={dir}>
          <TabsList className="w-full justify-start h-auto p-1 bg-black/40 border border-white/5 rounded-xl mb-6 overflow-x-auto flex-nowrap hide-scrollbar">
            <TabsTrigger value="identity" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary px-6 py-3 rounded-lg font-mono text-xs uppercase tracking-wider whitespace-nowrap">
              <Fingerprint className="w-4 h-4 me-2" /> {t('identity')}
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary px-6 py-3 rounded-lg font-mono text-xs uppercase tracking-wider whitespace-nowrap">
              <Database className="w-4 h-4 me-2" /> {t('knowledge')}
            </TabsTrigger>
            <TabsTrigger value="instructions" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary px-6 py-3 rounded-lg font-mono text-xs uppercase tracking-wider whitespace-nowrap">
              <Terminal className="w-4 h-4 me-2" /> {t('instructions')}
            </TabsTrigger>
            <TabsTrigger value="chat" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary px-6 py-3 rounded-lg font-mono text-xs uppercase tracking-wider whitespace-nowrap">
              <MessageSquare className="w-4 h-4 me-2" /> {t('chat')}
            </TabsTrigger>
            <TabsTrigger value="connections" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary px-6 py-3 rounded-lg font-mono text-xs uppercase tracking-wider whitespace-nowrap">
              <Network className="w-4 h-4 me-2" /> {t('connections')}
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary px-6 py-3 rounded-lg font-mono text-xs uppercase tracking-wider whitespace-nowrap">
              <Activity className="w-4 h-4 me-2" /> {t('activity')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="identity" className="focus-visible:outline-none"><AgentIdentity agent={agent} /></TabsContent>
          <TabsContent value="knowledge" className="focus-visible:outline-none"><AgentKnowledge agent={agent} /></TabsContent>
          <TabsContent value="instructions" className="focus-visible:outline-none"><AgentInstructions agent={agent} /></TabsContent>
          <TabsContent value="chat" className="focus-visible:outline-none"><AgentChat agent={agent} /></TabsContent>
          <TabsContent value="connections" className="focus-visible:outline-none"><AgentConnections agent={agent} /></TabsContent>
          <TabsContent value="activity" className="focus-visible:outline-none"><AgentActivity agent={agent} /></TabsContent>
        </Tabs>
      </motion.div>
    </Layout>
  );
}
