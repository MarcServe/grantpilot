-- Add website URL and AI-extracted intelligence to BusinessProfile
-- Try quoted camelCase first (Prisma convention), fall back to lowercase.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'BusinessProfile') THEN
    ALTER TABLE public."BusinessProfile"
      ADD COLUMN IF NOT EXISTS "websiteUrl" text,
      ADD COLUMN IF NOT EXISTS "websiteIntelligence" text;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'businessprofile') THEN
    ALTER TABLE public."businessprofile"
      ADD COLUMN IF NOT EXISTS "websiteUrl" text,
      ADD COLUMN IF NOT EXISTS "websiteIntelligence" text;
  ELSE
    RAISE NOTICE 'BusinessProfile table not found — checking all tables';
  END IF;
END
$$;
