import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PortalCredentialsManager } from "@/components/settings/portal-credentials";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your account settings and portal credentials.
      </p>
      <div className="mt-8">
        <PortalCredentialsManager />
      </div>
    </div>
  );
}
