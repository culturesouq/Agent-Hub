import { useState } from "react";
import { Link, useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const token = new URLSearchParams(window.location.search).get("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 12) {
      toast({ title: "Password must be at least 12 characters", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      setDone(true);
      setTimeout(() => setLocation("/login"), 2500);
    } catch (err: any) {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

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
            Reset password
          </h1>
          <p className="text-muted-foreground text-sm">
            Choose a new password for your account
          </p>
        </div>

        <div className="glass-panel neon-glow-primary rounded-2xl border border-border/40 p-8">
          {!token ? (
            <p className="text-center text-sm text-destructive font-label">
              Invalid or missing reset token. Please request a new password reset link.
            </p>
          ) : done ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <p className="font-label font-semibold text-foreground">Password reset!</p>
              <p className="text-sm text-muted-foreground">Redirecting you to sign in…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="new-password" className="font-label text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  New Password
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="At least 12 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="bg-background/40 border-border/50 focus:border-primary/60 h-11 text-foreground placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="font-label text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Confirm Password
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Repeat new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="bg-background/40 border-border/50 focus:border-primary/60 h-11 text-foreground placeholder:text-muted-foreground/50"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-label font-semibold text-sm tracking-wide hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? "Resetting…" : "Set new password"}
              </button>
            </form>
          )}
        </div>

        <div className="text-center">
          <Link href="/login">
            <span className="text-sm text-muted-foreground hover:text-primary transition-colors font-label cursor-pointer">
              ← Back to sign in
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
