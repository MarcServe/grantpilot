-- Add more high-value grant source pages while preventing active duplicate endpoints.
-- Existing exact endpoint duplicates are disabled rather than deleted, preserving audit history.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY lower(regexp_replace(endpoint, '/+$', ''))
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
  ON grant_sources (lower(regexp_replace(endpoint, '/+$', '')))
  WHERE enabled = true;

INSERT INTO grant_sources (id, source_name, country, type, endpoint, crawl_frequency, enabled, adapter)
SELECT id, source_name, country, type, endpoint, crawl_frequency, enabled, adapter
FROM (
  VALUES
    -- UK official, business, innovation, social impact, charity, and regional sources.
    ('gs-ukri-opportunity-rss', 'UKRI Opportunity RSS', 'UK', 'rss', 'https://www.ukri.org/opportunity/feed/', '6h', true, 'rss'),
    ('gs-govuk-business-finance-grants', 'GOV.UK Business Finance Support Grants', 'UK', 'government_portal', 'https://www.gov.uk/business-finance-support?types_of_support%5B%5D=grant', '24h', true, 'crawl'),
    ('gs-business-govuk-funding-options', 'Business.gov.uk Funding Options', 'UK', 'government_portal', 'https://www.business.gov.uk/support/funding-for-business/funding-options-for-business/', '24h', true, 'crawl'),
    ('gs-nihr-funding-opportunities', 'NIHR Funding Opportunities', 'UK', 'government_portal', 'https://www.nihr.ac.uk/researchers/funding-opportunities/', '24h', true, 'crawl'),
    ('gs-royal-academy-engineering-programmes', 'Royal Academy of Engineering Programmes', 'UK', 'foundation', 'https://raeng.org.uk/programmes-and-prizes/programmes', '24h', true, 'crawl'),
    ('gs-iuk-business-connect-opportunities', 'Innovate UK Business Connect Opportunities', 'UK', 'government_portal', 'https://iuk.ktn-uk.org/opportunities/', '24h', true, 'crawl'),
    ('gs-digital-catapult-opportunities', 'Digital Catapult Opportunities', 'UK', 'government_portal', 'https://www.digicatapult.org.uk/opportunities/', '24h', true, 'crawl'),
    ('gs-connected-places-catapult-opportunities', 'Connected Places Catapult Opportunities', 'UK', 'government_portal', 'https://cp.catapult.org.uk/opportunities/', '24h', true, 'crawl'),
    ('gs-creative-scotland-funding', 'Creative Scotland Funding', 'UK', 'government_portal', 'https://www.creativescotland.com/funding/funding-programmes', '24h', true, 'crawl'),
    ('gs-screen-scotland-funding', 'Screen Scotland Funding', 'UK', 'government_portal', 'https://www.screen.scot/funding-and-support', '24h', true, 'crawl'),
    ('gs-scottish-rural-network-funding', 'Scottish Rural Network Funding', 'UK', 'government_portal', 'https://www.ruralnetwork.scot/funding', '24h', true, 'crawl'),
    ('gs-hie-funding', 'Highlands and Islands Enterprise Funding', 'UK', 'government_portal', 'https://www.hie.co.uk/support/funding/', '24h', true, 'crawl'),
    ('gs-funding-scotland', 'Funding Scotland', 'UK', 'newsletter', 'https://funding.scot/', '24h', true, 'crawl'),
    ('gs-grants-online-uk', 'Grants Online UK', 'UK', 'newsletter', 'https://www.grantsonline.org.uk/', '24h', true, 'crawl'),
    ('gs-funding-central', 'Funding Central', 'UK', 'newsletter', 'https://www.fundingcentral.org.uk/', '24h', true, 'crawl'),
    ('gs-unltd-awards', 'UnLtd Awards', 'UK', 'foundation', 'https://www.unltd.org.uk/awards/', '24h', true, 'crawl'),
    ('gs-social-investment-business-funding', 'Social Investment Business Funding', 'UK', 'foundation', 'https://www.sibgroup.org.uk/funding/', '24h', true, 'crawl'),
    ('gs-power-to-change-funding', 'Power to Change Funding', 'UK', 'foundation', 'https://www.powertochange.org.uk/funding/', '24h', true, 'crawl'),
    ('gs-esmee-fairbairn-funding', 'Esmée Fairbairn Foundation Funding', 'UK', 'foundation', 'https://esmeefairbairn.org.uk/what-we-fund/', '72h', true, 'crawl'),
    ('gs-paul-hamlyn-foundation-funding', 'Paul Hamlyn Foundation Funding', 'UK', 'foundation', 'https://www.phf.org.uk/funding/', '72h', true, 'crawl'),
    ('gs-lloyds-bank-foundation-funding', 'Lloyds Bank Foundation Funding', 'UK', 'foundation', 'https://www.lloydsbankfoundation.org.uk/we-fund', '72h', true, 'crawl'),
    ('gs-garfield-weston-foundation', 'Garfield Weston Foundation', 'UK', 'foundation', 'https://garfieldweston.org/apply-to-us/', '72h', true, 'crawl'),
    ('gs-laing-family-trusts', 'Laing Family Trusts', 'UK', 'foundation', 'https://www.laingfamilytrusts.org.uk/', '168h', true, 'crawl'),
    ('gs-clothworkers-foundation', 'Clothworkers Foundation', 'UK', 'foundation', 'https://www.clothworkersfoundation.org.uk/what-we-fund/', '72h', true, 'crawl'),
    ('gs-henry-smith-charity', 'The Henry Smith Charity Grants', 'UK', 'foundation', 'https://www.henrysmithcharity.org.uk/explore-our-grants-and-apply/', '72h', true, 'crawl'),
    ('gs-wolfson-foundation-funding', 'Wolfson Foundation Funding', 'UK', 'foundation', 'https://www.wolfson.org.uk/funding/', '72h', true, 'crawl'),
    ('gs-royal-society-grants', 'Royal Society Grants', 'UK', 'foundation', 'https://royalsociety.org/grants/', '72h', true, 'crawl'),
    ('gs-british-academy-funding', 'British Academy Funding', 'UK', 'foundation', 'https://www.thebritishacademy.ac.uk/funding/', '72h', true, 'crawl'),

    -- EU and international sources with frequent public calls.
    ('gs-life-programme-calls', 'LIFE Programme Calls', 'EU', 'government_portal', 'https://cinea.ec.europa.eu/programmes/life/calls-proposals_en', '24h', true, 'crawl'),
    ('gs-eu-innovation-fund-calls', 'EU Innovation Fund Calls', 'EU', 'government_portal', 'https://climate.ec.europa.eu/eu-action/eu-funding-climate-action/innovation-fund/calls-proposals_en', '24h', true, 'crawl'),
    ('gs-cascade-funding', 'EU Cascade Funding', 'EU', 'newsletter', 'https://cascadefunding.eu/', '24h', true, 'crawl'),
    ('gs-fundingbox-open-calls', 'FundingBox Open Calls', 'EU', 'newsletter', 'https://fundingbox.com/opencalls', '24h', true, 'crawl'),
    ('gs-eureka-open-calls', 'Eureka Open Calls', 'EU', 'government_portal', 'https://eurekanetwork.org/open-calls/', '24h', true, 'crawl'),
    ('gs-eurostars-funding', 'Eurostars Funding', 'EU', 'government_portal', 'https://www.eurostars-eureka.eu/funding-information', '72h', true, 'crawl'),
    ('gs-creative-europe-calls', 'Creative Europe Calls', 'EU', 'government_portal', 'https://culture.ec.europa.eu/creative-europe/calls', '24h', true, 'crawl'),

    -- Extra US/public RSS and specialist feeds. These are useful globally but downstream matching still filters by user region.
    ('gs-sbir-opportunities', 'SBIR.gov Funding Opportunities', 'US', 'government_portal', 'https://www.sbir.gov/funding', '24h', true, 'crawl'),
    ('gs-iarpa-baa', 'IARPA Opportunities', 'US', 'government_portal', 'https://www.iarpa.gov/research-programs/opportunities', '72h', true, 'crawl'),
    ('gs-darpa-opportunities', 'DARPA Opportunities', 'US', 'government_portal', 'https://www.darpa.mil/work-with-us/opportunities', '72h', true, 'crawl'),
    ('gs-arpah-opportunities', 'ARPA-H Opportunities', 'US', 'government_portal', 'https://arpa-h.gov/engage-and-transition/funding', '72h', true, 'crawl')
) AS incoming(id, source_name, country, type, endpoint, crawl_frequency, enabled, adapter)
WHERE NOT EXISTS (
  SELECT 1
  FROM grant_sources existing
  WHERE lower(regexp_replace(existing.endpoint, '/+$', '')) = lower(regexp_replace(incoming.endpoint, '/+$', ''))
);
