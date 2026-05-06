import { FOUNDER_PACK_DOCUMENT_TYPES, type FounderPackContent, type FounderPackDocumentType } from "@/lib/founder-pack";

type PackExportFormat = "md" | "pdf" | "docx" | "pptx" | "json";

export interface FounderPackExportInput {
  id: string;
  createdAt?: string;
  type?: string;
  inputs?: {
    founderName?: string;
    founderRole?: string;
    documentTypes?: FounderPackDocumentType[];
  } | null;
  content: FounderPackContent;
  profile?: {
    businessName?: string | null;
    sector?: string | null;
  } | null;
}

interface TextSection {
  title: string;
  lines: string[];
}

const MIME_TYPES: Record<PackExportFormat, string> = {
  md: "text/markdown; charset=utf-8",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  json: "application/json; charset=utf-8",
};

export function founderPackExportMime(format: PackExportFormat): string {
  return MIME_TYPES[format];
}

export function founderPackExportFilename(pack: FounderPackExportInput, format: PackExportFormat): string {
  const business = pack.profile?.businessName || "founder-pack";
  const safe = business.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "founder-pack";
  const types = selectedTypes(pack);
  const typeSlug =
    types.length === 1
      ? types[0].replace(/_/g, "-")
      : types.length === FOUNDER_PACK_DOCUMENT_TYPES.length
        ? "full-pack"
        : "selected-documents";
  const extension = format === "json" ? "json" : format;
  return `${safe}-${typeSlug}.${extension}`;
}

export function isFounderPackExportFormat(value: string | null): value is PackExportFormat {
  return value === "md" || value === "pdf" || value === "docx" || value === "pptx" || value === "json";
}

function selectedTypes(pack: FounderPackExportInput): FounderPackDocumentType[] {
  return pack.inputs?.documentTypes?.length
    ? pack.inputs.documentTypes
    : FOUNDER_PACK_DOCUMENT_TYPES.map((item) => item.value);
}

function includes(pack: FounderPackExportInput, type: FounderPackDocumentType): boolean {
  return selectedTypes(pack).includes(type);
}

function splitParagraphs(text: string): string[] {
  return String(text || "")
    .split(/\n{2,}|\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function listLines(items: string[], prefix = "- "): string[] {
  return items.filter(Boolean).map((item) => `${prefix}${item}`);
}

export function buildFounderPackTextSections(pack: FounderPackExportInput): TextSection[] {
  const content = pack.content;
  const sections: TextSection[] = [];
  const addText = (type: FounderPackDocumentType, title: string, value?: string) => {
    if (includes(pack, type) && value) sections.push({ title, lines: splitParagraphs(value) });
  };

  addText("executive_summary", "Executive Summary", content.executiveSummary);
  addText("business_plan", "Business Plan", content.businessPlan);

  if (includes(pack, "pitch_deck") && content.pitchDeck?.length) {
    sections.push({
      title: "Canvas Standard Pitch Deck",
      lines: content.pitchDeck.flatMap((slide, index) => [
        `Slide ${index + 1}: ${slide.title}`,
        slide.objective ? `Objective: ${slide.objective}` : "",
        ...listLines(slide.bullets),
        slide.speakerNotes ? `Speaker notes: ${slide.speakerNotes}` : "",
        slide.visualDirection ? `Design direction: ${slide.visualDirection}` : "",
        "",
      ]).filter(Boolean),
    });
  }

  if (includes(pack, "business_model_canvas") && content.businessModelCanvas?.valuePropositions?.length) {
    const canvas = content.businessModelCanvas;
    sections.push({
      title: "Business Model Canvas",
      lines: [
        "Key Partners",
        ...listLines(canvas.keyPartners),
        "Key Activities",
        ...listLines(canvas.keyActivities),
        "Key Resources",
        ...listLines(canvas.keyResources),
        "Value Propositions",
        ...listLines(canvas.valuePropositions),
        "Customer Relationships",
        ...listLines(canvas.customerRelationships),
        "Channels",
        ...listLines(canvas.channels),
        "Customer Segments",
        ...listLines(canvas.customerSegments),
        "Cost Structure",
        ...listLines(canvas.costStructure),
        "Revenue Streams",
        ...listLines(canvas.revenueStreams),
      ],
    });
  }

  addText("innovation_statement", "Innovation Statement", content.innovationStatement);
  addText("market_analysis", "Market Analysis", content.marketAnalysis);

  if (includes(pack, "financial_projections")) {
    const projections = content.financialProjections;
    const lines = [
      "Assumptions",
      ...listLines(projections.assumptions),
      "Year 1",
      ...listLines(projections.year1),
      "Year 2",
      ...listLines(projections.year2),
      "Year 3",
      ...listLines(projections.year3),
    ].filter(Boolean);
    if (lines.length > 4) sections.push({ title: "Financial Projections", lines });
  }

  if (includes(pack, "grant_application_draft") && content.grantApplicationDraft?.length) {
    sections.push({
      title: "Grant Application Draft",
      lines: content.grantApplicationDraft.flatMap((item) => [item.question, item.answer, ""]).filter(Boolean),
    });
  }

  addText("budget_narrative", "Budget Narrative", content.budgetNarrative);
  addText("impact_measurement_plan", "Impact Measurement Plan", content.impactMeasurementPlan);

  if (includes(pack, "project_workplan") && content.projectWorkplan?.length) {
    sections.push({
      title: "Project Workplan",
      lines: content.projectWorkplan.flatMap((phase) => [
        `${phase.phase}${phase.timeline ? ` (${phase.timeline})` : ""}`,
        "Activities",
        ...listLines(phase.activities),
        "Outputs",
        ...listLines(phase.outputs),
        "",
      ]).filter(Boolean),
    });
  }

  addText("support_letter_template", "Support Letter Template", content.supportLetterTemplate);
  addText("founder_positioning", "Founder Positioning", content.founderPositioning);
  addText("scalability_plan", "Scalability Plan", content.scalabilityPlan);

  if (includes(pack, "risk_mitigation") && content.riskMitigation?.length) {
    sections.push({
      title: "Risks & Mitigation",
      lines: content.riskMitigation.map((item) => `${item.risk}: ${item.mitigation}`),
    });
  }

  if (includes(pack, "evidence_checklist") && content.evidenceChecklist?.length) {
    sections.push({ title: "Evidence Checklist", lines: listLines(content.evidenceChecklist) });
  }
  if (includes(pack, "next_steps") && content.nextSteps?.length) {
    sections.push({ title: "Next Steps", lines: listLines(content.nextSteps) });
  }
  if (content.disclaimer) sections.push({ title: "Disclaimer", lines: [content.disclaimer] });

  return sections;
}

function packTitle(pack: FounderPackExportInput): string {
  const business = pack.profile?.businessName || "Founder Funding Pack";
  const types = selectedTypes(pack);
  const typeLabel =
    types.length === 1
      ? FOUNDER_PACK_DOCUMENT_TYPES.find((item) => item.value === types[0])?.label
      : types.length === FOUNDER_PACK_DOCUMENT_TYPES.length
        ? "Founder Funding Pack"
        : "Selected Funding Documents";
  return `${business} ${typeLabel ?? "Founder Funding Pack"}`;
}

export function generateFounderPackMarkdown(pack: FounderPackExportInput): Buffer {
  const lines = [
    `# ${packTitle(pack)}`,
    "",
    pack.profile?.sector ? `Sector: ${pack.profile.sector}` : "",
    pack.inputs?.founderName ? `Founder: ${pack.inputs.founderName}` : "",
    pack.inputs?.founderRole ? `Role: ${pack.inputs.founderRole}` : "",
    "",
    ...buildFounderPackTextSections(pack).flatMap((section) => [
      `## ${section.title}`,
      "",
      ...section.lines,
      "",
    ]),
  ].filter((line, index, arr) => line || arr[index - 1] !== "");
  return Buffer.from(`${lines.join("\n").trim()}\n`, "utf8");
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function docParagraph(text: string, style?: string): string {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

export function generateFounderPackDocx(pack: FounderPackExportInput): Buffer {
  const body = [
    docParagraph(packTitle(pack), "Title"),
    pack.profile?.sector ? docParagraph(`Sector: ${pack.profile.sector}`) : "",
    pack.inputs?.founderName ? docParagraph(`Founder: ${pack.inputs.founderName}`) : "",
    ...buildFounderPackTextSections(pack).flatMap((section) => [
      docParagraph(section.title, "Heading1"),
      ...section.lines.map((line) => docParagraph(line)),
    ]),
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>',
  ].filter(Boolean).join("");
  const files: Record<string, string | Buffer> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
    "word/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  };
  return createZip(files);
}

function wrapText(text: string, max = 84): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function generateFounderPackPdf(pack: FounderPackExportInput): Buffer {
  const textLines = [
    packTitle(pack),
    pack.profile?.sector ? `Sector: ${pack.profile.sector}` : "",
    pack.inputs?.founderName ? `Founder: ${pack.inputs.founderName}` : "",
    "",
    ...buildFounderPackTextSections(pack).flatMap((section) => [
      section.title,
      ...section.lines.flatMap((line) => wrapText(line)),
      "",
    ]),
  ].filter(Boolean);
  const pages: string[][] = [];
  for (let i = 0; i < textLines.length; i += 42) pages.push(textLines.slice(i, i + 42));
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  pages.forEach((page, index) => {
    const pageObj = 3 + index * 2;
    const contentObj = pageObj + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${contentObj} 0 R >>`);
    const content = `BT /F1 11 Tf 50 742 Td 14 TL ${page.map((line) => `(${pdfEscape(line)}) Tj T*`).join(" ")} ET`;
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  });
  return createPdf(objects);
}

function createPdf(objects: string[]): Buffer {
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(chunks.join(""), "utf8"));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });
  const xrefOffset = Buffer.byteLength(chunks.join(""), "utf8");
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`));
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return Buffer.from(chunks.join(""), "utf8");
}

function slideXml(title: string, bullets: string[]): string {
  const bulletRuns = bullets.slice(0, 6).map((bullet) => `<a:p><a:pPr marL="285750" indent="-285750"><a:buChar char="•"/></a:pPr><a:r><a:t>${xmlEscape(bullet)}</a:t></a:r></a:p>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="8200000" cy="1000000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="3200" b="1"/><a:t>${xmlEscape(title)}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Bullets"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="700000" y="1800000"/><a:ext cx="7600000" cy="4300000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${bulletRuns}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

export function generateFounderPackPptx(pack: FounderPackExportInput): Buffer {
  const slides = pack.content.pitchDeck?.length
    ? pack.content.pitchDeck.map((slide) => ({ title: slide.title, bullets: slide.bullets }))
    : buildFounderPackTextSections(pack).slice(0, 12).map((section) => ({ title: section.title, bullets: section.lines.slice(0, 6) }));
  const count = Math.max(slides.length, 1);
  const files: Record<string, string | Buffer> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${Array.from({ length: count }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    "ppt/presentation.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster1"/></p:sldMasterIdLst><p:sldIdLst>${Array.from({ length: count }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("")}</p:sldIdLst><p:sldSz cx="9144000" cy="5143500" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("")}<Relationship Id="rIdMaster1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/></Relationships>`,
    "ppt/slideMasters/slideMaster1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F8FBFF"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rIdLayout1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`,
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdTheme1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`,
    "ppt/slideLayouts/slideLayout1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld></p:sldLayout>`,
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
    "ppt/theme/theme1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="GrantsCopilot"><a:themeElements><a:clrScheme name="GrantsCopilot"><a:dk1><a:srgbClr val="081B36"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="123A6F"/></a:dk2><a:lt2><a:srgbClr val="F8FBFF"/></a:lt2><a:accent1><a:srgbClr val="3867E8"/></a:accent1><a:accent2><a:srgbClr val="43C28A"/></a:accent2><a:accent3><a:srgbClr val="8FB8FF"/></a:accent3><a:accent4><a:srgbClr val="C9E7FF"/></a:accent4><a:accent5><a:srgbClr val="1F5B99"/></a:accent5><a:accent6><a:srgbClr val="A7F3D0"/></a:accent6><a:hlink><a:srgbClr val="3867E8"/></a:hlink><a:folHlink><a:srgbClr val="3867E8"/></a:folHlink></a:clrScheme><a:fontScheme name="GrantsCopilot"><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="GrantsCopilot"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`,
  };
  slides.forEach((slide, index) => {
    files[`ppt/slides/slide${index + 1}.xml`] = slideXml(slide.title, slide.bullets);
    files[`ppt/slides/_rels/slide${index + 1}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
  });
  if (count === 1 && slides.length === 0) files["ppt/slides/slide1.xml"] = slideXml(packTitle(pack), ["Generate a pitch deck first for richer slides."]);
  return createZip(files);
}

export function generateFounderPackExport(pack: FounderPackExportInput, format: PackExportFormat): Buffer {
  if (format === "json") return Buffer.from(JSON.stringify(pack, null, 2), "utf8");
  if (format === "md") return generateFounderPackMarkdown(pack);
  if (format === "pdf") return generateFounderPackPdf(pack);
  if (format === "docx") return generateFounderPackDocx(pack);
  return generateFounderPackPptx(pack);
}

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function dosTime(date = new Date()): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

function createZip(files: Record<string, string | Buffer>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const stamp = dosTime();

  Object.entries(files).forEach(([name, value]) => {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}
