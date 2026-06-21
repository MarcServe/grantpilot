"use client";

import { useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  EligibilityWhatsAppReason,
  EligibilityWhatsAppTrace,
} from "@/lib/eligibility-notification-diagnostics";

const WHATSAPP_REASON_LABELS: Record<EligibilityWhatsAppReason, string> = {
  whatsapp_sent: "WhatsApp sent",
  no_profile: "No profile",
  profile_completion_below_threshold: "Profile below threshold",
  plan_blocked: "Plan blocked",
  email_disabled: "Email disabled",
  whatsapp_disabled: "WhatsApp disabled",
  no_phone: "No phone",
  not_opted_in: "Not opted in",
  template_missing: "Template missing",
  no_85_plus_candidates: "No 85%+ candidates",
  already_notified: "Already notified",
  whatsapp_failed: "WhatsApp failed",
  missed_latest_run: "Missed latest run",
  ready_to_send_next_run: "Ready next run",
};

const LONDON_DATE = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/London",
});

function whatsappReasonClass(reason: EligibilityWhatsAppReason): string {
  if (reason === "whatsapp_sent" || reason === "ready_to_send_next_run") return "text-emerald-700";
  if (reason === "no_85_plus_candidates" || reason === "already_notified") return "text-amber-700";
  return "text-red-700";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return LONDON_DATE.format(date);
}

function formatRelative(value?: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function WhatsAppDiagnosticsPanel() {
  const [traces, setTraces] = useState<EligibilityWhatsAppTrace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadDiagnostics() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/whatsapp-diagnostics", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? "Failed to load WhatsApp diagnostics.");
      }
      setTraces(((payload as { traces?: EligibilityWhatsAppTrace[] }).traces ?? []) as EligibilityWhatsAppTrace[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load WhatsApp diagnostics.");
    } finally {
      setLoading(false);
    }
  }

  if (!traces) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-sm text-muted-foreground">
          WhatsApp remains 85%+ only. This trace separates no high-match candidates from preference,
          plan, phone, template, cooldown, or send failures.
        </p>
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-sm text-muted-foreground">
            Detailed WhatsApp diagnostics load inside this card so the rest of the admin page stays in place.
          </p>
          <Button size="sm" variant="outline" className="mt-3" disabled={loading} onClick={() => void loadDiagnostics()}>
            {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="mr-2 h-3.5 w-3.5" />}
            Load WhatsApp diagnostics
          </Button>
          {error ? (
            <div className="mt-3 break-words rounded border border-red-200 bg-red-50 p-2 text-xs text-red-900">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Daily WhatsApp diagnostics for the latest eligible organisations.
        </p>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void loadDiagnostics()}>
          {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Refresh card
        </Button>
      </div>
      {error ? (
        <div className="break-words rounded border border-red-200 bg-red-50 p-2 text-xs text-red-900">
          {error}
        </div>
      ) : null}
      {traces.length > 0 ? (
        traces.map((trace) => (
          <div key={trace.orgId} className="rounded-md border p-3">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <div className="truncate font-medium">{trace.profile?.businessName ?? trace.orgName}</div>
                <div className="text-xs text-muted-foreground">
                  {trace.orgName} - {trace.plan} - profile {trace.profile?.completionScore ?? 0}%
                </div>
              </div>
              <span className={`shrink-0 text-xs font-medium ${whatsappReasonClass(trace.finalReason)}`}>
                {WHATSAPP_REASON_LABELS[trace.finalReason]}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded border bg-muted/30 p-2">
                <div className="text-muted-foreground">Current 85%+</div>
                <div className="text-lg font-semibold">{trace.highMatchCandidates}</div>
              </div>
              <div className="rounded border bg-muted/30 p-2">
                <div className="text-muted-foreground">Unnotified</div>
                <div className="text-lg font-semibold">{trace.highMatchUnnotified}</div>
              </div>
              <div className="rounded border bg-muted/30 p-2">
                <div className="text-muted-foreground">Within reach</div>
                <div className="text-lg font-semibold">{trace.withinReachCandidates}</div>
              </div>
              <div className="rounded border bg-muted/30 p-2">
                <div className="text-muted-foreground">WA latest run</div>
                <div className="text-lg font-semibold">{trace.latestRunWhatsApp.sent}</div>
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                Latest eligibility run:{" "}
                {trace.latestEligibilityRun?.startedAt
                  ? `${formatRelative(trace.latestEligibilityRun.startedAt)} - ${trace.latestEligibilityRun.status}`
                  : "Not recorded"}
              </div>
              <div>
                Email/WA prefs: {trace.preferences.notifyEmail ? "email on" : "email off"} /{" "}
                {trace.preferences.notifyWhatsApp ? "WhatsApp on" : "WhatsApp off"}
              </div>
              <div>
                Members: {trace.users.length}; phone+opt-in:{" "}
                {trace.users.filter((user) => user.hasPhone && user.whatsappOptIn).length}
              </div>
              <div>
                Twilio template: {trace.twilioGrantTemplateConfigured ? "configured" : "missing"}
              </div>
              <div>
                Stored 85%+ rows: {trace.storedHighMatchCandidates}; WA sent daily: {trace.recentWhatsApp.sent}
              </div>
              {trace.grantScope ? (
                <div>
                  Latest grant sample: {trace.grantScope.locationMatched} location matched / {trace.grantScope.usableCurrent} usable
                </div>
              ) : null}
            </div>
            {trace.blockers.length > 0 ? (
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <ul className="space-y-1">
                  {trace.blockers.slice(0, 2).map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {trace.matchHealth ? (
              <div className="mt-2 rounded-md border bg-muted/20 p-2 text-xs">
                <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                  <span className="font-medium text-foreground">Match health</span>
                  <span
                    className={
                      trace.matchHealth.shouldPrompt
                        ? "font-medium text-amber-700"
                        : "text-muted-foreground"
                    }
                  >
                    {trace.matchHealth.shouldPrompt ? "Business DNA prompt due" : trace.matchHealth.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground sm:grid-cols-4">
                  <span>{trace.matchHealth.currentHighMatches} current 85%+</span>
                  <span>{trace.matchHealth.currentWithinReach} within reach</span>
                  <span>{trace.matchHealth.suppressedOrApplied} suppressed/applied</span>
                  <span>{trace.matchHealth.profileGaps.length} profile gaps</span>
                </div>
                {trace.matchHealth.topBlockers.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                    {trace.matchHealth.topBlockers.slice(0, 3).map((blocker) => (
                      <li key={blocker.reason}>
                        {blocker.label} ({blocker.count})
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {(trace.latestRunWhatsApp.latestError ?? trace.recentWhatsApp.latestError) ? (
              <div className="mt-2 break-words rounded border border-red-200 bg-red-50 p-2 text-xs text-red-900">
                {trace.latestRunWhatsApp.latestError ?? trace.recentWhatsApp.latestError}
              </div>
            ) : null}
          </div>
        ))
      ) : (
        <p className="text-muted-foreground">No organisations found for WhatsApp diagnostics.</p>
      )}
      {traces.length > 0 ? (
        <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
          Loaded {formatDateTime(new Date().toISOString())}
        </div>
      ) : null}
    </div>
  );
}
