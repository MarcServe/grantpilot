import assert from "node:assert/strict";
import { analyseWebsite } from "../lib/website-intelligence";
import { fetchPublicSourceHtml } from "../lib/criteria-source";
async function main(){
 let fetches=0;
 const dependencies={fetchText:async()=>{fetches++;return `Website URL: https://example.org\nPage text: Our updated services now include verified website automation and analytics for small businesses. Revision ${fetches}`;},complete:async(prompt:string)=>{assert.match(prompt,/untrusted evidence/);return prompt.includes("Revision 2")?"Updated automation and analytics services":"Original business services";}};
 const first=await analyseWebsite("https://example.org",dependencies);const next=await analyseWebsite("https://example.org",dependencies);
 assert.equal(fetches,2,"refresh never reuses stored website text");assert.match(first,/Original business/);assert.match(next,/Updated automation/);assert.match(next,/Website reviewed: \d{4}-/);assert.match(next,/supplied public page only/);
 await assert.rejects(()=>analyseWebsite("https://example.org",{...dependencies,fetchText:async()=>"Website URL: https://example.org"}),/too little readable/);
 await assert.rejects(()=>analyseWebsite("https://example.org",{...dependencies,complete:async()=>""}),/no usable information/);
 await assert.rejects(()=>fetchPublicSourceHtml("https://127.0.0.1/private"),/not public/);
 await assert.rejects(()=>fetchPublicSourceHtml("http://example.org"),/HTTPS/);
 console.log("Fresh website reads, review provenance, weak/empty extraction failures and public-source restrictions passed");
}main().catch(e=>{console.error(e);process.exitCode=1});
