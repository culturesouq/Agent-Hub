import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Integration } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, MessageCircle, Trash2, Loader2, ExternalLink, ShieldAlert, ShieldCheck, KeyRound, X } from "lucide-react";

function WhatsAppLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"
        fill="white"
      />
    </svg>
  );
}

const STEPS = [
  {
    num: 1,
    text: "Go to Meta for Developers and create an app.",
    highlight: "meta.com/developers",
    link: "https://developers.facebook.com/apps",
  },
  {
    num: 2,
    text: "Inside your app, click Add Product and choose",
    highlight: "WhatsApp",
    link: null,
  },
  {
    num: 3,
    text: "Navigate to WhatsApp → API Setup. Copy your access token.",
    highlight: null,
    link: null,
  },
  {
    num: 4,
    text: "On the same page, copy your",
    highlight: "Phone Number ID",
    link: null,
  },
  {
    num: 5,
    text: "From your app's Settings → Basic, copy the",
    highlight: "App Secret",
    link: null,
  },
  {
    num: 6,
    text: "Paste all values below and click Connect.",
    highlight: null,
    link: null,
  },
];

export default function WhatsAppChannelSection({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [newAppSecret, setNewAppSecret] = useState("");
  const [showSecretForm, setShowSecretForm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["operators", operatorId, "integrations"],
    queryFn: () =>
      apiFetch<{ integrations: Integration[] }>(`/operators/${operatorId}/integrations`)
        .then((r) => r.integrations ?? []),
  });

  const connected = (integrations as Integration[]).find(
    (i) => i.integrationType === "whatsapp"
  );

  const connect = useMutation({
    mutationFn: () =>
      apiFetch(`/operators/${operatorId}/integrations`, {
        method: "POST",
        body: JSON.stringify({
          integrationType: "whatsapp",
          integrationLabel: phoneNumberId.trim(),
          token: accessToken.trim(),
          scopes: ["whatsapp"],
          appSchema: {
            phoneNumberId: phoneNumberId.trim(),
            ...(appSecret.trim() ? { appSecret: appSecret.trim() } : {}),
          },
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "WhatsApp connected", description: "Your number is now linked to this operator." });
      setAccessToken("");
      setPhoneNumberId("");
      setAppSecret("");
    },
    onError: (err: Error) =>
      toast({ title: "Connection failed", description: err.message, variant: "destructive" }),
  });

  const updateSecret = useMutation({
    mutationFn: () =>
      apiFetch(`/operators/${operatorId}/integrations/${connected!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ appSecret: newAppSecret.trim() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "App Secret saved", description: "HMAC signature validation is now active." });
      setNewAppSecret("");
      setShowSecretForm(false);
    },
    onError: (err: Error) =>
      toast({ title: "Failed to save App Secret", description: err.message, variant: "destructive" }),
  });

  const removeSecret = useMutation({
    mutationFn: () =>
      apiFetch(`/operators/${operatorId}/integrations/${connected!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ appSecret: null }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "App Secret removed", description: "Webhook HMAC validation has been disabled." });
      setShowSecretForm(false);
      setShowRemoveConfirm(false);
    },
    onError: (err: Error) =>
      toast({ title: "Failed to remove App Secret", description: err.message, variant: "destructive" }),
  });

  const disconnect = useMutation({
    mutationFn: (integrationId: string) =>
      apiFetch(`/operators/${operatorId}/integrations/${integrationId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "WhatsApp disconnected" });
      setShowDisconnectConfirm(false);
    },
    onError: (err: Error) =>
      toast({ title: "Disconnect failed", description: err.message, variant: "destructive" }),
  });

  const canSubmit = accessToken.trim() && phoneNumberId.trim();

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 glass-panel rounded-2xl border border-border/30 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/50 pb-4">
        <WhatsAppLogo />
        <div>
          <h2 className="font-headline font-bold text-lg text-primary">
            WhatsApp Channel
          </h2>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">
            Let your operator send and receive messages via WhatsApp Business API
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 rounded-xl border border-border/30 bg-card/20 animate-pulse" />
      ) : connected ? (
        /* ── Connected state ── */
        <div className="space-y-3">
          <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <div>
                <p className="font-mono text-sm font-bold text-green-400">Connected</p>
                {connected.integrationLabel && (
                  <p className="font-mono text-xs text-muted-foreground mt-0.5">
                    Phone Number ID: <span className="text-foreground">{connected.integrationLabel}</span>
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="font-mono text-xs text-muted-foreground hover:text-destructive"
              onClick={() => setShowDisconnectConfirm(true)}
              disabled={disconnect.isPending || showDisconnectConfirm}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Disconnect
            </Button>
          </div>

          {/* Disconnect confirmation */}
          {showDisconnectConfirm && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Trash2 className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-mono text-xs font-semibold text-destructive">Disconnect WhatsApp?</p>
                  <p className="font-mono text-[11px] text-muted-foreground mt-1">
                    This will permanently remove your access token, phone number ID, and webhook connection. You will need to re-enter all credentials to reconnect.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="font-mono text-xs"
                  onClick={() => setShowDisconnectConfirm(false)}
                  disabled={disconnect.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="font-mono text-xs"
                  onClick={() => disconnect.mutate(connected.id)}
                  disabled={disconnect.isPending}
                >
                  {disconnect.isPending ? (
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3 mr-1.5" />
                  )}
                  Yes, disconnect
                </Button>
              </div>
            </div>
          )}

          {/* HMAC security status */}
          {connected.hasAppSecret ? (
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3 flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-green-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs text-green-400 font-semibold">HMAC signature validation active</p>
                <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                  All incoming webhooks are verified against your Meta App Secret.
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="font-mono text-[11px] text-muted-foreground"
                  onClick={() => setShowSecretForm((v) => !v)}
                >
                  <KeyRound className="w-3 h-3 mr-1" />
                  Update
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="font-mono text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={() => setShowRemoveConfirm(true)}
                  disabled={showRemoveConfirm}
                >
                  <X className="w-3 h-3 mr-1" />
                  Remove Secret
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs text-amber-400 font-semibold">No App Secret — webhook is unprotected</p>
                <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                  Without an App Secret, anyone can send spoofed messages to your webhook. Add your Meta App Secret to enable HMAC validation.
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="font-mono text-[11px] text-amber-400 hover:text-amber-300 shrink-0"
                onClick={() => setShowSecretForm((v) => !v)}
              >
                <KeyRound className="w-3 h-3 mr-1" />
                Add Secret
              </Button>
            </div>
          )}

          {/* Remove secret confirmation */}
          {showRemoveConfirm && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-mono text-xs font-semibold text-destructive">Remove App Secret?</p>
                  <p className="font-mono text-[11px] text-muted-foreground mt-1">
                    This will disable HMAC signature validation. Your webhook will no longer verify that messages come from Meta — anyone with your webhook URL could send spoofed messages.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="font-mono text-xs"
                  onClick={() => setShowRemoveConfirm(false)}
                  disabled={removeSecret.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="font-mono text-xs"
                  onClick={() => removeSecret.mutate()}
                  disabled={removeSecret.isPending}
                >
                  {removeSecret.isPending ? (
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  ) : (
                    <X className="w-3 h-3 mr-1.5" />
                  )}
                  Yes, remove secret
                </Button>
              </div>
            </div>
          )}

          {/* Update app secret form */}
          {showSecretForm && (
            <div className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-3">
              <p className="font-mono text-xs text-muted-foreground">
                Find your App Secret in the Meta for Developers portal under{" "}
                <span className="text-foreground">Settings → Basic</span>.
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Meta App Secret"
                  value={newAppSecret}
                  onChange={(e) => setNewAppSecret(e.target.value)}
                  className="font-mono text-xs flex-1"
                  autoComplete="off"
                />
                <Button
                  onClick={() => updateSecret.mutate()}
                  disabled={!newAppSecret.trim() || updateSecret.isPending}
                  className="font-mono text-xs shrink-0"
                >
                  {updateSecret.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setShowSecretForm(false); setNewAppSecret(""); }}
                  className="font-mono text-xs shrink-0"
                >
                  Cancel
                </Button>
              </div>
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
                <div className="w-6 h-6 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="font-mono text-[11px] font-bold text-green-400">{step.num}</span>
                </div>
                <p className="font-mono text-sm text-muted-foreground leading-relaxed pt-0.5">
                  {step.text}{" "}
                  {step.highlight && step.link ? (
                    <a
                      href={step.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-400 font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      {step.highlight}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : step.highlight ? (
                    <code className="font-mono text-green-400 bg-green-500/10 rounded px-1 py-0.5 text-xs">
                      {step.highlight}
                    </code>
                  ) : null}
                </p>
              </div>
            ))}
          </div>

          {/* Inputs */}
          <div className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                WhatsApp Access Token
              </label>
              <Input
                type="password"
                placeholder="EAAxxxxxxxxxxxxxxxxxxxx"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                Phone Number ID
              </label>
              <Input
                type="text"
                placeholder="1234567890123456"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                App Secret{" "}
                <span className="normal-case text-muted-foreground/60">(recommended)</span>
              </label>
              <Input
                type="password"
                placeholder="From Meta app Settings → Basic"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                className="font-mono text-xs"
                autoComplete="off"
              />
              <p className="font-mono text-[11px] text-muted-foreground/60">
                Required to validate webhook signatures and block spoofed messages.
              </p>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="font-mono text-[11px] text-muted-foreground/60">
                Credentials are encrypted and stored securely.
              </p>
              <Button
                onClick={() => connect.mutate()}
                disabled={!canSubmit || connect.isPending}
                className="font-mono text-xs px-4 shrink-0"
              >
                {connect.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                )}
                {connect.isPending ? "Connecting…" : "Connect"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
