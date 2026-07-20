import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronDown, CreditCard, LockKeyhole, UserRound } from "lucide-react";
import { getActiveOrg } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NotificationPreferences } from "@/components/profile/notification-preferences";
import { NotificationTimezone } from "@/components/billing/notification-timezone";
import { PortalCredentialsManager } from "@/components/settings/portal-credentials";
import { planAllowsForOrg } from "@/lib/plan-features";

export default async function SettingsPage() {
  let active;
  try {
    active = await getActiveOrg();
  } catch {
    redirect("/sign-in");
  }

  const { user, org, role } = active;
  const userRow = user as {
    email?: string | null;
    name?: string | null;
    phoneNumber?: string | null;
    phone_number?: string | null;
    whatsappOptIn?: boolean | null;
    whatsapp_opt_in?: boolean | null;
  };
  const orgRow = org as {
    name?: string | null;
    plan?: string | null;
    createdAt?: string | Date | null;
    created_at?: string | Date | null;
    preferredTimezone?: string | null;
    profiles?: { id?: string; completionScore?: number | null; businessName?: string | null }[];
  };
  const profile = orgRow.profiles?.[0];
  const phoneNumber = userRow.phoneNumber ?? userRow.phone_number ?? "";
  const whatsappOptIn = Boolean(userRow.whatsappOptIn ?? userRow.whatsapp_opt_in);
  const whatsappAlertsEnabled = planAllowsForOrg(
    orgRow,
    "whatsapp_opportunity_alerts"
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage account details, notifications, billing, and optional future portal automation settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="h-4 w-4" />
            Account and profile
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <SettingRow label="Email" value={userRow.email ?? "Not set"} />
          <SettingRow label="Role" value={String(role ?? "Member")} />
          <SettingRow label="Organisation" value={orgRow.name ?? "My Organisation"} />
          <SettingRow label="Plan" value={String(orgRow.plan ?? "FREE_TRIAL").replace(/_/g, " ")} />
          <SettingRow label="Business profile" value={profile?.businessName ?? "Primary profile"} />
          <SettingRow label="Profile completion" value={`${Math.round(profile?.completionScore ?? 0)}%`} />
          <div className="sm:col-span-2">
            <Link href="/profile">
              <Button variant="outline" size="sm">Update profile</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <NotificationPreferences
        defaultValues={{
          phoneNumber,
          whatsappOptIn,
        }}
        whatsappAlertsEnabled={whatsappAlertsEnabled}
      />

      <NotificationTimezone preferredTimezone={orgRow.preferredTimezone ?? null} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            Billing
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Review your plan, usage, and subscription status.
          </p>
          <Link href="/billing">
            <Button size="sm" variant="outline">Open billing</Button>
          </Link>
        </CardContent>
      </Card>

      <details className="group rounded-lg border bg-card text-card-foreground shadow-sm">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4 sm:p-6">
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-base font-semibold">
              <LockKeyhole className="h-4 w-4" />
              Version 2 portal automation
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Optional saved credentials for future login-assisted workflows. Hidden by default for Version 1.
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <PortalCredentialsManager />
        </div>
      </details>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-medium text-foreground">{value}</p>
    </div>
  );
}
