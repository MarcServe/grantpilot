ALTER TABLE "Grant"
  ADD COLUMN IF NOT EXISTS "detailUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "directApplicationUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "applicationUrlKind" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "applicationUrlQuality" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "applicationUrlConfidence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "applicationUrlVerifiedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "applicationUrlQualityReason" TEXT;

UPDATE "Grant"
SET "detailUrl" = COALESCE("detailUrl", "applicationUrl")
WHERE "detailUrl" IS NULL AND "applicationUrl" IS NOT NULL;

ALTER TABLE "Grant"
  DROP CONSTRAINT IF EXISTS grant_application_url_kind_check,
  ADD CONSTRAINT grant_application_url_kind_check
    CHECK ("applicationUrlKind" IN (
      'direct_form',
      'portal_application',
      'specific_grant_page',
      'generic_listing',
      'account_registration',
      'closed_or_expired',
      'dead_link',
      'unknown'
    ));

ALTER TABLE "Grant"
  DROP CONSTRAINT IF EXISTS grant_application_url_quality_check,
  ADD CONSTRAINT grant_application_url_quality_check
    CHECK ("applicationUrlQuality" IN (
      'verified_direct',
      'verified_portal',
      'needs_scout',
      'manual_review',
      'rejected',
      'unknown'
    ));

CREATE INDEX IF NOT EXISTS "Grant_applicationUrlQuality_idx"
  ON "Grant"("applicationUrlQuality");

CREATE INDEX IF NOT EXISTS "Grant_applicationUrlKind_idx"
  ON "Grant"("applicationUrlKind");
