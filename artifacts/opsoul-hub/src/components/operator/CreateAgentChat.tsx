import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Check } from "lucide-react";

const ARCHETYPE_OPTIONS = [
  { id: 'Advisor',   label: 'Advisor',   desc: 'Guides decisions and counsels' },
  { id: 'Executor',  label: 'Executor',  desc: 'Action-oriented, gets things done' },
  { id: 'Expert',    label: 'Expert',    desc: 'Deep specialist knowledge' },
  { id: 'Connector', label: 'Connector', desc: 'Bridges people and ideas' },
  { id: 'Creator',   label: 'Creator',   desc: 'Generates ideas and content' },
  { id: 'Guardian',  label: 'Guardian',  desc: 'Protects and monitors boundaries' },
] as const;

interface BootstrapPreview {
  archetype: string;
  identityParagraph: string;
  personalityParagraph: string;
  openingMessage: string;
  coreValues: string[];
  ethicalBoundaries: string[];
  layer2Soul: {
    personalityTraits: string[];
    toneProfile: string;
    communicationStyle: string;
    quirks: string[];
    valuesManifestation: string[];
    emotionalRange: string;
    decisionMakingStyle: string;
    conflictResolution: string;
    openingMessage: string;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateAgentChat({ open, onClose }: Props) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>(['Advisor']);

  const toggleArchetype = (a: string) => {
    setSelectedArchetypes(prev => {
      if (prev.includes(a)) {
        if (prev.length === 1) return prev;
        return prev.filter(x => x !== a);
      }
      return [...prev, a];
    });
  };

  const handleClose = () => {
    if (isLoading) return;
    setName("");
    setPurpose("");
    setSelectedArchetypes(['Advisor']);
    onClose();
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setIsLoading(true);
    try {
      const preview = await apiFetch<BootstrapPreview>("/operators/bootstrap-preview", {
        method: "POST",
        body: JSON.stringify({ name: trimmedName, purpose: purpose.trim() || undefined }),
      });

      const slug =
        trimmedName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .substring(0, 50) +
        "-" +
        Math.random().toString(36).substring(2, 6);

      const newOp = await apiFetch<Operator>("/operators", {
        method: "POST",
        body: JSON.stringify({
          name: trimmedName,
          slug,
          archetype: selectedArchetypes,
          mandate: preview.identityParagraph,
          coreValues: preview.coreValues,
          ethicalBoundaries: preview.ethicalBoundaries,
          layer2Soul: preview.layer2Soul,
          growLockLevel: "CONTROLLED",
          safeMode: false,
          toolUsePolicy: {},
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["operators"] });
      toast({ title: `${newOp.name} is ready!` });
      handleClose();
      setLocation(`/operators/${newOp.id}`);
    } catch (err: any) {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const canSubmit = name.trim().length > 0 && !isLoading && selectedArchetypes.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md border-border/50 bg-background">
        <DialogTitle className="font-mono text-lg font-bold">New Operator</DialogTitle>

        <div className="space-y-5 mt-2">
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              What's its name?
            </Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Alex, Support Bot, Research Helper"
              className="font-mono"
              disabled={isLoading}
              onKeyDown={e => { if (e.key === "Enter" && canSubmit) handleCreate(); }}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              What will it help with? <span className="normal-case text-muted-foreground/60">(optional)</span>
            </Label>
            <Textarea
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="e.g. Answer customer questions about our product, help with onboarding, and escalate when needed."
              className="font-mono min-h-[100px] resize-none"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Archetype <span className="normal-case text-muted-foreground/60">(pick one or more)</span>
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {ARCHETYPE_OPTIONS.map(a => {
                const selected = selectedArchetypes.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={isLoading}
                    onClick={() => toggleArchetype(a.id)}
                    className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all font-mono
                      ${selected
                        ? 'border-primary/60 bg-primary/10 text-primary'
                        : 'border-border/40 bg-card/30 text-muted-foreground hover:border-border hover:text-foreground'
                      }`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all
                      ${selected ? 'bg-primary border-primary' : 'border-border/60'}`}>
                      {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight">{a.label}</div>
                      <div className="text-[10px] leading-snug mt-0.5 opacity-70">{a.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            onClick={handleCreate}
            disabled={!canSubmit}
            className="w-full font-mono font-bold"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Setting up...
              </>
            ) : (
              `Create ${name.trim() || "operator"}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
