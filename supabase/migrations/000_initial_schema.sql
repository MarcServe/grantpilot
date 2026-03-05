-- Initial schema: base tables matching Prisma schema.
-- Run before numbered migrations (001+) which add/alter columns.

-- Enums
DO $$ BEGIN
  CREATE TYPE "OrgType" AS ENUM ('FOUNDER', 'BUSINESS', 'AGENCY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AppStatus" AS ENUM ('PENDING', 'FILLING', 'REVIEW_REQUIRED', 'APPROVED', 'SUBMITTED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "Plan" AS ENUM ('FREE_TRIAL', 'PRO', 'BUSINESS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- User
CREATE TABLE IF NOT EXISTS "User" (
  "id"              TEXT PRIMARY KEY,
  "supabaseId"      TEXT UNIQUE NOT NULL,
  "email"           TEXT UNIQUE NOT NULL,
  "phoneNumber"     TEXT,
  "whatsappOptIn"   BOOLEAN NOT NULL DEFAULT false,
  "whatsappOptInAt" TIMESTAMPTZ,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Organisation
CREATE TABLE IF NOT EXISTS "Organisation" (
  "id"                TEXT PRIMARY KEY,
  "name"              TEXT NOT NULL,
  "type"              "OrgType" NOT NULL DEFAULT 'FOUNDER',
  "plan"              "Plan" NOT NULL DEFAULT 'FREE_TRIAL',
  "stripeId"          TEXT,
  "preferredTimezone" TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OrganisationMember
CREATE TABLE IF NOT EXISTS "OrganisationMember" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT NOT NULL REFERENCES "User"("id"),
  "organisationId" TEXT NOT NULL REFERENCES "Organisation"("id"),
  "role"           "OrgRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("userId", "organisationId")
);
CREATE INDEX IF NOT EXISTS "OrganisationMember_organisationId_idx" ON "OrganisationMember"("organisationId");

-- BusinessProfile
CREATE TABLE IF NOT EXISTS "BusinessProfile" (
  "id"                 TEXT PRIMARY KEY,
  "organisationId"     TEXT NOT NULL REFERENCES "Organisation"("id"),
  "businessName"       TEXT NOT NULL,
  "registrationNumber" TEXT,
  "sector"             TEXT NOT NULL,
  "missionStatement"   TEXT NOT NULL,
  "description"        TEXT NOT NULL,
  "location"           TEXT NOT NULL,
  "employeeCount"      INTEGER,
  "annualRevenue"      DOUBLE PRECISION,
  "fundingMin"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fundingMax"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fundingPurposes"    TEXT[] NOT NULL DEFAULT '{}',
  "fundingDetails"     TEXT,
  "previousGrants"     TEXT,
  "funderLocations"    TEXT[] NOT NULL DEFAULT '{}',
  "completionScore"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Document
CREATE TABLE IF NOT EXISTS "Document" (
  "id"        TEXT PRIMARY KEY,
  "profileId" TEXT NOT NULL REFERENCES "BusinessProfile"("id"),
  "name"      TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "size"      INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant
CREATE TABLE IF NOT EXISTS "Grant" (
  "id"              TEXT PRIMARY KEY,
  "externalId"      TEXT UNIQUE,
  "name"            TEXT NOT NULL,
  "funder"          TEXT NOT NULL,
  "amount"          DOUBLE PRECISION,
  "deadline"        TIMESTAMPTZ,
  "applicationUrl"  TEXT NOT NULL,
  "eligibility"     TEXT NOT NULL,
  "description"     TEXT,
  "objectives"      TEXT,
  "applicantTypes"  TEXT[] NOT NULL DEFAULT '{}',
  "sectors"         TEXT[] NOT NULL DEFAULT '{}',
  "regions"         TEXT[] NOT NULL DEFAULT '{}',
  "funderLocations" TEXT[] NOT NULL DEFAULT '{}',
  "source"          TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Application
CREATE TABLE IF NOT EXISTS "Application" (
  "id"             TEXT PRIMARY KEY,
  "organisationId" TEXT NOT NULL REFERENCES "Organisation"("id"),
  "createdById"    TEXT NOT NULL,
  "grantId"        TEXT NOT NULL REFERENCES "Grant"("id"),
  "profileId"      TEXT NOT NULL REFERENCES "BusinessProfile"("id"),
  "status"         "AppStatus" NOT NULL DEFAULT 'PENDING',
  "submittedAt"    TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Application_organisationId_idx" ON "Application"("organisationId");

-- Usage
CREATE TABLE IF NOT EXISTS "Usage" (
  "id"             TEXT PRIMARY KEY,
  "organisationId" TEXT NOT NULL REFERENCES "Organisation"("id"),
  "type"           TEXT NOT NULL,
  "units"          INTEGER NOT NULL,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Usage_organisationId_idx" ON "Usage"("organisationId");

-- NotificationLog
CREATE TABLE IF NOT EXISTS "NotificationLog" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL REFERENCES "User"("id"),
  "channel"   TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "status"    TEXT NOT NULL,
  "error"     TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Worker execution state tables (cu_*)
CREATE TABLE IF NOT EXISTS cu_task_types (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO cu_task_types (name, description) VALUES
  ('csv_extraction', 'Extract emails and company info from a list of URLs'),
  ('grant_application', 'Fill and submit a grant application form'),
  ('form_filling', 'Generic form filling task')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS cu_sessions (
  id BIGSERIAL PRIMARY KEY,
  public_id TEXT UNIQUE NOT NULL,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'completed', 'failed', 'resumed')),
  total_items INT NOT NULL DEFAULT 0,
  processed_items INT NOT NULL DEFAULT 0,
  last_checkpoint TEXT,
  organisation_id TEXT,
  business_profile_id TEXT,
  error_log TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cu_sessions_status ON cu_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cu_sessions_org_id ON cu_sessions(organisation_id);

CREATE TABLE IF NOT EXISTS cu_session_items (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES cu_sessions(id) ON DELETE CASCADE,
  task_type TEXT,
  url TEXT,
  email TEXT,
  company_name TEXT,
  phone TEXT,
  extra_data JSONB,
  grant_id TEXT,
  grant_name TEXT,
  grant_url TEXT,
  application_status TEXT,
  action TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'skipped')),
  retry_count INT DEFAULT 0,
  error_message TEXT,
  screenshot_url TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cu_session_items_session ON cu_session_items(session_id);
CREATE INDEX IF NOT EXISTS idx_cu_session_items_status ON cu_session_items(status);

CREATE TABLE IF NOT EXISTS cu_session_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES cu_sessions(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  success BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cu_session_logs_session ON cu_session_logs(session_id);

CREATE OR REPLACE FUNCTION update_cu_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cu_sessions_updated_at ON cu_sessions;
CREATE TRIGGER cu_sessions_updated_at
  BEFORE UPDATE ON cu_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_cu_sessions_updated_at();
