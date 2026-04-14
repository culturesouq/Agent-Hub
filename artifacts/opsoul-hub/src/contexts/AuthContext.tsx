import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Owner } from "@/types";
import { useToast } from "@/hooks/use-toast";

interface AuthContextType {
  owner: Owner | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshOwner: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function decodeJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("opsoul_token"));
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleProactiveRefresh = (currentToken: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const expiresAt = decodeJwtExp(currentToken);
    if (!expiresAt) return;
    const refreshAt = expiresAt - 3 * 60 * 1000;
    const delay = refreshAt - Date.now();
    if (delay <= 0) return;
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const newToken = data.accessToken as string;
          localStorage.setItem("opsoul_token", newToken);
          setToken(newToken);
        }
      } catch { }
    }, delay);
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      setToken(null);
      setOwner(null);
      setLocation("/login");
    };
    const handleTokenRefreshed = (e: Event) => {
      const newToken = (e as CustomEvent<{ token: string }>).detail.token;
      setToken(newToken);
    };

    window.addEventListener("auth-unauthorized", handleUnauthorized);
    window.addEventListener("auth-token-refreshed", handleTokenRefreshed);
    return () => {
      window.removeEventListener("auth-unauthorized", handleUnauthorized);
      window.removeEventListener("auth-token-refreshed", handleTokenRefreshed);
    };
  }, [setLocation]);

  useEffect(() => {
    async function loadUser() {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const data = await apiFetch<Owner>("/auth/me");
        setOwner(data);
        scheduleProactiveRefresh(token);
      } catch (err) {
        console.error("Failed to load user", err);
        setToken(null);
        setOwner(null);
        localStorage.removeItem("opsoul_token");
      } finally {
        setIsLoading(false);
      }
    }
    loadUser();
  }, [token]);

  useEffect(() => {
    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const data = await apiFetch<{ accessToken: string; owner: Owner }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("opsoul_token", data.accessToken);
      setToken(data.accessToken);
      setOwner(data.owner);
      scheduleProactiveRefresh(data.accessToken);
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
      throw err;
    }
  };

  const register = async (email: string, password: string, name: string) => {
    try {
      const data = await apiFetch<{ accessToken: string; owner: Owner }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, name }),
      });
      localStorage.setItem("opsoul_token", data.accessToken);
      setToken(data.accessToken);
      setOwner(data.owner);
      scheduleProactiveRefresh(data.accessToken);
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
      throw err;
    }
  };

  const logout = () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    localStorage.removeItem("opsoul_token");
    setToken(null);
    setOwner(null);
    setLocation("/login");
  };

  const refreshOwner = async () => {
    try {
      const data = await apiFetch<Owner>("/auth/me");
      setOwner(data);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ owner, token, isLoading, login, register, logout, refreshOwner }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
