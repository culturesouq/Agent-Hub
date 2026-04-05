import PublicLayout from "@/components/public/PublicLayout";

const sections = [
  {
    title: "What Is OpSoul",
    body: `OpSoul is a private AI Operator platform that lets individuals and teams design, deploy, and manage autonomous AI Operators — each with its own identity, memory, knowledge base, and capabilities. OpSoul is provided as a subscription-based software-as-a-service. By creating an account and using OpSoul, you agree to these Terms of Service.`,
  },
  {
    title: "Eligibility",
    body: `You must be at least 18 years old to use OpSoul. By creating an account, you represent that you meet this requirement and that the information you provide is accurate. Accounts are personal and non-transferable unless you are accessing OpSoul under an enterprise agreement.`,
  },
  {
    title: "Acceptable Use",
    body: `You agree to use OpSoul only for lawful purposes. You must not use OpSoul to generate content that is illegal, harmful, harassing, defamatory, fraudulent, or that violates the rights of others. You must not attempt to circumvent rate limits, reverse-engineer the platform, scrape data, or use OpSoul to build a competing product. We reserve the right to suspend or terminate accounts that violate these terms without notice.`,
  },
  {
    title: "Your Operators and Content",
    body: `You retain ownership of all content you create in OpSoul, including Operator identities, knowledge base entries, and messages. By uploading content to OpSoul, you grant us a limited, non-exclusive licence to store and process that content solely for the purpose of providing the service to you. We do not claim any rights over your Operators or their outputs.`,
  },
  {
    title: "Subscription and Billing",
    body: `OpSoul is offered on a subscription basis. Your subscription renews automatically at the end of each billing period unless you cancel before the renewal date. You authorise us to charge your payment method on file at the start of each billing cycle. All prices are shown exclusive of any applicable taxes, which are your responsibility.`,
  },
  {
    title: "Refund Policy",
    body: `We offer a 7-day refund window from the date of your initial subscription purchase. If you are not satisfied within the first 7 days, contact us at legal@opsoul.io and we will issue a full refund. After the 7-day window, all subscription payments are non-refundable. Partial-period refunds are not provided upon cancellation — you retain access until the end of the paid billing period.`,
  },
  {
    title: "Account Cancellation and Data Retention",
    body: `You may cancel your subscription at any time from your account settings. Upon cancellation, your account enters a soft-delete state. Your Operators, memory, and all associated data are retained for 30 days to allow for account recovery. After 30 days, your account and all data are permanently and irreversibly deleted. If you wish to recover your account within the 30-day window, contact support@opsoul.io.`,
  },
  {
    title: "Account Suspension",
    body: `We reserve the right to suspend or terminate your account at any time if you breach these Terms, engage in fraudulent activity, or use OpSoul in a manner that harms other users or the integrity of the platform. In cases of non-payment, we will attempt to notify you before suspending access. Where suspension is due to a terms violation, we may act without prior notice.`,
  },
  {
    title: "Service Availability",
    body: `We aim to provide a reliable and continuously available service, but we do not guarantee 100% uptime. OpSoul may be temporarily unavailable due to maintenance, infrastructure incidents, or events outside our control. We are not liable for any losses arising from service interruptions.`,
  },
  {
    title: "Limitation of Liability",
    body: `To the maximum extent permitted by applicable law, OpSoul and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform. Our total liability to you for any claim shall not exceed the amount you paid to OpSoul in the 3 months preceding the claim.`,
  },
  {
    title: "Governing Law",
    body: `These Terms of Service are governed by and construed in accordance with the laws of the United Arab Emirates. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of the UAE. If you are accessing OpSoul from outside the UAE, you are responsible for compliance with local laws.`,
  },
  {
    title: "Changes to These Terms",
    body: `We may update these Terms from time to time. We will notify you of material changes by email at least 14 days before they take effect. Continued use of OpSoul after the effective date of updated Terms constitutes acceptance. If you do not agree to updated Terms, you must cancel your account before the effective date.`,
  },
  {
    title: "Contact",
    body: `For any questions about these Terms of Service, please contact us at legal@opsoul.io. For billing inquiries, contact billing@opsoul.io. We aim to respond to all legal enquiries within 5 business days.`,
  },
];

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="font-sans text-base text-on-surface-variant">
            Last updated: April 2026
          </p>
          <p className="font-sans text-lg text-on-surface-variant max-w-2xl mt-4 leading-relaxed">
            Please read these terms carefully before using OpSoul. By creating an account, you agree to be bound by them.
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
              OpSoul · legal@opsoul.io · Based in the UAE
            </p>
          </div>
        </div>
      </main>
    </PublicLayout>
  );
}
