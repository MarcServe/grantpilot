"use client";
import { useState } from "react";
import { profileCompletionFields } from "@/lib/profile-completion";
import { Button } from "@/components/ui/button";
export function CompletionTabs({
  profile,
  onSelect,
}: {
  profile: Record<string, unknown>;
  onSelect: (step: number, field: string) => void;
}) {
  const fields = profileCompletionFields(profile);
  const missing = fields.filter((f) => !f.complete);
  const [tab, setTab] = useState(missing.length ? "incomplete" : "complete");
  return (
    <section className="rounded-xl border p-4">
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
      <div role="tabpanel" className="mt-3 flex flex-wrap gap-2">
        {fields
          .filter((f) => f.complete === (tab === "complete"))
          .map((f) => (
            <button
              className="rounded border px-3 py-2 text-sm text-blue-700"
              key={f.key}
              onClick={() => onSelect(f.step, f.key)}
            >
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
