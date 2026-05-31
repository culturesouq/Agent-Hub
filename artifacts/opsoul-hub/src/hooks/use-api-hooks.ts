import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Operator, SelfAwareness } from "@/types";

export const useOperators = () => {
  return useQuery({
    queryKey: ["operators"],
    queryFn: () => apiFetch<Operator[]>("/operators"),
  });
};

export const useOperator = (id: string) => {
  return useQuery({
    queryKey: ["operators", id],
    queryFn: () => apiFetch<Operator>(`/operators/${id}`),
    enabled: !!id,
  });
};

export const useSelfAwareness = (id: string) => {
  return useQuery({
    queryKey: ["operators", id, "self-awareness"],
    queryFn: () => apiFetch<SelfAwareness>(`/operators/${id}/grow/self-awareness`),
    enabled: !!id,
  });
};

// Add more hooks as needed...