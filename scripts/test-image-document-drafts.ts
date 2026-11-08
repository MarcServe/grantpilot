import assert from "node:assert/strict";
import { extractedRequirementsSchema, requirementImageRequestSchema, requirementsToQuestionText, IMAGE_EXTRACTION_PROMPT } from "../lib/image-requirements";
import { parseQuestionBlocks, questionAssistantRequestSchema } from "../lib/validations/question-assistant";
import { generateFounderPackQuestionAnswers, normaliseContent } from "../lib/founder-pack";
import { generateFounderPackExport, buildFounderPackTextSections } from "../lib/founder-pack-export";
import { savedPackDocumentTypes } from "../lib/founder-pack-vault";
async function main() {
  assert.equal(requirementImageRequestSchema.safeParse({images:["https://example.org/a.png"]}).success,false, "remote URLs cannot make server fetch arbitrary sources");
  assert.equal(requirementImageRequestSchema.safeParse({images:["data:image/svg+xml;base64,PHN2Zz4="]}).success,false);
  assert.equal(requirementImageRequestSchema.safeParse({images:Array(4).fill("data:image/png;base64,YQ==")}).success,false);
  const extracted = extractedRequirementsSchema.parse({items:[{title:"Question 9",kind:"question",requirements:"Describe the novel architecture. Include named benchmarks.",wordLimit:800},{title:"Technical appendix",kind:"document",requirements:"Optional, maximum 2 pages, PDF under 10 MB. Include a validation matrix."}],background:"Funding scheme background",warnings:["Bottom of the page is cropped"]});
  const blocks = parseQuestionBlocks(requirementsToQuestionText(extracted.items),"paragraphs");
  assert.equal(blocks.length,2); assert.match(blocks[0],/Word limit: 800/); assert.match(blocks[1],/Optional, maximum 2 pages/); assert.ok(!blocks.join().includes("Funding scheme background"));
  assert.match(IMAGE_EXTRACTION_PROMPT,/not automatically documents/);
  assert.equal(questionAssistantRequestSchema.safeParse({profileId:"p1",outputMode:"document_draft",questions:[{question:blocks[1]}]}).success,true);
  const answers = await generateFounderPackQuestionAnswers({businessName:"Test"},{outputMode:"document_draft",questions:[{questionId:"q1",question:blocks[1]}]},undefined,async(prompt,tokens)=>{
    assert.match(prompt,/comprehensive editable document/);assert.match(prompt,/Never invent experiments/);assert.match(prompt,/exported layout and file size require checking/);assert.ok((tokens??0)>5000);
    return JSON.stringify({answers:[{questionId:"q1",question:blocks[1],draftAnswer:"Validation matrix\nBaseline: [TO CONFIRM]\nSuccess criteria: [TO CONFIRM]",confidence:"low",evidenceStrength:"weak",missingEvidence:["Measured results"],warnings:["Check final page count"],rationale:"",suggestedProfileUpdates:[]}]});
  });
  const content=normaliseContent({grantApplicationDraft:answers.answers.map(a=>({question:a.question,answer:a.draftAnswer})),evidenceChecklist:["Measured results"],nextSteps:["Check final page count"]});
  const pack={id:"draft",inputs:{documentTypes:["grant_application_draft" as const,"evidence_checklist" as const,"next_steps" as const],customDocumentTitle:"Frontier AI validation plan"},content};
  assert.equal(buildFounderPackTextSections(pack)[0].title,"Frontier AI validation plan");
  assert.equal(savedPackDocumentTypes(pack.inputs)[0].label,"Frontier AI validation plan");
  assert.match(generateFounderPackExport(pack,"md").toString(),/Measured results/);
  assert.equal(generateFounderPackExport(pack,"pdf").subarray(0,4).toString(),"%PDF");
  assert.equal(generateFounderPackExport(pack,"docx").subarray(0,2).toString(),"PK");
  console.log("Image input validation, reviewed extraction boundaries, document mode, evidence retention, custom names and PDF/Word exports passed");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
