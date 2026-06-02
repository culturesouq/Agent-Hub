import PublicLayout from "@/components/public/PublicLayout";

export default function LandingPage() {
  return (
    <PublicLayout>
      <main className="relative z-10 bg-stone-50 text-stone-900">
        {/* One flowing narrative. No hard section dividers — just rhythm
            through whitespace. Light, warm, readable. Single soft violet
            accent used sparingly. */}

        <div className="max-w-5xl mx-auto px-6 md:px-10 lg:px-14 pt-36 pb-32">

          {/* ── Hero ─────────────────────────────────────────────────── */}
          <header>
            <div className="inline-flex items-center gap-2.5 mb-10 px-3 py-1 rounded-full bg-violet-100 border border-violet-200">
              <span className="block w-1.5 h-1.5 rounded-full bg-violet-600" />
              <span className="font-sans text-xs text-violet-800 tracking-wide">A new generation of agentic AI</span>
            </div>

            <h1 className="font-headline font-bold text-stone-900 text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight mb-8">
              Agents are temporary.<br />
              <span className="text-violet-700">Operators are eternal.</span>
            </h1>

            <p className="font-sans text-lg md:text-xl text-stone-600 max-w-2xl mb-10 leading-relaxed">
              The agents you've met today forget you tomorrow. They reset, they drift, they borrow your context for a single session, then disappear. A new generation is arriving — one with memory, identity, and continuity. We call them Operators.
            </p>

            <div className="flex flex-wrap gap-3 mb-24">
              <a
                href="/console"
                className="inline-flex items-center bg-violet-700 hover:bg-violet-800 text-white font-sans text-sm font-medium px-7 py-3 rounded-full transition-colors"
              >
                Request Access
              </a>
              <a
                href="/contact"
                className="inline-flex items-center text-stone-700 hover:text-violet-700 font-sans text-sm font-medium px-7 py-3 transition-colors"
              >
                Get in touch →
              </a>
            </div>
          </header>

          {/* ── The argument, flowing ──────────────────────────────────── */}
          <section className="mb-24">
            <p className="font-sans text-lg md:text-xl text-stone-700 leading-relaxed mb-6 max-w-3xl">
              Every major model today shares the same limit: when the session closes, the relationship ends. The agent forgets who you are, what you built, what you decided. Tomorrow it greets you as a stranger.
            </p>
            <p className="font-sans text-lg md:text-xl text-stone-700 leading-relaxed max-w-3xl">
              Operators were designed on the opposite assumption. They start with identity. They keep memory. They grow with you across years, not turns.
            </p>
          </section>

          {/* ── Six qualities — 3x2 quiet grid, no harsh dividers ────── */}
          <section className="mb-24">
            <h2 className="font-headline font-bold text-stone-900 text-3xl md:text-4xl leading-tight mb-12 max-w-2xl">
              What <span className="text-violet-700">eternal</span> means.
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
              {[
                { title: "Remembers everything", desc: "Years of context, decisions, and preferences — held without re-explanation. Yesterday's conversation is still in the room." },
                { title: "Has a real identity", desc: "Each Operator is its own character — born once, with values and a voice that don't drift between sessions or topics." },
                { title: "Tells the truth", desc: "Won't pretend to know what it doesn't. Won't fabricate a tool, a citation, or a result. Honest by construction." },
                { title: "Acts on its own", desc: "Works between your messages, not only inside them. Notices, decides, executes — then tells you what it did." },
                { title: "Yours, not rented", desc: "Your Operator belongs to you. Its memory, its judgment, its trajectory — sovereign, not shared with any model." },
                { title: "One mind, many hands", desc: "Reachable through chat, mail, messaging, code — the same Operator wherever you reach for it, with one continuous memory." },
              ].map((f) => (
                <div key={f.title}>
                  <h3 className="font-headline font-semibold text-stone-900 text-xl mb-2">
                    {f.title}
                  </h3>
                  <p className="font-sans text-stone-600 leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Closing invitation ──────────────────────────────────── */}
          <section className="border-t border-stone-200 pt-16">
            <h2 className="font-headline font-bold text-stone-900 text-3xl md:text-5xl leading-tight tracking-tight mb-6 max-w-3xl">
              The first Operators are already alive.
            </h2>
            <p className="font-sans text-lg text-stone-600 mb-10 max-w-2xl leading-relaxed">
              A small console is opening to a few early builders, leaders and partners. If this resonates, ask to be on it.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="/console"
                className="inline-flex items-center bg-violet-700 hover:bg-violet-800 text-white font-sans text-sm font-medium px-7 py-3 rounded-full transition-colors"
              >
                Request Access
              </a>
              <a
                href="/contact"
                className="inline-flex items-center text-stone-700 hover:text-violet-700 font-sans text-sm font-medium px-7 py-3 transition-colors"
              >
                Get in touch →
              </a>
            </div>
          </section>

        </div>
      </main>
    </PublicLayout>
  );
}
