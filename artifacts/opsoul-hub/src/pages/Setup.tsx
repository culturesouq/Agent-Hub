import { useState } from "react";
import { Loader2, Eye, EyeOff, Check, ChevronDown, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ────────────────────────────────────────────────────────────────────

type ByoProvider = "openai" | "anthropic" | "azure_openai" | "openrouter" | "custom";

const PROVIDER_OPTIONS: { value: ByoProvider; label: string }[] = [
  { value: "openai",       label: "OpenAI" },
  { value: "anthropic",    label: "Anthropic" },
  { value: "azure_openai", label: "Azure OpenAI" },
  { value: "openrouter",   label: "OpenRouter" },
  { value: "custom",       label: "Custom endpoint" },
];

const MODEL_PLACEHOLDERS: Record<ByoProvider, string> = {
  openai:       "gpt-4o-mini",
  anthropic:    "claude-haiku-4-5-20251001",
  azure_openai: "gpt-4o",
  openrouter:   "openai/gpt-4o-mini",
  custom:       "your-model-id",
};

// ── Shared visual primitives ─────────────────────────────────────────────────

function LightInput({
  id, type = "text", label, placeholder, value, onChange, required, autoComplete, disabled,
}: {
  id: string;
  type?: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium px-1 text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
        disabled={disabled}
        className="w-full h-14 rounded-xl px-5 text-sm outline-none transition-all duration-200 bg-muted/40 border border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function PasswordInput({
  id, label, placeholder, value, onChange, required, autoComplete, disabled,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  autoComplete?: string;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium px-1 text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          autoComplete={autoComplete}
          disabled={disabled}
          className="w-full h-14 rounded-xl px-5 pr-12 text-sm outline-none transition-all duration-200 bg-muted/40 border border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          tabIndex={-1}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function PrimaryButton({
  children, type = "button", onClick, disabled, loading,
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full h-14 rounded-full font-label font-bold tracking-tight text-base flex items-center justify-center gap-2 transition-transform duration-300 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

// ── Step indicators ───────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < current
              ? "w-2 h-2 bg-primary"
              : i === current
              ? "w-6 h-2 bg-primary"
              : "w-2 h-2 bg-border"
          }`}
        />
      ))}
    </div>
  );
}

// ── OpSoul logo header ────────────────────────────────────────────────────────

function OpSoulHeader() {
  return (
    <div className="flex flex-col items-center text-center mb-8">
      <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
        <span
          className="material-symbols-outlined text-3xl text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          deployed_code
        </span>
      </div>
      <span className="font-headline text-lg font-bold tracking-tight text-primary">OpSoul</span>
    </div>
  );
}

// ── Step 1: Admin account ─────────────────────────────────────────────────────

function Step1({
  onDone,
}: {
  onDone: (token: string) => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast({ title: "Password too short", description: "Must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/setup/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Setup failed", description: data.error ?? "Something went wrong.", variant: "destructive" });
        return;
      }
      localStorage.setItem("opsoul_token", data.accessToken);
      onDone(data.accessToken);
    } catch (err: any) {
      toast({ title: "Setup failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
      <div className="mb-2">
        <h2 className="font-headline text-2xl font-medium tracking-tight text-foreground text-center">
          Welcome to OpSoul
        </h2>
        <p className="text-sm text-muted-foreground text-center mt-1.5">
          Create your admin account to get started.
        </p>
      </div>

      <LightInput
        id="setup-email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        disabled={loading}
      />
      <PasswordInput
        id="setup-password"
        label="Password"
        placeholder="Min. 8 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="new-password"
        disabled={loading}
      />
      <PasswordInput
        id="setup-confirm"
        label="Confirm password"
        placeholder="Repeat your password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        autoComplete="new-password"
        disabled={loading}
      />

      <PrimaryButton type="submit" loading={loading}>
        {loading ? "Creating account…" : (
          <>Continue <ArrowRight className="w-4 h-4" /></>
        )}
      </PrimaryButton>
    </form>
  );
}

// ── Step 2: AI model key ──────────────────────────────────────────────────────

function Step2({
  onComplete,
  onSkip,
}: {
  onComplete: () => void;
  onSkip: () => void;
}) {
  const { toast } = useToast();
  const [provider, setProvider] = useState<ByoProvider>("openai");
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const needsBaseUrl = provider === "azure_openai" || provider === "custom";

  const handleComplete = async () => {
    if (!apiKey.trim() || !modelId.trim()) {
      toast({ title: "Missing fields", description: "Provide a model ID and API key, or skip for now.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // Store pending config in localStorage — applied per-operator via Settings later
      const config = {
        provider,
        modelId: modelId.trim(),
        apiKey: apiKey.trim(),
        ...(needsBaseUrl && baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      };
      localStorage.setItem("opsoul_pending_model_config", JSON.stringify(config));
      onComplete();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-5">
      <div className="mb-2">
        <h2 className="font-headline text-2xl font-medium tracking-tight text-foreground text-center">
          Your AI model
        </h2>
        <p className="text-sm text-muted-foreground text-center mt-1.5">
          Connect your own API key. You can also do this later in operator Settings.
        </p>
      </div>

      {/* Provider */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium px-1 text-muted-foreground">Provider</label>
        <div className="relative">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ByoProvider)}
            className="w-full appearance-none h-14 rounded-xl px-5 text-sm outline-none transition-all duration-200 bg-muted/40 border border-border text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 pr-10"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Model ID */}
      <LightInput
        id="setup-model-id"
        label="Model ID"
        placeholder={MODEL_PLACEHOLDERS[provider]}
        value={modelId}
        onChange={(e) => setModelId(e.target.value)}
        autoComplete="off"
      />

      {/* API Key */}
      <PasswordInput
        id="setup-api-key"
        label="API Key"
        placeholder="sk-..."
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        autoComplete="off"
      />

      {/* Base URL — only for azure_openai and custom */}
      {needsBaseUrl && (
        <LightInput
          id="setup-base-url"
          label="Base URL"
          placeholder="https://your-resource.openai.azure.com/openai/deployments/gpt-4o"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          autoComplete="off"
        />
      )}

      <PrimaryButton onClick={handleComplete} loading={saving}>
        {saving ? "Saving…" : "Complete setup"}
      </PrimaryButton>

      <button
        type="button"
        onClick={onSkip}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
      >
        Skip for now — add it in Settings later
      </button>
    </div>
  );
}

// ── Step 3: Done ──────────────────────────────────────────────────────────────

function Step3({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="w-full flex flex-col items-center gap-6 text-center">
      <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
        <Check className="w-7 h-7 text-green-500" />
      </div>
      <div>
        <h2 className="font-headline text-2xl font-medium tracking-tight text-foreground">
          You're in.
        </h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto leading-relaxed">
          Your OpSoul is ready. Create your first operator to get started.
        </p>
      </div>
      <PrimaryButton onClick={onOpen}>
        Open Console <ArrowRight className="w-4 h-4" />
      </PrimaryButton>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function Setup({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);

  const handleStep1Done = (_token: string) => {
    setStep(1);
  };

  const handleStep2Done = () => {
    setStep(2);
  };

  const handleOpen = () => {
    // Reload so AuthContext picks up the token already in localStorage
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <main className="w-full max-w-[480px]">
        <div className="bg-white border border-border rounded-[2rem] p-10 md:p-12 flex flex-col items-center shadow-sm">
          <OpSoulHeader />
          <StepDots current={step} total={3} />

          {step === 0 && (
            <Step1 onDone={handleStep1Done} />
          )}
          {step === 1 && (
            <Step2 onComplete={handleStep2Done} onSkip={handleStep2Done} />
          )}
          {step === 2 && (
            <Step3 onOpen={handleOpen} />
          )}
        </div>

        <footer className="mt-8 flex justify-center gap-8">
          {["Legal", "Privacy", "Security"].map((label) => (
            <a
              key={label}
              href={`/${label.toLowerCase()}`}
              className="font-label font-bold uppercase transition-colors text-muted-foreground/60 hover:text-primary"
              style={{ fontSize: "11px", letterSpacing: "0.2em" }}
            >
              {label}
            </a>
          ))}
        </footer>
      </main>
    </div>
  );
}
