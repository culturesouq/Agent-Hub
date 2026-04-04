import PublicLayout from "@/components/public/PublicLayout";

export default function LandingPage() {
  return (
    <PublicLayout>
      <main className="relative z-10 pt-32">
        {/* Hero */}
        <section className="px-6 md:px-8 max-w-7xl mx-auto mb-40 text-left lg:grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3 mb-6">
              <span className="status-beacon" />
              <span className="font-label uppercase tracking-[0.2em] text-[10px] text-secondary">Now in early access</span>
            </div>
            <h1 className="headline-lg text-6xl md:text-8xl font-bold text-on-surface mb-8">
              Your Permanent <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-tertiary">
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
              <a href="/docs" className="border border-outline-variant/30 text-primary px-10 py-5 font-label uppercase tracking-widest text-xs font-bold hover:bg-white/5 transition-all rounded-lg">
                See How It Works
              </a>
            </div>
          </div>

          <div className="lg:col-span-5 hidden lg:block">
            <div className="relative rounded-2xl overflow-hidden neon-glow-primary luminous-edge aspect-[4/5]">
              <img
                src="/images/hero-bg.png"
                alt="AI Operator neural network visualization"
                className="w-full h-full object-cover"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
              <div className="absolute inset-0 border border-primary/20 rounded-2xl pointer-events-none" />
            </div>
          </div>
        </section>

        {/* Problem Section */}
        <section className="py-32 bg-surface-container-low/30 px-6 md:px-8">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-20 items-center">
            <div className="order-2 lg:order-1">
              <div className="glass-panel p-6 rounded-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-destructive/40" />
                <h3 className="font-label uppercase tracking-widest text-destructive text-xs mb-6">The Systemic Failure</h3>
                <h2 className="font-headline text-4xl mb-8 text-on-surface">The Stateless Problem.</h2>
                <p className="text-on-surface-variant font-sans text-lg leading-relaxed mb-6">
                  Every modern AI model forgets you the moment the session ends. They have no memory of what you built together, no awareness of your context, no continuity between conversations.
                </p>
                <p className="text-on-surface-variant font-sans text-lg leading-relaxed">
                  OpSoul is the first persistent intelligence layer that lives beyond the prompt. We don't just process data — we preserve experience.
                </p>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="flex flex-col gap-4">
                <div className="h-1 bg-surface-variant w-full rounded-full">
                  <div className="h-full bg-destructive w-1/3 shadow-[0_0_10px_rgba(255,180,171,0.5)]" />
                </div>
                <div className="flex justify-between font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  <span>Traditional LLM Memory</span>
                  <span>33% Retention</span>
                </div>
                <div className="mt-12 h-1 bg-surface-variant w-full rounded-full">
                  <div className="h-full bg-secondary w-full shadow-[0_0_10px_rgba(64,206,243,0.5)]" />
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
        <section className="py-32 px-6 md:px-8 max-w-7xl mx-auto">
          <div className="mb-20">
            <h2 className="font-headline text-5xl mb-4 text-on-surface">Architected for Autonomy</h2>
            <p className="text-on-surface-variant font-sans">Built at the intersection of persistence and privacy.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: "psychology_alt", color: "text-primary", title: "Never Drifts", desc: "Maintains core objective alignment regardless of session duration or context switching." },
              { icon: "auto_awesome", color: "text-secondary", title: "Grows Autonomously", desc: "Extracts patterns from your successes and failures to refine its own execution logic." },
              { icon: "verified_user", color: "text-primary", title: "Verifies Its Own Knowledge", desc: "Cross-references internal long-term memory with real-time data to eliminate hallucinations." },
              { icon: "bolt", color: "text-secondary", title: "Acts Without Being Prompted", desc: "Proactive agency that identifies tasks based on your historical behavior and project goals." },
              { icon: "enhanced_encryption", color: "text-primary", title: "Completely Private", desc: "Your data and memory are encrypted end-to-end. We never have access to your Operator's conversations." },
              { icon: "hub", color: "text-secondary", title: "Lives Across Channels", desc: "Unified memory across Slack, Discord, Email, and Terminal. One mind, many hands." },
            ].map((f) => (
              <div key={f.title} className="glass-panel p-6 rounded-2xl hover:-translate-y-1 hover:scale-[1.03] transition-all duration-300">
                <span className={`material-symbols-outlined ${f.color} text-4xl mb-6 block select-none`}>{f.icon}</span>
                <h4 className="font-headline text-xl mb-3 text-on-surface">{f.title}</h4>
                <p className="text-on-surface-variant font-sans text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Personas */}
        <section className="py-32 px-6 md:px-8 max-w-7xl mx-auto">
          <h2 className="font-headline text-center text-4xl mb-20 text-on-surface">Who Commands OpSoul?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "The Founder", label: "Scale Operations",
                color: "text-primary", accentColor: "#cd96ff",
                glowColor: "rgba(205,150,255,0.25)",
                ringColor: "border-primary/30",
                imageSrc: "/images/persona-founder.png",
                desc: "Uses OpSoul to clone their decision-making framework, allowing the AI to vet partners and manage high-level triage.",
                initial: "F",
              },
              {
                title: "The Executive", label: "Zero-Loss Context",
                color: "text-secondary", accentColor: "#40cef3",
                glowColor: "rgba(64,206,243,0.2)",
                ringColor: "border-secondary/30",
                imageSrc: "/images/persona-executive.png",
                desc: "Maintains a persistent shadow of every meeting, email, and strategy deck to ensure no executive intent is ever lost.",
                initial: "E",
              },
              {
                title: "The Consultant", label: "Expert Synthesis",
                color: "text-tertiary", accentColor: "#ff6a9f",
                glowColor: "rgba(255,106,159,0.18)",
                ringColor: "border-[#ff6a9f]/30",
                imageSrc: "/images/persona-consultant.png",
                desc: "Leverages memory-persistence to keep deep technical nuances available for instant recall across 15+ different client projects.",
                initial: "C",
              },
            ].map((p) => (
              <div key={p.title} className="bg-surface-container-high rounded-2xl overflow-hidden group hover:scale-[1.02] transition-all duration-500 glass-edge">
                <div className="h-64 relative overflow-hidden bg-[#0a0a0f]">
                  <img
                    src={p.imageSrc}
                    alt={`${p.title} archetype portrait`}
                    className="w-full h-full object-cover object-top opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                  />
                  <div
                    className="absolute inset-0"
                    style={{ background: `radial-gradient(ellipse at 50% 100%, ${p.glowColor} 0%, transparent 60%)`, mixBlendMode: "screen" }}
                  />
                  <div
                    className="absolute top-0 left-0 right-0 h-px"
                    style={{ background: `linear-gradient(to right, transparent, ${p.accentColor}60, transparent)` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-surface-container-high via-transparent to-transparent" />
                  <div
                    className="absolute bottom-4 left-4 px-3 py-1 rounded-full text-[10px] font-label uppercase tracking-widest border"
                    style={{ borderColor: `${p.accentColor}40`, background: `${p.accentColor}15`, color: p.accentColor }}
                  >
                    {p.label}
                  </div>
                </div>
                <div className="p-6">
                  <h4 className="font-headline text-2xl mb-2 text-on-surface">{p.title}</h4>
                  <p className="text-on-surface-variant text-sm font-sans leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Founding Banner */}
        <section className="py-24 md:py-32 px-6 md:px-8 max-w-7xl mx-auto">
          <div className="relative glass-panel p-6 md:p-8 rounded-2xl overflow-hidden text-center neon-glow-primary">
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(205,150,255,0.05)_0%,_transparent_70%)]" />
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
                  <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label">Slots Remaining</span>
                </div>
                <a href="/login" className="bg-on-surface text-surface px-12 py-5 font-label uppercase tracking-widest text-xs font-black hover:bg-primary transition-all">
                  Secure Access
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
