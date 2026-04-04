import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator, HealthScore } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LogOut, Plus, Cpu, ShieldCheck, LayoutGrid, User, Activity,
  CreditCard, Settings2, Menu, X, Check, Loader2, Eye, EyeOff,
  AlertTriangle, ChevronRight, BarChart3, Lock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CreateAgentChat from "@/components/operator/CreateAgentChat";
import NebulaBlobs from "@/components/ui/NebulaBlobs";

type Section = "operators" | "account" | "analytics" | "billing" | "platform";

const NAV: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "operators",  label: "My Operators",      icon: LayoutGrid },
  { id: "account",   label: "Account & Profile",  icon: User },
  { id: "analytics", label: "Usage Analytics",    icon: BarChart3 },
  { id: "billing",   label: "Billing & Plan",     icon: CreditCard },
  { id: "platform",  label: "Platform Settings",  icon: Settings2 },
];

function NavItem({
  item, active, onSelect,
}: {
  item: typeof NAV[number];
  active: boolean;
  onSelect: (id: Section) => void;
}) {
  return (
    <button
      onClick={() => onSelect(item.id)}
      className={`flex items-center gap-2.5 pl-3 pr-3 py-2 rounded-md text-sm font-label w-full text-left transition-all
        ${active
          ? "sidebar-nav-active border border-transparent"
          : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground border border-transparent"
        }`}
    >
      <item.icon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-primary" : ""}`} />
      <span className="truncate flex-1">{item.label}</span>
      {active && <ChevronRight className="w-3 h-3 shrink-0 text-primary/50" />}
    </button>
  );
}

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
    <Badge variant="outline" className={`${colorClass} font-label text-[10px] uppercase tracking-wider px-2 py-0.5`}>
      {score}% · {label}
    </Badge>
  );
}

const PERSONA_IMAGES = [
  "/images/persona-founder.png",
  "/images/persona-executive.png",
  "/images/persona-consultant.png",
];
const PERSONA_GLOWS   = ["rgba(205,150,255,0.30)", "rgba(64,206,243,0.25)", "rgba(255,106,159,0.22)"];
const PERSONA_ACCENTS = ["#cd96ff", "#40cef3", "#ff6a9f"];

function OperatorCard({ operator, onClick }: { operator: Operator; onClick: () => void }) {
  const initial = operator.name.charAt(0).toUpperCase();
  const idx     = operator.name.charCodeAt(0) % 3;
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-border/30 glass-panel hover:border-primary/40 hover:neon-glow-primary transition-all duration-500 cursor-pointer flex flex-col"
      onClick={onClick}
      data-testid={`card-operator-${operator.id}`}
    >
      <div className="h-28 relative overflow-hidden bg-[#0a0a0f] shrink-0">
        <img
          src={PERSONA_IMAGES[idx]}
          alt={`${operator.name} portrait`}
          className="w-full h-full object-cover object-top opacity-60 group-hover:opacity-90 scale-110 group-hover:scale-100 transition-all duration-500"
        />
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 120%, ${PERSONA_GLOWS[idx]} 0%, transparent 65%)`, mixBlendMode: "screen" }} />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
        <div className="absolute top-2 right-2 z-10"><HealthBadge operatorId={operator.id} /></div>
      </div>
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white font-headline font-bold text-sm border"
          style={{ backgroundColor: `${PERSONA_ACCENTS[idx]}22`, borderColor: `${PERSONA_ACCENTS[idx]}40`, color: PERSONA_ACCENTS[idx] }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-headline font-bold text-sm text-foreground truncate leading-tight">{operator.name}</h3>
          <p className="font-label text-[11px] text-muted-foreground/70 mt-0.5">{operator.archetype ?? "Operator"}</p>
        </div>
      </div>
      <div className="px-4 pb-4 flex-1">
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{operator.mandate}</p>
      </div>
      <div className="px-4 py-2.5 border-t border-border/20 flex items-center gap-2">
        <span className="status-beacon" />
        <span className="font-label text-[11px] text-muted-foreground">Active</span>
        <span className="ml-auto font-label text-[11px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: PERSONA_ACCENTS[idx] }}>Open →</span>
      </div>
    </div>
  );
}

function OperatorsPanel({
  operators, isLoading, onCreateOpen, onNavigate,
}: {
  operators: Operator[] | undefined;
  isLoading: boolean;
  onCreateOpen: () => void;
  onNavigate: (id: string) => void;
}) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold text-foreground">My Operators</h1>
          <p className="text-muted-foreground mt-1 text-sm font-label">Your permanent AI operators — always on, always yours</p>
        </div>
        <Button
          onClick={onCreateOpen}
          className="font-label font-semibold text-sm px-5 h-10 rounded-xl shrink-0"
          data-testid="button-create-operator"
        >
          <Plus className="w-4 h-4 mr-1.5" /> New Operator
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => <div key={i} className="h-52 rounded-2xl border border-border/30 bg-card/20 animate-pulse" />)}
        </div>
      ) : operators?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 border border-dashed border-border/40 rounded-2xl glass-panel">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
            <Cpu className="w-7 h-7 text-primary/60" />
          </div>
          <h3 className="font-headline text-xl font-bold text-foreground mb-2">No operators yet</h3>
          <p className="text-muted-foreground font-label text-sm mb-6 max-w-xs text-center leading-relaxed">
            Create your first operator — it will learn, grow, and remember for you.
          </p>
          <button
            onClick={onCreateOpen}
            className="font-label font-semibold text-sm px-6 h-10 rounded-xl border border-primary/40 text-primary hover:bg-primary/10 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Create Operator
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {operators?.map(op => (
            <OperatorCard key={op.id} operator={op} onClick={() => onNavigate(op.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountPanel() {
  const { owner, refreshOwner } = useAuth();
  const { toast } = useToast();
  const [nameInput, setNameInput] = useState(owner?.name ?? "");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const updateName = useMutation({
    mutationFn: (name: string) =>
      apiFetch("/auth/me", { method: "PATCH", body: JSON.stringify({ name }) }),
    onSuccess: async () => {
      await refreshOwner();
      toast({ title: "Display name updated" });
    },
    onError: (err: Error) => toast({ title: "Failed to update name", description: err.message, variant: "destructive" }),
  });

  const changePassword = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      apiFetch("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
    onSuccess: () => {
      toast({ title: "Password changed — all sessions invalidated" });
      setCurrentPw("");
      setNewPw("");
    },
    onError: (err: Error) => toast({ title: "Password change failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-xl">
      <div>
        <h2 className="font-headline text-2xl font-bold text-foreground">Account & Profile</h2>
        <p className="text-muted-foreground mt-1 text-sm font-label">Manage your display name and password</p>
      </div>

      {/* Profile card */}
      <div className="glass-panel rounded-2xl border border-border/30 p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-border/40 pb-4">
          <User className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-headline font-bold text-base">Profile</h3>
        </div>

        {/* Email (read-only) */}
        <div className="space-y-1.5">
          <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Email</label>
          <div className="font-mono text-sm bg-background/60 border border-border/30 rounded-lg px-3 py-2.5 text-muted-foreground select-all">
            {owner?.email}
          </div>
          <p className="font-mono text-[10px] text-muted-foreground/60">Email cannot be changed.</p>
        </div>

        {/* Display name */}
        <div className="space-y-1.5">
          <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Display Name</label>
          <input
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            placeholder="Your name"
            className="w-full font-mono text-sm bg-background/60 border border-border/30 rounded-lg px-3 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        <Button
          size="sm"
          onClick={() => updateName.mutate(nameInput)}
          disabled={updateName.isPending || nameInput === (owner?.name ?? "")}
          className="font-mono text-xs"
        >
          {updateName.isPending ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Saving…</> : <><Check className="w-3 h-3 mr-1.5" /> Save Name</>}
        </Button>
      </div>

      {/* Change password card */}
      <div className="glass-panel rounded-2xl border border-border/30 p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-border/40 pb-4">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-headline font-bold text-base">Change Password</h3>
        </div>

        <div className="space-y-1.5">
          <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Current Password</label>
          <div className="relative">
            <input
              type={showCurrent ? "text" : "password"}
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              placeholder="••••••••••••"
              className="w-full font-mono text-sm bg-background/60 border border-border/30 rounded-lg px-3 py-2.5 pr-10 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showCurrent ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">New Password</label>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="••••••••••••"
              className="w-full font-mono text-sm bg-background/60 border border-border/30 rounded-lg px-3 py-2.5 pr-10 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowNew(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground/60">Minimum 12 characters. All sessions will be invalidated.</p>
        </div>

        <Button
          size="sm"
          onClick={() => changePassword.mutate({ currentPassword: currentPw, newPassword: newPw })}
          disabled={changePassword.isPending || !currentPw || !newPw || newPw.length < 12}
          className="font-mono text-xs"
        >
          {changePassword.isPending ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Changing…</> : "Change Password"}
        </Button>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="glass-panel rounded-xl border border-border/30 p-5 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top-left,rgba(205,150,255,0.05),transparent_60%)] pointer-events-none" />
      <div className="font-headline text-4xl font-bold text-primary mb-1" style={{ letterSpacing: "-0.04em" }}>{value}</div>
      <div className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      {sub && <div className="font-mono text-[11px] text-muted-foreground/60 mt-1">{sub}</div>}
    </div>
  );
}

function AnalyticsPanel({ operators }: { operators: Operator[] | undefined }) {
  const { owner } = useAuth();
  const count = operators?.length ?? 0;
  const joined = owner?.createdAt
    ? new Date(owner.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="font-headline text-2xl font-bold text-foreground">Usage Analytics</h2>
        <p className="text-muted-foreground mt-1 text-sm font-label">Your platform activity at a glance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Operators" value={count} sub={count === 1 ? "1 active operator" : `${count} active operators`} />
        <StatCard label="Messages" value="—" sub="Message tracking coming soon" />
        <StatCard label="Member since" value={joined.split(" ").slice(-1)[0] ?? "—"} sub={joined} />
      </div>

      <div className="glass-panel rounded-2xl border border-border/30 p-6 space-y-4">
        <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Operator Roster</h3>
        {count === 0 ? (
          <p className="font-mono text-sm text-muted-foreground">No operators yet.</p>
        ) : (
          <div className="space-y-3">
            {operators?.map(op => (
              <div key={op.id} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                <div>
                  <div className="font-sans text-sm text-foreground">{op.name}</div>
                  <div className="font-label text-[10px] text-muted-foreground mt-0.5">
                    {Array.isArray(op.archetype) ? op.archetype.slice(0, 2).join(", ") : "Operator"}
                  </div>
                </div>
                <span className="status-beacon ml-4" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const PLAN_FEATURES = [
  "Up to 3 AI operators",
  "Persistent soul & memory",
  "GROW evolution engine",
  "Knowledge base (5MB)",
  "API access",
  "Community support",
];

function BillingPanel() {
  const { toast } = useToast();
  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-xl">
      <div>
        <h2 className="font-headline text-2xl font-bold text-foreground">Billing & Plan</h2>
        <p className="text-muted-foreground mt-1 text-sm font-label">Your current subscription and usage limits</p>
      </div>

      <div className="glass-panel rounded-2xl border border-primary/20 p-6 space-y-5 relative overflow-hidden neon-glow-primary">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top-left,rgba(205,150,255,0.06),transparent_60%)] pointer-events-none" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="status-beacon" />
              <span className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary">Active</span>
            </div>
            <h3 className="font-headline text-2xl font-bold text-primary">Starter</h3>
            <p className="font-mono text-sm text-muted-foreground mt-0.5">Free plan · No credit card required</p>
          </div>
          <div className="text-right">
            <div className="font-headline text-3xl font-bold text-foreground">$0</div>
            <div className="font-label text-[10px] uppercase tracking-wider text-muted-foreground">/ month</div>
          </div>
        </div>

        <div className="border-t border-border/30 pt-4 space-y-2">
          {PLAN_FEATURES.map(f => (
            <div key={f} className="flex items-center gap-2.5">
              <Check className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="font-mono text-xs text-foreground/80">{f}</span>
            </div>
          ))}
        </div>

        <Button
          className="w-full font-label font-bold text-sm h-11 rounded-xl"
          onClick={() => toast({ title: "Upgrade coming soon", description: "Pro plans are on the roadmap. You'll be first to know." })}
        >
          Upgrade to Pro — Coming Soon
        </Button>
      </div>

      <div className="glass-panel rounded-2xl border border-border/30 p-5">
        <p className="font-mono text-xs text-muted-foreground leading-relaxed">
          Founding operator pricing locks in at <span className="text-primary font-bold">$29/mo for life</span> when Pro launches. Your early access is reserved.
        </p>
      </div>
    </div>
  );
}

function PlatformPanel() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-xl">
      <div>
        <h2 className="font-headline text-2xl font-bold text-foreground">Platform Settings</h2>
        <p className="text-muted-foreground mt-1 text-sm font-label">Advanced account configuration</p>
      </div>

      <div className="glass-panel rounded-2xl border border-border/30 p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-border/40 pb-4">
          <Settings2 className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-headline font-bold text-base">Preferences</h3>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          Additional platform settings and customization options are coming soon.
        </p>
      </div>

      <div className="glass-panel rounded-2xl border border-destructive/20 p-6 space-y-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-destructive/40" />
        <div className="flex items-center gap-2 border-b border-border/40 pb-4">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <h3 className="font-headline font-bold text-base text-destructive">Danger Zone</h3>
        </div>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-3">
          <div>
            <p className="font-mono text-sm font-bold text-foreground">Delete Account</p>
            <p className="font-mono text-xs text-muted-foreground mt-1 leading-relaxed">
              Permanently deletes your account, all operators, memories, and data. This cannot be undone.
            </p>
          </div>
          <button
            disabled
            className="font-mono text-xs px-4 py-2 rounded-lg border border-destructive/30 text-destructive/50 bg-destructive/5 cursor-not-allowed opacity-60"
          >
            Contact support to delete your account
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { logout, owner } = useAuth();
  const [, setLocation] = useLocation();
  const [section, setSection] = useState<Section>("operators");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const { data: operators, isLoading } = useQuery({
    queryKey: ["operators"],
    queryFn: () => apiFetch<Operator[]>("/operators"),
  });

  const handleSelect = (id: Section) => {
    setSection(id);
    setMobileNavOpen(false);
  };

  function renderContent() {
    switch (section) {
      case "operators":
        return (
          <OperatorsPanel
            operators={operators}
            isLoading={isLoading}
            onCreateOpen={() => setIsCreateOpen(true)}
            onNavigate={id => setLocation(`/operators/${id}`)}
          />
        );
      case "account":   return <AccountPanel />;
      case "analytics": return <AnalyticsPanel operators={operators} />;
      case "billing":   return <BillingPanel />;
      case "platform":  return <PlatformPanel />;
    }
  }

  const SidebarContent = () => (
    <>
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <span className="font-headline font-bold text-sm text-primary">O</span>
          </div>
          <div className="min-w-0">
            <div className="font-headline font-bold text-sm text-sidebar-foreground truncate leading-tight">OpSoul</div>
            <div className="font-label text-[10px] text-sidebar-foreground/50 truncate">{owner?.email}</div>
          </div>
        </div>
      </div>

      <div className="p-2 flex flex-col gap-0.5 flex-1 overflow-y-auto">
        {NAV.map(item => (
          <NavItem key={item.id} item={item} active={section === item.id} onSelect={handleSelect} />
        ))}
      </div>

      <div className="p-2 border-t border-sidebar-border flex flex-col gap-0.5">
        {owner?.isSovereignAdmin && (
          <Link href="/admin">
            <button className="flex items-center gap-2.5 pl-3 pr-3 py-2 rounded-md text-sm font-label w-full text-left transition-all text-primary/70 hover:bg-sidebar-accent hover:text-primary border border-transparent">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate flex-1">Admin Console</span>
            </button>
          </Link>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-2.5 pl-3 pr-3 py-2 rounded-md text-sm font-label w-full text-left transition-all text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground border border-transparent"
          data-testid="button-logout"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate flex-1">Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top header */}
      <header className="h-12 border-b border-border/30 frosted-nav flex items-center px-3 shrink-0 justify-between sticky top-0 z-40 gap-2">
        <div className="flex items-center gap-2">
          <button
            className="md:hidden p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileNavOpen(o => !o)}
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <span className="font-headline font-bold text-base text-foreground hidden md:block">
            {NAV.find(n => n.id === section)?.label ?? "Dashboard"}
          </span>
          <span className="md:hidden font-headline font-bold text-sm text-foreground">OpSoul</span>
        </div>
        {section === "operators" && (
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="font-label text-xs h-8 px-4"
            data-testid="button-create-operator"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New Operator
          </Button>
        )}
      </header>

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-30 top-12">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-sidebar border-r border-sidebar-border flex flex-col overflow-y-auto shadow-2xl shadow-black/40 animate-in slide-in-from-left duration-200">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="w-56 border-r border-sidebar-border bg-sidebar flex-col shrink-0 overflow-y-auto hidden md:flex">
          <SidebarContent />
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-background nebula-bg relative">
          <NebulaBlobs />
          <div className="relative z-10 p-4 md:p-8 max-w-5xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>

      <CreateAgentChat open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
