import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f7fbff] px-4 py-10 text-[#071a3a] sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#d8e2f2] bg-white p-6 shadow-[0_18px_45px_rgba(7,26,58,0.07)] sm:p-8">
        <Link href="/" className="text-sm font-black text-[#2167e8]">GrantsCopilot</Link>
        <h1 className="mt-5 text-3xl font-black">Privacy Policy</h1>
        <p className="mt-4 text-sm font-semibold text-[#51627d]">Last updated: 13 May 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-[#334766]">
          <section>
            <h2 className="text-lg font-black text-[#071a3a]">What we collect</h2>
            <p className="mt-2">We collect account details, organisation details, business profile information, uploaded documents, grant preferences, generated pack content, usage records, and notification preferences needed to run the service.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#071a3a]">How we use data</h2>
            <p className="mt-2">We use your data to find grants, check eligibility through the OpenAI-powered checker, prepare application materials, send reminders, manage billing, secure the product, and improve reliability. Other discovery providers may find grant records, but trusted eligibility decisions are routed through the OpenAI checker.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#071a3a]">AI and review</h2>
            <p className="mt-2">AI-generated outputs can be incomplete or inaccurate. Users must review grants, eligibility reasoning, documents, and application materials before relying on them or submitting anything to a funder.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#071a3a]">Service providers</h2>
            <p className="mt-2">We use infrastructure and service providers such as Supabase, Stripe, OpenAI, email/notification providers, and hosting/observability providers. We only send data needed for the relevant product function.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#071a3a]">Your choices</h2>
            <p className="mt-2">You can update your profile, notification preferences, and billing plan in the app. Contact support if you need account export or deletion support.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
