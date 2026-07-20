import { getProfile } from "./actions";
import { getActiveOrg } from "@/lib/auth";
import { ProfileForm } from "@/components/profile/profile-form";
import { NotificationPreferences } from "@/components/profile/notification-preferences";
import { BusinessProfilesManager } from "@/components/profile/business-profiles-manager";
import { planAllowsForOrg, resolveEffectivePlanForOrg } from "@/lib/plan-features";
import { PLAN_LIMITS, planNotifyDisplayName } from "@/lib/plans";

function getFirstIncompleteStep(profile: {
  businessName: string;
  location: string;
  sector: string;
  missionStatement: string;
  description: string;
  employeeCount: number | null;
  annualRevenue: number | null;
  fundingMin: number;
  fundingMax: number;
  fundingPurposes: string[];
  documents: unknown[];
}): number {
  if (!profile.businessName?.trim() || !profile.location?.trim()) return 1;
  if (!profile.sector?.trim() || !profile.missionStatement?.trim() || !profile.description?.trim()) return 2;
  if (profile.employeeCount == null && profile.annualRevenue == null) return 3;
  if (!profile.fundingPurposes?.length || profile.fundingMin == null || profile.fundingMax == null) return 4;
  return 5;
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const sp = await searchParams;
  const stepParam = sp.step != null ? parseInt(String(sp.step), 10) : NaN;
  const stepFromQuery =
    Number.isFinite(stepParam) && stepParam >= 1 && stepParam <= 6 ? stepParam : null;

  const activeOrg = await getActiveOrg();
  const profile = await getProfile();
  const plan = resolveEffectivePlanForOrg(activeOrg.org);
  const profileLimit = PLAN_LIMITS[plan].profiles;
  const rawProfiles = activeOrg.org.profiles?.length ? activeOrg.org.profiles : [profile];
  const businessProfiles = rawProfiles.map((item) => ({
    id: item.id,
    businessName: item.businessName ?? null,
    location: typeof item.location === "string" ? item.location : null,
    sector: typeof item.sector === "string" ? item.sector : null,
    completionScore: Number(item.completionScore ?? item.completion_score ?? 0),
  }));
  const companyDnaAutofillEnabled = planAllowsForOrg(
    activeOrg.org,
    "website_intelligence_refresh"
  );
  const whatsappAlertsEnabled = planAllowsForOrg(
    activeOrg.org,
    "whatsapp_opportunity_alerts"
  );

  const userRow = activeOrg.user as { phoneNumber?: string | null; whatsappOptIn?: boolean };
  const phoneNumber = userRow.phoneNumber ?? null;
  const whatsappOptIn = Boolean(userRow.whatsappOptIn);

  const suggestedStep = getFirstIncompleteStep({
    businessName: profile.businessName,
    location: profile.location,
    sector: profile.sector,
    missionStatement: profile.missionStatement,
    description: profile.description,
    employeeCount: profile.employeeCount,
    annualRevenue: profile.annualRevenue,
    fundingMin: profile.fundingMin,
    fundingMax: profile.fundingMax,
    fundingPurposes: profile.fundingPurposes ?? [],
    documents: profile.documents ?? [],
  });

  const initialStep = stepFromQuery ?? suggestedStep;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-0 sm:px-2">
      <div className="rounded-2xl bg-white p-5 shadow-[0_18px_45px_rgba(7,26,58,0.07)] sm:p-6">
        <h1 className="text-2xl font-black text-[#071a3a]">Business Profile</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
          Complete your business profile to get matched with relevant grants.
          Your information is saved at each step.
        </p>
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-5 sm:space-y-6">
        <BusinessProfilesManager
          profiles={businessProfiles}
          activeProfileId={activeOrg.activeProfileId ?? profile.id}
          profileLimit={profileLimit}
          planName={planNotifyDisplayName(plan)}
        />
        <NotificationPreferences
          defaultValues={{
            phoneNumber,
            whatsappOptIn,
          }}
          whatsappAlertsEnabled={whatsappAlertsEnabled}
        />
        <ProfileForm profile={profile} initialStep={initialStep} companyDnaAutofillEnabled={companyDnaAutofillEnabled} />
      </div>
    </div>
  );
}
