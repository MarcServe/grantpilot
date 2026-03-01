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
} from "lucide-react";
import { ApplyButton } from "@/components/grants/apply-button";
import { EligibilityCard } from "@/components/grants/eligibility-card";

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

  const { data: allGrants = [] } = await supabase
    .from("Grant")
    .select("id, name, funder, amount, applicationUrl, sectors")
    .neq("id", grant.id);
  const sectors = (grant.sectors ?? []) as string[];
  const funderName = (grant.funder ?? "") as string;
  const similarGrants = (allGrants as { id: string; name: string; funder: string; sectors?: string[] }[])
    .filter(
      (g) =>
        g.funder === funderName ||
        (sectors.length > 0 && (g.sectors ?? []).some((s: string) => sectors.includes(s)))
    )
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        href="/grants"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Grants
      </Link>

      <Card>
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
            <h3 className="mb-2 font-semibold">Eligibility</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {grant.eligibility}
            </p>
          </div>

          {hasProfile && profileId && (
            <>
              <Separator />
              <EligibilityCard grantId={grant.id} />
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
