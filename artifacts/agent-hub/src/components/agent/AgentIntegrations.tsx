import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, XCircle, Loader2, ChevronDown,
  Zap, Search, Link2, Link2Off, Key, AlertCircle, FlaskConical,
} from "lucide-react";

interface CatalogItem {
  id: string;
  displayName: string;
  category: string;
  description: string;
  icon: string;
  authType: "oauth" | "api_key";
  oauthProvider: string | null;
  oauthReady: boolean;
  envVar?: string;
  envVarLabel?: string;
  apiKeyLabel?: string;
  setupNote: string;
  toolNames: string[];
  toolCount: number;
  available: boolean;
  connected: boolean;
  accountLabel: string | null;
  enabled: boolean;
}

const CATEGORY_META: Record<string, { label: string; order: number }> = {
  google:        { label: "Google Workspace",  order: 1 },
  microsoft:     { label: "Microsoft 365",      order: 2 },
  dev:           { label: "Developer Tools",    order: 3 },
  productivity:  { label: "Productivity",       order: 4 },
  crm:           { label: "CRM & Sales",        order: 5 },
  finance:       { label: "Finance",            order: 6 },
  communication: { label: "Communication",      order: 7 },
};

const SERVICE_ICONS: Record<string, string> = {
  gmail: "📧", google_calendar: "📅", google_sheets: "📊",
  google_drive: "💾", google_docs: "📄",
  outlook: "📬", onedrive: "☁️", sharepoint: "🏢",
  github: "🐙", linear: "📐",
  notion: "📓", airtable: "🗃️",
  hubspot: "🎯", linkedin: "💼",
  stripe: "💳",
  slack: "💬", telegram: "✈️",
};

const PROVIDER_CONNECT_LABELS: Record<string, string> = {
  google: "Connect with Google",
  microsoft: "Connect with Microsoft",
  github: "Connect with GitHub",
  slack: "Connect with Slack",
  notion: "Connect with Notion",
  hubspot: "Connect with HubSpot",
  linkedin: "Connect with LinkedIn",
};

export function AgentIntegrations({ agentId }: { agentId: number }) {
  const [search, setSearch] = useState("");
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const returnTo = window.location.pathname + window.location.search;
  const oauthHandled = useRef(false);

  useEffect(() => {
    if (oauthHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("oauth_connected");
    const oauthError = params.get("oauth_error");
    if (connected) {
      oauthHandled.current = true;
      toast({ title: `Connected successfully`, description: `${connected} account linked.` });
      qc.invalidateQueries({ queryKey: ["integrations-catalog", agentId] });
      params.delete("oauth_connected");
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`);
    } else if (oauthError) {
      oauthHandled.current = true;
      toast({ title: "Connection failed", description: oauthError, variant: "destructive" });
      params.delete("oauth_error");
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`);
    }
  }, [toast, qc, agentId]);

  const { data: catalog = [], isLoading } = useQuery<CatalogItem[]>({
    queryKey: ["integrations-catalog", agentId],
    queryFn: async () => {
      const r = await fetch(`/api/agents/${agentId}/integrations/catalog`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load integrations");
      return r.json();
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return catalog;
    return catalog.filter(
      item =>
        item.displayName.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.toolNames.some(t => t.toLowerCase().includes(q))
    );
  }, [catalog, search]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading integrations…</span>
      </div>
    );
  }

  const toggleMutation = useMutation({
    mutationFn: async ({ serviceId, enable }: { serviceId: string; enable: boolean }) => {
      const r = await fetch(`/api/agents/${agentId}/integrations/${serviceId}/${enable ? "enable" : "disable"}`, {
        method: "POST", credentials: "include",
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: (_, { serviceId, enable }) => {
      qc.invalidateQueries({ queryKey: ["integrations-catalog", agentId] });
      const item = catalog.find(i => i.id === serviceId);
      toast({ title: enable ? `${item?.displayName} enabled` : `${item?.displayName} disabled` });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const handleSaveApiKey = async (serviceId: string) => {
    const key = apiKeyInputs[serviceId]?.trim();
    if (!key) return;
    setSavingKey(serviceId);
    try {
      const r = await fetch(`/api/oauth/api-key/${serviceId}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      if (!r.ok) throw new Error("Failed");
      qc.invalidateQueries({ queryKey: ["integrations-catalog", agentId] });
      setApiKeyInputs(prev => ({ ...prev, [serviceId]: "" }));
      setExpandedKey(null);
      toast({ title: "API key saved" });
    } catch {
      toast({ title: "Error saving key", variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  const handleTest = async (serviceId: string) => {
    setTestingId(serviceId);
    try {
      const r = await fetch(`/api/agents/${agentId}/integrations/${serviceId}/test`, {
        method: "POST", credentials: "include",
      });
      const data = await r.json();
      toast({
        title: data.ok ? "Connection successful" : "Connection failed",
        description: data.message,
        variant: data.ok ? "default" : "destructive",
      });
    } catch {
      toast({ title: "Test failed", variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteApiKey = async (serviceId: string) => {
    setDeletingKey(serviceId);
    try {
      await fetch(`/api/oauth/api-key/${serviceId}`, { method: "DELETE", credentials: "include" });
      qc.invalidateQueries({ queryKey: ["integrations-catalog", agentId] });
      toast({ title: "API key removed" });
    } catch {
      toast({ title: "Error removing key", variant: "destructive" });
    } finally {
      setDeletingKey(null);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    setDisconnecting(providerId);
    try {
      await fetch(`/api/oauth/${providerId}/disconnect`, { method: "DELETE", credentials: "include" });
      qc.invalidateQueries({ queryKey: ["integrations-catalog", agentId] });
      toast({ title: `${providerId} disconnected` });
    } catch {
      toast({ title: "Error disconnecting", variant: "destructive" });
    } finally {
      setDisconnecting(null);
    }
  };

  const byCategory = filtered.reduce<Record<string, CatalogItem[]>>((acc, item) => {
    (acc[item.category] = acc[item.category] || []).push(item);
    return acc;
  }, {});

  const sortedCategories = Object.keys(byCategory).sort(
    (a, b) => (CATEGORY_META[a]?.order ?? 99) - (CATEGORY_META[b]?.order ?? 99)
  );

  const connectedCount = catalog.filter(i => i.connected).length;
  const enabledCount = catalog.filter(i => i.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Platform Integrations
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your accounts — click Connect to authorize. {connectedCount} connected · {enabledCount} active.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search integrations or tools…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {search && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No integrations match "{search}"</p>
        )}
      </div>

      {/* Categories */}
      {sortedCategories.map(category => (
        <div key={category}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {CATEGORY_META[category]?.label ?? category}
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {byCategory[category].map(item => (
              <IntegrationCard
                key={item.id}
                item={item}
                agentId={agentId}
                returnTo={returnTo}
                expandedKey={expandedKey}
                setExpandedKey={setExpandedKey}
                apiKeyInput={apiKeyInputs[item.id] || ""}
                setApiKeyInput={val => setApiKeyInputs(prev => ({ ...prev, [item.id]: val }))}
                savingKey={savingKey === item.id}
                deletingKey={deletingKey === item.id}
                disconnecting={disconnecting === item.oauthProvider}
                testingConnection={testingId === item.id}
                togglePending={toggleMutation.isPending}
                onSaveApiKey={() => handleSaveApiKey(item.id)}
                onDeleteApiKey={() => handleDeleteApiKey(item.id)}
                onDisconnect={() => item.oauthProvider && handleDisconnect(item.oauthProvider)}
                onTest={() => handleTest(item.id)}
                onToggle={enable => toggleMutation.mutate({ serviceId: item.id, enable })}
              />
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground text-center pt-2 border-t">
        Connected integrations give this agent tools to use during conversations.
        Enable them per-agent using the toggle.
      </p>
    </div>
  );
}

function IntegrationCard({
  item, agentId, returnTo,
  expandedKey, setExpandedKey,
  apiKeyInput, setApiKeyInput,
  savingKey, deletingKey, disconnecting, testingConnection, togglePending,
  onSaveApiKey, onDeleteApiKey, onDisconnect, onTest, onToggle,
}: {
  item: CatalogItem;
  agentId: number;
  returnTo: string;
  expandedKey: string | null;
  setExpandedKey: (id: string | null) => void;
  apiKeyInput: string;
  setApiKeyInput: (val: string) => void;
  savingKey: boolean;
  deletingKey: boolean;
  disconnecting: boolean;
  testingConnection: boolean;
  togglePending: boolean;
  onSaveApiKey: () => void;
  onDeleteApiKey: () => void;
  onDisconnect: () => void;
  onTest: () => void;
  onToggle: (enable: boolean) => void;
}) {
  const isApiKey = item.authType === "api_key";
  const isOAuth = item.authType === "oauth";
  const showKeyForm = expandedKey === item.id;

  const connectUrl = `/api/oauth/${item.oauthProvider}/start?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <Card className={`transition-all ${item.enabled ? "border-primary/30 bg-primary/5" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="text-2xl w-8 text-center flex-shrink-0 mt-0.5">
            {SERVICE_ICONS[item.id] ?? "🔌"}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{item.displayName}</span>

              {item.connected ? (
                <Badge variant="outline" className="text-xs text-green-600 border-green-300 bg-green-50 dark:bg-green-950/20">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {item.accountLabel || "Connected"}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  <XCircle className="h-3 w-3 mr-1" />
                  Not connected
                </Badge>
              )}

              {item.enabled && item.connected && (
                <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/20">
                  <Zap className="h-3 w-3 mr-1" />
                  {item.toolCount} tool{item.toolCount !== 1 ? "s" : ""} active
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>

            {/* Tool names */}
            {item.toolNames.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {item.toolNames.map(tool => (
                  <span key={tool} className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                    {tool}
                  </span>
                ))}
              </div>
            )}

            {/* OAuth: not ready (no client ID set) */}
            {isOAuth && !item.oauthReady && !item.connected && (
              <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Set <code className="font-mono bg-muted px-1 rounded">
                  {item.oauthProvider?.toUpperCase()}_CLIENT_ID
                </code> + <code className="font-mono bg-muted px-1 rounded">CLIENT_SECRET</code> to enable Connect
              </p>
            )}

            {/* API key form */}
            {isApiKey && (
              <Collapsible open={showKeyForm} onOpenChange={v => setExpandedKey(v ? item.id : null)}>
                <CollapsibleTrigger asChild>
                  <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-2">
                    <Key className="h-3 w-3" />
                    {item.connected ? "Update API key" : "Enter API key"}
                    <ChevronDown className={`h-3 w-3 transition-transform ${showKeyForm ? "rotate-180" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">{item.setupNote}</p>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder={item.apiKeyLabel || item.envVarLabel || "Paste your key…"}
                        value={apiKeyInput}
                        onChange={e => setApiKeyInput(e.target.value)}
                        className="text-xs h-8 flex-1"
                        onKeyDown={e => e.key === "Enter" && onSaveApiKey()}
                      />
                      <Button size="sm" className="h-8 text-xs" onClick={onSaveApiKey} disabled={savingKey || !apiKeyInput.trim()}>
                        {savingKey ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Connect / Disconnect for OAuth */}
            {isOAuth && !item.connected && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={!item.oauthReady}
                asChild={item.oauthReady}
              >
                {item.oauthReady ? (
                  <a href={connectUrl}>
                    <Link2 className="h-3 w-3 mr-1" />
                    {PROVIDER_CONNECT_LABELS[item.oauthProvider!] ?? "Connect"}
                  </a>
                ) : (
                  <span>
                    <Link2 className="h-3 w-3 mr-1" />
                    Connect
                  </span>
                )}
              </Button>
            )}

            {isOAuth && item.connected && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                onClick={onDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2Off className="h-3 w-3" />}
                Disconnect
              </Button>
            )}

            {/* Remove for API key */}
            {isApiKey && item.connected && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                onClick={onDeleteApiKey}
                disabled={deletingKey}
              >
                {deletingKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2Off className="h-3 w-3" />}
                Remove
              </Button>
            )}

            {/* Test Connection — shown when connected */}
            {item.connected && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={onTest}
                disabled={testingConnection}
                title="Test connection"
              >
                {testingConnection ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <FlaskConical className="h-3 w-3" />
                )}
                Test
              </Button>
            )}

            {/* Enable/disable toggle — only when connected */}
            <Switch
              checked={item.enabled}
              disabled={!item.connected || togglePending}
              onCheckedChange={onToggle}
              title={item.connected ? "Enable for this agent" : "Connect first to enable"}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
