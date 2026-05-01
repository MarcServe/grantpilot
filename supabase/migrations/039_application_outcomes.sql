-- Outcome learning: structured funding outcomes used by the self-improving funding engine.

CREATE TABLE IF NOT EXISTS "ApplicationOutcome" (
  "id" TEXT PRIMARY KEY DEFAULT generate_cuid(),
  "organisationId" TEXT NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "applicationId" TEXT NOT NULL REFERENCES "Application"("id") ON DELETE CASCADE UNIQUE,
  "grantId" TEXT NOT NULL REFERENCES "Grant"("id") ON DELETE CASCADE,
  "profileId" TEXT NOT NULL REFERENCES "BusinessProfile"("id") ON DELETE CASCADE,
  "reportedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "outcome" TEXT NOT NULL CHECK ("outcome" IN ('applied', 'shortlisted', 'awarded', 'rejected', 'withdrawn', 'unknown')),
  "awardedAmount" DOUBLE PRECISION,
  "funderFeedback" TEXT,
  "learningNotes" TEXT,
  "reportedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_outcome_org ON "ApplicationOutcome"("organisationId");
CREATE INDEX IF NOT EXISTS idx_application_outcome_grant ON "ApplicationOutcome"("grantId");
CREATE INDEX IF NOT EXISTS idx_application_outcome_profile ON "ApplicationOutcome"("profileId");
CREATE INDEX IF NOT EXISTS idx_application_outcome_outcome ON "ApplicationOutcome"("outcome");

ALTER TABLE "ApplicationOutcome" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "application_outcome_select_own_org"
  ON "ApplicationOutcome" FOR SELECT TO authenticated
  USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "application_outcome_insert_own_org"
  ON "ApplicationOutcome" FOR INSERT TO authenticated
  WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "application_outcome_update_own_org"
  ON "ApplicationOutcome" FOR UPDATE TO authenticated
  USING ("organisationId" = ANY(grantpilot_user_organisation_ids()))
  WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "application_outcome_delete_own_org"
  ON "ApplicationOutcome" FOR DELETE TO authenticated
  USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));

COMMENT ON TABLE "ApplicationOutcome" IS 'Structured grant application outcomes for outcome learning, win-rate analysis, and self-improving funding intelligence.';
