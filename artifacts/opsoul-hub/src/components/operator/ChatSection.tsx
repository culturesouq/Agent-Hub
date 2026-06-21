import { useState, useRef, useEffect, useCallback, useReducer, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Conversation, Message } from "@/types";
import { Send, MessageSquare, Paperclip, X, Mic, ChevronDown, Search, Zap, Download, Link, Globe, Square, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { WidgetBlock } from "./widgets/WidgetBlock";
import { parseWidgetPayload } from "./widgets/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Attachment = {
  type: "image" | "text";
  content: string;
  mimeType?: string;
  name?: string;
  previewUrl?: string;
};

type LiveToolResult = {
  name: string;
  output: string;
  toolType?: "skill" | "search" | "url" | "http";
};

type RenderedItem =
  | { kind: "msg"; msg: Message }
  | { kind: "separator"; label: string; key: string }
  | { kind: "tool"; skillName: string; output: string; key: string; toolType?: "skill" | "search" | "url" | "http" };

// ─── Stream state ─────────────────────────────────────────────────────────────

type StreamStatus = {
  sending: boolean;        // true from START until first server event (shows thinking dots)
  content: string;
  snapshot: string;
  processing: boolean;
  searching: string | null;
  seeding: string | null;
  reading: string | null;
  running: string | null;
  ranSkill: string | null;
  writing: string | null;
  calling: string | null;
  error: string | null;
  toolResults: LiveToolResult[];
};

type StreamAction =
  | { type: "START" }
  | { type: "DELTA"; text: string }
  | { type: "CLEAR_STREAM" }
  | { type: "PROCESSING" }
  | { type: "SEARCHING"; query: string }
  | { type: "SEEDING"; source: string }
  | { type: "READING"; url: string }
  | { type: "RUNNING"; tool: string }
  | { type: "WRITING"; file: string }
  | { type: "CALLING"; url: string }
  | { type: "TOOL_RESULT"; name: string; output: string; toolType?: "skill" | "search" | "url" | "http" }
  | { type: "DONE" }
  | { type: "ERROR"; message: string }
  | { type: "ABORT" };

const INITIAL_STATUS: StreamStatus = {
  sending: false, content: "", snapshot: "", processing: false,
  searching: null, seeding: null, reading: null,
  running: null, ranSkill: null, writing: null,
  calling: null, error: null, toolResults: [],
};

function streamReducer(state: StreamStatus, action: StreamAction): StreamStatus {
  switch (action.type) {
    case "START":
      return { ...INITIAL_STATUS, sending: true };
    case "DELTA":
      return {
        ...state,
        sending: false,
        content: state.content + action.text,
        snapshot: state.content + action.text,
        processing: false,
        searching: null, seeding: null, reading: null,
        running: null, writing: null, calling: null,
        error: null,
      };
    case "CLEAR_STREAM":
      return { ...state, content: "", snapshot: state.content };
    case "PROCESSING":
      return { ...state, sending: false, processing: true };
    case "SEARCHING":
      return { ...state, sending: false, searching: action.query, seeding: null, reading: null, running: null, writing: null, calling: null, processing: false };
    case "SEEDING":
      return { ...state, sending: false, seeding: action.source, searching: null, reading: null, running: null, writing: null, calling: null, processing: false };
    case "READING":
      return { ...state, sending: false, reading: action.url, searching: null, seeding: null, running: null, writing: null, calling: null, processing: false };
    case "RUNNING":
      return { ...state, sending: false, running: action.tool, ranSkill: action.tool, searching: null, seeding: null, reading: null, writing: null, calling: null, processing: false };
    case "WRITING":
      return { ...state, sending: false, writing: action.file, searching: null, seeding: null, reading: null, running: null, calling: null, processing: false };
    case "CALLING":
      return { ...state, sending: false, content: "", calling: action.url, searching: null, seeding: null, reading: null, running: null, writing: null, processing: false };
    case "TOOL_RESULT":
      return { ...state, toolResults: [...state.toolResults, { name: action.name, output: action.output, toolType: action.toolType }] };
    case "DONE":
      // snapshot NOT preserved — optimistic cache injection eliminates the flash gap
      // toolResults preserved so Mohamed can review what was called after the turn ends
      return { ...INITIAL_STATUS, ranSkill: state.ranSkill, toolResults: state.toolResults };
    case "ERROR":
      return { ...INITIAL_STATUS, error: action.message };
    case "ABORT":
      return { ...INITIAL_STATUS };
    default:
      return state;
  }
}

// ─── Markdown renderer ─────────────────────────────────────────────────────────

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`)/g;
  let last = 0; let idx = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={idx++} className="font-semibold">{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={idx++}>{m[3]}</em>);
    else if (m[4]) parts.push(<code key={idx++} className="bg-gray-100 rounded px-1 py-0.5 text-xs font-mono" dir="ltr">{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const MarkdownMessage = memo(function MarkdownMessage({ content, operatorId }: { content: string; operatorId?: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      i++;

      // Widget block — operator emits ```opsoul-widget\n{json}\n``` and the
      // matching component renders inline. Parse-failure falls back to <pre>
      // so a broken payload is visible, not silent.
      if (lang === "opsoul-widget" && operatorId) {
        const payload = parseWidgetPayload(codeLines.join("\n"));
        if (payload) {
          nodes.push(<WidgetBlock key={`widget-${i}`} payload={payload} operatorId={operatorId} />);
          continue;
        }
      }

      nodes.push(
        <pre key={`code-${i}`} dir="ltr" className="text-left bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs font-mono overflow-x-auto my-2 whitespace-pre">
          {lang && <span className="text-gray-400 text-[10px] block mb-1">{lang}</span>}
          {codeLines.join("\n")}
        </pre>
      );
      continue;
    }

    if (/^---+$/.test(line.trim())) { nodes.push(<hr key={`hr-${i}`} className="border-gray-200 my-3" />); i++; continue; }
    if (line.startsWith("### ")) { nodes.push(<h3 key={`h3-${i}`} className="text-sm font-semibold mt-3 mb-1 text-gray-900">{parseInline(line.slice(4))}</h3>); i++; continue; }
    if (line.startsWith("## "))  { nodes.push(<h2 key={`h2-${i}`} className="text-sm font-bold mt-4 mb-1 text-gray-900">{parseInline(line.slice(3))}</h2>); i++; continue; }
    if (line.startsWith("# "))   { nodes.push(<h1 key={`h1-${i}`} className="text-base font-bold mt-4 mb-1 text-gray-900">{parseInline(line.slice(2))}</h1>); i++; continue; }

    if (/^[-*] /.test(line)) {
      const items: React.ReactNode[] = [];
      const start = i;
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(<li key={`li-${i}`} className="leading-relaxed">{parseInline(lines[i].slice(2))}</li>);
        i++;
      }
      nodes.push(<ul key={`ul-${start}`} className="list-disc pl-5 my-2 space-y-1 text-sm">{items}</ul>);
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: React.ReactNode[] = [];
      const start = i;
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={`li-${i}`} className="leading-relaxed">{parseInline(lines[i].replace(/^\d+\. /, ""))}</li>);
        i++;
      }
      nodes.push(<ol key={`ol-${start}`} className="list-decimal pl-5 my-2 space-y-1 text-sm">{items}</ol>);
      continue;
    }

    if (line.startsWith("> ")) {
      nodes.push(<blockquote key={`bq-${i}`} className="border-l-2 border-gray-300 pl-3 my-2 text-gray-600 italic text-sm">{parseInline(line.slice(2))}</blockquote>);
      i++; continue;
    }

    if (line.trim() === "") { i++; continue; }

    nodes.push(<p key={`p-${i}-${line.slice(0, 8)}`} className="mb-2 leading-relaxed text-sm">{parseInline(line)}</p>);
    i++;
  }

  return <div className="text-gray-900">{nodes}</div>;
});

// ─── Tool block ───────────────────────────────────────────────────────────────

function ToolOutputBlock({ skillName, output, toolType }: { skillName: string; output: string; toolType?: "skill" | "search" | "url" | "http" }) {
  const [open, setOpen] = useState(false);
  const icon = toolType === "search" ? <Search className="w-3 h-3" />
    : toolType === "url" ? <Link className="w-3 h-3" />
    : toolType === "http" ? <Globe className="w-3 h-3" />
    : <Zap className="w-3 h-3" />;
  const label = toolType === "search" ? `Searched: ${skillName}`
    : toolType === "url" ? `Read: ${skillName}`
    : toolType === "http" ? `Called: ${skillName}`
    : `Ran: ${skillName}`;
  return (
    <div className="my-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors py-0.5"
      >
        {icon}
        <span>{label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-1.5 pl-4 border-l-2 border-gray-100 text-sm text-gray-700 leading-relaxed max-h-72 overflow-y-auto">
          <MarkdownMessage content={output} />
        </div>
      )}
    </div>
  );
}

// ─── Thinking dots ────────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChatSection({ operatorId }: { operatorId: string }) {
  const queryClient = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [status, dispatch] = useReducer(streamReducer, INITIAL_STATUS);
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
  // tracks streamed content for done event — avoids stale closure over status.content
  const accumulatedRef = useRef<string>("");

  const isStreaming = !!status.content;
  const isBusy = status.sending || isStreaming || status.processing || !!status.searching || !!status.running || !!status.writing || !!status.calling || !!status.reading || !!status.seeding;

  const stopResponse = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    dispatch({ type: "ABORT" });
    queueRef.current = [];
    setMessageQueue([]);
  };

  const scrollToBottom = useCallback((instant = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (instant) el.scrollTop = el.scrollHeight;
    else el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
  }, []);

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

  const { data: convos } = useQuery({
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

  const convosArray: Conversation[] = Array.isArray(convos) ? convos : ((convos as any)?.conversations ?? []);
  const msgsArray: Message[] = Array.isArray(messages) ? messages : ((messages as any)?.messages ?? []);

  useEffect(() => {
    if (msgsArray.length === 0) return;
    const id = setTimeout(() => sentinelRef.current?.scrollIntoView({ behavior: "instant", block: "end" }), 0);
    return () => clearTimeout(id);
  }, [activeConvId, msgsArray.length]);

  useEffect(() => {
    if (!status.content) return;
    sentinelRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [status.content]);

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
    if (convosArray.length > 0 && !activeConvId) setActiveConvId(convosArray[0].id);
  }, [convosArray, activeConvId]);

  // Auto-create-Thread effect removed (2026-05-14). It was a race condition:
  // for a freshly created operator, there is a small window where the
  // conversations cache is briefly empty before the Birth conversation loads
  // from the server. The effect could fire in that window and create a stray
  // "Thread" conversation that competed with the Birth conversation. Now,
  // missing-conversation creation is only triggered explicitly by the user
  // ("New conversation" button) — the operator's existing conversations
  // (Birth or otherwise) load from the server without auto-creation.

  /**
   * Streaming-aware auth fetch. Refreshes the token if it 401s and retries.
   * NOTE: caller must pass `cloneBody` for requests with non-replayable bodies
   * (FormData, ReadableStream). For those, do NOT use this — use
   * `refreshTokenIfNeeded()` and then plain fetch with a fresh init object.
   */
  const authFetch = async (url: string, init: RequestInit): Promise<Response> => {
    let token = localStorage.getItem("opsoul_token");
    const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      const refreshRes = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
      if (refreshRes.ok) {
        const { accessToken } = await refreshRes.json();
        localStorage.setItem("opsoul_token", accessToken);
        token = accessToken;
        return fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
      }
      window.dispatchEvent(new Event("auth-unauthorized"));
    }
    return res;
  };

  /**
   * Refresh the access token if the current one is missing/invalid.
   * Used BEFORE FormData uploads so we never have to retry-after-401 with a
   * consumed FormData body (the old bug: retry sent empty body silently).
   */
  const refreshTokenIfNeeded = async (): Promise<string | null> => {
    const existing = localStorage.getItem("opsoul_token");
    if (existing) return existing;
    const refreshRes = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
    if (!refreshRes.ok) {
      window.dispatchEvent(new Event("auth-unauthorized"));
      return null;
    }
    const { accessToken } = await refreshRes.json();
    localStorage.setItem("opsoul_token", accessToken);
    return accessToken;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Ensure a valid token BEFORE building FormData — refreshing afterwards
      // would consume the body. Industry-standard: refresh-before-stream.
      const token = await refreshTokenIfNeeded();
      if (!token) {
        throw new Error("Not authenticated. Please log in and try again.");
      }

      const formData = new FormData();
      formData.append("file", file);

      // Plain fetch — NOT authFetch — because we already refreshed the token
      // and FormData is a stream we cannot replay on a retry. Do NOT set
      // Content-Type manually: the browser auto-adds multipart/form-data with
      // the right boundary; setting it ourselves breaks multipart parsing.
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      // Robust error extraction: backend returns JSON on every error path now,
      // but fall back to text() if something upstream returned HTML.
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          detail = errJson.error ?? errJson.message ?? detail;
        } catch {
          try {
            const txt = await res.text();
            // First line of HTML error pages is usually readable
            detail = txt.split("\n")[0].slice(0, 200) || detail;
          } catch { /* keep HTTP ${res.status} */ }
        }
        throw new Error(detail);
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAttachments(prev => [...prev, {
        type: data.type,
        content: data.type === "image" ? data.base64 : data.content,
        mimeType: data.mimeType,
        name: data.name ?? file.name,
        previewUrl: data.type === "image" ? `data:${data.mimeType};base64,${data.base64}` : undefined,
      }]);
    } catch (err: any) {
      const detail = err?.message ? ` (${err.message})` : "";
      dispatch({
        type: "ERROR",
        message: `That file didn't make it through${detail}. Checking the upload path — you can try a smaller file, a different format, or pick it again.`,
      });
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
        : MediaRecorder.isTypeSupported("audio/webm") ? { mimeType: "audio/webm" } : {};
      const recorder = new MediaRecorder(stream, options as MediaRecorderOptions);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      dispatch({
        type: "ERROR",
        message: "I can't reach the microphone — the browser may not have given permission yet. Check the mic icon in the address bar, allow access, then tap the mic again.",
      });
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
        recorder.stream.getTracks().forEach(t => t.stop());
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
        throw new Error(typeof e.error === "string" ? e.error : `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.transcript) setInput(prev => prev ? `${prev} ${data.transcript}` : data.transcript);
    } catch (err: any) {
      const detail = err?.message ? ` (${err.message})` : "";
      dispatch({
        type: "ERROR",
        message: `The voice clip didn't transcribe${detail}. Checking the audio pipeline — you can record again, or type the message instead.`,
      });
    } finally {
      setTranscribing(false);
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
    }
  };

  const executeSend = async (msgText: string, pendingAttachments: Attachment[]) => {
    if (!activeConvId) return;
    accumulatedRef.current = "";
    dispatch({ type: "START" });

    const tempId = `temp-${Date.now()}`;
    queryClient.setQueryData(
      ["operators", operatorId, "conversations", activeConvId, "messages"],
      (old: Message[] | undefined) => [...(old ?? []), {
        id: tempId, role: "user", content: msgText,
        createdAt: new Date().toISOString(), tokenCount: 0,
      } as Message],
    );

    scrollToBottom(true);

    try {
      const token = localStorage.getItem("opsoul_token");
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const response = await fetch(`/api/operators/${operatorId}/conversations/${activeConvId}/messages`, {
        method: "POST",
        signal: abortController.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: msgText,
          stream: true,
          attachments: pendingAttachments.length > 0
            ? pendingAttachments.map(a => ({ type: a.type, content: a.content, mimeType: a.mimeType, name: a.name }))
            : undefined,
        }),
      });

      if (!response.ok) {
        // Investigation-framed (per [[errors-as-investigation]]): describe what
        // happened, what the user can try, no terminal-failure phrasing.
        dispatch({
          type: "ERROR",
          message: `The server returned ${response.status} for that message. Your text is still in the box — retry, or try rephrasing while I check what's going on.`,
        });
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let idleTimer: ReturnType<typeof setTimeout> | null = null;
        const resetIdle = () => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => reader.cancel().catch(() => {}), 90_000);
        };
        resetIdle();

        while (true) {
          const { done, value } = await reader.read();
          if (done) { if (idleTimer) clearTimeout(idleTimer); break; }
          resetIdle();

          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n").filter(Boolean)) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));

              if (data.error) {
                dispatch({ type: "ERROR", message: data.error });
              } else if (data.reading) {
                dispatch({ type: "READING", url: data.reading });
              } else if (data.searching) {
                dispatch({ type: "SEARCHING", query: data.searching });
              } else if (data.seeding) {
                dispatch({ type: "SEEDING", source: data.seeding });
              } else if (data.clear) {
                accumulatedRef.current = "";
                dispatch({ type: "CLEAR_STREAM" });
              } else if (data.running) {
                dispatch({ type: "RUNNING", tool: data.running });
              } else if (data.writing) {
                dispatch({ type: "WRITING", file: data.writing });
              } else if (data.calling) {
                let displayUrl = data.calling;
                try { displayUrl = new URL(data.calling).hostname; } catch { /* use full */ }
                dispatch({ type: "CALLING", url: displayUrl });
              } else if (data.file_created) {
                queryClient.invalidateQueries({ queryKey: ["operator-files", operatorId] });
              } else if (data.tool_result) {
                const tr = data.tool_result as { name: string; output: string; toolType?: "skill" | "search" | "url" | "http" };
                dispatch({ type: "TOOL_RESULT", name: tr.name, output: tr.output, toolType: tr.toolType });
              } else if (data.delta) {
                accumulatedRef.current += data.delta;
                dispatch({ type: "DELTA", text: data.delta });
              } else if (data.processing) {
                dispatch({ type: "PROCESSING" });
              } else if (data.done) {
                const streamedContent = accumulatedRef.current;
                if (streamedContent.trim()) {
                  const asstMsg: Message = {
                    id: data.messageId ?? `asst-${Date.now()}`,
                    role: "assistant",
                    content: streamedContent,
                    createdAt: new Date().toISOString(),
                    tokenCount: data.usage?.completionTokens ?? 0,
                  };
                  queryClient.setQueryData(
                    ["operators", operatorId, "conversations", activeConvId, "messages"],
                    (old: Message[] | undefined) => [...(old ?? []), asstMsg],
                  );
                }
                dispatch({ type: "DONE" });
                queryClient.invalidateQueries({
                  queryKey: ["operators", operatorId, "conversations", activeConvId, "messages"],
                });
                scrollToBottom(true);
              }
            } catch { /* ignore SSE parse errors */ }
          }
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        dispatch({ type: "ABORT" });
      } else {
        // Investigation-framed: the stream dropped mid-flight; tell the user
        // what happened and what to try next, not "it's broken, give up".
        dispatch({
          type: "ERROR",
          message: "The connection dropped before the reply finished. Checking the link — you can resend, or wait a moment and try again.",
        });
      }
      abortControllerRef.current = null;
    }
  };

  /**
   * `/render <kind> <json>` slash command — bypasses the LLM and injects an
   * assistant-shaped message containing a fenced opsoul-widget block. Lets
   * the owner preview any widget (connect_form / chart / table / mermaid)
   * without depending on the model choosing to call render_*. Local-only —
   * the injected message is not persisted to the server.
   *
   * Examples:
   *   /render chart {"chartType":"bar","data":[{"label":"A","value":3}]}
   *   /render table {"columns":["A","B"],"rows":[["1","2"]]}
   *   /render mermaid {"diagram":"flowchart TD\n A-->B"}
   *   /render connect_form {"integrationType":"slack","label":"Slack","fields":[{"name":"token","label":"Bot Token","type":"password"}]}
   */
  const tryInjectWidget = (text: string): boolean => {
    const m = text.trim().match(/^\/render\s+(\w+)\s+(\{[\s\S]*\})\s*$/);
    if (!m) return false;
    const kind = m[1];
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(m[2]) as Record<string, unknown>; }
    catch (err) {
      dispatch({ type: "ERROR", message: `/render: invalid JSON — ${(err as Error).message}` });
      return true;
    }
    const payload = { kind, ...parsed };
    const fenced = "```opsoul-widget\n" + JSON.stringify(payload) + "\n```";

    // Inject as a local-only assistant message in the messages query cache.
    queryClient.setQueryData(
      ["operators", operatorId, "conversations", activeConvId, "messages"],
      (old: Message[] | undefined) => {
        const next: Message = {
          id: `widget-test-${Date.now()}`,
          role: "assistant",
          content: fenced,
          createdAt: new Date().toISOString(),
          tokenCount: 0,
        };
        return old ? [...old, next] : [next];
      },
    );
    return true;
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && attachments.length === 0) return;
    if (!activeConvId) return;

    // Slash-command intercept — runs before the normal send path.
    if (input.trim().startsWith("/render ")) {
      if (tryInjectWidget(input)) {
        setInput("");
        return;
      }
    }

    const msgText = input || `[${attachments.map(a => a.name).join(", ")}]`;
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
    if ((msg.role as string) === "system") {
      const content = msg.content ?? "";
      const skillMatch = content.match(/^\[Skill:\s*(.+?)\]\s*Result:\n([\s\S]*)$/);
      if (skillMatch) { items.push({ kind: "tool", skillName: skillMatch[1].trim(), output: skillMatch[2].trim(), key: msg.id, toolType: "skill" }); continue; }
      const searchMatch = content.match(/^\[Web Search\]\s*(.+?)\n([\s\S]*)$/);
      if (searchMatch) { items.push({ kind: "tool", skillName: searchMatch[1].trim(), output: searchMatch[2].trim(), key: msg.id, toolType: "search" }); continue; }
      const urlMatch = content.match(/^\[URL Content\]\s*(.+?)\n([\s\S]*)$/);
      if (urlMatch) {
        let displayName = urlMatch[1].trim();
        try { displayName = new URL(displayName).hostname; } catch { /* use full url */ }
        items.push({ kind: "tool", skillName: displayName, output: urlMatch[2].trim(), key: msg.id, toolType: "url" });
        continue;
      }
      const httpMatch = content.match(/^\[HTTP Response\]\s*([\s\S]*)$/);
      if (httpMatch) {
        const firstLine = httpMatch[1].trim().split("\n")[0] ?? "API";
        items.push({ kind: "tool", skillName: firstLine, output: httpMatch[1].trim(), key: msg.id, toolType: "http" });
        continue;
      }
      continue;
    }
    if (msg.content?.startsWith("[Tool:")) continue;
    if (msg.isInternal) continue;
    if (msg.role === "assistant" && !msg.content?.trim()) continue;
    const day = format(new Date(msg.createdAt), "yyyy-MM-dd");
    if (day !== lastDay) {
      items.push({ kind: "separator", key: `sep-${day}`, label: format(new Date(msg.createdAt), "EEEE, MMMM d") });
      lastDay = day;
    }
    items.push({ kind: "msg", msg });
  }

  const displayContent = status.content || status.snapshot;
  const showStream = !!displayContent;
  const showThinking = isBusy && !showStream && !status.searching && !status.running && !status.calling && !status.writing && !status.seeding && !status.reading && !status.error;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white">

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {msgsLoading || (!activeConvId && createConv.isPending) ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading…</div>
          ) : msgsArray.length === 0 && !showStream ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-300 space-y-3">
              <MessageSquare className="w-10 h-10" />
              <p className="text-sm">Send a message to get started.</p>
            </div>
          ) : (
            <>
              {items.map(item =>
                item.kind === "separator" ? (
                  <div key={item.key} className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-[10px] text-gray-400">{item.label}</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                ) : item.kind === "tool" ? (
                  <ToolOutputBlock key={item.key} skillName={item.skillName} output={item.output} toolType={item.toolType} />
                ) : item.msg.role === "user" ? (
                  <div key={item.msg.id} className="flex justify-end">
                    <div className="max-w-[75%] bg-gray-100 text-gray-900 rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {item.msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={item.msg.id} className="group">
                    <div className="text-sm text-gray-900 leading-relaxed break-words">
                      <MarkdownMessage content={item.msg.content} operatorId={operatorId} />
                    </div>
                    {item.msg.content.length > 150 && (
                      <button
                        onClick={() => {
                          const blob = new Blob([item.msg.content], { type: "text/markdown" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url; a.download = "response.md"; a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600"
                        title="Download as Markdown"
                      >
                        <Download className="w-2.5 h-2.5" /> .md
                      </button>
                    )}
                  </div>
                )
              )}

              {/* Live tool results — accumulate during tool calls, stay until next send */}
              {status.toolResults.length > 0 && (
                <div className="space-y-0.5">
                  {status.toolResults.map((tr, i) => (
                    <ToolOutputBlock key={`live-tool-${i}`} skillName={tr.name} output={tr.output} toolType={tr.toolType} />
                  ))}
                </div>
              )}

              {/* Skill badge — shown while streaming the skill response */}
              {status.ranSkill && showStream && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Zap className="w-3 h-3" />
                  <span>Ran: {status.ranSkill}</span>
                </div>
              )}

              {/* Streaming assistant content */}
              {showStream && (
                <div className="text-sm text-gray-900 leading-relaxed break-words">
                  <MarkdownMessage content={displayContent} operatorId={operatorId} />
                </div>
              )}

              {/* Live execution indicator */}
              {(status.searching || status.running || status.calling || status.writing || status.seeding || status.reading) && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="w-3 h-3 rounded-full border-2 border-gray-200 border-t-gray-400 animate-spin shrink-0" />
                  {status.searching && <span>Searching: {status.searching}</span>}
                  {status.calling && <span>Calling: {status.calling}</span>}
                  {status.running && <span>Running: {status.running}</span>}
                  {status.writing && <span>Writing: {status.writing}</span>}
                  {status.seeding && <span>Learning…</span>}
                  {status.reading && <span>Reading…</span>}
                </div>
              )}

              {/* Error */}
              {status.error && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{status.error}</span>
                </div>
              )}

              {/* Thinking indicator — visible between send and first token */}
              {showThinking && <ThinkingDots />}

              <div ref={sentinelRef} />
            </>
          )}
        </div>
      </div>

      {/* Scroll to bottom */}
      {!isAtBottom && (
        <div className="flex justify-center pb-2">
          <button
            onClick={() => scrollToBottom(false)}
            className="flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-gray-200 text-xs text-gray-500 hover:text-gray-700 shadow-sm transition-colors"
          >
            <ChevronDown className="w-3 h-3" /> Latest
          </button>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-100 bg-white px-4 pb-4 pt-3 space-y-2">
        {attachments.length > 0 && (
          <div className="max-w-3xl mx-auto flex flex-wrap gap-2">
            {attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs">
                {att.previewUrl
                  ? <img src={att.previewUrl} alt={att.name} className="w-7 h-7 rounded object-cover" />
                  : <Paperclip className="w-3 h-3 text-gray-400" />
                }
                <span className="text-gray-700 max-w-[6rem] truncate">{att.name}</span>
                <button type="button" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 ml-0.5">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {messageQueue.length > 0 && (
          <div className="max-w-3xl mx-auto space-y-1">
            {messageQueue.map((msg, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                <span className="text-gray-400 shrink-0">{i === 0 ? "Next:" : "Queued:"}</span>
                <span className="truncate flex-1">{msg}</span>
                <button type="button" onClick={() => { queueRef.current.splice(i, 1); setMessageQueue(prev => prev.filter((_, j) => j !== i)); }} className="text-gray-300 hover:text-gray-500 shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="max-w-3xl mx-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <form onSubmit={sendMessage} className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 focus-within:border-gray-300 transition-colors">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy || uploading || recording || transcribing}
              className="text-gray-400 hover:text-gray-600 transition-colors shrink-0 p-0.5 disabled:opacity-30"
              title="Attach file"
            >
              <Paperclip className={`w-4 h-4 ${uploading ? "animate-pulse text-blue-400" : ""}`} />
            </button>
            <button
              type="button"
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={e => { e.preventDefault(); startRecording(); }}
              onTouchEnd={e => { e.preventDefault(); stopRecording(); }}
              onMouseLeave={() => { if (recording) stopRecording(); }}
              disabled={isBusy || uploading}
              title={recording ? "Release to transcribe" : transcribing ? "Transcribing…" : "Hold to record"}
              className={`transition-colors shrink-0 p-0.5 ${recording ? "text-red-500 animate-pulse" : transcribing ? "text-blue-400 animate-pulse" : "text-gray-400 hover:text-gray-600"} disabled:opacity-30`}
            >
              <Mic className="w-4 h-4" />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() || attachments.length > 0) sendMessage(e as any);
                }
              }}
              onPaste={e => {
                const text = e.clipboardData?.getData("text");
                if (text && text.length > 1500) {
                  e.preventDefault();
                  setAttachments(prev => [...prev, {
                    type: "text",
                    content: text,
                    mimeType: "text/plain",
                    name: `paste-${Date.now()}.txt`,
                  }]);
                }
              }}
              placeholder="Message…"
              rows={1}
              disabled={isBusy}
              className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none resize-none overflow-y-auto leading-relaxed disabled:opacity-50"
              style={{ minHeight: "24px", maxHeight: "200px" }}
            />
            {isBusy ? (
              <button
                type="button"
                onClick={() => { stopResponse(); setMessageQueue([]); }}
                className="shrink-0 p-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
                title="Stop"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() && attachments.length === 0}
                className="shrink-0 p-1.5 rounded-lg bg-gray-900 hover:bg-gray-700 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
