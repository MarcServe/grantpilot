-- Scout worker: discover application form URL from grant programme homepages.
-- Nightly Inngest job enqueues grants here; worker picks pending, finds form URL, updates Grant.applicationUrl.

CREATE TABLE IF NOT EXISTS grant_links (
  id BIGSERIAL PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES "Grant"(id) ON DELETE CASCADE,
  homepage_url TEXT NOT NULL,
  application_form_url TEXT,
  grant_name TEXT,
  funder TEXT,
  deadline TIMESTAMPTZ,
  amount TEXT,
  eligibility_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'found', 'manual_review_needed', 'failed')),
  filed_by_worker BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  discovered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(grant_id)
);

CREATE INDEX IF NOT EXISTS idx_grant_links_status ON grant_links(status);
CREATE INDEX IF NOT EXISTS idx_grant_links_grant_id ON grant_links(grant_id);

COMMENT ON TABLE grant_links IS 'Scout worker queue: find application form URL from grant homepages; nightly job inserts pending, worker updates Grant.applicationUrl on success';
