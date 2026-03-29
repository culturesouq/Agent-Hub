import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { LogOut, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: React.ReactNode;
  noPadding?: boolean;
}

export function Layout({ children, noPadding }: LayoutProps) {
  const { logout } = useAuth();
  const { t, language, setLanguage, dir } = useI18n();
  const [location] = useLocation();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  return (
    <div
      className={`flex flex-col bg-background ${noPadding ? 'h-screen overflow-hidden' : 'min-h-screen'}`}
      dir={dir}
    >
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/90 backdrop-blur-md shrink-0">
        <div className="px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TerminalSquare className="w-7 h-7 text-primary" />
            <Link href="/">
              <span className="text-lg font-display font-bold tracking-wider text-white cursor-pointer">
                AGENT<span className="text-primary">HUB</span>
              </span>
            </Link>
          </div>

          <nav className="flex items-center gap-1">
            {location !== '/' && (
              <Link
                href="/"
                className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-white transition-colors"
              >
                {t('dashboard')}
              </Link>
            )}

            <div className="h-5 w-px bg-white/10 mx-1" />

            <Button variant="ghost" size="sm" onClick={toggleLanguage} className="font-mono text-xs text-muted-foreground">
              {language === 'en' ? 'عربي' : 'EN'}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout()}
              className="text-muted-foreground hover:text-destructive text-xs"
            >
              <LogOut className="w-3.5 h-3.5 me-1.5" />
              {t('logout')}
            </Button>
          </nav>
        </div>
      </header>

      <main className={noPadding ? 'flex-1 flex overflow-hidden' : 'flex-1 container mx-auto px-4 py-8'}>
        {children}
      </main>

      {!noPadding && (
        <footer className="border-t border-white/5 py-4 text-center text-xs text-muted-foreground font-mono">
          AGENT HUB • SECURE CONNECTION
        </footer>
      )}
    </div>
  );
}
