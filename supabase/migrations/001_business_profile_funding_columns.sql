-- Run this in Supabase Dashboard → SQL Editor → New query.
-- Syncs BusinessProfile with Prisma schema (funding range + purposes).

-- 1. Funding range: replace single amount with min/max
ALTER TABLE "BusinessProfile" DROP COLUMN IF EXISTS "fundingNeeded";
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'BusinessProfile' AND column_name = 'fundingMin') THEN
    ALTER TABLE "BusinessProfile" ADD COLUMN "fundingMin" DOUBLE PRECISION NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'BusinessProfile' AND column_name = 'fundingMax') THEN
    ALTER TABLE "BusinessProfile" ADD COLUMN "fundingMax" DOUBLE PRECISION NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 2. Funding purposes: multi-select array + optional details
ALTER TABLE "BusinessProfile" DROP COLUMN IF EXISTS "fundingPurpose";
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'BusinessProfile' AND column_name = 'fundingPurposes') THEN
    ALTER TABLE "BusinessProfile" ADD COLUMN "fundingPurposes" TEXT[] NOT NULL DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'BusinessProfile' AND column_name = 'fundingDetails') THEN
    ALTER TABLE "BusinessProfile" ADD COLUMN "fundingDetails" TEXT;
  END IF;
END $$;
