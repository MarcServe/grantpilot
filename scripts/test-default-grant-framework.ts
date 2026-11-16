import assert from "node:assert/strict";
import { defaultGrantFrameworkContext, DEFAULT_GRANT_FRAMEWORK } from "../lib/default-grant-framework";
import { appendPublishedRequirements, publishedRequirementsText } from "../lib/reviewed-grant-context";
import type { CriteriaDocument } from "../lib/criteria";
const marker="GRANTSCOPILOT DEFAULT PREPARATION FRAMEWORK";
const base={sourceVersion:"v1",sourceUrl:"https://funder.example/competition",extractedAt:"2026-11-16",coverage:"partial",criteria:[],workload:[],objectives:[],terms:[]} as unknown as CriteriaDocument;
assert.equal(DEFAULT_GRANT_FRAMEWORK.length,7);
assert.ok(defaultGrantFrameworkContext().includes("not official Innovate UK"));
assert.ok(appendPublishedRequirements("existing",new Map()).includes(marker));
assert.equal(appendPublishedRequirements("loan intake",new Map(),false).includes(marker),false);
assert.ok(publishedRequirementsText(base).includes(marker));
for(const status of ["not_found","incomplete","guidance_found"] as const){assert.ok(publishedRequirementsText({...base,assessorFramework:{checkedAt:"today",status,searchPerformed:true,sources:[],criteria:[],warnings:[]}}).includes(marker));}
const framework={checkedAt:"today",status:"guidance_found" as const,searchPerformed:false,sources:[],criteria:[{question:"Impact",expectation:"Explain impact",excerpt:"Explain impact",sourceUrl:base.sourceUrl}],warnings:[]};
const doc={...base,assessorFramework:framework};const before=JSON.stringify(doc);
assert.equal(publishedRequirementsText(doc).includes(marker),false);
assert.ok(publishedRequirementsText(doc).includes("Explain impact"));
assert.equal(JSON.stringify(doc),before);
console.log("Fallback covers missing/failed/older rubric reviews, verified criteria take precedence, and source/eligibility objects remain unchanged.");
