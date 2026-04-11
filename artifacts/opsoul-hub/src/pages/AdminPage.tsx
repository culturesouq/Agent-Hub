import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import NebulaBlobs from "@/components/ui/NebulaBlobs";

interface PlatformStats {
  totalOwners: number;
  totalOperators: number;
  messagesLast24h: number;
  driftAlerts: number;
}

interface AdminOwner {
  id: string;
  email: string;
  name: string | null;
  isSovereignAdmin: boolean;
  createdAt: string;
  operatorCount: number;
}

interface AdminOperator {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  archetype: string[];
  safeMode: boolean;
  growLockLevel: string;
  driftScore: number | null;
  messageCount: number;
  createdAt: string;
}

interface DriftAlert {
  id: string;
  operatorId: string;
  operatorName: string;
  ownerEmail: string;
  driftScore: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface RagEntry {
  id: string;
  layer: "builder" | "archetype" | "collective";
  archetype: string | null;
  title: string;
  content: string;
  tags: string[];
  isActive: boolean;
  hasEmbedding: boolean;
  dnaScope: "general" | "specialty" | null;
  archetypeScope: string[] | null;
  domainTags: string[] | null;
  createdAt: string;
}

interface RagStats {
  builderCount: number;
  archetypeCount: number;
  collectiveCount: number;
  totalActive: number;
  pipelineEnabled: boolean;
  lastRunAt: string | null;
  lastRunCount: number;
  totalExtracted: number;
}

interface PipelineConfig {
  id: string;
  enabled: boolean;
  minConfidenceScore: number;
  deduplicationThreshold: number;
  lastRunAt: string | null;
  lastRunCount: number;
  totalExtracted: number;
}

const ARCHETYPES = ["Advisor", "Executor", "Expert", "Connector", "Creator", "Guardian", "Builder", "Catalyst", "Analyst"];

type Tab = "overview" | "owners" | "operators" | "drift" | "rag" | "vael";

interface VaelScheduleState {
  isRunning: boolean;
  lastRunType: "full" | "validate" | null;
  lastRunAt: string | null;
  lastRunDurationSec: number | null;
  lastRunSummary: string | null;
  sweepSchedule: string;
  validateSchedule: string;
}

function StatCard({ label, value, color, glow }: {
  label: string;
  value: number | string;
  color: string;
  glow: string;
}) {
  return (
    <div className="glass-panel p-8 relative overflow-hidden">
      <div className={`absolute inset-0 ${glow} pointer-events-none`} />
      <div className={`font-headline text-5xl font-bold mb-2 ${color}`} style={{ letterSpacing: "-0.04em" }}>
        {value}
      </div>
      <div className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
    </div>
  );
}

function DriftBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground text-xs font-mono">—</span>;
  const pct = Math.min(score * 100, 100);
  const color = score > 0.30 ? "#fbbf24" : "#40cef3";
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 h-1 bg-surface-container-highest rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
      <span className="font-mono text-xs" style={{ color }}>{(score * 100).toFixed(1)}%</span>
    </div>
  );
}

function GrowBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    OPEN: "text-secondary",
    CONTROLLED: "text-primary",
    LOCKED: "text-amber-400",
    FROZEN: "text-destructive",
  };
  return (
    <span className={`font-label text-[10px] uppercase tracking-widest ${colors[level] ?? "text-muted-foreground"}`}>
      {level}
    </span>
  );
}

export default function AdminPage() {
  const { owner, token } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [owners, setOwners] = useState<AdminOwner[]>([]);
  const [operators, setOperators] = useState<AdminOperator[]>([]);
  const [driftAlerts, setDriftAlerts] = useState<DriftAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [ragStats, setRagStats] = useState<RagStats | null>(null);
  const [ragEntries, setRagEntries] = useState<RagEntry[]>([]);
  const [ragPipeline, setRagPipeline] = useState<PipelineConfig | null>(null);
  const [ragSubTab, setRagSubTab] = useState<"builder" | "archetype" | "collective">("builder");
  const [ragArchetypeFilter, setRagArchetypeFilter] = useState<string>("");
  const [ragForm, setRagForm] = useState({ title: "", content: "", archetype: "", tags: "" });
  const [ragSaving, setRagSaving] = useState(false);
  const [ragRunning, setRagRunning] = useState(false);
  const [ragRunResult, setRagRunResult] = useState<{
    extracted: number;
    candidatesScanned: number;
    filteredByScreener: number;
    filteredByDedup: number;
    screenerRejections: { content: string; reason: string }[];
  } | null>(null);

  const [vaelSchedule, setVaelSchedule] = useState<VaelScheduleState | null>(null);
  const [vaelSweeping, setVaelSweeping] = useState(false);

  const loadRag = useCallback(async () => {
    const [s, entries, pipeline] = await Promise.all([
      apiFetch<RagStats>("/admin/rag/stats"),
      apiFetch<RagEntry[]>("/admin/rag/entries"),
      apiFetch<PipelineConfig>("/admin/rag/pipeline"),
    ]);
    setRagStats(s);
    setRagEntries(entries);
    setRagPipeline(pipeline);
  }, []);

  useEffect(() => {
    if (!token) return;
    if (!owner?.isSovereignAdmin) {
      setLocation("/");
      return;
    }

    async function load() {
      try {
        const [s, o, ops, drift] = await Promise.all([
          apiFetch<PlatformStats>("/admin/stats"),
          apiFetch<AdminOwner[]>("/admin/owners"),
          apiFetch<AdminOperator[]>("/admin/operators"),
          apiFetch<DriftAlert[]>("/admin/drift-alerts"),
        ]);
        setStats(s);
        setOwners(o);
        setOperators(ops);
        setDriftAlerts(drift);
        await loadRag();
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, owner, setLocation, loadRag]);

  useEffect(() => {
    if (tab === "vael") loadVaelSchedule();
  }, [tab]);

  async function toggleAdmin(id: string) {
    setTogglingId(id);
    try {
      const updated = await apiFetch<{ id: string; isSovereignAdmin: boolean }>(
        `/admin/owners/${id}/toggle-admin`,
        { method: "PATCH" }
      );
      setOwners((prev) =>
        prev.map((o) => o.id === updated.id ? { ...o, isSovereignAdmin: updated.isSovereignAdmin } : o)
      );
    } finally {
      setTogglingId(null);
    }
  }

  async function saveRagEntry() {
    if (!ragForm.title.trim() || !ragForm.content.trim()) return;
    setRagSaving(true);
    try {
      await apiFetch("/admin/rag/entries", {
        method: "POST",
        body: JSON.stringify({
          layer: ragSubTab,
          archetype: ragSubTab === "archetype" ? ragForm.archetype : undefined,
          title: ragForm.title.trim(),
          content: ragForm.content.trim(),
          tags: ragForm.tags ? ragForm.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        }),
      });
      setRagForm({ title: "", content: "", archetype: "", tags: "" });
      await loadRag();
    } finally {
      setRagSaving(false);
    }
  }

  async function toggleRagEntry(id: string, isActive: boolean) {
    await apiFetch(`/admin/rag/entries/${id}`, { method: "PUT", body: JSON.stringify({ isActive: !isActive }) });
    setRagEntries((prev) => prev.map((e) => e.id === id ? { ...e, isActive: !isActive } : e));
    setRagStats((prev) => prev ? { ...prev, totalActive: prev.totalActive + (isActive ? -1 : 1) } : prev);
  }

  async function deleteRagEntry(id: string) {
    await apiFetch(`/admin/rag/entries/${id}`, { method: "DELETE" });
    await loadRag();
  }

  async function patchEntryScope(id: string, patch: { dnaScope?: "general" | "specialty"; archetypeScope?: string[]; domainTags?: string[] }) {
    const updated = await apiFetch<RagEntry>(`/admin/rag/entries/${id}/scope`, { method: "PATCH", body: JSON.stringify(patch) });
    setRagEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...updated } : e));
  }

  async function savePipelineConfig(updates: Partial<PipelineConfig>) {
    const updated = await apiFetch<PipelineConfig>("/admin/rag/pipeline", { method: "PUT", body: JSON.stringify(updates) });
    setRagPipeline(updated);
  }

  async function runPipeline() {
    setRagRunning(true);
    setRagRunResult(null);
    try {
      const result = await apiFetch<{ extracted: number; candidatesScanned: number }>("/admin/rag/pipeline/run", { method: "POST" });
      setRagRunResult(result);
      await loadRag();
    } finally {
      setRagRunning(false);
    }
  }

  async function loadVaelSchedule() {
    const s = await apiFetch<VaelScheduleState>("/vael/schedule");
    setVaelSchedule(s);
  }

  async function triggerVaelSweep(type: "full" | "validate") {
    setVaelSweeping(true);
    await apiFetch(`/vael/sweep${type === "validate" ? "/validate" : ""}`, { method: "POST" });
    // poll for completion
    const poll = setInterval(async () => {
      const s = await apiFetch<VaelScheduleState>("/vael/schedule");
      setVaelSchedule(s);
      if (!s.isRunning) {
        clearInterval(poll);
        setVaelSweeping(false);
      }
    }, 4000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary font-mono tracking-widest text-xs uppercase animate-pulse">
          Initializing Sovereign Console...
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "owners", label: "Owners", count: owners.length },
    { id: "operators", label: "Operators", count: operators.length },
    { id: "drift", label: "Drift Alerts", count: driftAlerts.length },
    { id: "rag", label: "Intelligence", count: ragStats?.totalActive },
    { id: "vael", label: "Vael" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <NebulaBlobs />
      <div className="fixed inset-0 dot-grid opacity-10 pointer-events-none z-0" />

      {/* Header */}
      <header className="frosted-nav sticky top-0 z-50 px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/" className="font-headline text-xl text-primary tracking-tight">OpSoul</a>
          <span className="text-muted-foreground/40 font-mono text-xs">/</span>
          <div className="flex items-center gap-2">
            <span className="status-beacon" />
            <span className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary">
              Sovereign Console
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <span className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">
            {owner?.email}
          </span>
          <a href="/" className="font-label text-[10px] uppercase tracking-widest text-primary hover:opacity-70 transition-opacity">
            Exit Console
          </a>
        </div>
      </header>

      <main className="relative z-10 px-8 max-w-7xl mx-auto py-12">

        {/* Page title */}
        <div className="mb-12">
          <h1 className="headline-lg text-4xl md:text-5xl font-bold text-on-surface mb-3">
            Sovereign <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Command Center</span>
          </h1>
          <p className="font-sans text-on-surface-variant text-sm">
            Full platform visibility. All operators, all owners, all intelligence streams.
          </p>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            <StatCard
              label="Total Owners"
              value={stats.totalOwners}
              color="text-primary"
              glow="bg-[radial-gradient(circle_at_top-left,rgba(205,150,255,0.06),transparent_60%)]"
            />
            <StatCard
              label="Total Operators"
              value={stats.totalOperators}
              color="text-secondary"
              glow="bg-[radial-gradient(circle_at_top-left,rgba(64,206,243,0.06),transparent_60%)]"
            />
            <StatCard
              label="Messages (24h)"
              value={stats.messagesLast24h.toLocaleString()}
              color="text-primary"
              glow="bg-[radial-gradient(circle_at_top-left,rgba(205,150,255,0.06),transparent_60%)]"
            />
            <StatCard
              label="Drift Alerts"
              value={stats.driftAlerts}
              color={stats.driftAlerts > 0 ? "text-amber-400" : "text-secondary"}
              glow={stats.driftAlerts > 0
                ? "bg-[radial-gradient(circle_at_top-left,rgba(251,191,36,0.08),transparent_60%)]"
                : "bg-[radial-gradient(circle_at_top-left,rgba(64,206,243,0.06),transparent_60%)]"
              }
            />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-8">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2 font-label text-[10px] uppercase tracking-widest transition-all ${
                tab === t.id
                  ? "bg-primary-container text-on-primary-container shadow-[inset_0_1px_0_rgba(205,150,255,0.20)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {t.label}{t.count !== undefined ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === "overview" && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="glass-panel p-8">
              <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-6">
                Most Active Operators
              </h3>
              <div className="space-y-4">
                {[...operators]
                  .sort((a, b) => b.messageCount - a.messageCount)
                  .slice(0, 5)
                  .map((op) => (
                    <div key={op.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-sans text-sm text-on-surface">{op.name}</div>
                        <div className="font-label text-[10px] text-muted-foreground mt-0.5">{op.ownerEmail}</div>
                      </div>
                      <span className="font-mono text-xs text-secondary">
                        {op.messageCount.toLocaleString()} msg
                      </span>
                    </div>
                  ))}
                {operators.length === 0 && (
                  <p className="text-muted-foreground text-sm">No operators yet.</p>
                )}
              </div>
            </div>

            <div className="glass-panel p-8">
              <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-6">
                Recent Registrations
              </h3>
              <div className="space-y-4">
                {[...owners]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 5)
                  .map((o) => (
                    <div key={o.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-sans text-sm text-on-surface">{o.email}</div>
                        <div className="font-label text-[10px] text-muted-foreground mt-0.5">
                          {o.operatorCount} operator{o.operatorCount !== 1 ? "s" : ""}
                        </div>
                      </div>
                      {o.isSovereignAdmin && (
                        <span className="font-label text-[10px] uppercase tracking-widest text-primary">
                          Admin
                        </span>
                      )}
                    </div>
                  ))}
                {owners.length === 0 && (
                  <p className="text-muted-foreground text-sm">No owners yet.</p>
                )}
              </div>
            </div>

            {driftAlerts.length > 0 && (
              <div className="glass-panel p-8 md:col-span-2 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-400/60" />
                <div className="flex items-center gap-3 mb-6">
                  <span className="status-beacon-warn" />
                  <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-amber-400">
                    Active Drift Warnings
                  </h3>
                </div>
                <div className="space-y-3">
                  {driftAlerts.slice(0, 3).map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-sans text-sm text-on-surface">{alert.operatorName}</div>
                        <div className="font-label text-[10px] text-muted-foreground mt-0.5">{alert.ownerEmail}</div>
                      </div>
                      <DriftBar score={alert.driftScore} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Owners tab */}
        {tab === "owners" && (
          <div className="glass-panel overflow-hidden">
            <div className="px-8 py-5 flex items-center justify-between">
              <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                All Owners — {owners.length} total
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-container-high/50">
                    {["Email", "Name", "Operators", "Registered", "Role"].map((h) => (
                      <th key={h} className="pl-8 pr-4 py-3 text-left font-label text-[10px] uppercase tracking-widest text-muted-foreground first:pl-8">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {owners.map((o, i) => (
                    <tr
                      key={o.id}
                      className={i % 2 === 0 ? "bg-transparent" : "bg-surface-container/30"}
                    >
                      <td className="pl-8 pr-4 py-4 font-mono text-sm text-on-surface">{o.email}</td>
                      <td className="pl-8 pr-4 py-4 font-sans text-sm text-on-surface-variant">{o.name ?? "—"}</td>
                      <td className="pl-8 pr-4 py-4 font-mono text-sm text-secondary">{o.operatorCount}</td>
                      <td className="pl-8 pr-4 py-4 font-label text-[10px] text-muted-foreground">
                        {new Date(o.createdAt).toLocaleDateString()}
                      </td>
                      <td className="pl-8 pr-4 py-4">
                        <button
                          onClick={() => toggleAdmin(o.id)}
                          disabled={togglingId === o.id || o.id === owner?.id}
                          className={`font-label text-[10px] uppercase tracking-widest transition-opacity ${
                            o.isSovereignAdmin ? "text-primary" : "text-muted-foreground hover:text-primary"
                          } disabled:opacity-40`}
                        >
                          {togglingId === o.id ? "..." : o.isSovereignAdmin ? "Sovereign" : "Standard"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {owners.length === 0 && (
                    <tr>
                      <td colSpan={5} className="pl-8 py-12 text-muted-foreground text-sm">No owners registered.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Operators tab */}
        {tab === "operators" && (
          <div className="glass-panel overflow-hidden">
            <div className="px-8 py-5">
              <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                All Operators — {operators.length} total
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-container-high/50">
                    {["Operator", "Owner", "Archetype", "Messages", "Drift", "GROW", "Safe"].map((h) => (
                      <th key={h} className="pl-8 pr-4 py-3 text-left font-label text-[10px] uppercase tracking-widest text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {operators.map((op, i) => (
                    <tr
                      key={op.id}
                      className={i % 2 === 0 ? "bg-transparent" : "bg-surface-container/30"}
                    >
                      <td className="pl-8 pr-4 py-4 font-sans text-sm text-on-surface">{op.name}</td>
                      <td className="pl-8 pr-4 py-4 font-mono text-xs text-muted-foreground">{op.ownerEmail}</td>
                      <td className="pl-8 pr-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(op.archetype ?? []).slice(0, 2).map((a: string) => (
                            <span key={a} className="font-label text-[9px] uppercase tracking-widest text-secondary">
                              {a}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="pl-8 pr-4 py-4 font-mono text-xs text-on-surface-variant">
                        {op.messageCount.toLocaleString()}
                      </td>
                      <td className="pl-8 pr-4 py-4">
                        <DriftBar score={op.driftScore} />
                      </td>
                      <td className="pl-8 pr-4 py-4">
                        <GrowBadge level={op.growLockLevel} />
                      </td>
                      <td className="pl-8 pr-4 py-4">
                        {op.safeMode
                          ? <span className="font-label text-[10px] uppercase tracking-widest text-amber-400">On</span>
                          : <span className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">Off</span>
                        }
                      </td>
                    </tr>
                  ))}
                  {operators.length === 0 && (
                    <tr>
                      <td colSpan={7} className="pl-8 py-12 text-muted-foreground text-sm">No operators found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Drift alerts tab */}
        {tab === "drift" && (
          <div className="space-y-4">
            {driftAlerts.length === 0 ? (
              <div className="glass-panel p-12 text-center">
                <div className="text-secondary mb-4">
                  <span className="status-beacon mx-auto block" />
                </div>
                <p className="font-headline text-xl text-on-surface mb-2">All Systems Nominal</p>
                <p className="text-muted-foreground font-sans text-sm">No soul drift events detected across the operator network.</p>
              </div>
            ) : (
              driftAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="glass-panel p-8 relative overflow-hidden flex items-center justify-between gap-8"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-400/60" />
                  <div className="pl-4">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="status-beacon-warn" />
                      <span className="font-sans text-base text-on-surface">{alert.operatorName}</span>
                    </div>
                    <div className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">
                      {alert.ownerEmail} · Flagged {new Date(alert.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-8 flex-shrink-0">
                    <DriftBar score={alert.driftScore} />
                    <span className={`font-label text-[10px] uppercase tracking-widest ${alert.resolvedAt ? "text-secondary" : "text-amber-400"}`}>
                      {alert.resolvedAt ? "Resolved" : "Unresolved"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {/* RAG Intelligence tab */}
        {tab === "rag" && (
          <div className="space-y-6">
            {/* Stats row */}
            {ragStats && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-panel p-6">
                  <div className="font-headline text-3xl font-bold text-primary mb-1">{ragStats.builderCount}</div>
                  <div className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Builder DNA</div>
                </div>
                <div className="glass-panel p-6">
                  <div className="font-headline text-3xl font-bold text-secondary mb-1">{ragStats.archetypeCount}</div>
                  <div className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Archetype DNA</div>
                </div>
                <div className="glass-panel p-6">
                  <div className="font-headline text-3xl font-bold text-primary mb-1">{ragStats.collectiveCount}</div>
                  <div className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Collective</div>
                </div>
                <div className="glass-panel p-6">
                  <div className="font-headline text-3xl font-bold text-secondary mb-1">{ragStats.totalExtracted}</div>
                  <div className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Total Extracted</div>
                </div>
              </div>
            )}

            {/* Sub-tabs */}
            <div className="flex gap-1">
              {(["builder", "archetype", "collective"] as const).map((sub) => (
                <button
                  key={sub}
                  onClick={() => { setRagSubTab(sub); setRagForm({ title: "", content: "", archetype: "", tags: "" }); }}
                  className={`px-5 py-2 font-label text-[10px] uppercase tracking-widest transition-all ${
                    ragSubTab === sub
                      ? "bg-primary-container text-on-primary-container shadow-[inset_0_1px_0_rgba(205,150,255,0.20)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  {sub === "builder" ? "Builder DNA" : sub === "archetype" ? "Archetype DNA" : "Collective Pipeline"}
                </button>
              ))}
            </div>

            {/* Builder DNA */}
            {ragSubTab === "builder" && (
              <div className="space-y-4">
                <div className="glass-panel p-6 space-y-4">
                  <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Add Builder DNA Entry</h3>
                  <input
                    placeholder="Title — e.g. Gmail Permission Constraints"
                    value={ragForm.title}
                    onChange={(e) => setRagForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full bg-surface-container/50 border border-border/40 rounded-lg px-4 py-2.5 text-sm font-sans text-foreground focus:outline-none focus:border-primary/50"
                  />
                  <textarea
                    placeholder="Knowledge content — what every operator should inherently know..."
                    value={ragForm.content}
                    onChange={(e) => setRagForm((f) => ({ ...f, content: e.target.value }))}
                    rows={4}
                    className="w-full bg-surface-container/50 border border-border/40 rounded-lg px-4 py-2.5 text-sm font-sans text-foreground focus:outline-none focus:border-primary/50 resize-none"
                  />
                  <div className="flex items-center gap-3">
                    <input
                      placeholder="Tags (comma-separated)"
                      value={ragForm.tags}
                      onChange={(e) => setRagForm((f) => ({ ...f, tags: e.target.value }))}
                      className="flex-1 bg-surface-container/50 border border-border/40 rounded-lg px-4 py-2.5 text-sm font-sans text-foreground focus:outline-none focus:border-primary/50"
                    />
                    <button
                      onClick={saveRagEntry}
                      disabled={ragSaving || !ragForm.title.trim() || !ragForm.content.trim()}
                      className="px-6 py-2.5 bg-primary text-primary-foreground font-label text-[10px] uppercase tracking-widest rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
                    >
                      {ragSaving ? "Embedding…" : "Add Entry"}
                    </button>
                  </div>
                </div>

                <div className="glass-panel overflow-hidden">
                  <div className="px-6 py-4 border-b border-border/30">
                    <span className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {ragEntries.filter((e) => e.layer === "builder").length} Builder Entries
                    </span>
                  </div>
                  {ragEntries.filter((e) => e.layer === "builder").map((entry) => (
                    <div key={entry.id} className={`px-6 py-4 border-b border-border/20 flex items-start justify-between gap-4 ${!entry.isActive ? "opacity-40" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-sans text-sm text-on-surface">{entry.title}</span>
                          {entry.hasEmbedding && <span className="font-label text-[9px] uppercase tracking-widest text-secondary">Embedded</span>}
                        </div>
                        <p className="text-xs text-muted-foreground font-sans line-clamp-2">{entry.content}</p>
                        {entry.tags.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {entry.tags.map((t) => (
                              <span key={t} className="font-label text-[9px] uppercase tracking-widest text-primary/60 border border-primary/20 rounded px-1.5 py-0.5">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <button onClick={() => toggleRagEntry(entry.id, entry.isActive)} className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
                          {entry.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button onClick={() => deleteRagEntry(entry.id)} className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors">
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {ragEntries.filter((e) => e.layer === "builder").length === 0 && (
                    <div className="px-6 py-12 text-center text-muted-foreground text-sm">No builder DNA entries yet. Add platform knowledge above.</div>
                  )}
                </div>
              </div>
            )}

            {/* Archetype DNA */}
            {ragSubTab === "archetype" && (
              <div className="space-y-4">
                <div className="glass-panel p-6 space-y-4">
                  <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Add Archetype DNA Entry</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="Title"
                      value={ragForm.title}
                      onChange={(e) => setRagForm((f) => ({ ...f, title: e.target.value }))}
                      className="w-full bg-surface-container/50 border border-border/40 rounded-lg px-4 py-2.5 text-sm font-sans text-foreground focus:outline-none focus:border-primary/50"
                    />
                    <select
                      value={ragForm.archetype}
                      onChange={(e) => setRagForm((f) => ({ ...f, archetype: e.target.value }))}
                      className="w-full bg-surface-container/50 border border-border/40 rounded-lg px-4 py-2.5 text-sm font-sans text-foreground focus:outline-none focus:border-primary/50"
                    >
                      <option value="">Select Archetype</option>
                      {ARCHETYPES.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <textarea
                    placeholder="Domain knowledge this archetype inherently knows..."
                    value={ragForm.content}
                    onChange={(e) => setRagForm((f) => ({ ...f, content: e.target.value }))}
                    rows={4}
                    className="w-full bg-surface-container/50 border border-border/40 rounded-lg px-4 py-2.5 text-sm font-sans text-foreground focus:outline-none focus:border-primary/50 resize-none"
                  />
                  <div className="flex items-center gap-3">
                    <input
                      placeholder="Tags (comma-separated)"
                      value={ragForm.tags}
                      onChange={(e) => setRagForm((f) => ({ ...f, tags: e.target.value }))}
                      className="flex-1 bg-surface-container/50 border border-border/40 rounded-lg px-4 py-2.5 text-sm font-sans text-foreground focus:outline-none focus:border-primary/50"
                    />
                    <button
                      onClick={saveRagEntry}
                      disabled={ragSaving || !ragForm.title.trim() || !ragForm.content.trim() || !ragForm.archetype}
                      className="px-6 py-2.5 bg-primary text-primary-foreground font-label text-[10px] uppercase tracking-widest rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
                    >
                      {ragSaving ? "Embedding…" : "Add Entry"}
                    </button>
                  </div>
                </div>

                {/* Archetype filter */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setRagArchetypeFilter("")}
                    className={`px-4 py-1.5 font-label text-[10px] uppercase tracking-widest rounded-full border transition-all ${!ragArchetypeFilter ? "border-primary text-primary" : "border-border/40 text-muted-foreground hover:border-primary/50"}`}
                  >
                    All
                  </button>
                  {ARCHETYPES.map((a) => (
                    <button
                      key={a}
                      onClick={() => setRagArchetypeFilter(a === ragArchetypeFilter ? "" : a)}
                      className={`px-4 py-1.5 font-label text-[10px] uppercase tracking-widest rounded-full border transition-all ${ragArchetypeFilter === a ? "border-primary text-primary" : "border-border/40 text-muted-foreground hover:border-primary/50"}`}
                    >
                      {a}
                    </button>
                  ))}
                </div>

                <div className="glass-panel overflow-hidden">
                  {ragEntries
                    .filter((e) => e.layer === "archetype" && (!ragArchetypeFilter || e.archetype === ragArchetypeFilter))
                    .map((entry) => (
                      <div key={entry.id} className={`px-6 py-4 border-b border-border/20 flex items-start justify-between gap-4 ${!entry.isActive ? "opacity-40" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-label text-[9px] uppercase tracking-widest text-secondary">{entry.archetype}</span>
                            <span className="font-sans text-sm text-on-surface">{entry.title}</span>
                            {entry.hasEmbedding && <span className="font-label text-[9px] uppercase tracking-widest text-primary/60">Embedded</span>}
                          </div>
                          <p className="text-xs text-muted-foreground font-sans line-clamp-2">{entry.content}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <button onClick={() => toggleRagEntry(entry.id, entry.isActive)} className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
                            {entry.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button onClick={() => deleteRagEntry(entry.id)} className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors">
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  {ragEntries.filter((e) => e.layer === "archetype" && (!ragArchetypeFilter || e.archetype === ragArchetypeFilter)).length === 0 && (
                    <div className="px-6 py-12 text-center text-muted-foreground text-sm">
                      {ragArchetypeFilter ? `No DNA entries for ${ragArchetypeFilter} yet.` : "No archetype DNA entries yet."}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Collective Pipeline */}
            {ragSubTab === "collective" && ragPipeline && (
              <div className="space-y-4">
                {/* Eligibility guidance */}
                <div className="glass-panel p-5 border border-primary/10 space-y-3">
                  <div className="font-label text-[10px] uppercase tracking-[0.2em] text-primary/70">What belongs in the collective pipeline</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="font-label text-[9px] uppercase tracking-widest text-secondary mb-2">✓ Eligible</div>
                      {["Factual domain knowledge (research, how-to, technical facts)", "Verified information applicable across operators", "Insights, patterns, or methods any operator could use", "Structured knowledge: definitions, frameworks, processes"].map((item) => (
                        <div key={item} className="text-xs text-muted-foreground font-sans flex gap-2">
                          <span className="text-secondary shrink-0">—</span>{item}
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <div className="font-label text-[9px] uppercase tracking-widest text-destructive/70 mb-2">✗ Blocked by screener</div>
                      {["User preference notes (\"User likes X\", \"User prefers Y\")", "Conversational observations (\"User asked about Z\")", "Operator diary — notes about one user's behavior", "Personal context that only applies to one session"].map((item) => (
                        <div key={item} className="text-xs text-muted-foreground font-sans flex gap-2">
                          <span className="text-destructive/50 shrink-0">—</span>{item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Config panel */}
                <div className="glass-panel p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Pipeline Configuration</h3>
                    <div className="flex items-center gap-3">
                      <span className={`font-label text-[10px] uppercase tracking-widest ${ragPipeline.enabled ? "text-secondary" : "text-muted-foreground"}`}>
                        {ragPipeline.enabled ? "Active" : "Paused"}
                      </span>
                      <button
                        onClick={() => savePipelineConfig({ enabled: !ragPipeline.enabled })}
                        className={`w-10 h-5 rounded-full transition-colors relative ${ragPipeline.enabled ? "bg-secondary" : "bg-surface-container-high"}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${ragPipeline.enabled ? "left-5" : "left-0.5"}`} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">
                        Min Confidence Score — {ragPipeline.minConfidenceScore}%
                      </label>
                      <input
                        type="range" min={50} max={100} value={ragPipeline.minConfidenceScore}
                        onChange={(e) => setRagPipeline((p) => p ? { ...p, minConfidenceScore: Number(e.target.value) } : p)}
                        onMouseUp={() => savePipelineConfig({ minConfidenceScore: ragPipeline.minConfidenceScore })}
                        className="w-full accent-primary"
                      />
                      <p className="text-xs text-muted-foreground font-sans">Minimum confidence required before operator learning is considered for collective extraction.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">
                        Dedup Threshold — {ragPipeline.deduplicationThreshold}%
                      </label>
                      <input
                        type="range" min={50} max={99} value={ragPipeline.deduplicationThreshold}
                        onChange={(e) => setRagPipeline((p) => p ? { ...p, deduplicationThreshold: Number(e.target.value) } : p)}
                        onMouseUp={() => savePipelineConfig({ deduplicationThreshold: ragPipeline.deduplicationThreshold })}
                        className="w-full accent-primary"
                      />
                      <p className="text-xs text-muted-foreground font-sans">Semantic similarity threshold above which an incoming entry is considered a duplicate and skipped.</p>
                    </div>
                  </div>
                </div>

                {/* Run panel */}
                <div className="glass-panel p-6 flex items-center justify-between gap-8">
                  <div>
                    <div className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">Manual Pipeline Run</div>
                    <div className="flex gap-8 text-sm font-sans text-on-surface-variant">
                      <span>Last run: <span className="text-on-surface">{ragPipeline.lastRunAt ? new Date(ragPipeline.lastRunAt).toLocaleString() : "Never"}</span></span>
                      <span>Last extracted: <span className="text-secondary">{ragPipeline.lastRunCount}</span></span>
                      <span>Total extracted: <span className="text-primary">{ragPipeline.totalExtracted}</span></span>
                    </div>
                    {ragRunResult && (
                      <div className="mt-3 space-y-1.5">
                        <div className="font-mono text-xs text-secondary">
                          Run complete — {ragRunResult.extracted} extracted · {ragRunResult.filteredByScreener} blocked by screener · {ragRunResult.filteredByDedup} deduped · {ragRunResult.candidatesScanned} scanned
                        </div>
                        {ragRunResult.screenerRejections.length > 0 && (
                          <details className="mt-1">
                            <summary className="font-label text-[9px] uppercase tracking-widest text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                              {ragRunResult.screenerRejections.length} diary/context entries blocked — expand to review
                            </summary>
                            <div className="mt-2 space-y-1 pl-2 border-l border-destructive/30">
                              {ragRunResult.screenerRejections.map((r, i) => (
                                <div key={i} className="text-xs font-sans text-muted-foreground">
                                  <span className="text-destructive/70 font-mono mr-2">[{r.reason}]</span>
                                  {r.content}…
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={runPipeline}
                    disabled={ragRunning}
                    className="px-8 py-3 bg-primary/10 border border-primary/30 text-primary font-label text-[10px] uppercase tracking-widest rounded-lg hover:bg-primary/20 disabled:opacity-40 transition-all whitespace-nowrap"
                  >
                    {ragRunning ? "Running…" : "Run Now"}
                  </button>
                </div>

                {/* Collective entries */}
                <div className="glass-panel overflow-hidden">
                  <div className="px-6 py-4 border-b border-border/30">
                    <span className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {ragEntries.filter((e) => e.layer === "collective").length} Collective Entries
                    </span>
                  </div>
                  {ragEntries.filter((e) => e.layer === "collective").map((entry) => (
                    <div key={entry.id} className={`px-6 py-4 border-b border-border/20 ${!entry.isActive ? "opacity-40" : ""}`}>
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-sans text-sm text-on-surface mb-1">{entry.title}</div>
                          <p className="text-xs text-muted-foreground font-sans line-clamp-2">{entry.content}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <button onClick={() => toggleRagEntry(entry.id, entry.isActive)} className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
                            {entry.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button onClick={() => deleteRagEntry(entry.id)} className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors">
                            Remove
                          </button>
                        </div>
                      </div>
                      {/* Scope + Tags row */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* dna_scope toggle */}
                        <button
                          onClick={() => patchEntryScope(entry.id, { dnaScope: entry.dnaScope === "specialty" ? "general" : "specialty" })}
                          className={`font-label text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-sm border transition-colors ${
                            entry.dnaScope === "specialty"
                              ? "border-amber-500/50 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                              : "border-primary/30 text-primary/70 bg-primary/5 hover:bg-primary/10"
                          }`}
                        >
                          {entry.dnaScope === "specialty" ? "specialty" : "general"}
                        </button>

                        {/* archetype scope chips (general only) */}
                        {(entry.dnaScope !== "specialty") && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {(entry.archetypeScope ?? []).length === 0 && (
                              <span className="font-label text-[9px] text-muted-foreground/60 italic">universal</span>
                            )}
                            {(entry.archetypeScope ?? []).map((a) => (
                              <span
                                key={a}
                                onClick={() => patchEntryScope(entry.id, { archetypeScope: (entry.archetypeScope ?? []).filter((x) => x !== a) })}
                                className="font-label text-[9px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary/80 border border-primary/20 cursor-pointer hover:bg-destructive/10 hover:text-destructive/80 hover:border-destructive/30 transition-colors"
                                title="Click to remove"
                              >
                                {a}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* domain tags chips (specialty) */}
                        {entry.dnaScope === "specialty" && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {(entry.domainTags ?? []).map((t) => (
                              <span
                                key={t}
                                onClick={() => patchEntryScope(entry.id, { domainTags: (entry.domainTags ?? []).filter((x) => x !== t) })}
                                className="font-label text-[9px] px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-pointer hover:bg-destructive/10 hover:text-destructive/80 hover:border-destructive/30 transition-colors"
                                title="Click to remove"
                              >
                                {t}
                              </span>
                            ))}
                            {(entry.domainTags ?? []).length === 0 && (
                              <span className="font-label text-[9px] text-muted-foreground/60 italic">no domain tags</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {ragEntries.filter((e) => e.layer === "collective").length === 0 && (
                    <div className="px-6 py-12 text-center text-muted-foreground text-sm">No collective entries yet. Run the pipeline to extract generalizable knowledge from operator learning.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Vael Workspace ─────────────────────────────────────────────── */}
        {tab === "vael" && (
          <div className="p-8 space-y-6 max-w-3xl mx-auto">
            <div>
              <h2 className="font-headline text-2xl font-bold text-primary mb-1">Vael Workspace</h2>
              <p className="text-sm text-muted-foreground font-sans">Autonomous validation, discovery, and seeding — scheduled tasks and manual controls.</p>
            </div>

            {/* Scheduled tasks */}
            <div className="glass-panel overflow-hidden">
              <div className="px-6 py-4 border-b border-border/30">
                <span className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Scheduled Tasks</span>
              </div>

              {/* Full sweep */}
              <div className="px-6 py-5 border-b border-border/20">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-sans text-sm font-medium text-on-surface">Full Sweep</span>
                      <span className="font-label text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-sm bg-primary/10 text-primary/70 border border-primary/20">
                        {vaelSchedule?.sweepSchedule ?? "0 1,13 * * *"}
                      </span>
                      <span className="font-label text-[9px] text-muted-foreground/60">1 AM + 1 PM UTC daily</span>
                    </div>
                    <p className="text-xs text-muted-foreground font-sans">Validate draft DNA entries → discover knowledge gaps → self-validate proposals → seed approved entries with embeddings. Budget: 4.5 min.</p>
                  </div>
                  <button
                    onClick={() => triggerVaelSweep("full")}
                    disabled={vaelSweeping || vaelSchedule?.isRunning}
                    className="font-label text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-sm border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                  >
                    {vaelSweeping || vaelSchedule?.isRunning ? "Running…" : "Run Now"}
                  </button>
                </div>
              </div>

              {/* Validate only */}
              <div className="px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-sans text-sm font-medium text-on-surface">Validation Cycle</span>
                      <span className="font-label text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-sm bg-primary/10 text-primary/70 border border-primary/20">
                        {vaelSchedule?.validateSchedule ?? "0 */6 * * *"}
                      </span>
                      <span className="font-label text-[9px] text-muted-foreground/60">every 6 hours</span>
                    </div>
                    <p className="text-xs text-muted-foreground font-sans">Review draft DNA entries only. Approve, revise, or reject. Budget: 55 sec.</p>
                  </div>
                  <button
                    onClick={() => triggerVaelSweep("validate")}
                    disabled={vaelSweeping || vaelSchedule?.isRunning}
                    className="font-label text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-sm border border-border/40 text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                  >
                    {vaelSweeping || vaelSchedule?.isRunning ? "Running…" : "Run Now"}
                  </button>
                </div>
              </div>
            </div>

            {/* Last run summary */}
            <div className="glass-panel overflow-hidden">
              <div className="px-6 py-4 border-b border-border/30 flex items-center justify-between">
                <span className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Last Run</span>
                <button onClick={loadVaelSchedule} className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">Refresh</button>
              </div>
              <div className="px-6 py-5">
                {!vaelSchedule && (
                  <p className="text-xs text-muted-foreground font-sans italic">Loading…</p>
                )}
                {vaelSchedule && !vaelSchedule.lastRunAt && (
                  <p className="text-xs text-muted-foreground font-sans italic">No runs since last server restart. Trigger manually or wait for the cron schedule.</p>
                )}
                {vaelSchedule?.lastRunAt && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className={`font-label text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-sm border ${vaelSchedule.lastRunType === "full" ? "border-primary/40 text-primary/70 bg-primary/5" : "border-border/40 text-muted-foreground bg-surface/30"}`}>
                        {vaelSchedule.lastRunType === "full" ? "Full Sweep" : "Validate Only"}
                      </span>
                      <span className="font-label text-[9px] text-muted-foreground/70">
                        {new Date(vaelSchedule.lastRunAt).toLocaleString()} · {vaelSchedule.lastRunDurationSec}s
                      </span>
                    </div>
                    {vaelSchedule.lastRunSummary && (
                      <p className="text-xs font-sans text-on-surface/80 font-mono bg-surface/30 rounded px-3 py-2 border border-border/20">
                        {vaelSchedule.lastRunSummary}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* How it works */}
            <div className="glass-panel px-6 py-5 space-y-2">
              <div className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">How It Works</div>
              <div className="space-y-2 text-xs font-sans text-muted-foreground">
                <p>• <span className="text-on-surface/80">Full sweep</span> — validates drafts first, then runs a discovery sweep across the platform, self-validates each proposal, and seeds anything that passes into the collective DNA layer with proper scope classification.</p>
                <p>• <span className="text-on-surface/80">Validation cycle</span> — reviews draft entries in the DNA corpus. Approved entries go to "current". Revised entries are corrected and re-embedded. Rejected entries are deprecated.</p>
                <p>• <span className="text-on-surface/80">Budget timer</span> — Vael races the clock. She stops cleanly before the budget runs out, logs what she completed, and picks up where she left off on the next cycle.</p>
                <p>• <span className="text-on-surface/80">Pipeline exclusion</span> — Vael learns from all operators and all DNA layers, but never contributes to the collective pipeline. Her knowledge stays private to her.</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
