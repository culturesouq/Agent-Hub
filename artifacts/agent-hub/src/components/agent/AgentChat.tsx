import { Agent, useGetChatHistory, useClearChatHistory, getGetChatHistoryQueryKey } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { useChatStream } from "@/hooks/use-chat-stream";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Trash2, StopCircle } from "lucide-react";
import { format } from "date-fns";

interface AgentChatProps {
  agent: Agent;
  fullHeight?: boolean;
}

export function AgentChat({ agent, fullHeight }: AgentChatProps) {
  const { t } = useI18n();
  const { data: history } = useGetChatHistory(agent.id);
  const { sendMessage, isStreaming, streamedResponse, stopStream } = useChatStream(agent.id);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const clearMutation = useClearChatHistory({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey(agent.id) }),
    },
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

  const containerClass = fullHeight
    ? "flex flex-col h-full overflow-hidden bg-black/10"
    : "flex flex-col h-[600px] glass-panel rounded-2xl border border-white/5 overflow-hidden";

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex justify-between items-center px-5 py-3 border-b border-white/5 bg-black/20 shrink-0">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          {t('chat')}
          <span className="text-xs text-muted-foreground font-mono">• {agent.name}</span>
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => clearMutation.mutate({ agentId: agent.id })}
          className="text-muted-foreground hover:text-destructive text-xs h-8"
        >
          <Trash2 className="w-3.5 h-3.5 me-1.5" />
          {t('clearChat')}
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {(!history || history.length === 0) && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-8">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-primary/60" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Start a conversation</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Your messages are private and only visible to you</p>
            </div>
          </div>
        )}

        {history?.map((msg, i) => (
          <div key={msg.id || i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <span className="text-[10px] text-muted-foreground font-mono mb-1 mx-1">
              {msg.role === 'user' ? 'YOU' : agent.name.toUpperCase()}
              {msg.createdAt ? ` • ${format(new Date(msg.createdAt), 'HH:mm')}` : ''}
            </span>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-tr-sm shadow-[0_0_15px_rgba(0,190,255,0.12)]'
                  : 'bg-white/8 text-white rounded-tl-sm border border-white/8'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}

        {isStreaming && streamedResponse && (
          <div className="flex flex-col items-start">
            <span className="text-[10px] text-primary font-mono mb-1 mx-1 animate-pulse">
              {agent.name.toUpperCase()} • TYPING...
            </span>
            <div className="max-w-[80%] rounded-2xl px-4 py-2.5 bg-white/8 text-white rounded-tl-sm border border-white/8">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {streamedResponse}
                <span className="inline-block w-1 h-4 bg-primary ml-1 animate-pulse align-middle" />
              </p>
            </div>
          </div>
        )}

        {isStreaming && !streamedResponse && (
          <div className="flex flex-col items-start">
            <span className="text-[10px] text-primary font-mono mb-1 mx-1 animate-pulse">
              {agent.name.toUpperCase()} • THINKING...
            </span>
            <div className="rounded-2xl px-4 py-2.5 bg-white/8 border border-white/8 rounded-tl-sm">
              <div className="flex gap-1 items-center h-5">
                <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-5 py-4 border-t border-white/5 bg-black/20 shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message the agent..."
            className="bg-white/5 border-white/10 focus-visible:border-primary/50 h-11 rounded-xl"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button
              type="button"
              onClick={stopStream}
              variant="destructive"
              className="h-11 w-11 rounded-xl shrink-0 p-0"
            >
              <StopCircle className="w-5 h-5" />
            </Button>
          ) : (
            <Button
              type="submit"
              className="bg-primary text-primary-foreground h-11 px-5 rounded-xl shrink-0"
              disabled={!input.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
