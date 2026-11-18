import type { Metadata } from "next";
import Link from "next/link";
import { ProductExplainerVideo } from "@/components/marketing/product-explainer-video";

export const metadata: Metadata = {
  title: "How GrantsCopilot Works | Product Walkthrough",
  description:
    "Watch how Business DNA, funding discovery, evidence checks and editable drafts help you prepare your next application.",
};

const steps = [
  [
    "Build your Business DNA",
    "Capture your business, team and funding goals so preparation starts with your context.",
  ],
  [
    "Discover relevant opportunities",
    "Explore funding matches and deadlines. Review the original funder’s requirements before deciding to apply.",
  ],
  [
    "Prepare with evidence",
    "Use your profile and grant context to draft answers, checklists and documents. Confirm missing facts and add genuine supporting evidence.",
  ],
  [
    "Review and apply",
    "Edit your drafts, check the funder’s instructions and submit through the application route. Funding decisions remain with the funder.",
  ],
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-[#f4f7fd] text-[#071a3a]">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6">
        <Link href="/" className="text-xl font-extrabold">
          Grants<span className="text-blue-600">Copilot</span>
        </Link>
        <Link
          href="/sign-up"
          className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
        >
          Get started free
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-16">
        <div className="mx-auto max-w-3xl py-8 text-center sm:py-12">
          <p className="mb-4 text-sm font-bold uppercase tracking-widest text-blue-600">
            See how it works · 48 seconds
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            From funding search to a clearer next step.
          </h1>
          <p className="mt-5 text-lg text-slate-600">
            Your Business DNA connects discovery, evidence and editable
            application drafts in one workspace.
          </p>
        </div>
        <ProductExplainerVideo />
        <p className="mt-3 text-sm text-slate-600">
          Real dashboard, business profile, Founder Pack and notification
          screens, alongside animated transitions. Enable English captions using
          the player controls.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {steps.map(([title, description], index) => (
            <section
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-6"
            >
              <p className="mb-3 text-sm font-bold text-blue-600">
                0{index + 1}
              </p>
              <h2 className="text-xl font-bold">{title}</h2>
              <p className="mt-3 leading-relaxed text-slate-600">
                {description}
              </p>
            </section>
          ))}
        </div>
        <details className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer font-bold">
            Read the video transcript
          </summary>
          <div className="mt-4 space-y-4 leading-relaxed text-slate-600">
            <p>Meet GrantsCopilot.</p>
            <p>
              The dashboard shows fresh grants, suggested matches, deadlines,
              prep runs, and notification health at a glance.
            </p>
            <p>
              Opportunities are scored against your Business DNA, while Data
              Vault keeps profile details, team data, and documents ready for
              reuse.
            </p>
            <p>
              Choose a grant, then generate eligibility summaries, checklists,
              answers, pitch decks, and supporting documents from one workspace.
            </p>
            <p>
              Daily emails keep opportunities visible, WhatsApp highlights only
              the strongest matches, and admin diagnostics show what happened.
            </p>
            <p>
              GrantsCopilot helps founders move from search to application-ready
              faster.
            </p>
          </div>
        </details>
        <div className="mt-10 text-center">
          <Link
            href="/sign-up"
            className="inline-flex rounded-xl bg-blue-600 px-7 py-4 font-bold text-white hover:bg-blue-700"
          >
            Create your Business DNA →
          </Link>
          <p className="mt-4 text-sm text-slate-600">
            Applicants review and submit their applications. Funding is not
            guaranteed.
          </p>
        </div>
      </main>
    </div>
  );
}
