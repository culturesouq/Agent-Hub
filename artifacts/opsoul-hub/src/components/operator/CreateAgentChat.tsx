import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Operator } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Send, Sparkles, X, RefreshCw } from "lucide-react";

type Step = "name" | "purpose" | "personality" | "deriving" | "confirm" | "creating";

interface ChatMessage {
  from: "system" | "user";
  text: string;
}

interface BootstrapPreview {
  archetype: string;
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
  const [operatorPersonality, setOperatorPersonality] = useState("");
  const [preview, setPreview] = useState<BootstrapPreview | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { from: "system", text: "What would you like to call your operator?" },
  ]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, step]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const resetState = () => {
    setStep("name");
    setInputValue("");
    setOperatorName("");
    setOperatorPurpose("");
    setOperatorPersonality("");
    setPreview(null);
    setMessages([{ from: "system", text: "What would you like to call your operator?" }]);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const addMessage = (msg: ChatMessage) => {
    setMessages(prev => [...prev, msg]);
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiFetch<Operator>("/operators", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: (newOp) => {
      queryClient.invalidateQueries({ queryKey: ["operators"] });
      toast({ title: "Operator created!", description: `${newOp.name} is ready.` });
      handleClose();
      setLocation(`/operators/${newOp.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create operator", description: err.message, variant: "destructive" });
      setStep("confirm");
    },
  });

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text) return;
    setInputValue("");

    if (step === "name") {
      setOperatorName(text);
      addMessage({ from: "user", text });
      setTimeout(() => {
        addMessage({ from: "system", text: `Nice! What is ${text} here to do for you?` });
        setStep("purpose");
      }, 300);
    } else if (step === "purpose") {
      setOperatorPurpose(text);
      addMessage({ from: "user", text });
      setTimeout(() => {
        addMessage({ from: "system", text: `How would you describe ${operatorName}'s personality?` });
        setStep("personality");
      }, 300);
    } else if (step === "personality") {
      setOperatorPersonality(text);
      addMessage({ from: "user", text });
      setStep("deriving");
      addMessage({ from: "system", text: `Let me think about the best way to set up ${operatorName}...` });

      try {
        const result = await apiFetch<BootstrapPreview>("/operators/bootstrap-preview", {
          method: "POST",
          body: JSON.stringify({ name: operatorName, purpose: operatorPurpose, personality: text }),
        });
        setPreview(result);
        setStep("confirm");
        addMessage({
          from: "system",
          text: `I'd describe ${operatorName} as a **${result.archetype}**. Ready to create them?`,
        });
      } catch (err: any) {
        toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
        setStep("personality");
      }
    }
  };

  const handleConfirm = () => {
    if (!preview) return;
    setStep("creating");
    const slug = operatorName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 50) + "-" + Math.random().toString(36).substring(2, 6);
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
      <DialogContent className="max-w-lg p-0 gap-0 border-primary/20 bg-background overflow-hidden [&>button:last-of-type]:hidden">
        <DialogTitle className="sr-only">Create New Operator</DialogTitle>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-card/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="font-mono font-bold text-sm">New Operator</span>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chat area */}
        <div className="flex flex-col gap-3 p-5 min-h-[300px] max-h-[400px] overflow-y-auto">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm font-mono leading-relaxed
                ${msg.from === "system"
                  ? "bg-card border border-border/50 text-foreground rounded-tl-sm"
                  : "bg-primary text-primary-foreground rounded-tr-sm"
                }`}>
                {msg.text.split("**").map((part, j) =>
                  j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                )}
              </div>
            </div>
          ))}

          {step === "deriving" && (
            <div className="flex justify-start">
              <div className="bg-card border border-border/50 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
                <span className="text-xs font-mono text-muted-foreground">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Action area */}
        <div className="border-t border-border/50 bg-card/30">
          {step === "confirm" && preview && (
            <div className="p-5 space-y-3">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 font-mono text-xs text-primary/80">
                <span className="font-bold">{operatorName}</span> · {preview.archetype}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" onClick={resetState} className="font-mono text-xs flex-1">
                  Start over
                </Button>
                <Button size="sm" onClick={handleConfirm} className="font-mono text-xs font-bold flex-2 flex-1 bg-primary hover:bg-primary/90">
                  Create {operatorName}
                </Button>
              </div>
            </div>
          )}

          {step === "creating" && (
            <div className="p-5 flex items-center justify-center gap-2 text-sm font-mono text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin text-primary" />
              Creating your operator...
            </div>
          )}

          {isInputActive && (
            <div className="flex items-center gap-3 p-4">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
                placeholder="Type your answer..."
                className="font-mono text-sm bg-background/50 border-border/50 flex-1"
                autoFocus
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="shrink-0 bg-primary hover:bg-primary/90"
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
