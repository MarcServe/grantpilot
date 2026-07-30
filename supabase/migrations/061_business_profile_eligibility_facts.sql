-- Confirmed edge-case eligibility facts for grant scoring and Founder Pack context.
-- Examples: property owner, leaseholder, match funding available, certifications,
-- trading-history evidence, regulated status, partner commitments.

ALTER TABLE "BusinessProfile"
  ADD COLUMN IF NOT EXISTS "eligibilityFacts" JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN "BusinessProfile"."eligibilityFacts" IS
  'Confirmed or user-reviewed edge-case eligibility facts used by scoring and Founder Pack generation.';
