import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Conversation, Message } from "@/types";
import { Button } from "@/components/ui/button";
import { Send, MessageSquare, Paperclip, X, Mic, ChevronDown, Search, Zap, Download, Link, Globe, Square } from "lucide-react";
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
  | { kind: "tool"; skillName: string; output: string; key: string; toolType?: 'skill' | 'search' | 'url' | 'http' };

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

function ToolOutputBlock({ skillName, output, toolType }: { skillName: string; output: string; toolType?: 'skill' | 'search' | 'url' | 'http' }) {
  const [open, setOpen] = useState(false);
  const icon = toolType === 'search' ? <Search className="w-3 h-3" />
    : toolType === 'url' ? <Link className="w-3 h-3" />
    : toolType === 'http' ? <Globe className="w-3 h-3" />
    : <Zap className="w-3 h-3" />;
  const label = toolType === 'search' ? `Searched: ${skillName}`
    : toolType === 'url' ? `Read: ${skillName}`
    : toolType === 'http' ? `Called: ${skillName}`
    : `Ran: ${skillName}`;
  return (
    <div className="flex justify-start my-1">
      <div className="max-w-[85%]">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary/60 hover:bg-primary/10 hover:text-primary transition-colors text-[11px] font-mono"
        >
          {icon}
          <span>{label}</span>
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

function BouncingDots() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 px-3 py-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
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
  const [seedingSource, setSeedingSource] = useState<string | null>(null);
  const [readingUrl, setReadingUrl] = useState<string | null>(null);
  const [runningTool, setRunningTool] = useState<string | null>(null);
  const [ranSkill, setRanSkill] = useState<string | null>(null);
  const [writingFile, setWritingFile] = useState<string | null>(null);
  const [callingUrl, setCallingUrl] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const queueRef = useRef<{ message: string; attachments: Attachment[] }[]>([]);

  const isStreaming = !!streamingMsg;
  const isBusy = isStreaming || isAgencyProcessing;

  const stopResponse = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreamingMsg("");
    setLastStreamSnapshot("");
    setIsAgencyProcessing(false);
    setSearchingQuery(null);
    setSeedingSource(null);
    setReadingUrl(null);
    setRunningTool(null);
    setWritingFile(null);
    setCallingUrl(null);
    // also cancel any queued messages
    queueRef.current = [];
    setMessageQueue([]);
  };

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
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
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

  // Scroll sentinel into view on load and new messages — scrollIntoView finds the
  // correct scrollable ancestor automatically, bypassing scrollHeight/clientHeight issues
  useEffect(() => {
    if (msgsArray.length === 0) return;
    const id = setTimeout(() => {
      sentinelRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
    }, 0);
    return () => clearTimeout(id);
  }, [activeConvId, msgsArray.length]);

  // Follow streaming tokens
  useEffect(() => {
    if (!streamingMsg) return;
    sentinelRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
  }, [streamingMsg]);

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

  const authFetch = async (url: string, init: RequestInit): Promise<Response> => {
    let token = localStorage.getItem("opsoul_token");
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      const refreshRes = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
      if (refreshRes.ok) {
        const { accessToken } = await refreshRes.json();
        localStorage.setItem("opsoul_token", accessToken);
        token = accessToken;
        return fetch(url, {
          ...init,
          headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
        });
      }
      window.dispatchEvent(new Event("auth-unauthorized"));
    }
    return res;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await authFetch("/api/upload", { method: "POST", body: formData });
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
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startRecording = async () => {
    if (recording || transcribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? { mimeType: "audio/webm;codecs=opus" }
        : MediaRecorder.isTypeSupported("audio/webm")
        ? { mimeType: "audio/webm" }
        : {};
      const recorder = new MediaRecorder(stream, options as MediaRecorderOptions);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (err: unknown) {
      console.error("[mic] getUserMedia failed:", err);
      alert("Microphone access denied. Please allow microphone access in your browser settings.");
    }
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") { setRecording(false); return; }
    setRecording(false);
    try {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
        recorder.stream.getTracks().forEach((t) => t.stop());
      });
      const mimeType = recorder.mimeType || "audio/webm";
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      if (blob.size < 100) return;
      setTranscribing(true);
      const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
      const formData = new FormData();
      formData.append("audio", blob, `recording.${ext}`);
      const res = await authFetch("/api/transcribe", { method: "POST", body: formData });
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(typeof e.error === 'string' ? e.error : `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.transcript) setInput((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript));
    } catch (err: unknown) {
      console.error("[transcribe]", err);
      alert("Transcription failed. Please try again.");
    } finally {
      setTranscribing(false);
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
    }
  };

  const executeSend = async (msgText: string, pendingAttachments: Attachment[]) => {
    if (!activeConvId) return;
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
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const response = await fetch(`/api/operators/${operatorId}/conversations/${activeConvId}/messages`, {
        method: "POST",
        signal: abortController.signal,
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

        // Safety timeout — if no meaningful event arrives for 90s, unlock the UI.
        // The keepalive pings from the backend (": keepalive") reset this timer continuously.
        let idleTimer: ReturnType<typeof setTimeout> | null = null;
        const resetIdle = () => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            reader.cancel().catch(() => {});
          }, 90_000);
        };
        resetIdle();

        while (true) {
          const { done, value } = await reader.read();
          if (done) { if (idleTimer) clearTimeout(idleTimer); break; }
          resetIdle();

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
                  setSeedingSource(null);
                  setRunningTool(null);
                } else if (data.reading) {
                  setReadingUrl(data.reading);
                  setSearchingQuery(null);
                  setSeedingSource(null);
                  setRunningTool(null);
                  setIsAgencyProcessing(false);
                  firstDelta = true;
                } else if (data.searching) {
                  setSearchingQuery(data.searching);
                  setSeedingSource(null);
                  setReadingUrl(null);
                  setRunningTool(null);
                  setIsAgencyProcessing(false);
                  firstDelta = true;
                } else if (data.seeding) {
                  setSeedingSource(data.seeding);
                  setSearchingQuery(null);
                  setReadingUrl(null);
                  setRunningTool(null);
                  setIsAgencyProcessing(false);
                  firstDelta = true;
                } else if (data.clear) {
                  currentStream = "";
                  setStreamingMsg("");
                  setLastStreamSnapshot("");
                } else if (data.running) {
                  setRunningTool(data.running);
                  setRanSkill(data.running);
                  setSearchingQuery(null);
                  setSeedingSource(null);
                  setWritingFile(null);
                  setIsAgencyProcessing(false);
                  firstDelta = true;
                } else if (data.writing) {
                  setWritingFile(data.writing);
                  setCallingUrl(null);
                  setSearchingQuery(null);
                  setSeedingSource(null);
                  setRunningTool(null);
                  setIsAgencyProcessing(false);
                  firstDelta = true;
                } else if (data.calling) {
                  let displayUrl = data.calling;
                  try { displayUrl = new URL(data.calling).hostname; } catch { /* use full */ }
                  // Clear any pre-call noise that streamed before the tool fired
                  currentStream = "";
                  setStreamingMsg("");
                  setLastStreamSnapshot("");
                  setCallingUrl(displayUrl);
                  setWritingFile(null);
                  setSearchingQuery(null);
                  setSeedingSource(null);
                  setRunningTool(null);
                  setIsAgencyProcessing(false);
                  firstDelta = true;
                } else if (data.file_created) {
                  queryClient.invalidateQueries({ queryKey: ['operator-files', operatorId] });
                } else if (data.delta) {
                  if (firstDelta) {
                    setIsAgencyProcessing(false);
                    setSearchingQuery(null);
                    setSeedingSource(null);
                    setReadingUrl(null);
                    setRunningTool(null);
                    setWritingFile(null);
                    setCallingUrl(null);
                    firstDelta = false;
                  }
                  currentStream += data.delta;
                  setStreamingMsg(currentStream);
                  setLastStreamSnapshot(currentStream);
                } else if (data.processing) {
                  setIsAgencyProcessing(true);
                } else if (data.done) {
                  setIsAgencyProcessing(false);
                  setSearchingQuery(null);
                  setSeedingSource(null);
                  setReadingUrl(null);
                  setRunningTool(null);
                  setWritingFile(null);
                  setCallingUrl(null);
                  setStreamingMsg("");
                  queryClient.invalidateQueries({
                    queryKey: ["operators", operatorId, "conversations", activeConvId, "messages"],
                  });
                  setTimeout(() => {
                    setRanSkill(null);
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
    } catch (err: any) {
      // AbortError = owner clicked Stop — silent, just reset UI
      if (err?.name !== 'AbortError') console.error(err);
      setStreamingMsg("");
      setLastStreamSnapshot("");
      setIsAgencyProcessing(false);
      setSearchingQuery(null);
      setSeedingSource(null);
      setReadingUrl(null);
      setRunningTool(null);
      setRanSkill(null);
      setWritingFile(null);
      setCallingUrl(null);
      abortControllerRef.current = null;
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && attachments.length === 0) return;
    if (!activeConvId) return;

    const msgText = input || `[${attachments.map((a) => a.name).join(", ")}]`;
    const pendingAttachments = [...attachments];
    setInput("");
    setAttachments([]);

    if (isBusy) {
      queueRef.current.push({ message: msgText, attachments: pendingAttachments });
      setMessageQueue(prev => [...prev, msgText]);
      return;
    }

    executeSend(msgText, pendingAttachments);
  };

  // Auto-fire next queued message as soon as operator finishes
  useEffect(() => {
    if (isBusy) return;
    if (queueRef.current.length === 0) return;
    const queued = queueRef.current.shift()!;
    setMessageQueue(prev => prev.slice(1));
    executeSend(queued.message, queued.attachments);
  }, [isBusy]);

  // Build flat list with date separators and tool outputs
  const items: RenderedItem[] = [];
  let lastDay = "";
  for (const msg of msgsArray) {
    // Surface [Skill:] system messages as collapsible tool blocks
    if ((msg.role as string) === 'system') {
      const content = msg.content ?? '';
      const skillMatch = content.match(/^\[Skill:\s*(.+?)\]\s*Result:\n([\s\S]*)$/);
      if (skillMatch) {
        items.push({ kind: "tool", skillName: skillMatch[1].trim(), output: skillMatch[2].trim(), key: msg.id, toolType: 'skill' });
        continue;
      }
      const searchMatch = content.match(/^\[Web Search\]\s*(.+?)\n([\s\S]*)$/);
      if (searchMatch) {
        items.push({ kind: "tool", skillName: searchMatch[1].trim(), output: searchMatch[2].trim(), key: msg.id, toolType: 'search' });
        continue;
      }
      const urlMatch = content.match(/^\[URL Content\]\s*(.+?)\n([\s\S]*)$/);
      if (urlMatch) {
        let displayName = urlMatch[1].trim();
        try { displayName = new URL(displayName).hostname; } catch { /* use full url */ }
        items.push({ kind: "tool", skillName: displayName, output: urlMatch[2].trim(), key: msg.id, toolType: 'url' });
        continue;
      }
      const httpMatch = content.match(/^\[HTTP Response\]\s*([\s\S]*)$/);
      if (httpMatch) {
        const firstLine = httpMatch[1].trim().split('\n')[0] ?? 'API';
        items.push({ kind: "tool", skillName: firstLine, output: httpMatch[1].trim(), key: msg.id, toolType: 'http' });
        continue;
      }
      continue;
    }
    if (msg.content?.startsWith('[Tool:')) continue;
    if (msg.isInternal) continue;
    if (msg.role === 'assistant' && !msg.content?.trim()) continue;
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
    <div className="flex flex-col flex-1 min-h-0 bg-background/50 relative overflow-hidden">
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
            {items.map((item) =>
              item.kind === "separator" ? (
                <div key={item.key} className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border/30" />
                  <span className="text-[10px] font-mono text-muted-foreground/50">{item.label}</span>
                  <div className="flex-1 h-px bg-border/30" />
                </div>
              ) : item.kind === "tool" ? (
                <ToolOutputBlock key={item.key} skillName={item.skillName} output={item.output} toolType={item.toolType} />
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
            {ranSkill && (showingStream || showingFallback) && (
              <div className="flex justify-start my-1">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary/70 text-[11px] font-mono">
                  <Zap className="w-3 h-3" />
                  Ran: {ranSkill}
                </span>
              </div>
            )}

            {(showingStream || showingFallback) && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-none px-4 py-3 text-sm leading-relaxed bg-card border border-border/50 text-foreground">
                  <div className="break-words">
                    <MarkdownMessage content={showingStream ? streamingMsg : lastStreamSnapshot} />
                  </div>
                </div>
              </div>
            )}

            {/* Unified live status pill — search or tool running */}
            {(searchingQuery || runningTool) && (
              <div className="flex justify-start">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary/60 text-[11px] font-mono">
                  {searchingQuery ? `🔍 Searching…` : `⚡ ${runningTool}`}
                </span>
              </div>
            )}

            {/* Waiting for first token — bouncing dots */}
            {isBusy && !streamingMsg && !searchingQuery && !runningTool && (
              <BouncingDots />
            )}

            <div ref={sentinelRef} />
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
        {messageQueue.length > 0 && (
          <div className="space-y-1 px-1 mb-1">
            {messageQueue.map((msg, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1 border border-border/30">
                  <span className="text-primary font-medium">{i === 0 ? 'Next:' : 'Queued:'}</span>
                  <span className="truncate">{msg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    queueRef.current.splice(i, 1);
                    setMessageQueue(prev => prev.filter((_, j) => j !== i));
                  }}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  title="Cancel queued message"
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
            disabled={isBusy || uploading || recording || transcribing}
            title="Attach file"
          >
            <Paperclip className={`w-4 h-4 ${uploading ? "animate-pulse text-primary" : ""}`} />
          </Button>
          <button
            type="button"
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
            onMouseLeave={() => { if (recording) stopRecording(); }}
            disabled={isBusy || uploading}
            title={recording ? "Release to transcribe" : transcribing ? "Transcribing…" : "Hold to record"}
            className={`p-2 rounded-lg transition-colors ${
              recording ? "bg-red-500/20 text-red-400 animate-pulse"
              : transcribing ? "text-primary/60 animate-pulse"
              : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30"
            }`}
          >
            <Mic className="w-4 h-4" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() || attachments.length > 0) {
                  sendMessage(e as any);
                }
              }
            }}
            placeholder="Type a message… (Shift+Enter for new line)"
            rows={1}
            disabled={isBusy}
            className="flex-1 font-sans bg-background/50 border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none overflow-y-auto leading-relaxed disabled:opacity-50 placeholder:text-muted-foreground"
            style={{ minHeight: "36px", maxHeight: "200px" }}
          />
          {isBusy ? (
            <Button
              type="button"
              onClick={() => { stopResponse(); setMessageQueue([]); }}
              className="shrink-0 w-10 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              variant="default"
              title={messageQueue.length > 0 ? "Stop response & cancel queue" : "Stop response"}
            >
              <Square className="w-4 h-4 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={!input.trim() && attachments.length === 0}
              className="shrink-0 w-10"
              variant="default"
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {chatContent}
    </div>
  );
}
