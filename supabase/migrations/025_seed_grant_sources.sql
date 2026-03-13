-- Seed grant_sources with the four current sync sources plus high-value RSS/API sources.
-- Custom JSON feed: set endpoint to your GRANTS_FEED_URL and enable; or leave disabled.

INSERT INTO grant_sources (id, source_name, country, type, endpoint, crawl_frequency, enabled, adapter)
VALUES
  ('gs-grants-gov', 'Grants.gov', 'US', 'government_portal', 'https://www.grants.gov', '6h', true, 'grants-gov'),
  ('gs-uk-fag', 'UK Find a Grant', 'UK', 'government_portal', 'https://www.find-government-grants.service.gov.uk/grants', '6h', true, 'uk'),
  ('gs-eu-portal', 'EU Funding & Tenders', 'EU', 'government_portal', 'https://ec.europa.eu/info/funding-tenders', '6h', true, 'eu'),
  ('gs-feed', 'Custom JSON Feed', NULL, 'api', 'https://example.com/grants-feed', '24h', false, 'feed'),
  ('gs-au-grantconnect', 'Australia GrantConnect', 'AU', 'government_portal', 'https://www.grants.gov.au/public_data/rss/rss.xml', '24h', true, 'au'),
  ('gs-ca-open', 'Canada Open Grants', 'CA', 'government_portal', 'https://search.open.canada.ca/grants', '24h', true, 'ca'),
  ('gs-nih', 'NIH Funding Opportunities', 'US', 'government_portal', 'https://grants.nih.gov/grants/guide/newsfeed/fundingopps.xml', '24h', true, 'nih'),
  ('gs-grants-gov-rss', 'Grants.gov New Opportunities by Agency', 'US', 'rss', 'https://www.grants.gov/rss/GG_NewOppByAgency.xml', '24h', true, 'rss'),
  ('gs-nih-rss', 'NIH Guide RSS', 'US', 'rss', 'https://grants.nih.gov/grants/guide/newsfeed/fundingopps.xml', '24h', true, 'rss'),
  ('gs-grants-gov-cat', 'Grants.gov New Opportunities by Category', 'US', 'rss', 'https://www.grants.gov/rss/GG_NewOppByCategory.xml', '24h', true, 'rss')
ON CONFLICT (id) DO UPDATE SET
  source_name = EXCLUDED.source_name,
  country = EXCLUDED.country,
  type = EXCLUDED.type,
  endpoint = EXCLUDED.endpoint,
  crawl_frequency = EXCLUDED.crawl_frequency,
  enabled = EXCLUDED.enabled,
  adapter = EXCLUDED.adapter,
  updated_at = now();
