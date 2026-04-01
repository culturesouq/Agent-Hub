import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Send, X, RefreshCw } from "lucide-react";

type Step = "name" | "purpose" | "personality" | "deriving" | "confirm" | "creating";

interface ChatMessage {
  from: "operator" | "owner";
  text: string;
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>("name");
  const [inputValue, setInputValue] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [operatorPurpose, setOperatorPurpose] = useState("");
  const [preview, setPreview] = useState<BootstrapPreview | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { from: "operator", text: "Hi! What would you like to call me?" },
  ]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, step]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const resetState = () => {
    setStep("name");
    setInputValue("");
    setOperatorName("");
    setOperatorPurpose("");
    setPreview(null);
    setMessages([{ from: "operator", text: "Hi! What would you like to call me?" }]);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const addMessage = (msg: ChatMessage) => setMessages(prev => [...prev, msg]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiFetch<Operator>("/operators", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: (newOp) => {
      queryClient.invalidateQueries({ queryKey: ["operators"] });
      toast({ title: `${newOp.name} is ready!` });
      handleClose();
      setLocation(`/operators/${newOp.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
      setStep("confirm");
    },
  });

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text) return;
    setInputValue("");

    if (step === "name") {
      setOperatorName(text);
      addMessage({ from: "owner", text });
      setTimeout(() => {
        addMessage({ from: "operator", text: `Nice to meet you, ${text}! What will I be helping you with?` });
        setStep("purpose");
      }, 300);

    } else if (step === "purpose") {
      setOperatorPurpose(text);
      addMessage({ from: "owner", text });
      setTimeout(() => {
        addMessage({ from: "operator", text: "Got it! How would you describe my personality?" });
        setStep("personality");
      }, 300);

    } else if (step === "personality") {
      addMessage({ from: "owner", text });
      setStep("deriving");

      try {
        const result = await apiFetch<BootstrapPreview>("/operators/bootstrap-preview", {
          method: "POST",
          body: JSON.stringify({ name: operatorName, purpose: operatorPurpose, personality: text }),
        });
        setPreview(result);
        setStep("confirm");
        addMessage({ from: "operator", text: result.description });
      } catch (err: any) {
        toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
        setStep("personality");
        addMessage({ from: "operator", text: "Sorry, I ran into a problem. Can you try describing my personality again?" });
      }
    }
  };

  const handleConfirm = () => {
    if (!preview) return;
    setStep("creating");
    const slug = operatorName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50) + "-" + Math.random().toString(36).substring(2, 6);

    createMutation.mutate({
      name: operatorName,
      slug,
      archetype: preview.archetype,
      mandate: operatorPurpose,
      coreValues: preview.coreValues,
      ethicalBoundaries: preview.ethicalBoundaries,
      layer2Soul: preview.layer2Soul,
      growLockLevel: "CONTROLLED",
      safeMode: false,
      toolUsePolicy: {},
    });
  };

  const isInputActive = step === "name" || step === "purpose" || step === "personality";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg p-0 gap-0 border-border/50 bg-background overflow-hidden [&>button:last-of-type]:hidden">
        <DialogTitle className="sr-only">Create New Operator</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50 bg-card/40">
          <span className="font-mono font-semibold text-sm text-foreground">New Operator</span>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chat */}
        <div className="flex flex-col gap-3 p-5 min-h-[300px] max-h-[420px] overflow-y-auto bg-background">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.from === "owner" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                ${msg.from === "operator"
                  ? "bg-card border border-border/50 text-foreground rounded-tl-none"
                  : "bg-primary text-primary-foreground rounded-tr-none font-mono"
                }`}>
                {msg.text}
              </div>
            </div>
          ))}

          {step === "deriving" && (
            <div className="flex justify-start">
              <div className="bg-card border border-border/50 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2.5">
                <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
                <span className="text-sm text-muted-foreground">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Bottom area */}
        <div className="border-t border-border/50 bg-card/20">
          {step === "confirm" && preview && (
            <div className="p-4 space-y-3">
              <p className="font-mono text-xs text-muted-foreground text-center">Ready to create {operatorName}?</p>
              <div className="flex gap-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetState}
                  className="font-mono text-xs flex-1 border-border/50"
                >
                  Start over
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirm}
                  className="font-mono text-xs font-bold flex-1"
                >
                  Create {operatorName}
                </Button>
              </div>
            </div>
          )}

          {step === "creating" && (
            <div className="p-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin text-primary" />
              <span className="font-mono">Creating {operatorName}...</span>
            </div>
          )}

          {isInputActive && (
            <div className="flex items-center gap-2.5 p-3.5">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) handleSend(); }}
                placeholder="Type your answer..."
                className="font-mono text-sm bg-background border-border/50 flex-1"
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
