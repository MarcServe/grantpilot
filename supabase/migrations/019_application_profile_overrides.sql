-- Application-specific profile overrides (e.g. from "Use for this application only" auto-improve).
-- When set, the worker merges these over the business profile when filling this application only.
ALTER TABLE "Application"
  ADD COLUMN IF NOT EXISTS "profile_overrides" JSONB DEFAULT NULL;

COMMENT ON COLUMN "Application"."profile_overrides" IS 'Optional overrides for missionStatement, description, fundingDetails used only when filling this application (from auto-improve "use for this application only").';
