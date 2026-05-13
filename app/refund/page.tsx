import Link from "next/link";

export default function RefundPage() {
  return (
    <main className="min-h-screen bg-[#f7fbff] px-4 py-10 text-[#071a3a] sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#d8e2f2] bg-white p-6 shadow-[0_18px_45px_rgba(7,26,58,0.07)] sm:p-8">
        <Link href="/" className="text-sm font-black text-[#2167e8]">GrantsCopilot</Link>
        <h1 className="mt-5 text-3xl font-black">Refund Policy</h1>
        <p className="mt-4 text-sm font-semibold text-[#51627d]">Last updated: 13 May 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-[#334766]">
          <section>
            <h2 className="text-lg font-black text-[#071a3a]">Beta subscriptions</h2>
            <p className="mt-2">You can cancel future renewals from billing settings or by contacting support. Access normally continues until the end of the paid billing period.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#071a3a]">Refund requests</h2>
            <p className="mt-2">Refunds are reviewed case by case. For first paid beta customers, we will normally consider a refund within 14 days of purchase where the account has not substantially used paid AI generation, grant scoring, or document export features.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#071a3a]">Non-refundable cases</h2>
            <p className="mt-2">We generally do not refund used billing periods, completed AI generation work, document packs already exported, or outcomes outside our control, including grant rejection or a funder changing a deadline or application link.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#071a3a]">How to request help</h2>
            <p className="mt-2">Contact support with your account email, organisation name, billing date, and reason for the request so we can review it quickly.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
