-- Business DNA V2 fields for richer grant hard-gate matching and prioritisation.
ALTER TABLE "BusinessProfile"
  ADD COLUMN IF NOT EXISTS "legalStructure" TEXT,
  ADD COLUMN IF NOT EXISTS "businessStage" TEXT,
  ADD COLUMN IF NOT EXISTS "businessSizeBand" TEXT,
  ADD COLUMN IF NOT EXISTS "founderEmploymentStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "incorporationDate" TEXT,
  ADD COLUMN IF NOT EXISTS "tradingStartDate" TEXT,
  ADD COLUMN IF NOT EXISTS "expectedEmployeeGrowth" TEXT,
  ADD COLUMN IF NOT EXISTS "localAuthority" TEXT,
  ADD COLUMN IF NOT EXISTS "areasServed" TEXT,
  ADD COLUMN IF NOT EXISTS "previousGrantExperience" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredOpportunityTypes" TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS "coFundingCapacity" TEXT,
  ADD COLUMN IF NOT EXISTS "reimbursementReadiness" TEXT;
