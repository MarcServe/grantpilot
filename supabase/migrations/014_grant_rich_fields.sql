-- Add richer data fields to Grant for better AI matching
ALTER TABLE "Grant" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Grant" ADD COLUMN IF NOT EXISTS "objectives" TEXT;
ALTER TABLE "Grant" ADD COLUMN IF NOT EXISTS "applicantTypes" TEXT[] DEFAULT '{}';
ALTER TABLE "Grant" ADD COLUMN IF NOT EXISTS "source" TEXT;
