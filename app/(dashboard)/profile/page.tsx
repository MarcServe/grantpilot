import { getProfile } from "./actions";
import { getActiveOrg } from "@/lib/auth";
import { ProfileForm } from "@/components/profile/profile-form";
import { NotificationPreferences } from "@/components/profile/notification-preferences";

export default async function ProfilePage() {
  const [profile, { user }] = await Promise.all([getProfile(), getActiveOrg()]);

  const userRow = user as { phoneNumber?: string | null; whatsappOptIn?: boolean };
  const phoneNumber = userRow.phoneNumber ?? null;
  const whatsappOptIn = Boolean(userRow.whatsappOptIn);

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
        <ProfileForm profile={profile} />
      </div>
    </div>
  );
}
