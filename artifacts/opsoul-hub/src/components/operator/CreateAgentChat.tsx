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
import { Loader2 } from "lucide-react";

interface BootstrapPreview {
  archetype: string;
  description: string;
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

  const handleClose = () => {
    if (isLoading) return;
    setName("");
    setPurpose("");
    onClose();
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const trimmedPurpose = purpose.trim();
    if (!trimmedName || !trimmedPurpose) return;

    setIsLoading(true);
    try {
      const preview = await apiFetch<BootstrapPreview>("/operators/bootstrap-preview", {
        method: "POST",
        body: JSON.stringify({ name: trimmedName, purpose: trimmedPurpose, personality: "" }),
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
          archetype: preview.archetype,
          mandate: trimmedPurpose,
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

  const canSubmit = name.trim().length > 0 && purpose.trim().length > 0 && !isLoading;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md border-border/50 bg-background">
        <DialogTitle className="font-mono text-lg font-bold">New Assistant</DialogTitle>

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
              What will it help with?
            </Label>
            <Textarea
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="e.g. Answer customer questions about our product, help with onboarding, and escalate when needed."
              className="font-mono min-h-[100px] resize-none"
              disabled={isLoading}
            />
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
              `Create ${name.trim() || "assistant"}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
