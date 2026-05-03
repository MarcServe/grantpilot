import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import type { ApplicationNeedingOutcome } from "@/lib/outcome-feedback";

export function OutcomeFeedbackBanner({ pending }: { pending: ApplicationNeedingOutcome[] }) {
  if (pending.length === 0) return null;

  const preview = pending.slice(0, 3);

  return (
    <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50 to-orange-50/80 px-5 py-4 shadow-[0_12px_32px_rgba(124,45,18,0.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <ClipboardCheck className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="font-black text-[#071a3a]">
              {pending.length === 1
                ? "1 submitted application needs an outcome"
                : `${pending.length} submitted applications need outcomes`}
            </p>
            <p className="mt-1 text-sm font-medium text-[#51627d]">
              When you hear back from funders, record the result so GrantsCopilot can improve future matches.
            </p>
            <ul className="mt-2 text-sm font-semibold text-[#243a5a]">
              {preview.map((p) => (
                <li key={p.applicationId}>
                  <Link
                    href={`/applications/${p.applicationId}`}
                    className="text-[#2167e8] underline-offset-4 hover:underline"
                  >
                    {p.grantName}
                  </Link>
                  {p.outcomeRecorded && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      (currently: {p.outcomeRecorded.replace(/_/g, " ")})
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {pending.length > preview.length && (
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                +{pending.length - preview.length} more on the full list
              </p>
            )}
          </div>
        </div>
        <Link
          href="/applications/outcomes"
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#2167e8] px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#1857c9]"
        >
          Review all
        </Link>
      </div>
    </div>
  );
}
