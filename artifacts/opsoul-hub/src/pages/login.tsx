import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

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
      // Error handled in context with toast
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen dot-grid flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-8">
        {/* Brand */}
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

        {/* Glass card */}
        <div className="glass-panel neon-glow-primary rounded-2xl border border-border/40 p-8 space-y-6">
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
              <Label htmlFor="password" className="font-label text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Password
              </Label>
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
