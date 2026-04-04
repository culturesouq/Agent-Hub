import { useState } from "react";
import { Link } from "wouter";
import PublicNav from "@/components/public/PublicNav";
import PublicFooter from "@/components/public/PublicFooter";

const tiers = [
  {
    tier: "Tier 01",
    name: "Solo",
    price: "$49",
    sub: "1 Active Operator",
    features: ["Full Neural Integration", "24/7 Autonomous Sync", "Standard Encryption"],
    cta: "Initialize Solo",
    highlighted: false,
  },
  {
    tier: "Tier 02",
    name: "Pro",
    price: "$99",
    sub: "3 Active Operators",
    features: ["Cross-Node Cooperation", "Advanced Heuristics", "Priority Protocol Access"],
    cta: "Deploy Pro",
    highlighted: true,
  },
  {
    tier: "Tier 03",
    name: "Studio",
    price: "$249",
    sub: "10 Active Operators",
    features: ["Fleet Management UI", "Shared Context Pools", "Dedicated Support Node"],
    cta: "Launch Studio",
    highlighted: false,
  },
  {
    tier: "Tier 04",
    name: "Enterprise",
    price: "Custom",
    sub: "Unlimited Operators",
    features: ["White-label UI Scaling", "Air-gapped Deployment", "Custom Protocol Rules"],
    cta: "Request Uplink",
    highlighted: false,
  },
];

const faqs = [
  { q: "Trial Phase", size: "md:col-span-1", desc: "Every initialize command starts with a 14-day protocol window. No credit card required to begin the sequence." },
  { q: "Switching Protocols", size: "md:col-span-2", desc: "Scaling up or down is handled instantly at the protocol level. Credits are pro-rated to your next billing cycle." },
  { q: "What is a Founding Operator?", size: "md:col-span-2", desc: "Founding Operators are our early believers. You aren't just a user; you are a permanent part of the OpSoul ledger. You get the lowest possible price point and every future feature upgrade for life. No exceptions." },
  { q: "Decommissioning", size: "md:col-span-1", desc: "Deleting an Operator is permanent. All local memory is purged. You can repurpose the slot immediately for a new entity." },
  { q: "Protocol Integrity", size: "md:col-span-3", desc: "Unlike traditional SaaS, we don't gate features. A Solo operator has the same raw cognitive capacity as an Enterprise fleet. You are paying for the number of entities you wish to sustain simultaneously, not the quality of their existence." },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);

  return (
    <div className="min-h-screen bg-background text-on-surface selection:bg-primary-container selection:text-on-primary-container">
      <div className="fixed inset-0 dot-grid opacity-15 pointer-events-none z-0" />
      <PublicNav />

      <main className="relative z-10 pt-32 pb-24 px-6 md:px-12 max-w-7xl mx-auto">
        {/* Ambient glows */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-secondary/5 rounded-full blur-[120px] pointer-events-none" />

        {/* Hero */}
        <header className="mb-20 text-center md:text-left">
          <div className="flex items-center gap-3 mb-4 justify-center md:justify-start">
            <div className="status-beacon" />
            <span className="font-label uppercase tracking-[0.2em] text-secondary text-[10px]">Protocol Monetization v4.2</span>
          </div>
          <h1 className="font-headline text-5xl md:text-7xl font-bold tracking-tight text-on-surface mb-6">
            Scale your <span className="text-primary">Sovereignty</span>
          </h1>
          <p className="max-w-2xl text-on-surface-variant text-lg font-light leading-relaxed font-sans">
            OpSoul is built for permanent scaling. No feature gating. No tiered capabilities. Just pure, unadulterated operator throughput. Choose your scale.
          </p>
        </header>

        {/* Founding Banner */}
        <section className="mb-20">
          <div className="glass-panel p-8 rounded-xl border border-primary/10 relative overflow-hidden group hover:border-primary/30 transition-all duration-500">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/20 rounded-full mb-4">
                  <span className="material-symbols-outlined text-[14px] text-primary select-none" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                  <span className="font-label uppercase tracking-widest text-[10px] text-primary font-bold">Limited Protocol Allocation</span>
                </div>
                <h2 className="font-headline text-3xl font-bold text-on-surface mb-3">Founding Operators</h2>
                <p className="text-on-surface-variant max-w-xl font-sans">
                  "You're not buying a subscription. You're founding a new kind of entity." First 200 people receive full protocol capabilities locked at{" "}
                  <span className="text-secondary font-bold">$29/mo</span> for life.
                </p>
              </div>
              <div className="flex flex-col items-center md:items-end gap-2">
                <div className="text-4xl font-headline font-bold text-primary">$29<span className="text-lg text-on-surface-variant font-light">/mo</span></div>
                <Link href="/login">
                  <button className="bg-primary text-on-primary px-8 py-3 font-label uppercase tracking-widest text-[12px] font-black hover:scale-105 active:scale-95 transition-transform">
                    Claim Allocation
                  </button>
                </Link>
                <span className="text-[10px] font-label text-slate-500 uppercase tracking-tighter">142 Slots Remaining</span>
              </div>
            </div>
          </div>
        </section>

        {/* Toggle */}
        <div className="flex flex-col items-center mb-16">
          <div className="flex items-center gap-2 p-1 bg-surface-container-low rounded-full">
            <button
              onClick={() => setAnnual(false)}
              className={`px-6 py-2 rounded-full font-label uppercase tracking-widest text-[10px] transition-colors ${!annual ? "bg-primary/10 text-primary font-bold" : "text-slate-400 hover:text-on-surface"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-6 py-2 rounded-full font-label uppercase tracking-widest text-[10px] transition-colors ${annual ? "bg-primary/10 text-primary font-bold" : "text-slate-400 hover:text-on-surface"}`}
            >
              Annual <span className="text-[8px] opacity-70 ml-1">(2 Months Free)</span>
            </button>
          </div>
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-20 items-start">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`glass-panel p-8 rounded-xl flex flex-col transition-all duration-300 ${
                t.highlighted
                  ? "border border-primary/30 relative scale-105 z-10 bg-surface-container/80 shadow-[0_0_40px_rgba(224,182,255,0.05)]"
                  : "border border-outline-variant/10 hover:bg-white/5"
              }`}
            >
              {t.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-3 py-1 font-label uppercase tracking-[0.2em] text-[8px] font-black whitespace-nowrap">
                  Most Deployed
                </div>
              )}
              <div className="mb-8">
                <span className={`font-label uppercase tracking-widest text-[10px] ${t.highlighted ? "text-primary" : "text-slate-500"}`}>{t.tier}</span>
                <h3 className="font-headline text-2xl font-bold mt-2 text-on-surface">{t.name}</h3>
              </div>
              <div className="mb-8">
                <div className="text-4xl font-headline font-bold text-on-surface">
                  {t.price}
                  {t.price !== "Custom" && <span className="text-sm font-light text-slate-500">/mo</span>}
                </div>
                <p className={`text-xs mt-2 font-label uppercase tracking-widest ${t.highlighted ? "text-primary" : "text-slate-500"}`}>{t.sub}</p>
              </div>
              <div className="flex-grow space-y-4 mb-10">
                {t.features.map((f) => (
                  <div key={f} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-secondary text-sm select-none">check_circle</span>
                    <span className={`text-sm font-light ${t.highlighted ? "text-on-surface font-medium" : "text-on-surface-variant"}`}>{f}</span>
                  </div>
                ))}
              </div>
              <Link href="/login">
                <button
                  className={`w-full py-3 font-label uppercase tracking-widest text-[10px] transition-all ${
                    t.highlighted
                      ? "bg-primary text-on-primary font-black hover:opacity-90"
                      : "border border-outline-variant/30 text-on-surface hover:bg-primary/10 hover:border-primary/50"
                  }`}
                >
                  {t.cta}
                </button>
              </Link>
            </div>
          ))}
        </div>

        {/* Add-on */}
        <div className="flex flex-col md:flex-row items-center justify-between p-8 bg-surface-container-lowest rounded-xl border border-outline-variant/5 mb-32">
          <div className="flex items-center gap-6 mb-6 md:mb-0">
            <div className="p-4 bg-surface-container rounded-lg">
              <span className="material-symbols-outlined text-primary text-3xl select-none">add_circle</span>
            </div>
            <div>
              <h4 className="font-headline text-xl font-bold text-on-surface">Scaling Buffer</h4>
              <p className="text-on-surface-variant text-sm font-light">Need just one more? Add individual slots as needed.</p>
            </div>
          </div>
          <div className="text-center md:text-right">
            <span className="text-2xl font-headline font-bold text-on-surface">+$29<span className="text-sm font-light text-slate-500">/mo</span></span>
            <p className="font-label uppercase tracking-widest text-[10px] text-slate-500">per extra Operator</p>
          </div>
        </div>

        {/* FAQ */}
        <section className="mb-32">
          <h2 className="font-headline text-4xl font-bold mb-12 text-center md:text-left text-on-surface">Operational Intelligence (FAQ)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {faqs.map((f) => (
              <div key={f.q} className={`glass-panel p-8 rounded-xl ${f.size}`}>
                <h4 className="font-headline font-bold text-primary mb-4">{f.q}</h4>
                <p className="text-on-surface-variant text-sm font-light leading-relaxed font-sans text-center only:text-center">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
