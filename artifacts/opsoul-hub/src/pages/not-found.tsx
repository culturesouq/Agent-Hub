import { Link } from "wouter";
import NebulaBlobs from "@/components/ui/NebulaBlobs";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-on-surface flex items-center justify-center relative overflow-hidden">
      <NebulaBlobs />
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{ backgroundImage: "radial-gradient(rgba(224,182,255,0.03) 1px, transparent 0)", backgroundSize: "24px 24px" }}
      />

      <div className="relative z-10 text-center px-6 max-w-xl">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_10px_#8cd4c3]" />
          <span className="font-label uppercase tracking-[0.2em] text-[10px] text-secondary font-semibold">
            Navigation Error — Signal Lost
          </span>
        </div>

        <h1 className="font-headline text-[10rem] leading-none font-black tracking-tighter text-primary mb-2"
          style={{ textShadow: "0 0 80px rgba(224,182,255,0.3)" }}>
          404
        </h1>

        <p className="font-headline text-2xl font-bold text-on-surface mb-4 tracking-tight">
          Sector Not Found
        </p>
        <p className="font-sans text-on-surface-variant text-base leading-relaxed mb-12 max-w-sm mx-auto">
          The coordinates you entered don't map to any known node in the OpSoul mesh. The sector may have been decommissioned or never deployed.
        </p>

        <Link href="/" className="mx-auto block w-fit">
          <div className="iridescent-border">
            <button className="bg-primary text-on-primary font-label uppercase tracking-[0.2em] font-bold px-10 py-4 hover:opacity-90 active:scale-95 transition-all group flex items-center gap-3">
              <span className="material-symbols-outlined text-sm group-hover:-translate-x-0.5 transition-transform select-none">arrow_back</span>
              Return to Base
            </button>
          </div>
        </Link>

        <div className="mt-16 flex items-center justify-center gap-4 opacity-30">
          <div className="h-px w-12 bg-outline-variant" />
          <span className="font-label uppercase tracking-widest text-[9px] text-on-surface-variant">
            ERR :: NODE_NOT_FOUND :: 0x404
          </span>
          <div className="h-px w-12 bg-outline-variant" />
        </div>
      </div>
    </div>
  );
}
