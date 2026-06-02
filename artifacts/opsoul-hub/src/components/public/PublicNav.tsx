import { Link, useLocation } from "wouter";

export default function PublicNav() {
  const [location] = useLocation();

  // Dark-theme nav for public-facing pages. Sharp, high contrast,
  // single violet accent. No frosted glass, no fading.
  const onLanding = location === "/";

  function navClass(href: string) {
    const isActive = location === href || (href !== "/" && location.startsWith(href));
    return [
      "font-mono uppercase tracking-widest text-[11px] transition-colors",
      isActive ? "text-violet-400" : "text-white/60 hover:text-white",
    ].join(" ");
  }

  return (
    <nav className={`fixed top-0 w-full z-50 ${onLanding ? "bg-black/80 backdrop-blur-md" : "bg-black"} border-b border-white/10`}>
      <div className="flex justify-between items-center w-full px-6 md:px-10 lg:px-16 py-4 mx-auto max-w-[1600px]">
        <div className="flex items-center gap-10">
          <Link href="/">
            <span className="flex items-center gap-2 cursor-pointer">
              <img src="/logo.gif" alt="OpSoul" className="h-7 w-auto" />
              <span className="font-headline font-bold text-white text-lg tracking-tight hidden md:inline">OpSoul</span>
            </span>
          </Link>
          <div className="hidden md:flex gap-8 items-center ml-4">
            <Link href="/pricing" className={navClass("/pricing")}>Access</Link>
            <Link href="/docs" className={navClass("/docs")}>Docs</Link>
            <Link href="/support" className={navClass("/support")}>Support</Link>
            <Link href="/contact" className={navClass("/contact")}>Contact</Link>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <a
            href="/console"
            className="inline-flex items-center gap-2 bg-violet-500 hover:bg-violet-400 text-black px-6 py-2.5 font-mono uppercase tracking-widest text-[10px] font-bold transition-colors"
          >
            Console
          </a>
        </div>
      </div>
    </nav>
  );
}
