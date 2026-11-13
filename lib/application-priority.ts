import type { CriteriaAssessment, CriteriaDocument } from "@/lib/criteria";
import { readRejectionReview, REJECTION_REASONS } from "@/lib/rejection-review";
export const APPLICATION_PRIORITY_VERSION = 1;
export type PriorityCategory = "prioritise_now" | "prepare_first" | "seek_clarification";
export const PRIORITY_LABELS: Record<PriorityCategory,string> = { prioritise_now:"Prioritise now", prepare_first:"Prepare first", seek_clarification:"Seek clarification" };
export interface PriorityOutcome {
  applicationId?:string; grantId?:string; outcome?:string; funderFeedback?:string|null; responseText?:string|null; learningNotes?:string|null; reportedAt?:string|null;
  Grant?:{name?:string;funder?:string}|{name?:string;funder?:string}[]|null;
}
export interface PriorityExpert { applicationId:string;grantId:string;funder:string;reviewerName:string;advice:string;reviewedAt:string|null; }
export interface PriorityEvidence { label:string;provenance:string;relevance:string;excerpt:string;href:string;date?:string|null; }
export interface ApplicationPriority {
  version:number;category:PriorityCategory;label:string;reasons:string[];actions:{label:string;href:string}[];
  evidence:PriorityEvidence[];evidenceLevel:"limited"|"requirements_only"|"requirements_and_history";
  relevantPositiveOutcomes:number;learningCoverage:string;sourceUrl:string|null;
}
const TOPICS = {
  evidence:/\b(validation|validated|benchmark|prototype|clinical trial|technical feasibility|proof.of.concept|experimental results)\b/i,
  finances:/\b(co.?funding|match funding|cash.flow|budget|funding rate|eligible costs|value for money)\b/i,
  innovation:/\b(novel(?:ty)?|intellectual property|defensib\w*|state.of.the.art|core algorithm)\b/i,
  delivery:/\b(milestone|delivery plan|risk management|team expertise|project management)\b/i,
} as const;
type Topic=keyof typeof TOPICS;
const norm=(value:string)=>value.trim().toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const feedbackLink=(id?:string)=>id?`/applications/${encodeURIComponent(id)}#outcome-learning`:"/applications/outcomes";
const grantOf=(row:PriorityOutcome)=>Array.isArray(row.Grant)?row.Grant[0]:row.Grant;
const requirementText=(c:{label:string;excerpt:string;question?:string})=>[c.label,c.excerpt,c.question].filter(Boolean).join(" ");
export function deriveApplicationPriority(input:{
  grant:{id:string;name:string;funder?:string|null};score:number;decision?:string|null;scoringSource?:string|null;
  document?:CriteriaDocument;assessment?:CriteriaAssessment;refreshPending?:boolean;applicationId?:string;
  outcomes:PriorityOutcome[];experts?:PriorityExpert[];learningAvailable?:boolean;expertAvailable?:boolean;
}):ApplicationPriority {
  const {grant,document,assessment}=input;
  const href=`/grants/${encodeURIComponent(grant.id)}#published-requirements`;
  const published=document?[...document.criteria.map(requirementText),...document.workload.map(requirementText)].join("\n"):"";
  const topics=(Object.keys(TOPICS) as Topic[]).filter(t=>TOPICS[t].test(published));
  const relevant:{row:PriorityOutcome;topic?:Topic;provenance:string;relevance:string}[]=[];
  for(const row of input.outcomes.slice(0,30)){
    if(!["rejected","awarded","shortlisted"].includes(row.outcome??""))continue;
    const original=grantOf(row);const review=readRejectionReview(row.learningNotes);
    const exact=row.grantId===grant.id;
    const sameFunder=Boolean(norm(grant.funder??"")&&norm(original?.funder??"")===norm(grant.funder??""));
    const structured=review.reason in TOPICS?review.reason as Topic:undefined;
    const feedback=[row.funderFeedback,row.responseText].filter(Boolean).join(" ");
    const inferred=review.reason==="unknown"?(Object.keys(TOPICS) as Topic[]).find(t=>TOPICS[t].test(feedback)):undefined;
    const topic=structured??inferred;
    const themeMatch=row.outcome==="rejected"&&topic&&topics.includes(topic);
    if(!exact&&!sameFunder&&!themeMatch)continue;
    relevant.push({row,topic:themeMatch?topic:undefined,
      provenance:row.outcome!=="rejected"?"Applicant-recorded outcome; not independently verified":review.source==="funder"?"Applicant reports this reason came from the funder":review.source==="applicant"?"Applicant interpretation; not confirmed by the funder":"Possible theme in supplied feedback; interpretation needs checking",
      relevance:exact?"Same grant":sameFunder?"Same named funder":"Related published requirement theme"});
  }
  // Keep a source for the positive-history tie-break visible even when newer rejections fill the list.
  const firstPositive = relevant.find(item => ["awarded","shortlisted"].includes(item.row.outcome??""));
  const displayed = [...new Set([...(firstPositive ? [firstPositive] : []), ...relevant])].slice(0,4);
  const evidence:PriorityEvidence[]=displayed.map(({row,provenance,relevance})=>{
    const review=readRejectionReview(row.learningNotes);const original=grantOf(row);
    return {label:`${original?.name??"Previous application"}: ${row.outcome}`,provenance,relevance,excerpt:(row.funderFeedback||row.responseText||(review.reason!=="unknown"?REJECTION_REASONS[review.reason]:"No reviewer wording supplied.")).slice(0,240),href:feedbackLink(row.applicationId),date:row.reportedAt};
  });
  for(const expert of (input.experts??[]).slice(0,10)){
    const exact=expert.grantId===grant.id;
    const sameFunder=Boolean(norm(grant.funder??"")&&norm(expert.funder)===norm(grant.funder??""));
    if(!exact&&!sameFunder)continue;
    evidence.push({label:`Expert report: ${expert.reviewerName}`,provenance:"Human advice recorded by administrator; track record attested by administrator",relevance:exact?"Same grant":"Same funder; applicability to this grant needs review",excerpt:expert.advice.slice(0,240),href:feedbackLink(expert.applicationId),date:expert.reviewedAt});
    if(evidence.length>=6)break;
  }
  const mandatory=assessment?.criteria.filter(c=>c.mandatory&&c.status!=="not_applicable")??[];
  const failed=mandatory.filter(c=>c.status==="not_met");const unknown=mandatory.filter(c=>c.status==="needs_information");
  let category:PriorityCategory="seek_clarification";const reasons:string[]=[];const actions:{label:string;href:string}[]=[];
  if(input.applicationId){reasons.push("An application already exists for this business and grant. Review its status and any resubmission rules before starting again.");actions.push({label:"Review existing application",href:feedbackLink(input.applicationId)});}
  else if(input.refreshPending){reasons.push("Your profile changed after scoring. Reassess this grant before choosing application effort.");actions.push({label:"Review and reassess eligibility",href:`/grants/${encodeURIComponent(grant.id)}`});}
  else if(!document||document.coverage!=="complete"||document.organisationStatus==="source_only"||!document.criteria.length||!assessment){reasons.push("Published requirements have not been captured and checked completely. The fit score alone cannot establish application readiness.");actions.push({label:"Review published requirements",href});}
  else if(failed.length){reasons.push(`A published mandatory condition is currently marked not met: ${failed.slice(0,2).map(c=>c.label).join("; ")}. Clarify this before investing in an application.`);actions.push({label:"Check mandatory conditions",href});}
  else if(!["openai","intelligence"].includes(input.scoringSource??"")||input.score<50||input.decision==="unlikely"){reasons.push("The current eligibility assessment does not support prioritising an application. Confirm fit and scope first.");actions.push({label:"Check grant fit",href:`/grants/${encodeURIComponent(grant.id)}`});}
  else if(unknown.length){category="prepare_first";reasons.push(`Resolve ${unknown.length} mandatory information or evidence gap${unknown.length===1?"":"s"}: ${unknown.slice(0,2).map(c=>c.label).join("; ")}.`);actions.push({label:"Complete required evidence checks",href});}
  else if(!assessment.strongEligible||input.score<85||input.decision==="review"){reasons.push("The current assessment still requires review. Confirm project scope before prioritising application work.");actions.push({label:"Clarify project fit",href});}
  else{category="prioritise_now";reasons.push("A trusted strong-fit assessment, complete published coverage and no missing or failed mandatory checks support preparation priority. This does not predict an award.");actions.push({label:"Prepare this application",href:`/grant-assistant?grantId=${encodeURIComponent(grant.id)}`});}
  for(const item of relevant){
    if(item.row.outcome!=="rejected"||!item.topic)continue;
    const matching=mandatory.filter(c=>TOPICS[item.topic!].test(requirementText(c)));
    if(!matching.length)continue;
    if(matching.some(c=>c.status==="needs_information"))reasons.push(`Previous feedback concerns a requirement theme this grant also uses (${REJECTION_REASONS[item.topic]}). Review the source feedback while filling the current gap; rejection itself does not establish a new failure.`);
    else if(matching.every(c=>c.status==="met"))reasons.push("A previous feedback theme overlaps, but the corresponding current checks are marked met. No rejection penalty is applied; confirm supporting evidence remains current.");
    break;
  }
  if(relevant.some(i=>i.row.outcome==="rejected"&&i.topic==="evidence")&&/\b(feasibility stud(?:y|ies)|technical feasibility|proof.of.concept)\b/i.test(published))reasons.push("This opportunity describes feasibility or validation work that may address an earlier evidence concern. Confirm whether it funds creating that evidence or requires it at entry; stage fit is not assumed.");
  const positives=relevant.filter(i=>["awarded","shortlisted"].includes(i.row.outcome??"")).length;
  if(positives)reasons.push(`${positives} applicant-recorded positive outcome${positives===1?"":"s"} relate to this grant or named funder. Reuse relevant strengths, while recognising a previous result does not predict this competition.`);
  if(evidence.length)actions.push({label:"Review relevant feedback",href:evidence[0].href});
  const unavailable=input.learningAvailable===false||input.expertAvailable===false;
  const learningCoverage=unavailable?"Some feedback or expert records could not be loaded; advice uses available evidence only.":evidence.length?`Considered ${Math.min(input.outcomes.length,30)} recently recorded business outcome${input.outcomes.length===1?"":"s"} and up to 10 completed expert reports; at most 6 references are shown. Checklist ticks do not verify evidence.`:"No relevant outcome or expert record was found in recent business history. Advice is based on current requirements and readiness.";
  return {version:APPLICATION_PRIORITY_VERSION,category,label:PRIORITY_LABELS[category],reasons:reasons.slice(0,5),actions:actions.slice(0,2),evidence:evidence.slice(0,6),evidenceLevel:!document||document.coverage!=="complete"||unavailable?"limited":evidence.length?"requirements_and_history":"requirements_only",relevantPositiveOutcomes:positives,learningCoverage,sourceUrl:document?.sourceUrl??null};
}
export function compareApplicationPriority(a:{applicationPriority?:ApplicationPriority},b:{applicationPriority?:ApplicationPriority}){
  const rank:Record<PriorityCategory,number>={prioritise_now:0,prepare_first:1,seek_clarification:2};
  const order=(a.applicationPriority?rank[a.applicationPriority.category]:3)-(b.applicationPriority?rank[b.applicationPriority.category]:3);
  if(order)return order;
  // Explicit same-grant/funder history tie-break, never an eligibility adjustment.
  return (b.applicationPriority?.relevantPositiveOutcomes??0)-(a.applicationPriority?.relevantPositiveOutcomes??0);
}
