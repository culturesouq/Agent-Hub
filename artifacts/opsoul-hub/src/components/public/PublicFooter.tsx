import { useState } from "react";

export default function PublicFooter() {
  const year = new Date().getFullYear();
  const [logoError, setLogoError] = useState(false);

  return (
    <footer className="w-full py-12 px-6 md:px-8 bg-background border-t border-outline-variant/10">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 w-full max-w-7xl mx-auto">
        <div className="flex flex-col items-center md:items-start gap-2">
          <span className="flex items-center gap-2">
            {logoError ? (
              <span className="text-lg font-black text-primary font-headline uppercase tracking-tighter">
                OpSoul
              </span>
            ) : (
              <img
                src="/logo.svg"
                alt="OpSoul"
                className="h-6 w-auto opacity-80 hover:opacity-100 transition-opacity"
                onError={() => setLogoError(true)}
              />
            )}
          </span>
          <p className="text-on-surface-variant font-label uppercase tracking-widest text-[10px]">
            © {year} OpSoul. All rights reserved.
          </p>
        </div>
        <div className="flex gap-8">
          <a className="text-on-surface-variant hover:text-secondary font-label uppercase tracking-widest text-[10px] hover:translate-x-1 transition-transform" href="/docs">
            Documentation
          </a>
          <a className="text-on-surface-variant hover:text-secondary font-label uppercase tracking-widest text-[10px] hover:translate-x-1 transition-transform" href="/pricing">
            Pricing
          </a>
          <a className="text-on-surface-variant hover:text-secondary font-label uppercase tracking-widest text-[10px] hover:translate-x-1 transition-transform" href="/support">
            Support
          </a>
          <a className="text-on-surface-variant hover:text-secondary font-label uppercase tracking-widest text-[10px] hover:translate-x-1 transition-transform" href="/contact">
            Contact
          </a>
        </div>
        <div className="flex items-center gap-3 text-secondary opacity-60 hover:opacity-100 transition-opacity">
          <span className="material-symbols-outlined text-sm select-none">verified_user</span>
          <span className="font-label uppercase tracking-widest text-[10px]">Privacy Protected</span>
        </div>
      </div>
    </footer>
  );
}
