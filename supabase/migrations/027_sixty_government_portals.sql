-- Add the remaining government grant portals (60 total; 11 already in 025).
-- Uses adapter 'crawl' for HTML pages (AI extraction) or 'rss' where feed URL is known.
-- Major portals 6h, others 24h, research agencies 72h.

INSERT INTO grant_sources (id, source_name, country, type, endpoint, crawl_frequency, enabled, adapter)
VALUES
  -- US (2-10; 1 Grants.gov already in 025)
  ('gs-sam-gov', 'SAM.gov Assistance Listings', 'US', 'government_portal', 'https://sam.gov/content/assistance-listings', '6h', true, 'crawl'),
  ('gs-nsf', 'National Science Foundation', 'US', 'government_portal', 'https://www.nsf.gov/funding/opportunities.jsp', '24h', true, 'crawl'),
  ('gs-doe', 'Department of Energy', 'US', 'government_portal', 'https://www.energy.gov/funding-opportunities', '24h', true, 'crawl'),
  ('gs-nasa', 'NASA Research Opportunities', 'US', 'government_portal', 'https://www.nasa.gov/research/opportunities', '24h', true, 'crawl'),
  ('gs-usaid', 'USAID', 'US', 'government_portal', 'https://www.usaid.gov/grants', '24h', true, 'crawl'),
  ('gs-sbir', 'Small Business Innovation Research', 'US', 'government_portal', 'https://www.sbir.gov/', '24h', true, 'crawl'),
  ('gs-sttr', 'Small Business Technology Transfer', 'US', 'government_portal', 'https://www.sbir.gov/about-sttr', '24h', true, 'crawl'),
  ('gs-nea', 'National Endowment for the Arts', 'US', 'government_portal', 'https://www.arts.gov/grants', '24h', true, 'crawl'),
  -- UK (12-20; 11 Find a Grant already in 025)
  ('gs-innovate-uk', 'Innovate UK', 'UK', 'government_portal', 'https://www.ukri.org/opportunity/', '24h', true, 'crawl'),
  ('gs-ukri', 'UK Research and Innovation', 'UK', 'government_portal', 'https://www.ukri.org/apply-for-funding/', '24h', true, 'crawl'),
  ('gs-nlcf', 'National Lottery Community Fund', 'UK', 'government_portal', 'https://www.tnlcommunityfund.org.uk/funding', '24h', true, 'crawl'),
  ('gs-arts-council-england', 'Arts Council England', 'UK', 'government_portal', 'https://www.artscouncil.org.uk/funding', '24h', true, 'crawl'),
  ('gs-scottish-enterprise', 'Scottish Enterprise', 'UK', 'government_portal', 'https://www.scottish-enterprise.com/funding', '24h', true, 'crawl'),
  ('gs-welsh-gov-grants', 'Welsh Government Grants', 'UK', 'government_portal', 'https://gov.wales/funding-and-support', '24h', true, 'crawl'),
  ('gs-ni-exec-funding', 'Northern Ireland Executive Funding', 'UK', 'government_portal', 'https://www.nidirect.gov.uk/campaigns/funding-support', '24h', true, 'crawl'),
  ('gs-uk-spf', 'UK Shared Prosperity Fund', 'UK', 'government_portal', 'https://www.gov.uk/government/collections/uk-shared-prosperity-fund', '24h', true, 'crawl'),
  ('gs-sbri-uk', 'Small Business Research Initiative', 'UK', 'government_portal', 'https://www.sbri.uk.com/', '24h', true, 'crawl'),
  -- EU (22-30; 21 EC Funding already in 025)
  ('gs-horizon-europe', 'Horizon Europe', 'EU', 'government_portal', 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/programmes/horizon-europe', '24h', true, 'crawl'),
  ('gs-eic', 'European Innovation Council', 'EU', 'government_portal', 'https://eic.ec.europa.eu/eic-funding-opportunities_en', '24h', true, 'crawl'),
  ('gs-eurostars', 'Eurostars Programme', 'EU', 'government_portal', 'https://www.eurostars-eureka.eu/', '72h', true, 'crawl'),
  ('gs-eureka', 'EUREKA Network', 'EU', 'government_portal', 'https://www.eurekanetwork.org/', '72h', true, 'crawl'),
  ('gs-interreg-europe', 'Interreg Europe', 'EU', 'government_portal', 'https://www.interregeurope.eu/funding/', '72h', true, 'crawl'),
  ('gs-erdf', 'European Regional Development Fund', 'EU', 'government_portal', 'https://ec.europa.eu/regional_policy/en/funding/erdf/', '72h', true, 'crawl'),
  ('gs-esf', 'European Social Fund', 'EU', 'government_portal', 'https://ec.europa.eu/esf/home.jsp', '72h', true, 'crawl'),
  ('gs-eit', 'European Institute of Innovation & Technology', 'EU', 'government_portal', 'https://eit.europa.eu/our-activities/funding-opportunities', '72h', true, 'crawl'),
  ('gs-digital-europe', 'Digital Europe Programme', 'EU', 'government_portal', 'https://digital-strategy.ec.europa.eu/en/activities/digital-programme', '72h', true, 'crawl'),
  -- Canada (32-35; 31 already in 025)
  ('gs-innovation-canada', 'Innovation Canada', 'CA', 'government_portal', 'https://www.ised-isde.canada.ca/site/innovation-canada/en', '24h', true, 'crawl'),
  ('gs-cihr', 'Canadian Institutes of Health Research', 'CA', 'government_portal', 'https://cihr-irsc.gc.ca/e/37788.html', '72h', true, 'crawl'),
  ('gs-nserc', 'Natural Sciences and Engineering Research Council', 'CA', 'government_portal', 'https://www.nserc-crsng.gc.ca/Professors-Professeurs/Grants-Subs/DGIGP-PSIGP_eng.asp', '72h', true, 'crawl'),
  ('gs-sshrc', 'Social Sciences and Humanities Research Council', 'CA', 'government_portal', 'https://www.sshrc-crsh.gc.ca/funding-financement/index-eng.aspx', '72h', true, 'crawl'),
  -- Australia (37-40; 36 GrantConnect already in 025)
  ('gs-business-gov-au', 'Business.gov.au Grants', 'AU', 'government_portal', 'https://business.gov.au/grants-and-programs', '24h', true, 'crawl'),
  ('gs-arc', 'Australian Research Council', 'AU', 'government_portal', 'https://www.arc.gov.au/grants', '72h', true, 'crawl'),
  ('gs-nhmrc', 'National Health and Medical Research Council', 'AU', 'government_portal', 'https://www.nhmrc.gov.au/funding', '72h', true, 'crawl'),
  ('gs-csiro', 'CSIRO Funding Programs', 'AU', 'government_portal', 'https://www.csiro.au/work-with-us/funding-programs', '72h', true, 'crawl'),
  -- Asia
  ('gs-enterprise-sg', 'Enterprise Singapore Grants', 'SG', 'government_portal', 'https://www.enterprisesg.gov.sg/financial-assistance/grants', '24h', true, 'crawl'),
  ('gs-jsps', 'Japan Society for the Promotion of Science', 'JP', 'government_portal', 'https://www.jsps.go.jp/english/e-grants/', '72h', true, 'crawl'),
  ('gs-kiat', 'Korea Institute for Advancement of Technology', 'KR', 'government_portal', 'https://www.kiat.or.kr/site/eng/main.do', '72h', true, 'crawl'),
  ('gs-india-most', 'India Ministry of Science and Technology', 'IN', 'government_portal', 'https://www.dst.gov.in/call-for-proposals', '72h', true, 'crawl'),
  ('gs-nrf-singapore', 'Singapore National Research Foundation', 'SG', 'government_portal', 'https://www.nrf.gov.sg/', '72h', true, 'crawl'),
  -- Middle East
  ('gs-dubai-future', 'Dubai Future Foundation', 'AE', 'government_portal', 'https://www.dubaifuture.gov.ae/', '72h', true, 'crawl'),
  ('gs-qnrf', 'Qatar National Research Fund', 'QA', 'government_portal', 'https://www.qnrf.org/', '72h', true, 'crawl'),
  ('gs-saudi-vision-2030', 'Saudi Vision 2030 Funding', 'SA', 'government_portal', 'https://www.vision2030.gov.sa/', '72h', true, 'crawl'),
  ('gs-adrd', 'Abu Dhabi R&D Authority', 'AE', 'government_portal', 'https://www.adrd.ae/', '72h', true, 'crawl'),
  ('gs-kacst', 'King Abdulaziz City for Science and Technology', 'SA', 'government_portal', 'https://www.kacst.edu.sa/eng/', '72h', true, 'crawl'),
  -- Africa
  ('gs-afdb', 'African Development Bank', 'XX', 'government_portal', 'https://www.afdb.org/en/funding', '72h', true, 'crawl'),
  ('gs-nrf-south-africa', 'South African National Research Foundation', 'ZA', 'government_portal', 'https://www.nrf.ac.za/funding', '72h', true, 'crawl'),
  ('gs-knrf', 'Kenya National Research Fund', 'KE', 'government_portal', 'https://www.nrf.go.ke/', '72h', true, 'crawl'),
  ('gs-tetfund', 'Nigeria Tertiary Education Trust Fund', 'NG', 'government_portal', 'https://www.tetfund.gov.ng/', '72h', true, 'crawl'),
  ('gs-stdf-egypt', 'Egypt Science and Technology Development Fund', 'EG', 'government_portal', 'https://www.stdf.eg/', '72h', true, 'crawl'),
  -- International
  ('gs-world-bank', 'World Bank Grants Program', 'XX', 'government_portal', 'https://www.worldbank.org/en/programs/grants', '24h', true, 'crawl'),
  ('gs-adb', 'Asian Development Bank', 'XX', 'government_portal', 'https://www.adb.org/what-we-do/financing/grants', '72h', true, 'crawl'),
  ('gs-idb', 'Inter-American Development Bank', 'XX', 'government_portal', 'https://www.iadb.org/en/funding', '72h', true, 'crawl'),
  ('gs-gef', 'Global Environment Facility', 'XX', 'government_portal', 'https://www.thegef.org/grants', '72h', true, 'crawl'),
  ('gs-green-climate-fund', 'Green Climate Fund', 'XX', 'government_portal', 'https://www.greenclimate.fund/apply', '72h', true, 'crawl')
ON CONFLICT (id) DO UPDATE SET
  source_name = EXCLUDED.source_name,
  country = EXCLUDED.country,
  type = EXCLUDED.type,
  endpoint = EXCLUDED.endpoint,
  crawl_frequency = EXCLUDED.crawl_frequency,
  enabled = EXCLUDED.enabled,
  adapter = EXCLUDED.adapter,
  updated_at = now();
