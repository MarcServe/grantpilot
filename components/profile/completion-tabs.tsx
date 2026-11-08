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
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState(missing.length ? "incomplete" : "complete");
  useEffect(() => {
    const show = () => {
      setExpanded(true);
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
      className="scroll-mt-24 rounded-xl border bg-white p-3 shadow-sm sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Business DNA progress</h2>
          <p className="text-xs text-muted-foreground" role="status">
            {fields.length - missing.length} of {fields.length} details saved
            {missing.length ? ` · ${missing.length} left` : " · Core profile complete"}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" aria-expanded={expanded}
          aria-controls="profile-completion-checklist" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Hide checklist" : "Show checklist"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Save a step to update your progress. Documents are optional for finding grants.</p>
      <nav
        aria-label="Profile sections"
        className="mt-3 flex gap-2 overflow-x-auto pb-2"
      >
        {sectionLabels.map((label, index) => {
          const sectionFields = fields.filter((f) => f.step === index + 1);
          const gaps = sectionFields.filter((f) => !f.complete);
          const complete = sectionFields.length > 0 && gaps.length === 0;
          const status = complete
            ? "✓ Saved"
            : gaps.length
              ? `${gaps.length} fields left`
              : index + 1 === 5 ? "Optional uploads" : "Additional details";
          return (
            <button
              type="button"
              key={label}
              aria-current={activeStep === index + 1 ? "step" : undefined}
              onClick={() => {
                setExpanded(false);
                onSelect(index + 1, gaps[0]?.key ?? sectionFields[0]?.key ?? "");
              }}
              className={`min-w-28 flex-1 rounded-lg border px-3 py-2 text-left text-sm transition hover:shadow-md active:scale-[0.98] motion-reduce:transform-none focus-visible:outline-2 focus-visible:outline-blue-600 ${complete ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100" : gaps.length ? "border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100" : "border-slate-200 bg-slate-50 text-slate-700"} ${activeStep === index + 1 ? "ring-2 ring-blue-500 ring-offset-1" : "hover:brightness-95"}`}
            >
              <span className="block font-semibold">{label}</span>
              <span className="mt-1 block text-xs">{status}</span>
            </button>
          );
        })}
      </nav>
      <div id="profile-completion-checklist" hidden={!expanded}>
      <div
        className="mt-3 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Business profile completion"
      >
        {(["incomplete", "complete"] as const).map((t) => (
          <Button
            key={t}
            role="tab"
            aria-selected={tab === t}
            variant="outline"
            className={`transition hover:shadow-md active:scale-[0.98] motion-reduce:transform-none ${t === "complete" ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 hover:text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 hover:text-amber-950"} ${tab === t ? "ring-2 ring-current ring-offset-1" : ""}`}
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
              className={`rounded-lg border px-3 py-2 text-left text-sm transition hover:shadow-md active:scale-[0.98] motion-reduce:transform-none focus-visible:outline-2 focus-visible:outline-blue-600 ${f.complete ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100" : "border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100"}`}
              key={f.key}
              onClick={() => {
                setExpanded(false);
                onSelect(f.step, f.key);
              }}
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
      </div>
    </section>
  );
}
