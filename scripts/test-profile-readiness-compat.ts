import assert from "node:assert/strict";
import { missingReadinessColumn, preserveReadinessMetadata, restoreReadinessMetadata } from "../lib/profile-readiness-compat";

const stored = preserveReadinessMetadata("Hire staff", { documentReadiness: "Ready", fundingPosition: "Seeking first grant", previousGrantHistory: "None", ignored: "no" });
const restored = restoreReadinessMetadata({ fundingDetails: stored, documentReadiness: null });
assert.equal(restored.fundingDetails, "Hire staff");
assert.equal(restored.documentReadiness, "Ready");
assert.equal((restored as Record<string, unknown>).previousGrantHistory, "None");
assert.equal((restored as Record<string, unknown>).ignored, undefined);
assert.equal(restoreReadinessMetadata({ fundingDetails: stored, documentReadiness: "Updated" }).documentReadiness, "Updated");
assert.equal(restoreReadinessMetadata({ fundingDetails: "Original text" }).fundingDetails, "Original text");
assert.equal(restoreReadinessMetadata({ fundingDetails: "Text\n\n[GrantsCopilot readiness metadata]\n{broken" }).fundingDetails, "Text\n\n[GrantsCopilot readiness metadata]\n{broken");
assert.equal(missingReadinessColumn({ code: "PGRST204", message: "Could not find the 'documentReadiness' column" }), "documentReadiness");
assert.equal(missingReadinessColumn({ code: "42703", message: 'column BusinessProfile.documentReadiness does not exist' }), "documentReadiness");
assert.equal(missingReadinessColumn({ code: "42501", message: "permission denied for documentReadiness" }), undefined);
assert.equal(missingReadinessColumn({ code: "PGRST204", message: "Could not find the 'fundingMin' column" }), undefined);
console.log("Profile readiness compatibility checks passed");
