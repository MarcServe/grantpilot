import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  Building2,
  MapPin,
  ExternalLink,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import { ApplyButton } from "@/components/grants/apply-button";
import { EditApplicationUrl } from "@/components/grants/edit-application-url";
import { EligibilityCard } from "@/components/grants/eligibility-card";
import { EnsureFormLinkScout } from "@/components/grants/ensure-form-link-scout";
import { computeUrgency } from "@/lib/urgency";
import { checkRequirementsAgainstDocuments } from "@/lib/grant-requirements";
import type { RequiredAttachment } from "@/lib/grant-requirements";

export default async function GrantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: grant, error: grantError } = await supabase
    .from("Grant")
    .select("*")
    .eq("id", id)
    .single();

  if (grantError || !grant) notFound();

  const { org, orgId } = await getActiveOrg();
  const profile = org.profiles?.[0];
  const hasProfile = !!profile && (profile.completionScore ?? 0) >= 50;
  const profileId = profile?.id ?? null;

  const { data: existingApplication } = await supabase
    .from("Application")
    .select("id")
    .eq("organisationId", orgId)
    .eq("grantId", grant.id)
    .maybeSingle();

  let eligibilityScore: number | null = null;
  if (profileId) {
    const { data: assessment } = await supabase
      .from("EligibilityAssessment")
      .select("score")
      .eq("organisation_id", orgId)
      .eq("profile_id", profileId)
      .eq("grant_id", grant.id)
      .maybeSingle();
    eligibilityScore = (assessment as { score?: number } | null)?.score ?? null;
  }

  const { data: allGrantsData } = await supabase
    .from("Grant")
    .select("id, name, funder, amount, applicationUrl, sectors")
    .neq("id", grant.id);
  const allGrants = allGrantsData ?? [];
  const sectors = (grant.sectors ?? []) as string[];
  const funderName = (grant.funder ?? "") as string;
  const similarGrants = (allGrants as { id: string; name: string; funder: string; sectors?: string[] }[])
    .filter(
      (g) =>
        g.funder === funderName ||
        (sectors.length > 0 && (g.sectors ?? []).some((s: string) => sectors.includes(s)))
    )
    .slice(0, 5);

  const urgency = computeUrgency(grant.deadline ?? null);

  let missingDocLabels: string[] = [];
  if (profileId) {
    const rawRequired = (grant as { required_attachments?: unknown }).required_attachments;
    const required = (Array.isArray(rawRequired) ? rawRequired : []) as RequiredAttachment[];
    if (required.length > 0) {
      const { data: docRows } = await supabase
        .from("Document")
        .select("name, type, category")
        .eq("profileId", profileId);
      const docRowsAlt = !docRows?.length
        ? await supabase.from("Document").select("name, type, category").eq("profile_id", profileId)
        : { data: docRows };
      const documents = (docRowsAlt.data ?? []).map((d: { name: string; type?: string; category?: string }) => ({
        name: d.name,
        type: d.type ?? "",
        category: d.category ?? null,
      }));
      const { missing } = checkRequirementsAgainstDocuments(required, documents);
      missingDocLabels = missing.map((r) => r.label);
    }
  }

  return (
    <div className="mx-auto max-w-4xl min-w-0 overflow-hidden p-6">
      <EnsureFormLinkScout
        grantId={grant.id}
        applicationUrl={grant.applicationUrl ?? ""}
        eligibilityScore={eligibilityScore}
      />
      <Link
        href="/grants"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Grants
      </Link>

      {missingDocLabels.length > 0 && (
        <div className="mb-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">
              This grant may require documents you haven&apos;t uploaded
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              Add these in Profile → Documents so we can attach them when you apply:{" "}
              {missingDocLabels.join(", ")}.
            </p>
            <Link
              href="/profile"
              className="mt-2 inline-block text-sm font-medium text-amber-800 underline hover:no-underline dark:text-amber-200"
            >
              Go to Profile → Documents
            </Link>
          </div>
        </div>
      )}

      <Card className="min-w-0">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{grant.name}</CardTitle>
              <div className="mt-2 flex items-center gap-1 text-muted-foreground">
                <Building2 className="h-4 w-4" />
                {grant.funder}
              </div>
            </div>
            {grant.amount && (
              <Badge variant="secondary" className="text-lg">
                {Number(grant.amount).toLocaleString("en-GB", {
                  style: "currency",
                  currency: "GBP",
                  maximumFractionDigits: 0,
                })}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-3">
            {grant.deadline && (
              <Badge variant="outline" className="gap-1">
                <Calendar className="h-3 w-3" />
                Deadline: {new Date(grant.deadline).toLocaleDateString("en-GB")}
              </Badge>
            )}
            {urgency.level !== "NONE" && urgency.label && (
              <Badge
                variant="outline"
                className={
                  urgency.level === "HIGH"
                    ? "border-red-500/50 bg-red-50 text-red-800 dark:bg-red-950/30"
                    : urgency.level === "MEDIUM"
                      ? "border-amber-500/50 bg-amber-50 text-amber-800"
                      : ""
                }
              >
                {urgency.label}
              </Badge>
            )}
            {(grant.sectors ?? []).map((s: string) => (
              <Badge key={s} variant="outline">
                {s}
              </Badge>
            ))}
            {(grant.regions ?? []).map((r: string) => (
              <Badge key={r} variant="outline" className="gap-1">
                <MapPin className="h-3 w-3" />
                {r}
              </Badge>
            ))}
          </div>

          <Separator />

          <div>
            <h3 className="mb-2 font-semibold">Application link</h3>
            <EditApplicationUrl grantId={grant.id} applicationUrl={grant.applicationUrl ?? ""} />
          </div>

          {grant.description && (
            <div>
              <h3 className="mb-2 font-semibold">Description</h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {grant.description}
              </p>
            </div>
          )}

          {grant.objectives && (
            <div>
              <h3 className="mb-2 font-semibold">Objectives & Conditions</h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {String(grant.objectives).slice(0, 1500)}
              </p>
            </div>
          )}

          <div>
            <h3 className="mb-2 font-semibold">Eligibility</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {grant.eligibility}
            </p>
            {(grant.applicantTypes as string[] | undefined)?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {(grant.applicantTypes as string[]).map((t: string) => (
                  <Badge key={t} variant="outline" className="text-xs">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          {hasProfile && profileId && (
            <>
              <Separator />
              <EligibilityCard grantId={grant.id} applicationId={existingApplication?.id} />
            </>
          )}

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row">
            {existingApplication ? (
              <Link href={`/applications/${existingApplication.id}`}>
                <Button variant="outline" className="gap-2">
                  View Application
                </Button>
              </Link>
            ) : hasProfile && profileId ? (
              <ApplyButton
                key={grant.id}
                grantId={grant.id}
                profileId={profileId}
                eligibilityScore={eligibilityScore ?? undefined}
              />
            ) : (
              <div className="text-sm text-muted-foreground">
                Complete at least 50% of your business profile to apply.
              </div>
            )}

            <a
              href={grant.applicationUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="ghost" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                View Original
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
