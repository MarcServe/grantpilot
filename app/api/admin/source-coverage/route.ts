import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sourceCoverage, type CoverageSource } from "@/lib/source-coverage";
export async function GET(){
  const headers={"Cache-Control":"no-store"};
  let admin=false;
  try{admin=await isAdmin();}catch{return NextResponse.json({error:"Authentication service unavailable. Retry the coverage audit later."},{status:503,headers});}
  if(!admin)return NextResponse.json({error:"Admin access required."},{status:403,headers});
  const db=getSupabaseAdmin({timeoutMs:8000});const rows:CoverageSource[]=[];let total=0;
  for(let page=0;page<10;page++){
    const r=await db.from("grant_sources").select("id,endpoint,enabled,country,type,crawl_frequency,last_crawled_at,last_crawl_status,last_crawl_result",page===0?{count:"exact"}:{}).order("id",{ascending:true}).range(page*500,page*500+499);
    if(r.error)return NextResponse.json({error:"Coverage audit unavailable. Source outcome columns must be readable; check migration 059 and retry. No live coverage claim has been verified."},{status:503,headers});
    if(page===0)total=r.count??0;rows.push(...(r.data??[]));if((r.data?.length??0)<500)break;
  }
  return NextResponse.json({checkedAt:new Date().toISOString(),totalRows:total,partial:rows.length<total,summary:sourceCoverage(rows)},{headers});
}
