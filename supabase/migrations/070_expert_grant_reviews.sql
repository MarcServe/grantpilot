-- Expert advice is separate from AI-generated outcome insights.
CREATE TABLE IF NOT EXISTS "ExpertGrantReview" (
  "id" TEXT PRIMARY KEY DEFAULT generate_cuid(),
  "organisationId" TEXT NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "applicationId" TEXT NOT NULL UNIQUE REFERENCES "Application"("id") ON DELETE CASCADE,
  "requestedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "status" TEXT NOT NULL DEFAULT 'requested' CHECK ("status" IN ('requested', 'in_review', 'completed')),
  "reviewerName" TEXT,
  "reviewerExpertise" TEXT,
  "trackRecordReferences" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "trackRecordVerifiedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "advice" TEXT,
  "publishedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "reviewedAt" TIMESTAMPTZ,
  CONSTRAINT expert_review_completed_evidence CHECK (
    "status" <> 'completed' OR (
      coalesce(length(trim("reviewerName")), 0) > 0 AND coalesce(length(trim("reviewerExpertise")), 0) > 0
      AND jsonb_array_length("trackRecordReferences") > 0
      AND "trackRecordVerifiedById" IS NOT NULL AND "publishedById" IS NOT NULL
      AND coalesce(length(trim("advice")), 0) >= 100 AND "reviewedAt" IS NOT NULL
    )
  )
);
CREATE INDEX IF NOT EXISTS expert_grant_review_queue ON "ExpertGrantReview" ("status", "requestedAt" DESC);
ALTER TABLE "ExpertGrantReview" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expert_grant_review_org_read ON "ExpertGrantReview";
CREATE POLICY expert_grant_review_org_read ON "ExpertGrantReview" FOR SELECT TO authenticated
  USING ("status" = 'completed' AND "organisationId" = ANY(grantpilot_user_organisation_ids()));
-- No client write policy: applicant requests and admin-only publication use authenticated server endpoints.
NOTIFY pgrst, 'reload schema';
