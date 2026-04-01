import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator, HealthScore } from "@/types";
import {
  ArrowLeft, MessageSquare, Brain, Activity,
  BookOpen, User, Smile, BookMarked, Zap, Archive, Network,
  CheckSquare, FileText, Settings2, Key, Code2, ShieldCheck, AlertTriangle,
  Radio, MessageCircle, Send, GraduationCap, Star, ChevronRight,
} from "lucide-react";

import ChatSection from "@/components/operator/ChatSection";
import KbSection from "@/components/operator/KbSection";
import MemorySection from "@/components/operator/MemorySection";
import IntegrationsSection from "@/components/operator/IntegrationsSection";
import SettingsSection from "@/components/operator/SettingsSection";
import IdentitySection from "@/components/operator/IdentitySection";
import SkillsSection from "@/components/operator/SkillsSection";

function OperatorAvatar({ name }: { name: string }) {
  const letter = name.charAt(0).toUpperCase();
  const colors = [
    "bg-violet-500", "bg-blue-500", "bg-cyan-500", "bg-teal-500",
    "bg-emerald-500", "bg-amber-500", "bg-orange-500", "bg-rose-500",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center shrink-0`}>
      <span className="text-white font-bold font-mono text-base leading-none">{letter}</span>
    </div>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center animate-in fade-in duration-300">
      <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center">
        <Star className="w-5 h-5 text-muted-foreground/50" />
      </div>
      <p className="font-mono font-bold text-foreground">{title}</p>
      <p className="font-mono text-sm text-muted-foreground">Coming soon</p>
    </div>
  );
}

type NavLeaf = {
  kind: "leaf";
  id: string;
  label: string;
  icon: React.ElementType;
  depth: number;
};
type NavGroup = {
  kind: "group";
  id: string;
  label: string;
  icon: React.ElementType;
  depth: number;
  children: NavItem[];
};
type NavItem = NavLeaf | NavGroup;

function SidebarLeaf({
  item,
  activeTab,
  onSelect,
}: {
  item: NavLeaf;
  activeTab: string;
  onSelect: (id: string) => void;
}) {
  const isActive = activeTab === item.id;
  const pl = item.depth === 0 ? "pl-3" : item.depth === 1 ? "pl-7" : "pl-10";
  return (
    <button
      onClick={() => onSelect(item.id)}
      data-testid={`nav-${item.id}`}
      className={`flex items-center gap-2.5 ${pl} pr-3 py-2 rounded-md text-sm font-mono w-full text-left transition-all
        ${isActive
          ? "bg-primary/10 text-primary border border-primary/20"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground border border-transparent"
        }`}
    >
      <item.icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-primary" : ""}`} />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function SidebarGroup({
  item,
  activeTab,
  onSelect,
  openGroups,
  toggleGroup,
}: {
  item: NavGroup;
  activeTab: string;
  onSelect: (id: string) => void;
  openGroups: Set<string>;
  toggleGroup: (id: string) => void;
}) {
  const isOpen = openGroups.has(item.id);
  const pl = item.depth === 0 ? "pl-3" : item.depth === 1 ? "pl-7" : "pl-10";
  return (
    <div>
      <button
        onClick={() => toggleGroup(item.id)}
        className={`flex items-center gap-2.5 ${pl} pr-3 py-2 rounded-md text-sm font-mono w-full text-left transition-all
          text-muted-foreground hover:bg-white/5 hover:text-foreground border border-transparent`}
      >
        <item.icon className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate flex-1">{item.label}</span>
        <ChevronRight className={`w-3 h-3 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
      </button>
      {isOpen && (
        <div className="mt-0.5 space-y-0.5">
          {item.children.map((child) =>
            child.kind === "leaf" ? (
              <SidebarLeaf key={child.id} item={child} activeTab={activeTab} onSelect={onSelect} />
            ) : (
              <SidebarGroup
                key={child.id}
                item={child}
                activeTab={activeTab}
                onSelect={onSelect}
                openGroups={openGroups}
                toggleGroup={toggleGroup}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

const NAV_MAIN: NavItem[] = [
  { kind: "leaf", id: "chat", label: "Chat", icon: MessageSquare, depth: 0 },
  {
    kind: "group", id: "brain", label: "Brain", icon: Brain, depth: 0,
    children: [
      {
        kind: "group", id: "knowledge", label: "Knowledge", icon: BookOpen, depth: 1,
        children: [
          { kind: "leaf", id: "identity", label: "Identity", icon: User, depth: 2 },
          { kind: "leaf", id: "personality", label: "Personality", icon: Smile, depth: 2 },
          { kind: "leaf", id: "owner-kb", label: "Owner Knowledge", icon: BookMarked, depth: 2 },
          { kind: "leaf", id: "skills", label: "Skills", icon: Zap, depth: 2 },
        ],
      },
      { kind: "leaf", id: "memory", label: "Memory", icon: Archive, depth: 1 },
      { kind: "leaf", id: "integrations", label: "Integrations", icon: Network, depth: 1 },
    ],
  },
  { kind: "leaf", id: "tasks", label: "Tasks", icon: CheckSquare, depth: 0 },
  { kind: "leaf", id: "files", label: "Files", icon: FileText, depth: 0 },
  {
    kind: "group", id: "settings", label: "Settings", icon: Settings2, depth: 0,
    children: [
      { kind: "leaf", id: "settings.secrets", label: "Secrets & Keys", icon: Key, depth: 1 },
      { kind: "leaf", id: "settings.api", label: "API", icon: Code2, depth: 1 },
      { kind: "leaf", id: "settings.evolution", label: "Evolution Lock", icon: ShieldCheck, depth: 1 },
      { kind: "leaf", id: "settings.danger", label: "Danger Zone", icon: AlertTriangle, depth: 1 },
    ],
  },
];

const NAV_BOTTOM: NavItem[] = [
  {
    kind: "group", id: "channels", label: "Channels", icon: Radio, depth: 0,
    children: [
      { kind: "leaf", id: "channels.whatsapp", label: "WhatsApp", icon: MessageCircle, depth: 1 },
      { kind: "leaf", id: "channels.telegram", label: "Telegram", icon: Send, depth: 1 },
    ],
  },
  { kind: "leaf", id: "learn", label: "Learn", icon: GraduationCap, depth: 0 },
  { kind: "leaf", id: "feedback", label: "Leave feedback", icon: Star, depth: 0 },
];

const BRAIN_LEAVES = ["identity", "personality", "owner-kb", "skills", "memory", "integrations"];
const KNOWLEDGE_LEAVES = ["identity", "personality", "owner-kb", "skills"];
const SETTINGS_LEAVES = ["settings.secrets", "settings.api", "settings.evolution", "settings.danger"];
const CHANNELS_LEAVES = ["channels.whatsapp", "channels.telegram"];

export default function OperatorDetail({ id }: { id: string }) {
  const [activeTab, setActiveTab] = useState("chat");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["brain"]));

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

  useEffect(() => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (BRAIN_LEAVES.includes(activeTab)) next.add("brain");
      if (KNOWLEDGE_LEAVES.includes(activeTab)) next.add("knowledge");
      if (SETTINGS_LEAVES.includes(activeTab)) next.add("settings");
      if (CHANNELS_LEAVES.includes(activeTab)) next.add("channels");
      return next;
    });
  }, [activeTab]);

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelect = (tab: string) => setActiveTab(tab);

  const healthScore = saData?.healthScore;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-primary font-mono tracking-widest animate-pulse">
        Loading...
      </div>
    );
  }

  if (!operator) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-destructive font-mono text-xl">
        Operator not found
      </div>
    );
  }

  function renderContent() {
    if (!operator) return null;
    switch (activeTab) {
      case "chat":           return <ChatSection operatorId={id} />;
      case "identity":       return <IdentitySection operator={operator} panel="identity" />;
      case "personality":    return <IdentitySection operator={operator} panel="personality" />;
      case "owner-kb":       return <KbSection operatorId={id} />;
      case "skills":         return <SkillsSection operatorId={id} />;
      case "memory":         return <MemorySection operatorId={id} />;
      case "integrations":   return <IntegrationsSection operatorId={id} />;
      case "tasks":          return <ComingSoon title="Tasks" />;
      case "files":          return <ComingSoon title="Files" />;
      case "settings.secrets":   return <SettingsSection operator={operator} section="secrets" />;
      case "settings.api":       return <SettingsSection operator={operator} section="api" />;
      case "settings.evolution": return <SettingsSection operator={operator} section="evolution" />;
      case "settings.danger":    return <SettingsSection operator={operator} section="danger" />;
      case "channels.whatsapp":  return <ComingSoon title="WhatsApp" />;
      case "channels.telegram":  return <ComingSoon title="Telegram" />;
      case "learn":          return <ComingSoon title="Learn" />;
      case "feedback":       return <ComingSoon title="Leave feedback" />;
      default:               return <ChatSection operatorId={id} />;
    }
  }

  const renderNavItems = (items: NavItem[]) =>
    items.map(item =>
      item.kind === "leaf" ? (
        <SidebarLeaf key={item.id} item={item} activeTab={activeTab} onSelect={handleSelect} />
      ) : (
        <SidebarGroup
          key={item.id}
          item={item}
          activeTab={activeTab}
          onSelect={handleSelect}
          openGroups={openGroups}
          toggleGroup={toggleGroup}
        />
      )
    );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
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
          {/* Avatar + Name */}
          <div className="p-4 border-b border-border/30 flex items-center gap-3">
            <OperatorAvatar name={operator.name} />
            <div className="min-w-0">
              <div className="font-mono font-bold text-sm truncate leading-tight">{operator.name}</div>
            </div>
          </div>

          {/* Main nav */}
          <div className="p-2 flex flex-col gap-0.5 flex-1 overflow-y-auto">
            {renderNavItems(NAV_MAIN)}
          </div>

          {/* Bottom nav */}
          <div className="p-2 border-t border-border/30 flex flex-col gap-0.5">
            {renderNavItems(NAV_BOTTOM)}
          </div>
        </aside>

        {/* Mobile nav (horizontal scroll) */}
        <div className="md:hidden w-full absolute top-12 left-0 right-0 z-30 bg-background border-b border-border/50 overflow-x-auto flex items-center px-2 py-2 gap-2 no-scrollbar">
          {["chat", "identity", "personality", "owner-kb", "skills", "memory", "integrations", "tasks", "files"].map(tab => (
            <button
              key={tab}
              onClick={() => handleSelect(tab)}
              className={`flex items-center px-3 py-1.5 rounded-md text-xs font-mono whitespace-nowrap shrink-0
                ${activeTab === tab
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground border border-border/50"
                }`}
            >
              {tab.replace("-", " ").replace("owner-kb", "Knowledge")}
            </button>
          ))}
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-background md:pt-0 pt-14 relative">
          <div className="p-4 md:p-8 max-w-5xl mx-auto h-full w-full">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
