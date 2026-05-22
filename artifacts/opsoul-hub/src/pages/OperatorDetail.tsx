import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator, HealthScore } from "@/types";
import {
  ArrowLeft, MessageSquare, Brain, Activity,
  User, Zap, Archive, Network,
  CheckSquare, FileText, Settings2, Key, Code2, AlertTriangle,
  Star, ChevronRight, Sparkles,
  Shield, ShieldCheck, Menu, X, Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import ChatSection from "@/components/operator/ChatSection";
import MemorySection from "@/components/operator/MemorySection";
import IntegrationsSection from "@/components/operator/IntegrationsSection";
import SettingsSection from "@/components/operator/SettingsSection";
import IdentitySection from "@/components/operator/IdentitySection";
import SkillsSection from "@/components/operator/SkillsSection";
import TasksSection from "@/components/operator/TasksSection";
import GrowSection from "@/components/operator/GrowSection";
import PersonalitySection from "@/components/operator/PersonalitySection";
import KbSection from "@/components/operator/KbSection";
import FilesSection from "@/components/operator/FilesSection";
import ArtifactsSection from "@/components/operator/ArtifactsSection";


const PERSONA_IMAGES = [
  "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=400&q=80",
  "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=400&q=80",
  "https://images.unsplash.com/photo-1675557009875-79c69a33e26c?w=400&q=80",
];
const PERSONA_GLOWS = ["#9b59f4", "#22d3ee", "#ec4899"];

function OperatorAvatar({ name }: { name: string }) {
  const letter = name.charAt(0).toUpperCase();
  const colors = [
    "bg-violet-500", "bg-blue-500", "bg-cyan-500", "bg-teal-500",
    "bg-emerald-500", "bg-amber-500", "bg-orange-500", "bg-rose-500",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center shrink-0`}>
      <span className="text-white font-bold text-base leading-none">{letter}</span>
    </div>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center animate-in fade-in duration-300">
      <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center">
        <Star className="w-5 h-5 text-muted-foreground/50" />
      </div>
      <p className="font-headline font-bold text-foreground">{title}</p>
      <p className="font-label text-sm text-muted-foreground">Coming soon</p>
    </div>
  );
}

type NavLeaf = { kind: "leaf"; id: string; label: string; icon: React.ElementType; depth: number };
type NavGroup = { kind: "group"; id: string; label: string; icon: React.ElementType; depth: number; children: NavItem[] };
type NavItem = NavLeaf | NavGroup;

function SidebarLeaf({
  item, activeTab, onSelect, badgeCount, onBadgeClick,
}: {
  item: NavLeaf;
  activeTab: string;
  onSelect: (id: string) => void;
  badgeCount?: number;
  onBadgeClick?: () => void;
}) {
  const isActive = activeTab === item.id;
  const pl = item.depth === 0 ? "pl-3" : item.depth === 1 ? "pl-7" : "pl-10";
  return (
    <button
      onClick={() => onSelect(item.id)}
      data-testid={`nav-${item.id}`}
      className={`flex items-center gap-2.5 ${pl} pr-3 py-2 rounded-md text-sm font-label w-full text-left transition-all overflow-hidden
        ${isActive
          ? "sidebar-nav-active border border-transparent"
          : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground border border-transparent"
        }`}
    >
      <item.icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-primary" : ""}`} />
      <span className="truncate flex-1">{item.label}</span>
      {badgeCount !== undefined && badgeCount > 0 && (
        <span
          role="button"
          tabIndex={0}
          onClick={e => { e.stopPropagation(); onBadgeClick?.(); }}
          onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); onBadgeClick?.(); } }}
          className="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold shrink-0 hover:bg-amber-400 transition-colors"
          title={`${badgeCount} pending request${badgeCount > 1 ? "s" : ""}`}
        >
          {badgeCount}
        </span>
      )}
    </button>
  );
}

function SidebarGroup({
  item, activeTab, onSelect, openGroups, toggleGroup,
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
        className={`flex items-center gap-2.5 ${pl} pr-3 py-2 rounded-md text-sm font-label w-full text-left transition-all text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground border border-transparent`}
      >
        <item.icon className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate flex-1">{item.label}</span>
        <ChevronRight className={`w-3 h-3 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
      </button>
      {isOpen && (
        <div className="mt-0.5 space-y-0.5">
          {item.children.map(child =>
            child.kind === "leaf" ? (
              <SidebarLeaf key={child.id} item={child} activeTab={activeTab} onSelect={onSelect} />
            ) : (
              <SidebarGroup key={child.id} item={child} activeTab={activeTab} onSelect={onSelect} openGroups={openGroups} toggleGroup={toggleGroup} />
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
      { kind: "leaf", id: "soul",                 label: "Soul",             icon: User,         depth: 1 },
      { kind: "leaf", id: "skills",               label: "Skills",           icon: Zap,          depth: 1 },
      { kind: "leaf", id: "memory",               label: "Memory",           icon: Archive,      depth: 1 },
      { kind: "leaf", id: "grow",                 label: "Growth",           icon: Activity,     depth: 1 },
    ],
  },
  { kind: "leaf", id: "tasks",       label: "Tasks",       icon: CheckSquare, depth: 0 },
  { kind: "leaf", id: "files",       label: "Files",       icon: FileText,    depth: 0 },
  { kind: "leaf", id: "artifacts",   label: "Artifacts",   icon: Sparkles,    depth: 0 },
  { kind: "leaf", id: "connections", label: "Connections", icon: Network,     depth: 0 },
  {
    kind: "group", id: "settings", label: "Settings", icon: Settings2, depth: 0,
    children: [
      { kind: "leaf", id: "settings.model",     label: "Model & AI",      icon: Cpu,          depth: 1 },
      { kind: "leaf", id: "settings.secrets",  label: "Keys & Secrets",  icon: Key,          depth: 1 },
      { kind: "leaf", id: "settings.api",      label: "API Access",      icon: Code2,        depth: 1 },
      { kind: "leaf", id: "settings.behavior", label: "Behavior",        icon: Shield,       depth: 1 },
      { kind: "leaf", id: "settings.evolution",label: "Evolution Lock",  icon: ShieldCheck,  depth: 1 },
      { kind: "leaf", id: "settings.danger",   label: "Danger Zone",     icon: AlertTriangle,depth: 1 },
    ],
  },
];

const NAV_BOTTOM: NavItem[] = [
  { kind: "leaf", id: "feedback", label: "Leave Feedback", icon: Star, depth: 0 },
];

const BRAIN_LEAVES    = ["soul", "skills", "memory", "grow"];
const SETTINGS_LEAVES = ["settings.model", "settings.secrets", "settings.api", "settings.behavior", "settings.evolution", "settings.danger"];

export default function OperatorDetail({ id }: { id: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("chat");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["brain"]));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const { data: operator, isLoading } = useQuery({
    queryKey: ["operators", id],
    queryFn: () => apiFetch<Operator>(`/operators/${id}`),
    enabled: !!id,
    refetchInterval: (query) => !query.state.data?.rawIdentity ? 3000 : false,
  });

  const { data: saData } = useQuery({
    queryKey: ["operators", id, "self-awareness"],
    queryFn: () => apiFetch<{ healthScore: HealthScore }>(`/operators/${id}/grow/self-awareness`),
    enabled: !!id,
    refetchInterval: 60000,
  });

  const autoRecompute = useMutation({
    mutationFn: () =>
      apiFetch(`/operators/${id}/grow/self-awareness/recompute`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", id, "self-awareness"] });
    },
  });
  useEffect(() => {
    if (id) autoRecompute.mutate();
  }, [id]);

  useEffect(() => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (BRAIN_LEAVES.includes(activeTab))    next.add("brain");
      if (SETTINGS_LEAVES.includes(activeTab)) next.add("settings");
      return next;
    });
  }, [activeTab]);

  const toggleGroup = (gid: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  };

  const handleSelect = (tab: string) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  const healthScore = saData?.healthScore;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-primary animate-pulse">
        Loading...
      </div>
    );
  }

  if (!operator) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-destructive text-xl">
        Operator not found
      </div>
    );
  }

  function renderContent() {
    if (!operator) return null;
    switch (activeTab) {
      case "chat":               return <ChatSection operatorId={id} />;
      case "soul":
        return (
          <div className="space-y-8">
            <IdentitySection operator={operator} panel="identity" />
            <PersonalitySection operatorId={id} />
            <KbSection operatorId={id} />
          </div>
        );
      case "skills":             return <SkillsSection operatorId={id} />;
      case "memory":              return <MemorySection operatorId={id} />;
      case "grow":               return <GrowSection operatorId={id} saData={saData} />;
      case "tasks":              return <TasksSection operatorId={id} />;
      case "files":              return <FilesSection operator={operator} />;
      case "artifacts":          return <ArtifactsSection operatorId={id} />;
      case "connections":        return <IntegrationsSection operatorId={id} />;
      case "settings.model":     return <SettingsSection operator={operator} section="model" />;
      case "settings.secrets":   return <SettingsSection operator={operator} section="secrets" />;
      case "settings.api":       return <SettingsSection operator={operator} section="api" />;
      case "settings.behavior":  return <SettingsSection operator={operator} section="safemode" />;
      case "settings.evolution": return <SettingsSection operator={operator} section="evolution" />;
      case "settings.danger":    return <SettingsSection operator={operator} section="danger" />;
      case "feedback":           return <ComingSoon title="Leave Feedback" />;
      default:                   return <ChatSection operatorId={id} />;
    }
  }

  const renderNavItems = (items: NavItem[]) =>
    items.map(item => {
      if (item.kind === "leaf") {
        return (
          <SidebarLeaf
            key={item.id}
            item={item}
            activeTab={activeTab}
            onSelect={handleSelect}
          />
        );
      }
      return (
        <SidebarGroup
          key={item.id}
          item={item}
          activeTab={activeTab}
          onSelect={handleSelect}
          openGroups={openGroups}
          toggleGroup={toggleGroup}
        />
      );
    });

  return (
    <div className={`${activeTab === "chat" ? "h-screen overflow-hidden" : "min-h-screen"} flex flex-col bg-background`}>
      {/* Header */}
      <header className="h-12 border-b border-border/30 frosted-nav flex items-center px-3 shrink-0 justify-between sticky top-0 z-40 gap-2">
        <div className="flex items-center gap-2">
          {/* Mobile hamburger */}
          <button
            className="md:hidden p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileNavOpen(o => !o)}
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors p-1" data-testid="link-back">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          {/* Operator name on mobile */}
          <span className="md:hidden font-headline font-bold text-sm truncate max-w-32">{operator.name}</span>
        </div>

        <div className="flex items-center gap-2">
          {operator.safeMode && (
            <div className="flex items-center gap-1.5 text-xs border border-amber-500/30 rounded px-2 py-0.5 bg-amber-500/10 text-amber-500">
              <Shield className="w-3 h-3" />
              <span className="hidden sm:inline">Safe Mode</span>
            </div>
          )}
          {healthScore && (
            <div className="flex items-center gap-2 text-xs border border-border/50 rounded px-2.5 py-1 bg-background/50">
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
        </div>
      </header>

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-30 top-12">
          <div
            className="absolute inset-0 bg-background/80"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-sidebar border-r border-sidebar-border flex flex-col overflow-y-auto shadow-xl animate-in slide-in-from-left duration-200">
            <div className="shrink-0">
              <div className="h-20 relative overflow-hidden bg-muted">
                <img
                  src={PERSONA_IMAGES[operator.name.charCodeAt(0) % 3]}
                  alt={`${operator.name} portrait`}
                  className="w-full h-full object-cover object-top opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-sidebar/80 from-[5%] via-sidebar/10 via-[30%] to-transparent to-[60%]" />
              </div>
              <div className="px-4 py-3 border-b border-sidebar-border flex items-start gap-3">
                <OperatorAvatar name={operator.name} />
                <div className="min-w-0 flex-1">
                  <div className="font-headline font-bold text-sm truncate leading-tight text-sidebar-foreground">{operator.name}</div>
                  {operator.roles && operator.roles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {operator.roles.slice(0, 4).map((role) => (
                        <span key={role} className="text-[10px] text-sidebar-foreground/60 bg-sidebar-accent/50 border border-sidebar-border rounded px-1.5 py-0.5 leading-none">
                          {role}
                        </span>
                      ))}
                      {operator.roles.length > 4 && (
                        <span className="text-[10px] text-sidebar-foreground/40 leading-none px-1">
                          +{operator.roles.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-2 flex flex-col gap-0.5 flex-1 overflow-y-auto">
              {renderNavItems(NAV_MAIN)}
            </div>
            <div className="p-2 border-t border-sidebar-border flex flex-col gap-0.5">
              {renderNavItems(NAV_BOTTOM)}
            </div>
          </aside>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="w-56 border-r border-sidebar-border bg-sidebar flex-col shrink-0 overflow-y-auto hidden md:flex">
          <div className="shrink-0">
            <div className="h-20 relative overflow-hidden bg-muted">
              <img
                src={PERSONA_IMAGES[operator.name.charCodeAt(0) % 3]}
                alt={`${operator.name} portrait`}
                className="w-full h-full object-cover object-top opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-sidebar/80 from-[5%] via-sidebar/10 via-[30%] to-transparent to-[60%]" />
            </div>
            <div className="px-4 py-3 border-b border-sidebar-border flex items-center gap-3">
              <OperatorAvatar name={operator.name} />
              <div className="min-w-0">
                <div className="font-headline font-bold text-sm truncate leading-tight text-sidebar-foreground">{operator.name}</div>
              </div>
            </div>
          </div>
          <div className="p-2 flex flex-col gap-0.5 flex-1 overflow-y-auto">
            {renderNavItems(NAV_MAIN)}
          </div>
          <div className="p-2 border-t border-sidebar-border flex flex-col gap-0.5">
            {renderNavItems(NAV_BOTTOM)}
          </div>
        </aside>

        {/* Content */}
        <main className={`flex-1 bg-background relative ${activeTab === "chat" ? "overflow-hidden" : "overflow-y-auto"}`}>
          <div className={activeTab === "chat"
            ? "h-full w-full flex flex-col"
            : "p-4 md:p-8 max-w-5xl mx-auto"
          }>
            {renderContent()}
          </div>
        </main>
      </div>

    </div>
  );
}
