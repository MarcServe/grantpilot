"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Download, FileText, Loader2, Lock, Sparkles } from "lucide-react";
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
}

interface ProfileOption {
  id: string;
  businessName: string;
  sector: string;
  founderBackground?: string | null;
  teamExpertise?: string | null;
  financialProjections?: string | null;
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
  if (!types?.length) return "Full pack";
  if (types.length === FOUNDER_PACK_DOCUMENT_TYPES.length) return "Full pack";
  if (types.length === 1) {
    return FOUNDER_PACK_DOCUMENT_TYPES.find((item) => item.value === types[0])?.label ?? "Document";
  }
  return `${types.length} documents`;
}

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
  const content = pack.content;
  const pitchDeck = content.pitchDeck ?? [];
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
  const documentTypes =
    pack.documentTypes?.length
      ? pack.documentTypes
      : FOUNDER_PACK_DOCUMENT_TYPES.map((item) => item.value);
  const includes = (type: FounderPackDocumentType) => documentTypes.includes(type);

  return (
    <Card className="print:border-0 print:shadow-none">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Founder Funding Pack
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Generated {pack.createdAtLabel}</p>
        </div>
        <Button type="button" variant="outline" className="gap-2 print:hidden" onClick={() => window.print()}>
          <Download className="h-4 w-4" />
          Export / print
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
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
            <div className="grid gap-3">
              {pitchDeck.map((slide, index) => (
                <div key={`${slide.title}-${index}`} className="rounded-md border bg-background p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Slide {index + 1}</p>
                      <h3 className="mt-1 text-base font-semibold">{slide.title}</h3>
                    </div>
                    {slide.objective && (
                      <Badge variant="secondary" className="w-fit whitespace-normal text-left">
                        {slide.objective}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3">
                    <BulletList items={slide.bullets} />
                  </div>
                  {slide.speakerNotes && (
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                      <span className="font-medium text-foreground">Speaker notes: </span>
                      {slide.speakerNotes}
                    </p>
                  )}
                  {slide.visualDirection && (
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                      <span className="font-medium text-foreground">Design direction: </span>
                      {slide.visualDirection}
                    </p>
                  )}
                </div>
              ))}
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
  packs,
  allowed,
}: {
  profiles: ProfileOption[];
  packs: PackSummary[];
  allowed: boolean;
}) {
  const router = useRouter();
  const [history, setHistory] = useState(packs);
  const [selectedPackId, setSelectedPackId] = useState(packs[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FounderPackInputs & { profileId: string }>({
    profileId: profiles[0]?.id ?? "",
    founderName: "",
    founderRole: "Technical founder / CEO",
    founderBackground: profiles[0]?.founderBackground ?? "",
    technicalContribution: profiles[0]?.teamExpertise ?? "",
    targetUse: "innovator_founder_visa",
    documentTypes: FOUNDER_PACK_DOCUMENT_TYPES.map((item) => item.value),
    marketFocus: "UK SMEs, startups, councils, incubators, and funding support organisations.",
    revenueModel: "SaaS subscriptions for SMEs, premium founder packs, and B2B licensing for councils, incubators, and accelerators.",
    pricingAssumptions: "Free trial for initial onboarding, paid Pro and Business plans, with optional premium document pack generation.",
    hiringPlan: "Founder-led product development first, then hire AI engineering, grant operations, customer success, and partnerships roles as revenue grows.",
    additionalNotes: "",
  });

  const selectedPack = useMemo(
    () => history.find((pack) => pack.id === selectedPackId) ?? history[0] ?? null,
    [history, selectedPackId]
  );

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

  function selectProfile(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId);
    setForm((prev) => ({
      ...prev,
      profileId,
      founderBackground: prev.founderBackground || profile?.founderBackground || "",
      technicalContribution: prev.technicalContribution || profile?.teamExpertise || "",
      pricingAssumptions: prev.pricingAssumptions || profile?.financialProjections || "",
    }));
  }

  async function generate() {
    if (!allowed) {
      toast.error("Upgrade to Pro or Business to generate Founder Funding Packs.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/founder-pack/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not generate pack");
        return;
      }
      const pack = data.pack as { id: string; createdAt: string; content: FounderPackContent };
      const next: PackSummary = {
        id: pack.id,
        createdAt: pack.createdAt,
        createdAtLabel: "just now",
        type: form.targetUse,
        documentTypes: form.documentTypes,
        content: pack.content,
      };
      setHistory((prev) => [next, ...prev]);
      setSelectedPackId(next.id);
      toast.success("Founder Funding Pack generated");
      router.refresh();
    } catch {
      toast.error("Could not generate pack");
    } finally {
      setLoading(false);
    }
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
              Generate selected documents
            </Button>
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pack History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {history.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setSelectedPackId(pack.id)}
                  className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span>{pack.createdAtLabel}</span>
                  <Badge variant={pack.id === selectedPack?.id ? "default" : "secondary"}>
                    {documentTypeLabel(pack.documentTypes)}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        {selectedPack && contentIsReady(selectedPack.content) ? (
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
  );
}
