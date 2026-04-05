import PublicLayout from "@/components/public/PublicLayout";

const sections = [
  {
    title: "Information We Collect",
    body: `When you create an OpSoul account or sign in with Google OAuth, we collect the following information: your full name, email address, and OAuth access tokens required to authenticate your session. We do not collect payment card numbers directly — billing is processed by our payment provider and only metadata such as subscription status and plan tier is stored on our servers.`,
  },
  {
    title: "How We Use Your Data",
    body: `Your data is used exclusively to power the OpSoul Operator platform. This includes creating and managing your Operators, storing their memory and knowledge bases, processing chat interactions, and maintaining your account session. We do not use your data to train third-party AI models, and we do not share your data with advertisers or data brokers under any circumstances.`,
  },
  {
    title: "We Never Sell Your Data",
    body: `OpSoul does not sell, rent, or trade your personal information to any third party. Full stop. Your data belongs to you, and our business model is based entirely on subscription fees — not data monetisation.`,
  },
  {
    title: "Data Storage and Security",
    body: `Your data is stored in encrypted databases hosted on infrastructure that meets industry-standard security requirements. All data in transit is protected by TLS. Access to production databases is restricted to authorised OpSoul engineers only, and access is logged and audited.`,
  },
  {
    title: "Third-Party Services",
    body: `OpSoul integrates with third-party services to provide its functionality, including OpenRouter for AI inference and Neon for database hosting. These providers are bound by their own privacy policies and by contractual obligations to handle data securely. We do not authorise these providers to use your data for any purpose other than providing services to OpSoul.`,
  },
  {
    title: "Cookies and Session Data",
    body: `We use session cookies to keep you logged in across browser sessions. These cookies contain a signed session token — not your personal data — and expire when you log out or after a period of inactivity. We do not use tracking cookies or third-party advertising cookies.`,
  },
  {
    title: "Deleting Your Account and Data",
    body: `You have the right to delete your account and all associated data at any time. To request deletion, go to your account settings or send an email to privacy@opsoul.io with the subject line "Account Deletion Request". We will permanently delete your account, Operators, memory, messages, and all associated data within 30 days of your request. Note that data may persist in encrypted backups for up to 60 days after deletion for disaster-recovery purposes, after which it is purged entirely.`,
  },
  {
    title: "Data Retention",
    body: `Active account data is retained for as long as your account exists. If you cancel your subscription, your account enters a soft-delete state and data is retained for 30 days to allow for account recovery. After 30 days, your account and all associated data are permanently deleted.`,
  },
  {
    title: "Your Rights",
    body: `Depending on your jurisdiction, you may have rights including: the right to access the data we hold about you, the right to correct inaccurate data, the right to request deletion, and the right to data portability. To exercise any of these rights, please contact us at privacy@opsoul.io.`,
  },
  {
    title: "Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. When we do, we will update the "Last Updated" date at the top of this page and, for material changes, notify you by email. Continued use of OpSoul after changes are published constitutes acceptance of the updated policy.`,
  },
  {
    title: "Contact",
    body: `For any privacy-related questions or requests, please contact us at privacy@opsoul.io. We aim to respond to all privacy enquiries within 5 business days.`,
  },
];

export default function PrivacyPage() {
  return (
    <PublicLayout>
      <main className="relative z-10 pt-32 pb-24 px-6 md:px-8 max-w-4xl mx-auto">
        <header className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <span className="status-beacon" />
            <span className="font-label uppercase tracking-[0.2em] text-[10px] text-secondary font-semibold">
              Legal
            </span>
          </div>
          <h1 className="font-headline text-6xl md:text-7xl font-bold tracking-tighter text-primary leading-[0.9] mb-6">
            Privacy Policy
          </h1>
          <p className="font-sans text-base text-on-surface-variant">
            Last updated: April 2026
          </p>
          <p className="font-sans text-lg text-on-surface-variant max-w-2xl mt-4 leading-relaxed">
            OpSoul is built on a simple principle: your data belongs to you. This policy explains exactly what we collect, why, and how you can control it.
          </p>
        </header>

        <div className="glass-panel p-8 md:p-12 rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.4)] space-y-10">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-headline text-xl font-semibold text-primary mb-3 tracking-tight">
                {section.title}
              </h2>
              <p className="font-sans text-base text-on-surface-variant leading-relaxed">
                {section.body}
              </p>
            </section>
          ))}

          <div className="pt-6 border-t border-outline-variant/20">
            <p className="font-label uppercase tracking-widest text-[10px] text-on-surface-variant">
              OpSoul · privacy@opsoul.io · Based in the UAE
            </p>
          </div>
        </div>
      </main>
    </PublicLayout>
  );
}
