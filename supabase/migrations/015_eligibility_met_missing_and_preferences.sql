-- EligibilityAssessment: store structured met/missing criteria for "Why you scored X%"
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'EligibilityAssessment' AND column_name = 'met_criteria') THEN
    ALTER TABLE "EligibilityAssessment" ADD COLUMN "met_criteria" JSONB DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'EligibilityAssessment' AND column_name = 'missing_criteria') THEN
    ALTER TABLE "EligibilityAssessment" ADD COLUMN "missing_criteria" JSONB DEFAULT '[]';
  END IF;
END $$;

COMMENT ON COLUMN "EligibilityAssessment"."met_criteria" IS 'Short labels for criteria the applicant meets (e.g. UK registered company)';
COMMENT ON COLUMN "EligibilityAssessment"."missing_criteria" IS 'Short labels for criteria missing or weak (e.g. Requires pilot deployment evidence)';

-- Eligibility notification preferences per organisation (score ranges, channels)
CREATE TABLE IF NOT EXISTS "EligibilityNotificationPreference" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" TEXT NOT NULL UNIQUE REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "min_score" INTEGER NOT NULL DEFAULT 70 CHECK ("min_score" >= 0 AND "min_score" <= 100),
  "max_score" INTEGER NOT NULL DEFAULT 100 CHECK ("max_score" >= 0 AND "max_score" <= 100),
  "notify_email" BOOLEAN NOT NULL DEFAULT true,
  "notify_in_app" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "EligibilityNotificationPreference_score_range" CHECK ("max_score" >= "min_score")
);

CREATE INDEX IF NOT EXISTS idx_eligibility_notif_pref_org ON "EligibilityNotificationPreference"("organisation_id");
COMMENT ON TABLE "EligibilityNotificationPreference" IS 'Per-org preferences for eligibility score ranges (e.g. 70-85%, 85-100%) and notification channels';

-- RLS: only members of the org can read/update their preference
ALTER TABLE "EligibilityNotificationPreference" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select own org eligibility prefs"
  ON "EligibilityNotificationPreference" FOR SELECT TO authenticated
  USING ("organisation_id" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "Insert own org eligibility prefs"
  ON "EligibilityNotificationPreference" FOR INSERT TO authenticated
  WITH CHECK ("organisation_id" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "Update own org eligibility prefs"
  ON "EligibilityNotificationPreference" FOR UPDATE TO authenticated
  USING ("organisation_id" = ANY(grantpilot_user_organisation_ids()))
  WITH CHECK ("organisation_id" = ANY(grantpilot_user_organisation_ids()));
