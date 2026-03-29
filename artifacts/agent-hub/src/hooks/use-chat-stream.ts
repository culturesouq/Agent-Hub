import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetChatHistoryQueryKey, getListMemoriesQueryKey } from "@workspace/api-client-react";

export interface ChatSource {
  title: string;
  url: string;
}

export function useChatStream(agentId: number) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedResponse, setStreamedResponse] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [lastSources, setLastSources] = useState<ChatSource[]>([]);
  const [activeToolCalls, setActiveToolCalls] = useState<string[]>([]);
  const [lastUsedTools, setLastUsedTools] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const sendMessage = async (message: string, imageUrl?: string) => {
    if (isStreaming) return;

    setIsStreaming(true);
    setStreamedResponse("");
    setIsSearching(false);
    setLastSources([]);
    setActiveToolCalls([]);
    setLastUsedTools([]);
    setError(null);

    abortControllerRef.current = new AbortController();

    try {
      queryClient.setQueryData(getGetChatHistoryQueryKey(agentId), (old: any) => {
        const newMsg = { id: Date.now(), agentId, role: 'user', content: message, createdAt: new Date().toISOString() };
        return old ? [...old, newMsg] : [newMsg];
      });

      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, ...(imageUrl ? { imageUrl } : {}) }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        throw new Error('Failed to send message');
      }

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');

        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6);
            if (dataStr.trim() === '[DONE]') continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.searching) {
                setIsSearching(true);
                continue;
              }
              if (data.toolCalls && Array.isArray(data.toolCalls)) {
                setActiveToolCalls(data.toolCalls as string[]);
                setIsSearching(false);
                continue;
              }
              if (data.done) {
                setIsSearching(false);
                setActiveToolCalls([]);
                if (data.sources && Array.isArray(data.sources)) {
                  setLastSources(data.sources as ChatSource[]);
                }
                if (data.usedTools && Array.isArray(data.usedTools)) {
                  setLastUsedTools(data.usedTools as string[]);
                }
                break;
              }
              if (data.content) {
                setIsSearching(false);
                setActiveToolCalls([]);
                setStreamedResponse(prev => prev + data.content);
              }
            } catch (e) {
              console.error('Failed to parse SSE chunk', e);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setIsStreaming(false);
      queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey(agentId) });
      queryClient.invalidateQueries({ queryKey: getListMemoriesQueryKey(agentId) });
    }
  };

  const stopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return {
    sendMessage,
    isStreaming,
    streamedResponse,
    isSearching,
    lastSources,
    activeToolCalls,
    lastUsedTools,
    error,
    stopStream
  };
}
