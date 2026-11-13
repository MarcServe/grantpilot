import Link from "next/link";
import { startUpLoanPreparation } from "@/lib/start-up-loans-preparation";
import { grantPreparationPrompts } from "@/lib/grant-preparation-prompts";
import { loadReviewedGrantDocuments } from "@/lib/reviewed-grant-context";
import { loadFounderPackLabels } from "@/lib/founder-pack-labels";
import { criteriaEnabled } from "@/lib/criteria-flags";
import { PreparationChecklist } from "@/components/grants/preparation-checklist";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  sanitiseFounderPackContent,
  type FounderPackContent,
  type FounderPackDocumentType,
} from "@/lib/founder-pack";
import { FounderPackClient } from "@/components/founder-pack/founder-pack-client";
import { planAllowsForOrg } from "@/lib/plan-features";
import { getGrantFreshnessStatus } from "@/lib/grant-freshness";

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

function mapApplicationRows(
  raw: Record<string, unknown>[],
): ApplicationOption[] {
  return raw.map((row) => {
    const gRaw = row.Grant ?? row.grant;
    const g = Array.isArray(gRaw) ? gRaw[0] : gRaw;
    const grant =
      g && typeof g === "object" ? (g as Record<string, unknown>) : {};
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

function mapEligibleAssessmentRows(
  raw: Record<string, unknown>[],
): EligibleGrantOption[] {
  return raw.map((row) => {
    const gRaw = row.Grant ?? row.grant;
    const g = Array.isArray(gRaw) ? gRaw[0] : gRaw;
    const grant =
      g && typeof g === "object" ? (g as Record<string, unknown>) : {};
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
  searchParams?: Promise<{
    grantId?: string;
    applicationId?: string;
    workspace?: string;
    scheme?: string;
    loanDocument?: string;
    requirementId?: string;
    criterionId?: string;
    prepare?: string;
    draftKind?: string;
  }>;
}) {
  const params = await searchParams;
  const assistantOnly = params?.workspace === "questions";
  const loanPreparation = assistantOnly && params?.scheme === "start-up-loans" ? startUpLoanPreparation(params?.loanDocument) : null;
  const initialGrantId = loanPreparation ? "" : params?.grantId?.trim() || "";
  const initialApplicationId = loanPreparation ? "" : params?.applicationId?.trim() || "";
  const { org, orgId, activeProfileId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();
  const allowed = planAllowsForOrg(org, "founder_pack");

  const [
    { data: profiles },
    { data: packs },
    { data: applicationsData },
    { data: eligibilityData },
    { count: freeQuestionPreviewCount },
  ] = await Promise.all([
    supabase
      .from("BusinessProfile")
      .select(
        "id, businessName, sector, primaryContactName, primaryContactRole, directorNames, founderBackground, teamExpertise, financialProjections",
      )
      .eq("organisationId", orgId)
      .eq("id", activeProfileId ?? "")
      .order("createdAt", { ascending: true }),
    supabase
      .from("FounderFundingPack")
      .select("id, type, profileId, createdAt, content, inputs")
      .eq("organisationId", orgId)
      .eq("profileId", activeProfileId ?? "")
      .order("createdAt", { ascending: false })
      .limit(10),
    supabase
      .from("Application")
      .select("id, status, profileId, grantId, Grant(id, name, funder)")
      .eq("organisationId", orgId)
      .eq("profileId", activeProfileId ?? "")
      .order("updatedAt", { ascending: false })
      .limit(20),
    supabase
      .from("EligibilityAssessment")
      .select(
        "grant_id, profile_id, score, decision, summary, Grant(id, name, funder, createdAt, deadline, url_status, eligibility, description, objectives)",
      )
      .eq("organisation_id", orgId)
      .eq("profile_id", activeProfileId ?? "")
      .order("score", { ascending: false })
      .limit(20),
    supabase
      .from("Usage")
      .select("id", { count: "exact", head: true })
      .eq("organisationId", orgId)
      .eq("type", "founder_pack_free_answer"),
  ]);
  const questionPreviewAvailable =
    !allowed && (freeQuestionPreviewCount ?? 0) === 0;

  let applicationRows: ApplicationOption[] = mapApplicationRows(
    (applicationsData ?? []) as Record<string, unknown>[],
  );
  if (applicationRows.length === 0) {
    const alt = await supabase
      .from("Application")
      .select("id, status, profile_id, grant_id, Grant(id, name, funder)")
      .eq("organisation_id", orgId)
      .eq("profile_id", activeProfileId ?? "")
      .order("updated_at", { ascending: false })
      .limit(20);
    if (!alt.error && alt.data?.length) {
      applicationRows = mapApplicationRows(
        (alt.data as Record<string, unknown>[]).map((r) => ({
          ...r,
          profileId: r.profile_id,
          grantId: r.grant_id,
          Grant: r.Grant ?? r.grant,
        })),
      );
    }
  }

  const appliedGrantByProfile = new Set(
    applicationRows
      .filter((a) => a.profileId && a.grantId)
      .map((a) => `${a.profileId}:${a.grantId}`),
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

  const freshEligibilityRows = (
    (eligibilityData ?? []) as Record<string, unknown>[]
  ).filter((row) => {
    const gRaw = row.Grant ?? row.grant;
    const g = Array.isArray(gRaw) ? gRaw[0] : gRaw;
    return (
      !g ||
      typeof g !== "object" ||
      getGrantFreshnessStatus(g as Record<string, unknown>).usable
    );
  });
  let eligibleGrantRows = mapEligibleAssessmentRows(
    freshEligibilityRows,
  ).filter(
    (row) =>
      row.grantId &&
      row.profileId &&
      !appliedGrantByProfile.has(`${row.profileId}:${row.grantId}`),
  );

  if (
    initialGrantId &&
    !eligibleGrantRows.some((row) => row.grantId === initialGrantId)
  ) {
    const { data: grant } = await supabase
      .from("Grant")
      .select(
        "id, name, funder, createdAt, deadline, url_status, eligibility, description, objectives",
      )
      .eq("id", initialGrantId)
      .maybeSingle();
    const profileId = profileRows[0]?.id;
    if (grant && profileId && getGrantFreshnessStatus(grant).usable) {
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

  const profileById = new Map(
    profileRows.map((profile) => [profile.id, profile]),
  );
  const packLabels = await loadFounderPackLabels(supabase, orgId, (packs ?? []) as PackRow[]);
  const packRows = ((packs ?? []) as PackRow[]).map((pack) => {
    const profile = profileById.get(pack.profileId);
    return {
      id: pack.id,
      createdAt: pack.createdAt,
      createdAtLabel: formatDateLabel(pack.createdAt),
      name: packLabels.get(pack.id),
      type: pack.type,
      content: sanitiseFounderPackContent(pack.content, {
        businessName: profile?.businessName,
      }),
      documentTypes: pack.inputs?.documentTypes ?? null,
      profileBusinessName: profile?.businessName ?? null,
      profileSector: profile?.sector ?? null,
    };
  });

  const reviewed = initialGrantId ? await loadReviewedGrantDocuments(supabase, [initialGrantId]) : null;
  const criterionDoc = reviewed?.documents.get(initialGrantId);
  const preparation = loanPreparation ?? grantPreparationPrompts(criterionDoc, params ?? {});
  const initialQuestions = preparation.questions;
  const initialRequirements = loanPreparation ? loanPreparation.context : (criterionDoc ? `Published source: ${criterionDoc.sourceUrl}
Review coverage: ${criterionDoc.coverage}. Use the full reviewed guidance supplied by the server together with the selected business profile. Requirements needing evidence are not confirmed facts.` : "");
  const preparationKey = loanPreparation ? `loan:start-up-loans:${loanPreparation.key}` : params?.criterionId ? `criterion:${params.criterionId}:${preparation.mode}` : params?.requirementId ?? (params?.prepare ? `${params.prepare}:${preparation.mode}` : "all");

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-0 sm:px-2">
      <div className="rounded-2xl bg-white p-5 shadow-[0_18px_45px_rgba(7,26,58,0.07)] sm:p-6">
        <h1 className="text-2xl font-black text-[#071a3a]">
          {assistantOnly
            ? "AI Grant Question Assistant"
            : "Grant Application Workspace"}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          Turn one grant into funder-ready answers, evidence steps, budgets,
          workplans, and exportable documents. Pick a matched grant or
          in-progress application, paste the funder&apos;s questions, and
          GrantsCopilot uses your Business DNA and eligibility reasoning to help
          you prepare the application.
        </p>
      </div>

      <Link href="/loans/start-up-loans" className="inline-block text-sm font-semibold text-primary underline underline-offset-4">British Business Bank Start Up Loans: requirements and preparation →</Link>
      {loanPreparation && <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">Start Up Loans preparation is loaded. Confirm your business profile, keep unrelated grants unselected, and provide real figures in the guidance field. These are editable preparation drafts based on public guidance, not private lender form questions. Approval, affordability and credit checks remain with the lender.</p>}
      {initialGrantId && criteriaEnabled() && (
        <PreparationChecklist grantId={initialGrantId} />
      )}
      {preparation.error && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">{preparation.error}</p>}
      <FounderPackClient
        key={`${activeProfileId}:${initialGrantId}:${preparationKey}`}
        assistantOnly={assistantOnly}
        initialScheme={loanPreparation ? "start-up-loans" : undefined}
        profiles={profileRows}
        applications={applicationRows}
        eligibleGrants={eligibleGrantRows}
        packs={packRows}
        allowed={allowed}
        questionPreviewAvailable={questionPreviewAvailable}
        initialRequirements={initialRequirements}
        initialRequirementId={preparationKey}
        initialDraftMode={assistantOnly ? preparation.mode : "draft_answer"}
        initialDraftTitle={preparation.title}
        initialQuestions={assistantOnly ? initialQuestions : []}
        initialGrantId={initialGrantId || undefined}
        initialApplicationId={initialApplicationId || undefined}
      />
    </div>
  );
}
