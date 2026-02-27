import { getProfile } from "./actions";
import { ProfileForm } from "@/components/profile/profile-form";

export default async function ProfilePage() {
  const profile = await getProfile();

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Business Profile</h1>
        <p className="mt-1 text-muted-foreground">
          Complete your business profile to get matched with relevant grants.
          Your information is saved at each step.
        </p>
      </div>
      <ProfileForm profile={profile} />
    </div>
  );
}
