-- GrantPilot Execution State Tables (Supabase)
-- Run this in the Supabase SQL Editor to create the cu_* tables.

-- Task type definitions
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

-- Execution sessions
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

-- Session items (atomic units of work)
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

-- Session logs (audit trail)
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

-- Auto-update updated_at on cu_sessions
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
