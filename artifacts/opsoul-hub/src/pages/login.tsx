import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export default function Login() {
  const { login, register } = useAuth();
  const [, setLocation] = useLocation();
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

  if (showForgot) {
    return (
      <div className="min-h-screen dot-grid flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <Link href="/">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-primary transition-colors font-label cursor-pointer">
                ← OpSoul
              </span>
            </Link>
          </div>

          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
              <span className="text-2xl font-headline font-bold text-primary">O</span>
            </div>
            <h1 className="font-headline text-3xl font-bold tracking-tight text-foreground">
              Forgot password
            </h1>
            <p className="text-muted-foreground text-sm">
              We'll send a reset link to your email
            </p>
          </div>

          <div className="glass-panel neon-glow-primary rounded-2xl border border-border/40 p-8">
            {forgotDone ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
                <p className="font-label font-semibold text-foreground">Check your inbox</p>
                <p className="text-sm text-muted-foreground">
                  If that email has a password-based account, a reset link has been sent.
                </p>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email" className="font-label text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Email
                  </Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="you@example.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    className="bg-background/40 border-border/50 focus:border-primary/60 focus:ring-primary/20 h-11 text-foreground placeholder:text-muted-foreground/50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-label font-semibold text-sm tracking-wide hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                >
                  {forgotLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {forgotLoading ? "Sending…" : "Send reset link"}
                </button>
              </form>
            )}
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowForgot(false)}
              className="text-sm text-muted-foreground hover:text-primary transition-colors font-label"
            >
              ← Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen dot-grid flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-primary transition-colors font-label cursor-pointer">
              ← OpSoul
            </span>
          </Link>
        </div>

        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <span className="text-2xl font-headline font-bold text-primary">O</span>
          </div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-foreground">
            {isLogin ? "Welcome back" : "Create account"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isLogin
              ? "Sign in to your OpSoul workspace"
              : "Start building your permanent AI operator"}
          </p>
        </div>

        {urlError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive font-label text-center">
            {urlError === "google_cancelled"
              ? "Google sign-in was cancelled."
              : "Google sign-in failed. Please try again."}
          </div>
        )}

        <div className="glass-panel neon-glow-primary rounded-2xl border border-border/40 p-8 space-y-6">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full h-11 rounded-lg border border-border/60 bg-background/60 hover:bg-background/80 hover:border-border font-label font-medium text-sm text-foreground flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-xs text-muted-foreground/60 font-label">or</span>
            <div className="flex-1 h-px bg-border/40" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name" className="font-label text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Name
                </Label>
                <Input
                  id="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={!isLogin}
                  className="bg-background/40 border-border/50 focus:border-primary/60 focus:ring-primary/20 h-11 text-foreground placeholder:text-muted-foreground/50"
                  data-testid="input-name"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="font-label text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-background/40 border-border/50 focus:border-primary/60 focus:ring-primary/20 h-11 text-foreground placeholder:text-muted-foreground/50"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="font-label text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Password
                </Label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-xs text-muted-foreground/60 hover:text-primary transition-colors font-label"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-background/40 border-border/50 focus:border-primary/60 focus:ring-primary/20 h-11 text-foreground placeholder:text-muted-foreground/50"
                data-testid="input-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              data-testid="button-submit"
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-label font-semibold text-sm tracking-wide hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="border-t border-border/30" />

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-muted-foreground hover:text-primary transition-colors font-label"
              data-testid="button-toggle-auth"
            >
              {isLogin
                ? "Don't have an account? Create one"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground/50 font-label">
          Your operators. Your data. Always.
        </p>
      </div>
    </div>
  );
}
