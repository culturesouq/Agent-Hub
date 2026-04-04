import PublicNav from "@/components/public/PublicNav";
import PublicFooter from "@/components/public/PublicFooter";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-on-surface selection:bg-primary-container selection:text-on-primary-container">
      <div className="fixed inset-0 dot-grid opacity-20 pointer-events-none z-0" />
      <div className="fixed inset-0 bg-gradient-to-b from-transparent via-transparent to-background pointer-events-none z-0" />

      <PublicNav />

      <main className="relative z-10 pt-32">
        {/* Hero */}
        <section className="px-8 max-w-7xl mx-auto mb-40 text-left lg:grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3 mb-6">
              <span className="status-beacon" />
              <span className="font-label uppercase tracking-[0.2em] text-[10px] text-secondary">System Online: v4.0.1</span>
            </div>
            <h1 className="headline-lg text-6xl md:text-8xl font-bold text-on-surface mb-8">
              Your Permanent <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-[#cfbcff] to-secondary">
                AI Operator
              </span>
            </h1>
            <p className="font-sans text-xl text-on-surface-variant max-w-xl mb-12 leading-relaxed">
              Stop teaching your AI from scratch every day. Build a memory-persistent Operator that grows with you, learns your workflow, and never forgets.
            </p>
            <div className="flex flex-wrap gap-6">
              <a href="/login" className="bg-primary-container text-on-primary-container px-10 py-5 font-label uppercase tracking-widest text-xs font-bold hover:opacity-90 transition-all">
                Get Started
              </a>
              <a href="/docs" className="border border-outline-variant/30 text-primary px-10 py-5 font-label uppercase tracking-widest text-xs font-bold hover:bg-white/5 transition-all">
                See How It Works
              </a>
            </div>
          </div>

          <div className="lg:col-span-5 hidden lg:block">
            <div className="relative aspect-square glass-panel rounded-full flex items-center justify-center p-8 overflow-hidden neon-glow-primary">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent" />
              <div className="w-full h-full rounded-full bg-gradient-to-br from-primary/20 via-[#6f389b]/30 to-secondary/10" />
              <div className="absolute inset-0 border-[0.5px] border-primary/20 rounded-full" />
            </div>
          </div>
        </section>

        {/* Problem Section */}
        <section className="py-32 bg-surface-container-low/30 px-8">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-20 items-center">
            <div className="order-2 lg:order-1">
              <div className="glass-panel p-12 rounded-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-destructive/40" />
                <h3 className="font-label uppercase tracking-widest text-destructive text-xs mb-6">The Systemic Failure</h3>
                <h2 className="font-headline text-4xl mb-8 text-on-surface">The Stateless Problem.</h2>
                <p className="text-on-surface-variant font-sans text-lg leading-relaxed mb-6">
                  Every modern AI model suffers from digital dementia. They are stateless entities that reboot every time you start a new chat. Your preferences, your context, and your hard-earned wisdom evaporate into the void.
                </p>
                <p className="text-on-surface-variant font-sans text-lg leading-relaxed">
                  OpSoul is the first persistent intelligence layer that lives beyond the prompt. We don't just process data; we archive experience.
                </p>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="flex flex-col gap-4">
                <div className="h-1 bg-surface-variant w-full rounded-full">
                  <div className="h-full bg-destructive w-1/3 shadow-[0_0_10px_rgba(255,180,171,0.5)]" />
                </div>
                <div className="flex justify-between font-label text-[10px] uppercase tracking-widest text-slate-500">
                  <span>Traditional LLM Memory</span>
                  <span>33% Retention</span>
                </div>
                <div className="mt-12 h-1 bg-surface-variant w-full rounded-full">
                  <div className="h-full bg-secondary w-full shadow-[0_0_10px_rgba(140,212,195,0.5)]" />
                </div>
                <div className="flex justify-between font-label text-[10px] uppercase tracking-widest text-secondary">
                  <span>OpSoul Persistent Core</span>
                  <span>100% Continuity</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Bento */}
        <section className="py-32 px-8 max-w-7xl mx-auto">
          <div className="mb-20">
            <h2 className="font-headline text-5xl mb-4 text-on-surface">Architected for Autonomy</h2>
            <p className="text-slate-400 font-sans">Engineered at the intersection of persistence and privacy.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: "psychology_alt", color: "text-primary", title: "Never Drifts", desc: "Maintains core objective alignment regardless of session duration or context switching." },
              { icon: "auto_awesome", color: "text-secondary", title: "Grows Autonomously", desc: "Extracts patterns from your successes and failures to refine its own execution logic." },
              { icon: "verified_user", color: "text-primary", title: "Verifies Its Own Knowledge", desc: "Cross-references internal long-term memory with real-time data to eliminate hallucinations." },
              { icon: "bolt", color: "text-secondary", title: "Acts Without Being Prompted", desc: "Proactive agency that identifies tasks based on your historical behavior and project goals." },
              { icon: "enhanced_encryption", color: "text-primary", title: "Completely Private", desc: "Your data memory is locally encrypted and zero-knowledge accessible. We never see your Operator." },
              { icon: "hub", color: "text-secondary", title: "Lives Across Channels", desc: "Unified memory across Slack, Discord, Email, and Terminal. One mind, many hands." },
            ].map((f) => (
              <div key={f.title} className="glass-panel p-8 rounded-xl hover:-translate-y-1 transition-all duration-300">
                <span className={`material-symbols-outlined ${f.color} text-4xl mb-6 block select-none`}>{f.icon}</span>
                <h4 className="font-headline text-xl mb-3 text-on-surface">{f.title}</h4>
                <p className="text-on-surface-variant font-sans text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Personas */}
        <section className="py-32 px-8 max-w-7xl mx-auto">
          <h2 className="font-headline text-center text-4xl mb-20 text-on-surface">Who Commands OpSoul?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: "The Founder", label: "Scale Operations", color: "text-primary", bg: "from-primary/20 to-[#6f389b]/20", desc: "Uses OpSoul to clone their decision-making framework, allowing the AI to vet partners and manage high-level triage." },
              { title: "The Executive", label: "Zero-Loss Context", color: "text-secondary", bg: "from-secondary/20 to-[#025b4e]/20", desc: "Maintains a persistent shadow of every meeting, email, and strategy deck to ensure no executive intent is ever lost." },
              { title: "The Consultant", label: "Expert Synthesis", color: "text-primary", bg: "from-primary/20 to-[#cfbcff]/10", desc: "Leverages memory-persistence to keep deep technical nuances available for instant recall across 15+ different client projects." },
            ].map((p) => (
              <div key={p.title} className="bg-surface-container-high rounded-2xl overflow-hidden group">
                <div className={`h-64 relative bg-gradient-to-br ${p.bg} flex items-center justify-center`}>
                  <span className="material-symbols-outlined text-6xl text-white/20 select-none">person</span>
                  <div className="absolute inset-0 bg-gradient-to-t from-surface-container-high to-transparent" />
                </div>
                <div className="p-8">
                  <h4 className="font-headline text-2xl mb-2 text-on-surface">{p.title}</h4>
                  <p className={`${p.color} font-label text-xs uppercase tracking-widest mb-6`}>{p.label}</p>
                  <p className="text-on-surface-variant text-sm font-sans leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Founding Banner */}
        <section className="my-40 px-8 max-w-7xl mx-auto">
          <div className="relative glass-panel p-16 rounded-3xl overflow-hidden text-center neon-glow-primary">
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(224,182,255,0.05)_0%,_transparent_70%)]" />
            <h3 className="font-label uppercase tracking-[0.3em] text-secondary text-sm mb-8">Limited Genesis Phase</h3>
            <h2 className="font-headline text-5xl md:text-6xl font-bold mb-8 text-on-surface">Founding Operators</h2>
            <div className="max-w-2xl mx-auto">
              <p className="text-3xl font-headline text-primary mb-6">$29/mo locked for life.</p>
              <p className="text-xl text-on-surface-variant font-sans mb-10 leading-relaxed">
                You're not buying a subscription. You're founding a new kind of entity. Limited to the first 200 visionaries.
              </p>
              <div className="flex justify-center items-center gap-12">
                <div className="text-left">
                  <span className="block text-2xl font-headline text-on-surface">142/200</span>
                  <span className="text-[10px] uppercase tracking-widest text-slate-500 font-label">Slots Remaining</span>
                </div>
                <a href="/login" className="bg-on-surface text-surface px-12 py-5 font-label uppercase tracking-widest text-xs font-black hover:bg-primary transition-all">
                  Secure Access
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
