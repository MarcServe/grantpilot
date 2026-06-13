-- Defensive follow-up for production databases that created these tables before
-- the final review/deep-score/cache columns existed. CREATE TABLE IF NOT EXISTS
-- does not add columns to an existing table, so keep this migration additive.

ALTER TABLE eligibility_deep_score_queue
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS profile_hash text,
  ADD COLUMN IF NOT EXISTS grant_content_hash text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heuristic_score integer,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_result jsonb,
  ADD COLUMN IF NOT EXISTS full_score integer,
  ADD COLUMN IF NOT EXISTS full_decision text,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_eligibility_deep_score_queue_status_priority
  ON eligibility_deep_score_queue(status, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_eligibility_deep_score_queue_profile
  ON eligibility_deep_score_queue(organisation_id, profile_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_eligibility_deep_score_queue_unique_hash
  ON eligibility_deep_score_queue(
    organisation_id,
    profile_id,
    grant_id,
    coalesce(profile_hash, ''),
    coalesce(grant_content_hash, '')
  );

ALTER TABLE grant_source_review_queue
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS crawl_frequency text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_run_id uuid,
  ADD COLUMN IF NOT EXISTS grant_link_id bigint,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_grant_source_review_queue_status_kind
  ON grant_source_review_queue(status, kind, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_source_review_queue_source_endpoint_pending
  ON grant_source_review_queue(kind, lower(coalesce(endpoint, '')))
  WHERE kind = 'source_candidate' AND status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_source_review_queue_link_pending
  ON grant_source_review_queue(kind, grant_link_id)
  WHERE kind = 'application_link' AND status = 'pending' AND grant_link_id IS NOT NULL;

ALTER TABLE grant_ai_intelligence
  ADD COLUMN IF NOT EXISTS reusable_summary text,
  ADD COLUMN IF NOT EXISTS extracted_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS eligibility_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hard_gates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS applicant_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sectors text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS regions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reusable_prompt text,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_grant_ai_intelligence_content_hash
  ON grant_ai_intelligence(content_hash);

ALTER TABLE profile_ai_dna_cache
  ADD COLUMN IF NOT EXISTS profile_id text,
  ADD COLUMN IF NOT EXISTS organisation_id text,
  ADD COLUMN IF NOT EXISTS dna_summary text,
  ADD COLUMN IF NOT EXISTS normalized_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_profile_ai_dna_cache_profile
  ON profile_ai_dna_cache(profile_id);

ALTER TABLE eligibility_ai_score_cache
  ADD COLUMN IF NOT EXISTS grant_id text,
  ADD COLUMN IF NOT EXISTS grant_content_hash text,
  ADD COLUMN IF NOT EXISTS result_json jsonb,
  ADD COLUMN IF NOT EXISTS score integer,
  ADD COLUMN IF NOT EXISTS decision text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_eligibility_ai_score_cache_profile_grant_hash
  ON eligibility_ai_score_cache(profile_hash, grant_content_hash);

CREATE INDEX IF NOT EXISTS idx_eligibility_ai_score_cache_lookup
  ON eligibility_ai_score_cache(profile_hash, grant_content_hash);
