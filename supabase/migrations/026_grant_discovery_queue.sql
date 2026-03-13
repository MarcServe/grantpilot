-- Queue for discovery engine: candidate URLs to crawl and extract grants from.

CREATE TABLE IF NOT EXISTS grant_discovery_queue (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'crawled', 'failed')),
  source TEXT,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  crawled_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_discovery_queue_url ON grant_discovery_queue(url);
CREATE INDEX IF NOT EXISTS idx_grant_discovery_queue_status ON grant_discovery_queue(status);
CREATE INDEX IF NOT EXISTS idx_grant_discovery_queue_discovered_at ON grant_discovery_queue(discovered_at);

COMMENT ON TABLE grant_discovery_queue IS 'URLs discovered by search/sitemap/RSS for grant extraction; processor crawls pending and runs AI extraction';
