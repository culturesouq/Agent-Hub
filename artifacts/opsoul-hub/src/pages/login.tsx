import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";

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
    } catch (err) {
      // Error handled in context with toast
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-2xl shadow-primary/10">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/30">
              <Activity className="w-6 h-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl tracking-tight font-bold">OpSoul Command</CardTitle>
          <CardDescription>
            {isLogin ? "Authenticate to access sovereign operations" : "Initialize new sovereign admin"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name">Designation</Label>
                <Input
                  id="name"
                  placeholder="Admin designation"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={!isLogin}
                  className="font-mono"
                  data-testid="input-name"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Access ID</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@opsoul.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="font-mono"
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Passphrase</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="font-mono"
                data-testid="input-password"
              />
            </div>
            <Button type="submit" className="w-full font-bold tracking-widest uppercase" disabled={loading} data-testid="button-submit">
              {loading ? "Authenticating..." : isLogin ? "Initialize Session" : "Create Admin"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-muted-foreground hover:text-primary transition-colors"
              data-testid="button-toggle-auth"
            >
              {isLogin ? "Request new admin authorization" : "Return to existing session"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
