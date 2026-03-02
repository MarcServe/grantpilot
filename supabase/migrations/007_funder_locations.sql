-- Funder location preferences: user-selected regions (US, UK, EU, Global) and grant funder regions.
-- BusinessProfile: which funder locations the user wants to see (multi-select).
-- Grant: which regions the funder serves (so we only show grants that match user preference).

-- BusinessProfile: preferred funder locations (empty = show all)
ALTER TABLE "BusinessProfile"
  ADD COLUMN IF NOT EXISTS "funderLocations" TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN "BusinessProfile"."funderLocations" IS 'User-selected funder regions to show: US, UK, EU, Global. Empty means show all.';

-- Grant: which regions this funder serves (US-only, UK-only, EU, Global)
ALTER TABLE "Grant"
  ADD COLUMN IF NOT EXISTS "funderLocations" TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN "Grant"."funderLocations" IS 'Regions this funder serves: US, UK, EU, Global. Used to filter by user preference.';
