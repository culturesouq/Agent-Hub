import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Integration } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Network, Trash2, Plug } from "lucide-react";

const CONNECTORS = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Read and send emails on behalf of your operator",
    icon: "✉️",
    color: "from-red-500/10 to-red-500/5",
    border: "border-red-500/20 hover:border-red-500/40",
    iconBg: "bg-red-500/10",
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "View and create calendar events",
    icon: "📅",
    color: "from-blue-500/10 to-blue-500/5",
    border: "border-blue-500/20 hover:border-blue-500/40",
    iconBg: "bg-blue-500/10",
  },
  {
    id: "outlook",
    name: "Outlook",
    description: "Connect Microsoft Outlook for email and calendar",
    icon: "📧",
    color: "from-sky-500/10 to-sky-500/5",
    border: "border-sky-500/20 hover:border-sky-500/40",
    iconBg: "bg-sky-500/10",
  },
  {
    id: "onedrive",
    name: "OneDrive",
    description: "Access and manage files in OneDrive",
    icon: "☁️",
    color: "from-cyan-500/10 to-cyan-500/5",
    border: "border-cyan-500/20 hover:border-cyan-500/40",
    iconBg: "bg-cyan-500/10",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Access LinkedIn profile and connections",
    icon: "💼",
    color: "from-indigo-500/10 to-indigo-500/5",
    border: "border-indigo-500/20 hover:border-indigo-500/40",
    iconBg: "bg-indigo-500/10",
  },
] as const;

export default function IntegrationsSection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["operators", operatorId, "integrations"],
    queryFn: () => apiFetch<{ integrations: Integration[] }>(`/operators/${operatorId}/integrations`).then(r => r.integrations ?? []),
  });

  const addIntegration = useMutation({
    mutationFn: (data: { integrationType: string; integrationLabel: string; token: string; scopes: string[] }) =>
      apiFetch(`/operators/${operatorId}/integrations`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      setConnectingTo(null);
      setTokenInput("");
      toast({ title: "Connected successfully" });
    },
    onError: (err: Error) => toast({ title: "Connection failed", description: err.message, variant: "destructive" }),
  });

  const deleteIntegration = useMutation({
    mutationFn: (integrationId: string) => apiFetch(`/operators/${operatorId}/integrations/${integrationId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "Disconnected" });
    },
  });

  const getConnected = (type: string): Integration | undefined =>
    (integrations as Integration[]).find((i: Integration) => i.integrationType === type);

  const handleConnect = (connector: typeof CONNECTORS[number]) => {
    if (getConnected(connector.id)) return;
    setConnectingTo(connector.id);
    setTokenInput("");
  };

  const handleSubmitToken = () => {
    const connector = CONNECTORS.find(c => c.id === connectingTo);
    if (!connector || !tokenInput.trim()) return;
    addIntegration.mutate({
      integrationType: connector.id,
      integrationLabel: connector.name,
      token: tokenInput.trim(),
      scopes: ["read", "write"],
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 glass-panel rounded-2xl border border-border/30 p-6">
      <div className="flex items-center gap-2 border-b border-border/50 pb-4">
        <Network className="w-5 h-5 text-primary" />
        <div>
          <h2 className="font-headline font-bold text-lg text-primary">Integrations</h2>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">Connect external services your operator can use</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl border border-border/30 bg-card/20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CONNECTORS.map((connector) => {
            const connected = getConnected(connector.id);
            return (
              <div
                key={connector.id}
                className={`rounded-xl border bg-gradient-to-br ${connector.color} ${connector.border} p-5 flex flex-col gap-4 transition-all`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg ${connector.iconBg} flex items-center justify-center text-xl shrink-0`}>
                    {connector.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-sm text-foreground">{connector.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground leading-snug mt-0.5">{connector.description}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/20 mt-auto">
                  {connected ? (
                    <>
                      <div className="flex items-center gap-1.5 text-green-500 font-mono text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Connected
                      </div>
                      <button
                        onClick={() => deleteIntegration.mutate(connected.id)}
                        disabled={deleteIntegration.isPending}
                        className="font-mono text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-xs">
                        <XCircle className="w-3.5 h-3.5" />
                        Not connected
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-mono text-xs h-7 px-3 border-border/40 hover:bg-primary/10 hover:border-primary/30 hover:text-primary"
                        onClick={() => handleConnect(connector)}
                      >
                        <Plug className="w-3 h-3 mr-1.5" /> Connect
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!connectingTo} onOpenChange={(open) => !open && setConnectingTo(null)}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">
              Connect {CONNECTORS.find(c => c.id === connectingTo)?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase text-muted-foreground">API Token / OAuth Token</Label>
              <Input
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="Paste your token here..."
                type="password"
                className="font-mono text-sm"
                onKeyDown={e => e.key === "Enter" && handleSubmitToken()}
                autoFocus
              />
              <p className="font-mono text-[10px] text-muted-foreground">
                Your token is encrypted and only accessible by this operator.
              </p>
            </div>
            <Button
              onClick={handleSubmitToken}
              disabled={!tokenInput.trim() || addIntegration.isPending}
              className="w-full font-mono font-bold"
            >
              {addIntegration.isPending ? "Connecting..." : "Connect"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
