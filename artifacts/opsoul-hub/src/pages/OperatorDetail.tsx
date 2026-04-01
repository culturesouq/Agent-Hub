import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator, HealthScore } from "@/types";
import { ArrowLeft, MessageSquare, Database, Brain, Network, Settings, BookOpen, Activity, SlidersHorizontal } from "lucide-react";

import ChatSection from "@/components/operator/ChatSection";
import KbSection from "@/components/operator/KbSection";
import MemorySection from "@/components/operator/MemorySection";
import IntegrationsSection from "@/components/operator/IntegrationsSection";
import SettingsSection from "@/components/operator/SettingsSection";
import IdentitySection from "@/components/operator/IdentitySection";

function OperatorAvatar({ name }: { name: string }) {
  const letter = name.charAt(0).toUpperCase();
  const colors = [
    "bg-violet-500", "bg-blue-500", "bg-cyan-500", "bg-teal-500",
    "bg-emerald-500", "bg-amber-500", "bg-orange-500", "bg-rose-500",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center shrink-0`}>
      <span className="text-white font-bold font-mono text-lg leading-none">{letter}</span>
    </div>
  );
}

export default function OperatorDetail({ id }: { id: string }) {
  const [activeTab, setActiveTab] = useState("chat");

  const { data: operator, isLoading } = useQuery({
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

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-primary font-mono tracking-widest animate-pulse">Loading...</div>;
  }

  if (!operator) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-destructive font-mono text-xl">Operator not found</div>;
  }

  const navItems = [
    { id: "chat",         label: "Chat",         icon: MessageSquare },
    { id: "instructions", label: "Instructions", icon: SlidersHorizontal },
    { id: "knowledge",   label: "Knowledge",    icon: Database },
    { id: "memory",      label: "Memory",       icon: Brain },
    { id: "integrations",label: "Integrations", icon: Network },
    { id: "settings",    label: "Settings",     icon: Settings },
  ];

  const healthScore = saData?.healthScore;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Slim page header */}
      <header className="h-12 border-b border-border/50 bg-card/50 flex items-center px-4 shrink-0 justify-between sticky top-0 z-40 backdrop-blur-sm">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors p-1" data-testid="link-back">
          <ArrowLeft className="w-4 h-4" />
        </Link>

        {healthScore && (
          <div className="flex items-center gap-2 font-mono text-xs border border-border/50 rounded px-2.5 py-1 bg-background/50">
            <Activity className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground hidden sm:inline">Health:</span>
            <span className={
              healthScore.score >= 80 ? "text-green-500 font-bold" :
              healthScore.score >= 50 ? "text-amber-500 font-bold" : "text-destructive font-bold"
            }>
              {healthScore.score}%
            </span>
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 border-r border-border/50 bg-card/30 flex-col shrink-0 overflow-y-auto hidden md:flex">
          {/* Avatar + Name at top */}
          <div className="p-4 border-b border-border/30 flex items-center gap-3">
            <OperatorAvatar name={operator.name} />
            <div className="min-w-0">
              <div className="font-mono font-bold text-sm truncate leading-tight">{operator.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground truncate mt-0.5 opacity-60">{operator.mandate?.substring(0, 30)}{operator.mandate?.length > 30 ? "…" : ""}</div>
            </div>
          </div>

          {/* Nav items */}
          <div className="p-3 flex flex-col gap-0.5 flex-1">
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
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Learn link pinned to bottom */}
          <div className="p-3 border-t border-border/30">
            <a
              href="https://docs.opsoul.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-mono text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent transition-all w-full"
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>Learn</span>
            </a>
          </div>
        </aside>

        {/* Mobile nav */}
        <div className="md:hidden w-full absolute top-12 left-0 right-0 z-30 bg-background border-b border-border/50 overflow-x-auto flex items-center px-2 py-2 gap-2 no-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono whitespace-nowrap shrink-0
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

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-background md:pt-0 pt-14 relative">
          <div className="p-4 md:p-8 max-w-5xl mx-auto h-full w-full">
            {activeTab === "chat"          && <ChatSection operatorId={id} />}
            {activeTab === "instructions"  && <IdentitySection operator={operator} />}
            {activeTab === "knowledge"    && <KbSection operatorId={id} />}
            {activeTab === "memory"       && <MemorySection operatorId={id} />}
            {activeTab === "integrations" && <IntegrationsSection operatorId={id} />}
            {activeTab === "settings"     && <SettingsSection operator={operator} />}
          </div>
        </main>
      </div>
    </div>
  );
}
