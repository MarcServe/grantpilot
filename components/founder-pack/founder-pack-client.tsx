"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  FileType2,
  Loader2,
  Lock,
  PlusCircle,
  Presentation,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import {
  FOUNDER_PACK_DOCUMENT_TYPES,
  type FounderPackContent,
  type FounderPackDocumentType,
  type FounderPackInputs,
} from "@/lib/founder-pack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PackSummary {
  id: string;
  createdAt: string;
  createdAtLabel: string;
  type: string;
  content: FounderPackContent;
  documentTypes?: FounderPackDocumentType[] | null;
  profileBusinessName?: string | null;
  profileSector?: string | null;
}

interface ProfileOption {
  id: string;
  businessName: string;
  sector: string;
  primaryContactName?: string | null;
  primaryContactRole?: string | null;
  directorNames?: string | null;
  founderBackground?: string | null;
  teamExpertise?: string | null;
  financialProjections?: string | null;
}

interface ApplicationOption {
  id: string;
  status: string;
  profileId: string;
  grantId: string;
  grantName: string;
  funder: string;
}

interface EligibleGrantOption {
  grantId: string;
  profileId: string;
  grantName: string;
  funder: string;
  score: number;
  decision: string;
  addedAt?: string | null;
}

interface QuestionAssistantAnswer {
  question: string;
  draftAnswer: string;
  rationale: string;
  confidence: "high" | "medium" | "low";
  evidenceStrength: "strong" | "medium" | "weak";
  missingEvidence: string[];
  suggestedProfileUpdates: string[];
  warnings: string[];
}

function contentIsReady(content?: FounderPackContent | null): content is FounderPackContent {
  return Boolean(
    content?.executiveSummary ||
      content?.businessPlan ||
      content?.innovationStatement ||
      content?.marketAnalysis ||
      content?.pitchDeck?.length ||
      content?.businessModelCanvas?.valuePropositions?.length ||
      content?.founderPositioning ||
      content?.scalabilityPlan ||
      content?.grantApplicationDraft?.length ||
      content?.budgetNarrative ||
      content?.impactMeasurementPlan ||
      content?.projectWorkplan?.length ||
      content?.supportLetterTemplate ||
      content?.riskMitigation?.length ||
      content?.evidenceChecklist?.length ||
      content?.nextSteps?.length ||
      content?.financialProjections?.assumptions?.length
  );
}

function documentTypeLabel(types?: FounderPackDocumentType[] | null): string {
  if (!types?.length) return "Legacy document";
  if (types.length === FOUNDER_PACK_DOCUMENT_TYPES.length) return "Full pack";
  if (types.length === 1) {
    return FOUNDER_PACK_DOCUMENT_TYPES.find((item) => item.value === types[0])?.label ?? "Document";
  }
  return `${types.length} documents`;
}

const legacyHiddenDocumentTypes = new Set<FounderPackDocumentType>([
  "risk_mitigation",
  "evidence_checklist",
  "next_steps",
]);

function hasText(value?: string | null): boolean {
  return Boolean(value?.trim());
}

function firstText(...values: Array<string | null | undefined>): string {
  return values.map((value) => value?.trim()).find(Boolean) ?? "";
}

function firstDirectorName(value?: string | null): string {
  if (!value?.trim()) return "";
  const first = value.split(/\n|,|;/).map((item) => item.trim()).find(Boolean);
  return first ?? "";
}

function formatAddedAt(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function parseQuestionBlocks(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const blankLineBlocks = trimmed
    .split(/\n{2,}/)
    .map((item) => item.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);
  if (blankLineBlocks.length > 1) return blankLineBlocks.slice(0, 8);
  return trimmed
    .split("\n")
    .map((item) => item.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function inferLegacyDocumentTypes(content: FounderPackContent): FounderPackDocumentType[] {
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

  return inferred.filter((type) => !legacyHiddenDocumentTypes.has(type));
}

function packDocumentTypes(pack: PackSummary): FounderPackDocumentType[] {
  if (pack.documentTypes?.length) return pack.documentTypes;
  const inferred = inferLegacyDocumentTypes(pack.content);
  return inferred.length ? inferred : ["executive_summary"];
}

const documentPresets: {
  label: string;
  description: string;
  types: FounderPackDocumentType[];
}[] = [
  {
    label: "Full grant pack",
    description: "Every planning, grant-writing, pitch, budget, impact, and evidence document.",
    types: FOUNDER_PACK_DOCUMENT_TYPES.map((item) => item.value),
  },
  {
    label: "Pitch deck + canvas",
    description: "Canvas Standard Pitch Deck, Business Model Canvas, summary, market, and projections.",
    types: ["pitch_deck", "business_model_canvas", "executive_summary", "market_analysis", "financial_projections"],
  },
  {
    label: "Grant application pack",
    description: "Application answers, budget narrative, impact plan, workplan, support letter, and evidence list.",
    types: [
      "grant_application_draft",
      "budget_narrative",
      "impact_measurement_plan",
      "project_workplan",
      "support_letter_template",
      "evidence_checklist",
      "next_steps",
    ],
  },
  {
    label: "Founder / visa pack",
    description: "Business plan, innovation, founder positioning, scalability, market, and risk sections.",
    types: [
      "business_plan",
      "innovation_statement",
      "founder_positioning",
      "scalability_plan",
      "market_analysis",
      "financial_projections",
      "risk_mitigation",
      "evidence_checklist",
    ],
  },
];

const exportFormats = [
  { label: "PPTX deck", icon: Presentation },
  { label: "DOCX pack", icon: FileText },
  { label: "PDF pack", icon: FileType2 },
  { label: "Markdown", icon: FileText },
  { label: "JSON data", icon: FileJson },
  { label: "Canva handoff", icon: ExternalLink },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid space-y-2 border-b pb-5 last:border-b-0">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ParagraphBlock({ text }: { text: string }) {
  return <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{text}</p>;
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function CanvasBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="mt-2">
        <BulletList items={items} />
      </div>
    </div>
  );
}

function PackDocument({ pack }: { pack: PackSummary }) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [includePitchDeckNotes, setIncludePitchDeckNotes] = useState(false);
  const content = pack.content;
  const pitchDeck = content.pitchDeck ?? [];
  const visibleSlideIndex = pitchDeck.length > 0 ? Math.min(activeSlideIndex, pitchDeck.length - 1) : 0;
  const visibleSlide = pitchDeck[visibleSlideIndex];
  const businessModelCanvas = content.businessModelCanvas ?? {
    keyPartners: [],
    keyActivities: [],
    keyResources: [],
    valuePropositions: [],
    customerRelationships: [],
    channels: [],
    customerSegments: [],
    costStructure: [],
    revenueStreams: [],
  };
  const grantApplicationDraft = content.grantApplicationDraft ?? [];
  const projectWorkplan = content.projectWorkplan ?? [];
  const isLegacyPack = !pack.documentTypes?.length;
  const documentTypes = packDocumentTypes(pack);
  const includes = (type: FounderPackDocumentType) => documentTypes.includes(type);
  const title = `${pack.profileBusinessName ?? "Founder"} ${documentTypeLabel(pack.documentTypes)}`;
  const hasPitchDeck = includes("pitch_deck");

  async function downloadExport(format: "pdf" | "docx" | "pptx" | "md" | "json") {
    setExporting(format);
    try {
      const params = new URLSearchParams({
        format,
        v: String(Date.now()),
      });
      if (hasPitchDeck && includePitchDeckNotes && format !== "json") {
        params.set("includePitchDeckNotes", "true");
      }
      const res = await fetch(`/api/founder-pack/${pack.id}/export?${params.toString()}`, {
        cache: "no-store",
      });
      const blob = await res.blob();
      if (!res.ok) {
        const error = await blob.text().catch(() => "");
        toast.error(error ? JSON.parse(error).error ?? "Export failed" : "Export failed");
        return;
      }
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `founder-pack.${format}`;
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      toast.success(`${format.toUpperCase()} export ready`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(null);
    }
  }

  async function sendToCanva() {
    setExporting("canva");
    try {
      const res = await fetch(`/api/founder-pack/${pack.id}/canva`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not send deck to Canva");
        return;
      }
      const designUrl =
        data.job?.result?.design?.urls?.edit_url ??
        data.job?.job?.result?.design?.urls?.edit_url ??
        data.job?.result?.design?.url ??
        data.job?.job?.result?.design?.url;
      if (designUrl) {
        window.open(designUrl, "_blank", "noopener,noreferrer");
        toast.success("Canva deck created");
      } else {
        toast.success("Canva design job started");
      }
    } catch {
      toast.error("Could not send deck to Canva");
    } finally {
      setExporting(null);
    }
  }

  return (
    <Card className="print:border-0 print:shadow-none">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-white sm:flex">
            <Image src="/icon.png" alt="GrantsCopilot" width={34} height={34} className="rounded-md" />
          </div>
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 leading-tight">
              <FileText className="h-5 w-5 shrink-0" />
              <span>{title}</span>
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {pack.profileSector ? `${pack.profileSector} · ` : ""}
              Generated {pack.createdAtLabel}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {documentTypes.slice(0, 5).map((type) => (
                <Badge key={type} variant="secondary" className="text-[11px]">
                  {FOUNDER_PACK_DOCUMENT_TYPES.find((item) => item.value === type)?.label ?? type}
                </Badge>
              ))}
              {documentTypes.length > 5 && <Badge variant="outline" className="text-[11px]">+{documentTypes.length - 5}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 print:hidden sm:items-end">
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {(["pptx", "docx", "pdf", "md", "json"] as const).map((format) => (
              <Button
                key={format}
                type="button"
                variant={format === "pptx" && hasPitchDeck ? "default" : "outline"}
                size="sm"
                className="gap-2"
                disabled={Boolean(exporting)}
                onClick={() => downloadExport(format)}
              >
                {exporting === format ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {format === "pptx" && hasPitchDeck ? "PPTX deck" : format.toUpperCase()}
              </Button>
            ))}
            <Button type="button" variant="outline" size="sm" className="gap-2" disabled={Boolean(exporting)} onClick={sendToCanva}>
              {exporting === "canva" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Canva
            </Button>
          </div>
          {hasPitchDeck && (
            <Label className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-sm">
              <Checkbox
                checked={includePitchDeckNotes}
                onCheckedChange={(checked) => setIncludePitchDeckNotes(checked === true)}
              />
              Include speaker/design notes
            </Label>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLegacyPack && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
            This is an older generated pack. It is shown without generic risk, evidence, or next-step sections. Generate a
            new pack after selecting document types and grant context for a fully tailored output.
          </div>
        )}
        {hasPitchDeck && (
          <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 print:hidden">
            Pitch decks export best as <span className="font-semibold">PPTX deck</span>. PDF keeps the deck-style review
            layout; DOCX keeps an editable Word structure for copy and notes.
          </div>
        )}
        {includes("executive_summary") && content.executiveSummary && (
          <Section title="Executive Summary">
            <ParagraphBlock text={content.executiveSummary} />
          </Section>
        )}
        {includes("business_plan") && content.businessPlan && (
          <Section title="Business Plan">
            <ParagraphBlock text={content.businessPlan} />
          </Section>
        )}
        {includes("pitch_deck") && pitchDeck.length > 0 && (
          <Section title="Canvas Standard Pitch Deck">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                <Badge variant="outline">
                  Slide {visibleSlideIndex + 1} of {pitchDeck.length}
                </Badge>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={visibleSlideIndex === 0}
                    onClick={() => setActiveSlideIndex((index) => Math.max(0, index - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={visibleSlideIndex >= pitchDeck.length - 1}
                    onClick={() => setActiveSlideIndex((index) => Math.min(pitchDeck.length - 1, index + 1))}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {visibleSlide && (
                <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                  <div className="grid min-h-[360px] gap-0 sm:grid-cols-[120px_1fr]">
                    <div className="flex flex-col justify-between bg-[#071a3a] p-4 text-white">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">Slide</p>
                        <p className="mt-1 text-5xl font-black">{visibleSlideIndex + 1}</p>
                      </div>
                      <p className="text-xs font-medium text-emerald-200">Pitch deck</p>
                    </div>
                    <div className="space-y-5 p-5 sm:p-6">
                      <div className="space-y-3">
                        <h3 className="max-w-2xl text-2xl font-black leading-tight text-[#071a3a]">{visibleSlide.title}</h3>
                        {visibleSlide.objective && (
                          <p className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium leading-5 text-white">
                            {visibleSlide.objective}
                          </p>
                        )}
                      </div>
                      <div className="rounded-md bg-blue-50 p-4">
                        <BulletList items={visibleSlide.bullets} />
                      </div>
                      {visibleSlide.speakerNotes && (
                        <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
                          <span className="font-medium text-foreground">Speaker notes: </span>
                          {visibleSlide.speakerNotes}
                        </p>
                      )}
                      {visibleSlide.visualDirection && (
                        <p className="rounded-md border border-dashed p-3 text-sm leading-6 text-muted-foreground">
                          <span className="font-medium text-foreground">Design direction: </span>
                          {visibleSlide.visualDirection}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}
        {includes("business_model_canvas") && businessModelCanvas.valuePropositions.length > 0 && (
          <Section title="Business Model Canvas">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <CanvasBlock title="Key Partners" items={businessModelCanvas.keyPartners} />
              <CanvasBlock title="Key Activities" items={businessModelCanvas.keyActivities} />
              <CanvasBlock title="Key Resources" items={businessModelCanvas.keyResources} />
              <CanvasBlock title="Value Propositions" items={businessModelCanvas.valuePropositions} />
              <CanvasBlock title="Customer Relationships" items={businessModelCanvas.customerRelationships} />
              <CanvasBlock title="Channels" items={businessModelCanvas.channels} />
              <CanvasBlock title="Customer Segments" items={businessModelCanvas.customerSegments} />
              <CanvasBlock title="Cost Structure" items={businessModelCanvas.costStructure} />
              <CanvasBlock title="Revenue Streams" items={businessModelCanvas.revenueStreams} />
            </div>
          </Section>
        )}
        {includes("innovation_statement") && content.innovationStatement && (
          <Section title="Innovation Statement">
            <ParagraphBlock text={content.innovationStatement} />
          </Section>
        )}
        {includes("market_analysis") && content.marketAnalysis && (
          <Section title="Market Analysis">
            <ParagraphBlock text={content.marketAnalysis} />
          </Section>
        )}
        {includes("financial_projections") && (
          <Section title="Financial Projections">
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["Assumptions", content.financialProjections.assumptions],
                ["Year 1", content.financialProjections.year1],
                ["Year 2", content.financialProjections.year2],
                ["Year 3", content.financialProjections.year3],
              ].map(([label, rows]) => (
                <div key={String(label)} className="rounded-md border p-3">
                  <h3 className="text-sm font-medium">{String(label)}</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {(rows as string[]).map((row) => (
                      <li key={row}>{row}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        )}
        {includes("grant_application_draft") && grantApplicationDraft.length > 0 && (
          <Section title="Grant Application Draft">
            <div className="space-y-3">
              {grantApplicationDraft.map((item) => (
                <div key={item.question} className="rounded-md border bg-background p-3">
                  <h3 className="text-sm font-medium">{item.question}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.answer}</p>
                </div>
              ))}
            </div>
          </Section>
        )}
        {includes("budget_narrative") && content.budgetNarrative && (
          <Section title="Budget Narrative">
            <ParagraphBlock text={content.budgetNarrative} />
          </Section>
        )}
        {includes("impact_measurement_plan") && content.impactMeasurementPlan && (
          <Section title="Impact Measurement Plan">
            <ParagraphBlock text={content.impactMeasurementPlan} />
          </Section>
        )}
        {includes("project_workplan") && projectWorkplan.length > 0 && (
          <Section title="Project Workplan">
            <div className="space-y-3">
              {projectWorkplan.map((phase) => (
                <div key={`${phase.phase}-${phase.timeline}`} className="rounded-md border bg-background p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-medium">{phase.phase}</h3>
                    {phase.timeline && <Badge variant="outline">{phase.timeline}</Badge>}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Activities</p>
                      <BulletList items={phase.activities} />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Outputs</p>
                      <BulletList items={phase.outputs} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
        {includes("support_letter_template") && content.supportLetterTemplate && (
          <Section title="Support Letter Template">
            <ParagraphBlock text={content.supportLetterTemplate} />
          </Section>
        )}
        {includes("founder_positioning") && content.founderPositioning && (
          <Section title="Founder Positioning">
            <ParagraphBlock text={content.founderPositioning} />
          </Section>
        )}
        {includes("scalability_plan") && content.scalabilityPlan && (
          <Section title="Scalability Plan">
            <ParagraphBlock text={content.scalabilityPlan} />
          </Section>
        )}
        {includes("risk_mitigation") && content.riskMitigation.length > 0 && (
          <Section title="Risks & Mitigation">
            <div className="space-y-2">
              {content.riskMitigation.map((item) => (
                <div key={`${item.risk}-${item.mitigation}`} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{item.risk}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.mitigation}</p>
                </div>
              ))}
            </div>
          </Section>
        )}
        {includes("evidence_checklist") && content.evidenceChecklist.length > 0 && (
          <Section title="Evidence Checklist">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {content.evidenceChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>
        )}
        {includes("next_steps") && content.nextSteps.length > 0 && (
          <Section title="Next Steps">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {content.nextSteps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>
        )}
        <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">{content.disclaimer}</p>
      </CardContent>
    </Card>
  );
}

export function FounderPackClient({
  profiles,
  applications,
  eligibleGrants,
  packs,
  allowed,
  initialGrantId,
  initialApplicationId,
}: {
  profiles: ProfileOption[];
  applications: ApplicationOption[];
  eligibleGrants: EligibleGrantOption[];
  packs: PackSummary[];
  allowed: boolean;
  initialGrantId?: string;
  initialApplicationId?: string;
}) {
  const router = useRouter();
  const initialProfile = profiles[0];
  const inferredFounderName = firstText(
    initialProfile?.primaryContactName,
    firstDirectorName(initialProfile?.directorNames)
  );
  const [history, setHistory] = useState(packs);
  const [selectedPackId, setSelectedPackId] = useState(packs[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");
  const [form, setForm] = useState<FounderPackInputs & { profileId: string }>({
    profileId: profiles[0]?.id ?? "",
    founderName: inferredFounderName,
    founderRole: firstText(initialProfile?.primaryContactRole, "Technical founder / CEO"),
    founderBackground: profiles[0]?.founderBackground ?? "",
    technicalContribution: profiles[0]?.teamExpertise ?? "",
    targetUse: "innovator_founder_visa",
    documentTypes: [],
    marketFocus: "UK SMEs, startups, councils, incubators, and funding support organisations.",
    revenueModel: "SaaS subscriptions for SMEs, premium founder packs, and B2B licensing for councils, incubators, and accelerators.",
    pricingAssumptions: "Free trial for initial onboarding, paid Pro and Business plans, with optional premium document pack generation.",
    hiringPlan: "Founder-led product development first, then hire AI engineering, grant operations, customer success, and partnerships roles as revenue grows.",
    additionalNotes: "",
    selectedApplicationIds: initialApplicationId ? [initialApplicationId] : [],
    selectedEligibleGrantIds: initialGrantId ? [initialGrantId] : [],
    grantRequirementsNotes: "",
  });
  const [questionAssistantMode, setQuestionAssistantMode] = useState<
    "draft_answer" | "evidence_check" | "improve_existing_answer"
  >("draft_answer");
  const [questionAssistantText, setQuestionAssistantText] = useState("");
  const [questionAssistantGuidance, setQuestionAssistantGuidance] = useState("");
  const [questionAssistantWordLimit, setQuestionAssistantWordLimit] = useState("");
  const [questionAssistantExistingAnswer, setQuestionAssistantExistingAnswer] = useState("");
  const [questionAssistantLoading, setQuestionAssistantLoading] = useState(false);
  const [questionAssistantAnswers, setQuestionAssistantAnswers] = useState<QuestionAssistantAnswer[]>([]);

  const selectedPack = useMemo(
    () => history.find((pack) => pack.id === selectedPackId) ?? history[0] ?? null,
    [history, selectedPackId]
  );

  const applicationsForProfile = useMemo(
    () => applications.filter((a) => a.profileId === form.profileId),
    [applications, form.profileId]
  );

  const eligibleForProfile = useMemo(
    () => eligibleGrants.filter((row) => row.profileId === form.profileId),
    [eligibleGrants, form.profileId]
  );

  const selectedEligibleCount = form.selectedEligibleGrantIds?.length ?? 0;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleDocumentType(type: FounderPackDocumentType, checked: boolean) {
    setForm((prev) => {
      const current = prev.documentTypes?.length ? prev.documentTypes : [];
      const next = checked
        ? [...new Set([...current, type])]
        : current.filter((item) => item !== type);
      return { ...prev, documentTypes: next };
    });
  }

  function applyDocumentPreset(types: FounderPackDocumentType[]) {
    setForm((prev) => ({ ...prev, documentTypes: types }));
  }

  function selectProfile(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId);
    const nextFounderName = firstText(profile?.primaryContactName, firstDirectorName(profile?.directorNames));
    setForm((prev) => ({
      ...prev,
      profileId,
      selectedApplicationIds: [],
      selectedEligibleGrantIds: [],
      founderName: prev.founderName || nextFounderName,
      founderRole: prev.founderRole || firstText(profile?.primaryContactRole, "Technical founder / CEO"),
      founderBackground: prev.founderBackground || profile?.founderBackground || "",
      technicalContribution: prev.technicalContribution || profile?.teamExpertise || "",
      pricingAssumptions: prev.pricingAssumptions || profile?.financialProjections || "",
    }));
  }

  function toggleGrantApplication(applicationId: string, checked: boolean) {
    setForm((prev) => {
      const cur = prev.selectedApplicationIds ?? [];
      const next = checked ? [...new Set([...cur, applicationId])] : cur.filter((id) => id !== applicationId);
      return { ...prev, selectedApplicationIds: next };
    });
  }

  function toggleEligibleGrant(grantId: string, checked: boolean) {
    setForm((prev) => {
      const cur = prev.selectedEligibleGrantIds ?? [];
      if (checked && cur.length >= 15 && !cur.includes(grantId)) {
        toast.error("You can select up to 15 eligible grants.");
        return prev;
      }
      const next = checked ? [...new Set([...cur, grantId])] : cur.filter((id) => id !== grantId);
      return { ...prev, selectedEligibleGrantIds: next };
    });
  }

  async function generate() {
    if (!allowed) {
      toast.error("Upgrade to Pro or Business to generate Founder Funding Packs.");
      return;
    }
    if (!form.documentTypes?.length) {
      toast.error("Select a document type or quick preset first.");
      return;
    }
    setLoading(true);
    setGenerationStatus("Preparing company DNA, grant context, and selected document brief...");
    try {
      const payload = {
        ...form,
        founderName: form.founderName.trim() || inferredFounderName || "Founder",
        selectedApplicationIds:
          form.selectedApplicationIds?.length ? form.selectedApplicationIds : undefined,
        selectedEligibleGrantIds:
          form.selectedEligibleGrantIds?.length ? form.selectedEligibleGrantIds : undefined,
        grantRequirementsNotes: form.grantRequirementsNotes?.trim() || undefined,
      };

      const res = await fetch("/api/founder-pack/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setGenerationStatus("Structuring the document, checking selected sections, and saving the pack...");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not generate pack");
        return;
      }
      const pack = data.pack as { id: string; createdAt: string; content: FounderPackContent };
      const selectedProfile = profiles.find((profile) => profile.id === form.profileId);
      const next: PackSummary = {
        id: pack.id,
        createdAt: pack.createdAt,
        createdAtLabel: "just now",
        type: form.targetUse,
        documentTypes: form.documentTypes,
        profileBusinessName: selectedProfile?.businessName ?? null,
        profileSector: selectedProfile?.sector ?? null,
        content: pack.content,
      };
      setHistory((prev) => [next, ...prev]);
      setSelectedPackId(next.id);
      setGenerationStatus("Generated and saved. Preview is ready.");
      toast.success("Founder Funding Pack generated");
      router.refresh();
    } catch {
      toast.error("Could not generate pack");
    } finally {
      setLoading(false);
      window.setTimeout(() => setGenerationStatus(""), 2400);
    }
  }

  async function generateQuestionAnswers() {
    if (!allowed) {
      toast.error("Upgrade to Growth, Pro, or Business to use the AI Grant Question Assistant.");
      return;
    }
    const questions = parseQuestionBlocks(questionAssistantText);
    if (questions.length === 0) {
      toast.error("Paste at least one grant form question.");
      return;
    }
    const parsedWordLimit = Number(questionAssistantWordLimit);
    const wordLimit = Number.isFinite(parsedWordLimit) && parsedWordLimit > 0
      ? Math.floor(parsedWordLimit)
      : undefined;

    setQuestionAssistantLoading(true);
    try {
      const res = await fetch("/api/founder-pack/question-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: form.profileId,
          selectedApplicationIds: form.selectedApplicationIds?.length ? form.selectedApplicationIds : undefined,
          selectedEligibleGrantIds: form.selectedEligibleGrantIds?.length ? form.selectedEligibleGrantIds : undefined,
          pastedGrantContext: form.grantRequirementsNotes?.trim() || undefined,
          questions: questions.map((question) => ({
            question,
            wordLimit,
            guidance: questionAssistantGuidance.trim() || undefined,
          })),
          outputMode: questionAssistantMode,
          existingAnswer: questionAssistantExistingAnswer.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not generate answers");
        return;
      }
      const answers = Array.isArray(data.answers) ? (data.answers as QuestionAssistantAnswer[]) : [];
      setQuestionAssistantAnswers(answers);
      if (answers.length) {
        toast.success("Grant answers generated");
      } else {
        toast.error("No answers returned. Add more grant context and try again.");
      }
    } catch {
      toast.error("Could not generate answers");
    } finally {
      setQuestionAssistantLoading(false);
    }
  }

  async function copyQuestionAnswer(answer: QuestionAssistantAnswer) {
    try {
      await navigator.clipboard.writeText(answer.draftAnswer);
      toast.success("Draft answer copied");
    } catch {
      toast.error("Could not copy answer");
    }
  }

  function addAnswerToPackNotes(answer: QuestionAssistantAnswer) {
    const block = [
      "Grant form answer draft:",
      `Question: ${answer.question}`,
      `Answer: ${answer.draftAnswer}`,
      answer.missingEvidence.length ? `Missing evidence: ${answer.missingEvidence.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    setForm((prev) => ({
      ...prev,
      grantRequirementsNotes: [prev.grantRequirementsNotes?.trim(), block].filter(Boolean).join("\n\n---\n\n"),
    }));
    toast.success("Added to pack notes");
  }

  if (profiles.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground">Create a business profile first so the pack has company DNA to work from.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden border-blue-100 bg-gradient-to-br from-white via-white to-blue-50">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-2xl">
                <Badge className="gap-1 bg-blue-100 text-blue-700 hover:bg-blue-100">
                  <Presentation className="h-3.5 w-3.5" />
                  Pitch deck and grant documents
                </Badge>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-[#071a3a]">
                  Generate the full funding pack from company DNA.
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Pick a grant, select the outputs, then generate funder-ready documents including a Canvas Standard Pitch
                  Deck, Business Model Canvas, business plan, application answers, budget narrative, evidence checklist, and
                  export files.
                </p>
              </div>
              <div className="grid min-w-[190px] gap-2 rounded-xl border bg-white/80 p-3 text-sm shadow-sm">
                <div className="flex items-center gap-2 font-semibold text-[#071a3a]">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Available exports
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {exportFormats.map((format) => {
                    const Icon = format.icon;
                    return (
                      <span key={format.label} className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700">
                        <Icon className="h-3.5 w-3.5 text-blue-600" />
                        {format.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick document presets</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {documentPresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyDocumentPreset(preset.types)}
                className="rounded-md border bg-background p-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50"
              >
                <span className="block text-sm font-semibold text-[#071a3a]">{preset.label}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{preset.description}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="space-y-6 print:hidden">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BriefcaseBusiness className="h-5 w-5" />
              Pack Inputs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!allowed && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="flex items-center gap-2 font-medium">
                  <Lock className="h-4 w-4" />
                  Paid plans
                </div>
                <p className="mt-1">Upgrade to Growth, Pro, or Business to generate visa-grade business planning packs.</p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Document types</Label>
                <Badge variant="secondary">{form.documentTypes?.length ?? 0} selected</Badge>
              </div>
              <div className="grid gap-2">
                {FOUNDER_PACK_DOCUMENT_TYPES.map((doc) => (
                  <label
                    key={doc.value}
                    className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3 transition-colors hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={form.documentTypes?.includes(doc.value) ?? false}
                      onCheckedChange={(value) => toggleDocumentType(doc.value, value === true)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{doc.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{doc.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              {form.documentTypes?.length === 0 && (
                <p className="text-sm text-destructive">Select at least one document type.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="profileId">Business profile</Label>
              <select
                id="profileId"
                value={form.profileId}
                onChange={(event) => selectProfile(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.businessName} — {profile.sector}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 rounded-lg border border-dashed bg-muted/25 p-3">
              <div>
                <Label className="text-base">Grant context</Label>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Choose applications and/or scored grants for this profile so we pull published eligibility and your latest
                  match assessment into the pack. Grants that already have an application appear only above; paste extra funder
                  wording below when needed.
                </p>
              </div>
              {applicationsForProfile.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No applications for this profile yet. Paste grant requirements below or start applications from{" "}
                  <span className="font-medium text-foreground">Opportunities</span>.
                </p>
              ) : (
                <div className="grid max-h-[220px] gap-2 overflow-y-auto pr-1">
                  {applicationsForProfile.map((app) => (
                    <label
                      key={app.id}
                      className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-2.5 transition-colors hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={form.selectedApplicationIds?.includes(app.id) ?? false}
                        onCheckedChange={(value) => toggleGrantApplication(app.id, value === true)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium leading-snug">{app.grantName}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {app.funder ? `${app.funder} · ` : ""}
                          Status: {app.status.replace(/_/g, " ")}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {eligibleForProfile.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-sm font-medium">Eligible opportunities (no application yet)</Label>
                    <Badge variant="outline">{selectedEligibleCount}/15</Badge>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    From eligibility scoring for this profile. Start an application for a grant if you want it in the list
                    above instead.
                  </p>
                  <div className="grid max-h-[220px] gap-2 overflow-y-auto pr-1">
                    {eligibleForProfile.map((row) => {
                      const checked = form.selectedEligibleGrantIds?.includes(row.grantId) ?? false;
                      const atCap = selectedEligibleCount >= 15 && !checked;
                      const band = row.decision ? row.decision.replace(/_/g, " ") : "";
                      return (
                        <label
                          key={`${row.profileId}-${row.grantId}`}
                          className={`flex cursor-pointer items-start gap-3 rounded-md border bg-background p-2.5 transition-colors hover:bg-muted/40 ${atCap ? "opacity-60" : ""}`}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={atCap}
                            onCheckedChange={(value) => toggleEligibleGrant(row.grantId, value === true)}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium leading-snug">{row.grantName}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {row.funder ? `${row.funder} · ` : ""}
                              Score {Number.isFinite(row.score) ? row.score : "—"}%
                              {band ? ` · ${band}` : ""}
                              {formatAddedAt(row.addedAt) ? ` · Added ${formatAddedAt(row.addedAt)}` : ""}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="space-y-2 pt-1">
                <Label htmlFor="grantRequirementsNotes">Grant requirements & notes (optional)</Label>
                <Textarea
                  id="grantRequirementsNotes"
                  rows={4}
                  placeholder="Paste eligibility text, assessment criteria, word limits, mandatory documents, evaluation priorities, or grants not yet in your workspace…"
                  value={form.grantRequirementsNotes ?? ""}
                  onChange={(event) => update("grantRequirementsNotes", event.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <div className="space-y-4 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                  <Wand2 className="h-4 w-4" />
                </div>
                <div>
                  <Label className="text-base">AI Grant Question Assistant</Label>
                  <p className="mt-1 text-xs leading-5 text-blue-950/75">
                    Paste funder form questions and get editable answers using the selected Business DNA, chosen grants,
                    eligibility reasoning, and any criteria pasted above.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="questionAssistantMode">Assistant mode</Label>
                  <select
                    id="questionAssistantMode"
                    value={questionAssistantMode}
                    onChange={(event) =>
                      setQuestionAssistantMode(
                        event.target.value as "draft_answer" | "evidence_check" | "improve_existing_answer"
                      )
                    }
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="draft_answer">Draft answer</option>
                    <option value="evidence_check">Evidence check</option>
                    <option value="improve_existing_answer">Improve existing answer</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="questionAssistantWordLimit">Word limit (optional)</Label>
                  <Input
                    id="questionAssistantWordLimit"
                    inputMode="numeric"
                    placeholder="e.g. 500"
                    value={questionAssistantWordLimit}
                    onChange={(event) => setQuestionAssistantWordLimit(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="questionAssistantText">Grant form question(s)</Label>
                <Textarea
                  id="questionAssistantText"
                  rows={5}
                  placeholder="Paste one or more questions, for example: Describe the innovation and commercial potential of your project."
                  value={questionAssistantText}
                  onChange={(event) => setQuestionAssistantText(event.target.value)}
                  className="bg-white text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="questionAssistantGuidance">Extra answer guidance (optional)</Label>
                <Textarea
                  id="questionAssistantGuidance"
                  rows={3}
                  placeholder="Add tone, funder priorities, scoring guidance, or points you want included."
                  value={questionAssistantGuidance}
                  onChange={(event) => setQuestionAssistantGuidance(event.target.value)}
                  className="bg-white text-sm"
                />
              </div>
              {questionAssistantMode === "improve_existing_answer" && (
                <div className="space-y-2">
                  <Label htmlFor="questionAssistantExistingAnswer">Existing answer to improve</Label>
                  <Textarea
                    id="questionAssistantExistingAnswer"
                    rows={4}
                    placeholder="Paste the draft you already wrote."
                    value={questionAssistantExistingAnswer}
                    onChange={(event) => setQuestionAssistantExistingAnswer(event.target.value)}
                    className="bg-white text-sm"
                  />
                </div>
              )}

              <Button
                type="button"
                className="w-full gap-2"
                disabled={questionAssistantLoading || !allowed || !questionAssistantText.trim()}
                onClick={generateQuestionAnswers}
              >
                {questionAssistantLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate answer
              </Button>

              {questionAssistantAnswers.length > 0 && (
                <div className="space-y-3">
                  {questionAssistantAnswers.map((answer, index) => (
                    <div key={`${answer.question}-${index}`} className="rounded-md border bg-white p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#071a3a]">{answer.question}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Badge variant="secondary">Confidence: {answer.confidence}</Badge>
                            <Badge variant="outline">Evidence: {answer.evidenceStrength}</Badge>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="gap-1"
                            onClick={() => copyQuestionAnswer(answer)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="gap-1"
                            onClick={() => addAnswerToPackNotes(answer)}
                          >
                            <PlusCircle className="h-3.5 w-3.5" />
                            Add to pack
                          </Button>
                        </div>
                      </div>
                      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{answer.draftAnswer}</p>
                      {answer.rationale && (
                        <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-950">
                          <span className="font-semibold">Why this positioning: </span>
                          {answer.rationale}
                        </p>
                      )}
                      {(answer.missingEvidence.length > 0 || answer.suggestedProfileUpdates.length > 0 || answer.warnings.length > 0) && (
                        <div className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground">
                          {answer.missingEvidence.length > 0 && (
                            <p>
                              <span className="font-semibold text-foreground">Missing evidence: </span>
                              {answer.missingEvidence.join("; ")}
                            </p>
                          )}
                          {answer.suggestedProfileUpdates.length > 0 && (
                            <p>
                              <span className="font-semibold text-foreground">Business DNA updates: </span>
                              {answer.suggestedProfileUpdates.join("; ")}
                            </p>
                          )}
                          {answer.warnings.length > 0 && (
                            <p>
                              <span className="font-semibold text-foreground">Warnings: </span>
                              {answer.warnings.join("; ")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="space-y-2">
                <Label htmlFor="founderName">Founder name</Label>
                <Input id="founderName" value={form.founderName} onChange={(event) => update("founderName", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="founderRole">Founder role</Label>
                <Input id="founderRole" value={form.founderRole} onChange={(event) => update("founderRole", event.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="founderBackground">Founder background</Label>
              <Textarea id="founderBackground" rows={4} value={form.founderBackground} onChange={(event) => update("founderBackground", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="technicalContribution">Technical founder contribution</Label>
              <Textarea id="technicalContribution" rows={4} value={form.technicalContribution} onChange={(event) => update("technicalContribution", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="marketFocus">Market focus</Label>
              <Textarea id="marketFocus" rows={3} value={form.marketFocus} onChange={(event) => update("marketFocus", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="revenueModel">Revenue model</Label>
              <Textarea id="revenueModel" rows={3} value={form.revenueModel} onChange={(event) => update("revenueModel", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pricingAssumptions">Projection assumptions</Label>
              <Textarea id="pricingAssumptions" rows={3} value={form.pricingAssumptions} onChange={(event) => update("pricingAssumptions", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hiringPlan">Hiring and scalability plan</Label>
              <Textarea id="hiringPlan" rows={3} value={form.hiringPlan} onChange={(event) => update("hiringPlan", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="additionalNotes">Additional notes</Label>
              <Textarea id="additionalNotes" rows={3} value={form.additionalNotes} onChange={(event) => update("additionalNotes", event.target.value)} />
            </div>

            <Button type="button" className="w-full gap-2" disabled={loading || !allowed || !form.documentTypes?.length} onClick={generate}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate pitch deck & selected documents
            </Button>
            {loading && (
              <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                <div className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating document
                </div>
                <p className="mt-1 text-xs leading-5">{generationStatus || "Working with OpenAI and saving the pack..."}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4" />
                Generation History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {history.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setSelectedPackId(pack.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                    pack.id === selectedPack?.id ? "border-blue-300 bg-blue-50" : ""
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium">{pack.profileBusinessName ?? "Founder pack"}</span>
                    <Badge variant={pack.id === selectedPack?.id ? "default" : "secondary"}>
                      {documentTypeLabel(pack.documentTypes)}
                    </Badge>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{pack.createdAtLabel}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        {loading ? (
          <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50">
            <CardContent className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
              <div>
                <p className="text-lg font-semibold">Generating your selected document pack</p>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  {generationStatus || "OpenAI is structuring the document around your company DNA, selected grant context, and chosen outputs."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : selectedPack && contentIsReady(selectedPack.content) ? (
          <PackDocument pack={selectedPack} />
        ) : (
          <Card>
            <CardContent className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="font-medium">No pack generated yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Complete the inputs and generate a pack to create pitch decks, business plans, grant drafts, budgets, impact plans, and founder positioning.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
    </div>
  );
}
