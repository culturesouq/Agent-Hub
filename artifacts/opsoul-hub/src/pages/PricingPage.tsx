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
    size: "md:col-span-2",
    desc: "We're opening access in waves, by conversation. Pricing comes after we've understood what you're building — not before. Send a note and we'll talk through what fits.",
  },
  {
    q: "Who is OpSoul for, today?",
    size: "md:col-span-1",
    desc: "Builders shipping agentic systems, leaders who want a persistent AI of their own, and partners thinking at the institutional scale. We're starting small on purpose.",
  },
  {
    q: "Is this open-source?",
    size: "md:col-span-1",
    desc: "Our client SDKs are Apache-2.0. The platform itself — the engine that makes Operators eternal — is proprietary, owner-hosted, and stays that way.",
  },
  {
    q: "What does access feel like once granted?",
    size: "md:col-span-2",
    desc: "You sign into console.opsoul.dev, create your first Operator through a guided birth conversation, and start working with it. The same console we use internally is what you get — scoped to you, with your own data.",
  },
  {
    q: "What happens to my Operator's memory?",
    size: "md:col-span-3",
    desc: "It belongs to you. The Operator's memory, identity, and trajectory are isolated to your account from day one. We don't share it across customers, and we don't use it to train shared models. Your Operator is yours.",
  },
];

export default function PricingPage() {
  return (
    <PublicLayout>
      <main className="relative z-10 pt-32 pb-24 px-6 md:px-8 max-w-7xl mx-auto">
        {/* Hero */}
        <header className="mb-20 text-center md:text-left">
          <div className="flex items-center gap-3 mb-4 justify-center md:justify-start">
            <span className="status-beacon" />
            <span className="font-label uppercase tracking-[0.2em] text-secondary text-[10px]">Access is opening in waves</span>
          </div>
          <h1 className="font-headline text-5xl md:text-7xl font-bold tracking-tight text-on-surface mb-6">
            Three ways <span className="text-primary">to begin</span>
          </h1>
          <p className="max-w-2xl text-on-surface-variant text-lg font-light leading-relaxed font-sans">
            OpSoul isn't a product you check out of. It's a platform that becomes part of how you work. We're starting small, on purpose — by conversation, not by signup form.
          </p>
        </header>

        {/* Access Modes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-20 items-start">
          {accessModes.map((m) => (
            <div
              key={m.name}
              className={`bg-white border border-border p-6 rounded-2xl flex flex-col transition-all duration-300 ${
                m.highlighted
                  ? "border border-primary/30 relative scale-[1.02] z-10 bg-surface-container/80 shadow-md"
                  : "border border-outline-variant/10 hover:bg-muted"
              }`}
            >
              {m.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-3 py-1 font-label uppercase tracking-[0.2em] text-[8px] font-black whitespace-nowrap">
                  Most Asked About
                </div>
              )}
              <div className="mb-6">
                <span className={`font-label uppercase tracking-widest text-[10px] ${m.highlighted ? "text-primary" : "text-on-surface-variant"}`}>{m.tag}</span>
                <h3 className="font-headline text-2xl font-bold mt-2 text-on-surface">{m.name}</h3>
                <p className={`text-xs mt-2 font-label uppercase tracking-widest ${m.highlighted ? "text-primary" : "text-on-surface-variant"}`}>{m.sub}</p>
              </div>
              <p className="text-on-surface-variant text-sm font-sans leading-relaxed mb-6">
                {m.desc}
              </p>
              <div className="flex-grow space-y-4 mb-8">
                {m.features.map((f) => (
                  <div key={f} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-secondary text-sm select-none">check_circle</span>
                    <span className={`text-sm font-light ${m.highlighted ? "text-on-surface font-medium" : "text-on-surface-variant"}`}>{f}</span>
                  </div>
                ))}
              </div>
              <Link href={m.href}>
                <button
                  className={`w-full py-3 font-label uppercase tracking-widest text-[10px] transition-all ${
                    m.highlighted
                      ? "bg-primary text-on-primary font-black hover:opacity-90"
                      : "border border-outline-variant/30 rounded-lg text-on-surface hover:bg-primary/10 hover:border-primary/50"
                  }`}
                >
                  {m.cta}
                </button>
              </Link>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <section className="mb-32">
          <h2 className="font-headline text-4xl font-bold mb-12 text-center md:text-left text-on-surface">Common questions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {faqs.map((f) => (
              <div key={f.q} className={`bg-white border border-border p-6 rounded-2xl ${f.size}`}>
                <h4 className="font-headline font-bold text-primary mb-4">{f.q}</h4>
                <p className="text-on-surface-variant text-sm font-light leading-relaxed font-sans">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
