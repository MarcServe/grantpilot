-- Optional context for richer source-registry seeds and imports.
-- Crawling behavior remains driven by the existing endpoint/type/frequency fields.

ALTER TABLE grant_sources
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_grant_sources_metadata_gin
  ON grant_sources USING gin (metadata);

COMMENT ON COLUMN grant_sources.notes IS
  'Operational notes for crawler focus, source cadence, benefit type, or access caveats.';

COMMENT ON COLUMN grant_sources.metadata IS
  'Structured optional source-registry context, such as source group, region, priority, benefit type, and workbook provenance.';
