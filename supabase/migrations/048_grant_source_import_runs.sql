-- Audit automated grant-source enrichment runs so the admin dashboard can show
-- what was added, skipped as duplicate, or rejected for manual review.

CREATE TABLE IF NOT EXISTS grant_source_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_source text NOT NULL DEFAULT 'automation',
  created_by text,
  requested_count integer NOT NULL DEFAULT 0,
  added_count integer NOT NULL DEFAULT 0,
  skipped_duplicate_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  manual_review_count integer NOT NULL DEFAULT 0,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grant_source_import_runs_created_at
  ON grant_source_import_runs(created_at DESC);
