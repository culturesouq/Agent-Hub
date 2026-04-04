import { useState } from "react";
import { Link } from "wouter";

export default function PublicNav() {
  const [logoError, setLogoError] = useState(false);

  return (
    <nav className="fixed top-0 w-full z-50 frosted-nav">
      <div className="flex justify-between items-center w-full px-6 md:px-8 py-4 mx-auto max-w-screen-2xl">
        <div className="flex items-center gap-8">
          <Link href="/">
            <span className="flex items-center gap-2 cursor-pointer">
              {logoError ? (
                <span className="text-2xl font-bold tracking-tighter text-primary font-headline">
                  OpSoul
                </span>
              ) : (
                <img
                  src="/logo.svg"
                  alt="OpSoul"
                  className="h-7 w-auto"
                  onError={() => setLogoError(true)}
                />
              )}
            </span>
          </Link>
          <div className="hidden md:flex gap-8 items-center ml-4">
            <Link href="/pricing" className="text-on-surface-variant hover:text-primary transition-colors font-label uppercase tracking-widest text-[10px]">
              Pricing
            </Link>
            <Link href="/docs" className="text-on-surface-variant hover:text-primary transition-colors font-label uppercase tracking-widest text-[10px]">
              Docs
            </Link>
            <Link href="/support" className="text-on-surface-variant hover:text-primary transition-colors font-label uppercase tracking-widest text-[10px]">
              Support
            </Link>
            <Link href="/contact" className="text-on-surface-variant hover:text-primary transition-colors font-label uppercase tracking-widest text-[10px]">
              Contact
            </Link>
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
