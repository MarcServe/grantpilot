-- Cache for proactive eligibility: score, reasons, improvement plan per org/profile/grant.
-- Used to show scores on grants list and send notifications for high-fit grants.
CREATE TABLE IF NOT EXISTS "EligibilityAssessment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" TEXT NOT NULL,
  "profile_id" UUID NOT NULL REFERENCES "BusinessProfile"("id") ON DELETE CASCADE,
  "grant_id" UUID NOT NULL REFERENCES "Grant"("id") ON DELETE CASCADE,
  "score" INTEGER NOT NULL CHECK ("score" >= 0 AND "score" <= 100),
  "decision" TEXT NOT NULL CHECK ("decision" IN ('likely_eligible', 'review', 'unlikely')),
  "summary" TEXT,
  "reasons" JSONB DEFAULT '[]',
  "alignment" JSONB,
  "improvement_plan" JSONB,
  "notified_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("organisation_id", "profile_id", "grant_id")
);

CREATE INDEX IF NOT EXISTS idx_eligibility_assessment_org ON "EligibilityAssessment"("organisation_id");
CREATE INDEX IF NOT EXISTS idx_eligibility_assessment_grant ON "EligibilityAssessment"("grant_id");
CREATE INDEX IF NOT EXISTS idx_eligibility_assessment_score ON "EligibilityAssessment"("score" DESC);

COMMENT ON TABLE "EligibilityAssessment" IS 'Cached eligibility score and reasoning per org/profile/grant for list view and notifications';
