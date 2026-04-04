export default function PublicFooter() {
  return (
    <footer className="w-full py-12 px-8 bg-slate-950 bg-gradient-to-t from-slate-900 to-transparent border-t border-outline-variant/10">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 w-full max-w-7xl mx-auto">
        <div className="flex flex-col items-center md:items-start gap-2">
          <span className="text-lg font-black text-primary font-headline uppercase tracking-tighter">OpSoul</span>
          <p className="text-slate-500 font-label uppercase tracking-widest text-[10px]">
            © 2024 OpSoul Command. All systems operational.
          </p>
        </div>
        <div className="flex gap-8">
          <a className="text-slate-500 hover:text-secondary font-label uppercase tracking-widest text-[10px] hover:translate-x-1 transition-transform" href="#">Terminal</a>
          <a className="text-slate-500 hover:text-secondary font-label uppercase tracking-widest text-[10px] hover:translate-x-1 transition-transform" href="/docs">Documentation</a>
          <a className="text-slate-500 hover:text-secondary font-label uppercase tracking-widest text-[10px] hover:translate-x-1 transition-transform" href="#">Governance</a>
          <a className="text-slate-500 hover:text-secondary font-label uppercase tracking-widest text-[10px] hover:translate-x-1 transition-transform" href="#">Security</a>
        </div>
        <div className="flex items-center gap-3 text-secondary opacity-70 hover:opacity-100 transition-opacity">
          <span className="material-symbols-outlined text-sm select-none">shield</span>
          <span className="font-label uppercase tracking-widest text-[10px]">Verified Protocol</span>
        </div>
      </div>
    </footer>
  );
}
