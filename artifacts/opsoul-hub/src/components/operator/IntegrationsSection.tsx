import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Integration } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Network, Trash2, Plug, Loader2 } from "lucide-react";

const CONNECTORS = [
  {
    id: "google",
    name: "Google",
    description: "Gmail, Google Calendar & Drive — all in one connection",
    icon: "G",
    color: "from-blue-500/10 to-red-500/5",
    border: "border-blue-500/20 hover:border-blue-500/40",
    iconBg: "bg-white/10",
    googleOAuth: true,
  },
  {
    id: "outlook",
    name: "Outlook",
    description: "Connect Microsoft Outlook for email and calendar",
    icon: "📧",
    color: "from-sky-500/10 to-sky-500/5",
    border: "border-sky-500/20 hover:border-sky-500/40",
    iconBg: "bg-sky-500/10",
    googleOAuth: false,
  },
  {
    id: "onedrive",
    name: "OneDrive",
    description: "Access and manage files in OneDrive",
    icon: "☁️",
    color: "from-cyan-500/10 to-cyan-500/5",
    border: "border-cyan-500/20 hover:border-cyan-500/40",
    iconBg: "bg-cyan-500/10",
    googleOAuth: false,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Access LinkedIn profile and connections",
    icon: "💼",
    color: "from-indigo-500/10 to-indigo-500/5",
    border: "border-indigo-500/20 hover:border-indigo-500/40",
    iconBg: "bg-indigo-500/10",
    googleOAuth: false,
  },
] as const;

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

function ConnectorCard({
  connector,
  connected,
  onConnect,
  onDisconnect,
  disconnecting,
  connecting,
}: {
  connector: typeof CONNECTORS[number];
  connected: Integration | undefined;
  onConnect: () => void;
  onDisconnect: (id: string) => void;
  disconnecting: boolean;
  connecting: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-gradient-to-br ${connector.color} ${connector.border} p-5 flex flex-col gap-4 transition-all duration-200`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg ${connector.iconBg} flex items-center justify-center shrink-0 border border-border/20`}
        >
          {connector.id === "google" ? <GoogleLogo /> : <span className="text-xl">{connector.icon}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono font-bold text-sm text-foreground leading-tight">
            {connector.name}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground leading-snug mt-1">
            {connector.description}
          </p>
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
              {disconnecting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
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
              {connecting ? (
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              ) : (
                <Plug className="w-3 h-3 mr-1.5" />
              )}
              {connecting ? "Redirecting…" : "Connect"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function IntegrationsSection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["operators", operatorId, "integrations"],
    queryFn: () =>
      apiFetch<{ integrations: Integration[] }>(
        `/operators/${operatorId}/integrations`
      ).then((r) => r.integrations ?? []),
  });

  const deleteIntegration = useMutation({
    mutationFn: (integrationId: string) =>
      apiFetch(`/operators/${operatorId}/integrations/${integrationId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["operators", operatorId, "integrations"],
      });
      toast({ title: "Disconnected" });
    },
    onError: (err: Error) =>
      toast({
        title: "Disconnect failed",
        description: err.message,
        variant: "destructive",
      }),
  });

  const getConnected = (type: string): Integration | undefined =>
    (integrations as Integration[]).find(
      (i: Integration) => i.integrationType === type
    );

  const handleConnect = async (connectorId: string, googleOAuth: boolean) => {
    if (!googleOAuth) {
      toast({
        title: `Coming soon`,
        description: "OAuth integration for this service is on the roadmap.",
      });
      return;
    }

    setConnectingId(connectorId);
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
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 glass-panel rounded-2xl border border-border/30 p-6">
      <div className="flex items-center gap-2 border-b border-border/50 pb-4">
        <Network className="w-5 h-5 text-primary" />
        <div>
          <h2 className="font-headline font-bold text-lg text-primary">
            Connections
          </h2>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">
            Connect external services your operator can use
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-36 rounded-xl border border-border/30 bg-card/20 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CONNECTORS.map((connector) => {
            const connected = getConnected(connector.id);
            return (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                connected={connected}
                onConnect={() => handleConnect(connector.id, connector.googleOAuth)}
                onDisconnect={(id) => deleteIntegration.mutate(id)}
                disconnecting={deleteIntegration.isPending}
                connecting={connectingId === connector.id}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
