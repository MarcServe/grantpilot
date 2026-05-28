-- Add a repo-aware UK/EU/Global grant-source batch and strengthen endpoint
-- dedupe so http/https variants are treated as the same active source.

DROP INDEX IF EXISTS idx_grant_sources_unique_enabled_endpoint;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY lower(regexp_replace(regexp_replace(endpoint, '^https?://', ''), '/+$', ''))
      ORDER BY
        CASE
          WHEN adapter = 'rss' THEN 0
          WHEN adapter IN ('uk', 'eu', 'grants-gov', 'au', 'ca', 'nih') THEN 1
          ELSE 2
        END,
        updated_at DESC NULLS LAST,
        id
    ) AS duplicate_rank
  FROM grant_sources
  WHERE endpoint IS NOT NULL
)
UPDATE grant_sources
SET enabled = false, updated_at = now()
FROM ranked
WHERE grant_sources.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_sources_unique_enabled_endpoint
  ON grant_sources (lower(regexp_replace(regexp_replace(endpoint, '^https?://', ''), '/+$', '')))
  WHERE enabled = true;

INSERT INTO grant_sources (id, source_name, country, type, endpoint, crawl_frequency, enabled, adapter)
SELECT id, source_name, country, type, endpoint, crawl_frequency, enabled, adapter
FROM (
  VALUES
    -- UK
    ('gs-cruk-funding', 'Cancer Research UK Funding', 'UK', 'foundation', 'https://www.cancerresearchuk.org/for-researchers/apply-for-and-manage-your-funding', '24h', true, 'crawl'),
    ('gs-leverhulme-funding', 'Leverhulme Trust Funding', 'UK', 'foundation', 'https://www.leverhulme.ac.uk/funding', '72h', true, 'crawl'),
    ('gs-lrf-calls-for-funding', 'Lloyd''s Register Foundation Calls for Funding', 'UK', 'foundation', 'https://www.lrfoundation.org.uk/calls-for-funding', '24h', true, 'crawl'),
    ('gs-nuffield-rda-fund', 'Nuffield Foundation Research, Development and Analysis Fund', 'UK', 'foundation', 'https://www.nuffieldfoundation.org/funding/research-development-and-analysis-fund', '24h', true, 'crawl'),
    ('gs-bfi-funding-support', 'BFI Funding and Support', 'UK', 'government_portal', 'https://www.bfi.org.uk/get-funding-support', '24h', true, 'crawl'),

    -- EU
    ('gs-cost-open-call', 'COST Open Call', 'EU', 'government_portal', 'https://www.cost.eu/funding/how-to-get-funding/open-call-a-simple-one-step-application-process/', '24h', true, 'crawl'),
    ('gs-erasmus-funding-calls', 'Erasmus+ Funding Opportunities', 'EU', 'government_portal', 'https://erasmus-plus.ec.europa.eu/funding-calls', '24h', true, 'crawl'),
    ('gs-msca-funding', 'Marie Sklodowska-Curie Actions Funding', 'EU', 'government_portal', 'https://research-and-innovation.ec.europa.eu/funding/funding-opportunities/funding-programmes-and-open-calls/horizon-europe/marie-sklodowska-curie-actions_en', '24h', true, 'crawl'),
    ('gs-eea-grants', 'EEA and Norway Grants', 'EU', 'government_portal', 'https://eeagrants.org/en', '24h', true, 'crawl'),
    ('gs-cef-digital', 'Connecting Europe Facility Digital', 'EU', 'government_portal', 'https://digital-strategy.ec.europa.eu/en/activities/cef-digital', '24h', true, 'crawl'),

    -- Global
    ('gs-grand-challenges-canada', 'Grand Challenges Canada Funding', 'XX', 'foundation', 'https://www.grandchallenges.ca/en/apply-for-funding/', '24h', true, 'crawl'),
    ('gs-idrc-funding', 'IDRC Funding', 'XX', 'government_portal', 'https://idrc-crdi.ca/en/funding', '24h', true, 'crawl'),
    ('gs-internet-society-foundation', 'Internet Society Foundation', 'XX', 'foundation', 'https://www.internetsociety.org/foundation/', '72h', true, 'crawl'),
    ('gs-elrha-funding', 'Elrha Funding', 'XX', 'foundation', 'https://www.elrha.org/funding', '24h', true, 'crawl'),
    ('gs-spencer-research-grants', 'Spencer Foundation Research Grants', 'XX', 'foundation', 'https://www.spencer.org/research-grants/', '24h', true, 'crawl')
) AS incoming(id, source_name, country, type, endpoint, crawl_frequency, enabled, adapter)
WHERE NOT EXISTS (
  SELECT 1
  FROM grant_sources existing
  WHERE lower(regexp_replace(regexp_replace(existing.endpoint, '^https?://', ''), '/+$', '')) =
        lower(regexp_replace(regexp_replace(incoming.endpoint, '^https?://', ''), '/+$', ''))
);
