import { Link } from "wouter";
import PublicLayout from "@/components/public/PublicLayout";

const accessModes: { tag: string; name: string; sub: string; desc: string; features: string[]; cta: string; href: string; highlighted: boolean }[] = [
  {
    tag: "For Builders",
    name: "Developer Access",
    sub: "Build on the platform",
    desc: "Early access to the SDK + a console for managing your own Operators. For developers, founders, and teams shipping with agentic AI.",
    features: [
      "Console at console.opsoul.dev",
      "SDK + thin client packages",
      "Multi-Operator workspace",
      "API keys + usage dashboard",
    ],
    cta: "Request Access",
    href: "/contact?intent=developer",
    highlighted: false,
  },
  {
    tag: "For Leaders",
    name: "Operator Access",
    sub: "Run your own Operator",
    desc: "A persistent Operator that learns you, remembers everything, and works with you across the tools you already use. For founders, executives, and thinkers who want an AI that doesn't reset.",
    features: [
      "One eternal Operator, fully yours",
      "Continuous memory across years",
      "Reachable through chat, mail, messaging",
      "Private, scope-isolated, sovereign",
    ],
    cta: "Request Access",
    href: "/contact?intent=operator",
    highlighted: true,
  },
  {
    tag: "For Partners",
    name: "Strategic & Enterprise",
    sub: "License + co-build",
    desc: "For institutions, ministries, and corporates who want to deploy Operators at scale — hosted console, white-label, sovereign deployment, or full strategic partnership.",
    features: [
      "Custom deployment + residency",
      "White-label console domain",
      "Dedicated capacity + SLA",
      "Vael-as-Service for curation",
    ],
    cta: "Open a Conversation",
    href: "/contact?intent=partner",
    highlighted: false,
  },
];

const faqs = [
  {
    q: "Why no pricing on this page?",
    desc: "We're opening access in waves, by conversation. Pricing comes after we've understood what you're building — not before. Send a note and we'll talk through what fits.",
  },
  {
    q: "Who is OpSoul for, today?",
    desc: "Builders shipping agentic systems, leaders who want a persistent AI of their own, and partners thinking at the institutional scale. We're starting small on purpose.",
  },
  {
    q: "Is this open-source?",
    desc: "Our client SDKs are Apache-2.0. The platform itself — the engine that makes Operators eternal — is proprietary, owner-hosted, and stays that way.",
  },
  {
    q: "What does access feel like once granted?",
    desc: "You sign into console.opsoul.dev, create your first Operator through a guided birth conversation, and start working with it. The same console we use internally is what you get — scoped to you, with your own data.",
  },
  {
    q: "What happens to my Operator's memory?",
    desc: "It belongs to you. The Operator's memory, identity, and trajectory are isolated to your account from day one. We don't share it across customers, and we don't use it to train shared models. Your Operator is yours.",
  },
];

export default function PricingPage() {
  return (
    <PublicLayout>
      <main className="relative z-10 bg-black text-white">

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="px-6 md:px-10 lg:px-16 pt-40 pb-24 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <span className="block w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
            <span className="font-mono uppercase tracking-[0.2em] text-[11px] text-violet-400/90">Access is opening in waves</span>
          </div>
          <h1 className="font-headline font-bold text-white text-6xl md:text-7xl lg:text-8xl leading-[0.95] tracking-tight mb-8 max-w-4xl">
            Three ways <span className="text-violet-400">to begin.</span>
          </h1>
          <p className="font-sans text-lg md:text-xl text-white/70 max-w-2xl leading-relaxed">
            OpSoul isn't a product you check out of. It's a platform that becomes part of how you work. We're starting small, on purpose — by conversation, not by signup form.
          </p>
        </section>

        <div className="border-t border-white/10" />

        {/* ── Access modes ──────────────────────────────────────────────── */}
        <section className="px-6 md:px-10 lg:px-16 py-24 max-w-[1600px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {accessModes.map((m) => (
              <div
                key={m.name}
                className={`p-10 transition-colors flex flex-col ${
                  m.highlighted
                    ? "border-2 border-violet-400 bg-violet-500/5"
                    : "border border-white/10 hover:border-violet-400/50"
                }`}
              >
                {m.highlighted && (
                  <p className="font-mono uppercase tracking-widest text-[10px] text-violet-400 mb-6">— Most Asked About —</p>
                )}
                {!m.highlighted && (
                  <p className="font-mono uppercase tracking-widest text-[10px] text-white/50 mb-6">{m.tag}</p>
                )}
                <h3 className="font-headline font-bold text-white text-3xl mb-3 leading-tight">{m.name}</h3>
                <p className={`font-mono uppercase tracking-widest text-[10px] mb-6 ${m.highlighted ? "text-violet-400" : "text-white/50"}`}>{m.sub}</p>
                <p className="font-sans text-white/70 text-sm leading-relaxed mb-8">{m.desc}</p>
                <ul className="flex-grow space-y-3 mb-10">
                  {m.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <span className="text-violet-400 font-mono text-xs mt-1">→</span>
                      <span className="text-white/80 text-sm font-sans">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href={m.href}>
                  <button
                    className={`w-full py-4 font-mono uppercase tracking-widest text-[11px] font-bold transition-colors ${
                      m.highlighted
                        ? "bg-violet-500 hover:bg-violet-400 text-black"
                        : "border border-white/20 hover:border-violet-400 hover:text-violet-400 text-white"
                    }`}
                  >
                    {m.cta}
                  </button>
                </Link>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-white/10" />

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <section className="px-6 md:px-10 lg:px-16 py-24 max-w-[1600px] mx-auto">
          <div className="mb-16 max-w-3xl">
            <p className="font-mono uppercase tracking-[0.2em] text-[11px] text-violet-400/70 mb-6">Common questions</p>
            <h2 className="font-headline font-bold text-white text-4xl md:text-5xl lg:text-6xl leading-[0.95] tracking-tight">
              Direct answers.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-white/10 border border-white/10">
            {faqs.map((f) => (
              <div key={f.q} className="bg-black p-10 hover:bg-violet-500/5 transition-colors">
                <h4 className="font-headline font-bold text-white text-xl mb-4">{f.q}</h4>
                <p className="text-white/60 text-sm font-sans leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
