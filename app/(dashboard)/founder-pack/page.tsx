import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sanitiseFounderPackContent, type FounderPackContent, type FounderPackDocumentType } from "@/lib/founder-pack";
import { FounderPackClient } from "@/components/founder-pack/founder-pack-client";
import { planAllowsForOrg } from "@/lib/plan-features";

export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  businessName: string;
  sector: string;
  primaryContactName?: string | null;
  primaryContactRole?: string | null;
  directorNames?: string | null;
  founderBackground?: string | null;
  teamExpertise?: string | null;
  financialProjections?: string | null;
}

interface PackRow {
  id: string;
  type: string;
  profileId: string;
  createdAt: string;
  content: FounderPackContent;
  inputs?: { documentTypes?: FounderPackDocumentType[] } | null;
}

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

interface ApplicationOption {
  id: string;
  status: string;
  profileId: string;
  grantId: string;
  grantName: string;
  funder: string;
}

interface EligibleGrantOption {
  grantId: string;
  profileId: string;
  grantName: string;
  funder: string;
  score: number;
  decision: string;
  addedAt?: string | null;
}

function mapApplicationRows(raw: Record<string, unknown>[]): ApplicationOption[] {
  return raw.map((row) => {
    const gRaw = row.Grant ?? row.grant;
    const g = Array.isArray(gRaw) ? gRaw[0] : gRaw;
    const grant = g && typeof g === "object" ? (g as Record<string, unknown>) : {};
    const gid = String(row.grantId ?? row.grant_id ?? grant.id ?? "").trim();
    return {
      id: String(row.id),
      status: String(row.status ?? ""),
      profileId: String(row.profileId ?? row.profile_id ?? ""),
      grantId: gid,
      grantName: String(grant.name ?? "Grant"),
      funder: String(grant.funder ?? "").trim(),
    };
  });
}

function mapEligibleAssessmentRows(raw: Record<string, unknown>[]): EligibleGrantOption[] {
  return raw.map((row) => {
    const gRaw = row.Grant ?? row.grant;
    const g = Array.isArray(gRaw) ? gRaw[0] : gRaw;
    const grant = g && typeof g === "object" ? (g as Record<string, unknown>) : {};
    const grantId = String(row.grant_id ?? grant.id ?? "").trim();
    return {
      grantId,
      profileId: String(row.profile_id ?? ""),
      grantName: String(grant.name ?? "Grant"),
      funder: String(grant.funder ?? "").trim(),
      score: Number(row.score ?? 0),
      decision: String(row.decision ?? "").trim(),
      addedAt: typeof grant.createdAt === "string" ? grant.createdAt : null,
    };
  });
}

export default async function FounderPackPage({
  searchParams,
}: {
  searchParams?: Promise<{ grantId?: string; applicationId?: string }>;
}) {
  const params = await searchParams;
  const initialGrantId = params?.grantId?.trim() || "";
  const initialApplicationId = params?.applicationId?.trim() || "";
  const { org, orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();
  const allowed = planAllowsForOrg(org as { plan?: string; createdAt?: string | Date | null }, "founder_pack");

  const [{ data: profiles }, { data: packs }, { data: applicationsData }, { data: eligibilityData }] = await Promise.all([
    supabase
      .from("BusinessProfile")
      .select("id, businessName, sector, primaryContactName, primaryContactRole, directorNames, founderBackground, teamExpertise, financialProjections")
      .eq("organisationId", orgId)
      .order("createdAt", { ascending: true }),
    supabase
      .from("FounderFundingPack")
      .select("id, type, profileId, createdAt, content, inputs")
      .eq("organisationId", orgId)
      .order("createdAt", { ascending: false })
      .limit(10),
    supabase
      .from("Application")
      .select("id, status, profileId, grantId, Grant(id, name, funder)")
      .eq("organisationId", orgId)
      .order("updatedAt", { ascending: false })
      .limit(100),
    supabase
      .from("EligibilityAssessment")
      .select("grant_id, profile_id, score, decision, summary, Grant(id, name, funder, createdAt)")
      .eq("organisation_id", orgId)
      .order("score", { ascending: false })
      .limit(500),
  ]);

  let applicationRows: ApplicationOption[] = mapApplicationRows((applicationsData ?? []) as Record<string, unknown>[]);
  if (applicationRows.length === 0) {
    const alt = await supabase
      .from("Application")
      .select("id, status, profile_id, grant_id, Grant(id, name, funder)")
      .eq("organisation_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (!alt.error && alt.data?.length) {
      applicationRows = mapApplicationRows(
        (alt.data as Record<string, unknown>[]).map((r) => ({
          ...r,
          profileId: r.profile_id,
          grantId: r.grant_id,
          Grant: r.Grant ?? r.grant,
        }))
      );
    }
  }

  const appliedGrantByProfile = new Set(
    applicationRows
      .filter((a) => a.profileId && a.grantId)
      .map((a) => `${a.profileId}:${a.grantId}`)
  );

  const profileRows = ((profiles ?? []) as ProfileRow[]).map((profile) => ({
    id: profile.id,
    businessName: profile.businessName,
    sector: profile.sector,
    primaryContactName: profile.primaryContactName ?? null,
    primaryContactRole: profile.primaryContactRole ?? null,
    directorNames: profile.directorNames ?? null,
    founderBackground: profile.founderBackground ?? null,
    teamExpertise: profile.teamExpertise ?? null,
    financialProjections: profile.financialProjections ?? null,
  }));

  let eligibleGrantRows = mapEligibleAssessmentRows((eligibilityData ?? []) as Record<string, unknown>[]).filter(
    (row) => row.grantId && row.profileId && !appliedGrantByProfile.has(`${row.profileId}:${row.grantId}`)
  );

  if (initialGrantId && !eligibleGrantRows.some((row) => row.grantId === initialGrantId)) {
    const { data: grant } = await supabase
      .from("Grant")
      .select("id, name, funder, createdAt")
      .eq("id", initialGrantId)
      .maybeSingle();
    const profileId = profileRows[0]?.id;
    if (grant && profileId) {
      eligibleGrantRows = [
        {
          grantId: String(grant.id),
          profileId,
          grantName: String(grant.name ?? "Selected grant"),
          funder: String(grant.funder ?? ""),
          score: 0,
          decision: "selected_context",
          addedAt: String((grant as { createdAt?: string }).createdAt ?? ""),
        },
        ...eligibleGrantRows,
      ];
    }
  }

  const profileById = new Map(profileRows.map((profile) => [profile.id, profile]));
  const packRows = ((packs ?? []) as PackRow[]).map((pack) => {
    const profile = profileById.get(pack.profileId);
    return {
      id: pack.id,
      createdAt: pack.createdAt,
      createdAtLabel: formatDateLabel(pack.createdAt),
      type: pack.type,
      content: sanitiseFounderPackContent(pack.content, { businessName: profile?.businessName }),
      documentTypes: pack.inputs?.documentTypes ?? null,
      profileBusinessName: profile?.businessName ?? null,
      profileSector: profile?.sector ?? null,
    };
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-0 sm:px-2">
      <div className="rounded-2xl bg-white p-5 shadow-[0_18px_45px_rgba(7,26,58,0.07)] sm:p-6">
        <h1 className="text-2xl font-black text-[#071a3a]">Founder Funding Pack</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          Tie documents to specific opportunities: pick in-progress applications, scored eligible grants you have not started
          yet, and/or paste funder criteria so the AI shapes drafts, budgets, evidence checklists, and workplans around those
          targets.
        </p>
      </div>

      <FounderPackClient
        profiles={profileRows}
        applications={applicationRows}
        eligibleGrants={eligibleGrantRows}
        packs={packRows}
        allowed={allowed}
        initialGrantId={initialGrantId || undefined}
        initialApplicationId={initialApplicationId || undefined}
      />
    </div>
  );
}
