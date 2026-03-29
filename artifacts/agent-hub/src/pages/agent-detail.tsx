import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useGetAgent, useListMemories } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Layout } from "@/components/layout";
import { AgentIdentity } from "@/components/agent/AgentIdentity";
import { AgentKnowledge } from "@/components/agent/AgentKnowledge";
import { AgentInstructions } from "@/components/agent/AgentInstructions";
import { AgentChat } from "@/components/agent/AgentChat";
import { AgentConnections } from "@/components/agent/AgentConnections";
import { AgentActivity } from "@/components/agent/AgentActivity";
import { AgentMemory } from "@/components/agent/AgentMemory";
import { AgentTools } from "@/components/agent/AgentTools";
import { AgentSettings } from "@/components/agent/AgentSettings";
import { AgentPublicAPI } from "@/components/agent/AgentPublicAPI";
import { AgentAutomations } from "@/components/agent/AgentAutomations";
import {
  Loader2,
  Fingerprint,
  Database,
  BookOpen,
  MessageSquare,
  Network,
  Activity,
  Brain,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Wrench,
  Settings,
  Globe2,
  Sparkles,
  Timer,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Section =
  | "chat"
  | "identity"
  | "knowledge"
  | "memory"
  | "instructions"
  | "tools"
  | "automations"
  | "connections"
  | "publicApi"
  | "activity"
  | "settings";

export default function AgentDetail() {
  const [, params] = useRoute("/agents/:id");
  const agentId = parseInt(params?.id || "0", 10);
  const { data: agent, isLoading } = useGetAgent(agentId, { query: { enabled: !!agentId } });
  const { data: memories } = useListMemories(agentId, { query: { enabled: !!agentId } });
  const { t, dir } = useI18n();
  const [activeSection, setActiveSection] = useState<Section>("chat");
  const [brainOpen, setBrainOpen] = useState(false);
  const memoryCount = memories?.length ?? 0;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!agent) {
    return (
      <Layout>
        <div className="text-center py-20 text-muted-foreground">Agent not found</div>
      </Layout>
    );
  }

  const isChat = activeSection === "chat";

  const navItem = (
    id: Section,
    icon: React.ElementType,
    labelKey: string,
    badge?: React.ReactNode
  ) => {
    const Icon = icon;
    const active = activeSection === id;
    return (
      <button
        key={id}
        onClick={() => setActiveSection(id)}
        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-all relative group
          ${active
            ? "text-primary bg-primary/10 border-e-2 border-primary"
            : "text-muted-foreground hover:bg-white/5 hover:text-white border-e-2 border-transparent"
          }`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground group-hover:text-white"}`} />
        <span className="flex-1 text-start truncate">{t(labelKey)}</span>
        {badge}
      </button>
    );
  };

  const brainActive = ["knowledge", "memory", "instructions"].includes(activeSection);

  const SECTION_TITLES: Record<Section, string> = {
    chat: "chat",
    identity: "identity",
    knowledge: "knowledge",
    memory: "memory",
    instructions: "instructions",
    tools: "tools",
    automations: "automations",
    connections: "connections",
    publicApi: "publicApi",
    activity: "activity",
    settings: "settings",
  };

  const SECTION_DESCS: Partial<Record<Section, string>> = {
    identity: "identityHint",
    memory: "memoryDesc",
    instructions: "permanentRulesDesc",
    tools: "toolsDesc",
    automations: "automationsDesc",
    settings: "settingsDesc",
    publicApi: "publicApiDesc",
  };

  return (
    <Layout noPadding>
      <div className="flex flex-col h-full overflow-hidden" dir={dir}>

        {/* ── Agent Header ── */}
        <div className="shrink-0 flex items-center gap-4 px-5 py-3.5 border-b border-white/5 bg-black/20">
          {agent.avatarUrl ? (
            <img
              src={agent.avatarUrl}
              alt={agent.name}
              className="w-10 h-10 rounded-xl object-cover border-2 border-primary/50 shadow-[0_0_12px_rgba(0,190,255,0.16)]"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-primary/10 border-2 border-primary/50 flex items-center justify-center text-primary text-sm font-bold shadow-[0_0_12px_rgba(0,190,255,0.12)]">
              {agent.name.substring(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white leading-tight truncate">{agent.name}</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${agent.isActive ? "bg-green-500 shadow-[0_0_4px_#22c55e]" : "bg-red-500"}`} />
              <span className="text-[11px] text-muted-foreground">{agent.isActive ? t("active") : t("inactive")}</span>
            </div>
          </div>
        </div>

        {/* ── 2-column layout ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Sidebar ── */}
          <aside className="w-56 shrink-0 flex flex-col border-e border-white/5 bg-black/25 overflow-y-auto">

            {/* ── CHAT — featured primary button ── */}
            <div className="p-3 shrink-0">
              <button
                onClick={() => setActiveSection("chat")}
                className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  isChat
                    ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(0,190,255,0.25)]"
                    : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                }`}
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span>{t("chat")}</span>
                {isChat && <Sparkles className="w-3.5 h-3.5 ms-auto animate-pulse" />}
              </button>
            </div>

            <div className="border-t border-white/5 mx-3" />

            {/* ── MAIN NAV ── */}
            <nav className="flex-1 py-2 space-y-0.5">

              {/* Identity */}
              {navItem("identity", Fingerprint, "identity")}

              {/* ── BRAIN GROUP ── */}
              <div>
                <button
                  onClick={() => {
                    setBrainOpen(v => !v);
                    if (!brainOpen && !brainActive) setActiveSection("knowledge");
                  }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-all
                    ${brainActive
                      ? "text-primary bg-primary/8"
                      : "text-muted-foreground hover:bg-white/5 hover:text-white"
                    }`}
                >
                  <Brain className={`w-4 h-4 shrink-0 ${brainActive ? "text-primary" : ""}`} />
                  <span className="flex-1 text-start">{t("brain")}</span>
                  {brainOpen
                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  }
                </button>

                <AnimatePresence initial={false}>
                  {brainOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="ps-4 border-s border-primary/15 ms-6 my-1 space-y-0.5">
                        {/* Knowledge */}
                        <button
                          onClick={() => setActiveSection("knowledge")}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-all rounded-lg
                            ${activeSection === "knowledge"
                              ? "text-primary bg-primary/10 font-medium"
                              : "text-muted-foreground hover:text-white hover:bg-white/5"
                            }`}
                        >
                          <Database className="w-3.5 h-3.5 shrink-0" />
                          <span>{t("knowledge")}</span>
                        </button>

                        {/* Memory */}
                        <button
                          onClick={() => setActiveSection("memory")}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-all rounded-lg
                            ${activeSection === "memory"
                              ? "text-primary bg-primary/10 font-medium"
                              : "text-muted-foreground hover:text-white hover:bg-white/5"
                            }`}
                        >
                          <Brain className="w-3.5 h-3.5 shrink-0" />
                          <span className="flex-1 text-start">{t("memory")}</span>
                          {memoryCount > 0 && (
                            <span className="text-[9px] font-mono bg-primary/20 text-primary rounded-full px-1.5 py-0.5 leading-none">
                              {memoryCount}
                            </span>
                          )}
                        </button>

                        {/* Permanent Rules */}
                        <button
                          onClick={() => setActiveSection("instructions")}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-all rounded-lg
                            ${activeSection === "instructions"
                              ? "text-primary bg-primary/10 font-medium"
                              : "text-muted-foreground hover:text-white hover:bg-white/5"
                            }`}
                        >
                          <BookOpen className="w-3.5 h-3.5 shrink-0" />
                          <span>{t("instructions")}</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Tools */}
              {navItem("tools", Wrench, "tools")}

              {/* Automations */}
              {navItem("automations", Timer, "automations")}

              <div className="mx-4 border-t border-white/5 my-1" />

              {/* Connections */}
              {navItem("connections", Network, "connections")}

              {/* Public API */}
              {navItem("publicApi", Globe2, "publicApi")}

              <div className="mx-4 border-t border-white/5 my-1" />

              {/* Activity */}
              {navItem("activity", Activity, "activity")}

              {/* Settings */}
              {navItem("settings", Settings, "settings")}
            </nav>

            {/* Back link */}
            <div className="p-4 border-t border-white/5 shrink-0">
              <Link
                href="/"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                {t("allAgents")}
              </Link>
            </div>
          </aside>

          {/* ── Content area ── */}
          <div className={`flex-1 ${isChat ? "overflow-hidden" : "overflow-y-auto"}`}>
            {isChat ? (
              <AgentChat agent={agent} fullHeight />
            ) : (
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="p-7 max-w-3xl"
              >
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-white">
                    {t(SECTION_TITLES[activeSection])}
                  </h3>
                  {SECTION_DESCS[activeSection] && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {t(SECTION_DESCS[activeSection]!)}
                    </p>
                  )}
                </div>

                {activeSection === "identity" && <AgentIdentity agent={agent} />}
                {activeSection === "knowledge" && <AgentKnowledge agent={agent} />}
                {activeSection === "memory" && <AgentMemory agentId={agent.id} />}
                {activeSection === "instructions" && <AgentInstructions agent={agent} />}
                {activeSection === "tools" && <AgentTools agentId={agent.id} />}
                {activeSection === "automations" && <AgentAutomations agentId={agent.id} />}
                {activeSection === "connections" && <AgentConnections agent={agent} />}
                {activeSection === "publicApi" && <AgentPublicAPI agent={agent} />}
                {activeSection === "activity" && <AgentActivity agent={agent} />}
                {activeSection === "settings" && <AgentSettings agent={agent} />}
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
