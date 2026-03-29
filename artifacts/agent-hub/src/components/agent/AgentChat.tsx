import { Agent, useGetChatHistory, useClearChatHistory, getGetChatHistoryQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { useChatStream } from "@/hooks/use-chat-stream";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Trash2, StopCircle } from "lucide-react";
import { format } from "date-fns";

export function AgentChat({ agent }: { agent: Agent }) {
  const { t } = useI18n();
  const { data: history } = useGetChatHistory(agent.id);
  const { sendMessage, isStreaming, streamedResponse, stopStream } = useChatStream(agent.id);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const clearMutation = useClearChatHistory({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey(agent.id) })
    }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, streamedResponse]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput("");
  };

  return (
    <div className="flex flex-col h-[600px] glass-panel rounded-2xl border border-white/5 overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-white/5 bg-black/20">
        <h3 className="text-sm font-mono text-primary flex items-center uppercase tracking-wider">
          <MessageSquare className="w-4 h-4 me-2" /> {t('chat')} / SECURE_CHANNEL
        </h3>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => clearMutation.mutate({ agentId: agent.id })}
          className="text-muted-foreground hover:text-destructive text-xs font-mono uppercase"
        >
          <Trash2 className="w-3 h-3 me-2" /> {t('clearChat')}
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
        {history?.map((msg, i) => (
          <div key={msg.id || i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <span className="text-[10px] text-muted-foreground font-mono mb-1 mx-1">
              {msg.role === 'user' ? 'OWNER' : agent.name.toUpperCase()} • {msg.createdAt ? format(new Date(msg.createdAt), 'HH:mm:ss') : ''}
            </span>
            <div className={`max-w-[80%] rounded-2xl p-3 ${
              msg.role === 'user' 
                ? 'bg-primary text-primary-foreground rounded-tr-sm shadow-[0_0_15px_rgba(0,190,255,0.15)]' 
                : 'bg-white/10 text-white rounded-tl-sm border border-white/5'
            }`}>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
        
        {isStreaming && streamedResponse && (
          <div className="flex flex-col items-start">
            <span className="text-[10px] text-primary font-mono mb-1 mx-1 animate-pulse">
              {agent.name.toUpperCase()} • RECEIVING...
            </span>
            <div className="max-w-[80%] rounded-2xl p-3 bg-white/10 text-white rounded-tl-sm border border-white/5">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{streamedResponse}<span className="inline-block w-1.5 h-4 bg-primary ml-1 animate-pulse align-middle" /></p>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-white/5 bg-black/20">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Transmit message..."
            className="bg-black/50 border-white/10 font-mono focus-visible:ring-1 focus-visible:ring-primary h-12 rounded-xl"
            disabled={isStreaming}
          />
          {isStreaming ? (
             <Button type="button" onClick={stopStream} variant="destructive" className="h-12 w-12 rounded-xl shrink-0 p-0">
               <StopCircle className="w-5 h-5" />
             </Button>
          ) : (
            <Button type="submit" className="bg-primary text-primary-foreground h-12 px-6 rounded-xl glow-effect font-bold tracking-widest shrink-0" disabled={!input.trim()}>
              <Send className="w-4 h-4 me-2" /> {t('send')}
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
