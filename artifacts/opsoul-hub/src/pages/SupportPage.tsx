import { useState } from "react";
import PublicNav from "@/components/public/PublicNav";
import PublicFooter from "@/components/public/PublicFooter";
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
    <div className="min-h-screen bg-background text-on-surface selection:bg-primary/30">
      <div className="fixed inset-0 dot-grid opacity-15 pointer-events-none z-0" />

      {/* Status Banner */}
      <div className="w-full bg-secondary-container/20 py-2 px-8 flex justify-center items-center gap-3 relative z-50">
        <div className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_10px_#40cef3]" />
        <span className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary">All systems operational</span>
      </div>

      <div className="pt-10">
        <PublicNav />
      </div>

      <main className="relative z-10 pt-32 min-h-screen">
        <div className="max-w-6xl mx-auto px-8 pb-24">

          {/* Hero */}
          <section className="mb-20 text-center">
            <h1 className="font-headline text-5xl md:text-7xl font-bold tracking-tight text-on-surface mb-8">
              Support <span className="text-primary">Interface</span>
            </h1>
            <div className="max-w-3xl mx-auto relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000" />
              <div className="relative flex items-center bg-surface-container-highest/60 backdrop-blur-xl rounded-2xl p-2 border border-white/5 shadow-2xl">
                <span className="material-symbols-outlined ml-4 text-outline select-none">search</span>
                <input
                  className="w-full bg-transparent border-none outline-none text-xl py-4 px-4 text-on-surface placeholder:text-outline/50 font-sans"
                  placeholder="What do you need help with?"
                  type="text"
                />
                <kbd className="hidden md:inline-flex items-center gap-1 px-3 py-1 mr-4 bg-white/5 rounded-lg border border-white/10 text-outline text-xs font-label">
                  <span className="text-sm">⌘</span>K
                </kbd>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <span className="text-[10px] font-label uppercase tracking-widest text-outline">Quick links:</span>
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
            <div className="glass-panel p-8 rounded-3xl border border-white/5 hover:border-primary/20 transition-all group relative overflow-hidden">
              <div className="absolute top-4 right-4">
                <div className="w-3 h-3 rounded-full bg-secondary shadow-[0_0_10px_#40cef3] animate-pulse" />
              </div>
              <div className="bg-primary-container/20 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-primary text-3xl select-none">forum</span>
              </div>
              <h3 className="font-headline text-xl font-bold mb-2 text-on-surface">Live chat</h3>
              <p className="text-on-surface-variant text-sm mb-6 leading-relaxed font-sans">Direct frequency connection with our system architects. Wait time: ~2 mins.</p>
              <button className="text-[10px] font-label uppercase tracking-widest text-primary flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                Establish Link <span className="material-symbols-outlined text-sm select-none">arrow_forward</span>
              </button>
            </div>

            <div className="glass-panel p-8 rounded-3xl border border-white/5 hover:border-primary/20 transition-all group">
              <div className="bg-secondary-container/20 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-secondary text-3xl select-none">mail</span>
              </div>
              <h3 className="font-headline text-xl font-bold mb-2 text-on-surface">Email (24hr)</h3>
              <p className="text-on-surface-variant text-sm mb-6 leading-relaxed font-sans">Send an encrypted transmission. Average response window: 14 hours.</p>
              <button className="text-[10px] font-label uppercase tracking-widest text-secondary flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                Open Terminal <span className="material-symbols-outlined text-sm select-none">arrow_forward</span>
              </button>
            </div>

            <div className="glass-panel p-8 rounded-3xl border border-white/5 hover:border-primary/20 transition-all group">
              <div className="bg-[#6200ea]/20 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-[#cfbcff] text-3xl select-none">groups</span>
              </div>
              <h3 className="font-headline text-xl font-bold mb-2 text-on-surface">Community forum</h3>
              <p className="text-on-surface-variant text-sm mb-6 leading-relaxed font-sans">Collaborate with other protocol operators and shared intelligence nodes.</p>
              <button className="text-[10px] font-label uppercase tracking-widest text-[#cfbcff] flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                Access Network <span className="material-symbols-outlined text-sm select-none">arrow_forward</span>
              </button>
            </div>
          </section>

          {/* FAQ */}
          <section className="max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-12">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
              <h2 className="font-headline text-3xl font-bold uppercase tracking-widest text-center px-4 text-on-surface">Knowledge Base</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
            </div>
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <div
                  key={faq.q}
                  className="bg-surface-container-low/40 rounded-2xl border border-white/5 hover:bg-surface-container-low/80 transition-all cursor-pointer"
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
          <section className="mt-32 p-12 rounded-[2rem] bg-gradient-to-br from-primary/10 to-transparent border border-white/5 relative overflow-hidden">
            <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-primary/20 rounded-full blur-[100px]" />
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
              <div>
                <h2 className="font-headline text-3xl font-bold mb-2 text-on-surface">Still need architectural assistance?</h2>
                <p className="text-on-surface-variant font-sans">Our support engineers are standing by for advanced node configuration.</p>
              </div>
              <Link href="/contact">
                <button className="bg-primary-container text-on-primary-container px-10 py-4 rounded-xl font-bold font-label hover:shadow-[0_0_30px_rgba(205,150,255,0.3)] transition-all whitespace-nowrap uppercase tracking-widest text-[10px]">
                  Initialize Priority Support
                </button>
              </Link>
            </div>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
