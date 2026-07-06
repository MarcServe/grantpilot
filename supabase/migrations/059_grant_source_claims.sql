-- Claim and outcome metadata for bounded grant-source crawler workers.
-- Cron routes claim due rows and enqueue one worker event per row so Vercel and
-- Inngest schedulers cannot process the same source concurrently.

ALTER TABLE grant_sources
  ADD COLUMN IF NOT EXISTS claim_token TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_crawl_status TEXT,
  ADD COLUMN IF NOT EXISTS last_crawl_error TEXT,
  ADD COLUMN IF NOT EXISTS last_crawl_result JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_grant_sources_claimed_at ON grant_sources(claimed_at);
CREATE INDEX IF NOT EXISTS idx_grant_sources_claim_token ON grant_sources(claim_token);
CREATE INDEX IF NOT EXISTS idx_grant_sources_last_crawl_status ON grant_sources(last_crawl_status);

CREATE OR REPLACE FUNCTION claim_due_grant_sources(
  p_limit integer DEFAULT 20,
  p_claim_ttl_minutes integer DEFAULT 30
)
RETURNS TABLE (
  id text,
  source_name text,
  country text,
  type text,
  endpoint text,
  crawl_frequency text,
  enabled boolean,
  last_crawled_at timestamptz,
  last_content_hash text,
  adapter text,
  claim_token text,
  claimed_at timestamptz,
  last_crawl_status text,
  last_crawl_error text,
  last_crawl_result jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH due AS (
    SELECT gs.id
    FROM grant_sources gs
    WHERE gs.enabled = true
      AND (
        gs.last_crawled_at IS NULL
        OR gs.last_crawled_at + CASE gs.crawl_frequency
          WHEN '6h' THEN interval '6 hours'
          WHEN '24h' THEN interval '24 hours'
          WHEN '72h' THEN interval '72 hours'
          WHEN '168h' THEN interval '168 hours'
          ELSE interval '24 hours'
        END <= now()
      )
      AND (
        gs.claim_token IS NULL
        OR gs.claimed_at IS NULL
        OR gs.claimed_at < now() - make_interval(mins => greatest(1, least(coalesce(p_claim_ttl_minutes, 30), 180)))
      )
    ORDER BY
      CASE lower(coalesce(gs.adapter, gs.type))
        WHEN 'rss' THEN 0
        WHEN 'feed' THEN 0
        WHEN 'json' THEN 0
        WHEN 'grants-gov' THEN 1
        WHEN 'grants_gov' THEN 1
        WHEN 'uk' THEN 1
        WHEN 'eu' THEN 1
        WHEN 'au' THEN 1
        WHEN 'australia' THEN 1
        WHEN 'ca' THEN 1
        WHEN 'canada' THEN 1
        WHEN 'nih' THEN 1
        WHEN 'us-nih' THEN 1
        ELSE 2
      END,
      gs.last_crawled_at ASC NULLS FIRST,
      gs.source_name ASC
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
  ),
  claimed AS (
    UPDATE grant_sources gs
    SET
      claim_token = gen_random_uuid()::text,
      claimed_at = now(),
      last_crawl_status = 'claimed',
      last_crawl_error = NULL,
      updated_at = now()
    FROM due
    WHERE gs.id = due.id
    RETURNING
      gs.id,
      gs.source_name,
      gs.country,
      gs.type,
      gs.endpoint,
      gs.crawl_frequency,
      gs.enabled,
      gs.last_crawled_at,
      gs.last_content_hash,
      gs.adapter,
      gs.claim_token,
      gs.claimed_at,
      gs.last_crawl_status,
      gs.last_crawl_error,
      gs.last_crawl_result
  )
  SELECT
    claimed.id,
    claimed.source_name,
    claimed.country,
    claimed.type,
    claimed.endpoint,
    claimed.crawl_frequency,
    claimed.enabled,
    claimed.last_crawled_at,
    claimed.last_content_hash,
    claimed.adapter,
    claimed.claim_token,
    claimed.claimed_at,
    claimed.last_crawl_status,
    claimed.last_crawl_error,
    claimed.last_crawl_result
  FROM claimed;
$$;

COMMENT ON FUNCTION claim_due_grant_sources(integer, integer) IS
  'Atomically claims enabled due grant_sources rows for one-source crawler workers.';
