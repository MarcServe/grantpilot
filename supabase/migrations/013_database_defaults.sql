-- Add database-level defaults for id, createdAt, updatedAt on all tables.
-- Prisma @default(cuid()) and @updatedAt only work in the Prisma client;
-- since we use Supabase directly, the DB must handle these.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper: generate cuid-like IDs at DB level
CREATE OR REPLACE FUNCTION generate_cuid() RETURNS TEXT AS $$
BEGIN
  RETURN 'c' || encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Grant
ALTER TABLE "Grant" ALTER COLUMN "id" SET DEFAULT generate_cuid();
ALTER TABLE "Grant" ALTER COLUMN "createdAt" SET DEFAULT now();
ALTER TABLE "Grant" ALTER COLUMN "updatedAt" SET DEFAULT now();

-- User
ALTER TABLE "User" ALTER COLUMN "id" SET DEFAULT generate_cuid();
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT now();
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT now();

-- Organisation
ALTER TABLE "Organisation" ALTER COLUMN "id" SET DEFAULT generate_cuid();
ALTER TABLE "Organisation" ALTER COLUMN "createdAt" SET DEFAULT now();
ALTER TABLE "Organisation" ALTER COLUMN "updatedAt" SET DEFAULT now();

-- OrganisationMember
ALTER TABLE "OrganisationMember" ALTER COLUMN "id" SET DEFAULT generate_cuid();
ALTER TABLE "OrganisationMember" ALTER COLUMN "createdAt" SET DEFAULT now();

-- BusinessProfile
ALTER TABLE "BusinessProfile" ALTER COLUMN "id" SET DEFAULT generate_cuid();
ALTER TABLE "BusinessProfile" ALTER COLUMN "createdAt" SET DEFAULT now();
ALTER TABLE "BusinessProfile" ALTER COLUMN "updatedAt" SET DEFAULT now();

-- Application
ALTER TABLE "Application" ALTER COLUMN "id" SET DEFAULT generate_cuid();
ALTER TABLE "Application" ALTER COLUMN "createdAt" SET DEFAULT now();
ALTER TABLE "Application" ALTER COLUMN "updatedAt" SET DEFAULT now();

-- Document
ALTER TABLE "Document" ALTER COLUMN "id" SET DEFAULT generate_cuid();
ALTER TABLE "Document" ALTER COLUMN "createdAt" SET DEFAULT now();

-- Usage
ALTER TABLE "Usage" ALTER COLUMN "id" SET DEFAULT generate_cuid();
ALTER TABLE "Usage" ALTER COLUMN "createdAt" SET DEFAULT now();

-- NotificationLog
ALTER TABLE "NotificationLog" ALTER COLUMN "id" SET DEFAULT generate_cuid();
ALTER TABLE "NotificationLog" ALTER COLUMN "createdAt" SET DEFAULT now();

-- ApplicationTask (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ApplicationTask') THEN
    EXECUTE 'ALTER TABLE "ApplicationTask" ALTER COLUMN "id" SET DEFAULT generate_cuid()';
    EXECUTE 'ALTER TABLE "ApplicationTask" ALTER COLUMN "createdAt" SET DEFAULT now()';
    EXECUTE 'ALTER TABLE "ApplicationTask" ALTER COLUMN "updatedAt" SET DEFAULT now()';
  END IF;
END $$;

-- EligibilityAssessment already has UUID id + now() defaults from 005 migration; skip.
