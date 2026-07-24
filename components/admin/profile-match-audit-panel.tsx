"use client";

import { useEffect, useMemo, useState } from "react";
import { Brain, Loader2, SearchCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProfileOption = {
  id: string;
  organisationId: string;
  businessName: string;
  organisationName: string;
  completionScore: number;
  sector: string | null;
  location: string | null;
};

type AuditGrant = {
  grantId: string;
  name: string;
  funder: string;
  addedAt: string | null;
  score: number | null;
  scoringSource: string | null;
  matchSection: "suggested" | "within_reach" | "other" | "needs_review" | "reviewed" | "unscored";
  summary: string | null;
  targetSummary: string | null;
  missingCriteria: string[];
  whyNotSuggested: string[];
};

type ProfileMatchAudit = {
  profile: ProfileOption;
  summary: {
    assessedCount: number;
    trustedStrong: number;
    withinReach: number;
    recentLibraryChecked: number;
    savedStates: number;
    applied: number;
  };
  topMatched: AuditGrant[];
  promisingLibraryNotSuggested: AuditGrant[];
};

type AuditPayload = {
  profiles?: ProfileOption[];
  audit?: ProfileMatchAudit | null;
  error?: string;
};

function formatDate(value?: string | null): string {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function sectionLabel(section: AuditGrant["matchSection"]): string {
  if (section === "suggested") return "Suggested";
  if (section === "within_reach") return "Within reach";
  if (section === "needs_review") return "Needs AI review";
  if (section === "reviewed") return "Reviewed";
  if (section === "unscored") return "Not scored";
  return "Other";
}

function sectionClass(section: AuditGrant["matchSection"]): string {
  if (section === "suggested") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (section === "within_reach") return "bg-amber-50 text-amber-800 border-amber-200";
  if (section === "needs_review") return "bg-orange-50 text-orange-800 border-orange-200";
  if (section === "reviewed") return "bg-blue-50 text-blue-800 border-blue-200";
  if (section === "unscored") return "bg-muted text-muted-foreground";
  return "";
}

function AuditGrantRow({ grant, showReasons }: { grant: AuditGrant; showReasons?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="break-words font-medium">{grant.name}</div>
          <div className="text-xs text-muted-foreground">
            {grant.funder} - added {formatDate(grant.addedAt)}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          {grant.score != null ? (
            <Badge variant="secondary">{grant.score}%</Badge>
          ) : null}
          <Badge variant="outline" className={sectionClass(grant.matchSection)}>
            {sectionLabel(grant.matchSection)}
          </Badge>
        </div>
      </div>
      {grant.targetSummary ? (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Targets: </span>
          {grant.targetSummary}
        </p>
      ) : null}
      {grant.summary ? (
        <p className="mt-2 text-xs text-muted-foreground">{grant.summary}</p>
      ) : null}
      {showReasons && grant.whyNotSuggested.length > 0 ? (
        <div className="mt-2 rounded border border-blue-100 bg-blue-50/70 p-2 text-xs text-blue-950">
          <div className="font-semibold">Why not Suggested?</div>
          <ul className="mt-1 space-y-1">
            {grant.whyNotSuggested.slice(0, 4).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ProfileMatchAuditPanel() {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [audit, setAudit] = useState<ProfileMatchAudit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId]
  );

  async function loadAudit(profileId?: string) {
    setLoading(true);
    setError(null);
    try {
      const url = profileId
        ? `/api/admin/profile-match-audit?profileId=${encodeURIComponent(profileId)}`
        : "/api/admin/profile-match-audit";
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as AuditPayload;
      if (!response.ok) throw new Error(data.error ?? "Could not load profile match audit.");
      const nextProfiles = data.profiles ?? [];
      setProfiles(nextProfiles);
      if (!profileId && !selectedProfileId && nextProfiles[0]?.id) {
        setSelectedProfileId(nextProfiles[0].id);
      }
      setAudit(data.audit ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load profile match audit.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAudit();
    // Load the profile index once; audits are loaded explicitly so admin page does not fan out by default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSelectedAudit() {
    if (!selectedProfileId) return;
    await loadAudit(selectedProfileId);
  }

  return (
    <Card className="min-w-0 overflow-hidden xl:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SearchCheck className="h-4 w-4 text-blue-600" />
          Profile match audit
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-[34rem] space-y-4 overflow-y-auto pr-2 text-sm">
        <p className="text-muted-foreground">
          Inspect one profile at a time. This compares cached assessments and recent library grants, then explains why
          visible grants are or are not in personalised My Matches.
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select
            value={selectedProfileId}
            onChange={(event) => setSelectedProfileId(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {profiles.length === 0 ? (
              <option value="">No profiles found</option>
            ) : (
              profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.businessName} - {profile.organisationName} ({profile.completionScore}%)
                </option>
              ))
            )}
          </select>
          <Button size="sm" disabled={!selectedProfileId || loading} onClick={() => void runSelectedAudit()}>
            {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Brain className="mr-2 h-3.5 w-3.5" />}
            Audit profile
          </Button>
        </div>

        {selectedProfile && !audit ? (
          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
            Selected: {selectedProfile.businessName}. Run the audit to see matched grants and missing reasons.
          </div>
        ) : null}

        {error ? (
          <div className="break-words rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
            {error}
          </div>
        ) : null}

        {audit ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="font-medium">{audit.profile.businessName}</div>
              <div className="text-xs text-muted-foreground">
                {audit.profile.organisationName} - profile {audit.profile.completionScore}% - {audit.profile.sector ?? "No sector"} -{" "}
                {audit.profile.location ?? "No location"}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <div className="rounded border bg-background p-2">
                  <div className="text-muted-foreground">Assessments</div>
                  <div className="text-lg font-semibold">{audit.summary.assessedCount}</div>
                </div>
                <div className="rounded border bg-background p-2">
                  <div className="text-muted-foreground">Strong 85%+</div>
                  <div className="text-lg font-semibold text-emerald-700">{audit.summary.trustedStrong}</div>
                </div>
                <div className="rounded border bg-background p-2">
                  <div className="text-muted-foreground">Within reach</div>
                  <div className="text-lg font-semibold text-amber-700">{audit.summary.withinReach}</div>
                </div>
                <div className="rounded border bg-background p-2">
                  <div className="text-muted-foreground">Recent checked</div>
                  <div className="text-lg font-semibold">{audit.summary.recentLibraryChecked}</div>
                </div>
                <div className="rounded border bg-background p-2">
                  <div className="text-muted-foreground">Saved states</div>
                  <div className="text-lg font-semibold">{audit.summary.savedStates}</div>
                </div>
                <div className="rounded border bg-background p-2">
                  <div className="text-muted-foreground">Applied</div>
                  <div className="text-lg font-semibold">{audit.summary.applied}</div>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 font-semibold">Top personalised matches</div>
              <div className="space-y-2">
                {audit.topMatched.length > 0 ? (
                  audit.topMatched.map((grant) => (
                    <AuditGrantRow key={`top-${grant.grantId}`} grant={grant} />
                  ))
                ) : (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    No 50%+ cached assessments found for this profile yet.
                  </p>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 font-semibold">Recent library grants not currently Suggested</div>
              <div className="space-y-2">
                {audit.promisingLibraryNotSuggested.length > 0 ? (
                  audit.promisingLibraryNotSuggested.map((grant) => (
                    <AuditGrantRow key={`missing-${grant.grantId}`} grant={grant} showReasons />
                  ))
                ) : (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    No recent library gaps found in the bounded audit window.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
