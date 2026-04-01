import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Conversation, Message } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, MessageSquarePlus, Send, MessageSquare } from "lucide-react";
import { format } from "date-fns";

export default function ChatSection({ operatorId }: { operatorId: string }) {
  const queryClient = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streamingMsg, setStreamingMsg] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

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
    if (!input.trim() || !activeConvId) return;

    const msgText = input;
    setInput("");
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
        body: JSON.stringify({ message: msgText, stream: true }),
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
    <div className="h-[calc(100vh-140px)] flex border border-border/50 rounded-lg overflow-hidden bg-card/20 animate-in fade-in zoom-in-95 duration-300">
      {/* Conversation list */}
      <div className="w-56 border-r border-border/50 flex flex-col bg-card/40 shrink-0">
        <div className="p-3 border-b border-border/50 flex justify-between items-center bg-card/60">
          <span className="font-mono text-sm font-bold flex items-center gap-2">
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
              <div className="p-4 text-center font-mono text-xs text-muted-foreground">No conversations yet</div>
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
                    <div className="font-mono text-xs truncate font-semibold">{convName(conv)}</div>
                    <div className="font-mono text-[10px] opacity-60 mt-0.5">
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
                  <p className="font-mono text-sm">Send a message to get started.</p>
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

            <div className="p-3 border-t border-border/50 bg-card/30">
              <form onSubmit={sendMessage} className="flex gap-2">
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Type a message..."
                  className="font-mono bg-background/50 border-border/50 focus-visible:ring-primary/30 text-sm"
                  disabled={!!streamingMsg}
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || !!streamingMsg}
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
            <p className="font-mono text-sm">Select or start a conversation.</p>
          </div>
        )}
      </div>
    </div>
  );
}
