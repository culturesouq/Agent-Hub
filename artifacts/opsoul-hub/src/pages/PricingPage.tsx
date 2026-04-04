import { useState } from "react";
import { Link } from "wouter";
import PublicLayout from "@/components/public/PublicLayout";

const tiers: { tier: string; name: string; monthly: string; annual: string; sub: string; features: string[]; cta: string; href?: string; highlighted: boolean }[] = [
  {
    tier: "Solo",
    name: "Solo",
    monthly: "$49",
    annual: "$41",
    sub: "1 Active Operator",
    features: ["Persistent memory", "Full Soul configuration", "Grows with every conversation"],
    cta: "Get Started",
    highlighted: false,
  },
  {
    tier: "Pro",
    name: "Pro",
    monthly: "$99",
    annual: "$83",
    sub: "3 Active Operators",
    features: ["3 independent Operators", "Separate memory per Operator", "Priority support"],
    cta: "Start Pro",
    highlighted: true,
  },
  {
    tier: "Studio",
    name: "Studio",
    monthly: "$249",
    annual: "$207",
    sub: "10 Active Operators",
    features: ["10 Operators in one workspace", "Shared context across Operators", "Dedicated support"],
    cta: "Start Studio",
    highlighted: false,
  },
  {
    tier: "Enterprise",
    name: "Enterprise",
    monthly: "Custom",
    annual: "Custom",
    sub: "Unlimited Operators",
    features: ["Unlimited Operators", "Custom deployment", "White-label available"],
    cta: "Contact Us",
    href: "/contact",
    highlighted: false,
  },
];

const faqs = [
  { q: "Free Trial", size: "md:col-span-1", desc: "Every plan starts with a 14-day free trial. No credit card required — sign up, create your first Operator, and explore the platform before committing." },
  { q: "Changing Plans", size: "md:col-span-2", desc: "You can upgrade or downgrade your plan at any time from billing settings. Any unused time on your current plan is prorated and credited to your next billing cycle." },
  { q: "What is a Founding Operator?", size: "md:col-span-2", desc: "Founding Operators are our early believers. You aren't just a user; you are a permanent part of the OpSoul ledger. You get the lowest possible price point and every future feature upgrade for life. No exceptions." },
  { q: "Deleting an Operator", size: "md:col-span-1", desc: "Deleting an Operator is permanent. All of its memory, conversations, and configuration are removed and cannot be recovered. You can create a new Operator in the freed slot immediately." },
  { q: "What you're paying for", size: "md:col-span-3", desc: "We don't gate features based on plan. Every Operator — regardless of whether you're on Solo or Enterprise — has the same full capabilities. You're paying for how many Operators you run simultaneously, not for a better or worse version of the AI." },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);

  return (
    <PublicLayout>
      <main className="relative z-10 pt-32 pb-24 px-6 md:px-8 max-w-7xl mx-auto">
        {/* Ambient glows */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-secondary/5 rounded-full blur-[120px] pointer-events-none" />

        {/* Hero */}
        <header className="mb-20 text-center md:text-left">
          <div className="flex items-center gap-3 mb-4 justify-center md:justify-start">
            <span className="status-beacon" />
            <span className="font-label uppercase tracking-[0.2em] text-secondary text-[10px]">Simple, Transparent Pricing</span>
          </div>
          <h1 className="font-headline text-5xl md:text-7xl font-bold tracking-tight text-on-surface mb-6">
            Pricing that <span className="text-primary">scales with you</span>
          </h1>
          <p className="max-w-2xl text-on-surface-variant text-lg font-light leading-relaxed font-sans">
            No feature gating. No capability tiers. Every plan gives you the same full-powered Operators — you choose how many you want to run.
          </p>
        </header>

        {/* Founding Banner */}
        <section className="mb-20">
          <div className="glass-panel p-6 rounded-2xl border border-primary/10 relative overflow-hidden group hover:border-primary/30 transition-all duration-500">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/20 rounded-full mb-4">
                  <span className="material-symbols-outlined text-[14px] text-primary select-none" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                  <span className="font-label uppercase tracking-widest text-[10px] text-primary font-bold">Limited Allocation</span>
                </div>
                <h2 className="font-headline text-3xl font-bold text-on-surface mb-3">Founding Operators</h2>
                <p className="text-on-surface-variant max-w-xl font-sans">
                  "You're not buying a subscription. You're founding a new kind of entity." First 200 people receive full capabilities locked at{" "}
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
                <span className="text-[10px] font-label text-on-surface-variant uppercase tracking-tighter">142 Slots Remaining</span>
              </div>
            </div>
          </div>
        </section>

        {/* Toggle */}
        <div className="flex flex-col items-center mb-16">
          <div className="flex items-center gap-2 p-1 bg-surface-container-low rounded-full">
            <button
              onClick={() => setAnnual(false)}
              className={`px-6 py-2 rounded-full font-label uppercase tracking-widest text-[10px] transition-colors ${!annual ? "bg-primary/10 text-primary font-bold" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-6 py-2 rounded-full font-label uppercase tracking-widest text-[10px] transition-colors ${annual ? "bg-primary/10 text-primary font-bold" : "text-on-surface-variant hover:text-on-surface"}`}
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
              className={`glass-panel p-6 rounded-2xl flex flex-col transition-all duration-300 ${
                t.highlighted
                  ? "border border-primary/30 relative scale-105 z-10 bg-surface-container/80 shadow-[0_0_40px_rgba(205,150,255,0.05)]"
                  : "border border-outline-variant/10 hover:bg-white/5"
              }`}
            >
              {t.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-3 py-1 font-label uppercase tracking-[0.2em] text-[8px] font-black whitespace-nowrap">
                  Most Popular
                </div>
              )}
              <div className="mb-6">
                <span className={`font-label uppercase tracking-widest text-[10px] ${t.highlighted ? "text-primary" : "text-on-surface-variant"}`}>{t.tier}</span>
                <h3 className="font-headline text-2xl font-bold mt-2 text-on-surface">{t.name}</h3>
              </div>
              <div className="mb-6">
                <div className="text-4xl font-headline font-bold text-on-surface">
                  {annual ? t.annual : t.monthly}
                  {(annual ? t.annual : t.monthly) !== "Custom" && (
                    <span className="text-sm font-light text-on-surface-variant">/mo</span>
                  )}
                </div>
                {(annual ? t.annual : t.monthly) !== "Custom" && (
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
                      {annual ? "billed annually" : "billed monthly"}
                    </p>
                    {annual && (
                      <span className="text-[9px] font-label uppercase tracking-widest text-secondary bg-secondary/10 px-2 py-0.5 rounded-full border border-secondary/20">
                        2 months free
                      </span>
                    )}
                  </div>
                )}
                <p className={`text-xs mt-2 font-label uppercase tracking-widest ${t.highlighted ? "text-primary" : "text-on-surface-variant"}`}>{t.sub}</p>
              </div>
              <div className="flex-grow space-y-4 mb-8">
                {t.features.map((f) => (
                  <div key={f} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-secondary text-sm select-none">check_circle</span>
                    <span className={`text-sm font-light ${t.highlighted ? "text-on-surface font-medium" : "text-on-surface-variant"}`}>{f}</span>
                  </div>
                ))}
              </div>
              <Link href={t.href ?? "/login"}>
                <button
                  className={`w-full py-3 font-label uppercase tracking-widest text-[10px] transition-all ${
                    t.highlighted
                      ? "bg-primary text-on-primary font-black hover:opacity-90"
                      : "border border-outline-variant/30 rounded-lg text-on-surface hover:bg-primary/10 hover:border-primary/50"
                  }`}
                >
                  {t.cta}
                </button>
              </Link>
            </div>
          ))}
        </div>

        {/* Add-on */}
        <div className="flex flex-col md:flex-row items-center justify-between p-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/5 mb-32">
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
            <span className="text-2xl font-headline font-bold text-on-surface">+$29<span className="text-sm font-light text-on-surface-variant">/mo</span></span>
            <p className="font-label uppercase tracking-widest text-[10px] text-on-surface-variant">per extra Operator</p>
          </div>
        </div>

        {/* FAQ */}
        <section className="mb-32">
          <h2 className="font-headline text-4xl font-bold mb-12 text-center md:text-left text-on-surface">Common Questions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {faqs.map((f) => (
              <div key={f.q} className={`glass-panel p-6 rounded-2xl ${f.size}`}>
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
