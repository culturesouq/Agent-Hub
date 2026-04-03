import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Operator } from "@/types";
import IdentitySection from "./IdentitySection";

export default function PersonalitySection({ operatorId }: { operatorId: string }) {
  const { data: operator } = useQuery({
    queryKey: ["operators", operatorId],
    queryFn: () => apiFetch<Operator>(`/operators/${operatorId}`),
    enabled: !!operatorId,
  });

  if (!operator) return null;

  return <IdentitySection operator={operator} panel="personality" />;
}
