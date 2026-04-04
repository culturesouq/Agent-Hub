import { useEffect, useState } from "react";
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

type Tab = "overview" | "owners" | "operators" | "drift";

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
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, owner, setLocation]);

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
      </main>
    </div>
  );
}
