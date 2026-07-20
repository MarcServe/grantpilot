-- Community pilot access codes give partner members temporary plan entitlements
-- without changing their Stripe/customer state or overwriting Organisation.plan.

ALTER TABLE "Organisation"
  ADD COLUMN IF NOT EXISTS "communityAccessPlan" TEXT,
  ADD COLUMN IF NOT EXISTS "communityAccessExpiresAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "communityPartnerSlug" TEXT,
  ADD COLUMN IF NOT EXISTS "communityAccessCodeId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organisation_community_access_plan_check'
  ) THEN
    ALTER TABLE "Organisation"
      ADD CONSTRAINT organisation_community_access_plan_check
      CHECK (
        "communityAccessPlan" IS NULL
        OR "communityAccessPlan" IN ('FREE_TRIAL', 'STARTER', 'GROWTH', 'PRO', 'BUSINESS')
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CommunityAccessCode" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "partnerName" TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "accessPlan" TEXT NOT NULL DEFAULT 'GROWTH',
  "durationDays" INTEGER NOT NULL DEFAULT 90,
  "maxRedemptions" INTEGER NOT NULL DEFAULT 250,
  "redeemBy" TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_access_code_plan_check
    CHECK ("accessPlan" IN ('FREE_TRIAL', 'STARTER', 'GROWTH', 'PRO', 'BUSINESS')),
  CONSTRAINT community_access_code_duration_check
    CHECK ("durationDays" BETWEEN 1 AND 365),
  CONSTRAINT community_access_code_max_redemptions_check
    CHECK ("maxRedemptions" > 0)
);

CREATE TABLE IF NOT EXISTS "CommunityAccessRedemption" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "codeId" TEXT NOT NULL REFERENCES "CommunityAccessCode"(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "organisationId" TEXT NOT NULL REFERENCES "Organisation"(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  "accessPlan" TEXT NOT NULL,
  "accessExpiresAt" TIMESTAMPTZ NOT NULL,
  "redeemedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_access_redemption_plan_check
    CHECK ("accessPlan" IN ('FREE_TRIAL', 'STARTER', 'GROWTH', 'PRO', 'BUSINESS')),
  CONSTRAINT community_access_redemption_code_org_unique
    UNIQUE ("codeId", "organisationId"),
  CONSTRAINT community_access_redemption_code_user_unique
    UNIQUE ("codeId", "userId")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organisation_community_access_code_fk'
  ) THEN
    ALTER TABLE "Organisation"
      ADD CONSTRAINT organisation_community_access_code_fk
      FOREIGN KEY ("communityAccessCodeId")
      REFERENCES "CommunityAccessCode"(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_community_access_code_active_slug
  ON "CommunityAccessCode"(slug, active, "redeemBy");

CREATE INDEX IF NOT EXISTS idx_community_access_redemption_code
  ON "CommunityAccessRedemption"("codeId", "redeemedAt");

CREATE INDEX IF NOT EXISTS idx_community_access_redemption_org
  ON "CommunityAccessRedemption"("organisationId", "accessExpiresAt");

CREATE INDEX IF NOT EXISTS idx_organisation_community_access_active
  ON "Organisation"("communityPartnerSlug", "communityAccessExpiresAt")
  WHERE "communityAccessExpiresAt" IS NOT NULL;
