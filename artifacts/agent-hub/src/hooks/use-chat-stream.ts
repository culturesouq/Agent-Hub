import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetChatHistoryQueryKey } from "@workspace/api-client-react";

export function useChatStream(agentId: number) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedResponse, setStreamedResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const sendMessage = async (message: string) => {
    if (isStreaming) return;

    setIsStreaming(true);
    setStreamedResponse("");
    setError(null);

    abortControllerRef.current = new AbortController();

    try {
      // Optimistically add user message to cache
      queryClient.setQueryData(getGetChatHistoryQueryKey(agentId), (old: any) => {
        const newMsg = { id: Date.now(), agentId, role: 'user', content: message, createdAt: new Date().toISOString() };
        return old ? [...old, newMsg] : [newMsg];
      });

      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
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
        
        buffer = lines.pop() || ""; // Keep the last incomplete part in the buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6);
            if (dataStr.trim() === '[DONE]') continue;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.done) {
                break;
              }
              if (data.content) {
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
      // Invalidate chat history to get the final persisted assistant message
      queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey(agentId) });
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
    error,
    stopStream
  };
}
