import { deleteSavedPack } from "@/lib/founder-pack-deletion";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normaliseContent } from "@/lib/founder-pack";
import { editablePackContentSchema } from "@/lib/founder-pack-editing";
import { revalidatePath } from "next/cache";
const schema=z.object({expectedUpdatedAt:z.string().min(1),content:editablePackContentSchema,founderName:z.string().trim().max(240),founderRole:z.string().trim().max(240)});
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,{params}:Context){
 try{
  const {orgId}=await getActiveOrg();const {id}=await params;const db=getSupabaseAdmin();
  const {data:pack,error}=await db.from("FounderFundingPack").select("id,profileId,content,inputs,updatedAt").eq("id",id).eq("organisationId",orgId).maybeSingle();
  if(error)return NextResponse.json({error:"Could not load the saved document."},{status:502});if(!pack)return NextResponse.json({error:"Document not found."},{status:404});
  const profile=await db.from("BusinessProfile").select("primaryContactName,primaryContactRole,directorNames").eq("id",pack.profileId).eq("organisationId",orgId).maybeSingle();
  if(profile.error)return NextResponse.json({error:"Could not load founder details. Please retry."},{status:502});
  const inputs=pack.inputs&&typeof pack.inputs==="object"&&!Array.isArray(pack.inputs)?pack.inputs as Record<string,unknown>:{};
  const name=String(inputs.founderName??"").trim();const role=String(inputs.founderRole??"").trim();
  return NextResponse.json({content:normaliseContent(pack.content),updatedAt:pack.updatedAt,founderName:name&&name!=="Founder"?name:profile.data?.primaryContactName||String(profile.data?.directorNames??"").split(/[,;\n]/)[0].trim(),founderRole:role&&role!=="Technical founder / CEO"?role:profile.data?.primaryContactRole||role||""},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Could not open the document for editing."},{status:500});}
}
export async function PATCH(request:Request,{params}:Context){
 try{
  const {orgId}=await getActiveOrg();const {id}=await params;const body=await request.text();if(body.length>2000000)return NextResponse.json({error:"This document is too large to save. Reduce its content and retry."},{status:413});
  const parsed=schema.safeParse(JSON.parse(body));if(!parsed.success)return NextResponse.json({error:"Some document fields are invalid or too long. Check the draft and retry."},{status:400});
  const db=getSupabaseAdmin();const current=await db.from("FounderFundingPack").select("id,inputs,updatedAt").eq("id",id).eq("organisationId",orgId).maybeSingle();
  if(current.error)return NextResponse.json({error:"Could not load the document."},{status:502});if(!current.data)return NextResponse.json({error:"Document not found."},{status:404});
  if(current.data.updatedAt!==parsed.data.expectedUpdatedAt)return NextResponse.json({error:"This document changed elsewhere. Keep a copy of your edits and reopen the latest saved version."},{status:409});
  const inputs=current.data.inputs&&typeof current.data.inputs==="object"&&!Array.isArray(current.data.inputs)?current.data.inputs as Record<string,unknown>:{};
  const saved=await db.from("FounderFundingPack").update({content:parsed.data.content,inputs:{...inputs,founderName:parsed.data.founderName,founderRole:parsed.data.founderRole},updatedAt:new Date().toISOString()}).eq("id",id).eq("organisationId",orgId).eq("updatedAt",parsed.data.expectedUpdatedAt).select("content,updatedAt").maybeSingle();
  if(saved.error)return NextResponse.json({error:"Could not save your changes. Your edits are still available; please retry."},{status:502});if(!saved.data)return NextResponse.json({error:"This document changed while saving. Keep your edits and reopen the latest version."},{status:409});
  revalidatePath("/founder-pack");revalidatePath("/data-vault");return NextResponse.json(saved.data,{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Could not save the document. Your edits have been kept; please retry."},{status:500});}
}

export async function DELETE(request:Request,{params}:Context){
 try{
  const {orgId}=await getActiveOrg();const {id}=await params;
  const result=await deleteSavedPack(getSupabaseAdmin(),orgId,id,new URL(request.url).searchParams.get("documentType"));
  if(result.status===200){revalidatePath("/founder-pack");revalidatePath("/data-vault");}
  return NextResponse.json(result.body,{status:result.status,headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Could not remove the saved document. Please retry."},{status:500});}
}
