import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function PageHeader({ heading, subtitle }: { heading: string; subtitle: string }) {
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
      <span className="font-headline text-lg font-bold tracking-tight mb-2 text-primary">
        OpSoul
      </span>
      <h2 className="font-headline text-2xl md:text-3xl font-medium tracking-tight mb-2 text-foreground">
        {heading}
      </h2>
      <p className="text-sm leading-relaxed font-body max-w-[280px] text-muted-foreground">
        {subtitle}
      </p>
    </div>
  );
}

function LightInput({
  id, type = "text", label, placeholder, value, onChange, required, autoComplete, "data-testid": testId,
}: {
  id: string;
  type?: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  autoComplete?: string;
  "data-testid"?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block font-label text-[10px] font-bold uppercase tracking-[0.22em] px-1 text-muted-foreground"
      >
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
        data-testid={testId}
        className="w-full h-14 rounded-xl px-5 text-sm outline-none transition-all duration-200 bg-muted/40 border border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotDone, setForgotDone] = useState(false);

  const urlError = new URLSearchParams(window.location.search).get("error");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    window.location.href = "/api/auth/google";
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: forgotEmail }),
      });
      setForgotDone(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  };

  if (showForgot) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background relative overflow-hidden">
        <main className="w-full max-w-[460px] z-10">
          <div className="mb-5 text-center">
            <Link href="/">
              <span className="inline-flex items-center gap-1.5 text-xs font-label font-medium transition-colors cursor-pointer text-muted-foreground hover:text-foreground">
                ← OpSoul
              </span>
            </Link>
          </div>

          <div className="bg-white border border-border rounded-[2rem] p-10 flex flex-col items-center shadow-sm">
            <PageHeader
              heading="Forgot your password?"
              subtitle="We'll send a reset link to your email."
            />

            {forgotDone ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-primary" />
                <p className="font-label font-semibold text-foreground">
                  Check your inbox
                </p>
                <p className="text-sm font-body text-muted-foreground">
                  If that email has a password-based account, a reset link has been sent.
                </p>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="w-full flex flex-col gap-6">
                <LightInput
                  id="forgot-email"
                  type="email"
                  label="Email"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full h-14 rounded-full font-label font-bold tracking-tight text-base flex items-center justify-center gap-2 transition-transform duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {forgotLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {forgotLoading ? "Sending…" : "Send reset link"}
                </button>
              </form>
            )}
          </div>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setShowForgot(false)}
              className="text-sm font-label transition-colors text-muted-foreground hover:text-foreground"
            >
              ← Back to sign in
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background relative overflow-hidden">
      <main className="w-full max-w-[480px] z-10">
        <div className="mb-5 text-center">
          <Link href="/">
            <span className="inline-flex items-center gap-1.5 text-xs font-label font-medium transition-colors cursor-pointer text-muted-foreground hover:text-foreground">
              ← OpSoul
            </span>
          </Link>
        </div>

        <div className="bg-white border border-border rounded-[2rem] p-10 md:p-12 flex flex-col items-center shadow-sm">
          <PageHeader
            heading="Sign in"
            subtitle="Sign in to your OpSoul workspace."
          />

          {urlError && (
            <div className="w-full rounded-xl px-4 py-3 text-sm font-label text-center mb-6 bg-destructive/10 border border-destructive/30 text-destructive">
              {urlError === "google_cancelled"
                ? "Google sign-in was cancelled."
                : urlError === "registration_closed"
                ? "Access is restricted to authorised accounts only."
                : "Google sign-in failed. Please try again."}
            </div>
          )}

          {/* Google button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 h-14 rounded-xl font-label font-medium text-sm transition-all duration-200 mb-6 bg-muted border border-border text-foreground hover:bg-muted/80"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {/* Divider */}
          <div className="w-full flex items-center gap-4 mb-6">
            <div className="h-px flex-1 bg-border" />
            <span className="font-label font-bold uppercase tracking-[0.22em] text-[10px] text-muted-foreground">
              or continue with email
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
            <LightInput
              id="email"
              type="email"
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              data-testid="input-email"
            />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <label
                  htmlFor="password"
                  className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="font-label text-[11px] transition-colors text-muted-foreground hover:text-foreground"
                >
                  Forgot your password?
                </button>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                data-testid="input-password"
                className="w-full h-14 rounded-xl px-5 text-sm outline-none transition-all duration-200 bg-muted/40 border border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              data-testid="button-submit"
              className="w-full h-14 rounded-full font-label font-bold tracking-tight text-base flex items-center justify-center gap-2 transition-transform duration-300 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Please wait…" : "Sign in"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <footer className="mt-8 flex justify-center gap-8">
          {["Legal", "Privacy", "Security"].map((label) => (
            <a
              key={label}
              href={`https://opsoul.io/${label.toLowerCase()}`}
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
