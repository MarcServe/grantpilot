import assert from "node:assert/strict";
import { allowedAssessorUrl, assessorLinks, discoverAssessorFramework } from "../lib/assessor-framework";
import { publishedRequirementsText } from "../lib/reviewed-grant-context";
import type { CriteriaDocument } from "../lib/criteria";
async function main(){
const base="https://apply-for-innovation-funding.service.gov.uk/competition/2584/overview/abc";
assert.equal(allowedAssessorUrl("https://apply-for-innovation-funding.service.gov.uk/competition/123/download/1",base),false);
assert.equal(allowedAssessorUrl("https://ukri.org.attacker.example/guide",base),false);
assert.equal(allowedAssessorUrl("https://user:pass@www.ukri.org/guide",base),false);
const pdf="https://apply-for-innovation-funding.service.gov.uk/competition/2584/download/7";
const html='<a href="/competition/2584/download/7">Assessor guidance.pdf</a><a href="https://thirdparty.example/rubric">Assessor guidance</a>';
assert.deepEqual(assessorLinks(html,base),[pdf]);
const quote="Assessors will consider the strength of your technical validation evidence.";
const calls:string[]=[];
const deps={fetchPage:async(url:string)=>{calls.push(url);return url===base?{url,html}:{url,html:"",pdfText:`${quote} ${"Published scoring guidance. ".repeat(8)}`};},search:async()=>{throw Error("Should not search when a direct link exists");},complete:async()=>JSON.stringify({criteria:[{question:"Technical feasibility",expectation:"Provide validation evidence",excerpt:quote},{question:"Invented",expectation:"Score 10",excerpt:"A fabricated quote"}]})};
const found=await discoverAssessorFramework(base,"Test competition",deps);
assert.equal(found.status,"guidance_found");assert.equal(found.criteria.length,1);assert.equal(found.criteria[0].sourceUrl,pdf);assert.equal(found.sources[0].applicability,"competition_linked");assert.equal(found.searchPerformed,false);assert.ok(found.sources[0].version);assert.ok(found.warnings.some(w=>w.includes("excluded")));
const searchOnly=await discoverAssessorFramework(base,"Test",{...deps,fetchPage:async(url:string)=>url===base?{url,html:"<p>Application information without a rubric</p>"}:{url,html:"",pdfText:quote.repeat(3)},search:async()=>["https://www.ukri.org/general-guidance"]});
assert.equal(searchOnly.searchPerformed,true);assert.equal(searchOnly.sources[0].applicability,"needs_confirmation");assert.equal(searchOnly.criteria.length,0);
const failed=await discoverAssessorFramework(base,"Test",{...deps,fetchPage:async(url:string)=>({url,html:"No guidance"}),search:async()=>{throw Error("Unavailable");}});
assert.equal(failed.status,"incomplete");assert.equal(failed.searchPerformed,false);
const notFound=await discoverAssessorFramework(base,"Test",{...deps,fetchPage:async(url:string)=>({url,html:"No guidance"}),search:async()=>[]});assert.equal(notFound.status,"not_found");
const doc={sourceVersion:"v1",sourceUrl:base,extractedAt:"2026-11-16",coverage:"partial",criteria:[],workload:[],objectives:[],terms:[],assessorFramework:found} as unknown as CriteriaDocument;
const before=JSON.stringify(doc);assert.ok(publishedRequirementsText(doc).includes(quote));assert.ok(publishedRequirementsText(doc).includes("not eligibility"));assert.equal(JSON.stringify(doc),before);
console.log("Official-domain/competition boundaries, linked PDF discovery, source quotes, uncertain search applicability, lookup failures and separate drafting context passed.");

}
main().catch(e=>{console.error(e);process.exitCode=1;});
