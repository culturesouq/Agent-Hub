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

function NebulaBackground() {
  return (
    <>
      <div
        className="fixed pointer-events-none"
        style={{
          top: "-10%", left: "-10%", width: "60%", height: "60%",
          background: "radial-gradient(circle at center, rgba(205,150,255,0.15) 0%, transparent 70%)",
        }}
      />
      <div
        className="fixed pointer-events-none"
        style={{
          bottom: "-10%", right: "-10%", width: "60%", height: "60%",
          background: "radial-gradient(circle at center, rgba(64,206,243,0.10) 0%, transparent 70%)",
        }}
      />
    </>
  );
}

function LogoMark() {
  return (
    <div className="flex flex-col items-center gap-3 mb-6">
      <div
        className="w-16 h-16 rounded-full p-[2px] flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, #cd96ff, #40cef3)",
          boxShadow: "0 0 24px rgba(205,150,255,0.45)",
        }}
      >
        <div
          className="w-full h-full rounded-full flex items-center justify-center"
          style={{ background: "#0e0e11" }}
        >
          <span
            className="material-symbols-outlined text-3xl"
            style={{ color: "#cd96ff", fontVariationSettings: "'FILL' 1" }}
          >
            deployed_code
          </span>
        </div>
      </div>
      <span
        className="font-headline text-2xl font-bold tracking-tight"
        style={{
          background: "linear-gradient(90deg, #cd96ff, #40cef3)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        OpSoul
      </span>
    </div>
  );
}

function NebulaInput({
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
        className="block font-label text-[10px] font-bold uppercase tracking-[0.22em] px-1"
        style={{ color: "#adaaaf" }}
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
        className="w-full h-14 rounded-xl px-5 text-sm outline-none transition-all duration-200"
        style={{
          background: "rgba(0,0,0,0.5)",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "#f3eff5",
          caretColor: "#cd96ff",
        }}
        onFocus={(e) => {
          e.currentTarget.style.background = "rgba(31,31,36,0.8)";
          e.currentTarget.style.boxShadow = "0 0 0 2px rgba(64,206,243,0.25), 0 0 12px rgba(64,206,243,0.10)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.background = "rgba(0,0,0,0.5)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </div>
  );
}

export default function Login() {
  const { login, register } = useAuth();
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
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

  const cardStyle: React.CSSProperties = {
    background: "rgba(31, 31, 36, 0.45)",
    backdropFilter: "blur(40px)",
    WebkitBackdropFilter: "blur(40px)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.06) inset, 0 20px 60px rgba(0,0,0,0.5)",
    borderRadius: "2rem",
  };

  if (showForgot) {
    return (
      <div
        className="min-h-screen dot-grid flex flex-col items-center justify-center p-6 relative overflow-hidden"
        style={{ background: "#020203" }}
      >
        <NebulaBackground />
        <main className="w-full max-w-[460px] z-10">
          <div style={cardStyle} className="p-10 flex flex-col items-center">
            <LogoMark />

            <div className="text-center mb-8">
              <h2
                className="font-headline text-2xl font-semibold tracking-tight mb-2"
                style={{ color: "#f3eff5" }}
              >
                Forgot your password?
              </h2>
              <p className="text-sm leading-relaxed font-body" style={{ color: "#adaaaf" }}>
                We'll send a reset link to your email.
              </p>
            </div>

            {forgotDone ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="w-10 h-10" style={{ color: "#40cef3" }} />
                <p className="font-label font-semibold" style={{ color: "#f3eff5" }}>
                  Check your inbox
                </p>
                <p className="text-sm font-body" style={{ color: "#adaaaf" }}>
                  If that email has a password-based account, a reset link has been sent.
                </p>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="w-full flex flex-col gap-6">
                <NebulaInput
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
                  className="w-full h-14 rounded-full font-label font-bold tracking-tight text-base flex items-center justify-center gap-2 transition-transform duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: "linear-gradient(90deg, #cd96ff, #c280ff)",
                    color: "#1a0033",
                    boxShadow: "0 8px 24px rgba(205,150,255,0.25)",
                  }}
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
              className="text-sm font-label transition-colors"
              style={{ color: "#adaaaf" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#f3eff5")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#adaaaf")}
            >
              ← Back to sign in
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen dot-grid flex flex-col items-center justify-center p-6 relative overflow-hidden"
      style={{ background: "#020203" }}
    >
      <NebulaBackground />

      <main className="w-full max-w-[480px] z-10">
        <div style={cardStyle} className="p-10 md:p-12 flex flex-col items-center">
          <LogoMark />

          <div className="text-center mb-8">
            <h2
              className="font-headline text-2xl md:text-3xl font-medium tracking-tight mb-3"
              style={{ color: "#f3eff5" }}
            >
              {isLogin ? "Welcome back" : "Create account"}
            </h2>
            <p className="text-sm leading-relaxed font-body max-w-[280px] mx-auto" style={{ color: "#adaaaf" }}>
              {isLogin
                ? "Sign in to your OpSoul workspace."
                : "Start building your AI operators."}
            </p>
          </div>

          {urlError && (
            <div
              className="w-full rounded-xl px-4 py-3 text-sm font-label text-center mb-6"
              style={{
                background: "rgba(167,0,56,0.15)",
                border: "1px solid rgba(167,0,56,0.30)",
                color: "#ffb4ab",
              }}
            >
              {urlError === "google_cancelled"
                ? "Google sign-in was cancelled."
                : "Google sign-in failed. Please try again."}
            </div>
          )}

          {/* Google button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 h-14 rounded-xl font-label font-medium text-sm transition-all duration-200 mb-6"
            style={{
              background: "#18181c",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "#f3eff5",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#262529")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#18181c")}
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {/* Divider */}
          <div className="w-full flex items-center gap-4 mb-6">
            <div className="h-px flex-1" style={{ background: "rgba(72,71,76,0.40)" }} />
            <span
              className="font-label font-bold uppercase tracking-[0.22em]"
              style={{ fontSize: "10px", color: "#767579" }}
            >
              or continue with email
            </span>
            <div className="h-px flex-1" style={{ background: "rgba(72,71,76,0.40)" }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
            {!isLogin && (
              <NebulaInput
                id="name"
                label="Display Name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={!isLogin}
                autoComplete="name"
                data-testid="input-name"
              />
            )}

            <NebulaInput
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
                  className="font-label text-[10px] font-bold uppercase tracking-[0.22em]"
                  style={{ color: "#adaaaf" }}
                >
                  Password
                </label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="font-label text-[11px] transition-colors"
                    style={{ color: "#767579" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#f3eff5")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#767579")}
                  >
                    Forgot your password?
                  </button>
                )}
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isLogin ? "current-password" : "new-password"}
                data-testid="input-password"
                className="w-full h-14 rounded-xl px-5 text-sm outline-none transition-all duration-200"
                style={{
                  background: "rgba(0,0,0,0.5)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "#f3eff5",
                  caretColor: "#cd96ff",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.background = "rgba(31,31,36,0.8)";
                  e.currentTarget.style.boxShadow = "0 0 0 2px rgba(64,206,243,0.25), 0 0 12px rgba(64,206,243,0.10)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.background = "rgba(0,0,0,0.5)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              data-testid="button-submit"
              className="w-full h-14 rounded-full font-label font-bold tracking-tight text-base flex items-center justify-center gap-2 transition-transform duration-300 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-1"
              style={{
                background: "linear-gradient(90deg, #cd96ff, #c280ff)",
                color: "#1a0033",
                boxShadow: "0 8px 28px rgba(205,150,255,0.25)",
              }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
            </button>
          </form>

          {/* Toggle & secondary actions */}
          <div className="mt-8 flex items-center gap-5 text-sm font-label">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              data-testid="button-toggle-auth"
              className="font-medium transition-colors"
              style={{ color: "#ff6a9f" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#ff8eb1")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#ff6a9f")}
            >
              {isLogin ? "Create Account" : "Sign In"}
            </button>
            <div className="w-1 h-1 rounded-full" style={{ background: "#48474c" }} />
            <Link href="/">
              <span
                className="transition-colors cursor-pointer"
                style={{ color: "#767579" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#f3eff5")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#767579")}
              >
                ← OpSoul
              </span>
            </Link>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 flex justify-center gap-8">
          {["Legal", "Privacy", "Security"].map((label) => (
            <a
              key={label}
              href={`https://opsoul.io/${label.toLowerCase()}`}
              className="font-label font-bold uppercase transition-colors"
              style={{ fontSize: "11px", letterSpacing: "0.2em", color: "rgba(118,117,121,0.6)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#cd96ff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(118,117,121,0.6)")}
            >
              {label}
            </a>
          ))}
        </footer>
      </main>

      {/* Bottom gradient fade */}
      <div
        className="absolute bottom-0 left-0 w-full pointer-events-none"
        style={{
          height: "307px",
          background: "linear-gradient(to top, #020203, transparent)",
          opacity: 0.5,
        }}
      />
    </div>
  );
}
