import { useState } from "react";
import PublicLayout from "@/components/public/PublicLayout";
import { Link } from "wouter";

const faqs = [
  { q: "How is billing calculated?", a: "Billing is simple — you pay a flat monthly or annual rate based on your plan. There are no per-message or per-conversation charges. Upgrading or downgrading your plan is prorated automatically at your next billing cycle." },
  { q: "Why is my Operator not responding?", a: "Try refreshing the page or starting a new conversation. If the issue continues, check our status page to see if there is a known incident. You can also reach our support team and we'll investigate within a few hours." },
  { q: "Can I transfer Operator ownership?", a: "Yes. You can initiate a transfer from the Operator's Settings tab. Both the current owner and the new owner will receive a confirmation email — once both parties confirm, the Operator and all its memory moves to the new account." },
  { q: "What happens if I delete an Operator?", a: "Deletion is permanent. All of the Operator's memory, conversations, Soul configuration, and tasks are removed and cannot be recovered. Consider exporting or noting any key context before deleting. You can create a new Operator in the freed slot immediately." },
  { q: "Is my data encrypted?", a: "Yes. All data — including conversations, memory, and Soul configuration — is encrypted in transit and at rest. We do not have access to your Operator's conversations or private memory." },
  { q: "How do I run more Operators?", a: "The number of Operators you can run simultaneously depends on your plan. You can upgrade at any time from your billing settings, or add individual Operator slots as a monthly add-on without switching plans." },
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
              <p className="text-on-surface-variant text-sm mb-6 leading-relaxed font-sans">Send us a message and we'll get back to you within 24 hours.</p>
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
              <h2 className="font-headline text-3xl font-bold uppercase tracking-widest text-center px-4 text-on-surface">Common Questions</h2>
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
