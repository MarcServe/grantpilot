-- Follow-up for environments that already applied migration 051 before
-- the queue source field was added.

ALTER TABLE eligibility_deep_score_queue
  ADD COLUMN IF NOT EXISTS source text;
