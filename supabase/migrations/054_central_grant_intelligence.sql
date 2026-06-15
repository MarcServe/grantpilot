-- Central reusable grant intelligence for scalable profile matching.

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS "grant_ai_intelligence" (
  "grant_id" TEXT PRIMARY KEY REFERENCES "Grant"("id") ON DELETE CASCADE,
  "content_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "model" TEXT,
  "confidence" INTEGER NOT NULL DEFAULT 0,
  "reusable_summary" TEXT,
  "extracted_criteria" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "eligibility_criteria" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "hard_gates" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "applicant_types" TEXT[] NOT NULL DEFAULT '{}',
  "sectors" TEXT[] NOT NULL DEFAULT '{}',
  "regions" TEXT[] NOT NULL DEFAULT '{}',
  "funding_purposes" TEXT[] NOT NULL DEFAULT '{}',
  "semantic_tags" TEXT[] NOT NULL DEFAULT '{}',
  "measurable_requirements" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "exclusions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "freshness" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "scoring_hints" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "reusable_prompt" TEXT,
  "extraction_error" TEXT,
  "extracted_at" TIMESTAMPTZ,
  "last_used_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT grant_ai_intelligence_status_check CHECK ("status" IN ('pending', 'ready', 'failed', 'stale'))
);

ALTER TABLE "grant_ai_intelligence"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "model" TEXT,
  ADD COLUMN IF NOT EXISTS "confidence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "funding_purposes" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "semantic_tags" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "measurable_requirements" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "exclusions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "freshness" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "scoring_hints" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "extraction_error" TEXT,
  ADD COLUMN IF NOT EXISTS "extracted_at" TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grant_ai_intelligence_status_check'
  ) THEN
    ALTER TABLE "grant_ai_intelligence"
      ADD CONSTRAINT grant_ai_intelligence_status_check
      CHECK ("status" IN ('pending', 'ready', 'failed', 'stale'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS grant_ai_intelligence_touch_updated_at ON "grant_ai_intelligence";
CREATE TRIGGER grant_ai_intelligence_touch_updated_at
  BEFORE UPDATE ON "grant_ai_intelligence"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_grant_ai_intelligence_status
  ON "grant_ai_intelligence"("status", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS idx_grant_ai_intelligence_hash
  ON "grant_ai_intelligence"("content_hash");

CREATE TABLE IF NOT EXISTS "grant_intelligence_queue" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "grant_id" TEXT NOT NULL REFERENCES "Grant"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'grant_intelligence',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "locked_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "last_error" TEXT,
  "content_hash" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT grant_intelligence_queue_status_check CHECK ("status" IN ('pending', 'running', 'completed', 'failed', 'skipped'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_intelligence_queue_grant_id
  ON "grant_intelligence_queue"("grant_id");

CREATE INDEX IF NOT EXISTS idx_grant_intelligence_queue_status_priority
  ON "grant_intelligence_queue"("status", "priority" DESC, "created_at");

DROP TRIGGER IF EXISTS grant_intelligence_queue_touch_updated_at ON "grant_intelligence_queue";
CREATE TRIGGER grant_intelligence_queue_touch_updated_at
  BEFORE UPDATE ON "grant_intelligence_queue"
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMENT ON TABLE "grant_ai_intelligence" IS
  'Reusable AI-extracted grant criteria and semantic facts used before per-profile eligibility scoring.';

COMMENT ON TABLE "grant_intelligence_queue" IS
  'Queue for extracting reusable grant intelligence once per grant instead of once per organisation.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eligibility_assessment_scoring_source_check'
  ) THEN
    ALTER TABLE "EligibilityAssessment"
      DROP CONSTRAINT eligibility_assessment_scoring_source_check;
  END IF;
END $$;

ALTER TABLE "EligibilityAssessment"
  ADD CONSTRAINT eligibility_assessment_scoring_source_check
  CHECK ("scoring_source" IN ('openai', 'heuristic', 'embedding', 'manual', 'intelligence'));
