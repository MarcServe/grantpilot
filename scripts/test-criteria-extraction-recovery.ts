import assert from "node:assert/strict";
import { extractCriteriaDocument, extractPublishedSections } from "../lib/criteria-source";
import { parseCriteriaPart, splitCriteriaText } from "../lib/criteria-extraction";
import { guardPublishedAssessment } from "../lib/reviewed-grant-context";
const source="Your project must last between 1 and 3 months. Subcontractors are not allowed. Describe the validation plan in 800 words.";
const raw={coverage:"complete",criteria:[{label:"Duration",category:"project",mandatory:true,field:"projectDurationMonths",operator:"range",expected:[1,3],excerpt:"Your project must last between 1 and 3 months."}],workload:[{label:"Validation plan",kind:"question",excerpt:"Describe the validation plan in 800 words.",wordLimit:null}],objectives:[],terms:[]};
async function main(){
 const parsed=parseCriteriaPart(JSON.stringify(raw),source); assert.equal(parsed.criteria.length,1);assert.equal(parsed.criteria[0].operator,"confirm");assert.equal(parsed.criteria[0].mandatory,true);assert.equal(parsed.workload.length,1);assert.equal(parsed.workload[0].wordLimit,undefined);
 const mixed=parseCriteriaPart(JSON.stringify({...raw,criteria:[...raw.criteria,{...raw.criteria[0],excerpt:"Invented condition"}]}),source);assert.equal(mixed.criteria.length,1);assert.ok(mixed.warnings.length);assert.equal(mixed.complete,false);
 for(const broken of ['{"criteria":[',"not json",'null']){const result=parseCriteriaPart(broken,source);assert.equal(result.criteria.length,0);assert.ok(result.warnings.length);}
 const long=(source+" ").repeat(400); const chunks=splitCriteriaText(long); assert.equal(chunks.join(""),long);assert.ok(chunks.length>1);assert.ok(chunks.every(chunk=>chunk.length<=12000));
 let concurrent=0,peak=0,calls=0;
 const document=await extractCriteriaDocument("https://example.org/grant","Test",{fetchSource:async()=>({url:"https://example.org/grant",text:long,unreviewedLinks:[],sections:[{heading:"Eligibility",text:source}]}),complete:async()=>{const call=++calls;peak=Math.max(peak,++concurrent);await new Promise(resolve=>setTimeout(resolve,1));concurrent--;return call===1?'{"criteria":[':JSON.stringify(raw);}});
 assert.equal(calls,chunks.length);assert.ok(peak<=3);assert.ok(document.criteria.length>0);assert.equal(document.coverage,"partial");assert.equal(document.sourceText,long);assert.equal(document.sourceSections?.[0].heading,"Eligibility");
 const failed=await extractCriteriaDocument("https://example.org/grant","Test",{fetchSource:async()=>({url:"https://example.org/grant",text:source,unreviewedLinks:[]}),complete:async()=>{throw new Error("Provider unavailable")}});
 assert.equal(failed.organisationStatus,"source_only");assert.equal(failed.coverage,"partial");assert.equal(failed.sourceText,source);assert.equal(failed.criteria.length,0);
 assert.equal(guardPublishedAssessment({score:85,confidence:85,decision:"likely_eligible",reason:"Sector match"},failed,{}).score,69);
 const sections=extractPublishedSections('<section id="eligibility"><h2>Your project</h2><ul><li>Last 1–3 months</li><li>No subcontractors</li></ul></section><section id="scope"><p>Novel technology required.</p></section>');assert.equal(sections.length,2);assert.match(sections[0].text,/months\nNo subcontractors/);assert.equal(sections[1].heading,"Scope");
 console.log("Section batching, malformed/null fields, valid sibling retention, unverified quotes, source-only recovery, readable sections and conservative score checks passed");
}main().catch(error=>{console.error(error);process.exitCode=1});
