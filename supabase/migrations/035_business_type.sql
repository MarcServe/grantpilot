-- Add businessType column to BusinessProfile for applicant type matching.
-- Values: SME, Startup, Sole Trader, Charity / Non-profit, Social Enterprise,
--         University / Research, Public Sector, Large Enterprise, Partnership, Other
ALTER TABLE "BusinessProfile"
  ADD COLUMN IF NOT EXISTS "businessType" TEXT;

COMMENT ON COLUMN "BusinessProfile"."businessType" IS 'Organisation type for grant applicant-type matching (e.g. SME, Charity / Non-profit)';
