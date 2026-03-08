import { getProfile } from "./actions";
import { getActiveOrg } from "@/lib/auth";
import { ProfileForm } from "@/components/profile/profile-form";
import { NotificationPreferences } from "@/components/profile/notification-preferences";

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

export default async function ProfilePage() {
  const [profile, { user }] = await Promise.all([getProfile(), getActiveOrg()]);

  const userRow = user as { phoneNumber?: string | null; whatsappOptIn?: boolean };
  const phoneNumber = userRow.phoneNumber ?? null;
  const whatsappOptIn = Boolean(userRow.whatsappOptIn);

  const initialStep = getFirstIncompleteStep({
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

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Business Profile</h1>
        <p className="mt-1 text-muted-foreground">
          Complete your business profile to get matched with relevant grants.
          Your information is saved at each step.
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-6">
        <NotificationPreferences
          defaultValues={{
            phoneNumber,
            whatsappOptIn,
          }}
        />
        <ProfileForm profile={profile} initialStep={initialStep} />
      </div>
    </div>
  );
}
