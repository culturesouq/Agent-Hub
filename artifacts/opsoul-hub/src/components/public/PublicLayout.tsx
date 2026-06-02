import { ReactNode } from "react";
import PublicNav from "@/components/public/PublicNav";
import PublicFooter from "@/components/public/PublicFooter";


interface PublicLayoutProps {
  children: ReactNode;
  className?: string;
}

export default function PublicLayout({ children, className = "" }: PublicLayoutProps) {
  return (
    <div
      className={`min-h-screen bg-stone-50 text-stone-900 selection:bg-violet-600 selection:text-white antialiased ${className}`}
    >
      <PublicNav />
      {children}
      <PublicFooter />
    </div>
  );
}
