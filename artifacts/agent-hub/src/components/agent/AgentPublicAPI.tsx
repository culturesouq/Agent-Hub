import { Agent, useListConnections } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp, Key, Globe2, Zap } from "lucide-react";

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="relative group rounded-xl overflow-hidden border border-white/8 bg-black/50">
      <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{lang}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs text-white/80 leading-relaxed font-mono whitespace-pre">{code}</pre>
    </div>
  );
}

function Collapsible({ title, icon: Icon, children, defaultOpen = false }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/8 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold text-white hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-primary shrink-0" />
          {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t border-white/8 p-4 space-y-4">{children}</div>}
    </div>
  );
}

const BASE = typeof window !== "undefined"
  ? `${window.location.origin}/api`
  : "https://your-domain.com/api";

export function AgentPublicAPI({ agent }: { agent: Agent }) {
  const { t } = useI18n();
  const { data: connections } = useListConnections(agent.id);
  const firstKey = connections?.[0]?.apiKey;
  const exampleKey = firstKey ?? "ahub_YOUR_API_KEY";

  const chatExample = `curl -X POST ${BASE}/public/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "apiKey": "${exampleKey}",
    "message": "Hello, how can you help me?",
    "conversationHistory": []
  }'`;

  const chatResponse = `{
  "response": "Hi! I'm ${agent.name}. I can help you with...",
  "agentName": "${agent.name}",
  "sources": []
}`;

  const jsExample = `// JavaScript / Node.js
const response = await fetch("${BASE}/public/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    apiKey: "${exampleKey}",
    message: "Your question here",
    conversationHistory: [
      { role: "user", content: "Previous message" },
      { role: "assistant", content: "Previous reply" }
    ]
  })
});

const data = await response.json();
console.log(data.response);`;

  const pythonExample = `# Python
import requests

response = requests.post("${BASE}/public/chat", json={
    "apiKey": "${exampleKey}",
    "message": "Your question here",
    "conversationHistory": []
})

data = response.json()
print(data["response"])`;

  const webhookExample = `// n8n / Zapier / Make.com
POST ${BASE}/public/chat
Content-Type: application/json

{
  "apiKey": "${exampleKey}",
  "message": "{{user_message}}",
  "conversationHistory": []
}`;

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Overview */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <Globe2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white">{agent.name} Public API</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Connect any external app, website, or automation tool to {agent.name} using a simple HTTP POST request.
              No special SDK needed — just send JSON and get a response.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-green-500/10 text-green-400 border border-green-500/20 rounded px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> POST
              </span>
              <code className="text-[11px] text-primary/80 font-mono">{BASE}/public/chat</code>
            </div>
          </div>
        </div>
      </div>

      {/* API Keys note */}
      {!firstKey && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3">
          <Key className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80 leading-relaxed">
            You need an API key to use the public API. Go to <strong>Connections</strong> in the sidebar and create a connection — that generates your API key.
          </p>
        </div>
      )}

      {/* Request fields */}
      <Collapsible title="Request Format" icon={Zap} defaultOpen>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Send a JSON body with these fields:
          </p>
          <div className="space-y-2">
            {[
              { field: "apiKey", type: "string", required: true, desc: `Your agent API key (from Connections tab)` },
              { field: "message", type: "string", required: true, desc: "The user's message to send to the agent" },
              { field: "conversationHistory", type: "array", required: false, desc: "Optional: previous messages for context [{role, content}]" },
            ].map(({ field, type, required, desc }) => (
              <div key={field} className="flex gap-3 p-3 rounded-lg bg-white/3 border border-white/5">
                <div className="shrink-0 w-40">
                  <code className="text-[11px] font-mono text-primary">{field}</code>
                  <div className="flex gap-1 mt-0.5">
                    <span className="text-[9px] font-mono text-muted-foreground bg-white/5 rounded px-1">{type}</span>
                    {required && <span className="text-[9px] font-mono text-orange-400 bg-orange-400/10 rounded px-1">required</span>}
                    {!required && <span className="text-[9px] font-mono text-muted-foreground bg-white/5 rounded px-1">optional</span>}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Collapsible>

      {/* Response format */}
      <Collapsible title="Response Format" icon={Zap}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">The API returns a JSON object:</p>
          <div className="space-y-2">
            {[
              { field: "response", type: "string", desc: "The agent's reply text" },
              { field: "agentName", type: "string", desc: "The agent's name" },
              { field: "sources", type: "array", desc: "Web sources used (only if web search is enabled)" },
            ].map(({ field, type, desc }) => (
              <div key={field} className="flex gap-3 p-3 rounded-lg bg-white/3 border border-white/5">
                <div className="shrink-0 w-40">
                  <code className="text-[11px] font-mono text-green-400">{field}</code>
                  <div className="mt-0.5">
                    <span className="text-[9px] font-mono text-muted-foreground bg-white/5 rounded px-1">{type}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <CodeBlock code={chatResponse} lang="json" />
        </div>
      </Collapsible>

      {/* cURL */}
      <Collapsible title="cURL Example" icon={Globe2} defaultOpen>
        <CodeBlock code={chatExample} lang="curl" />
      </Collapsible>

      {/* JavaScript */}
      <Collapsible title="JavaScript / Node.js" icon={Globe2}>
        <CodeBlock code={jsExample} lang="javascript" />
      </Collapsible>

      {/* Python */}
      <Collapsible title="Python" icon={Globe2}>
        <CodeBlock code={pythonExample} lang="python" />
      </Collapsible>

      {/* No-code tools */}
      <Collapsible title="No-Code Tools (n8n, Zapier, Make.com)" icon={Zap}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            In any HTTP action node, set the method to <strong>POST</strong>, content type to <strong>application/json</strong>, and paste this body:
          </p>
          <CodeBlock code={webhookExample} lang="http" />
          <div className="rounded-lg bg-primary/5 border border-primary/15 p-3">
            <p className="text-xs text-primary/80 leading-relaxed">
              Replace <code className="font-mono">{`{{user_message}}`}</code> with your platform's variable syntax (e.g. <code className="font-mono">{`{{ $json.message }}`}</code> in n8n, or <code className="font-mono">InputMessage</code> in Zapier).
            </p>
          </div>
        </div>
      </Collapsible>

      {/* Error codes */}
      <Collapsible title="Error Codes" icon={Zap}>
        <div className="space-y-2">
          {[
            { code: "400", desc: "Missing required fields (apiKey or message)" },
            { code: "401", desc: "Invalid API key — check your key in Connections" },
            { code: "403", desc: "Agent is offline (isActive = false)" },
            { code: "404", desc: "Agent not found" },
            { code: "500", desc: "Server error — try again or contact support" },
          ].map(({ code, desc }) => (
            <div key={code} className="flex gap-3 p-3 rounded-lg bg-white/3 border border-white/5">
              <span className={`shrink-0 text-xs font-mono font-bold rounded px-2 py-0.5 h-fit ${
                code === "400" || code === "401" || code === "403" || code === "404"
                  ? "text-amber-400 bg-amber-400/10"
                  : "text-red-400 bg-red-400/10"
              }`}>
                {code}
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </Collapsible>
    </div>
  );
}
