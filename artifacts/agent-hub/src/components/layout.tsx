import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { Activity, LayoutDashboard, LogOut, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  const { t, language, setLanguage, dir } = useI18n();
  const [location] = useLocation();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background" dir={dir}>
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4 space-x-reverse">
            <TerminalSquare className="w-8 h-8 text-primary" />
            <h1 className="text-xl font-display font-bold tracking-wider text-white">
              AGENT<span className="text-primary">HUB</span>
            </h1>
          </div>
          
          <nav className="flex items-center space-x-2 space-x-reverse">
            <Link 
              href="/" 
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-white/5 ${location === '/' ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
            >
              {t('dashboard')}
            </Link>
            
            <div className="h-6 w-px bg-white/10 mx-2" />
            
            <Button variant="ghost" size="sm" onClick={toggleLanguage} className="font-mono">
              {language === 'en' ? 'عربي' : 'EN'}
            </Button>
            
            <Button variant="ghost" size="sm" onClick={() => logout()} className="text-muted-foreground hover:text-destructive">
              <LogOut className="w-4 h-4 me-2" />
              {t('logout')}
            </Button>
          </nav>
        </div>
      </header>
      
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
      
      <footer className="border-t border-white/5 py-6 text-center text-xs text-muted-foreground font-mono">
        SYSTEM SECURE • ENCRYPTED CONNECTION ESTABLISHED
      </footer>
    </div>
  );
}
