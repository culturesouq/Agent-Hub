import { Link, useLocation } from "wouter";
import OpsoulLogo from "@/components/OpsoulLogo";

export default function PublicNav() {
  const [location] = useLocation();

  function navClass(href: string) {
    const isActive = location === href || (href !== "/" && location.startsWith(href));
    return [
      "font-label uppercase tracking-widest text-[10px] transition-colors",
      isActive ? "text-primary" : "text-on-surface-variant hover:text-primary",
    ].join(" ");
  }

  return (
    <nav className="fixed top-0 w-full z-50 frosted-nav">
      <div className="flex justify-between items-center w-full px-6 md:px-8 py-4 mx-auto max-w-screen-2xl">
        <div className="flex items-center gap-8">
          <Link href="/">
            <span className="flex items-center gap-2 cursor-pointer">
              <OpsoulLogo className="h-7 w-auto" />
            </span>
          </Link>
          <div className="hidden md:flex gap-8 items-center ml-4">
            <Link href="/pricing" className={navClass("/pricing")}>Pricing</Link>
            <Link href="/docs" className={navClass("/docs")}>Docs</Link>
            <Link href="/support" className={navClass("/support")}>Support</Link>
            <Link href="/contact" className={navClass("/contact")}>Contact</Link>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <a
            href="/login"
            className="bg-primary-container text-on-primary-container px-6 py-2 font-label uppercase tracking-widest text-[10px] font-bold hover:opacity-90 transition-all duration-300"
          >
            Get Started
          </a>
        </div>
      </div>
    </nav>
  );
}
