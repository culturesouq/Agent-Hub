import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Integration } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Network, Trash2, Plug, Loader2, Key } from "lucide-react";

interface ConnectorDef {
  id: string;
  name: string;
  description: string;
  logo: React.ReactNode;
  color: string;
  border: string;
  googleOAuth: boolean;
  tokenHint?: string;
  tokenLabel?: string;
  tokenDocsUrl?: string;
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function GmailLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
    </svg>
  );
}

function CalendarLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="18" rx="2" fill="#1A73E8"/>
      <rect x="3" y="4" width="18" height="6" rx="2" fill="#4285F4"/>
      <rect x="3" y="8" width="18" height="2" fill="#4285F4"/>
      <text x="12" y="19" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">31</text>
      <rect x="8" y="2" width="2" height="4" rx="1" fill="#1A73E8"/>
      <rect x="14" y="2" width="2" height="4" rx="1" fill="#1A73E8"/>
    </svg>
  );
}

function DriveLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H.1c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
      <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.3 48.2c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00AC47"/>
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.25z" fill="#EA4335"/>
      <path d="M43.65 25L57.4 1.2C56.05.45 54.5 0 52.85 0H34.45c-1.65 0-3.2.45-4.55 1.2z" fill="#00832D"/>
      <path d="M59.8 52.7H27.5L13.75 76.5c1.35.75 2.9 1.2 4.55 1.2h50.7c1.65 0 3.2-.45 4.55-1.2z" fill="#2684FC"/>
      <path d="M73.4 26.35l-12.65-21.9C59.95 3.1 58.8 2 57.45 1.2L43.7 25l16.15 27.7H87.3c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00"/>
    </svg>
  );
}

function GitHubLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="text-foreground">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  );
}

function NotionLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="text-foreground">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/>
    </svg>
  );
}

function SlackLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A"/>
      <path d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
      <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0"/>
      <path d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
      <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D"/>
      <path d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
      <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E"/>
      <path d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
    </svg>
  );
}


const GOOGLE_CONNECTORS: ConnectorDef[] = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Send and read emails via Gmail",
    logo: <GmailLogo />,
    color: "from-red-500/10 to-red-500/5",
    border: "border-red-500/20 hover:border-red-500/40",
    googleOAuth: true,
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "View and manage calendar events",
    logo: <CalendarLogo />,
    color: "from-blue-500/10 to-blue-500/5",
    border: "border-blue-500/20 hover:border-blue-500/40",
    googleOAuth: true,
  },
  {
    id: "google_drive",
    name: "Google Drive",
    description: "Access and manage files in Drive",
    logo: <DriveLogo />,
    color: "from-yellow-500/10 to-green-500/5",
    border: "border-yellow-500/20 hover:border-yellow-500/40",
    googleOAuth: true,
  },
];

const OTHER_CONNECTORS: ConnectorDef[] = [
  {
    id: "github",
    name: "GitHub",
    description: "Connect repos, issues, and pull requests",
    logo: <GitHubLogo />,
    color: "from-neutral-500/10 to-neutral-500/5",
    border: "border-neutral-500/20 hover:border-neutral-500/40",
    googleOAuth: false,
    tokenLabel: "Personal Access Token",
    tokenHint: "ghp_xxxxxxxxxxxxxxxxxxxx",
    tokenDocsUrl: "https://github.com/settings/tokens",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Connect your Notion workspace and databases",
    logo: <NotionLogo />,
    color: "from-neutral-400/10 to-neutral-400/5",
    border: "border-neutral-400/20 hover:border-neutral-400/40",
    googleOAuth: false,
    tokenLabel: "Internal Integration Token",
    tokenHint: "secret_xxxxxxxxxxxxxxxxxxxx",
    tokenDocsUrl: "https://www.notion.so/my-integrations",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send and receive messages in Slack channels",
    logo: <SlackLogo />,
    color: "from-purple-500/10 to-pink-500/5",
    border: "border-purple-500/20 hover:border-purple-500/40",
    googleOAuth: false,
    tokenLabel: "Bot Token",
    tokenHint: "xoxb-xxxxxxxxxxxxxxxxxxxx",
    tokenDocsUrl: "https://api.slack.com/apps",
  },
];

const COMING_SOON = [
  { id: "hubspot",    name: "HubSpot",    description: "CRM and contact management",       icon: "🟠" },
  { id: "salesforce", name: "Salesforce", description: "Enterprise CRM",                   icon: "☁️" },
  { id: "jira",       name: "Jira",       description: "Project and issue tracking",        icon: "🔵" },
  { id: "zapier",     name: "Zapier",     description: "Automation bridge",                 icon: "⚡" },
  { id: "stripe",     name: "Stripe",     description: "Payments and billing",              icon: "💳" },
];

function ConnectorCard({
  connector,
  connected,
  onConnect,
  onDisconnect,
  disconnecting,
  connecting,
}: {
  connector: ConnectorDef;
  connected: Integration | undefined;
  onConnect: () => void;
  onDisconnect: (id: string) => void;
  disconnecting: boolean;
  connecting: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${connector.color} ${connector.border} p-5 flex flex-col gap-4 transition-all duration-200`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 border border-border/20">
          {connector.logo}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono font-bold text-sm text-foreground leading-tight">{connector.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground leading-snug mt-1">{connector.description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/20 mt-auto">
        {connected ? (
          <>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 text-green-500 font-mono text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Connected
              </div>
              {connected.integrationLabel && (
                <span className="font-mono text-[10px] text-muted-foreground/70 pl-5">
                  {connected.integrationLabel}
                </span>
              )}
            </div>
            <button
              onClick={() => onDisconnect(connected.id)}
              disabled={disconnecting}
              className="font-mono text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Disconnect
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 text-muted-foreground/60 font-mono text-xs">
              <XCircle className="w-3.5 h-3.5" />
              Not connected
            </div>
            <Button
              size="sm"
              variant="outline"
              className="font-mono text-xs h-7 px-3 border-border/40 hover:bg-primary/10 hover:border-primary/30 hover:text-primary"
              onClick={onConnect}
              disabled={connecting}
            >
              {connecting ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Plug className="w-3 h-3 mr-1.5" />}
              {connecting ? "Redirecting…" : "Connect"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ComingSoonCard({ name, description, icon }: { name: string; description: string; icon: string }) {
  return (
    <div className="rounded-xl border border-border/20 bg-card/10 p-5 flex flex-col gap-4 opacity-50">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-background/30 flex items-center justify-center shrink-0 border border-border/20">
          <span className="text-xl">{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono font-bold text-sm text-foreground leading-tight">{name}</p>
          <p className="font-mono text-[11px] text-muted-foreground leading-snug mt-1">{description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border/20 mt-auto">
        <div className="flex items-center gap-1.5 text-muted-foreground/60 font-mono text-xs">
          <XCircle className="w-3.5 h-3.5" />
          Not connected
        </div>
        <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground border-border/30">
          Coming soon
        </Badge>
      </div>
    </div>
  );
}

function TokenModal({
  connector,
  open,
  onClose,
  onSave,
  saving,
}: {
  connector: ConnectorDef | null;
  open: boolean;
  onClose: () => void;
  onSave: (token: string, label: string) => void;
  saving: boolean;
}) {
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");

  if (!connector) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    onSave(token.trim(), label.trim() || connector.name);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md font-mono">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="w-6 h-6 flex items-center justify-center">{connector.logo}</span>
            Connect {connector.name}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            {connector.description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="token-input" className="text-xs font-mono">
              {connector.tokenLabel ?? "API Token"}
            </Label>
            <Input
              id="token-input"
              type="password"
              placeholder={connector.tokenHint ?? "Paste your token here"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="font-mono text-xs"
              autoFocus
              autoComplete="off"
            />
            {connector.tokenDocsUrl && (
              <p className="text-[11px] text-muted-foreground">
                Get your token from{" "}
                <a
                  href={connector.tokenDocsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  {connector.tokenDocsUrl.replace(/^https?:\/\//, "")}
                </a>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="label-input" className="text-xs font-mono">
              Label <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="label-input"
              type="text"
              placeholder={`My ${connector.name} account`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="font-mono text-xs"
              autoComplete="off"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving} className="font-mono text-xs">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!token.trim() || saving} className="font-mono text-xs">
              {saving ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Key className="w-3 h-3 mr-1.5" />}
              {saving ? "Saving…" : "Save & Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function IntegrationsSection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [tokenModal, setTokenModal] = useState<ConnectorDef | null>(null);
  const [appUrl, setAppUrl] = useState('');
  const [appApiKey, setAppApiKey] = useState('');
  const [appLabel, setAppLabel] = useState('');
  const [connectAppStatus, setConnectAppStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [connectAppMessage, setConnectAppMessage] = useState('');

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["operators", operatorId, "integrations"],
    queryFn: () =>
      apiFetch<{ integrations: Integration[] }>(`/operators/${operatorId}/integrations`)
        .then((r) => r.integrations ?? []),
  });

  const deleteIntegration = useMutation({
    mutationFn: (integrationId: string) =>
      apiFetch(`/operators/${operatorId}/integrations/${integrationId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "Disconnected" });
    },
    onError: (err: Error) =>
      toast({ title: "Disconnect failed", description: err.message, variant: "destructive" }),
  });

  const saveTokenIntegration = useMutation({
    mutationFn: ({ connectorId, token, label }: { connectorId: string; token: string; label: string }) =>
      apiFetch(`/operators/${operatorId}/integrations`, {
        method: "POST",
        body: JSON.stringify({
          integrationType: connectorId,
          integrationLabel: label,
          token,
          scopes: [connectorId],
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "Connected", description: `${tokenModal?.name ?? "Integration"} connected successfully.` });
      setTokenModal(null);
      setConnectingId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
      setConnectingId(null);
    },
  });

  const connectCustomApp = useMutation({
    mutationFn: ({ baseUrl, apiKey, label }: { baseUrl: string; apiKey: string; label: string }) =>
      apiFetch<{ integration: Integration; schema: unknown; message: string }>(
        `/operators/${operatorId}/integrations/connect-app`,
        { method: "POST", body: JSON.stringify({ baseUrl, apiKey, label }) },
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      setConnectAppStatus("success");
      setConnectAppMessage(data.message ?? "App connected successfully.");
      setAppUrl("");
      setAppApiKey("");
      setAppLabel("");
    },
    onError: (err: Error) => {
      setConnectAppStatus("error");
      setConnectAppMessage(err.message);
    },
  });

  const customApps = (integrations as any[]).filter((i) => i.isCustomApp === true);

  const getConnected = (type: string): Integration | undefined =>
    (integrations as Integration[]).find((i: Integration) => i.integrationType === type);

  const handleConnect = async (connector: ConnectorDef) => {
    if (connector.googleOAuth) {
      setConnectingId(connector.id);
      try {
        const { authUrl } = await apiFetch<{ authUrl: string }>("/integrations/google/initiate", {
          method: "POST",
          body: JSON.stringify({ operatorId }),
        });
        window.location.href = authUrl;
      } catch (err: any) {
        toast({
          title: "Could not start Google connection",
          description: err.message,
          variant: "destructive",
        });
        setConnectingId(null);
      }
    } else {
      setTokenModal(connector);
    }
  };

  const handleTokenSave = (token: string, label: string) => {
    if (!tokenModal) return;
    setConnectingId(tokenModal.id);
    saveTokenIntegration.mutate({ connectorId: tokenModal.id, token, label });
  };

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300 glass-panel rounded-2xl border border-border/30 p-6">
      <div className="flex items-center gap-2 border-b border-border/50 pb-4">
        <Network className="w-5 h-5 text-primary" />
        <div>
          <h2 className="font-headline font-bold text-lg text-primary">Connections</h2>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">
            Connect external services your operator can use
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl border border-border/30 bg-card/20 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Google Suite */}
          <div className="space-y-3">
            <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
              Google Suite
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {GOOGLE_CONNECTORS.map((connector) => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  connected={getConnected(connector.id)}
                  onConnect={() => handleConnect(connector)}
                  onDisconnect={(id) => deleteIntegration.mutate(id)}
                  disconnecting={deleteIntegration.isPending}
                  connecting={connectingId === connector.id}
                />
              ))}
            </div>
          </div>

          {/* Messaging & Productivity */}
          <div className="space-y-3">
            <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
              Messaging & Productivity
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {OTHER_CONNECTORS.map((connector) => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  connected={getConnected(connector.id)}
                  onConnect={() => handleConnect(connector)}
                  onDisconnect={(id) => deleteIntegration.mutate(id)}
                  disconnecting={deleteIntegration.isPending}
                  connecting={connectingId === connector.id}
                />
              ))}
            </div>
          </div>

          {/* Coming Soon */}
          <div className="space-y-3">
            <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
              Coming Soon
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {COMING_SOON.map((item) => (
                <ComingSoonCard
                  key={item.id}
                  name={item.name}
                  description={item.description}
                  icon={item.icon}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Connect Your App */}
      <div className="border-t border-border/30 pt-6 space-y-4">
        <div>
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
            Connect Your App
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            Connect any app with an API — your operator will discover what it can do.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!appUrl.trim() || !appApiKey.trim()) return;
            setConnectAppStatus("loading");
            connectCustomApp.mutate({ baseUrl: appUrl.trim(), apiKey: appApiKey.trim(), label: appLabel.trim() });
          }}
          className="space-y-3 max-w-lg"
        >
          <div className="space-y-1.5">
            <Label className="text-xs font-mono">App URL</Label>
            <Input
              type="url"
              placeholder="https://api.yourapp.com"
              value={appUrl}
              onChange={(e) => setAppUrl(e.target.value)}
              className="font-mono text-xs"
              disabled={connectAppStatus === "loading"}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-mono">API Key</Label>
            <Input
              type="password"
              placeholder="Your API key or token"
              value={appApiKey}
              onChange={(e) => setAppApiKey(e.target.value)}
              className="font-mono text-xs"
              disabled={connectAppStatus === "loading"}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-mono">
              Label <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              type="text"
              placeholder="My App"
              value={appLabel}
              onChange={(e) => setAppLabel(e.target.value)}
              className="font-mono text-xs"
              disabled={connectAppStatus === "loading"}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={!appUrl.trim() || !appApiKey.trim() || connectAppStatus === "loading"}
            className="font-mono text-xs"
          >
            {connectAppStatus === "loading" ? (
              <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Connecting…</>
            ) : (
              <><Plug className="w-3 h-3 mr-1.5" />Connect App</>
            )}
          </Button>
        </form>

        {connectAppStatus === "success" && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 font-mono text-xs text-green-400 flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{connectAppMessage}</span>
          </div>
        )}
        {connectAppStatus === "error" && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 font-mono text-xs text-red-400 flex items-start gap-2">
            <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{connectAppMessage}</span>
          </div>
        )}

        {customApps.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
              Connected Apps
            </p>
            {customApps.map((app) => (
              <div
                key={app.id}
                className="rounded-xl border border-border/20 bg-card/20 p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-foreground truncate">{app.integrationLabel}</p>
                  <p className="font-mono text-[10px] text-muted-foreground truncate">{app.baseUrl}</p>
                  {app.createdAt && (
                    <p className="font-mono text-[10px] text-muted-foreground/60">
                      Connected {new Date(app.createdAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => deleteIntegration.mutate(app.id)}
                  disabled={deleteIntegration.isPending}
                  className="font-mono text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors disabled:opacity-50 shrink-0"
                >
                  {deleteIntegration.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <TokenModal
        connector={tokenModal}
        open={!!tokenModal}
        onClose={() => setTokenModal(null)}
        onSave={handleTokenSave}
        saving={saveTokenIntegration.isPending}
      />
    </div>
  );
}
