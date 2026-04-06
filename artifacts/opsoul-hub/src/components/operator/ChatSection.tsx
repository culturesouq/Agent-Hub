import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Conversation, Message } from "@/types";
import { Button } from "@/components/ui/button";
import { Send, MessageSquare, Paperclip, X, Mic } from "lucide-react";
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
  | { kind: "separator"; label: string; key: string };

export default function ChatSection({ operatorId }: { operatorId: string }) {
  const queryClient = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streamingMsg, setStreamingMsg] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const isStreaming = !!streamingMsg;

  // Textarea auto-resize
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

  // Fix 1 — auto-scroll on new messages or streaming state change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

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

  // Auto-select the first existing conversation on load
  useEffect(() => {
    if (convosArray.length > 0 && !activeConvId) {
      setActiveConvId(convosArray[0].id);
    }
  }, [convosArray, activeConvId]);

  // Auto-create a conversation if none exists
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
    setStreamingMsg("...");

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
                } else if (data.delta) {
                  currentStream += data.delta;
                  setStreamingMsg(currentStream);
                } else if (data.done) {
                  setStreamingMsg("");
                  queryClient.invalidateQueries({
                    queryKey: ["operators", operatorId, "conversations", activeConvId, "messages"],
                  });
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
    }
  };

  // Build flat list with date separators
  const items: RenderedItem[] = [];
  let lastDay = "";
  for (const msg of msgsArray) {
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

  const chatContent = (
    <div className="flex flex-col h-full bg-background/50 relative">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {msgsLoading || (!activeConvId && createConv.isPending) ? (
          <div className="h-full flex items-center justify-center font-mono text-sm text-muted-foreground animate-pulse">
            Loading…
          </div>
        ) : msgsArray.length === 0 && !streamingMsg ? (
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
              ) : (
                <div
                  key={item.msg.id}
                  className={`flex ${item.msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                      ${item.msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-card border border-border/50 text-foreground rounded-tl-none"
                      }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{item.msg.content}</div>
                  </div>
                </div>
              )
            )}
            {streamingMsg && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-none px-4 py-3 text-sm leading-relaxed bg-card border border-border/50 text-foreground">
                  <div className="whitespace-pre-wrap">{streamingMsg}</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

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
            disabled={!!streamingMsg || uploading || recording || transcribing}
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
            disabled={!!streamingMsg || uploading}
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
                if ((input.trim() || attachments.length > 0) && !streamingMsg) {
                  sendMessage(e as any);
                }
              }
            }}
            placeholder="Type a message… (Shift+Enter for new line)"
            rows={1}
            disabled={!!streamingMsg}
            className="flex-1 font-sans bg-background/50 border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none overflow-y-auto leading-relaxed disabled:opacity-50 placeholder:text-muted-foreground"
            style={{ minHeight: "36px", maxHeight: "200px" }}
          />
          <Button
            type="submit"
            disabled={(!input.trim() && attachments.length === 0) || !!streamingMsg}
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
      {/* Fix 2 — Desktop: full height, no glass wrapper, no left panel */}
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
