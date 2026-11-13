import Link from "next/link";
import { START_UP_LOANS, LOAN_DOCUMENTS } from "@/lib/start-up-loans-preparation";

export default function StartUpLoansPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold">Prepare a Start Up Loans application</h1>
        <p>British Business Bank programme · Public guidance checked {START_UP_LOANS.checkedAt}</p>
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-4">£500–£25,000 · Fixed interest of 7.5% a year · Repayment over 1–5 years. This is an unsecured personal loan for business use, with personal repayment responsibility.</p>
        <a href={START_UP_LOANS.apply} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground">Open official application form ↗</a>
        <p className="text-sm text-muted-foreground">The official application and lender support are free. GrantsCopilot provides independent preparation tools. Complete and submit the actual form on the lender’s portal.</p>
      </header>
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Who can apply?</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Individuals aged 18 or over, resident in the UK with the right to work here.</li>
          <li>A UK business starting up or trading for up to 60 months; check boundary cases with the lender.</li>
          <li>Unable to secure finance elsewhere, with an eligible business activity and loan purpose.</li>
          <li>Personal credit checks, ability to repay, and a viable business plan and forecast are assessed by the lender.</li>
        </ul>
        <p>Examples of excluded uses include debt repayment and education or training programmes. Some sectors are excluded; the full official list controls eligibility.</p>
        <a className="text-primary underline" href={START_UP_LOANS.eligibility} target="_blank" rel="noopener noreferrer">Read full eligibility and exclusions ↗</a>
      </section>
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Prepare your documents using Business DNA</h2>
        <p>Choose a draft below, confirm the selected business profile, and add your real figures and supporting facts before generating. You can edit the output and save it to Data Vault using the existing assistant controls.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(LOAN_DOCUMENTS).map(([key, item]) => <Link key={key} href={`/grant-assistant?scheme=start-up-loans&loanDocument=${key}`} className="rounded-lg border p-4 font-semibold text-primary hover:bg-muted focus-visible:outline-2">{item.title} →</Link>)}
        </div>
        <p className="text-sm text-muted-foreground">These are preparation drafts, not the exact private portal questions or completed lender spreadsheets. The lender also needs three months of personal bank statements and may request proof of identity, address and right to work. Supply genuine records directly to the lender; AI cannot create this evidence or verify creditworthiness.</p>
        <div className="flex flex-wrap gap-4 text-sm">
          <a className="text-primary underline" href={START_UP_LOANS.templates} target="_blank" rel="noopener noreferrer">Official document templates ↗</a>
          <a className="text-primary underline" href={START_UP_LOANS.documents} target="_blank" rel="noopener noreferrer">Evidence requirements ↗</a>
          <a className="text-primary underline" href={START_UP_LOANS.terms} target="_blank" rel="noopener noreferrer">Current loan terms ↗</a>
        </div>
      </section>
    </div>
  );
}
