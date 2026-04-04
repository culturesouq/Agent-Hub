import { useState, useRef } from "react";
import PublicNav from "@/components/public/PublicNav";
import PublicFooter from "@/components/public/PublicFooter";
import NebulaBlobs from "@/components/ui/NebulaBlobs";
import { apiFetch } from "@/lib/api";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLSelectElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await apiFetch("/contact", {
        method: "POST",
        body: JSON.stringify({
          name: nameRef.current?.value ?? "",
          email: emailRef.current?.value ?? "",
          subject: subjectRef.current?.value ?? "General Inquiry",
          message: messageRef.current?.value ?? "",
        }),
      });
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to transmit. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-on-surface selection:bg-primary/30 selection:text-primary relative overflow-hidden">
      <NebulaBlobs />
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{ backgroundImage: "radial-gradient(rgba(224,182,255,0.03) 1px, transparent 0)", backgroundSize: "24px 24px" }}
      />

      <PublicNav />

      <main className="relative z-10 pt-32 pb-24 px-6 md:px-12 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left header */}
        <header className="lg:col-span-5 flex flex-col justify-start">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_10px_#8cd4c3]" />
            <span className="font-label uppercase tracking-[0.2em] text-[10px] text-secondary font-semibold">Communications Protocol</span>
          </div>
          <h1 className="font-headline text-7xl md:text-8xl font-bold tracking-tighter text-primary leading-[0.9] mb-6">
            Talk to us
          </h1>
          <p className="font-sans text-xl text-on-surface-variant max-w-md leading-relaxed mb-12">
            We respond within 24 hours. Connect with our architects and operators to scale your digital infrastructure.
          </p>
          <div className="space-y-8">
            <div className="group cursor-pointer">
              <div className="font-label uppercase tracking-widest text-[10px] text-slate-500 mb-2">Direct Channel</div>
              <div className="flex items-center gap-4 text-primary text-xl font-medium group-hover:translate-x-2 transition-transform duration-300">
                <span>hello@opsoul.command</span>
                <span className="material-symbols-outlined text-lg select-none">arrow_forward</span>
              </div>
            </div>
            <div className="group cursor-pointer">
              <div className="font-label uppercase tracking-widest text-[10px] text-slate-500 mb-2">Enterprise Solutions</div>
              <div className="flex items-center gap-4 text-secondary text-xl font-medium group-hover:translate-x-2 transition-transform duration-300">
                <span>Book an Architecture Review</span>
                <span className="material-symbols-outlined text-lg select-none">calendar_today</span>
              </div>
            </div>
          </div>
          <div className="mt-auto pt-24 hidden lg:block">
            <div className="flex items-center gap-4 opacity-40">
              <div className="h-px w-12 bg-outline-variant" />
              <p className="font-label uppercase tracking-widest text-[10px] text-on-surface-variant">
                Based in the UAE. Built for the world.
              </p>
            </div>
          </div>
        </header>

        {/* Form */}
        <section className="lg:col-span-7">
          <div className="glass-panel p-8 md:p-12 shadow-[0_0_80px_rgba(0,0,0,0.5)] relative overflow-hidden rounded-xl">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 blur-[100px] rounded-full" />
            {submitted ? (
              <div className="relative z-10 flex flex-col items-center justify-center py-20 gap-6">
                <span className="material-symbols-outlined text-6xl text-primary select-none">check_circle</span>
                <h3 className="font-headline text-3xl text-on-surface">Signal Transmitted</h3>
                <p className="text-on-surface-variant font-sans text-center max-w-md">
                  Your message has been received. Our architects will respond within 24 hours.
                </p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="mt-4 text-[10px] font-label uppercase tracking-widest text-primary border border-primary/30 px-8 py-3 hover:bg-primary/10 transition-all"
                >
                  Send Another
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="font-label uppercase tracking-widest text-[10px] text-on-surface-variant ml-1 block">Full Name</label>
                    <input
                      ref={nameRef}
                      className="w-full bg-surface-container-highest border-none outline-none focus:ring-1 focus:ring-primary/50 text-on-surface placeholder:text-slate-600 px-4 py-4 transition-all font-sans rounded-sm"
                      placeholder="OPERATOR NAME"
                      type="text"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-label uppercase tracking-widest text-[10px] text-on-surface-variant ml-1 block">Email Address</label>
                    <input
                      ref={emailRef}
                      className="w-full bg-surface-container-highest border-none outline-none focus:ring-1 focus:ring-primary/50 text-on-surface placeholder:text-slate-600 px-4 py-4 transition-all font-sans rounded-sm"
                      placeholder="ADDRESS@PROTOCOL.COM"
                      type="email"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="font-label uppercase tracking-widest text-[10px] text-on-surface-variant ml-1 block">Transmission Subject</label>
                  <select
                    ref={subjectRef}
                    className="w-full bg-surface-container-highest border-none outline-none focus:ring-1 focus:ring-primary/50 text-on-surface px-4 py-4 appearance-none cursor-pointer font-sans rounded-sm"
                  >
                    <option>General Inquiry</option>
                    <option>Sales Engineering</option>
                    <option>Enterprise Deployment</option>
                    <option>Press &amp; Media</option>
                    <option>Strategic Partnership</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="font-label uppercase tracking-widest text-[10px] text-on-surface-variant ml-1 block">Message Body</label>
                  <textarea
                    ref={messageRef}
                    className="w-full bg-surface-container-highest border-none outline-none focus:ring-1 focus:ring-primary/50 text-on-surface placeholder:text-slate-600 px-4 py-4 transition-all resize-none font-sans rounded-sm"
                    placeholder="ENCODE YOUR MESSAGE HERE..."
                    rows={5}
                    required
                  />
                </div>
                {error && (
                  <p className="text-destructive font-label text-[10px] uppercase tracking-widest">{error}</p>
                )}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full md:w-auto bg-primary text-on-primary font-label uppercase tracking-[0.2em] font-bold px-12 py-5 hover:bg-primary/90 transition-all group flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "Transmitting..." : "Transmit Signal"}
                    <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform select-none">send</span>
                  </button>
                </div>
              </form>
            )}
          </div>
          <div className="lg:hidden mt-12 flex justify-center items-center gap-4 opacity-40">
            <p className="font-label uppercase tracking-widest text-[10px] text-on-surface-variant text-center">
              Based in the UAE. Built for the world.
            </p>
          </div>
        </section>
      </main>

      {/* Side decoration */}
      <div className="fixed right-8 bottom-32 hidden xl:flex flex-col items-center gap-6 pointer-events-none">
        <div className="h-32 w-px bg-gradient-to-b from-transparent via-outline-variant to-transparent" />
        <span className="font-label uppercase tracking-[0.5em] text-[8px] text-slate-500 whitespace-nowrap" style={{ writingMode: "vertical-lr" }}>
          SIGNAL STRENGTH : OPTIMAL
        </span>
        <div className="w-1 h-1 rounded-full bg-secondary animate-pulse" />
      </div>

      <PublicFooter />
    </div>
  );
}
