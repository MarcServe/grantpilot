import Link from "next/link";
import { getActiveOrg } from "@/lib/auth";
import { ArrowLeft } from "lucide-react";
import { ApplyByLinkForm } from "@/components/grants/apply-by-link-form";

export default async function ApplyByLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; name?: string; funder?: string; fixGrantId?: string }>;
}) {
  const { org } = await getActiveOrg();
  const sp = await searchParams;
  const profile = org.profiles?.[0];
  const hasProfile = !!profile;
  const completionScore = (profile as { completionScore?: number; completion_score?: number } | undefined)?.completionScore
    ?? (profile as { completion_score?: number } | undefined)?.completion_score
    ?? 0;
  const profileComplete = completionScore >= 30;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link
        href="/grants"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Grant Library
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold">Prepare from your own grant link</h1>
        <p className="mt-1 text-muted-foreground">
          {sp.name
            ? <>Paste a working application URL for <strong>{sp.name}</strong> so you can verify the link and prepare the application pack.</>
            : <>Have a grant application URL that&apos;s not in our catalog? Paste it here to verify it, capture notes, and prepare your application materials.</>
          }
        </p>
      </div>

      {!hasProfile ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Create a business profile first so we can verify the link and prepare your application materials.
          <Link href="/profile" className="ml-1 font-medium text-foreground underline">
            Go to Profile
          </Link>
        </div>
      ) : !profileComplete ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Complete at least 30% of your profile to use application prep.
          <Link href="/profile" className="ml-1 font-medium text-foreground underline">
            Complete profile
          </Link>
        </div>
      ) : (
        <ApplyByLinkForm
          profileId={profile!.id}
          prefillUrl={sp.url}
          prefillGrantName={sp.name}
          prefillFunder={sp.funder}
          fixGrantId={sp.fixGrantId}
        />
      )}
    </div>
  );
}
