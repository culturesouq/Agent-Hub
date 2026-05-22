import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Integration } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2, XCircle, Network, Trash2, Plug, Loader2, Key, Send,
  ExternalLink, ShieldAlert, ShieldCheck, KeyRound, Copy, Check, Cpu, ChevronDown,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
 * Connectors catalog
 * ────────────────────────────────────────────────────────────────────────── */

interface ConnectorDef {
  id: string;
  name: string;
  description: string;
  logo: React.ReactNode;
  brand: string;          // tailwind color stem, used for tinting cards
  category: "channels" | "google" | "productivity";
  /** OAuth-driven flow (only Google for now). */
  googleOAuth?: boolean;
  /** Personal-access-token style — show a single token input. */
  tokenLabel?: string;
  tokenHint?: string;
  tokenDocsUrl?: string;
  /** Channels with bespoke setup steps. */
  channel?: "telegram" | "whatsapp";
}

function GoogleLogo() { return <svg width="20" height="20" viewBox="0 0 18 18"><path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>; }
function GmailLogo() { return <svg width="20" height="20" viewBox="0 0 24 24"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/></svg>; }
function CalendarLogo() { return <svg width="20" height="20" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" fill="#1A73E8"/><rect x="3" y="4" width="18" height="6" rx="2" fill="#4285F4"/><text x="12" y="19" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">31</text></svg>; }
function DriveLogo() { return <svg width="20" height="20" viewBox="0 0 87.3 78"><path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H.1c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/><path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.3 48.2c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00AC47"/><path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.25z" fill="#EA4335"/><path d="M43.65 25L57.4 1.2C56.05.45 54.5 0 52.85 0H34.45c-1.65 0-3.2.45-4.55 1.2z" fill="#00832D"/><path d="M59.8 52.7H27.5L13.75 76.5c1.35.75 2.9 1.2 4.55 1.2h50.7c1.65 0 3.2-.45 4.55-1.2z" fill="#2684FC"/><path d="M73.4 26.35l-12.65-21.9C59.95 3.1 58.8 2 57.45 1.2L43.7 25l16.15 27.7H87.3c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00"/></svg>; }
function GitHubLogo() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-foreground"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>; }
function NotionLogo() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-foreground"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/></svg>; }
function SlackLogo() { return <svg width="20" height="20" viewBox="0 0 24 24"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A"/><path d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/><path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0"/><path d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/><path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D"/><path d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/><path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E"/><path d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/></svg>; }
function HubSpotLogo() { return <svg width="20" height="20" viewBox="0 0 24 24"><path d="M18.164 7.932V5.768a1.69 1.69 0 0 0 .976-1.527V4.19A1.69 1.69 0 0 0 17.45 2.5h-.052a1.69 1.69 0 0 0-1.69 1.69v.051a1.69 1.69 0 0 0 .976 1.527v2.164a4.798 4.798 0 0 0-2.285.999L7.694 4.132a1.91 1.91 0 1 0-.898 1.217l6.574 4.724a4.816 4.816 0 0 0-.648 2.434 4.816 4.816 0 0 0 .842 2.718l-2.001 2.001a1.596 1.596 0 0 0-.428-.062 1.62 1.62 0 1 0 1.62 1.62 1.596 1.596 0 0 0-.062-.428l1.977-1.977A4.837 4.837 0 1 0 18.164 7.932z" fill="#FF7A59"/></svg>; }
function LinearLogo() { return <svg width="20" height="20" viewBox="0 0 24 24"><path d="M3.2 14.338L9.71 20.8a9.608 9.608 0 0 1-6.51-6.462zM3 12.608l8.437 8.38a9.61 9.61 0 0 1-1.35.012L3.012 13.96A9.613 9.613 0 0 1 3 12.608zM3.372 10.555l10.123 10.063a9.653 9.653 0 0 1-1.218-.31L3.68 11.772a9.61 9.61 0 0 1-.308-1.217zm.79-1.842 11.175 11.11a9.628 9.628 0 0 1-.928-.536L4.699 9.248a9.626 9.626 0 0 1-.537-.935zm1.556-1.603 11.704 11.635a9.675 9.675 0 0 1-.661-.748L5.719 7.771a9.667 9.667 0 0 1-.748-.661zm2.098-1.434 10.79 10.722a9.608 9.608 0 0 1-6.466 2.504L3.993 10.35a9.609 9.609 0 0 1 3.823-8.674zM9.49 3.206l11.348 11.278a9.608 9.608 0 0 1-1.012 1.617L8.084 4.22A9.612 9.612 0 0 1 9.49 3.206zm2.437-.966 9.882 9.817a9.608 9.608 0 0 1-.509 1.871L11.5 3.6a9.61 9.61 0 0 1 .428-1.36zm2.68-.234 5.432 5.398a9.61 9.61 0 0 1 .23 6.566L12.9 2.4a9.61 9.61 0 0 1 1.707.606z" fill="#5E6AD2"/></svg>; }
function DiscordLogo() { return <svg width="20" height="20" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.956 2.419-2.157 2.419zm7.974 0c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.419-2.157 2.419z" fill="#5865F2"/></svg>; }
function TelegramLogo() { return <svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#2CA5E0" /><path d="M5.491 11.74l11.57-4.461c.537-.194 1.006.131.832.943l-.001.001-1.97 9.281c-.146.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953z" fill="white" /></svg>; }
function WhatsAppLogo() { return <svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#25D366" /><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" fill="white"/></svg>; }

const CONNECTORS: ConnectorDef[] = [
  // Channels
  { id: "telegram", name: "Telegram", description: "Two-way bot messaging — your operator sends and receives", logo: <TelegramLogo />, brand: "sky", category: "channels", channel: "telegram" },
  { id: "whatsapp", name: "WhatsApp", description: "WhatsApp Business API — full inbound + outbound", logo: <WhatsAppLogo />, brand: "green", category: "channels", channel: "whatsapp" },
  { id: "discord", name: "Discord", description: "Bot for Discord servers — channels and DMs", logo: <DiscordLogo />, brand: "indigo", category: "channels",
    tokenLabel: "Bot Token", tokenHint: "Bot xxxxxxxx", tokenDocsUrl: "https://discord.com/developers/applications" },
  // Google
  { id: "gmail",           name: "Gmail",           description: "Send and read emails via Gmail",          logo: <GmailLogo />,    brand: "red",    category: "google", googleOAuth: true },
  { id: "google_calendar", name: "Google Calendar", description: "View and manage calendar events",         logo: <CalendarLogo />, brand: "blue",   category: "google", googleOAuth: true },
  { id: "google_drive",    name: "Google Drive",    description: "Access and manage files in Drive",        logo: <DriveLogo />,    brand: "yellow", category: "google", googleOAuth: true },
  // Productivity
  { id: "github",  name: "GitHub",  description: "Repos, issues, and pull requests",            logo: <GitHubLogo />,  brand: "neutral", category: "productivity", tokenLabel: "Personal Access Token", tokenHint: "ghp_xxxxxxxxxxxx",       tokenDocsUrl: "https://github.com/settings/tokens" },
  { id: "notion",  name: "Notion",  description: "Workspace and database access",               logo: <NotionLogo />,  brand: "neutral", category: "productivity", tokenLabel: "Internal Integration Token", tokenHint: "secret_xxxxxxxx",  tokenDocsUrl: "https://www.notion.so/my-integrations" },
  { id: "slack",   name: "Slack",   description: "Send and receive messages in Slack channels", logo: <SlackLogo />,   brand: "purple",  category: "productivity", tokenLabel: "Bot Token",              tokenHint: "xoxb-xxxxxxxxxxxx",      tokenDocsUrl: "https://api.slack.com/apps" },
  { id: "hubspot", name: "HubSpot", description: "CRM — contacts, deals, and companies",        logo: <HubSpotLogo />, brand: "orange",  category: "productivity", tokenLabel: "Private App Token",      tokenHint: "pat-na1-xxxxxxxx",       tokenDocsUrl: "https://developers.hubspot.com/docs/api/private-apps" },
  { id: "linear",  name: "Linear",  description: "Issues, projects, and workflows",             logo: <LinearLogo />,  brand: "indigo",  category: "productivity", tokenLabel: "API Key",                tokenHint: "lin_api_xxxxxxxx",       tokenDocsUrl: "https://linear.app/settings/api" },
];

/* ─────────────────────────────────────────────────────────────────────────────
 * MCP endpoint block
 * ────────────────────────────────────────────────────────────────────────── */

function McpBlock({ operatorId }: { operatorId: string }) {
  const [copied, setCopied] = useState(false);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const endpoint = `${baseUrl}/api/operators/${operatorId}/conversations/{conversationId}/mcp`;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Cpu className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono font-bold text-sm text-foreground">MCP endpoint</p>
          <p className="font-mono text-[11px] text-muted-foreground mt-0.5 leading-snug">
            External MCP-capable clients (Claude Desktop, Cursor, your own agents) can call this operator's full tool set via Model Context Protocol. JSON-RPC 2.0 over Streamable HTTP. Auth: same Bearer token as the chat API.
          </p>
        </div>
      </div>
      <div className="rounded-lg border border-border/40 bg-background/60 px-3 py-2 flex items-center gap-2">
        <code className="font-mono text-[11px] text-primary break-all flex-1 leading-relaxed">{endpoint}</code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(endpoint);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 p-1.5 rounded border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
          title="Copy"
        >
          {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
      <p className="font-mono text-[10px] text-muted-foreground/70">
        Substitute <code className="text-primary">{`{conversationId}`}</code> for the live conversation id. Methods: <code>tools/list</code>, <code>tools/call</code>, <code>initialize</code>.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Connector cards — token / OAuth / channel-specific
 * ────────────────────────────────────────────────────────────────────────── */

interface CardProps {
  connector: ConnectorDef;
  connected: Integration | undefined;
  operatorId: string;
}

function ConnectorCard(props: CardProps) {
  const { connector } = props;
  if (connector.channel === "telegram") return <TelegramCard {...props} />;
  if (connector.channel === "whatsapp") return <WhatsAppCard {...props} />;
  if (connector.googleOAuth) return <GoogleOAuthCard {...props} />;
  return <TokenCard {...props} />;
}

function CardShell({
  brand, logo, name, description, children,
}: { brand: string; logo: React.ReactNode; name: string; description: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border bg-gradient-to-br from-${brand}-500/10 to-${brand}-500/5 border-${brand}-500/20 hover:border-${brand}-500/40 p-5 flex flex-col gap-4 transition-all duration-200`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 border border-border/20">
          {logo}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono font-bold text-sm text-foreground leading-tight">{name}</p>
          <p className="font-mono text-[11px] text-muted-foreground leading-snug mt-1">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function DisconnectButton({ id, operatorId }: { id: string; operatorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mut = useMutation({
    mutationFn: () => apiFetch(`/operators/${operatorId}/integrations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "Disconnected" });
    },
    onError: (err: Error) => toast({ title: "Disconnect failed", description: err.message, variant: "destructive" }),
  });
  return (
    <button
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
      className="font-mono text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors disabled:opacity-50"
    >
      {mut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
      Disconnect
    </button>
  );
}

function TokenCard({ connector, connected, operatorId }: CardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [showForm, setShowForm] = useState(false);

  const save = useMutation({
    mutationFn: () => apiFetch(`/operators/${operatorId}/integrations`, {
      method: "POST",
      body: JSON.stringify({
        integrationType: connector.id,
        integrationLabel: label.trim() || connector.name,
        token: token.trim(),
        scopes: [connector.id],
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: `${connector.name} connected` });
      setToken(""); setLabel(""); setShowForm(false);
    },
    onError: (err: Error) => toast({ title: "Connection failed", description: err.message, variant: "destructive" }),
  });

  return (
    <CardShell brand={connector.brand} logo={connector.logo} name={connector.name} description={connector.description}>
      {connected ? (
        <div className="flex items-center justify-between pt-2 border-t border-border/20 mt-auto">
          <div className="flex items-center gap-1.5 text-green-500 font-mono text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Connected
          </div>
          <DisconnectButton id={connected.id} operatorId={operatorId} />
        </div>
      ) : !showForm ? (
        <div className="flex items-center justify-between pt-2 border-t border-border/20 mt-auto">
          <div className="flex items-center gap-1.5 text-muted-foreground/60 font-mono text-xs">
            <XCircle className="w-3.5 h-3.5" />
            Not connected
          </div>
          <Button size="sm" variant="outline" className="font-mono text-xs h-7 px-3" onClick={() => setShowForm(true)}>
            <Plug className="w-3 h-3 mr-1.5" />
            Connect
          </Button>
        </div>
      ) : (
        <div className="space-y-2 pt-2 border-t border-border/20">
          <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{connector.tokenLabel ?? "API Token"}</Label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={connector.tokenHint}
            className="font-mono text-xs h-8"
            autoComplete="off"
          />
          <Input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`Label (optional) — e.g. "My ${connector.name}"`}
            className="font-mono text-xs h-8"
            autoComplete="off"
          />
          <div className="flex items-center justify-between gap-2">
            {connector.tokenDocsUrl && (
              <a href={connector.tokenDocsUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-primary hover:underline inline-flex items-center gap-1">
                Get token <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <div className="flex items-center gap-1 ml-auto">
              <Button size="sm" variant="ghost" className="font-mono text-xs h-7" onClick={() => { setShowForm(false); setToken(""); setLabel(""); }}>Cancel</Button>
              <Button size="sm" className="font-mono text-xs h-7" disabled={!token.trim() || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3 mr-1.5" />}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </CardShell>
  );
}

function GoogleOAuthCard({ connector, connected, operatorId }: CardProps) {
  const { toast } = useToast();
  const [redirecting, setRedirecting] = useState(false);

  const connect = async () => {
    setRedirecting(true);
    try {
      const { authUrl } = await apiFetch<{ authUrl: string }>("/integrations/google/initiate", {
        method: "POST",
        body: JSON.stringify({ operatorId }),
      });
      window.location.href = authUrl;
    } catch (err: any) {
      toast({ title: "Could not start Google connection", description: err.message, variant: "destructive" });
      setRedirecting(false);
    }
  };

  return (
    <CardShell brand={connector.brand} logo={connector.logo} name={connector.name} description={connector.description}>
      <div className="flex items-center justify-between pt-2 border-t border-border/20 mt-auto">
        {connected ? (
          <>
            <div className="flex items-center gap-1.5 text-green-500 font-mono text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Connected
            </div>
            <DisconnectButton id={connected.id} operatorId={operatorId} />
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 text-muted-foreground/60 font-mono text-xs">
              <XCircle className="w-3.5 h-3.5" />
              Not connected
            </div>
            <Button size="sm" variant="outline" className="font-mono text-xs h-7 px-3" onClick={connect} disabled={redirecting}>
              {redirecting ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Plug className="w-3 h-3 mr-1.5" />}
              {redirecting ? "Redirecting…" : "Connect"}
            </Button>
          </>
        )}
      </div>
    </CardShell>
  );
}

function TelegramCard({ connector, connected, operatorId }: CardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tgToken, setTgToken] = useState("");
  const [showForm, setShowForm] = useState(false);

  const connect = useMutation({
    mutationFn: () => apiFetch(`/operators/${operatorId}/integrations`, {
      method: "POST",
      body: JSON.stringify({
        integrationType: "telegram",
        integrationLabel: "Telegram Bot",
        token: tgToken.trim(),
        scopes: ["telegram"],
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "Telegram connected", description: "Webhook auto-registered." });
      setTgToken(""); setShowForm(false);
    },
    onError: (err: Error) => toast({ title: "Connection failed", description: err.message, variant: "destructive" }),
  });

  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/telegram/${operatorId}` : "";

  return (
    <CardShell brand={connector.brand} logo={connector.logo} name={connector.name} description={connector.description}>
      {connected ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between pt-2 border-t border-border/20">
            <div className="flex items-center gap-1.5 text-green-500 font-mono text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Connected · Channel is live
            </div>
            <DisconnectButton id={connected.id} operatorId={operatorId} />
          </div>
          <div className="rounded-md border border-sky-500/20 bg-sky-500/5 px-2.5 py-1.5">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Webhook URL</p>
            <code className="font-mono text-[10px] text-sky-500 break-all">{webhookUrl}</code>
          </div>
        </div>
      ) : !showForm ? (
        <div className="flex items-center justify-between pt-2 border-t border-border/20 mt-auto">
          <div className="flex items-center gap-1.5 text-muted-foreground/60 font-mono text-xs">
            <XCircle className="w-3.5 h-3.5" />
            Not connected
          </div>
          <Button size="sm" variant="outline" className="font-mono text-xs h-7 px-3" onClick={() => setShowForm(true)}>
            <Send className="w-3 h-3 mr-1.5" />
            Connect
          </Button>
        </div>
      ) : (
        <div className="space-y-2 pt-2 border-t border-border/20">
          <p className="font-mono text-[10px] text-muted-foreground">
            Open <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">@BotFather</a>, send <code className="text-foreground">/newbot</code>, paste the bot token below.
          </p>
          <Input
            type="password"
            placeholder="1234567890:AAxxxxxxxxxx"
            value={tgToken}
            onChange={(e) => setTgToken(e.target.value)}
            className="font-mono text-xs h-8"
            autoComplete="off"
          />
          <div className="flex items-center justify-end gap-1">
            <Button size="sm" variant="ghost" className="font-mono text-xs h-7" onClick={() => { setShowForm(false); setTgToken(""); }}>Cancel</Button>
            <Button size="sm" className="font-mono text-xs h-7" disabled={!tgToken.trim() || connect.isPending} onClick={() => connect.mutate()}>
              {connect.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Connect"}
            </Button>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground/60">Webhook is auto-registered on connect.</p>
        </div>
      )}
    </CardShell>
  );
}

function WhatsAppCard({ connector, connected, operatorId }: CardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [accessToken, setAccessToken] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [newAppSecret, setNewAppSecret] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showSecretForm, setShowSecretForm] = useState(false);

  const connect = useMutation({
    mutationFn: () => apiFetch(`/operators/${operatorId}/integrations`, {
      method: "POST",
      body: JSON.stringify({
        integrationType: "whatsapp",
        integrationLabel: phoneId.trim(),
        token: accessToken.trim(),
        scopes: ["whatsapp"],
        appSchema: {
          phoneNumberId: phoneId.trim(),
          ...(appSecret.trim() ? { appSecret: appSecret.trim() } : {}),
        },
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "WhatsApp connected" });
      setAccessToken(""); setPhoneId(""); setAppSecret(""); setShowForm(false);
    },
    onError: (err: Error) => toast({ title: "Connection failed", description: err.message, variant: "destructive" }),
  });

  const updateSecret = useMutation({
    mutationFn: () => apiFetch(`/operators/${operatorId}/integrations/${connected!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ appSecret: newAppSecret.trim() }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      toast({ title: "App Secret saved — HMAC validation active" });
      setNewAppSecret(""); setShowSecretForm(false);
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <CardShell brand={connector.brand} logo={connector.logo} name={connector.name} description={connector.description}>
      {connected ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between pt-2 border-t border-border/20">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 text-green-500 font-mono text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Connected · Channel is live
              </div>
              {connected.integrationLabel && (
                <span className="font-mono text-[10px] text-muted-foreground/70 pl-5">
                  Phone ID: {connected.integrationLabel}
                </span>
              )}
            </div>
            <DisconnectButton id={connected.id} operatorId={operatorId} />
          </div>

          {connected.hasAppSecret ? (
            <div className="rounded-md border border-green-500/20 bg-green-500/5 px-2.5 py-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                <span className="font-mono text-[11px] text-green-500">HMAC validation active</span>
              </div>
              <button onClick={() => setShowSecretForm((v) => !v)} className="font-mono text-[10px] text-muted-foreground hover:text-foreground">
                Update
              </button>
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                <span className="font-mono text-[11px] text-amber-500">No App Secret — webhook unprotected</span>
              </div>
              <button onClick={() => setShowSecretForm((v) => !v)} className="font-mono text-[10px] text-amber-500 hover:underline">
                <KeyRound className="w-3 h-3 inline mr-0.5" />
                Add
              </button>
            </div>
          )}

          {showSecretForm && (
            <div className="rounded-md border border-border/40 bg-card/30 p-2 space-y-2">
              <p className="font-mono text-[10px] text-muted-foreground">
                Find it in Meta for Developers → Settings → Basic
              </p>
              <Input
                type="password"
                placeholder="Meta App Secret"
                value={newAppSecret}
                onChange={(e) => setNewAppSecret(e.target.value)}
                className="font-mono text-xs h-8"
                autoComplete="off"
              />
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" className="font-mono text-xs h-7" onClick={() => { setShowSecretForm(false); setNewAppSecret(""); }}>Cancel</Button>
                <Button size="sm" className="font-mono text-xs h-7" disabled={!newAppSecret.trim() || updateSecret.isPending} onClick={() => updateSecret.mutate()}>
                  {updateSecret.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : !showForm ? (
        <div className="flex items-center justify-between pt-2 border-t border-border/20 mt-auto">
          <div className="flex items-center gap-1.5 text-muted-foreground/60 font-mono text-xs">
            <XCircle className="w-3.5 h-3.5" />
            Not connected
          </div>
          <Button size="sm" variant="outline" className="font-mono text-xs h-7 px-3" onClick={() => setShowForm(true)}>
            <Plug className="w-3 h-3 mr-1.5" />
            Connect
          </Button>
        </div>
      ) : (
        <div className="space-y-2 pt-2 border-t border-border/20">
          <p className="font-mono text-[10px] text-muted-foreground">
            From <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-green-500 hover:underline">Meta for Developers</a> → your WhatsApp app → API Setup.
          </p>
          <Input type="password" placeholder="Access Token" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} className="font-mono text-xs h-8" autoComplete="off" />
          <Input type="text"     placeholder="Phone Number ID" value={phoneId} onChange={(e) => setPhoneId(e.target.value)} className="font-mono text-xs h-8" autoComplete="off" />
          <Input type="password" placeholder="App Secret (recommended — enables HMAC validation)" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} className="font-mono text-xs h-8" autoComplete="off" />
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" className="font-mono text-xs h-7" onClick={() => { setShowForm(false); setAccessToken(""); setPhoneId(""); setAppSecret(""); }}>Cancel</Button>
            <Button size="sm" className="font-mono text-xs h-7" disabled={!accessToken.trim() || !phoneId.trim() || connect.isPending} onClick={() => connect.mutate()}>
              {connect.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Connect"}
            </Button>
          </div>
        </div>
      )}
    </CardShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Connect-Your-App
 * ────────────────────────────────────────────────────────────────────────── */

function ConnectYourApp({ operatorId }: { operatorId: string }) {
  const queryClient = useQueryClient();
  const [appUrl, setAppUrl] = useState("");
  const [appApiKey, setAppApiKey] = useState("");
  const [appLabel, setAppLabel] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const mut = useMutation({
    mutationFn: (b: { baseUrl: string; apiKey: string; label: string }) =>
      apiFetch<{ message?: string }>(`/operators/${operatorId}/integrations/connect-app`, {
        method: "POST",
        body: JSON.stringify(b),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "integrations"] });
      setStatus("success");
      setMessage(data.message ?? "App connected successfully.");
      setAppUrl(""); setAppApiKey(""); setAppLabel("");
    },
    onError: (err: Error) => { setStatus("error"); setMessage(err.message); },
  });

  return (
    <div className="rounded-xl border border-border/30 bg-card/20 p-5 space-y-3">
      <div>
        <p className="font-mono font-bold text-sm text-foreground">Connect your own app</p>
        <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
          Any HTTP API with an API key — your operator will discover the endpoints.
        </p>
      </div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!appUrl.trim() || !appApiKey.trim()) return;
          setStatus("loading");
          mut.mutate({ baseUrl: appUrl.trim(), apiKey: appApiKey.trim(), label: appLabel.trim() });
        }}
      >
        <Input type="url"      value={appUrl}    onChange={(e) => setAppUrl(e.target.value)}    placeholder="https://api.yourapp.com" className="font-mono text-xs h-8" disabled={status === "loading"} />
        <Input type="password" value={appApiKey} onChange={(e) => setAppApiKey(e.target.value)} placeholder="API key" className="font-mono text-xs h-8" disabled={status === "loading"} autoComplete="off" />
        <Input type="text"     value={appLabel}  onChange={(e) => setAppLabel(e.target.value)}  placeholder="Label (optional)" className="font-mono text-xs h-8" disabled={status === "loading"} />
        <Button type="submit" size="sm" disabled={!appUrl.trim() || !appApiKey.trim() || status === "loading"} className="font-mono text-xs h-8">
          {status === "loading" ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Connecting…</> : <><Plug className="w-3 h-3 mr-1.5" />Connect app</>}
        </Button>
      </form>
      {status === "success" && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 font-mono text-[11px] text-green-500 flex items-start gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {status === "error" && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-[11px] text-destructive flex items-start gap-2">
          <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Active integrations list (live)
 * ────────────────────────────────────────────────────────────────────────── */

function ActiveList({ integrations, operatorId }: { integrations: Integration[]; operatorId: string }) {
  if (integrations.length === 0) return null;
  return (
    <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-green-500" />
        <p className="font-mono font-bold text-xs text-foreground uppercase tracking-wider">
          Active integrations ({integrations.length})
        </p>
      </div>
      <ul className="space-y-1 pt-1">
        {integrations.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 font-mono text-[11px]">
            <span className="text-foreground/80 truncate">
              <span className="font-bold">{i.integrationType}</span>
              {i.integrationLabel && <span className="text-muted-foreground"> — {i.integrationLabel}</span>}
              {i.isCustomApp && <span className="text-muted-foreground/60"> [custom_app]</span>}
            </span>
            <DisconnectButton id={i.id} operatorId={operatorId} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Main section
 * ────────────────────────────────────────────────────────────────────────── */

const CATEGORY_LABEL: Record<ConnectorDef["category"], string> = {
  channels: "Messaging channels",
  google: "Google Workspace",
  productivity: "Productivity & dev",
};

export default function IntegrationsSection({ operatorId }: { operatorId: string }) {
  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["operators", operatorId, "integrations"],
    queryFn: () => apiFetch<{ integrations: Integration[] }>(`/operators/${operatorId}/integrations`).then(r => r.integrations ?? []),
  });

  const getConnected = (type: string): Integration | undefined =>
    (integrations as Integration[]).find((i) => i.integrationType === type);

  const customApps = (integrations as Integration[]).filter((i) => i.isCustomApp);

  const grouped: Record<ConnectorDef["category"], ConnectorDef[]> = {
    channels: CONNECTORS.filter(c => c.category === "channels"),
    google: CONNECTORS.filter(c => c.category === "google"),
    productivity: CONNECTORS.filter(c => c.category === "productivity"),
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 bg-white rounded-2xl border border-border/30 p-6">
      <div className="flex items-center gap-2 border-b border-border/50 pb-4">
        <Network className="w-5 h-5 text-primary" />
        <div>
          <h2 className="font-headline font-bold text-lg text-primary">Connections</h2>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">
            External services your operator can use, plus the MCP endpoint for external agents
          </p>
        </div>
      </div>

      <McpBlock operatorId={operatorId} />

      {!isLoading && <ActiveList integrations={integrations as Integration[]} operatorId={operatorId} />}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl border border-border/30 bg-card/20 animate-pulse" />
          ))}
        </div>
      ) : (
        (Object.keys(grouped) as Array<ConnectorDef["category"]>).map((cat) => (
          <div key={cat} className="space-y-3">
            <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
              {CATEGORY_LABEL[cat]}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {grouped[cat].map((connector) => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  connected={getConnected(connector.id)}
                  operatorId={operatorId}
                />
              ))}
            </div>
          </div>
        ))
      )}

      <ConnectYourApp operatorId={operatorId} />

      {customApps.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
            Connected apps
          </p>
          <div className="space-y-2">
            {customApps.map((app) => (
              <div key={app.id} className="rounded-xl border border-border/20 bg-card/20 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-foreground truncate">{app.integrationLabel}</p>
                  <p className="font-mono text-[10px] text-muted-foreground truncate">{app.baseUrl}</p>
                </div>
                <DisconnectButton id={app.id} operatorId={operatorId} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
