import { getSupabaseAdmin } from "@/lib/supabase";
import { inferFunderLocationsFromProfile } from "@/lib/constants";
import { isGrantActionableNow } from "@/lib/grant-actionability";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type GrantRow = {
  id: string;
  name: string | null;
  funder: string | null;
  deadline: string | null;
  createdAt: string | null;
  sectors?: string[] | null;
  regions?: string[] | null;
  funderLocations?: string[] | null;
  url_status?: string | null;
  applicationUrlQuality?: string | null;
};

type ProfileRow = {
  id: string;
  businessName?: string | null;
  business_name?: string | null;
  sector?: string | null;
  description?: string | null;
  location?: string | null;
  fundingPurposes?: string[] | null;
  funderLocations?: string[] | null;
};

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function loadLocalEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (!key || process.env[key]) continue;
      const raw = rest.join("=").trim();
      process.env[key] = raw.replace(/^['"]|['"]$/g, "");
    }
  }
}

function parseTargets(): number[] {
  const raw = argValue("profiles") ?? "100,500,1000";
  return raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.floor(value));
}

function normalize(value?: string | null): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function values(value?: string[] | null): string[] {
  return Array.isArray(value) ? value.map(normalize).filter(Boolean) : [];
}

function overlaps(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  if (a.includes("global") || b.includes("global")) return true;
  return a.some((item) => b.includes(item));
}

function profileLocations(profile: ProfileRow): string[] {
  const explicit = values(profile.funderLocations);
  if (explicit.length > 0) return explicit;
  return inferFunderLocationsFromProfile(profile).map(normalize);
}

function cheapCandidateMatch(grant: GrantRow, profile: ProfileRow): boolean {
  if (!isGrantActionableNow(grant)) return false;

  const grantRegions = [...values(grant.funderLocations), ...values(grant.regions)];
  if (!overlaps(grantRegions, profileLocations(profile))) return false;

  const grantSectors = values(grant.sectors);
  const profileSector = normalize(profile.sector);
  const profilePurposes = values(profile.fundingPurposes);
  if (grantSectors.length === 0) return true;
  if (profileSector && grantSectors.some((sector) => sector.includes(profileSector) || profileSector.includes(sector))) return true;
  if (profilePurposes.some((purpose) => grantSectors.some((sector) => sector.includes(purpose) || purpose.includes(sector)))) return true;
  return grantSectors.some((sector) => ["technology", "innovation", "business", "sme", "startup", "research"].includes(sector));
}

function cloneProfiles(profiles: ProfileRow[], target: number): ProfileRow[] {
  const base = profiles.length > 0
    ? profiles
    : [{
        id: "synthetic-default",
        businessName: "Synthetic SME",
        sector: "technology",
        description: "Synthetic profile for read-only capacity simulation.",
        location: "United Kingdom",
        fundingPurposes: ["innovation", "growth", "technology"],
        funderLocations: ["UK"],
      }];
  return Array.from({ length: target }, (_unused, index) => base[index % base.length]);
}

async function countRows(table: string, filters?: (query: any) => any): Promise<number> {
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (filters) query = filters(query);
  const { count, error } = await query;
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function main() {
  loadLocalEnv();
  const targets = parseTargets();
  const costPerScore = Number(argValue("cost-per-score") ?? process.env.SCALE_SIM_COST_PER_SCORE ?? "0.004");
  const scoresPerHourFallback = Number(argValue("scores-per-hour") ?? process.env.SCALE_SIM_SCORES_PER_HOUR ?? "100");
  const daysBack = Number(argValue("grant-days") ?? "120");
  const since = new Date(Date.now() - Math.max(1, daysBack) * 86_400_000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const supabase = getSupabaseAdmin();

  const [grantResult, profileResult, deepCompleted24h, deepPending, intelligencePending] = await Promise.all([
    supabase
      .from("Grant")
      .select("id, name, funder, deadline, createdAt, sectors, regions, funderLocations, url_status, applicationUrlQuality")
      .gte("createdAt", since)
      .order("createdAt", { ascending: false })
      .limit(3000),
    supabase
      .from("BusinessProfile")
      .select("id, businessName, business_name, sector, description, location, fundingPurposes, funderLocations")
      .limit(1000),
    countRows("eligibility_deep_score_queue", (query) => query.eq("status", "completed").gte("completed_at", dayAgo)),
    countRows("eligibility_deep_score_queue", (query) => query.eq("status", "pending")),
    countRows("grant_intelligence_queue", (query) => query.eq("status", "pending")),
  ]);

  if (grantResult.error) throw new Error(`Grant query failed: ${grantResult.error.message}`);
  if (profileResult.error) throw new Error(`BusinessProfile query failed: ${profileResult.error.message}`);

  const grants = ((grantResult.data ?? []) as GrantRow[]).filter((grant) => isGrantActionableNow(grant));
  const profiles = (profileResult.data ?? []) as ProfileRow[];
  const scoresPerHour = deepCompleted24h > 0 ? Math.max(1, Math.round(deepCompleted24h / 24)) : scoresPerHourFallback;

  const reports = targets.map((target) => {
    const simulatedProfiles = cloneProfiles(profiles, target);
    let candidateMatches = 0;
    for (const profile of simulatedProfiles) {
      for (const grant of grants) {
        if (cheapCandidateMatch(grant, profile)) candidateMatches++;
      }
    }
    const estimatedHours = candidateMatches / Math.max(1, scoresPerHour);
    return {
      profiles: target,
      activeRecentGrants: grants.length,
      candidateMatches,
      estimatedOpenAiCalls: candidateMatches,
      estimatedOpenAiCost: Number((candidateMatches * costPerScore).toFixed(2)),
      scoresPerHourAssumption: scoresPerHour,
      estimatedQueueHours: Number(estimatedHours.toFixed(1)),
      sameDayPossible: estimatedHours <= 24,
    };
  });

  console.log("GrantPilot 1,000-business capacity simulation");
  console.log("Notifications: disabled/read-only. No email, WhatsApp, or test rows are created.");
  console.log(`Grant window: last ${daysBack} days. Existing profiles sampled: ${profiles.length}.`);
  console.log(`Queue now: deepScorePending=${deepPending}, grantIntelligencePending=${intelligencePending}, deepScoreCompleted24h=${deepCompleted24h}.`);
  console.table(reports);
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
