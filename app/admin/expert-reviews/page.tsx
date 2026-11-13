import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import { ExpertReviewQueue } from "@/components/admin/expert-review-queue";
export default async function ExpertReviewsPage() {
  if (!(await isAdmin())) redirect("/dashboard");
  return <main className="mx-auto max-w-5xl space-y-5 p-6"><Link href="/admin" className="text-primary underline">← Admin</Link><h1 className="text-2xl font-bold">Expert grant advisory queue</h1><p>Up to 100 requests, awaiting reviews first. Assign an available expert only after checking their relevant grant experience and track-record references. Record their advice here once received. This queue does not send messages or provide an expert login.</p><ExpertReviewQueue /></main>;
}
