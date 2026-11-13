import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin access required." }, { status: 403, headers });
  const result = await getSupabaseAdmin().from("StartUpLoanIntake").select("id,answers,updatedAt,sourceVersion").eq("shareWithAdviser", true).order("updatedAt", { ascending: false }).limit(100);
  if (result.error) return NextResponse.json({ error: "Could not load shared intakes. Apply migration 071 if this is the first setup." }, { status: 503, headers });
  return NextResponse.json({ intakes: result.data ?? [] }, { headers });
}
