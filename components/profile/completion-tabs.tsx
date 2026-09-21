"use client";
import { useEffect, useState } from "react";
import { profileCompletionFields } from "@/lib/profile-completion";
import { Button } from "@/components/ui/button";
export function CompletionTabs({
  profile,
  onSelect,
  sectionLabels,
  activeStep,
}: {
  profile: Record<string, unknown>;
  sectionLabels: string[];
  activeStep: number;
  onSelect: (step: number, field: string) => void;
}) {
  const fields = profileCompletionFields(profile);
  const missing = fields.filter((f) => !f.complete);
  const [tab, setTab] = useState(missing.length ? "incomplete" : "complete");
  useEffect(() => {
    const show = () => {
      setTab("incomplete");
      document
        .getElementById("profile-completion")
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    if (
      new URLSearchParams(window.location.search).get("completion") ===
      "incomplete"
    )
      show();
    window.addEventListener("profile:show-incomplete", show);
    return () => window.removeEventListener("profile:show-incomplete", show);
  }, []);
  return (
    <section
      id="profile-completion"
      className="sticky top-24 z-20 scroll-mt-28 rounded-xl border bg-white p-4 shadow-sm"
    >
      <h2 className="mb-1 text-lg font-semibold">Complete your profile</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {missing.length
          ? `${missing.length} fields left. Select a field to fill it in.`
          : "Core fields complete. Review your saved information below."}
      </p>
      <nav
        aria-label="Profile sections"
        className="mb-3 flex gap-2 overflow-x-auto pb-2"
      >
        {sectionLabels.map((label, index) => {
          const sectionFields = fields.filter((f) => f.step === index + 1);
          const gaps = sectionFields.filter((f) => !f.complete);
          const complete = sectionFields.length > 0 && gaps.length === 0;
          const status = complete
            ? "✓ Complete"
            : gaps.length
              ? `${gaps.length} fields left`
              : "Review section";
          return (
            <button
              type="button"
              key={label}
              aria-current={activeStep === index + 1 ? "step" : undefined}
              onClick={() =>
                onSelect(index + 1, gaps[0]?.key ?? sectionFields[0]?.key ?? "")
              }
              className={`min-w-32 flex-1 rounded-lg border p-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${complete ? "border-emerald-200 bg-emerald-50 text-emerald-900" : gaps.length ? "border-amber-200 bg-amber-50 text-amber-950" : "border-slate-200 bg-slate-50 text-slate-700"} ${activeStep === index + 1 ? "ring-2 ring-blue-500 ring-offset-1" : "hover:brightness-95"}`}
            >
              <span className="block font-semibold">{label}</span>
              <span className="mt-1 block text-xs">{status}</span>
            </button>
          );
        })}
      </nav>
      <div
        className="flex gap-2"
        role="tablist"
        aria-label="Business profile completion"
      >
        {(["incomplete", "complete"] as const).map((t) => (
          <Button
            key={t}
            role="tab"
            aria-selected={tab === t}
            variant="outline"
            onClick={() => setTab(t)}
          >
            {t === "incomplete" ? "Incomplete" : "Complete"} (
            {fields.filter((f) => f.complete === (t === "complete")).length})
          </Button>
        ))}
      </div>
      <div
        role="tabpanel"
        className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto"
      >
        {fields
          .filter((f) => f.complete === (tab === "complete"))
          .map((f) => (
            <button
              type="button"
              className={`rounded-lg border px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-blue-600 ${f.complete ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}
              key={f.key}
              onClick={() => onSelect(f.step, f.key)}
            >
              {f.complete ? "✓ " : "○ "}
              {f.label} →
            </button>
          ))}
        {tab === "incomplete" && !missing.length && (
          <p>
            Core profile facts complete. Each grant may require additional
            evidence.
          </p>
        )}
      </div>
    </section>
  );
}
