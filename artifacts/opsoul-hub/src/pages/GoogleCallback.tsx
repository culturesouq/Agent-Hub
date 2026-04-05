import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { Owner } from "@/types";
import { Loader2 } from "lucide-react";

export default function GoogleCallback() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    async function finish() {
      try {
        const data = await apiFetch<{ accessToken: string; owner: Owner }>("/auth/refresh", {
          method: "POST",
        });
        localStorage.setItem("opsoul_token", data.accessToken);
        window.location.href = "/";
      } catch {
        window.location.href = "/login?error=google_failed";
      }
    }

    finish();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground font-mono text-sm">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span>Signing you in…</span>
      </div>
    </div>
  );
}
