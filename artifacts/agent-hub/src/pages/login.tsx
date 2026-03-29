import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TerminalSquare, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";

export default function Login() {
  const [password, setPassword] = useState("");
  const { login, isLoggingIn, loginError } = useAuth();
  const { t, dir } = useI18n();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    await login({ data: { password } });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden" dir={dir}>
      {/* Background Image */}
      <div className="absolute inset-0 z-0 opacity-30 mix-blend-screen">
        <img 
          src={`${import.meta.env.BASE_URL}images/login-bg.png`} 
          alt="Command Center Background" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="glass-panel rounded-2xl p-8 shadow-2xl shadow-primary/10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 border border-primary/20 shadow-[0_0_15px_rgba(0,190,255,0.2)]">
              <TerminalSquare className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-display font-bold tracking-wider text-white">
              AGENT<span className="text-primary">HUB</span>
            </h1>
            <p className="text-muted-foreground mt-2 font-mono text-sm tracking-widest uppercase">
              {t('login')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <div className="relative group">
                <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <Input
                  type="password"
                  placeholder={t('enterPassword')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="ps-10 h-12 bg-black/50 border-white/10 focus:border-primary/50 focus:ring-primary/20 text-lg tracking-widest font-mono rounded-xl transition-all"
                />
              </div>
              {loginError && (
                <p className="text-sm text-destructive font-mono flex items-center mt-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive me-2 animate-pulse" />
                  Access Denied. Invalid Authorization Code.
                </p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-lg font-bold tracking-wider glow-effect overflow-hidden rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
              disabled={isLoggingIn || !password}
            >
              {isLoggingIn ? "VERIFYING..." : t('authenticate')}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
