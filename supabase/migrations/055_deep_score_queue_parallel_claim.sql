-- Atomic queue claiming for parallel deep-score workers.
-- This keeps Vercel cron workers from selecting the same pending rows when
-- multiple shards run at the same time.

CREATE OR REPLACE FUNCTION claim_eligibility_deep_score_queue(
  p_limit integer DEFAULT 50,
  p_shard_count integer DEFAULT NULL,
  p_shard_index integer DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  organisation_id text,
  profile_id text,
  grant_id text,
  attempts integer,
  priority integer,
  heuristic_score integer,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT q.id
    FROM eligibility_deep_score_queue q
    WHERE q.status = 'pending'
      AND (
        p_shard_count IS NULL
        OR p_shard_count <= 1
        OR p_shard_index IS NULL
        OR mod(
          ('x' || substr(md5(q.organisation_id || ':' || q.profile_id), 1, 8))::bit(32)::bigint,
          p_shard_count
        ) = p_shard_index
      )
    ORDER BY q.priority DESC, q.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 50), 1000))
  ),
  claimed AS (
    UPDATE eligibility_deep_score_queue q
    SET
      status = 'running',
      locked_at = now(),
      updated_at = now(),
      last_error = NULL
    FROM candidates
    WHERE q.id = candidates.id
    RETURNING
      q.id,
      q.organisation_id,
      q.profile_id,
      q.grant_id,
      q.attempts,
      q.priority,
      q.heuristic_score,
      q.created_at
  )
  SELECT
    claimed.id,
    claimed.organisation_id,
    claimed.profile_id,
    claimed.grant_id,
    claimed.attempts,
    claimed.priority,
    claimed.heuristic_score,
    claimed.created_at
  FROM claimed;
$$;

COMMENT ON FUNCTION claim_eligibility_deep_score_queue(integer, integer, integer) IS
  'Atomically claims pending deep-score queue rows for parallel workers using SKIP LOCKED and optional profile shard filters.';
