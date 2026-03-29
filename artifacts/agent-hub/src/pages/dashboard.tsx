import { useListAgents, useCreateAgent, useToggleAgentStatus } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Bot, Activity, KeyRound, Clock, Loader2, Power, PowerOff } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { getListAgentsQueryKey } from "@workspace/api-client-react";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { t } = useI18n();
  const { data: agents, isLoading } = useListAgents();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const queryClient = useQueryClient();

  const createMutation = useCreateAgent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
        setIsCreateOpen(false);
        setNewAgentName("");
      }
    }
  });

  const toggleMutation = useToggleAgentStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
      }
    }
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName) return;
    createMutation.mutate({ data: { name: newAgentName, language: 'en' } });
  };

  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-display font-bold text-white">{t('dashboard')}</h2>
          <p className="text-muted-foreground mt-1 font-mono text-sm tracking-wider">SYSTEM_STATUS: NOMINAL</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="glow-effect shadow-[0_0_15px_rgba(0,190,255,0.3)] bg-primary text-primary-foreground font-bold tracking-wider">
              <Plus className="w-4 h-4 me-2" />
              {t('newAgent')}
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-white/10 sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">{t('newAgent')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">{t('name')}</label>
                <Input 
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="Enter designation..."
                  className="bg-black/50 border-white/10 focus:border-primary"
                  autoFocus
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
                disabled={!newAgentName || createMutation.isPending}
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Bot className="w-4 h-4 me-2" />}
                {t('confirm')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !agents?.length ? (
        <div className="text-center py-20 glass-panel rounded-2xl">
          <Bot className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-medium text-white mb-2">{t('noData')}</h3>
          <p className="text-muted-foreground font-mono text-sm">NO_AGENTS_INITIALIZED</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent, index) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              key={agent.id}
            >
              <Card className="glass-panel overflow-hidden border border-white/5 hover:border-primary/50 transition-all duration-300 group">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-4 space-x-reverse">
                      {agent.avatarUrl ? (
                        <img src={agent.avatarUrl} alt={agent.name} className="w-12 h-12 rounded-xl object-cover border border-white/10 shadow-lg" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center text-primary font-bold shadow-[0_0_10px_rgba(0,190,255,0.1)]">
                          {getInitials(agent.name)}
                        </div>
                      )}
                      <div>
                        <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors">
                          <Link href={`/agents/${agent.id}`}>{agent.name}</Link>
                        </h3>
                        <div className="flex items-center mt-1">
                          <span className={`w-2 h-2 rounded-full me-2 ${agent.isActive ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-muted-foreground'}`} />
                          <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                            {agent.isActive ? t('active') : t('inactive')}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => toggleMutation.mutate({ id: agent.id })}
                      className={`rounded-full ${agent.isActive ? 'text-green-500 hover:text-green-400 hover:bg-green-500/10' : 'text-muted-foreground hover:text-white hover:bg-white/10'}`}
                      disabled={toggleMutation.isPending}
                    >
                      {agent.isActive ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-white/5">
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground font-mono uppercase mb-1 flex items-center">
                        <KeyRound className="w-3 h-3 me-1" /> {t('connections')}
                      </span>
                      <span className="text-lg font-semibold text-white">{agent.connectionsCount}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground font-mono uppercase mb-1 flex items-center">
                        <Clock className="w-3 h-3 me-1" /> {t('lastUsed')}
                      </span>
                      <span className="text-sm font-medium text-white/80 mt-1">
                        {agent.lastActivity ? new Date(agent.lastActivity).toLocaleDateString() : 'Never'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <Link href={`/agents/${agent.id}`} className="block w-full text-center py-3 bg-white/5 hover:bg-primary text-white text-sm font-medium transition-colors font-mono tracking-wider">
                  ACCESS_TERMINAL
                </Link>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </Layout>
  );
}
