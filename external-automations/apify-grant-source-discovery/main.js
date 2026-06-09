import { Actor, log } from "apify";

const DEFAULT_QUERIES = [
  "UK business grants official funding opportunities",
  "UKRI Innovate UK funding calls startups SMEs",
  "EU funding calls open to UK applicants",
  "European Commission grants calls proposals innovation SMEs",
  "global innovation grant open to UK businesses",
  "foundation grants UK startups technology social impact",
];

const SEARCH_ACTOR_ID = "apify/google-search-scraper";
const DEFAULT_APP_URL = "https://www.grantscopilot.com";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function inferCountry(url = "", title = "", snippet = "") {
  const text = `${url} ${title} ${snippet}`.toLowerCase();
  if (text.includes(".gov.uk") || text.includes("ukri") || text.includes("innovate uk") || /\buk\b/.test(text)) {
    return "UK";
  }
  if (text.includes("europa.eu") || text.includes("horizon europe") || text.includes("european commission") || /\beu\b/.test(text)) {
    return "EU";
  }
  return "XX";
}

function inferType(url = "", title = "", snippet = "") {
  const text = `${url} ${title} ${snippet}`.toLowerCase();
  if (text.includes("rss") || text.includes("feed") || text.endsWith(".xml")) return "rss";
  if (text.includes("foundation") || text.includes("trust") || text.includes("fund")) return "foundation";
  if (text.includes("newsletter") || text.includes("digest")) return "newsletter";
  return "government_portal";
}

function isWeakOrWrongRegion(url = "", title = "", snippet = "") {
  const text = `${url} ${title} ${snippet}`.toLowerCase();
  if (!/^https?:\/\//i.test(url)) return true;
  if (text.includes("expired") || text.includes("archive") || text.includes("closed grants")) return true;
  if (text.includes("us-only") || text.includes("canada-only") || text.includes("australia-only")) return true;
  if (text.includes("scholarship") && !text.includes("business")) return true;
  return false;
}

function dedupeByEndpoint(sources) {
  const seen = new Set();
  const deduped = [];
  for (const source of sources) {
    let key;
    try {
      const url = new URL(source.endpoint);
      key = `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}${url.search}`.toLowerCase();
    } catch {
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(source);
  }
  return deduped;
}

async function runGoogleSearch(apifyToken, queries) {
  const runResponse = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(SEARCH_ACTOR_ID)}/runs?token=${encodeURIComponent(apifyToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queries: queries.join("\n"),
      maxPagesPerQuery: 1,
      resultsPerPage: 10,
      countryCode: "gb",
      languageCode: "en",
    }),
  });

  if (!runResponse.ok) {
    throw new Error(`Could not start Apify search actor: ${runResponse.status} ${await runResponse.text()}`);
  }

  const run = await runResponse.json();
  const runId = run.data?.id;
  if (!runId) throw new Error("Apify search actor did not return a run id");

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${encodeURIComponent(apifyToken)}`);
    if (!statusResponse.ok) {
      throw new Error(`Could not read Apify run status: ${statusResponse.status} ${await statusResponse.text()}`);
    }
    const status = await statusResponse.json();
    const runData = status.data;
    if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(runData?.status)) {
      if (runData.status !== "SUCCEEDED") throw new Error(`Apify search actor ended with ${runData.status}`);
      const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${runData.defaultDatasetId}/items?clean=true&token=${encodeURIComponent(apifyToken)}`);
      if (!itemsResponse.ok) {
        throw new Error(`Could not read Apify search results: ${itemsResponse.status} ${await itemsResponse.text()}`);
      }
      return itemsResponse.json();
    }
  }
}

async function postToGrantsCopilot(appUrl, internalSecret, sources) {
  const response = await fetch(`${appUrl.replace(/\/+$/, "")}/api/internal/grant-sources/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify({
      runSource: "apify",
      createdBy: "apify_daily_source_discovery",
      autoSeedDefaultSources: true,
      sources,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GrantsCopilot import failed: ${response.status} ${text}`);
  }
  return text;
}

await Actor.init();

try {
  const input = await Actor.getInput();
  const apifyToken = requireEnv("APIFY_TOKEN");
  const internalSecret = requireEnv("INTERNAL_API_SECRET");
  const appUrl = process.env.APP_URL?.trim() || DEFAULT_APP_URL;
  const queries = Array.isArray(input?.queries) && input.queries.length > 0 ? input.queries : DEFAULT_QUERIES;
  const maxSources = Math.max(1, Math.min(Number(input?.maxSources ?? 20), 50));

  log.info(`Running Apify grant-source discovery for ${queries.length} queries`);
  const items = await runGoogleSearch(apifyToken, queries);
  const sources = dedupeByEndpoint(
    items
      .map((item) => ({
        sourceName: String(item.title || item.url || "Untitled source").slice(0, 160),
        endpoint: item.url || item.link,
        country: inferCountry(item.url || item.link || "", item.title || "", item.description || item.snippet || ""),
        type: inferType(item.url || item.link || "", item.title || "", item.description || item.snippet || ""),
        crawlFrequency: "24h",
        enabled: true,
        manualReview: false,
        notes: String(item.description || item.snippet || "Discovered by Apify daily grant-source search.").slice(0, 1000),
      }))
      .filter((source) => source.endpoint && !isWeakOrWrongRegion(source.endpoint, source.sourceName, source.notes))
  ).slice(0, maxSources);

  log.info(`Posting ${sources.length} candidate sources to GrantsCopilot`);
  const result = await postToGrantsCopilot(appUrl, internalSecret, sources);
  log.info(result);
  await Actor.pushData({ ok: true, requested: sources.length, importResult: result });
} finally {
  await Actor.exit();
}
