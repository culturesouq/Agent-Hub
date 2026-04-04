import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Conversation, Message } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, MessageSquarePlus, Send, MessageSquare, Paperclip, X, Mic } from "lucide-react";
import { format } from "date-fns";

type Attachment = {
  type: "image" | "text";
  content: string;
  mimeType?: string;
  name?: string;
  previewUrl?: string;
};

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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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
      setAttachments(prev => [...prev, att]);
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

  // Normalise: backend wraps in { conversations:[...] } — guard against stale cache shape
  const convosArray: Conversation[] = Array.isArray(convos)
    ? convos
    : ((convos as any)?.conversations ?? []);

  // Normalise: backend wraps in { messages:[...] }
  const msgsArray: Message[] = Array.isArray(messages)
    ? messages
    : ((messages as any)?.messages ?? []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingMsg]);

  useEffect(() => {
    if (convosArray.length > 0 && !activeConvId) {
      setActiveConvId(convosArray[0].id);
    }
  }, [convosArray, activeConvId]);

  const createConv = useMutation({
    mutationFn: (contextName: string) => apiFetch<Conversation>(`/operators/${operatorId}/conversations`, {
      method: "POST",
      body: JSON.stringify({ contextName }),
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "conversations"] });
      setActiveConvId(data.id);
    },
  });

  const deleteConv = useMutation({
    mutationFn: (id: string) => apiFetch(`/operators/${operatorId}/conversations/${id}`, { method: "DELETE" }),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "conversations"] });
      if (activeConvId === deletedId) setActiveConvId(null);
    },
  });

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || !activeConvId) return;

    const msgText = input || (attachments.length > 0 ? `[${attachments.map(a => a.name).join(", ")}]` : "");
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
          attachments: pendingAttachments.length > 0
            ? pendingAttachments.map(a => ({ type: a.type, content: a.content, mimeType: a.mimeType, name: a.name }))
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

  const convName = (conv: Conversation) => conv.contextName || "Conversation";

  return (
    <div className="h-[calc(100vh-140px)] flex glass-panel rounded-2xl border border-border/30 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      {/* Conversation list */}
      <div className="w-56 border-r border-border/30 flex flex-col bg-surface-container-low/60 shrink-0">
        <div className="p-3 border-b border-border/30 flex justify-between items-center bg-surface-container/40">
          <span className="font-headline text-sm font-bold flex items-center gap-2 text-primary">
            <MessageSquare className="w-4 h-4" /> Conversations
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-primary hover:bg-primary/20"
            onClick={() => createConv.mutate(`Chat ${format(new Date(), "MMM d, HH:mm")}`)}
            title="New conversation"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {convosLoading ? (
              <div className="p-4 text-center font-mono text-xs text-muted-foreground animate-pulse">Loading...</div>
            ) : convosArray.length === 0 ? (
              <div className="p-4 text-center font-label text-xs text-muted-foreground">No conversations yet</div>
            ) : (
              convosArray.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`group flex items-center justify-between p-2 rounded-md cursor-pointer transition-all
                    ${activeConvId === conv.id
                      ? "bg-primary/10 border border-primary/20 text-primary"
                      : "hover:bg-white/5 border border-transparent text-muted-foreground"
                    }`}
                >
                  <div className="overflow-hidden flex-1 min-w-0">
                    <div className="font-label text-xs truncate font-semibold">{convName(conv)}</div>
                    <div className="font-label text-[10px] opacity-60 mt-0.5">
                      {format(new Date(conv.createdAt), "MMM d, HH:mm")}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive shrink-0 ml-1"
                    onClick={(e) => { e.stopPropagation(); deleteConv.mutate(conv.id); }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-background/50 relative">
        {activeConvId ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
              {msgsLoading ? (
                <div className="h-full flex items-center justify-center font-mono text-sm text-muted-foreground animate-pulse">
                  Loading...
                </div>
              ) : msgsArray.length === 0 && !streamingMsg ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-40 space-y-3">
                  <MessageSquare className="w-10 h-10" />
                  <p className="font-label text-sm">Send a message to get started.</p>
                </div>
              ) : (
                <>
                  {msgsArray.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                        ${msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-none"
                          : "bg-card border border-border/50 text-foreground rounded-tl-none"
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                      </div>
                    </div>
                  ))}
                  {streamingMsg && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-2xl rounded-tl-none px-4 py-3 text-sm leading-relaxed bg-card border border-border/50 text-foreground">
                        <div className="whitespace-pre-wrap">{streamingMsg}</div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-3 border-t border-border/50 bg-card/30 space-y-2">
              {/* Attachment previews */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((att, i) => (
                    <div key={i} className="relative flex items-center gap-1.5 bg-card border border-border/50 rounded-lg px-2 py-1 text-xs font-mono">
                      {att.previewUrl ? (
                        <img src={att.previewUrl} alt={att.name} className="w-8 h-8 rounded object-cover" />
                      ) : (
                        <Paperclip className="w-3 h-3 text-muted-foreground" />
                      )}
                      <span className="text-foreground/80 max-w-24 truncate">{att.name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                        className="text-muted-foreground hover:text-destructive ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={sendMessage} className="flex gap-2">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,.doc,.docx,.xlsx"
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
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Type a message..."
                  className="font-sans bg-background/50 border-border/50 focus-visible:ring-primary/30 text-sm"
                  disabled={!!streamingMsg}
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
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-40 space-y-3">
            <MessageSquare className="w-10 h-10" />
            <p className="font-label text-sm">Select or start a conversation.</p>
          </div>
        )}
      </div>
    </div>
  );
}
