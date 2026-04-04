import { useState } from "react";
import PublicLayout from "@/components/public/PublicLayout";
import { Link } from "wouter";

const faqs = [
  { q: "How is protocol billing calculated?", a: "Our billing is computed per computational cycle. We utilize a transparent ledger system where you only pay for the specific AI token throughput and neural processing hours consumed by your active operators." },
  { q: "Why is my Operator not responding?", a: "Response latency typically occurs during global synchronization events or when a node's local cache exceeds 10GB. We recommend a 'Hard Reboot' from the Command Center dashboard or checking the network shards in your sector." },
  { q: "Can I transfer Operator ownership?", a: "Yes, ownership is cryptographically signed. You can initiate a transfer in the 'Security' settings tab. Both parties must provide a biometric validation signature to complete the handover of neural weights." },
  { q: "What happens if I delete an Operator?", a: "Deletion is permanent. All unique neural adaptations and memory shards associated with that specific operator profile will be purged from the OpSoul network to ensure privacy compliance." },
  { q: "Is data encryption mandatory?", a: "Absolutely. OpSoul Protocol v4.2 mandates end-to-end quantum-resistant encryption for all telemetry and interaction logs. We do not have access to your Operator's private logic branches." },
  { q: "How do I access premium channels?", a: "Premium communication channels are unlocked once your account achieves 'Tier 2 Operator' status. This requires maintaining a 98% uptime for at least 720 processing hours." },
];

export default function SupportPage() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <PublicLayout>
      <main className="relative z-10 pt-20 min-h-screen">
        {/* Status Banner — sits directly below the fixed nav */}
        <div className="sticky top-16 w-full bg-secondary-container/20 backdrop-blur-sm py-2 px-6 md:px-8 flex justify-center items-center gap-3 z-40 border-b border-outline-variant/5">
          <span className="status-beacon" />
          <span className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary">All systems operational</span>
        </div>

        <div className="max-w-7xl mx-auto px-6 md:px-8 pb-24 pt-12">

          {/* Hero */}
          <section className="mb-20 text-center">
            <h1 className="font-headline text-5xl md:text-7xl font-bold tracking-tight text-on-surface mb-8">
              Support <span className="text-primary">Center</span>
            </h1>
            <div className="max-w-3xl mx-auto relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000" />
              <div className="relative flex items-center bg-surface-container-highest/60 backdrop-blur-xl rounded-2xl p-2 border border-outline-variant/10 shadow-2xl">
                <span className="material-symbols-outlined ml-4 text-on-surface-variant select-none">search</span>
                <input
                  className="w-full bg-transparent border-none outline-none text-xl py-4 px-4 text-on-surface placeholder:text-on-surface-variant/50 font-sans"
                  placeholder="What do you need help with?"
                  type="text"
                />
                <kbd className="hidden md:inline-flex items-center gap-1 px-3 py-1 mr-4 bg-white/5 rounded-lg border border-outline-variant/20 text-on-surface-variant text-xs font-label">
                  <span className="text-sm">⌘</span>K
                </kbd>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Quick links:</span>
              {["Getting started", "Billing", "Operator not responding", "Delete an Operator", "Channels"].map((link, i) => (
                <span key={link} className="flex items-center gap-3">
                  {i > 0 && <span className="text-outline-variant/20">•</span>}
                  <a className="text-[10px] font-label uppercase tracking-widest text-primary hover:text-white transition-colors" href="#">{link}</a>
                </span>
              ))}
            </div>
          </section>

          {/* Contact Cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-24">
            <div className="glass-panel p-6 rounded-2xl border border-outline-variant/10 hover:border-primary/20 transition-all group relative overflow-hidden">
              <div className="absolute top-4 right-4">
                <span className="status-beacon beacon-pulse" />
              </div>
              <div className="bg-primary-container/20 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-primary text-3xl select-none">forum</span>
              </div>
              <h3 className="font-headline text-xl font-bold mb-2 text-on-surface">Live chat</h3>
              <p className="text-on-surface-variant text-sm mb-6 leading-relaxed font-sans">Connect directly with our support team. Average wait time: ~2 minutes.</p>
              <button className="text-[10px] font-label uppercase tracking-widest text-primary flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                Start Chat <span className="material-symbols-outlined text-sm select-none">arrow_forward</span>
              </button>
            </div>

            <div className="glass-panel p-6 rounded-2xl border border-outline-variant/10 hover:border-primary/20 transition-all group">
              <div className="bg-secondary-container/20 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-secondary text-3xl select-none">mail</span>
              </div>
              <h3 className="font-headline text-xl font-bold mb-2 text-on-surface">Email (24hr)</h3>
              <p className="text-on-surface-variant text-sm mb-6 leading-relaxed font-sans">Send us a message and we'll get back to you within 14 hours.</p>
              <button className="text-[10px] font-label uppercase tracking-widest text-secondary flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                Email Us <span className="material-symbols-outlined text-sm select-none">arrow_forward</span>
              </button>
            </div>

            <div className="glass-panel p-6 rounded-2xl border border-outline-variant/10 hover:border-primary/20 transition-all group">
              <div className="bg-[#6200ea]/20 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-[#cfbcff] text-3xl select-none">groups</span>
              </div>
              <h3 className="font-headline text-xl font-bold mb-2 text-on-surface">Community forum</h3>
              <p className="text-on-surface-variant text-sm mb-6 leading-relaxed font-sans">Get help from other OpSoul users and share what you've built.</p>
              <button className="text-[10px] font-label uppercase tracking-widest text-[#cfbcff] flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                Join Community <span className="material-symbols-outlined text-sm select-none">arrow_forward</span>
              </button>
            </div>
          </section>

          {/* FAQ */}
          <section className="max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-12">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-outline-variant/20" />
              <h2 className="font-headline text-3xl font-bold uppercase tracking-widest text-center px-4 text-on-surface">Knowledge Base</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-outline-variant/20" />
            </div>
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <div
                  key={faq.q}
                  className="bg-surface-container-low/40 rounded-2xl border border-outline-variant/10 hover:bg-surface-container-low/80 transition-all cursor-pointer"
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  <div className="flex justify-between items-center p-6">
                    <span className="font-headline font-bold text-lg text-on-surface">{faq.q}</span>
                    <span className={`material-symbols-outlined text-primary select-none transition-transform duration-300 ${open === i ? "rotate-180" : ""}`}>expand_more</span>
                  </div>
                  {open === i && (
                    <div className="px-6 pb-6 text-on-surface-variant leading-relaxed text-sm font-sans">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Still need help CTA */}
          <section className="mt-32 p-12 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent border border-outline-variant/10 relative overflow-hidden">
            <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-primary/20 rounded-full blur-[100px]" />
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
              <div>
                <h2 className="font-headline text-3xl font-bold mb-2 text-on-surface">Still need help?</h2>
                <p className="text-on-surface-variant font-sans">Our support team is ready to assist with anything.</p>
              </div>
              <Link href="/contact">
                <button className="bg-primary-container text-on-primary-container px-10 py-4 font-bold font-label hover:shadow-[0_0_30px_rgba(205,150,255,0.3)] transition-all whitespace-nowrap uppercase tracking-widest text-[10px]">
                  Contact Support
                </button>
              </Link>
            </div>
          </section>
        </div>
      </main>
    </PublicLayout>
  );
}
