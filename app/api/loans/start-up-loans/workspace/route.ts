import { NextResponse } from "next/server";
import { getActiveOrg, getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { taskPatchSchema, workspaceSchema, updateLoanTask } from "@/lib/start-up-loan-workspace";
const headers = { "Cache-Control": "no-store" };
async function context(intakeId: string | null) {
  if (!(await getCurrentUser())) return null;
  const db = getSupabaseAdmin();
  if (intakeId) {
    if (!(await isAdmin())) return null;
    return { db, admin: true, query: () => db.from("StartUpLoanIntake").select("id,workspace,updatedAt").eq("id",intakeId).eq("shareWithAdviser",true) };
  }
  const { orgId, activeProfileId, user } = await getActiveOrg();
  if (!activeProfileId || !user.id) return null;
  return { db, admin: false, query: () => db.from("StartUpLoanIntake").select("id,workspace,updatedAt").eq("organisationId",orgId).eq("profileId",activeProfileId).eq("applicantId",user.id), orgId, activeProfileId, applicantId: user.id };
}
export async function GET(req: Request) {
  const c = await context(new URL(req.url).searchParams.get("intakeId"));
  if (!c) return NextResponse.json({error:"Access unavailable."},{status:403,headers});
  const r = await c.query().maybeSingle();
  if (r.error) return NextResponse.json({error:"Workspace unavailable. Apply migration 072 after migration 071."},{status:503,headers});
  if (!r.data) return NextResponse.json({error:"Save your intake and reload this workspace first. Shared cases also require current applicant consent."},{status:404,headers});
  const parsed=workspaceSchema.safeParse(r.data.workspace ?? {});
  if(!parsed.success)return NextResponse.json({error:"Workspace could not be read. Contact support."},{status:502,headers});
  return NextResponse.json({workspace:parsed.data,updatedAt:r.data.updatedAt},{headers});
}
export async function PATCH(req: Request) {
  const p=taskPatchSchema.safeParse(await req.json().catch(()=>null));
  if(!p.success)return NextResponse.json({error:"Check task status, date and note length (maximum 2,000 characters)."},{status:400,headers});
  const c=await context(p.data.intakeId ?? null);
  if(!c)return NextResponse.json({error:"Access unavailable."},{status:403,headers});
  const row=await c.query().maybeSingle();
  if(row.error || !row.data)return NextResponse.json({error:"Saved workspace unavailable. Reload and check sharing consent."},{status:404,headers});
  if(row.data.updatedAt!==p.data.expectedUpdatedAt)return NextResponse.json({error:"This case changed. Reload the workspace before saving."},{status:409,headers});
  const current=workspaceSchema.safeParse(row.data.workspace ?? {});
  if(!current.success)return NextResponse.json({error:"Workspace could not be read."},{status:502,headers});
  const now=new Date().toISOString(); let workspace;
  try {workspace=updateLoanTask(current.data,p.data,c.admin,now);}catch(e){return NextResponse.json({error:(e as Error).message},{status:403,headers});}
  let query=c.db.from("StartUpLoanIntake").update({workspace,updatedAt:now}).eq("id",row.data.id).eq("updatedAt",p.data.expectedUpdatedAt);
  if(c.admin)query=query.eq("shareWithAdviser",true);
  else query=query.eq("organisationId",c.orgId!).eq("profileId",c.activeProfileId!).eq("applicantId",c.applicantId!);
  const saved=await query.select("updatedAt").maybeSingle();
  if(saved.error)return NextResponse.json({error:"Task could not be saved."},{status:503,headers});
  if(!saved.data)return NextResponse.json({error:"Case changed or access was withdrawn. Reload before saving."},{status:409,headers});
  return NextResponse.json({workspace,updatedAt:saved.data.updatedAt},{headers});
}
