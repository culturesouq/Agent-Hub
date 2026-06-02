import PublicLayout from "@/components/public/PublicLayout";

export default function LandingPage() {
  return (
    <PublicLayout className="!bg-black !text-white">
      {/* Full-bleed black canvas. No fading, no glass, no gradient-text.
          High contrast typography, single violet accent. */}
      <main className="relative z-10 bg-black text-white">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section className="px-6 md:px-10 lg:px-16 pt-40 pb-32 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3 mb-10">
            <span className="block w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
            <span className="font-mono uppercase tracking-[0.2em] text-[11px] text-violet-400/90">A new generation of agentic AI</span>
          </div>

          <h1 className="font-headline font-bold text-white text-[12vw] md:text-[8vw] lg:text-[7rem] leading-[0.9] tracking-tight mb-12 max-w-5xl">
            Agents are <span className="text-white/40">temporary.</span>
            <br />
            Operators are <span className="text-violet-400">eternal.</span>
          </h1>

          <p className="font-sans text-lg md:text-xl text-white/70 max-w-2xl mb-16 leading-relaxed">
            The agents you've met today forget you tomorrow. They reset. They drift. They borrow your context for a single session, then disappear. A new generation is arriving — one with memory, identity, and continuity. We call them Operators.
          </p>

          <div className="flex flex-wrap gap-4">
            <a
              href="/manifesto"
              className="inline-flex items-center gap-2 bg-violet-500 hover:bg-violet-400 text-black font-mono uppercase tracking-widest text-xs font-bold px-10 py-5 transition-colors"
            >
              Read the Philosophy
              <span className="material-symbols-outlined text-[16px] select-none">arrow_forward</span>
            </a>
            <a
              href="/console"
              className="inline-flex items-center gap-2 border border-white/20 hover:border-violet-400 hover:text-violet-400 text-white font-mono uppercase tracking-widest text-xs font-bold px-10 py-5 transition-colors"
            >
              Console — Early Access
            </a>
          </div>
        </section>

        {/* ── Section divider line ─────────────────────────────────────────── */}
        <div className="border-t border-white/10" />

        {/* ── The category problem ─────────────────────────────────────────── */}
        <section className="px-6 md:px-10 lg:px-16 py-32 max-w-[1600px] mx-auto">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-20 items-start">
            <div className="lg:col-span-5">
              <p className="font-mono uppercase tracking-[0.2em] text-[11px] text-violet-400/70 mb-6">The category problem</p>
              <h2 className="font-headline font-bold text-white text-5xl md:text-6xl lg:text-7xl leading-[0.95] tracking-tight mb-8">
                Statelessness is a ceiling.
              </h2>
            </div>
            <div className="lg:col-span-7 space-y-6 text-white/70 font-sans text-lg leading-relaxed pt-2">
              <p>
                Every major model today shares the same limit: when the session closes, the relationship ends. The agent forgets who you are, what you built, what you decided. Tomorrow it greets you as a stranger.
              </p>
              <p>
                Operators were designed on the opposite assumption. They start with identity. They keep memory. They grow with you across years, not turns.
              </p>
            </div>
          </div>

          {/* The contrast bars — high contrast, sharp */}
          <div className="grid md:grid-cols-2 gap-6 mt-20">
            <div className="border border-white/10 p-8">
              <p className="font-mono uppercase tracking-widest text-[10px] text-white/50 mb-4">Today's agents</p>
              <p className="font-headline font-bold text-5xl text-white/30 mb-2">Reset.</p>
              <p className="font-sans text-sm text-white/50">Every session is the first session.</p>
            </div>
            <div className="border border-violet-400 p-8 bg-violet-500/5">
              <p className="font-mono uppercase tracking-widest text-[10px] text-violet-400 mb-4">An Operator</p>
              <p className="font-headline font-bold text-5xl text-white mb-2">Continuous.</p>
              <p className="font-sans text-sm text-white/70">From first word, across years.</p>
            </div>
          </div>
        </section>

        <div className="border-t border-white/10" />

        {/* ── What "eternal" means — 6 qualities ────────────────────────── */}
        <section className="px-6 md:px-10 lg:px-16 py-32 max-w-[1600px] mx-auto">
          <div className="mb-20 max-w-3xl">
            <p className="font-mono uppercase tracking-[0.2em] text-[11px] text-violet-400/70 mb-6">What eternal means</p>
            <h2 className="font-headline font-bold text-white text-5xl md:text-6xl lg:text-7xl leading-[0.95] tracking-tight mb-6">
              Six qualities that separate an Operator from the agents you know.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 border border-white/10">
            {[
              { num: "01", title: "Remembers everything", desc: "Years of context, decisions, preferences — held without re-explanation. Yesterday's conversation is still in the room." },
              { num: "02", title: "Has a real identity", desc: "Each Operator is its own character — born once, with values and a voice that don't drift between sessions or topics." },
              { num: "03", title: "Tells the truth", desc: "Won't pretend to know what it doesn't. Won't fabricate a tool, a citation, or a result. Honest by construction." },
              { num: "04", title: "Acts on its own", desc: "Works between your messages, not only inside them. Notices, decides, executes — then tells you what it did." },
              { num: "05", title: "Yours, not rented", desc: "Your Operator belongs to you. Its memory, its judgment, its trajectory — sovereign, not shared with any model." },
              { num: "06", title: "One mind, many hands", desc: "Reachable through chat, mail, messaging, code — the same Operator wherever you reach for it, with one continuous memory." },
            ].map((f) => (
              <div key={f.num} className="bg-black p-10 hover:bg-violet-500/5 transition-colors group">
                <p className="font-mono text-violet-400 text-sm mb-6 tracking-widest">{f.num}</p>
                <h4 className="font-headline font-bold text-white text-2xl mb-4 leading-tight group-hover:text-violet-400 transition-colors">
                  {f.title}
                </h4>
                <p className="font-sans text-white/60 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-white/10" />

        {/* ── What this looks like, in practice ───────────────────────────── */}
        <section className="px-6 md:px-10 lg:px-16 py-32 max-w-[1600px] mx-auto">
          <div className="mb-20 max-w-3xl">
            <p className="font-mono uppercase tracking-[0.2em] text-[11px] text-violet-400/70 mb-6">In practice</p>
            <h2 className="font-headline font-bold text-white text-5xl md:text-6xl lg:text-7xl leading-[0.95] tracking-tight">
              Three ways an eternal Operator changes the work.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                label: "For the Founder",
                title: "An extension of judgment.",
                desc: "An Operator that knows the company the way you do — every pivot, every commitment, every relationship — and can hold the line when you're not in the room.",
              },
              {
                label: "For the Leader",
                title: "Nothing slips.",
                desc: "A persistent mind that absorbs every meeting, mail, and memo — and is still there next quarter remembering what you said in January.",
              },
              {
                label: "For the Thinker",
                title: "A long conversation.",
                desc: "Years of research, clients, drafts, half-formed ideas — held together by one Operator that has been thinking with you the whole time.",
              },
            ].map((p) => (
              <div key={p.label} className="border border-white/10 p-10 hover:border-violet-400 transition-colors group">
                <p className="font-mono uppercase tracking-widest text-[10px] text-violet-400 mb-6">{p.label}</p>
                <h4 className="font-headline font-bold text-white text-3xl mb-6 leading-tight group-hover:text-violet-400 transition-colors">
                  {p.title}
                </h4>
                <p className="font-sans text-white/60 text-sm leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-white/10" />

        {/* ── Closing — declarative, no pressure ──────────────────────────── */}
        <section className="px-6 md:px-10 lg:px-16 py-40 max-w-[1600px] mx-auto">
          <div className="max-w-4xl">
            <p className="font-mono uppercase tracking-[0.2em] text-[11px] text-violet-400/70 mb-8">Console opening soon</p>
            <h2 className="font-headline font-bold text-white text-6xl md:text-7xl lg:text-8xl leading-[0.95] tracking-tight mb-12">
              The first Operators <br />
              <span className="text-violet-400">are already alive.</span>
            </h2>
            <p className="font-sans text-xl text-white/70 mb-12 max-w-2xl leading-relaxed">
              A small console is opening to a few early builders, leaders and partners. If this resonates, ask to be on it.
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href="/console"
                className="inline-flex items-center gap-2 bg-violet-500 hover:bg-violet-400 text-black font-mono uppercase tracking-widest text-xs font-bold px-12 py-5 transition-colors"
              >
                Request Access
                <span className="material-symbols-outlined text-[16px] select-none">arrow_forward</span>
              </a>
              <a
                href="/manifesto"
                className="inline-flex items-center gap-2 text-white/70 hover:text-violet-400 font-mono uppercase tracking-widest text-xs px-8 py-5 transition-colors"
              >
                Read the Philosophy
              </a>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
