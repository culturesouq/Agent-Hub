import { Link } from "wouter";

// Minimal dark nav. Just brand + Contact + Console.
// Pricing/Docs/Support removed entirely per owner directive 2026-06-02.
export default function PublicNav() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-black/85 backdrop-blur-md border-b border-white/5">
      <div className="flex justify-between items-center w-full px-6 md:px-10 lg:px-14 py-4 mx-auto max-w-6xl">
        <Link href="/">
          <span className="flex items-center gap-2.5 cursor-pointer">
            <img src="/logo.gif" alt="OpSoul" className="h-7 w-auto" />
            <span className="font-headline font-bold text-white text-lg tracking-tight">OpSoul</span>
          </span>
        </Link>
        <div className="flex items-center gap-8">
          <Link
            href="/contact"
            className="font-sans text-sm text-white/70 hover:text-violet-400 transition-colors"
          >
            Contact
          </Link>
          <a
            href="/console"
            className="inline-flex items-center bg-violet-500 hover:bg-violet-400 text-black px-5 py-2 rounded-full font-sans text-sm font-medium transition-colors"
          >
            Console
          </a>
        </div>
      </div>
    </nav>
  );
}
