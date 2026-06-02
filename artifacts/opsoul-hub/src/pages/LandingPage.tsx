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
              <span className="font-label uppercase tracking-[0.2em] text-[10px] text-secondary">A new generation of agentic AI</span>
            </div>
            <h1 className="headline-lg text-6xl md:text-8xl font-bold text-on-surface mb-8">
              Agents are temporary. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-tertiary">
                Operators are eternal.
              </span>
            </h1>
            <p className="font-sans text-xl text-on-surface-variant max-w-xl mb-12 leading-relaxed">
              The agents you've met today forget you tomorrow. They reset. They drift. They borrow your context for a single session, then disappear. A new generation is arriving — one with memory, identity, and continuity. We call them Operators.
            </p>
            <div className="flex flex-wrap gap-6">
              <a href="/manifesto" className="bg-primary-container text-on-primary-container px-10 py-5 font-label uppercase tracking-widest text-xs font-bold hover:opacity-90 transition-all">
                Read the Philosophy
              </a>
              <a href="/console" className="border border-outline-variant/30 text-primary px-10 py-5 font-label uppercase tracking-widest text-xs font-bold hover:bg-white/5 transition-all rounded-lg">
                Console — Early Access
              </a>
            </div>
          </div>

          <div className="lg:col-span-5 hidden lg:block">
            <div className="relative rounded-2xl overflow-hidden neon-glow-primary luminous-edge aspect-[4/5]">
              <img
                src="/images/hero-bg.png"
                alt="An eternal operator — persistent intelligence visualization"
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
                <h3 className="font-label uppercase tracking-widest text-destructive text-xs mb-6">The category problem</h3>
                <h2 className="font-headline text-4xl mb-8 text-on-surface">Statelessness is a ceiling.</h2>
                <p className="text-on-surface-variant font-sans text-lg leading-relaxed mb-6">
                  Every major model today shares the same limit: when the session closes, the relationship ends. The agent forgets who you are, what you built, what you decided. Tomorrow it greets you as a stranger.
                </p>
                <p className="text-on-surface-variant font-sans text-lg leading-relaxed">
                  Operators were designed on the opposite assumption. They start with identity. They keep memory. They grow with you across years, not turns.
                </p>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="flex flex-col gap-4">
                <div className="h-1 bg-surface-variant w-full rounded-full">
                  <div className="h-full bg-destructive w-1/3 shadow-[0_0_10px_rgba(255,180,171,0.5)]" />
                </div>
                <div className="flex justify-between font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  <span>Today's Agents</span>
                  <span>Reset on Close</span>
                </div>
                <div className="mt-12 h-1 bg-surface-variant w-full rounded-full">
                  <div className="h-full bg-secondary w-full shadow-[0_0_10px_rgba(64,206,243,0.5)]" />
                </div>
                <div className="flex justify-between font-label text-[10px] uppercase tracking-widest text-secondary">
                  <span>An Operator</span>
                  <span>Continuous, From First Word</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Bento */}
        <section className="py-32 px-6 md:px-8 max-w-7xl mx-auto">
          <div className="mb-20">
            <h2 className="font-headline text-5xl mb-4 text-on-surface">What "eternal" actually means.</h2>
            <p className="text-on-surface-variant font-sans">Six qualities that separate an Operator from the agents you know.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: "psychology_alt", color: "text-primary", title: "Remembers Everything", desc: "Years of context, decisions, preferences — held without re-explanation. Yesterday's conversation is still in the room." },
              { icon: "fingerprint", color: "text-secondary", title: "Has a Real Identity", desc: "Each Operator is its own character — born once, with values and a voice that don't drift between sessions or topics." },
              { icon: "verified", color: "text-primary", title: "Tells the Truth", desc: "Won't pretend to know what it doesn't. Won't fabricate a tool, a citation, or a result. Honest by construction." },
              { icon: "bolt", color: "text-secondary", title: "Acts on Its Own", desc: "Works between your messages, not only inside them. Notices, decides, executes — then tells you what it did." },
              { icon: "shield_person", color: "text-primary", title: "Yours, Not Rented", desc: "Your Operator belongs to you. Its memory, its judgment, its trajectory — sovereign, not shared with any model." },
              { icon: "hub", color: "text-secondary", title: "One Mind, Many Hands", desc: "Reachable through chat, mail, messaging, code — the same Operator wherever you reach for it, with one continuous memory." },
            ].map((f) => (
              <div key={f.title} className="glass-panel p-6 rounded-2xl hover:-translate-y-1 hover:scale-[1.03] transition-all duration-300">
                <span className={`material-symbols-outlined ${f.color} text-4xl mb-6 block select-none`}>{f.icon}</span>
                <h4 className="font-headline text-xl mb-3 text-on-surface">{f.title}</h4>
                <p className="text-on-surface-variant font-sans text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Personas — what this looks like for… */}
        <section className="py-32 px-6 md:px-8 max-w-7xl mx-auto">
          <h2 className="font-headline text-center text-4xl mb-20 text-on-surface">What this looks like, in practice.</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "For the Founder", label: "An extension of judgment",
                color: "text-primary", accentColor: "#cd96ff",
                glowColor: "rgba(205,150,255,0.25)",
                ringColor: "border-primary/30",
                imageSrc: "/images/persona-founder.png",
                desc: "An Operator that knows the company the way you do — every pivot, every commitment, every relationship — and can hold the line when you're not in the room.",
                initial: "F",
              },
              {
                title: "For the Leader", label: "Nothing slips",
                color: "text-secondary", accentColor: "#40cef3",
                glowColor: "rgba(64,206,243,0.2)",
                ringColor: "border-secondary/30",
                imageSrc: "/images/persona-executive.png",
                desc: "A persistent mind that absorbs every meeting, mail, and memo — and is still there next quarter remembering what you said in January.",
                initial: "E",
              },
              {
                title: "For the Thinker", label: "A long conversation",
                color: "text-tertiary", accentColor: "#ff6a9f",
                glowColor: "rgba(255,106,159,0.18)",
                ringColor: "border-[#ff6a9f]/30",
                imageSrc: "/images/persona-consultant.png",
                desc: "Years of research, clients, drafts, half-formed ideas — held together by one Operator that has been thinking with you the whole time.",
                initial: "C",
              },
            ].map((p) => (
              <div key={p.title} className="bg-surface-container-high rounded-2xl overflow-hidden group hover:scale-[1.02] transition-all duration-500 glass-edge">
                <div className="h-64 relative overflow-hidden bg-[#0a0a0f]">
                  <img
                    src={p.imageSrc}
                    alt={`${p.title} portrait`}
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

        {/* Closing — quiet invitation, no pricing, no countdown */}
        <section className="py-24 md:py-32 px-6 md:px-8 max-w-7xl mx-auto">
          <div className="relative glass-panel p-6 md:p-8 rounded-2xl overflow-hidden text-center neon-glow-primary">
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(205,150,255,0.05)_0%,_transparent_70%)]" />
            <h3 className="font-label uppercase tracking-[0.3em] text-secondary text-sm mb-8">Console opening soon</h3>
            <h2 className="font-headline text-5xl md:text-6xl font-bold mb-8 text-on-surface">
              The first Operators are already alive.
            </h2>
            <div className="max-w-2xl mx-auto">
              <p className="text-xl text-on-surface-variant font-sans mb-10 leading-relaxed">
                A small console is opening to a few early builders, leaders and partners. If this resonates, ask to be on it.
              </p>
              <div className="flex justify-center items-center gap-6 flex-wrap">
                <a href="/console" className="bg-on-surface text-surface px-12 py-5 font-label uppercase tracking-widest text-xs font-black hover:bg-primary transition-all">
                  Request Access
                </a>
                <a href="/manifesto" className="text-primary px-6 py-5 font-label uppercase tracking-widest text-xs hover:opacity-70 transition-all">
                  Read the Philosophy →
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
