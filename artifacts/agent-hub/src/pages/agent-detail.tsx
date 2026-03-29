import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useGetAgent } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Layout } from "@/components/layout";
import { AgentIdentity } from "@/components/agent/AgentIdentity";
import { AgentKnowledge } from "@/components/agent/AgentKnowledge";
import { AgentInstructions } from "@/components/agent/AgentInstructions";
import { AgentChat } from "@/components/agent/AgentChat";
import { AgentConnections } from "@/components/agent/AgentConnections";
import { AgentActivity } from "@/components/agent/AgentActivity";
import {
  Loader2,
  Fingerprint,
  Database,
  BookOpen,
  MessageSquare,
  Network,
  Activity,
  ChevronLeft,
} from "lucide-react";
import { motion } from "framer-motion";

type Section = "identity" | "knowledge" | "instructions" | "chat" | "connections" | "activity";

const NAV = [
  { id: "identity" as const,     icon: Fingerprint,  labelKey: "identity" },
  { id: "knowledge" as const,    icon: Database,      labelKey: "knowledge" },
  { id: "instructions" as const, icon: BookOpen,      labelKey: "instructions" },
  { id: "chat" as const,         icon: MessageSquare, labelKey: "chat" },
  { id: "connections" as const,  icon: Network,       labelKey: "connections" },
  { id: "activity" as const,     icon: Activity,      labelKey: "activity" },
];

const SECTION_DESCRIPTIONS: Partial<Record<Section, string>> = {
  instructions: "permanentRulesDesc",
};

export default function AgentDetail() {
  const [, params] = useRoute("/agents/:id");
  const agentId = parseInt(params?.id || "0", 10);
  const { data: agent, isLoading } = useGetAgent(agentId, { query: { enabled: !!agentId } });
  const { t, dir } = useI18n();
  const [activeSection, setActiveSection] = useState<Section>("identity");

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

  return (
    <Layout noPadding>
      <div className="flex flex-col h-full overflow-hidden" dir={dir}>

        {/* ── Agent Header (full-width, above both columns) ── */}
        <div className="shrink-0 flex items-center gap-4 px-6 py-4 border-b border-white/5 bg-black/15">
          {agent.avatarUrl ? (
            <img
              src={agent.avatarUrl}
              alt={agent.name}
              className="w-12 h-12 rounded-xl object-cover border-2 border-primary/60 shadow-[0_0_14px_rgba(0,190,255,0.18)]"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-primary/10 border-2 border-primary/60 flex items-center justify-center text-primary text-base font-bold shadow-[0_0_14px_rgba(0,190,255,0.15)]">
              {agent.name.substring(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-white leading-tight">{agent.name}</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  agent.isActive ? "bg-green-500 shadow-[0_0_4px_#22c55e]" : "bg-red-500"
                }`}
              />
              <span className="text-xs text-muted-foreground">
                {agent.isActive ? t("active") : t("inactive")}
              </span>
            </div>
          </div>
        </div>

        {/* ── 2-column area ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left Sidebar */}
          <aside className="w-52 shrink-0 flex flex-col border-e border-white/5 bg-black/20 overflow-y-auto">

            {/* Nav Items */}
            <nav className="flex-1 py-2">
              {NAV.map(({ id, icon: Icon, labelKey }) => {
                const isActive = activeSection === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveSection(id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors relative
                      ${
                        isActive
                          ? "text-primary bg-primary/10 border-e-2 border-primary"
                          : "text-muted-foreground hover:bg-white/5 hover:text-white border-e-2 border-transparent"
                      }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {t(labelKey)}
                  </button>
                );
              })}
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

          {/* Right Content */}
          <div className={`flex-1 ${isChat ? "overflow-hidden" : "overflow-y-auto"}`}>
            {isChat ? (
              <AgentChat agent={agent} fullHeight />
            ) : (
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="p-7 max-w-3xl"
              >
                {/* Section heading */}
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-white">
                    {t(NAV.find((n) => n.id === activeSection)?.labelKey ?? "")}
                  </h3>
                  {SECTION_DESCRIPTIONS[activeSection] && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {t(SECTION_DESCRIPTIONS[activeSection]!)}
                    </p>
                  )}
                </div>

                {activeSection === "identity" && <AgentIdentity agent={agent} />}
                {activeSection === "knowledge" && <AgentKnowledge agent={agent} />}
                {activeSection === "instructions" && <AgentInstructions agent={agent} />}
                {activeSection === "connections" && <AgentConnections agent={agent} />}
                {activeSection === "activity" && <AgentActivity agent={agent} />}
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
