const DEFAULT_QUERIES = [
  "UK business grants official funding opportunities",
  "UKRI Innovate UK funding calls startups SMEs",
  "EU funding calls open to UK applicants",
  "European Commission grants calls proposals innovation SMEs",
  "global innovation grant open to UK businesses",
  "foundation grants UK startups technology social impact",
];

const DEFAULT_SEARCH_ACTOR_ID = "apify/google-search-scraper";

type ApifyRun = {
  id?: string;
  status?: string;
  defaultDatasetId?: string;
};

type SearchResultItem = {
  title?: unknown;
  url?: unknown;
  link?: unknown;
  description?: unknown;
  snippet?: unknown;
};

export type ApifyGrantSource = {
  sourceName: string;
  endpoint: string;
  country: string;
  type: "rss" | "government_portal" | "foundation" | "newsletter";
  crawlFrequency: "24h";
  enabled: boolean;
  manualReview: boolean;
  notes: string;
};

export type ApifyDiscoveryResult = {
  runId: string;
  datasetId: string;
  itemCount: number;
  sources: ApifyGrantSource[];
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function inferCountry(url = "", title = "", snippet = ""): string {
  const content = `${url} ${title} ${snippet}`.toLowerCase();
  if (content.includes(".gov.uk") || content.includes("ukri") || content.includes("innovate uk") || /\buk\b/.test(content)) {
    return "UK";
  }
  if (content.includes("europa.eu") || content.includes("horizon europe") || content.includes("european commission") || /\beu\b/.test(content)) {
    return "EU";
  }
  return "XX";
}

function inferType(url = "", title = "", snippet = ""): ApifyGrantSource["type"] {
  const content = `${url} ${title} ${snippet}`.toLowerCase();
  if (content.includes("rss") || content.includes("feed") || content.endsWith(".xml")) return "rss";
  if (content.includes("foundation") || content.includes("trust") || content.includes("fund")) return "foundation";
  if (content.includes("newsletter") || content.includes("digest")) return "newsletter";
  return "government_portal";
}

function isWeakOrWrongRegion(url = "", title = "", snippet = ""): boolean {
  const content = `${url} ${title} ${snippet}`.toLowerCase();
  if (!/^https?:\/\//i.test(url)) return true;
  if (content.includes("expired") || content.includes("archive") || content.includes("closed grants")) return true;
  if (content.includes("us-only") || content.includes("canada-only") || content.includes("australia-only")) return true;
  if (content.includes("scholarship") && !content.includes("business")) return true;
  return false;
}

function dedupeByEndpoint(sources: ApifyGrantSource[]): ApifyGrantSource[] {
  const seen = new Set<string>();
  const deduped: ApifyGrantSource[] = [];
  for (const source of sources) {
    let key: string;
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

async function readJson(response: Response): Promise<unknown> {
  const textBody = await response.text();
  if (!textBody) return null;
  try {
    return JSON.parse(textBody) as unknown;
  } catch {
    throw new Error(`Expected JSON response, got: ${textBody.slice(0, 200)}`);
  }
}

async function apifyFetch(path: string, token: string, init?: RequestInit): Promise<unknown> {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`https://api.apify.com/v2/${path}${separator}token=${encodeURIComponent(token)}`, init);
  if (!response.ok) {
    throw new Error(`Apify request failed: ${response.status} ${await response.text()}`);
  }
  return readJson(response);
}

function unwrapRun(payload: unknown): ApifyRun {
  const data = payload && typeof payload === "object" ? (payload as { data?: unknown }).data : null;
  return data && typeof data === "object" ? (data as ApifyRun) : {};
}

export async function discoverGrantSourcesWithApify(options: {
  apifyToken: string;
  queries?: string[];
  maxSources?: number;
  timeoutMs?: number;
  actorId?: string;
}): Promise<ApifyDiscoveryResult> {
  const queries = options.queries?.length ? options.queries : DEFAULT_QUERIES;
  const maxSources = Math.max(1, Math.min(Number(options.maxSources ?? 20), 50));
  const timeoutMs = Math.max(30_000, Math.min(Number(options.timeoutMs ?? 240_000), 290_000));
  const actorId = options.actorId?.trim() || DEFAULT_SEARCH_ACTOR_ID;

  const startPayload = await apifyFetch(`acts/${encodeURIComponent(actorId)}/runs`, options.apifyToken, {
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

  const startedRun = unwrapRun(startPayload);
  if (!startedRun.id) throw new Error("Apify search actor did not return a run id");

  const deadline = Date.now() + timeoutMs;
  let completedRun: ApifyRun | null = null;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 8_000));
    const statusPayload = await apifyFetch(`actor-runs/${startedRun.id}`, options.apifyToken);
    const run = unwrapRun(statusPayload);
    if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status ?? "")) {
      if (run.status !== "SUCCEEDED") throw new Error(`Apify search actor ended with ${run.status}`);
      completedRun = run;
      break;
    }
  }

  if (!completedRun?.defaultDatasetId) {
    throw new Error("Apify search actor did not finish before the cron timeout.");
  }

  const itemsPayload = await apifyFetch(`datasets/${completedRun.defaultDatasetId}/items?clean=true`, options.apifyToken);
  const items = Array.isArray(itemsPayload) ? (itemsPayload as SearchResultItem[]) : [];
  const sources = dedupeByEndpoint(
    items
      .map((item) => {
        const endpoint = text(item.url) || text(item.link);
        const sourceName = (text(item.title) || endpoint || "Untitled source").slice(0, 160);
        const notes = (text(item.description) || text(item.snippet) || "Discovered by Apify daily grant-source search.").slice(0, 1000);
        return {
          sourceName,
          endpoint,
          country: inferCountry(endpoint, sourceName, notes),
          type: inferType(endpoint, sourceName, notes),
          crawlFrequency: "24h" as const,
          enabled: true,
          manualReview: false,
          notes,
        };
      })
      .filter((source) => source.endpoint && !isWeakOrWrongRegion(source.endpoint, source.sourceName, source.notes))
  ).slice(0, maxSources);

  return {
    runId: startedRun.id,
    datasetId: completedRun.defaultDatasetId,
    itemCount: items.length,
    sources,
  };
}
