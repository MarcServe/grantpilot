import Link from "next/link";
import { getActiveOrg } from "@/lib/auth";
import { ArrowLeft } from "lucide-react";
import { ApplyByLinkForm } from "@/components/grants/apply-by-link-form";

export default async function ApplyByLinkPage() {
  const { org } = await getActiveOrg();
  const profile = org.profiles?.[0];
  const hasProfile = !!profile;
  const profileComplete = (profile?.completionScore ?? 0) >= 50;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link
        href="/grants"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Grants
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold">Apply with your own grant link</h1>
        <p className="mt-1 text-muted-foreground">
          Have a grant application URL that&apos;s not in our catalog? Paste it here and we&apos;ll
          auto-fill it from your profile and prepare it for your review.
        </p>
      </div>

      {!hasProfile ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Create a business profile first so we can fill the form for you.
          <Link href="/profile" className="ml-1 font-medium text-foreground underline">
            Go to Profile
          </Link>
        </div>
      ) : !profileComplete ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Complete at least 50% of your profile to use auto-fill.
          <Link href="/profile" className="ml-1 font-medium text-foreground underline">
            Complete profile
          </Link>
        </div>
      ) : (
        <ApplyByLinkForm profileId={profile!.id} />
      )}
    </div>
  );
}
