-- Source registry for grant intelligence pipeline.
-- Types: api, rss, foundation, newsletter, government_portal
-- Crawl frequency: 6h, 24h, 72h (or 168h for weekly)

CREATE TABLE IF NOT EXISTS grant_sources (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  source_name TEXT NOT NULL,
  country TEXT,
  type TEXT NOT NULL CHECK (type IN ('api', 'rss', 'foundation', 'newsletter', 'government_portal')),
  endpoint TEXT NOT NULL,
  crawl_frequency TEXT NOT NULL DEFAULT '24h' CHECK (crawl_frequency IN ('6h', '24h', '72h', '168h')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_crawled_at TIMESTAMPTZ,
  last_content_hash TEXT,
  adapter TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grant_sources_enabled ON grant_sources(enabled);
CREATE INDEX IF NOT EXISTS idx_grant_sources_crawl_frequency ON grant_sources(crawl_frequency);
CREATE INDEX IF NOT EXISTS idx_grant_sources_last_crawled ON grant_sources(last_crawled_at);
CREATE INDEX IF NOT EXISTS idx_grant_sources_type ON grant_sources(type);

COMMENT ON TABLE grant_sources IS 'Registry of grant data sources for background crawlers; scheduler runs due sources by crawl_frequency';
