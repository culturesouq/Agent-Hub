
// Minimal cozy footer. Just © + Contact. Privacy/Terms kept for legal
// but only linked here, never in nav.
export default function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full bg-stone-50 border-t border-stone-200/60 py-10 px-6 md:px-10 lg:px-14">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 w-full max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <img src="/logo.gif" alt="OpSoul" className="h-5 w-auto opacity-80" />
          <span className="font-sans text-sm text-stone-500">© {year} OpSoul</span>
        </div>
        <div className="flex gap-6 flex-wrap justify-center">
          <a className="font-sans text-sm text-stone-500 hover:text-violet-700 transition-colors" href="/contact">Contact</a>
          <a className="font-sans text-sm text-stone-500 hover:text-violet-700 transition-colors" href="/privacy">Privacy</a>
          <a className="font-sans text-sm text-stone-500 hover:text-violet-700 transition-colors" href="/terms">Terms</a>
        </div>
      </div>
    </footer>
  );
}
