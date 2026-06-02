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
      className={`min-h-screen bg-black text-white selection:bg-violet-500 selection:text-black relative overflow-hidden ${className}`}
    >
      <PublicNav />
      {children}
      <PublicFooter />
    </div>
  );
}
