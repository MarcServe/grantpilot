-- Speed up the batched Opportunities/My Matches page.
-- Equality filters come first, followed by score ordering and latest score tie-breaks.

CREATE INDEX IF NOT EXISTS idx_eligibility_assessment_org_profile_score_updated
  ON "EligibilityAssessment"("organisation_id", "profile_id", "score" DESC, "updated_at" DESC);

CREATE INDEX IF NOT EXISTS idx_eligibility_assessment_org_score_updated
  ON "EligibilityAssessment"("organisation_id", "score" DESC, "updated_at" DESC);

CREATE INDEX IF NOT EXISTS idx_application_outcome_org_profile_reported
  ON "ApplicationOutcome"("organisationId", "profileId", "reportedAt" DESC);
