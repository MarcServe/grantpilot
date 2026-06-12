-- Durable admin review queues and deep eligibility scoring backlog.
-- Keeps manual review candidates visible and lets preliminary heuristic rows
-- drain into full AI scoring in small, resumable batches.

CREATE TABLE IF NOT EXISTS grant_source_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('source_candidate', 'application_link')),
  source_name text,
  endpoint text,
  grant_id text REFERENCES "Grant"(id) ON DELETE CASCADE,
  grant_name text,
  funder text,
  country text,
  source_type text,
  crawl_frequency text,
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'duplicate')),
  reviewed_by text,
  reviewed_at timestamptz,
  source_run_id uuid REFERENCES grant_source_import_runs(id) ON DELETE SET NULL,
  grant_link_id bigint REFERENCES grant_links(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grant_source_review_queue_status_kind
  ON grant_source_review_queue(status, kind, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_source_review_queue_source_endpoint_pending
  ON grant_source_review_queue(kind, lower(coalesce(endpoint, '')))
  WHERE kind = 'source_candidate' AND status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_source_review_queue_link_pending
  ON grant_source_review_queue(kind, grant_link_id)
  WHERE kind = 'application_link' AND status = 'pending' AND grant_link_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS eligibility_deep_score_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id text NOT NULL,
  profile_id text NOT NULL REFERENCES "BusinessProfile"(id) ON DELETE CASCADE,
  grant_id text NOT NULL REFERENCES "Grant"(id) ON DELETE CASCADE,
  profile_hash text,
  grant_content_hash text,
  priority integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_result jsonb,
  full_score integer,
  full_decision text,
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, profile_id, grant_id, profile_hash, grant_content_hash)
);

CREATE INDEX IF NOT EXISTS idx_eligibility_deep_score_queue_status_priority
  ON eligibility_deep_score_queue(status, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_eligibility_deep_score_queue_profile
  ON eligibility_deep_score_queue(organisation_id, profile_id, status);

CREATE TABLE IF NOT EXISTS grant_ai_intelligence (
  grant_id text PRIMARY KEY REFERENCES "Grant"(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  reusable_summary text,
  extracted_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  hard_gates jsonb NOT NULL DEFAULT '[]'::jsonb,
  applicant_types text[] NOT NULL DEFAULT '{}',
  sectors text[] NOT NULL DEFAULT '{}',
  regions text[] NOT NULL DEFAULT '{}',
  reusable_prompt text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grant_ai_intelligence_content_hash
  ON grant_ai_intelligence(content_hash);

CREATE TABLE IF NOT EXISTS profile_ai_dna_cache (
  profile_hash text PRIMARY KEY,
  profile_id text REFERENCES "BusinessProfile"(id) ON DELETE SET NULL,
  organisation_id text,
  dna_summary text,
  normalized_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_ai_dna_cache_profile
  ON profile_ai_dna_cache(profile_id);

CREATE TABLE IF NOT EXISTS eligibility_ai_score_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_hash text NOT NULL,
  grant_id text NOT NULL REFERENCES "Grant"(id) ON DELETE CASCADE,
  grant_content_hash text NOT NULL,
  result_json jsonb NOT NULL,
  score integer,
  decision text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_hash, grant_content_hash)
);

CREATE INDEX IF NOT EXISTS idx_eligibility_ai_score_cache_lookup
  ON eligibility_ai_score_cache(profile_hash, grant_content_hash);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_grant_source_review_queue_updated_at ON grant_source_review_queue;
CREATE TRIGGER trg_grant_source_review_queue_updated_at
BEFORE UPDATE ON grant_source_review_queue
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_eligibility_deep_score_queue_updated_at ON eligibility_deep_score_queue;
CREATE TRIGGER trg_eligibility_deep_score_queue_updated_at
BEFORE UPDATE ON eligibility_deep_score_queue
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_grant_ai_intelligence_updated_at ON grant_ai_intelligence;
CREATE TRIGGER trg_grant_ai_intelligence_updated_at
BEFORE UPDATE ON grant_ai_intelligence
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_profile_ai_dna_cache_updated_at ON profile_ai_dna_cache;
CREATE TRIGGER trg_profile_ai_dna_cache_updated_at
BEFORE UPDATE ON profile_ai_dna_cache
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_eligibility_ai_score_cache_updated_at ON eligibility_ai_score_cache;
CREATE TRIGGER trg_eligibility_ai_score_cache_updated_at
BEFORE UPDATE ON eligibility_ai_score_cache
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE FUNCTION enqueue_source_review_from_import_run()
RETURNS trigger AS $$
DECLARE
  item jsonb;
  item_status text;
  item_endpoint text;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.results, '[]'::jsonb))
  LOOP
    item_status := item->>'status';
    item_endpoint := item->>'endpoint';
    IF item_status IN ('manual_review', 'rejected') AND coalesce(item_endpoint, '') <> '' THEN
      INSERT INTO grant_source_review_queue (
        kind,
        source_name,
        endpoint,
        source_type,
        crawl_frequency,
        reason,
        payload,
        status,
        source_run_id,
        created_at,
        updated_at
      )
      VALUES (
        'source_candidate',
        item->>'sourceName',
        item_endpoint,
        COALESCE(item->>'type', item->>'sourceType'),
        COALESCE(item->>'crawlFrequency', '24h'),
        item->>'reason',
        item,
        'pending',
        NEW.id,
        NEW.created_at,
        NEW.created_at
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enqueue_source_review_from_import_run ON grant_source_import_runs;
CREATE TRIGGER trg_enqueue_source_review_from_import_run
AFTER INSERT ON grant_source_import_runs
FOR EACH ROW EXECUTE FUNCTION enqueue_source_review_from_import_run();

CREATE OR REPLACE FUNCTION enqueue_application_link_review()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'manual_review_needed' THEN
    INSERT INTO grant_source_review_queue (
      kind,
      source_name,
      endpoint,
      grant_id,
      grant_name,
      funder,
      reason,
      payload,
      status,
      grant_link_id,
      created_at,
      updated_at
    )
    VALUES (
      'application_link',
      NEW.grant_name,
      NEW.homepage_url,
      NEW.grant_id,
      NEW.grant_name,
      NEW.funder,
      COALESCE(NEW.error_message, 'Application form link needs manual review.'),
      jsonb_build_object(
        'homepage_url', NEW.homepage_url,
        'application_form_url', NEW.application_form_url,
        'deadline', NEW.deadline,
        'amount', NEW.amount,
        'eligibility_notes', NEW.eligibility_notes
      ),
      'pending',
      NEW.id,
      COALESCE(NEW.updated_at, NEW.created_at, now()),
      COALESCE(NEW.updated_at, NEW.created_at, now())
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enqueue_application_link_review ON grant_links;
CREATE TRIGGER trg_enqueue_application_link_review
AFTER INSERT OR UPDATE OF status ON grant_links
FOR EACH ROW EXECUTE FUNCTION enqueue_application_link_review();

-- Backfill source candidates from historical import logs.
INSERT INTO grant_source_review_queue (
  kind,
  source_name,
  endpoint,
  source_type,
  crawl_frequency,
  reason,
  payload,
  status,
  source_run_id,
  created_at,
  updated_at
)
SELECT
  'source_candidate',
  item->>'sourceName',
  item->>'endpoint',
  COALESCE(item->>'type', item->>'sourceType'),
  COALESCE(item->>'crawlFrequency', '24h'),
  item->>'reason',
  item,
  'pending',
  run.id,
  run.created_at,
  run.created_at
FROM grant_source_import_runs run
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(run.results, '[]'::jsonb)) AS item
WHERE item->>'status' IN ('manual_review', 'rejected')
  AND COALESCE(item->>'endpoint', '') <> ''
ON CONFLICT DO NOTHING;

-- Backfill application-link manual review rows.
INSERT INTO grant_source_review_queue (
  kind,
  source_name,
  endpoint,
  grant_id,
  grant_name,
  funder,
  reason,
  payload,
  status,
  grant_link_id,
  created_at,
  updated_at
)
SELECT
  'application_link',
  gl.grant_name,
  gl.homepage_url,
  gl.grant_id,
  gl.grant_name,
  gl.funder,
  COALESCE(gl.error_message, 'Application form link needs manual review.'),
  jsonb_build_object(
    'homepage_url', gl.homepage_url,
    'application_form_url', gl.application_form_url,
    'deadline', gl.deadline,
    'amount', gl.amount,
    'eligibility_notes', gl.eligibility_notes
  ),
  'pending',
  gl.id,
  COALESCE(gl.updated_at, gl.created_at, now()),
  COALESCE(gl.updated_at, gl.created_at, now())
FROM grant_links gl
WHERE gl.status = 'manual_review_needed'
ON CONFLICT DO NOTHING;

COMMENT ON TABLE grant_source_review_queue IS
  'Admin review queue for source candidates and application links that automation could not safely approve.';

COMMENT ON TABLE eligibility_deep_score_queue IS
  'Backlog of heuristic/preliminary eligibility rows awaiting full AI company-DNA scoring.';

COMMENT ON TABLE eligibility_ai_score_cache IS
  'Reusable exact profile-hash plus grant-content-hash cache for full AI eligibility results.';
