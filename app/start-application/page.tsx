import Link from "next/link";
import { verifyStartApplicationToken } from "@/lib/start-application-token";
import { getSupabaseAdmin } from "@/lib/supabase";
import { StartApplicationForm } from "@/components/start-application/start-application-form";

export const dynamic = "force-dynamic";

export default async function StartApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token?.trim()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">Invalid link</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link is missing or invalid. Please use the link from your email or WhatsApp.
          </p>
          <Link href="/sign-in" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
            Sign in to Grants-Copilot
          </Link>
        </div>
      </div>
    );
  }

  const payload = verifyStartApplicationToken(token);
  if (!payload) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">Link expired or invalid</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link has expired or is invalid. Please request a new link or sign in to start an application.
          </p>
          <Link href="/sign-in" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
            Sign in to Grants-Copilot
          </Link>
        </div>
      </div>
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: grant } = await supabase
    .from("Grant")
    .select("id, name")
    .eq("id", payload.grantId)
    .single();

  if (!grant) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">Grant not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This grant may no longer be available.
          </p>
          <Link href="/sign-in" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
            Sign in to Grants-Copilot
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">Start application</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Start your application for <strong>{grant.name}</strong>? Our AI will help fill it in using your business profile.
        </p>
        <StartApplicationForm token={token} grantName={grant.name} />
        <Link
          href="/sign-in"
          className="mt-4 block text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Sign in to Grants-Copilot
        </Link>
      </div>
    </div>
  );
}
