import { assessCriteria, type CriterionAnswer } from "@/lib/criteria";
import { loadReviewedGrantDocuments } from "@/lib/reviewed-grant-context";
import { deriveApplicationPriority } from "@/lib/application-priority";
import type { getSupabaseAdmin } from "@/lib/supabase";
import type { PriorityExpert, PriorityOutcome } from "@/lib/application-priority";
export async function loadPriorityLearning(db:ReturnType<typeof getSupabaseAdmin>,orgId:string,profileId:string){
  const [outcomes,experts]=await Promise.all([
    db.from("ApplicationOutcome").select("applicationId,grantId,outcome,funderFeedback,responseText,learningNotes,reportedAt").eq("organisationId",orgId).eq("profileId",profileId).order("reportedAt",{ascending:false}).limit(30),
    db.from("ExpertGrantReview").select("applicationId,reviewerName,advice,reviewedAt,Application!inner(grantId,profileId)").eq("organisationId",orgId).eq("status","completed").eq("Application.profileId",profileId).order("reviewedAt",{ascending:false}).limit(10),
  ]);
  const outcomeRows=(outcomes.data??[]) as PriorityOutcome[];
  const expertRows:PriorityExpert[]=(experts.data??[]).map(row=>{const app=Array.isArray(row.Application)?row.Application[0]:row.Application;return {applicationId:row.applicationId,grantId:String(app?.grantId??""),funder:"",reviewerName:row.reviewerName??"Adviser",advice:row.advice??"",reviewedAt:row.reviewedAt};});
  const ids=[...new Set([...outcomeRows.map(r=>r.grantId),...expertRows.map(r=>r.grantId)].filter((id):id is string=>Boolean(id)))];
  const grants=ids.length?await db.from("Grant").select("id,name,funder").in("id",ids):{data:[],error:null};
  const byId=new Map((grants.data??[]).map(g=>[g.id,g]));
  return {outcomes:outcomeRows.map(row=>({...row,Grant:byId.get(row.grantId??"")??null})),experts:expertRows.map(row=>({...row,funder:byId.get(row.grantId)?.funder??""})),outcomeError:outcomes.error,learningAvailable:!outcomes.error&&!grants.error,expertAvailable:!experts.error&&!grants.error};
}

export async function loadGrantApplicationPriority(db:ReturnType<typeof getSupabaseAdmin>,orgId:string,profileId:string,profile:Record<string,unknown>,grant:{id:string;name:string;funder?:string|null},snapshot:{score:number;decision?:string|null;scoringSource?:string|null;refreshPending?:boolean;applicationId?:string}){
  const [learning,reviewed,answers]=await Promise.all([
    loadPriorityLearning(db,orgId,profileId),
    loadReviewedGrantDocuments(db,[grant.id]).catch(()=>({documents:new Map<string,import("@/lib/criteria").CriteriaDocument>(),storageReady:false})),
    db.from("grant_criteria_answers").select("criterion_id,answer").eq("organisation_id",orgId).eq("profile_id",profileId).eq("grant_id",grant.id),
  ]);
  const document=reviewed.documents.get(grant.id);
  const supplied=Object.fromEntries((answers.data??[]).map(row=>[row.criterion_id,row.answer as CriterionAnswer]));
  return deriveApplicationPriority({grant,...snapshot,document,assessment:document?assessCriteria(document,profile,supplied):undefined,outcomes:learning.outcomes,experts:learning.experts,learningAvailable:learning.learningAvailable&&!answers.error,expertAvailable:learning.expertAvailable});
}
