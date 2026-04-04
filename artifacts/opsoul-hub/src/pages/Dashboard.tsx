import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator, HealthScore } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Plus, Cpu, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import CreateAgentChat from "@/components/operator/CreateAgentChat";
import NebulaBlobs from "@/components/ui/NebulaBlobs";

function HealthBadge({ operatorId }: { operatorId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["operators", operatorId, "self-awareness"],
    queryFn: () => apiFetch<{ healthScore: HealthScore }>(`/operators/${operatorId}/grow/self-awareness`),
    staleTime: 60000,
  });

  if (isLoading) return <Badge variant="outline" className="animate-pulse font-label text-[10px]">···</Badge>;
  if (!data?.healthScore) return null;

  const { score, label } = data.healthScore;
  const colorClass = score >= 80
    ? "text-green-400 border-green-500/30 bg-green-500/10"
    : score >= 50
    ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
    : "text-red-400 border-red-500/30 bg-red-500/10";

  return (
    <Badge
      variant="outline"
      className={`${colorClass} font-label text-[10px] uppercase tracking-wider px-2 py-0.5`}
      data-testid={`badge-health-${operatorId}`}
    >
      {score}% · {label}
    </Badge>
  );
}

const PERSONA_IMAGES = [
  "/images/persona-founder.png",
  "/images/persona-executive.png",
  "/images/persona-consultant.png",
];

const PERSONA_GLOWS = [
  "rgba(205,150,255,0.30)",
  "rgba(64,206,243,0.25)",
  "rgba(255,106,159,0.22)",
];

const PERSONA_ACCENTS = ["#cd96ff", "#40cef3", "#ff6a9f"];

function OperatorCard({ operator, onClick }: { operator: Operator; onClick: () => void }) {
  const initial = operator.name.charAt(0).toUpperCase();
  const idx = operator.name.charCodeAt(0) % 3;
  const imgSrc = PERSONA_IMAGES[idx];
  const glow = PERSONA_GLOWS[idx];
  const accent = PERSONA_ACCENTS[idx];

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-border/30 glass-panel hover:border-primary/40 hover:neon-glow-primary transition-all duration-500 cursor-pointer flex flex-col"
      onClick={onClick}
      data-testid={`card-operator-${operator.id}`}
    >
      {/* Image header */}
      <div className="h-28 relative overflow-hidden bg-[#0a0a0f] shrink-0">
        <img
          src={imgSrc}
          alt={`${operator.name} portrait`}
          className="w-full h-full object-cover object-top opacity-60 group-hover:opacity-90 scale-110 group-hover:scale-100 transition-all duration-500"
        />
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse at 50% 120%, ${glow} 0%, transparent 65%)`, mixBlendMode: "screen" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
        {/* Health badge floats top-right */}
        <div className="absolute top-2 right-2 z-10">
          <HealthBadge operatorId={operator.id} />
        </div>
      </div>

      {/* Avatar + name row */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white font-headline font-bold text-sm border"
          style={{ backgroundColor: `${accent}22`, borderColor: `${accent}40`, color: accent }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-headline font-bold text-sm text-foreground truncate leading-tight">
            {operator.name}
          </h3>
          <p className="font-label text-[11px] text-muted-foreground/70 mt-0.5">
            {operator.archetype ?? "Operator"}
          </p>
        </div>
      </div>

      {/* Mandate */}
      <div className="px-4 pb-4 flex-1">
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
          {operator.mandate}
        </p>
      </div>

      {/* Footer bar */}
      <div className="px-4 py-2.5 border-t border-border/20 flex items-center gap-2">
        <span className="status-beacon" />
        <span className="font-label text-[11px] text-muted-foreground">Active</span>
        <span className="ml-auto font-label text-[11px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: accent }}>
          Open →
        </span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { logout, owner } = useAuth();
  const [, setLocation] = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: operators, isLoading } = useQuery({
    queryKey: ["operators"],
    queryFn: () => apiFetch<Operator[]>("/operators"),
  });

  return (
    <div className="min-h-screen dot-grid bg-background relative overflow-hidden">
      <NebulaBlobs />
      {/* Header */}
      <header className="frosted-nav border-b border-border/30 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
              <span className="font-headline font-bold text-sm text-primary">O</span>
            </div>
            <span className="font-headline font-bold text-lg text-foreground tracking-tight">OpSoul</span>
          </Link>
          <div className="flex items-center gap-4">
            {owner?.isSovereignAdmin && (
              <Link
                href="/admin"
                className="font-label text-sm text-primary/80 hover:text-primary transition-colors flex items-center gap-1.5 border border-primary/20 rounded px-2.5 py-1 hover:bg-primary/10"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Admin Console
              </Link>
            )}
            <button
              onClick={logout}
              className="font-label text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
              data-testid="button-logout"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {/* Page heading */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="headline-lg text-3xl sm:text-4xl font-bold text-foreground">
              My Operators
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm font-label">
              Your permanent AI operators — always on, always yours
            </p>
          </div>

          <Button
            onClick={() => setIsCreateOpen(true)}
            className="font-label font-semibold text-sm px-5 h-10 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity shrink-0"
            data-testid="button-create-operator"
          >
            <Plus className="w-4 h-4 mr-1.5" /> New Operator
          </Button>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-52 rounded-2xl border border-border/30 bg-card/20 animate-pulse" />
            ))}
          </div>
        ) : operators?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 border border-dashed border-border/40 rounded-2xl glass-panel">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
              <Cpu className="w-7 h-7 text-primary/60" />
            </div>
            <h3 className="font-headline text-xl font-bold text-foreground mb-2">
              No operators yet
            </h3>
            <p className="text-muted-foreground font-label text-sm mb-6 max-w-xs text-center leading-relaxed">
              Create your first operator — it will learn, grow, and remember for you.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="font-label font-semibold text-sm px-6 h-10 rounded-xl border border-primary/40 text-primary hover:bg-primary/10 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Create Operator
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {operators?.map((operator) => (
              <OperatorCard
                key={operator.id}
                operator={operator}
                onClick={() => setLocation(`/operators/${operator.id}`)}
              />
            ))}
          </div>
        )}
      </main>

      <CreateAgentChat open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
