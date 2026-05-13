import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f7fbff] px-4 py-10 text-[#071a3a] sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#d8e2f2] bg-white p-6 shadow-[0_18px_45px_rgba(7,26,58,0.07)] sm:p-8">
        <Link href="/" className="text-sm font-black text-[#2167e8]">GrantsCopilot</Link>
        <h1 className="mt-5 text-3xl font-black">Terms of Service</h1>
        <p className="mt-4 text-sm font-semibold text-[#51627d]">Last updated: 13 May 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-[#334766]">
          <section>
            <h2 className="text-lg font-black text-[#071a3a]">Product scope</h2>
            <p className="mt-2">GrantsCopilot V1 provides grant discovery, eligibility qualification, deadline reminders, application preparation, founder pack generation, and funding workflow support. Auto-filing and direct submission workflows are V2 features and may remain limited, assisted, or human-in-the-loop.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#071a3a]">No guarantee</h2>
            <p className="mt-2">We do not guarantee grant availability, eligibility, submission acceptance, funding approval, investment, immigration outcome, or funder response. Users remain responsible for checking grant rules and submitting accurate information.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#071a3a]">Not professional advice</h2>
            <p className="mt-2">The app does not provide legal, financial, tax, accounting, immigration, or regulated grant-writing advice. Generated content is a draft starting point and should be reviewed by qualified advisers where needed.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#071a3a]">Acceptable use</h2>
            <p className="mt-2">Do not upload unlawful, misleading, or confidential third-party data you are not authorised to use. Do not use the app to submit false grant applications or bypass funder rules, login requirements, CAPTCHA, or security controls.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#071a3a]">Subscriptions</h2>
            <p className="mt-2">Paid plans renew according to the billing terms shown at checkout. Plan limits, features, and beta functionality may change as the product develops, but core paid access will not be intentionally removed during an active billing period without notice.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
