import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import { LoanAdviserIntakes } from "@/components/loans/loan-adviser-intakes";
export default async function Page(){if(!(await isAdmin()))redirect('/dashboard');return <main className="mx-auto max-w-5xl space-y-5 p-6"><Link href="/admin" className="text-primary underline">← Admin</Link><h1 className="text-2xl font-bold">Shared Start Up Loan intake cases</h1><p>Latest 100 consented applicant cases. This is an administrator-managed view for preparing adviser reviews, not a dedicated expert login.</p><LoanAdviserIntakes/></main>;}
