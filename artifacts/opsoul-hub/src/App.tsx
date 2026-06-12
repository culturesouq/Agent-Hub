import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Component, ErrorInfo, ReactNode, useState, useEffect } from "react";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[ErrorBoundary]", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 gap-4">
          <div className="text-destructive font-mono text-sm font-bold">Something went wrong</div>
          <div className="text-muted-foreground font-mono text-xs text-center max-w-sm">
            {(this.state.error as Error).message || "An unexpected error occurred. Please refresh the page."}
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-mono hover:opacity-90 transition-opacity"
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/Dashboard";
import OperatorDetail from "@/pages/OperatorDetail";
import LandingPage from "@/pages/LandingPage";
import ContactPage from "@/pages/ContactPage";
import AdminPage from "@/pages/AdminPage";
import PrivacyPage from "@/pages/PrivacyPage";
import TermsPage from "@/pages/TermsPage";
import GoogleCallback from "@/pages/GoogleCallback";
import ResetPassword from "@/pages/ResetPassword";
import Setup from "@/pages/Setup";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-primary font-mono tracking-widest">
        Loading...
      </div>
    );
  }

  if (!token) {
    window.location.href = "/login";
    return null;
  }

  return <Component {...rest} />;
}

function RootRoute() {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-primary font-mono tracking-widest">
        Loading...
      </div>
    );
  }

  if (token) {
    return <Dashboard />;
  }

  return <LandingPage />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRoute} />
      <Route path="/login" component={Login} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/auth/google/success" component={GoogleCallback} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/operators/:id">
        {(params) => <ProtectedRoute component={OperatorDetail} {...params} />}
      </Route>
      <Route path="/admin">
        {() => <ProtectedRoute component={AdminPage} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function SetupGate({ children }: { children: ReactNode }) {
  // "idle" = not yet checked; "checking" = fetch in flight;
  // "needed" = no owner exists; "done" = owner exists (normal flow)
  const [setupState, setSetupState] = useState<"idle" | "checking" | "needed" | "done">("idle");

  useEffect(() => {
    setSetupState("checking");
    fetch("/api/setup/status")
      .then((res) => res.json())
      .then((data: { setupRequired?: boolean }) => {
        setSetupState(data.setupRequired ? "needed" : "done");
      })
      .catch(() => {
        // If the check fails (network error, server down) fall through to normal flow
        setSetupState("done");
      });
  }, []);

  if (setupState === "idle" || setupState === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-primary font-mono tracking-widest">
        Loading...
      </div>
    );
  }

  if (setupState === "needed") {
    return <Setup onComplete={() => setSetupState("done")} />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <SetupGate>
              <AuthProvider>
                <Router />
              </AuthProvider>
            </SetupGate>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
