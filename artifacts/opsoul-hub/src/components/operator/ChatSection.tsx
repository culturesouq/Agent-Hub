import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Conversation, Message } from "@/types";
import { Button } from "@/components/ui/button";
import { Send, MessageSquare, Paperclip, X, Mic, ChevronDown, Search, Zap, Download } from "lucide-react";
import { format } from "date-fns";

type Attachment = {
  type: "image" | "text";
  content: string;
  mimeType?: string;
  name?: string;
  previewUrl?: string;
};

type RenderedItem =
  | { kind: "msg"; msg: Message }
  | { kind: "separator"; label: string; key: string }
  | { kind: "tool"; skillName: string; output: string; key: string };

const THINKING_STEPS = [
  "Thinking…",
  "Searching knowledge base…",
  "Reading context…",
  "Preparing response…",
];

// Inline token parser — handles **bold**, *italic*, `code`
function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`)/g;
  let last = 0; let k = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={k++} className="font-semibold text-foreground">{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={k++} className="italic">{m[3]}</em>);
    else if (m[4]) parts.push(<code key={k++} className="bg-background/60 rounded px-1 py-0.5 text-xs font-mono border border-border/20">{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let k = 0; let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      i++;
      nodes.push(<pre key={k++} className="bg-background/80 rounded-lg p-3 text-xs font-mono overflow-x-auto my-2 border border-border/30">{codeLines.join('\n')}</pre>);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={k++} className="border-border/30 my-3" />);
      i++; continue;
    }

    // Headings
    if (line.startsWith('### ')) { nodes.push(<h3 key={k++} className="text-sm font-semibold mt-2 mb-0.5 text-foreground/90">{parseInline(line.slice(4))}</h3>); i++; continue; }
    if (line.startsWith('## '))  { nodes.push(<h2 key={k++} className="text-sm font-bold mt-3 mb-1 text-foreground">{parseInline(line.slice(3))}</h2>); i++; continue; }
    if (line.startsWith('# '))   { nodes.push(<h1 key={k++} className="text-base font-bold mt-3 mb-1 text-foreground">{parseInline(line.slice(2))}</h1>); i++; continue; }

    // Unordered list
    if (/^[-*] /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(<li key={k++} className="text-sm leading-relaxed">{parseInline(lines[i].slice(2))}</li>);
        i++;
      }
      nodes.push(<ul key={k++} className="list-disc pl-4 my-1.5 space-y-0.5">{items}</ul>);
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={k++} className="text-sm leading-relaxed">{parseInline(lines[i].replace(/^\d+\. /, ''))}</li>);
        i++;
      }
      nodes.push(<ol key={k++} className="list-decimal pl-4 my-1.5 space-y-0.5">{items}</ol>);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      nodes.push(<blockquote key={k++} className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic">{parseInline(line.slice(2))}</blockquote>);
      i++; continue;
    }

    // Blank line — paragraph break
    if (line.trim() === '') { i++; continue; }

    // Paragraph
    nodes.push(<p key={k++} className="mb-1.5 leading-relaxed">{parseInline(line)}</p>);
    i++;
  }

  return <div className="space-y-0 text-sm">{nodes}</div>;
}

function ThinkingIndicator() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((s) => (s + 1) % THINKING_STEPS.length);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-tl-none px-4 py-3 bg-card border border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
          </div>
          <span
            key={step}
            className="text-xs text-muted-foreground font-mono animate-in fade-in duration-500"
          >
            {THINKING_STEPS[step]}
          </span>
        </div>
      </div>
    </div>
  );
}

function ToolOutputBlock({ skillName, output }: { skillName: string; output: string }) {
  const [open, setOpen] = useState(false);
  const isSearch = skillName.toLowerCase().includes('research') || skillName.toLowerCase().includes('search');
  return (
    <div className="flex justify-start my-1">
      <div className="max-w-[85%]">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary/60 hover:bg-primary/10 hover:text-primary transition-colors text-[11px] font-mono"
        >
          {isSearch ? <Search className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
          <span>{skillName}</span>
          <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="mt-1.5 ml-1 p-4 rounded-xl border border-primary/15 bg-primary/5 text-sm leading-relaxed max-h-80 overflow-y-auto">
            <MarkdownMessage content={output} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatSection({ operatorId }: { operatorId: string }) {
  const queryClient = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streamingMsg, setStreamingMsg] = useState("");
  const [lastStreamSnapshot, setLastStreamSnapshot] = useState("");
  const [isAgencyProcessing, setIsAgencyProcessing] = useState(false);
  const [searchingQuery, setSearchingQuery] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const isStreaming = !!streamingMsg;

  const scrollToBottom = useCallback((instant = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (instant) {
      el.scrollTop = el.scrollHeight;
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, []);

  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  // Scroll event listener
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkAtBottom, { passive: true });
    return () => el.removeEventListener("scroll", checkAtBottom);
  }, [checkAtBottom]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  const { data: convos, isLoading: convosLoading } = useQuery({
    queryKey: ["operators", operatorId, "conversations"],
    queryFn: async () => {
      const res = await apiFetch<{ conversations: Conversation[] }>(`/operators/${operatorId}/conversations`);
      return res.conversations ?? [];
    },
  });

  const { data: messages, isLoading: msgsLoading } = useQuery({
    queryKey: ["operators", operatorId, "conversations", activeConvId, "messages"],
    queryFn: async () => {
      const res = await apiFetch<{ messages: Message[] }>(`/operators/${operatorId}/conversations/${activeConvId}/messages`);
      return res.messages ?? [];
    },
    enabled: !!activeConvId,
  });

  const convosArray: Conversation[] = Array.isArray(convos)
    ? convos
    : ((convos as any)?.conversations ?? []);

  const msgsArray: Message[] = Array.isArray(messages)
    ? messages
    : ((messages as any)?.messages ?? []);

  // Re-check scroll position when messages change (must be after msgsArray is declared)
  useEffect(() => {
    checkAtBottom();
  }, [msgsArray.length, checkAtBottom]);

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom(true);
    }
  }, [msgsArray, streamingMsg, isAtBottom, scrollToBottom]);

  useEffect(() => {
    if (showAll) {
      setTimeout(() => scrollToBottom(true), 50);
    }
  }, [showAll, scrollToBottom]);

  const createConv = useMutation({
    mutationFn: (contextName: string) =>
      apiFetch<Conversation>(`/operators/${operatorId}/conversations`, {
        method: "POST",
        body: JSON.stringify({ contextName }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "conversations"] });
      setActiveConvId(data.id);
    },
  });

  useEffect(() => {
    if (convosArray.length > 0 && !activeConvId) {
      setActiveConvId(convosArray[0].id);
    }
  }, [convosArray, activeConvId]);

  useEffect(() => {
    if (!convosLoading && convosArray.length === 0 && !createConv.isPending && !activeConvId) {
      createConv.mutate("Thread");
    }
  }, [convosLoading, convosArray.length, createConv.isPending, activeConvId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const token = localStorage.getItem("opsoul_token");
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const att: Attachment = {
        type: data.type,
        content: data.type === "image" ? data.base64 : data.content,
        mimeType: data.mimeType,
        name: data.name ?? file.name,
        previewUrl: data.type === "image" ? `data:${data.mimeType};base64,${data.base64}` : undefined,
      };
      setAttachments((prev) => [...prev, att]);
    } catch (err) {
      console.error("[upload]", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      console.error("[mic] getUserMedia failed:", err);
    }
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setRecording(false);
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    });
    const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    if (blob.size < 100) return;
    setTranscribing(true);
    try {
      const token = localStorage.getItem("opsoul_token");
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.transcript) {
        setInput((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript));
      }
    } catch (err) {
      console.error("[transcribe]", err);
    } finally {
      setTranscribing(false);
      mediaRecorderRef.current = null;
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || !activeConvId) return;

    const msgText = input || (attachments.length > 0 ? `[${attachments.map((a) => a.name).join(", ")}]` : "");
    const pendingAttachments = [...attachments];
    setInput("");
    setAttachments([]);
    setIsAgencyProcessing(true);
    setLastStreamSnapshot("");

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: msgText,
      createdAt: new Date().toISOString(),
      tokenCount: 0,
    };

    queryClient.setQueryData(
      ["operators", operatorId, "conversations", activeConvId, "messages"],
      (old: Message[] | undefined) => [...(old || []), tempUserMsg],
    );

    scrollToBottom(true);

    try {
      const token = localStorage.getItem("opsoul_token");
      const response = await fetch(`/api/operators/${operatorId}/conversations/${activeConvId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: msgText,
          stream: true,
          attachments:
            pendingAttachments.length > 0
              ? pendingAttachments.map((a) => ({ type: a.type, content: a.content, mimeType: a.mimeType, name: a.name }))
              : undefined,
        }),
      });

      if (!response.ok) throw new Error("Failed to send message");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let currentStream = "";
        let firstDelta = true;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter(Boolean);

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.error) {
                  setStreamingMsg("");
                  setLastStreamSnapshot("");
                  setIsAgencyProcessing(false);
                  setSearchingQuery(null);
                } else if (data.searching) {
                  setSearchingQuery(data.searching);
                  setIsAgencyProcessing(false);
                } else if (data.delta) {
                  if (firstDelta) {
                    setIsAgencyProcessing(false);
                    setSearchingQuery(null);
                    firstDelta = false;
                  }
                  currentStream += data.delta;
                  setStreamingMsg(currentStream);
                  setLastStreamSnapshot(currentStream);
                  scrollToBottom(true);
                } else if (data.processing) {
                  setIsAgencyProcessing(true);
                } else if (data.done) {
                  setIsAgencyProcessing(false);
                  setSearchingQuery(null);
                  setStreamingMsg("");
                  queryClient.invalidateQueries({
                    queryKey: ["operators", operatorId, "conversations", activeConvId, "messages"],
                  });
                  setTimeout(() => {
                    setLastStreamSnapshot("");
                    scrollToBottom(true);
                  }, 120);
                }
              } catch {
                // ignore parse errors on individual SSE lines
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setStreamingMsg("");
      setLastStreamSnapshot("");
      setIsAgencyProcessing(false);
    }
  };

  // Build flat list with date separators and tool outputs
  const items: RenderedItem[] = [];
  let lastDay = "";
  for (const msg of msgsArray) {
    // Surface [Skill:] system messages as collapsible tool blocks
    if ((msg.role as string) === 'system') {
      const content = msg.content ?? '';
      const skillMatch = content.match(/^\[Skill:\s*(.+?)\]\s*Result:\n([\s\S]*)$/);
      if (skillMatch) {
        items.push({ kind: "tool", skillName: skillMatch[1].trim(), output: skillMatch[2].trim(), key: msg.id });
      }
      continue;
    }
    if (msg.content?.startsWith('[Tool:')) continue;
    const day = format(new Date(msg.createdAt), "yyyy-MM-dd");
    if (day !== lastDay) {
      items.push({
        kind: "separator",
        key: `sep-${day}`,
        label: format(new Date(msg.createdAt), "EEEE, MMMM d"),
      });
      lastDay = day;
    }
    items.push({ kind: "msg", msg });
  }

  const showingStream = !!streamingMsg;
  const showingFallback = !showingStream && !!lastStreamSnapshot;

  const chatContent = (
    <div className="flex flex-col h-full bg-background/50 relative overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 relative" ref={scrollRef}>
        {msgsLoading || (!activeConvId && createConv.isPending) ? (
          <div className="h-full flex items-center justify-center font-mono text-sm text-muted-foreground animate-pulse">
            Loading…
          </div>
        ) : msgsArray.length === 0 && !showingStream && !showingFallback ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-40 space-y-3">
            <MessageSquare className="w-10 h-10" />
            <p className="font-label text-sm">Send a message to get started.</p>
          </div>
        ) : (
          <>
            {!showAll && items.length > 20 && (
              <button
                onClick={() => setShowAll(true)}
                className="text-xs text-muted-foreground/50 font-mono mx-auto block py-2 hover:text-muted-foreground transition-colors"
              >
                ↑ Show earlier messages
              </button>
            )}
            {(showAll ? items : items.slice(-20)).map((item) =>
              item.kind === "separator" ? (
                <div key={item.key} className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border/30" />
                  <span className="text-[10px] font-mono text-muted-foreground/50">{item.label}</span>
                  <div className="flex-1 h-px bg-border/30" />
                </div>
              ) : item.kind === "tool" ? (
                <ToolOutputBlock key={item.key} skillName={item.skillName} output={item.output} />
              ) : (
                <div
                  key={item.msg.id}
                  className={`flex group ${item.msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                      ${item.msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-card border border-border/50 text-foreground rounded-tl-none"
                      }`}
                  >
                    <div className="break-words">
                      {item.msg.role === "user"
                        ? <span className="whitespace-pre-wrap">{item.msg.content}</span>
                        : <MarkdownMessage content={item.msg.content} />
                      }
                    </div>
                    {item.msg.role === "assistant" && item.msg.content.length > 150 && (
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => {
                            const blob = new Blob([item.msg.content], { type: "text/markdown" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = "response.md";
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground px-1.5 py-0.5 rounded hover:bg-muted/30"
                          title="Download as Markdown"
                        >
                          <Download className="w-2.5 h-2.5" />
                          .md
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            )}

            {/* Streaming or fallback — no flash between stream end and history load */}
            {(showingStream || showingFallback) && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-none px-4 py-3 text-sm leading-relaxed bg-card border border-border/50 text-foreground">
                  <div className="break-words">
                    <MarkdownMessage content={showingStream ? streamingMsg : lastStreamSnapshot} />
                  </div>
                </div>
              </div>
            )}

            {/* Searching indicator — operator called the web search tool */}
            {searchingQuery && !showingStream && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl rounded-tl-none bg-card border border-border/50 text-sm text-muted-foreground">
                  <Search className="w-3.5 h-3.5 text-primary/60 animate-pulse" />
                  <span className="text-xs">Searching<span className="text-primary/80 ml-1 font-medium truncate max-w-[200px]">{searchingQuery}</span></span>
                  <span className="flex gap-0.5 ml-1">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                </div>
              </div>
            )}

            {/* Thinking indicator */}
            {isAgencyProcessing && !showingStream && !searchingQuery && <ThinkingIndicator />}

            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Scroll to latest button */}
      {!isAtBottom && (
        <button
          onClick={() => scrollToBottom(false)}
          className="absolute bottom-[72px] right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border/60 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all shadow-lg animate-in fade-in duration-200"
        >
          <ChevronDown className="w-3 h-3" />
          Latest
        </button>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border/50 bg-card/30 space-y-2 shrink-0">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="relative flex items-center gap-1.5 bg-card border border-border/50 rounded-lg px-2 py-1 text-xs font-mono"
              >
                {att.previewUrl ? (
                  <img src={att.previewUrl} alt={att.name} className="w-8 h-8 rounded object-cover" />
                ) : (
                  <Paperclip className="w-3 h-3 text-muted-foreground" />
                )}
                <span className="text-foreground/80 max-w-24 truncate">{att.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={sendMessage} className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,.txt,.md,.csv,.json,.yaml,.yml,.doc,.docx,.xlsx,.xls"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 w-9 h-9 text-muted-foreground hover:text-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming || uploading || recording || transcribing}
            title="Attach file"
          >
            <Paperclip className={`w-4 h-4 ${uploading ? "animate-pulse text-primary" : ""}`} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`shrink-0 w-9 h-9 transition-colors ${
              recording
                ? "text-red-500 bg-red-500/10 hover:bg-red-500/20"
                : transcribing
                ? "text-primary"
                : "text-muted-foreground hover:text-primary"
            }`}
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            disabled={isStreaming || uploading}
            title={recording ? "Release to transcribe" : transcribing ? "Transcribing…" : "Hold to record"}
          >
            <Mic className={`w-4 h-4 ${transcribing ? "animate-pulse" : ""}`} />
          </Button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if ((input.trim() || attachments.length > 0) && !isStreaming) {
                  sendMessage(e as any);
                }
              }
            }}
            placeholder="Type a message… (Shift+Enter for new line)"
            rows={1}
            disabled={isStreaming}
            className="flex-1 font-sans bg-background/50 border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none overflow-y-auto leading-relaxed disabled:opacity-50 placeholder:text-muted-foreground"
            style={{ minHeight: "36px", maxHeight: "200px" }}
          />
          <Button
            type="submit"
            disabled={(!input.trim() && attachments.length === 0) || isStreaming}
            className="shrink-0 w-10"
            variant="default"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: full height, no glass wrapper, no left panel */}
      <div className="h-full hidden md:flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {chatContent}
        </div>
      </div>

      {/* Mobile: same single-column chat, full height */}
      <div className="h-full md:hidden flex flex-col glass-panel border border-border/30 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        {chatContent}
      </div>
    </>
  );
}
