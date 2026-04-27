ALTER TABLE "BusinessProfile"
  ADD COLUMN IF NOT EXISTS "directorNames" TEXT,
  ADD COLUMN IF NOT EXISTS "directorProfiles" TEXT;
