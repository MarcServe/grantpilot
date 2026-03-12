-- Universal Computer-Use Session Tracker
-- Covers: CSV extraction, GrantPilot, any future task
-- 1. Task Types (what kind of job is running)
-- Idempotent: safe to re-run (IF NOT EXISTS, ON CONFLICT DO NOTHING).

CREATE TABLE IF NOT EXISTS cu_task_types (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO cu_task_types (name, description) VALUES
  ('csv_extraction', 'Extract emails or data from a list of website URLs'),
  ('grant_application', 'GrantPilot - auto-fill and submit grant applications'),
  ('inbox_cleanup', 'Clean up emails by category or sender'),
  ('data_scraping', 'General purpose web data extraction'),
  ('form_filling', 'Auto-fill any online form or application')
ON CONFLICT (name) DO NOTHING;
