import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator, HealthScore } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { LogOut, Plus, Activity, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import CreateAgentChat from "@/components/operator/CreateAgentChat";

function HealthBadge({ operatorId }: { operatorId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["operators", operatorId, "self-awareness"],
    queryFn: () => apiFetch<{ healthScore: HealthScore }>(`/operators/${operatorId}/grow/self-awareness`),
    staleTime: 60000,
  });

  if (isLoading) return <Badge variant="outline" className="animate-pulse">...</Badge>;
  if (!data?.healthScore) return null;

  const { score, label } = data.healthScore;
  const colorClass = score >= 80 ? "text-green-500 border-green-500/20 bg-green-500/10" :
    score >= 50 ? "text-amber-500 border-amber-500/20 bg-amber-500/10" :
    "text-red-500 border-red-500/20 bg-red-500/10";

  return (
    <Badge variant="outline" className={`${colorClass} font-mono uppercase tracking-wider text-xs px-2 py-0.5`} data-testid={`badge-health-${operatorId}`}>
      {score}% · {label}
    </Badge>
  );
}

export default function Dashboard() {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: operators, isLoading } = useQuery({
    queryKey: ["operators"],
    queryFn: () => apiFetch<Operator[]>("/operators"),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-primary" />
            <span className="font-mono text-xl font-bold tracking-tight text-primary">OpSoul</span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="font-mono text-muted-foreground hover:text-foreground" data-testid="button-logout">
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold font-mono tracking-tight">My Operators</h1>
            <p className="text-muted-foreground mt-1 font-mono text-sm">Your AI operators</p>
          </div>

          <Button
            className="font-mono font-bold tracking-wider"
            onClick={() => setIsCreateOpen(true)}
            data-testid="button-create-operator"
          >
            <Plus className="w-4 h-4 mr-2" /> New Operator
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Card key={i} className="h-48 animate-pulse bg-muted/20 border-border/20" />
            ))}
          </div>
        ) : operators?.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-border/50 rounded-lg bg-card/20">
            <Cpu className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <h3 className="font-mono text-xl font-bold mb-2">No operators yet</h3>
            <p className="text-muted-foreground font-mono text-sm mb-6 max-w-md mx-auto">
              Create your first operator to get started.
            </p>
            <Button onClick={() => setIsCreateOpen(true)} variant="outline" className="font-mono border-primary/30 text-primary hover:bg-primary/10">
              <Plus className="w-4 h-4 mr-2" /> Create Operator
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {operators?.map((operator) => (
              <Card
                key={operator.id}
                className="group relative overflow-hidden bg-card border-border/50 hover:border-primary/50 transition-all duration-300 flex flex-col cursor-pointer"
                onClick={() => setLocation(`/operators/${operator.id}`)}
                data-testid={`card-operator-${operator.id}`}
              >
                <div className="absolute top-3 right-3 z-10">
                  <HealthBadge operatorId={operator.id} />
                </div>

                <CardHeader className="pb-3 pt-4">
                  <CardTitle className="font-mono text-xl pr-24 truncate">{operator.name}</CardTitle>
                  <CardDescription className="font-mono text-xs uppercase tracking-wider text-primary/70">
                    {operator.archetype}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground line-clamp-3 font-mono leading-relaxed opacity-80">
                    {operator.mandate}
                  </p>
                </CardContent>
                <CardFooter className="pt-3 border-t border-border/20 flex items-center justify-between text-xs text-muted-foreground font-mono">
                  <span>ID: {operator.id.substring(0, 8)}</span>
                  <span className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${operator.layer1LockedAt ? 'bg-primary' : 'bg-amber-500 animate-pulse'}`} />
                    {operator.layer1LockedAt ? 'Locked' : 'Unlocked'}
                  </span>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>

      <CreateAgentChat open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
