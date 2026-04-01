import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator, HealthScore } from "@/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Brain, Cpu, Database, Fingerprint, LayoutGrid, MessageSquare, Network, ShieldAlert, Sparkles, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import IdentitySection from "@/components/operator/IdentitySection";
import ChatSection from "@/components/operator/ChatSection";
import KbSection from "@/components/operator/KbSection";
import GrowSection from "@/components/operator/GrowSection";
import MemorySection from "@/components/operator/MemorySection";
import IntegrationsSection from "@/components/operator/IntegrationsSection";
import MissionContextsSection from "@/components/operator/MissionContextsSection";
import SkillsSection from "@/components/operator/SkillsSection";
import CapabilityRequestsSection from "@/components/operator/CapabilityRequestsSection";

export default function OperatorDetail({ id }: { id: string }) {
  const [activeTab, setActiveTab] = useState("identity");

  const { data: operator, isLoading: isLoadingOperator } = useQuery({
    queryKey: ["operators", id],
    queryFn: () => apiFetch<Operator>(`/operators/${id}`),
    enabled: !!id,
  });

  const { data: saData } = useQuery({
    queryKey: ["operators", id, "self-awareness"],
    queryFn: () => apiFetch<{ healthScore: HealthScore }>(`/operators/${id}/grow/self-awareness`),
    enabled: !!id,
    refetchInterval: 60000,
  });

  if (isLoadingOperator) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-primary font-mono tracking-widest animate-pulse">Loading...</div>;
  }

  if (!operator) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-destructive font-mono text-xl">Agent not found</div>;
  }

  const navItems = [
    { id: "identity", label: "Identity & Soul", icon: Fingerprint },
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "kb", label: "Knowledge Base", icon: Database },
    { id: "grow", label: "Growth & Health", icon: Activity },
    { id: "memory", label: "Memory", icon: Brain },
    { id: "integrations", label: "Integrations", icon: Network },
    { id: "contexts", label: "Contexts", icon: LayoutGrid },
    { id: "skills", label: "Skills", icon: Sparkles },
    { id: "requests", label: "Capability Requests", icon: ShieldAlert },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border/50 bg-card/50 flex items-center px-4 shrink-0 justify-between sticky top-0 z-40 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors p-1" data-testid="link-back">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="h-6 w-px bg-border/50" />
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5 text-primary" />
            <div>
              <h1 className="font-mono font-bold text-lg leading-none tracking-tight">{operator.name}</h1>
              <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">{operator.archetype}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {saData?.healthScore && (
            <div className="flex items-center gap-2 font-mono text-sm border border-border/50 rounded px-3 py-1 bg-background/50">
              <span className="text-muted-foreground">Health:</span>
              <span className={
                saData.healthScore.score >= 80 ? "text-green-500" :
                saData.healthScore.score >= 50 ? "text-amber-500" : "text-destructive"
              }>
                {saData.healthScore.score}%
              </span>
            </div>
          )}
          <Badge variant="outline" className={`font-mono text-xs uppercase ${operator.layer1LockedAt ? 'text-primary border-primary/30 bg-primary/5' : 'text-amber-500 border-amber-500/30 bg-amber-500/5'}`}>
            {operator.layer1LockedAt ? 'Identity Locked' : 'Identity Unlocked'}
          </Badge>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar Nav */}
        <aside className="w-64 border-r border-border/50 bg-card/30 flex flex-col shrink-0 overflow-y-auto hidden md:flex">
          <div className="p-4 flex flex-col gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-mono transition-all text-left w-full
                  ${activeTab === item.id 
                    ? "bg-primary/10 text-primary border border-primary/20" 
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground border border-transparent"
                  }`}
                data-testid={`nav-item-${item.id}`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Mobile Nav */}
        <div className="md:hidden absolute top-0 left-0 right-0 z-30 bg-background border-b border-border/50 overflow-x-auto no-scrollbar flex items-center px-2 py-2 gap-2">
           {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono whitespace-nowrap
                  ${activeTab === item.id 
                    ? "bg-primary/10 text-primary border border-primary/20" 
                    : "text-muted-foreground border border-border/50"
                  }`}
              >
                <item.icon className="w-3 h-3" />
                {item.label}
              </button>
            ))}
        </div>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-background md:pt-0 pt-12 relative">
          <div className="p-4 md:p-8 max-w-6xl mx-auto h-full w-full">
            {activeTab === "identity" && <IdentitySection operator={operator} />}
            {activeTab === "chat" && <ChatSection operatorId={id} />}
            {activeTab === "kb" && <KbSection operatorId={id} />}
            {activeTab === "grow" && <GrowSection operatorId={id} saData={saData} />}
            {activeTab === "memory" && <MemorySection operatorId={id} />}
            {activeTab === "integrations" && <IntegrationsSection operatorId={id} />}
            {activeTab === "contexts" && <MissionContextsSection operatorId={id} />}
            {activeTab === "skills" && <SkillsSection operatorId={id} />}
            {activeTab === "requests" && <CapabilityRequestsSection operatorId={id} />}
          </div>
        </main>
      </div>
    </div>
  );
}
