-- Add website URL and AI-extracted intelligence to BusinessProfile
ALTER TABLE "BusinessProfile"
  ADD COLUMN IF NOT EXISTS "websiteUrl" text,
  ADD COLUMN IF NOT EXISTS "websiteIntelligence" text;
