import { ReactNode } from "react";
import PublicNav from "@/components/public/PublicNav";
import PublicFooter from "@/components/public/PublicFooter";
import NebulaBlobs from "@/components/ui/NebulaBlobs";

interface PublicLayoutProps {
  children: ReactNode;
  className?: string;
}

export default function PublicLayout({ children, className = "" }: PublicLayoutProps) {
  return (
    <div
      className={`min-h-screen bg-background text-on-surface selection:bg-primary-container selection:text-on-primary-container relative overflow-hidden ${className}`}
    >
      <NebulaBlobs />
      <div className="fixed inset-0 dot-grid opacity-20 pointer-events-none z-0" />
      <div className="fixed inset-0 bg-gradient-to-b from-transparent via-transparent to-background pointer-events-none z-0" />
      <PublicNav />
      {children}
      <PublicFooter />
    </div>
  );
}
