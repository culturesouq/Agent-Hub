import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plug, Search, CheckCircle2, XCircle, Loader2, Info, ChevronDown, ChevronUp, Zap, Shield
} from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  google: "Google Workspace",
  microsoft: "Microsoft 365",
  dev: "Developer Tools",
  productivity: "Productivity",
  crm: "CRM & Data",
  finance: "Finance",
  communication: "Communication",
};

const CATEGORY_ORDER = ["google", "microsoft", "dev", "productivity", "crm", "finance", "communication"];

const SERVICE_ICONS: Record<string, string> = {
  github: "🐙",
  linear: "📐",
  notion: "📝",
  slack: "💬",
  telegram: "✈️",
  hubspot: "🟠",
  stripe: "💳",
  airtable: "🗂️",
  google_sheets: "📊",
  gmail: "📧",
  google_calendar: "📅",
  google_drive: "🗄️",
  google_docs: "📄",
  outlook: "📨",
  onedrive: "☁️",
  sharepoint: "🏢",
};

interface CatalogItem {
  id: string;
  displayName: string;
  category: string;
  description: string;
  icon: string;
  authType: "replit_connector" | "api_key";
  replitConnectorId?: string;
  envVar?: string;
  envVarLabel?: string;
  setupNote: string;
  toolNames: string[];
  toolCount: number;
  available: boolean;
  enabled: boolean;
  replitConnectorInfraAvailable: boolean;
}

export function AgentIntegrations({ agentId }: { agentId: number }) {
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/integrations/catalog`, { credentials: "include" });
      const data = await res.json();
      setCatalog(data);
    } catch {
      toast({ title: "Error", description: "Failed to load integrations", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCatalog(); }, [agentId]);

  const toggle = async (item: CatalogItem) => {
    setTogglingId(item.id);
    const action = item.enabled ? "disable" : "enable";
    try {
      await fetch(`/api/agents/${agentId}/integrations/${item.id}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      setCatalog(prev => prev.map(c => c.id === item.id ? { ...c, enabled: !c.enabled } : c));
      toast({
        title: item.enabled ? "Integration disabled" : "Integration enabled",
        description: `${item.displayName} ${item.enabled ? "removed from" : "added to"} this agent`,
      });
    } catch {
      toast({ title: "Error", description: "Failed to update integration", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  const testConnection = async (item: CatalogItem) => {
    setTestingId(item.id);
    try {
      const res = await fetch(`/api/agents/${agentId}/integrations/${item.id}/test`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json() as { ok: boolean; message?: string; error?: string };
      toast({
        title: data.ok ? "Connection verified" : "Connection failed",
        description: data.message || data.error,
        variant: data.ok ? "default" : "destructive",
      });
    } catch {
      toast({ title: "Error", description: "Test failed", variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  };

  const filtered = catalog.filter(
    c =>
      c.displayName.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = CATEGORY_ORDER.reduce<Record<string, CatalogItem[]>>((acc, cat) => {
    const items = filtered.filter(c => c.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const enabledCount = catalog.filter(c => c.enabled).length;
  const totalTools = catalog.filter(c => c.enabled).reduce((sum, c) => sum + c.toolCount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/10">
        <Plug className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-white font-medium">{enabledCount} integration{enabledCount !== 1 ? "s" : ""} active</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            This agent can use {totalTools} tools from connected services
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Shield className="w-3.5 h-3.5 text-primary/60" />
          <span className="font-mono">{catalog.filter(c => c.authType === "replit_connector").length} via OAuth</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search integrations..."
          className="ps-9 bg-black/40 border-white/10 text-sm"
        />
      </div>

      {/* Grouped catalog */}
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="space-y-2">
          <h4 className="text-xs font-mono uppercase tracking-widest text-muted-foreground px-1">
            {CATEGORY_LABELS[cat] || cat}
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {items.map(item => (
              <IntegrationCard
                key={item.id}
                item={item}
                icon={SERVICE_ICONS[item.id] || "🔌"}
                toggling={togglingId === item.id}
                testing={testingId === item.id}
                expanded={expandedId === item.id}
                onToggle={() => toggle(item)}
                onTest={() => testConnection(item)}
                onExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
              />
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12 border border-white/5 border-dashed rounded-2xl">
          <p className="text-muted-foreground font-mono text-sm">No integrations found</p>
        </div>
      )}
    </div>
  );
}

function IntegrationCard({
  item, icon, toggling, testing, expanded, onToggle, onTest, onExpand,
}: {
  item: CatalogItem;
  icon: string;
  toggling: boolean;
  testing: boolean;
  expanded: boolean;
  onToggle: () => void;
  onTest: () => void;
  onExpand: () => void;
}) {
  const isOAuth = item.authType === "replit_connector";

  return (
    <div className={`glass-panel rounded-xl border transition-all ${item.enabled ? "border-primary/25 bg-primary/5" : "border-white/5"}`}>
      <div className="flex items-center gap-3 p-4">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${item.enabled ? "bg-primary/15" : "bg-white/5"}`}>
          {icon}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{item.displayName}</span>
            {item.available
              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
              : <XCircle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            }
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${item.available ? "bg-green-500/15 text-green-400" : "bg-orange-500/15 text-orange-400"}`}>
              {item.available ? "ready" : "needs setup"}
            </span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${isOAuth ? "bg-blue-500/15 text-blue-400" : "bg-white/8 text-white/40"}`}>
              {isOAuth ? "OAuth" : "API key"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
        </div>

        {/* Tool count */}
        <div className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground font-mono">
          <Zap className="w-3 h-3" />
          <span>{item.toolCount}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-muted-foreground hover:text-white"
            onClick={onExpand}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>

          {item.enabled && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs border-white/10 text-muted-foreground hover:text-white"
              onClick={onTest}
              disabled={testing}
            >
              {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : "Test"}
            </Button>
          )}

          <Button
            size="sm"
            className={`h-7 px-3 text-xs font-semibold transition-all ${
              item.enabled
                ? "bg-primary/15 text-primary hover:bg-destructive/15 hover:text-destructive border border-primary/20"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
            onClick={onToggle}
            disabled={toggling}
          >
            {toggling
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : item.enabled ? "Disable" : "Enable"
            }
          </Button>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3 space-y-3">
          {/* Auth info */}
          <div className={`flex items-start gap-2.5 p-3 rounded-lg ${isOAuth ? "bg-blue-500/8 border border-blue-500/15" : "bg-white/3 border border-white/8"}`}>
            <Shield className={`w-4 h-4 mt-0.5 shrink-0 ${isOAuth ? "text-blue-400" : "text-muted-foreground"}`} />
            <div className="text-xs">
              <p className={`font-medium mb-1 ${isOAuth ? "text-blue-300" : "text-white/70"}`}>
                {isOAuth ? "Replit OAuth connector" : "API key authentication"}
              </p>
              <p className="text-muted-foreground">{item.setupNote}</p>
              {!isOAuth && item.envVar && (
                <p className="text-muted-foreground mt-1.5">
                  Secret: <code className="text-orange-300 bg-black/30 px-1 rounded">{item.envVar}</code>
                  {item.envVarLabel && <span className="ml-1 text-white/40">({item.envVarLabel})</span>}
                </p>
              )}
              {isOAuth && item.envVar && (
                <p className="text-muted-foreground mt-1.5">
                  Fallback: <code className="text-white/40 bg-black/30 px-1 rounded">{item.envVar}</code>
                  <span className="ml-1 text-white/30">({item.envVarLabel})</span>
                </p>
              )}
              {!item.available && (
                <p className="text-orange-400 mt-2 font-medium">
                  {isOAuth
                    ? "Not yet authorized. Set up OAuth via Replit integrations or add the fallback API key."
                    : `Add the ${item.envVar} secret to enable this integration.`}
                </p>
              )}
            </div>
          </div>

          {/* Tools list */}
          <div>
            <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-2">Available tools</p>
            <div className="flex flex-wrap gap-1.5">
              {item.toolNames.map(name => (
                <span key={name} className="text-[11px] font-mono px-2 py-1 rounded-md bg-black/40 border border-white/8 text-white/70">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
