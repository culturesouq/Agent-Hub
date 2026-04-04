import PublicNav from "@/components/public/PublicNav";
import PublicFooter from "@/components/public/PublicFooter";
import NebulaBlobs from "@/components/ui/NebulaBlobs";

const docNav = [
  {
    section: "Foundation",
    items: [
      { icon: "play_arrow", label: "Getting Started", href: "#overview",     active: true  },
      { icon: "auto_awesome", label: "Soul",           href: "#doc-soul",     active: false },
      { icon: "bolt",         label: "Skills",         href: "#doc-skills",   active: false },
    ],
  },
  {
    section: "Cognition",
    items: [
      { icon: "database",    label: "Memory", href: "#doc-memory", active: false },
      { icon: "trending_up", label: "Growth", href: "#doc-growth", active: false },
    ],
  },
  {
    section: "Execution",
    items: [
      { icon: "assignment", label: "Tasks", href: "#doc-tasks", active: false },
      { icon: "folder",     label: "Files", href: "#doc-files", active: false },
    ],
  },
  {
    section: "Networking",
    items: [
      { icon: "hub",      label: "Connections", href: "#doc-connections", active: false },
      { icon: "podcasts", label: "Channels",    href: "#doc-channels",    active: false },
    ],
  },
  {
    section: "System",
    items: [
      { icon: "settings",           label: "Settings",      href: "#doc-settings",  active: false },
      { icon: "admin_panel_settings", label: "Admin",       href: "#doc-admin",     active: false },
      { icon: "api",                label: "API Reference", href: "#doc-api",        active: false },
    ],
  },
];

function DocStubSection({ id, icon, title, description }: { id: string; icon: string; title: string; description: string }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-2xl font-headline font-semibold text-primary mb-4 flex items-center gap-3">
        <span className="w-8 h-px bg-primary/30" />
        <span className="material-symbols-outlined text-2xl select-none">{icon}</span>
        {title}
      </h2>
      <div className="glass-panel p-6 rounded-2xl border border-outline-variant/10 flex items-start gap-4">
        <span className="material-symbols-outlined text-slate-600 text-3xl mt-0.5 select-none">construction</span>
        <div>
          <p className="text-on-surface-variant font-sans leading-relaxed">{description}</p>
          <p className="text-[10px] font-label uppercase tracking-widest text-slate-600 mt-3">Full documentation coming soon</p>
        </div>
      </div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-on-surface relative overflow-hidden">
      <NebulaBlobs />
      <div className="fixed inset-0 pointer-events-none z-0"
        style={{ backgroundImage: "radial-gradient(rgba(224,182,255,0.03) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
      />

      <PublicNav />

      <div className="flex pt-20 min-h-screen">
        {/* Left sidebar */}
        <aside className="fixed left-0 top-0 h-full w-72 z-40 bg-slate-950/80 backdrop-blur-2xl flex flex-col py-24 shadow-[20px_0_40px_rgba(0,0,0,0.3)] bg-gradient-to-r from-slate-900/50 to-transparent">
          <div className="px-6 mb-8">
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm select-none">search</span>
              <input
                className="w-full bg-surface-container-highest border-none rounded-lg pl-10 pr-4 py-2 text-[10px] font-label tracking-widest text-on-surface-variant outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-slate-600 transition-all"
                placeholder="SEARCH PROTOCOL..."
                type="text"
              />
            </div>
          </div>
          <div className="overflow-y-auto px-2 flex-grow space-y-1">
            {docNav.map((group) => (
              <div key={group.section}>
                <div className="px-4 py-2 text-[9px] font-label uppercase tracking-[0.2em] text-slate-600 font-bold">{group.section}</div>
                {group.items.map((item) => (
                  <a
                    key={item.label}
                    className={`flex items-center gap-3 px-4 py-3 font-label uppercase tracking-widest text-[10px] transition-all ${
                      item.active
                        ? "text-primary bg-primary/10 rounded-r-full translate-x-1"
                        : "text-slate-500 hover:text-primary hover:bg-white/5"
                    }`}
                    href={item.href}
                  >
                    <span className="material-symbols-outlined text-sm select-none">{item.icon}</span>
                    {item.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <div className="px-6 py-6 border-t border-white/5">
            <button className="w-full bg-primary/10 hover:bg-primary/20 text-primary font-label uppercase tracking-widest text-[9px] py-3 rounded-lg transition-colors border border-primary/20">
              Deploy New Node
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-grow ml-72 p-12 overflow-y-auto relative z-10">
          <div className="max-w-4xl mx-auto">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 mb-8 text-[10px] font-label uppercase tracking-[0.2em] text-slate-500">
              <span>Documentation</span>
              <span className="material-symbols-outlined text-xs select-none">chevron_right</span>
              <span>Foundation</span>
              <span className="material-symbols-outlined text-xs select-none">chevron_right</span>
              <span className="text-secondary font-bold">Getting Started</span>
            </div>

            {/* Page header */}
            <header id="overview" className="mb-12 relative scroll-mt-24">
              <div className="status-beacon absolute -left-6 top-6" />
              <h1 className="text-6xl font-headline font-bold text-on-surface tracking-tighter mb-4">
                What is an <span className="text-primary">Operator</span>?
              </h1>
              <p className="text-xl text-on-surface-variant font-light max-w-2xl leading-relaxed font-sans">
                An Operator is the fundamental unit of the OpSoul ecosystem—a sovereign, autonomous digital entity capable of complex reasoning, persistent memory, and execution across decentralized networks.
              </p>
            </header>

            {/* Hero visual */}
            <div className="w-full h-64 rounded-2xl mb-12 overflow-hidden relative group bg-gradient-to-br from-primary/20 via-[#6f389b]/20 to-secondary/10 border border-primary/10">
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="material-symbols-outlined text-8xl text-primary/20 select-none">hub</span>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[#131317] via-transparent to-transparent" />
              <div className="absolute bottom-6 left-6">
                <div className="flex items-center gap-2 text-secondary bg-secondary/10 backdrop-blur-md px-3 py-1 rounded-full border border-secondary/20">
                  <span className="material-symbols-outlined text-sm select-none">verified</span>
                  <span className="text-[9px] font-label uppercase tracking-widest font-bold">Protocol Validated</span>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="space-y-12">
              <section id="core-architecture" className="scroll-mt-24">
                <h2 className="text-2xl font-headline font-semibold text-primary mb-6 flex items-center gap-3">
                  <span className="w-8 h-px bg-primary/30" /> Core Architecture
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-primary/20 transition-colors">
                    <span className="material-symbols-outlined text-primary text-3xl mb-4 block select-none">psychology</span>
                    <h3 className="text-lg font-headline font-medium text-on-surface mb-2">Autonomous Soul</h3>
                    <p className="text-sm text-on-surface-variant leading-relaxed font-sans">
                      Every Operator possesses a unique 'Soul' hash—a cryptographic identity that defines their personality, ethics, and base directives.
                    </p>
                  </div>
                  <div className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-primary/20 transition-colors">
                    <span className="material-symbols-outlined text-secondary text-3xl mb-4 block select-none">memory</span>
                    <h3 className="text-lg font-headline font-medium text-on-surface mb-2">Vectorized Memory</h3>
                    <p className="text-sm text-on-surface-variant leading-relaxed font-sans">
                      Operators utilize high-dimensional vector databases to store and retrieve experiences, ensuring context is never lost across sessions.
                    </p>
                  </div>
                </div>
              </section>

              <section id="initialization" className="scroll-mt-24">
                <h2 className="text-2xl font-headline font-semibold text-primary mb-6 flex items-center gap-3">
                  <span className="w-8 h-px bg-primary/30" /> Initializing Your First Operator
                </h2>
                <p className="text-on-surface-variant mb-6 leading-relaxed font-sans">
                  To begin, you must deploy a localized instance of the <span className="text-primary font-bold">OpSoul CLI</span>. This allows for direct communication with the Protocol layer and the spawning of your first Operator entity.
                </p>
                <div className="bg-surface-container-lowest rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
                  <div className="flex items-center justify-between px-6 py-3 bg-white/5 border-b border-white/5">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500/50" />
                      <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                      <div className="w-2 h-2 rounded-full bg-green-500/50" />
                    </div>
                    <span className="text-[9px] font-label uppercase tracking-widest text-slate-500">Terminal — opsoul-init</span>
                  </div>
                  <div className="p-8 font-mono text-sm space-y-2">
                    <div className="flex gap-4">
                      <span className="text-slate-600">01</span>
                      <span><span className="text-secondary">npm</span> <span className="text-on-surface">install -g @opsoul/core</span></span>
                    </div>
                    <div className="flex gap-4">
                      <span className="text-slate-600">02</span>
                      <span className="text-slate-400"># Initializing sovereign handshake</span>
                    </div>
                    <div className="flex gap-4">
                      <span className="text-slate-600">03</span>
                      <span><span className="text-primary">opsoul</span> <span className="text-on-surface">init --name "Astra-01"</span></span>
                    </div>
                    <div className="flex gap-4">
                      <span className="text-slate-600">04</span>
                      <span className="text-slate-400"># Output: [SUCCESS] Operator Astra-01 deployed to local mesh.</span>
                    </div>
                    <div className="flex gap-4">
                      <span className="text-slate-600">05</span>
                      <span><span className="text-primary">opsoul</span> <span className="text-on-surface">connect --id 0x4f2...9a</span></span>
                    </div>
                  </div>
                </div>
              </section>

              {/* CTA */}
              <section className="pb-4">
                <div className="bg-gradient-to-br from-primary/10 to-transparent p-8 rounded-3xl border border-primary/20 flex flex-col md:flex-row items-center gap-8">
                  <div className="flex-grow">
                    <h2 className="text-2xl font-headline font-bold text-on-surface mb-2">Ready for the Deep Dive?</h2>
                    <p className="text-on-surface-variant text-sm max-w-md font-sans">
                      Learn how to configure your Operator's 'Soul' parameters to specialize in specific data patterns and high-level logic tasks.
                    </p>
                  </div>
                  <a href="#doc-soul" className="bg-primary text-on-primary px-8 py-4 rounded-full font-label uppercase tracking-widest text-xs font-black flex items-center gap-3 whitespace-nowrap hover:shadow-[0_0_30px_rgba(224,182,255,0.4)] transition-all">
                    Protocol Guide: Soul Logic
                    <span className="material-symbols-outlined select-none">arrow_forward</span>
                  </a>
                </div>
              </section>

              {/* Section stubs — Foundation */}
              <DocStubSection
                id="doc-soul"
                icon="auto_awesome"
                title="Soul"
                description="The Soul defines your Operator's core identity: name, archetype, mandate, language, and behavioral constraints. It is the root-of-trust for all downstream cognitive behavior and forms an immutable hash once locked."
              />
              <DocStubSection
                id="doc-skills"
                icon="bolt"
                title="Skills"
                description="Skills are modular capability packages that Operators can install, activate, and compose. Platform Skills are globally available; custom Skills can be authored and applied per-Operator."
              />

              {/* Cognition */}
              <DocStubSection
                id="doc-memory"
                icon="database"
                title="Memory"
                description="Operators store and retrieve experiences via pgvector semantic search. Memory entries are scored by relevance and importance, distilled over time, and softly decayed so the most relevant context is always surfaced in chat."
              />
              <DocStubSection
                id="doc-growth"
                icon="trending_up"
                title="Growth (GROW)"
                description="GROW is the autonomous self-evolution engine. It analyzes conversation patterns, generates behavioral proposals, and—with owner approval—applies targeted updates to the Operator's Soul and directive stack."
              />

              {/* Execution */}
              <DocStubSection
                id="doc-tasks"
                icon="assignment"
                title="Tasks"
                description="Operators maintain a persistent task queue. Tasks can be created manually or generated autonomously during conversations. Each task tracks status, priority, and linked context."
              />
              <DocStubSection
                id="doc-files"
                icon="folder"
                title="Files"
                description="Operators can store, retrieve, and reason over uploaded files. Files are indexed and made available as context during chat, enabling document-aware interactions."
              />

              {/* Networking */}
              <DocStubSection
                id="doc-connections"
                icon="hub"
                title="Connections"
                description="Operators connect to external services via the Integrations layer. OAuth-based and API-key connectors enable Operators to read/write data across Gmail, Google Calendar, Outlook, and more."
              />
              <DocStubSection
                id="doc-channels"
                icon="podcasts"
                title="Channels"
                description="Deploy your Operator to messaging channels like Telegram and WhatsApp. Channel adapters route inbound messages directly into the Operator's conversation engine."
              />

              {/* System */}
              <DocStubSection
                id="doc-settings"
                icon="settings"
                title="Settings"
                description="Configure your Operator's underlying AI model, API access tokens, behavior flags (Safe Mode), and danger-zone operations like reset or decommission."
              />
              <DocStubSection
                id="doc-admin"
                icon="admin_panel_settings"
                title="Admin"
                description="Sovereign Admin access provides a platform-level overview: all Operators, all Owners, audit logs, and system health metrics. Only accounts with isSovereignAdmin may access this panel."
              />
              <DocStubSection
                id="doc-api"
                icon="api"
                title="API Reference"
                description="The OpSoul REST API is available to all Pro+ plans. Authenticate via Bearer token and interact with any Operator endpoint programmatically. Full OpenAPI specification available on request."
              />
            </div>
          </div>
        </main>

        {/* Right outline */}
        <aside className="hidden xl:block w-64 p-12 overflow-y-auto">
          <div className="sticky top-24">
            <div className="text-[9px] font-label uppercase tracking-[0.2em] text-slate-500 font-bold mb-6">On this page</div>
            <nav className="space-y-4">
              <a className="block text-[10px] font-label uppercase tracking-widest text-primary border-l border-primary pl-4" href="#overview">Overview</a>
              <a className="block text-[10px] font-label uppercase tracking-widest text-slate-500 hover:text-on-surface pl-4 transition-colors" href="#core-architecture">Core Architecture</a>
              <a className="block text-[10px] font-label uppercase tracking-widest text-slate-500 hover:text-on-surface pl-4 transition-colors" href="#initialization">Initialization</a>
            </nav>
            <div className="mt-12 p-4 bg-secondary/5 rounded-xl border border-secondary/10">
              <div className="text-secondary text-[10px] font-bold font-label uppercase tracking-widest mb-2">System Status</div>
              <div className="flex items-center gap-2">
                <div className="status-beacon" />
                <span className="text-[10px] text-slate-400 font-label uppercase tracking-widest">Mainnet Live</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <PublicFooter />
    </div>
  );
}
