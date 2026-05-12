-- Store grant-specific profile improvement drafts before an application exists.
-- These are copied into Application.profile_overrides when the user starts that grant.
ALTER TABLE "EligibilityAssessment"
  ADD COLUMN IF NOT EXISTS "profile_overrides" JSONB DEFAULT NULL;

COMMENT ON COLUMN "EligibilityAssessment"."profile_overrides" IS
  'Grant-specific auto-improve overrides saved for this profile/grant without changing the main BusinessProfile.';
