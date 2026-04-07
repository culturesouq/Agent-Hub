import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Component, ErrorInfo, ReactNode } from "react";

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
import PricingPage from "@/pages/PricingPage";
import SupportPage from "@/pages/SupportPage";
import DocsPage from "@/pages/DocsPage";
import ContactPage from "@/pages/ContactPage";
import AdminPage from "@/pages/AdminPage";
import PrivacyPage from "@/pages/PrivacyPage";
import TermsPage from "@/pages/TermsPage";
import GoogleCallback from "@/pages/GoogleCallback";
import ResetPassword from "@/pages/ResetPassword";

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
      <Route path="/pricing" component={PricingPage} />
      <Route path="/support" component={SupportPage} />
      <Route path="/docs" component={DocsPage} />
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

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
