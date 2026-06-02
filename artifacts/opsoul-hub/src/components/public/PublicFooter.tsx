
export default function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full bg-black border-t border-white/10 py-12 px-6 md:px-10 lg:px-16">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 w-full max-w-[1600px] mx-auto">
        <div className="flex flex-col items-center md:items-start gap-2">
          <span className="flex items-center gap-2">
            <img src="/logo.gif" alt="OpSoul" className="h-6 w-auto opacity-80 hover:opacity-100 transition-opacity" />
            <span className="font-headline font-bold text-white text-base tracking-tight hidden md:inline">OpSoul</span>
          </span>
          <p className="text-white/40 font-mono uppercase tracking-widest text-[10px]">
            © {year} OpSoul. All rights reserved.
          </p>
        </div>
        <div className="flex gap-8 flex-wrap justify-center">
          <a className="text-white/50 hover:text-violet-400 font-mono uppercase tracking-widest text-[10px] transition-colors" href="/docs">Documentation</a>
          <a className="text-white/50 hover:text-violet-400 font-mono uppercase tracking-widest text-[10px] transition-colors" href="/pricing">Access</a>
          <a className="text-white/50 hover:text-violet-400 font-mono uppercase tracking-widest text-[10px] transition-colors" href="/support">Support</a>
          <a className="text-white/50 hover:text-violet-400 font-mono uppercase tracking-widest text-[10px] transition-colors" href="/contact">Contact</a>
          <a className="text-white/50 hover:text-violet-400 font-mono uppercase tracking-widest text-[10px] transition-colors" href="/privacy">Privacy</a>
          <a className="text-white/50 hover:text-violet-400 font-mono uppercase tracking-widest text-[10px] transition-colors" href="/terms">Terms</a>
        </div>
        <div className="flex items-center gap-2 text-violet-400/70">
          <span className="block w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(168,85,247,0.6)]" />
          <span className="font-mono uppercase tracking-widest text-[10px]">Sovereign</span>
        </div>
      </div>
    </footer>
  );
}
