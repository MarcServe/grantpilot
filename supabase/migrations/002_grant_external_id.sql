-- Run in Supabase SQL Editor. Adds externalId for grant feed/import upserts.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Grant' AND column_name = 'externalId') THEN
    ALTER TABLE "Grant" ADD COLUMN "externalId" TEXT;
    CREATE UNIQUE INDEX "Grant_externalId_key" ON "Grant" ("externalId") WHERE "externalId" IS NOT NULL;
  END IF;
END $$;
