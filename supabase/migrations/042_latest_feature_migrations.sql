-- GrantsCopilot latest feature migrations for manual Supabase SQL Editor runs.
-- This combines the recent Founder Pack, outcome learning, scoring-source,
-- rich company profile, directors/team, and Growth plan migrations into one
-- idempotent file so it is easy to find and run from Cursor.

-- Rich company DNA fields used by grant matching and document generation.
ALTER TABLE "BusinessProfile"
  ADD COLUMN IF NOT EXISTS "socialImpact" TEXT,
  ADD COLUMN IF NOT EXISTS "innovationCapabilities" TEXT,
  ADD COLUMN IF NOT EXISTS "sustainabilityInitiatives" TEXT,
  ADD COLUMN IF NOT EXISTS "communityEngagement" TEXT,
  ADD COLUMN IF NOT EXISTS "keyAchievements" TEXT,
  ADD COLUMN IF NOT EXISTS "teamExpertise" TEXT,
  ADD COLUMN IF NOT EXISTS "legalStructure" TEXT,
  ADD COLUMN IF NOT EXISTS "businessStage" TEXT,
  ADD COLUMN IF NOT EXISTS "businessSizeBand" TEXT,
  ADD COLUMN IF NOT EXISTS "founderEmploymentStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "directorNames" TEXT,
  ADD COLUMN IF NOT EXISTS "directorProfiles" TEXT,
  ADD COLUMN IF NOT EXISTS "tradingName" TEXT,
  ADD COLUMN IF NOT EXISTS "charityNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "vatNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "yearEstablished" INTEGER,
  ADD COLUMN IF NOT EXISTS "incorporationDate" TEXT,
  ADD COLUMN IF NOT EXISTS "tradingStartDate" TEXT,
  ADD COLUMN IF NOT EXISTS "registeredAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "operatingAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "postcode" TEXT,
  ADD COLUMN IF NOT EXISTS "country" TEXT,
  ADD COLUMN IF NOT EXISTS "region" TEXT,
  ADD COLUMN IF NOT EXISTS "localAuthority" TEXT,
  ADD COLUMN IF NOT EXISTS "areasServed" TEXT,
  ADD COLUMN IF NOT EXISTS "primaryContactName" TEXT,
  ADD COLUMN IF NOT EXISTS "primaryContactRole" TEXT,
  ADD COLUMN IF NOT EXISTS "primaryContactEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "primaryContactPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "primaryContactLinkedIn" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredContactMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "contractorCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "expectedEmployeeGrowth" TEXT,
  ADD COLUMN IF NOT EXISTS "boardMembers" TEXT,
  ADD COLUMN IF NOT EXISTS "founderBackground" TEXT,
  ADD COLUMN IF NOT EXISTS "teamMembers" TEXT,
  ADD COLUMN IF NOT EXISTS "profitLoss" TEXT,
  ADD COLUMN IF NOT EXISTS "cashReserves" TEXT,
  ADD COLUMN IF NOT EXISTS "financialProjections" TEXT,
  ADD COLUMN IF NOT EXISTS "previousGrantExperience" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredOpportunityTypes" TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS "coFundingCapacity" TEXT,
  ADD COLUMN IF NOT EXISTS "reimbursementReadiness" TEXT,
  ADD COLUMN IF NOT EXISTS "coFundingAvailable" TEXT,
  ADD COLUMN IF NOT EXISTS "matchFundingDetails" TEXT,
  ADD COLUMN IF NOT EXISTS "projectTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "projectSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "problemStatement" TEXT,
  ADD COLUMN IF NOT EXISTS "proposedSolution" TEXT,
  ADD COLUMN IF NOT EXISTS "projectObjectives" TEXT,
  ADD COLUMN IF NOT EXISTS "expectedOutcomes" TEXT,
  ADD COLUMN IF NOT EXISTS "projectStartDate" TEXT,
  ADD COLUMN IF NOT EXISTS "projectEndDate" TEXT,
  ADD COLUMN IF NOT EXISTS "beneficiaryGroups" TEXT,
  ADD COLUMN IF NOT EXISTS "beneficiaryCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "geographicImpact" TEXT,
  ADD COLUMN IF NOT EXISTS "diversityInclusionImpact" TEXT,
  ADD COLUMN IF NOT EXISTS "jobsCreated" INTEGER,
  ADD COLUMN IF NOT EXISTS "revenueGrowthExpected" TEXT,
  ADD COLUMN IF NOT EXISTS "co2Reduction" TEXT,
  ADD COLUMN IF NOT EXISTS "productivityImprovements" TEXT,
  ADD COLUMN IF NOT EXISTS "milestones" TEXT,
  ADD COLUMN IF NOT EXISTS "deliverables" TEXT,
  ADD COLUMN IF NOT EXISTS "partnerOrganisations" TEXT,
  ADD COLUMN IF NOT EXISTS "collaborationDetails" TEXT,
  ADD COLUMN IF NOT EXISTS "risksMitigation" TEXT,
  ADD COLUMN IF NOT EXISTS "exitStrategy" TEXT,
  ADD COLUMN IF NOT EXISTS "projectSustainabilityPlan" TEXT;

ALTER TABLE "Application"
  ADD COLUMN IF NOT EXISTS "focusNotes" TEXT;

-- Founder Funding Pack storage.
CREATE TABLE IF NOT EXISTS "FounderFundingPack" (
  "id" TEXT PRIMARY KEY DEFAULT generate_cuid(),
  "organisationId" TEXT NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "profileId" TEXT NOT NULL REFERENCES "BusinessProfile"("id") ON DELETE CASCADE,
  "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "type" TEXT NOT NULL DEFAULT 'innovator_founder_visa',
  "status" TEXT NOT NULL DEFAULT 'generated',
  "inputs" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "content" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_founder_funding_pack_org ON "FounderFundingPack"("organisationId");
CREATE INDEX IF NOT EXISTS idx_founder_funding_pack_profile ON "FounderFundingPack"("profileId");
CREATE INDEX IF NOT EXISTS idx_founder_funding_pack_created ON "FounderFundingPack"("createdAt" DESC);

ALTER TABLE "FounderFundingPack" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'FounderFundingPack' AND policyname = 'founder_pack_select_own_org'
  ) THEN
    CREATE POLICY "founder_pack_select_own_org"
      ON "FounderFundingPack" FOR SELECT TO authenticated
      USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'FounderFundingPack' AND policyname = 'founder_pack_insert_own_org'
  ) THEN
    CREATE POLICY "founder_pack_insert_own_org"
      ON "FounderFundingPack" FOR INSERT TO authenticated
      WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'FounderFundingPack' AND policyname = 'founder_pack_update_own_org'
  ) THEN
    CREATE POLICY "founder_pack_update_own_org"
      ON "FounderFundingPack" FOR UPDATE TO authenticated
      USING ("organisationId" = ANY(grantpilot_user_organisation_ids()))
      WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'FounderFundingPack' AND policyname = 'founder_pack_delete_own_org'
  ) THEN
    CREATE POLICY "founder_pack_delete_own_org"
      ON "FounderFundingPack" FOR DELETE TO authenticated
      USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));
  END IF;
END $$;

-- Outcome learning.
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ApplicationOutcome' AND policyname = 'application_outcome_select_own_org'
  ) THEN
    CREATE POLICY "application_outcome_select_own_org"
      ON "ApplicationOutcome" FOR SELECT TO authenticated
      USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ApplicationOutcome' AND policyname = 'application_outcome_insert_own_org'
  ) THEN
    CREATE POLICY "application_outcome_insert_own_org"
      ON "ApplicationOutcome" FOR INSERT TO authenticated
      WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ApplicationOutcome' AND policyname = 'application_outcome_update_own_org'
  ) THEN
    CREATE POLICY "application_outcome_update_own_org"
      ON "ApplicationOutcome" FOR UPDATE TO authenticated
      USING ("organisationId" = ANY(grantpilot_user_organisation_ids()))
      WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ApplicationOutcome' AND policyname = 'application_outcome_delete_own_org'
  ) THEN
    CREATE POLICY "application_outcome_delete_own_org"
      ON "ApplicationOutcome" FOR DELETE TO authenticated
      USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));
  END IF;
END $$;

-- Scoring source tracking for AI vs preliminary heuristics.
ALTER TABLE "EligibilityAssessment"
  ADD COLUMN IF NOT EXISTS "scoring_source" TEXT NOT NULL DEFAULT 'openai';

ALTER TABLE "EligibilityAssessment"
  ADD COLUMN IF NOT EXISTS "profile_overrides" JSONB DEFAULT NULL;

COMMENT ON COLUMN "EligibilityAssessment"."profile_overrides" IS
  'Grant-specific auto-improve overrides saved for this profile/grant without changing the main BusinessProfile.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eligibility_assessment_scoring_source_check'
  ) THEN
    ALTER TABLE "EligibilityAssessment"
      ADD CONSTRAINT eligibility_assessment_scoring_source_check
      CHECK ("scoring_source" IN ('openai', 'heuristic', 'embedding', 'manual'));
  END IF;
END $$;

UPDATE "EligibilityAssessment"
SET
  "scoring_source" = 'heuristic',
  "score" = LEAST("score", 69),
  "decision" = CASE
    WHEN LEAST("score", 69) >= 70 THEN 'likely_eligible'
    WHEN LEAST("score", 69) >= 40 THEN 'review'
    ELSE 'unlikely'
  END,
  "summary" = regexp_replace(COALESCE("summary", ''), '^Heuristic match:', 'Preliminary fit only:')
WHERE COALESCE("summary", '') ILIKE 'Heuristic match:%';

-- Growth plan enum value.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Plan') THEN
    ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'GROWTH';
  END IF;
END $$;

-- Confirmed edge-case eligibility facts for scoring and Founder Pack context.
ALTER TABLE "BusinessProfile"
  ADD COLUMN IF NOT EXISTS "eligibilityFacts" JSONB NOT NULL DEFAULT '[]'::jsonb;
