"use client";
import { useState } from "react";
export function FirstApplicationGuide() {
  const [visible, setVisible] = useState(true);
  return visible ? (
    <aside className="rounded-xl border bg-blue-50 p-4">
      <button
        className="float-right text-sm underline"
        onClick={() => setVisible(false)}
      >
        Dismiss
      </button>
      <h2 className="font-semibold">Your first application</h2>
      <p>
        First verify that you meet the published rules. Then gather the
        evidence, prepare answers and review the final submission. Eligibility
        does not guarantee an award. Focus on your strongest opportunities
        before investing time in an application.
      </p>
    </aside>
  ) : null;
}
