import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("opsoul_token"));
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null);
      setOwner(null);
      setLocation("/login");
    };

    window.addEventListener("auth-unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth-unauthorized", handleUnauthorized);
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

  const login = async (email: string, password: string) => {
    try {
      const data = await apiFetch<{ accessToken: string; owner: Owner }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("opsoul_token", data.accessToken);
      setToken(data.accessToken);
      setOwner(data.owner);
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
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
      throw err;
    }
  };

  const logout = () => {
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
