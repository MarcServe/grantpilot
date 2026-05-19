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
  exportOptions?: {
    includePitchDeckNotes?: boolean;
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
      : pack.inputs?.documentTypes?.length === FOUNDER_PACK_DOCUMENT_TYPES.length
        ? "full-pack"
        : "selected-documents";
  const extension = format === "json" ? "json" : format;
  return `${safe}-${typeSlug}.${extension}`;
}

export function isFounderPackExportFormat(value: string | null): value is PackExportFormat {
  return value === "md" || value === "pdf" || value === "docx" || value === "pptx" || value === "json";
}

function selectedTypes(pack: FounderPackExportInput): FounderPackDocumentType[] {
  if (pack.inputs?.documentTypes?.length) return pack.inputs.documentTypes;
  const inferred = inferLegacyTypes(pack.content);
  return inferred.length ? inferred : ["executive_summary"];
}

const LEGACY_HIDDEN_TYPES = new Set<FounderPackDocumentType>([
  "risk_mitigation",
  "evidence_checklist",
  "next_steps",
]);

function hasText(value?: string | null): boolean {
  return Boolean(value?.trim());
}

function inferLegacyTypes(content: FounderPackContent): FounderPackDocumentType[] {
  const inferred: FounderPackDocumentType[] = [];
  if (hasText(content.executiveSummary)) inferred.push("executive_summary");
  if (hasText(content.businessPlan)) inferred.push("business_plan");
  if (content.pitchDeck?.length) inferred.push("pitch_deck");
  if (content.businessModelCanvas?.valuePropositions?.length) inferred.push("business_model_canvas");
  if (hasText(content.innovationStatement)) inferred.push("innovation_statement");
  if (hasText(content.marketAnalysis)) inferred.push("market_analysis");
  if (
    content.financialProjections?.assumptions?.length ||
    content.financialProjections?.year1?.length ||
    content.financialProjections?.year2?.length ||
    content.financialProjections?.year3?.length
  ) {
    inferred.push("financial_projections");
  }
  if (content.grantApplicationDraft?.length) inferred.push("grant_application_draft");
  if (hasText(content.budgetNarrative)) inferred.push("budget_narrative");
  if (hasText(content.impactMeasurementPlan)) inferred.push("impact_measurement_plan");
  if (content.projectWorkplan?.length) inferred.push("project_workplan");
  if (hasText(content.supportLetterTemplate)) inferred.push("support_letter_template");
  if (hasText(content.founderPositioning)) inferred.push("founder_positioning");
  if (hasText(content.scalabilityPlan)) inferred.push("scalability_plan");
  return inferred.filter((type) => !LEGACY_HIDDEN_TYPES.has(type));
}

function includes(pack: FounderPackExportInput, type: FounderPackDocumentType): boolean {
  return selectedTypes(pack).includes(type);
}

function includePitchDeckNotes(pack: FounderPackExportInput): boolean {
  return pack.exportOptions?.includePitchDeckNotes === true;
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

function businessLabel(pack: FounderPackExportInput): string {
  return pack.profile?.businessName?.trim() || "Founder Funding Pack";
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
    const includeNotes = includePitchDeckNotes(pack);
    sections.push({
      title: "Canvas Standard Pitch Deck",
      lines: content.pitchDeck.flatMap((slide, index) => [
        `Slide ${index + 1}: ${slide.title}`,
        slide.objective ? `Objective: ${slide.objective}` : "",
        ...listLines(slide.bullets),
        includeNotes && slide.speakerNotes ? `Speaker notes: ${slide.speakerNotes}` : "",
        includeNotes && slide.visualDirection ? `Design direction: ${slide.visualDirection}` : "",
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
  const business = businessLabel(pack);
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

function docBullet(text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:ind w:left="720" w:hanging="360"/></w:pPr><w:r><w:t>-</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">${xmlEscape(text.replace(/^[-•]\s*/, ""))}</w:t></w:r></w:p>`;
}

function docPageBreak(): string {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

function docTextLine(line: string): string {
  const clean = line.trim();
  if (!clean) return "";
  if (/^Slide\s+\d+:/i.test(clean)) return docParagraph(clean, "Heading2");
  if (/^(Objective|Speaker notes|Design direction|Activities|Outputs|Assumptions|Year \d|Key Partners|Key Activities|Key Resources|Value Propositions|Customer Relationships|Channels|Customer Segments|Cost Structure|Revenue Streams)$/i.test(clean)) {
    return docParagraph(clean, "Heading3");
  }
  if (/^[-•]\s+/.test(clean)) return docBullet(clean);
  return docParagraph(clean);
}

export function generateFounderPackDocx(pack: FounderPackExportInput): Buffer {
  const body = [
    docParagraph(packTitle(pack), "Title"),
    pack.profile?.sector ? docParagraph(`Sector: ${pack.profile.sector}`) : "",
    pack.inputs?.founderName ? docParagraph(`Founder: ${pack.inputs.founderName}`) : "",
    pack.createdAt ? docParagraph(`Generated: ${new Date(pack.createdAt).toLocaleString("en-GB")}`) : "",
    pack.profile?.businessName ? docParagraph(pack.profile.businessName, "Subtitle") : "",
    ...buildFounderPackTextSections(pack).flatMap((section) => [
      docPageBreak(),
      docParagraph(section.title, "Heading1"),
      ...section.lines.map((line) => docTextLine(line)),
    ]),
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>',
  ].filter(Boolean).join("");
  const files: Record<string, string | Buffer> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
    "word/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="071A3A"/><w:sz w:val="38"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:spacing w:after="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="2167E8"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:pPr><w:spacing w:before="120" w:after="180"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="071A3A"/><w:sz w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="1F5B99"/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="Heading 3"/><w:pPr><w:spacing w:before="120" w:after="80"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="2F4562"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="21"/></w:rPr></w:style></w:styles>`,
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

function pdfSafeText(text: string): string {
  return text
    .replace(/[£]/g, "GBP ")
    .replace(/[€]/g, "EUR ")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[•]/g, "-")
    .replace(/[^\t\n\r\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfEscape(text: string): string {
  return pdfSafeText(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

interface PdfRow {
  text: string;
  size: number;
  font: "F1" | "F2";
  kind?: "section" | "slideTitle" | "slideTitleContinuation" | "subheading" | "bullet" | "note" | "body";
  slideNo?: number;
  indent?: number;
  gapBefore?: number;
  gapAfter?: number;
}

function addWrappedPdfRows(rows: PdfRow[], text: string, options: Omit<PdfRow, "text"> & { max?: number }) {
  for (const line of wrapText(pdfSafeText(text), options.max ?? 92)) {
    rows.push({
      text: line,
      size: options.size,
      font: options.font,
      kind: options.kind,
      slideNo: options.slideNo,
      indent: options.indent,
      gapBefore: options.gapBefore,
      gapAfter: options.gapAfter,
    });
  }
}

function buildPdfRows(pack: FounderPackExportInput): PdfRow[] {
  const rows: PdfRow[] = [
    { text: packTitle(pack), size: 19, font: "F2", gapAfter: 8 },
    ...(pack.profile?.sector ? [{ text: `Sector: ${pack.profile.sector}`, size: 11, font: "F1" as const }] : []),
    ...(pack.inputs?.founderName ? [{ text: `Founder: ${pack.inputs.founderName}`, size: 11, font: "F1" as const }] : []),
    ...(pack.createdAt ? [{ text: `Generated: ${new Date(pack.createdAt).toLocaleString("en-GB")}`, size: 10, font: "F1" as const, gapAfter: 14 }] : []),
  ];

  for (const section of buildFounderPackTextSections(pack)) {
    const isPitchDeckSection = section.title === "Canvas Standard Pitch Deck";
    if (!isPitchDeckSection) {
      rows.push({ text: `__PAGE_BREAK__${section.title}`, size: 16, font: "F2", kind: "section", gapAfter: 8 });
    }
    for (const raw of section.lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/^Slide\s+\d+:/i.test(line)) {
        const slideNo = Number(line.match(/^Slide\s+(\d+):/i)?.[1] ?? 0);
        rows.push({
          text: `${isPitchDeckSection ? "__PAGE_BREAK__" : ""}${line.replace(/^Slide\s+\d+:\s*/i, "")}`,
          size: 14,
          font: "F2",
          kind: "slideTitle",
          slideNo: Number.isFinite(slideNo) ? slideNo : undefined,
          indent: 66,
          gapBefore: 14,
          gapAfter: 22,
        });
      } else if (/^(Objective|Speaker notes|Design direction|Activities|Outputs|Assumptions|Year \d|Key Partners|Key Activities|Key Resources|Value Propositions|Customer Relationships|Channels|Customer Segments|Cost Structure|Revenue Streams)$/i.test(line)) {
        rows.push({
          text: line,
          size: 11,
          font: "F2",
          kind: "subheading",
          indent: isPitchDeckSection ? 82 : undefined,
          gapBefore: 6,
          gapAfter: 2,
        });
      } else if (/^[-•]\s+/.test(line)) {
        addWrappedPdfRows(rows, `- ${line.replace(/^[-•]\s*/, "")}`, {
          size: 10,
          font: "F1",
          kind: "bullet",
          indent: isPitchDeckSection ? 96 : 18,
          max: isPitchDeckSection ? 72 : 84,
          gapAfter: 1,
        });
      } else {
        const isNote = /^(Objective|Speaker notes|Design direction):/i.test(line);
        addWrappedPdfRows(rows, line, {
          size: 10.5,
          font: isNote ? "F2" : "F1",
          kind: isNote ? "note" : "body",
          indent: isPitchDeckSection ? 82 : undefined,
          max: isPitchDeckSection ? 74 : 88,
          gapAfter: 3,
        });
      }
    }
  }
  return rows;
}

function buildPdfTitleRows(pack: FounderPackExportInput): PdfRow[] {
  return [
    { text: packTitle(pack), size: 19, font: "F2", gapAfter: 8 },
    ...(pack.profile?.sector ? [{ text: `Sector: ${pack.profile.sector}`, size: 11, font: "F1" as const }] : []),
    ...(pack.inputs?.founderName ? [{ text: `Founder: ${pack.inputs.founderName}`, size: 11, font: "F1" as const }] : []),
    ...(pack.createdAt
      ? [{ text: `Generated: ${new Date(pack.createdAt).toLocaleString("en-GB")}`, size: 10, font: "F1" as const, gapAfter: 14 }]
      : []),
  ];
}

function appendStandardPdfLine(rows: PdfRow[], raw: string): void {
  const line = raw.trim();
  if (!line) return;
  if (/^Slide\s+\d+:/i.test(line)) {
    const slideNo = Number(line.match(/^Slide\s+(\d+):/i)?.[1] ?? 0);
    rows.push({
      text: line.replace(/^Slide\s+\d+:\s*/i, ""),
      size: 14,
      font: "F2",
      kind: "slideTitle",
      slideNo: Number.isFinite(slideNo) ? slideNo : undefined,
      indent: 66,
      gapBefore: 14,
      gapAfter: 22,
    });
    return;
  }
  if (/^(Objective|Speaker notes|Design direction|Activities|Outputs|Assumptions|Year \d|Key Partners|Key Activities|Key Resources|Value Propositions|Customer Relationships|Channels|Customer Segments|Cost Structure|Revenue Streams)$/i.test(line)) {
    rows.push({ text: line, size: 11, font: "F2", kind: "subheading", gapBefore: 6, gapAfter: 2 });
    return;
  }
  if (/^[-•]\s+/.test(line)) {
    addWrappedPdfRows(rows, `- ${line.replace(/^[-•]\s*/, "")}`, {
      size: 10,
      font: "F1",
      kind: "bullet",
      indent: 18,
      max: 84,
      gapAfter: 1,
    });
    return;
  }
  addWrappedPdfRows(rows, line, {
    size: 10.5,
    font: "F1",
    max: 88,
    gapAfter: 3,
  });
}

function buildPdfSectionRows(section: TextSection): PdfRow[] {
  const rows: PdfRow[] = [{ text: section.title, size: 16, font: "F2", kind: "section", gapAfter: 8 }];
  section.lines.forEach((line) => appendStandardPdfLine(rows, line));
  return rows;
}

function buildPitchSlideTitleRows(title: string, slideNo: number): PdfRow[] {
  const titleLines = wrapText(pdfSafeText(title), 42);
  const lines = titleLines.length > 0 ? titleLines : ["Untitled slide"];
  return lines.map((line, index) => ({
    text: line,
    size: 18,
    font: "F2" as const,
    kind: index === 0 ? "slideTitle" as const : "slideTitleContinuation" as const,
    slideNo: index === 0 ? slideNo : undefined,
    indent: 80,
    gapBefore: index === 0 ? 10 : 0,
    gapAfter: index === lines.length - 1 ? 24 : 2,
  }));
}

function buildPitchSlidePdfRows(
  slide: FounderPackContent["pitchDeck"][number],
  index: number,
  options: { includeNotes?: boolean } = {}
): PdfRow[] {
  const rows: PdfRow[] = buildPitchSlideTitleRows(slide.title, index + 1);
  if (slide.objective) {
    addWrappedPdfRows(rows, `Objective: ${slide.objective}`, {
      size: 11,
      font: "F2",
      kind: "note",
      indent: 94,
      max: 70,
      gapAfter: 10,
    });
  }
  slide.bullets.slice(0, 8).forEach((bullet) => {
    addWrappedPdfRows(rows, `- ${bullet}`, {
      size: 11,
      font: "F1",
      kind: "bullet",
      indent: 104,
      max: 68,
      gapAfter: 3,
    });
  });
  if (options.includeNotes && slide.speakerNotes) {
    addWrappedPdfRows(rows, `Speaker notes: ${slide.speakerNotes}`, {
      size: 10.5,
      font: "F2",
      kind: "note",
      indent: 94,
      max: 70,
      gapBefore: 18,
      gapAfter: 8,
    });
  }
  if (options.includeNotes && slide.visualDirection) {
    addWrappedPdfRows(rows, `Design direction: ${slide.visualDirection}`, {
      size: 10.5,
      font: "F2",
      kind: "note",
      indent: 94,
      max: 70,
      gapAfter: 8,
    });
  }
  return rows;
}

function paginatePdfRows(rows: PdfRow[]): PdfRow[][] {
  const pages: PdfRow[][] = [];
  let current: PdfRow[] = [];
  let y = 742;
  const bottom = 62;
  for (const row of rows) {
    const lineHeight = row.size + 5 + (row.gapBefore ?? 0) + (row.gapAfter ?? 0);
    if (current.length > 0 && y - lineHeight < bottom) {
      pages.push(current);
      current = [];
      y = 742;
    }
    current.push(row);
    y -= lineHeight;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

function buildPdfPages(pack: FounderPackExportInput): PdfRow[][] {
  const pages = paginatePdfRows(buildPdfTitleRows(pack));
  const includeNotes = includePitchDeckNotes(pack);
  for (const section of buildFounderPackTextSections(pack)) {
    if (section.title === "Canvas Standard Pitch Deck" && includes(pack, "pitch_deck") && pack.content.pitchDeck?.length) {
      pack.content.pitchDeck.forEach((slide, index) => {
        pages.push(buildPitchSlidePdfRows(slide, index, { includeNotes }));
      });
      continue;
    }
    pages.push(...paginatePdfRows(buildPdfSectionRows(section)));
  }
  return pages.filter((page) => page.length > 0);
}

function rgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "");
  const value = /^[0-9a-f]{6}$/i.test(clean) ? clean : "000000";
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255) as [number, number, number];
}

function fillRect(x: number, y: number, w: number, h: number, color: string): string {
  const [r, g, b] = rgb(color);
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x} ${y} ${w} ${h} re f`;
}

function textAt(font: "F1" | "F2", size: number, x: number, y: number, text: string, color = "111827"): string {
  const [r, g, b] = rgb(color);
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET`;
}

export function generateFounderPackPdf(pack: FounderPackExportInput): Buffer {
  const pages = buildPdfPages(pack);

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  pages.forEach((page, index) => {
    const pageObj = 3 + index * 2;
    const contentObj = pageObj + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObj} 0 R >>`);
    let cursorY = 742;
    const commands: string[] = [];
    page.forEach((row) => {
      cursorY -= row.gapBefore ?? 0;
      const x = 50 + (row.indent ?? 0);
      if (row.kind === "section") {
        commands.push(fillRect(44, cursorY - 5, 520, 24, "EAF2FC"));
      }
      if (row.kind === "slideTitle") {
        commands.push(fillRect(50, cursorY - 28, 52, 42, "081B36"));
        commands.push(textAt("F2", 6, 57, cursorY + 1, "SLIDE", "8FB8FF"));
        commands.push(textAt("F2", 18, 59, cursorY - 18, String(row.slideNo || ""), "FFFFFF"));
      }
      if (row.kind === "bullet") {
        commands.push(fillRect(Math.max(44, x - 8), cursorY - row.size - 5, Math.max(120, 560 - x), row.size + 8, "F3F7FC"));
      }
      if (row.kind === "note") {
        commands.push(fillRect(Math.max(44, x - 8), cursorY - row.size - 5, Math.max(120, 560 - x), row.size + 8, "F8FBFF"));
      }
      commands.push(textAt(row.font, row.size, x, cursorY, row.text, row.kind === "subheading" ? "1F5B99" : "111827"));
      cursorY -= row.size + 5 + (row.gapAfter ?? 0);
    });
    commands.push(textAt("F1", 8, 50, 34, `${businessLabel(pack)} | ${index + 1}/${pages.length}`, "374151"));
    const content = commands.join("\n");
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

function slideTextShape(
  id: number,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  paragraphs: string,
  fill?: string
): string {
  const fillXml = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : "<a:noFill/>";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>${fillXml}<a:ln><a:solidFill><a:srgbClr val="DCE7F5"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr lIns="120000" tIns="90000" rIns="120000" bIns="90000"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

function slideParagraph(text: string, size: number, bold = false, color = "071A3A"): string {
  return `<a:p><a:r><a:rPr sz="${size}"${bold ? ' b="1"' : ""}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${xmlEscape(text)}</a:t></a:r></a:p>`;
}

function slideBullet(text: string): string {
  return `<a:p><a:pPr marL="285750" indent="-285750"><a:buChar char="•"/></a:pPr><a:r><a:rPr sz="1550"><a:solidFill><a:srgbClr val="2F4562"/></a:solidFill></a:rPr><a:t>${xmlEscape(text)}</a:t></a:r></a:p>`;
}

function slideXml(
  brandLabel: string,
  title: string,
  bullets: string[],
  slideNo: number,
  objective?: string,
  speakerNotes?: string,
  visualDirection?: string
): string {
  const bulletRuns = bullets.slice(0, 6).map(slideBullet).join("");
  const objectiveBlock = objective
    ? slideTextShape(4, "Objective", 6100000, 520000, 2500000, 470000, slideParagraph(objective, 1200, true, "FFFFFF"), "1F5B99")
    : "";
  const notes = speakerNotes || visualDirection
    ? slideTextShape(
        5,
        "Speaker Notes and Design Direction",
        1700000,
        4100000,
        6800000,
        760000,
        `${speakerNotes ? slideParagraph(`Speaker notes: ${speakerNotes}`, 1050, false, "2F4562") : ""}${visualDirection ? slideParagraph(`Design direction: ${visualDirection}`, 1050, false, "2F4562") : ""}`,
        "F3F7FC"
      )
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F8FBFF"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Number Band"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1200000" cy="5143500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="081B36"/></a:solidFill></p:spPr><p:txBody><a:bodyPr lIns="190000" tIns="380000" rIns="90000" bIns="90000"/><a:lstStyle/>${slideParagraph("SLIDE", 1050, true, "8FB8FF")}${slideParagraph(String(slideNo), 3300, true, "FFFFFF")}${slideParagraph(brandLabel, 950, true, "43C28A")}</p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="1700000" y="520000"/><a:ext cx="4200000" cy="1000000"/></a:xfrm><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${slideParagraph(title, 2700, true, "071A3A")}</p:txBody></p:sp>${objectiveBlock}${slideTextShape(6, "Slide Bullets", 1700000, 1700000, 6800000, 2050000, bulletRuns || slideParagraph("Add supporting evidence for this slide.", 1500), "EAF2FC")}${notes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

export function generateFounderPackPptx(pack: FounderPackExportInput): Buffer {
  const includeNotes = includePitchDeckNotes(pack);
  const slides: {
    title: string;
    bullets: string[];
    objective?: string;
    speakerNotes?: string;
    visualDirection?: string;
  }[] = pack.content.pitchDeck?.length
    ? pack.content.pitchDeck.map((slide) => ({
        title: slide.title,
        bullets: slide.bullets,
        objective: slide.objective,
        speakerNotes: includeNotes ? slide.speakerNotes : undefined,
        visualDirection: includeNotes ? slide.visualDirection : undefined,
      }))
    : buildFounderPackTextSections(pack).slice(0, 12).map((section) => ({
        title: section.title,
        bullets: section.lines.slice(0, 6),
        objective: "Summarise this funding document section.",
      }));
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
    files[`ppt/slides/slide${index + 1}.xml`] = slideXml(
      businessLabel(pack).slice(0, 26),
      slide.title,
      slide.bullets,
      index + 1,
      slide.objective,
      slide.speakerNotes,
      slide.visualDirection
    );
    files[`ppt/slides/_rels/slide${index + 1}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
  });
  if (count === 1 && slides.length === 0) files["ppt/slides/slide1.xml"] = slideXml(businessLabel(pack).slice(0, 26), packTitle(pack), ["Generate a pitch deck first for richer slides."], 1);
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
