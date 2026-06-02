import { Link } from "wouter";

// Minimal cozy nav. Just brand + Contact + Console.
// No Pricing, no Docs, no Support per owner directive 2026-06-02.
export default function PublicNav() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-stone-50/85 backdrop-blur-md border-b border-stone-200/60">
      <div className="flex justify-between items-center w-full px-6 md:px-10 lg:px-14 py-4 mx-auto max-w-6xl">
        <Link href="/">
          <span className="flex items-center gap-2.5 cursor-pointer">
            <img src="/logo.gif" alt="OpSoul" className="h-7 w-auto" />
            <span className="font-headline font-bold text-stone-900 text-lg tracking-tight">OpSoul</span>
          </span>
        </Link>
        <div className="flex items-center gap-8">
          <Link
            href="/contact"
            className="font-sans text-sm text-stone-600 hover:text-violet-700 transition-colors"
          >
            Contact
          </Link>
          <a
            href="/console"
            className="inline-flex items-center bg-violet-700 hover:bg-violet-800 text-white px-5 py-2 rounded-full font-sans text-sm font-medium transition-colors"
          >
            Console
          </a>
        </div>
      </div>
    </nav>
  );
}
