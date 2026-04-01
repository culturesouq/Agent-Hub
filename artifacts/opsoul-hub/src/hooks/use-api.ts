import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Operator, Conversation, Message, KbChunk, GrowProposal, SelfAwareness, Memory, Integration, MissionContext, PlatformSkill, OperatorSkill, CapabilityRequest } from "@/types";

// Operators
export function useOperators() {
  return useQuery({
    queryKey: ["operators"],
    queryFn: () => apiFetch<Operator[]>("/operators"),
  });
}

export function useOperator(id: string) {
  return useQuery({
    queryKey: ["operator", id],
    queryFn: () => apiFetch<Operator>(`/operators/${id}`),
    enabled: !!id,
  });
}

export function useCreateOperator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Operator>) => apiFetch<Operator>("/operators", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operators"] });
    },
  });
}

// More hooks will be added as needed in the component files to save time, or I can add them all here if needed.
// Actually it's cleaner to keep them in a dedicated hooks file or co-located.
// Let's add the basic ones here for fast access.
