import { Suspense } from "react";
import { ApproveForm } from "@/components/approve/approve-form";
import { verifyApproveToken } from "@/lib/approve-token";
import { getSupabaseAdmin } from "@/lib/supabase";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ApprovePage({
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
            This approval link is missing or invalid. Please use the link from your email or WhatsApp.
          </p>
          <Link href="/sign-in" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
            Sign in to GrantPilot
          </Link>
        </div>
      </div>
    );
  }

  const applicationId = verifyApproveToken(token);
  if (!applicationId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">Link expired or invalid</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This approval link has expired or is invalid. Please request a new link or sign in to approve.
          </p>
          <Link href="/sign-in" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
            Sign in to GrantPilot
          </Link>
        </div>
      </div>
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: app } = await supabase
    .from("Application")
    .select("id, status, Grant(name)")
    .eq("id", applicationId)
    .single();

  const grantObj = (app as { Grant?: { name: string } | { name: string }[] })?.Grant;
  const grantName = (Array.isArray(grantObj) ? grantObj[0]?.name : grantObj?.name) ?? "your grant";
  const status = (app as { status?: string })?.status;
  const canApprove = status === "REVIEW_REQUIRED" || status === "FILLING";

  if (!app || !canApprove) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">Nothing to approve</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This application has already been approved or submitted, or the link is no longer valid.
          </p>
          <Link href="/sign-in" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
            Sign in to GrantPilot
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">Approve application</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Approve the application for <strong>{grantName}</strong>? You can still review and submit from the full app.
        </p>
        <Suspense fallback={<p className="mt-4 text-sm text-muted-foreground">Loading…</p>}>
          <ApproveForm applicationId={applicationId} token={token} grantName={grantName} />
        </Suspense>
        <Link
          href={`/applications/${applicationId}`}
          className="mt-4 block text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Review full application instead
        </Link>
      </div>
    </div>
  );
}
