
// Minimal dark footer. © + Contact + Privacy + Terms.
export default function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full bg-black border-t border-white/5 py-10 px-6 md:px-10 lg:px-14">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 w-full max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <img src="/logo.gif" alt="OpSoul" className="h-5 w-auto opacity-70" />
          <span className="font-sans text-sm text-white/40">© {year} OpSoul</span>
        </div>
        <div className="flex gap-6 flex-wrap justify-center">
          <a className="font-sans text-sm text-white/40 hover:text-violet-400 transition-colors" href="/contact">Contact</a>
          <a className="font-sans text-sm text-white/40 hover:text-violet-400 transition-colors" href="/privacy">Privacy</a>
          <a className="font-sans text-sm text-white/40 hover:text-violet-400 transition-colors" href="/terms">Terms</a>
        </div>
      </div>
    </footer>
  );
}
