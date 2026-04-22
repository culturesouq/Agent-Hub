import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Integration } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Send, Trash2, Loader2, ExternalLink, AlertCircle, RefreshCw } from "lucide-react";

function TelegramLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="12" fill="#2CA5E0" />
      <path d="M5.491 11.74l11.57-4.461c.537-.194 1.006.131.832.943l-.001.001-1.97 9.281c-.146.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953z" fill="white" />
    </svg>
  );
}

const STEPS = [
  {
    num: 1,
    text: "Open Telegram and search for",
    highlight: "@BotFather",
    link: "https://t.me/BotFather",
  },
  {
    num: 2,
    text: "Send the command",
    highlight: "/newbot",
    link: null,
  },
  {
    num: 3,
    text: "Follow the prompts — choose a name and a username ending in",
    highlight: "_bot",
    link: null,
  },
  {
    num: 4,
    text: "Copy the bot token BotFather sends you, paste it below, and click Connect.",
    highlight: null,
    link: null,
  },
];

export default function TelegramChannelSection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["operators", operatorId, "integrations"],
    queryFn: () =>
      apiFetch<{ integrations: Integration[] }>(`/operators/${operatorId}/integrations`)
        .then((r) => r.integrations ?? []),
    refetchInterval: (query) => {
      const tg = (query.state.data as Integration[] | undefined)?.find(
        (i) => i.integrationType === "telegram"
      );
      return tg?.status === "pending" ? 2000 : false;
    },
  });

  const connected = (integrations as Integration[]).find(
    (i) => i.integrationType === "telegram"
  );

  const connect = useMutation({
    mutationFn: () =>
      apiFetch(`/operators/${operatorId}/integrations`, {
        method: "POST",
        body: JSON.stringify({
          integrationType: "telegram",
          integrationLabel: "Telegram Bot",
          token,
          scopes: ["telegram"],
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "Registering webhook…", description: "Your bot token was saved. The webhook will be ready in a moment." });
      setToken("");
    },
    onError: (err: Error) =>
      toast({ title: "Connection failed", description: err.message, variant: "destructive" }),
  });

  const disconnect = useMutation({
    mutationFn: (integrationId: string) =>
      apiFetch(`/operators/${operatorId}/integrations/${integrationId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      setConfirmingDisconnect(false);
      toast({ title: "Telegram disconnected" });
    },
    onError: (err: Error) =>
      toast({ title: "Disconnect failed", description: err.message, variant: "destructive" }),
  });

  const retryWebhook = useMutation({
    mutationFn: (integrationId: string) =>
      apiFetch<{ ok: boolean; error?: string }>(`/operators/${operatorId}/integrations/${integrationId}/retry-webhook`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "Webhook registered", description: "Your bot is now ready to receive messages." });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "Retry failed", description: err.message, variant: "destructive" });
    },
  });

  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const prevStatusRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const currentStatus = connected?.status;
    if (prevStatusRef.current === "pending" && currentStatus === "connected") {
      toast({ title: "Your Telegram bot is ready to receive messages" });
    }
    prevStatusRef.current = currentStatus;
  }, [connected?.status, toast]);

  const isPending = connected?.status === "pending";
  const isError = connected?.status === "error";
  const webhookError = connected?.appSchema?.webhookError as string | undefined;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 glass-panel rounded-2xl border border-border/30 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/50 pb-4">
        <TelegramLogo />
        <div>
          <h2 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
            Telegram Channel
          </h2>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">
            Let your operator send and receive messages via a Telegram bot
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 rounded-xl border border-border/30 bg-card/20 animate-pulse" />
      ) : connected ? (
        /* ── Connected / Pending / Error state ── */
        <div className="space-y-3">
          {isPending ? (
            <div className="rounded-xl border border-border/40 bg-card/20 p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-muted-foreground shrink-0 animate-spin" />
                <div>
                  <p className="font-mono text-sm font-bold text-muted-foreground">Registering webhook…</p>
                  <p className="font-mono text-xs text-muted-foreground/70 mt-0.5">
                    Connecting your bot to this operator. This usually takes a moment.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="font-mono text-xs text-muted-foreground hover:text-destructive"
                onClick={() => disconnect.mutate(connected.id)}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                )}
                Cancel
              </Button>
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm font-bold text-destructive">Webhook registration failed</p>
                  <p className="font-mono text-xs text-muted-foreground mt-1 leading-relaxed">
                    {webhookError
                      ? webhookError
                      : "Telegram could not register the webhook. The bot will not receive messages until this is resolved."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="font-mono text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => retryWebhook.mutate(connected.id)}
                  disabled={retryWebhook.isPending || confirmingDisconnect}
                >
                  {retryWebhook.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {retryWebhook.isPending ? "Retrying…" : "Re-register webhook"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="font-mono text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmingDisconnect(true)}
                  disabled={disconnect.isPending || confirmingDisconnect}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Disconnect
                </Button>
              </div>
              {confirmingDisconnect && (
                <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 space-y-3 mt-1">
                  <p className="font-mono text-sm font-bold text-destructive">Confirm disconnect</p>
                  <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                    This will remove your bot token and deregister the Telegram webhook. Your bot will stop receiving messages immediately. This action cannot be undone — you will need to re-enter your token to reconnect.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="font-mono text-xs"
                      onClick={() => disconnect.mutate(connected.id)}
                      disabled={disconnect.isPending}
                    >
                      {disconnect.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      {disconnect.isPending ? "Disconnecting…" : "Yes, disconnect"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="font-mono text-xs text-muted-foreground"
                      onClick={() => setConfirmingDisconnect(false)}
                      disabled={disconnect.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                  <div>
                    <p className="font-mono text-sm font-bold text-green-400">Connected</p>
                    {connected.integrationLabel && (
                      <p className="font-mono text-xs text-muted-foreground mt-0.5">
                        {connected.integrationLabel}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="font-mono text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmingDisconnect(true)}
                  disabled={disconnect.isPending || confirmingDisconnect}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Disconnect
                </Button>
              </div>
              {confirmingDisconnect && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                  <p className="font-mono text-sm font-bold text-destructive">Confirm disconnect</p>
                  <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                    This will remove your bot token and deregister the Telegram webhook. Your bot will stop receiving messages immediately. This action cannot be undone — you will need to re-enter your token to reconnect.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="font-mono text-xs"
                      onClick={() => disconnect.mutate(connected.id)}
                      disabled={disconnect.isPending}
                    >
                      {disconnect.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      {disconnect.isPending ? "Disconnecting…" : "Yes, disconnect"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="font-mono text-xs text-muted-foreground"
                      onClick={() => setConfirmingDisconnect(false)}
                      disabled={disconnect.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ── Setup flow ── */
        <div className="space-y-6">
          {/* Steps */}
          <div className="space-y-3">
            {STEPS.map((step) => (
              <div key={step.num} className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="font-mono text-[11px] font-bold text-primary">{step.num}</span>
                </div>
                <p className="font-mono text-sm text-muted-foreground leading-relaxed pt-0.5">
                  {step.text}{" "}
                  {step.highlight && step.link ? (
                    <a
                      href={step.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      {step.highlight}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : step.highlight ? (
                    <code className="font-mono text-primary bg-primary/10 rounded px-1 py-0.5 text-xs">
                      {step.highlight}
                    </code>
                  ) : null}
                </p>
              </div>
            ))}
          </div>

          {/* Token input */}
          <div className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-3">
            <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
              Bot Token
            </label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="1234567890:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="font-mono text-xs flex-1"
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && token.trim()) connect.mutate();
                }}
              />
              <Button
                onClick={() => connect.mutate()}
                disabled={!token.trim() || connect.isPending}
                className="font-mono text-xs px-4 shrink-0"
              >
                {connect.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                )}
                {connect.isPending ? "Connecting…" : "Connect"}
              </Button>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground/60">
              Your token is encrypted and stored securely. It is never exposed in the UI.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
