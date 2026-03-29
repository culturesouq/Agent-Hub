import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Puzzle, CheckCircle, XCircle, Loader2, ChevronDown,
  Info, Zap, ExternalLink, Search,
} from "lucide-react";

interface CatalogItem {
  id: string;
  displayName: string;
  category: string;
  description: string;
  icon: string;
  envVar?: string;
  envVarLabel?: string;
  setupNote: string;
  toolNames: string[];
  toolCount: number;
  available: boolean;
  enabled: boolean;
}

const CATEGORY_META: Record<string, { label: string; order: number }> = {
  google:        { label: "Google Workspace",   order: 1 },
  microsoft:     { label: "Microsoft 365",       order: 2 },
  dev:           { label: "Developer Tools",     order: 3 },
  productivity:  { label: "Productivity",        order: 4 },
  crm:           { label: "CRM & Sales",         order: 5 },
  finance:       { label: "Finance",             order: 6 },
  communication: { label: "Communication",       order: 7 },
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

export function AgentIntegrations({ agentId }: { agentId: number }) {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message?: string | null }>>({});
  const [expandedSetup, setExpandedSetup] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: catalog = [], isLoading } = useQuery<CatalogItem[]>({
    queryKey: ["integrations-catalog", agentId],
    queryFn: async () => {
      const r = await fetch(`/api/agents/${agentId}/integrations/catalog`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load integrations");
      return r.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ serviceId, enable }: { serviceId: string; enable: boolean }) => {
      const action = enable ? "enable" : "disable";
      const r = await fetch(`/api/agents/${agentId}/integrations/${serviceId}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to update integration");
      return r.json();
    },
    onSuccess: (_, { enable, serviceId }) => {
      qc.invalidateQueries({ queryKey: ["integrations-catalog", agentId] });
      const item = catalog.find(i => i.id === serviceId);
      toast({ title: enable ? `${item?.displayName} enabled` : `${item?.displayName} disabled` });
    },
    onError: () => toast({ title: "Error", description: "Could not update integration", variant: "destructive" }),
  });

  const handleTest = async (serviceId: string) => {
    setTestingId(serviceId);
    try {
      const r = await fetch(`/api/agents/${agentId}/integrations/${serviceId}/test`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json() as { ok: boolean; message?: string | null };
      setTestResults(prev => ({ ...prev, [serviceId]: data }));
    } catch {
      setTestResults(prev => ({ ...prev, [serviceId]: { ok: false, message: "Network error" } }));
    } finally {
      setTestingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading integrations…</span>
      </div>
    );
  }

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

  const byCategory = filtered.reduce<Record<string, CatalogItem[]>>((acc, item) => {
    (acc[item.category] = acc[item.category] || []).push(item);
    return acc;
  }, {});

  const sortedCategories = Object.keys(byCategory).sort(
    (a, b) => (CATEGORY_META[a]?.order ?? 99) - (CATEGORY_META[b]?.order ?? 99)
  );

  const enabledCount = catalog.filter(i => i.enabled).length;
  const availableCount = catalog.filter(i => i.available).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Puzzle className="h-5 w-5" />
            Platform Integrations
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect external services with your own API keys. {availableCount} of {catalog.length} configured · {enabledCount} active.
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
            {byCategory[category].map(item => {
              const testResult = testResults[item.id];
              const isTesting = testingId === item.id;
              const isExpanded = expandedSetup === item.id;

              return (
                <Card key={item.id} className={`transition-all ${item.enabled ? "border-primary/30 bg-primary/5" : ""}`}>
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
                          {item.available ? (
                            <Badge variant="outline" className="text-xs text-green-600 border-green-300 bg-green-50 dark:bg-green-950/20">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Ready
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/20">
                              <XCircle className="h-3 w-3 mr-1" />
                              Needs setup
                            </Badge>
                          )}
                          {item.enabled && item.available && (
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

                        {/* Test result */}
                        {testResult && (
                          <div className={`text-xs mt-2 flex items-center gap-1 ${testResult.ok ? "text-green-600" : "text-red-500"}`}>
                            {testResult.ok ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {testResult.message ?? (testResult.ok ? "Connected successfully" : "Connection failed")}
                          </div>
                        )}

                        {/* Setup instructions collapsible (shown when not available) */}
                        {!item.available && (
                          <Collapsible open={isExpanded} onOpenChange={v => setExpandedSetup(v ? item.id : null)}>
                            <CollapsibleTrigger asChild>
                              <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-2">
                                <Info className="h-3 w-3" />
                                Setup instructions
                                <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="mt-2 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground space-y-2">
                                <p>{item.setupNote}</p>
                                {item.envVar && (
                                  <p className="font-mono bg-background/80 rounded px-2 py-1 text-foreground">
                                    Add <strong>{item.envVar}</strong> to your environment secrets
                                    {item.envVarLabel && ` (${item.envVarLabel})`}
                                  </p>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {item.available && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleTest(item.id)}
                            disabled={isTesting}
                          >
                            {isTesting
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <ExternalLink className="h-3 w-3" />}
                            Test
                          </Button>
                        )}
                        <Switch
                          checked={item.enabled}
                          disabled={!item.available || toggleMutation.isPending}
                          onCheckedChange={checked => toggleMutation.mutate({ serviceId: item.id, enable: checked })}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Footer hint */}
      <p className="text-xs text-muted-foreground text-center pt-2 border-t">
        Enabled integrations give this agent tools to use during chat. Add your API keys via environment secrets to activate them.
      </p>
    </div>
  );
}
