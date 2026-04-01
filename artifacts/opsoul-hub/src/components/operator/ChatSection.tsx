import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Conversation, Message } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, MessageSquarePlus, Send, TerminalSquare } from "lucide-react";
import { format } from "date-fns";

export default function ChatSection({ operatorId }: { operatorId: string }) {
  const queryClient = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streamingMsg, setStreamingMsg] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { data: convos, isLoading: convosLoading } = useQuery({
    queryKey: ["operators", operatorId, "conversations"],
    queryFn: () => apiFetch<Conversation[]>(`/operators/${operatorId}/conversations`),
  });

  const { data: messages, isLoading: msgsLoading } = useQuery({
    queryKey: ["operators", operatorId, "conversations", activeConvId, "messages"],
    queryFn: () => apiFetch<Message[]>(`/operators/${operatorId}/conversations/${activeConvId}/messages`),
    enabled: !!activeConvId,
  });

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingMsg]);

  // Set initial active conv
  useEffect(() => {
    if (convos && convos.length > 0 && !activeConvId) {
      setActiveConvId(convos[0].id);
    }
  }, [convos, activeConvId]);

  const createConv = useMutation({
    mutationFn: (title: string) => apiFetch<Conversation>(`/operators/${operatorId}/conversations`, {
      method: "POST",
      body: JSON.stringify({ title })
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "conversations"] });
      setActiveConvId(data.id);
    }
  });

  const deleteConv = useMutation({
    mutationFn: (id: string) => apiFetch(`/operators/${operatorId}/conversations/${id}`, { method: "DELETE" }),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "conversations"] });
      if (activeConvId === deletedId) setActiveConvId(null);
    }
  });

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeConvId) return;

    const msgText = input;
    setInput("");
    setStreamingMsg("...");

    // Optimistically add user msg
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: msgText,
      createdAt: new Date().toISOString(),
      tokenCount: 0
    };
    
    queryClient.setQueryData(
      ["operators", operatorId, "conversations", activeConvId, "messages"],
      (old: Message[] | undefined) => [...(old || []), tempUserMsg]
    );

    try {
      const token = localStorage.getItem('opsoul_token');
      const response = await fetch(`/api/operators/${operatorId}/conversations/${activeConvId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: msgText, stream: true })
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
          const lines = chunk.split('\n').filter(Boolean);
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.delta) {
                  currentStream += data.delta;
                  setStreamingMsg(currentStream);
                } else if (data.done && data.message) {
                  setStreamingMsg("");
                  queryClient.invalidateQueries({ queryKey: ["operators", operatorId, "conversations", activeConvId, "messages"] });
                }
              } catch (e) {
                console.error("Stream parse error", e);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setStreamingMsg("Error communicating with operator.");
    }
  };

  return (
    <div className="h-[calc(100vh-140px)] flex border border-border/50 rounded-lg overflow-hidden bg-card/20 animate-in fade-in zoom-in-95 duration-300">
      {/* Thread List */}
      <div className="w-64 border-r border-border/50 flex flex-col bg-card/40 shrink-0">
        <div className="p-3 border-b border-border/50 flex justify-between items-center bg-card/60">
          <span className="font-mono text-sm font-bold flex items-center gap-2"><TerminalSquare className="w-4 h-4" /> Comms Log</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/20" onClick={() => createConv.mutate(`Session ${format(new Date(), 'HH:mm')}`)}>
            <MessageSquarePlus className="w-4 h-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {convosLoading ? (
              <div className="p-4 text-center font-mono text-xs text-muted-foreground">LOADING...</div>
            ) : convos?.length === 0 ? (
              <div className="p-4 text-center font-mono text-xs text-muted-foreground">No active threads</div>
            ) : (
              convos?.map(conv => (
                <div 
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`group flex items-center justify-between p-2 rounded-md cursor-pointer transition-all ${activeConvId === conv.id ? 'bg-primary/10 border border-primary/20 text-primary' : 'hover:bg-white/5 border border-transparent text-muted-foreground'}`}
                >
                  <div className="overflow-hidden">
                    <div className="font-mono text-xs truncate font-bold">{conv.title}</div>
                    <div className="font-mono text-[10px] opacity-70">{format(new Date(conv.createdAt), 'MMM d, HH:mm')}</div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive shrink-0" 
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

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-background/50 relative">
        {activeConvId ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
              {msgsLoading ? (
                <div className="h-full flex items-center justify-center font-mono text-sm tracking-widest text-primary animate-pulse">SYNCING DATA STREAM...</div>
              ) : messages?.length === 0 && !streamingMsg ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 space-y-4">
                  <TerminalSquare className="w-12 h-12" />
                  <p className="font-mono text-sm">Connection established. Awaiting input.</p>
                </div>
              ) : (
                <>
                  {messages?.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg p-4 font-mono text-sm leading-relaxed
                        ${msg.role === 'user' 
                          ? 'bg-primary/10 border border-primary/30 text-foreground' 
                          : 'bg-card border border-border/50 text-foreground'}`}
                      >
                        <div className="flex items-center gap-2 mb-2 opacity-50 text-[10px] uppercase tracking-widest">
                          {msg.role === 'user' ? 'Operator (Owner)' : 'Autonomous Instance'}
                        </div>
                        <div className="whitespace-pre-wrap whitespace-pre-line break-words">{msg.content}</div>
                      </div>
                    </div>
                  ))}
                  {streamingMsg && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-lg p-4 font-mono text-sm leading-relaxed bg-card border border-primary/50 shadow-[0_0_15px_rgba(var(--primary),0.1)]">
                        <div className="flex items-center gap-2 mb-2 text-primary text-[10px] uppercase tracking-widest">
                          <span className="animate-pulse">●</span> Processing Output...
                        </div>
                        <div className="whitespace-pre-wrap">{streamingMsg}</div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="p-4 border-t border-border/50 bg-card/30">
              <form onSubmit={sendMessage} className="flex gap-2">
                <Input 
                  value={input} 
                  onChange={e => setInput(e.target.value)} 
                  placeholder="Transmit command..." 
                  className="font-mono bg-background/50 border-border/50 focus-visible:ring-primary/50"
                  disabled={!!streamingMsg}
                />
                <Button type="submit" disabled={!input.trim() || !!streamingMsg} className="shrink-0 w-12 font-mono" variant="default">
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center font-mono text-sm text-muted-foreground">
            SELECT OR INITIATE COMMUNICATION THREAD
          </div>
        )}
      </div>
    </div>
  );
}