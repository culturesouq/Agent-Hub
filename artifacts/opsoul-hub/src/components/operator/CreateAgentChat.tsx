import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateAgentChat({ open, onClose }: Props) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [purpose, setPurpose] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleClose = () => {
    if (isLoading) return;
    setPurpose("");
    onClose();
  };

  const handleCreate = async () => {
    setIsLoading(true);
    try {
      const result = await apiFetch<{ operatorId: string; conversationId: string }>("/operators/blank", {
        method: "POST",
        body: JSON.stringify({ purpose: purpose.trim() || undefined }),
      });

      queryClient.invalidateQueries({ queryKey: ["operators"] });
      setPurpose("");
      onClose();
      setLocation(`/operators/${result.operatorId}`);
    } catch (err: any) {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md border-border/50 bg-background">
        <DialogTitle className="text-lg font-bold">New Operator</DialogTitle>

        <div className="space-y-5 mt-2">
          <p className="text-sm text-muted-foreground">
            Your operator will introduce itself and choose its own name in the birth conversation.
          </p>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              What will it help with? <span className="normal-case text-muted-foreground/60">(optional)</span>
            </Label>
            <Textarea
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="e.g. Answer customer questions, help with onboarding, escalate when needed."
              className="min-h-[100px] resize-none"
              disabled={isLoading}
            />
          </div>

          <Button
            onClick={handleCreate}
            disabled={isLoading}
            className="w-full font-bold"
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Setting up...</>
            ) : (
              "Create Operator"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
