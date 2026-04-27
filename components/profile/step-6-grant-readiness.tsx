"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import { step6Schema, type Step6Data } from "@/lib/validations/profile";

const FIELDS: { name: keyof Step6Data; label: string; placeholder: string; hint: string }[] = [
  {
    name: "directorNames",
    label: "Director / Founder Names",
    placeholder: "e.g. Jane Smith, CEO & Co-founder; Ahmed Khan, Technical Director",
    hint: "Names and roles of directors, founders, or senior leaders. Used for director/team questions on forms.",
  },
  {
    name: "directorProfiles",
    label: "Director / Founder Profiles",
    placeholder: "One per line, e.g. Jane Smith - CEO & Co-founder - 12 years in edtech, scaled SaaS to £2m ARR, LinkedIn: ...",
    hint: "Add every director/founder separately. Include name, role, experience, qualifications, responsibilities, LinkedIn, and relevant track record.",
  },
  {
    name: "teamMembers",
    label: "Team Members / Key Staff",
    placeholder: "One per line, e.g. Ahmed Khan - Technical Lead - ex-NHS data engineer, owns integrations and data security\nPriya Patel - Operations Manager - 8 years delivering public-sector programmes",
    hint: "Add all non-director team members who may strengthen grant applications. Claude uses every person listed when forms ask about team, capability, delivery roles, or key personnel.",
  },
  {
    name: "boardMembers",
    label: "Board Members / Trustees",
    placeholder: "List board members, trustees, advisers, governance roles, and relevant expertise...",
    hint: "Useful for charity, foundation, governance, and due-diligence questions.",
  },
  {
    name: "founderBackground",
    label: "Founder Background",
    placeholder: "Founder story, prior experience, domain expertise, lived experience, previous exits...",
    hint: "Used when forms ask why your leadership team is credible.",
  },
  {
    name: "projectTitle",
    label: "Default Project Title",
    placeholder: "e.g. AI-enabled grant readiness platform for underserved SMEs",
    hint: "A reusable project title Claude can adapt per grant.",
  },
  {
    name: "projectSummary",
    label: "Project Summary",
    placeholder: "Short summary of the project you usually seek funding for...",
    hint: "Used for short application summaries and elevator pitches.",
  },
  {
    name: "problemStatement",
    label: "Problem Statement",
    placeholder: "What problem are you solving, for whom, and why does it matter?",
    hint: "Core narrative for most grant applications.",
  },
  {
    name: "proposedSolution",
    label: "Proposed Solution",
    placeholder: "Describe your solution, product, service, or delivery model...",
    hint: "Used for project description and innovation sections.",
  },
  {
    name: "projectObjectives",
    label: "Project Objectives",
    placeholder: "List 3-5 objectives with measurable targets...",
    hint: "Helps Claude answer objectives, deliverables, and success criteria.",
  },
  {
    name: "expectedOutcomes",
    label: "Expected Outcomes",
    placeholder: "Expected outputs, outcomes, beneficiaries, revenue, jobs, environmental/social results...",
    hint: "Used for outcome and impact questions.",
  },
  {
    name: "projectStartDate",
    label: "Typical Project Start Date",
    placeholder: "e.g. 2026-06-01 or 'within 8 weeks of award'",
    hint: "Used for timeline/date questions; Claude will avoid exact dates if uncertain.",
  },
  {
    name: "projectEndDate",
    label: "Typical Project End Date",
    placeholder: "e.g. 2027-03-31 or '9 months after project start'",
    hint: "Used for project duration and schedule fields.",
  },
  {
    name: "beneficiaryGroups",
    label: "Beneficiary Groups",
    placeholder: "Who benefits? SMEs, charities, students, patients, local communities, rural businesses...",
    hint: "Used for impact and eligibility questions.",
  },
  {
    name: "beneficiaryCount",
    label: "Expected Number of Beneficiaries",
    placeholder: "e.g. 250",
    hint: "Used for quantitative social impact questions.",
  },
  {
    name: "geographicImpact",
    label: "Geographic Impact",
    placeholder: "Where the project delivers impact: local authority, region, UK-wide, EU-LAC regions...",
    hint: "Useful for location eligibility and place-based funding.",
  },
  {
    name: "diversityInclusionImpact",
    label: "Diversity & Inclusion Impact",
    placeholder: "How the project supports inclusion, accessibility, underserved groups, fair access...",
    hint: "Used for equality, diversity, and inclusion questions.",
  },
  {
    name: "jobsCreated",
    label: "Jobs Created / Safeguarded",
    placeholder: "e.g. 5 new FTE roles and 2 safeguarded roles",
    hint: "Used for economic impact questions.",
  },
  {
    name: "revenueGrowthExpected",
    label: "Expected Revenue Growth",
    placeholder: "e.g. Projected £500k ARR within 24 months, 30% YoY growth...",
    hint: "Used for economic impact and commercial potential.",
  },
  {
    name: "co2Reduction",
    label: "CO2 / Environmental Reduction",
    placeholder: "e.g. Estimated 12 tonnes CO2e saved annually through route optimisation...",
    hint: "Important for net-zero and environmental grants.",
  },
  {
    name: "productivityImprovements",
    label: "Productivity Improvements",
    placeholder: "Expected time, cost, throughput, automation, or efficiency gains...",
    hint: "Used for innovation and business productivity grants.",
  },
  {
    name: "milestones",
    label: "Milestones",
    placeholder: "Month 1: discovery; Month 3: prototype; Month 6: pilot; Month 9: launch...",
    hint: "Used for timelines, Gantt-style questions, and work packages.",
  },
  {
    name: "deliverables",
    label: "Deliverables",
    placeholder: "Prototype, pilot report, training materials, evaluation report, platform release...",
    hint: "Used when funders ask what will be delivered.",
  },
  {
    name: "partnerOrganisations",
    label: "Partner Organisations",
    placeholder: "List partners, collaborators, universities, local authorities, charities, customers...",
    hint: "Used for partnership and collaboration sections.",
  },
  {
    name: "collaborationDetails",
    label: "Collaboration Details",
    placeholder: "Explain each partner's role, contribution, letters of support, and delivery responsibilities...",
    hint: "Used for collaboration and consortium questions.",
  },
  {
    name: "risksMitigation",
    label: "Risks & Mitigation",
    placeholder: "Technical, commercial, delivery, regulatory risks and how you will manage them...",
    hint: "Used for risk sections.",
  },
  {
    name: "exitStrategy",
    label: "Exit / Sustainability Strategy",
    placeholder: "How the project continues after funding, revenue model, adoption plan, long-term ownership...",
    hint: "Used for sustainability and post-grant continuation questions.",
  },
  {
    name: "projectSustainabilityPlan",
    label: "Project Sustainability Plan",
    placeholder: "Operational, financial, environmental, and social sustainability beyond the funded period...",
    hint: "Used for sustainability-plan questions.",
  },
  {
    name: "keyAchievements",
    label: "Key Achievements & Milestones",
    placeholder: "e.g. Won Innovate UK Smart Grant 2024, grew revenue 300% YoY, secured NHS pilot contract, 5 patents filed…",
    hint: "Awards, growth milestones, notable contracts, media features. The AI highlights these when they align with grant criteria.",
  },
  {
    name: "socialImpact",
    label: "Social Impact",
    placeholder: "e.g. Created 45 jobs in underserved areas, trained 200+ young people in digital skills, reduced food waste by 30 tonnes…",
    hint: "Who you help, outcomes achieved, beneficiary numbers. Critical for social impact and charity-focused grants.",
  },
  {
    name: "innovationCapabilities",
    label: "Innovation & R&D",
    placeholder: "e.g. Proprietary AI algorithm for fraud detection, TRL 7, 3 active patents, partnerships with Imperial College London…",
    hint: "Your R&D approach, technology readiness, IP portfolio, research partnerships. Used for innovation and tech grants.",
  },
  {
    name: "sustainabilityInitiatives",
    label: "Sustainability & ESG",
    placeholder: "e.g. Carbon-neutral operations since 2023, circular packaging model, B Corp certified, 40% reduction in water usage…",
    hint: "Green credentials, ESG metrics, circular economy practices. Essential for environmental and net-zero grants.",
  },
  {
    name: "communityEngagement",
    label: "Community & Partnerships",
    placeholder: "e.g. Partner with 12 local charities, STEM outreach in 8 schools, anchor institution in Manchester, member of Northern Powerhouse…",
    hint: "Local partnerships, community programmes, stakeholder relationships. Strengthens regional and community grants.",
  },
  {
    name: "teamExpertise",
    label: "Team Expertise",
    placeholder: "e.g. CEO: 15 years in cleantech, CTO: ex-Google AI lead, advisory board includes Prof. Smith (Oxford), team of 12 PhDs…",
    hint: "Key people, qualifications, domain expertise. Many grants score heavily on team capability.",
  },
];

interface Step6Props {
  defaultValues: Step6Data;
  onSubmit: (data: Step6Data) => Promise<boolean>;
  onBack: () => void;
  onComplete: () => void;
  isPending?: boolean;
}

export function Step6GrantReadiness({ defaultValues, onSubmit, onBack, onComplete, isPending }: Step6Props) {
  const form = useForm<Step6Data>({
    resolver: zodResolver(step6Schema),
    defaultValues: {
      directorNames: defaultValues.directorNames ?? "",
      directorProfiles: defaultValues.directorProfiles ?? "",
      teamMembers: defaultValues.teamMembers ?? "",
      boardMembers: defaultValues.boardMembers ?? "",
      founderBackground: defaultValues.founderBackground ?? "",
      projectTitle: defaultValues.projectTitle ?? "",
      projectSummary: defaultValues.projectSummary ?? "",
      problemStatement: defaultValues.problemStatement ?? "",
      proposedSolution: defaultValues.proposedSolution ?? "",
      projectObjectives: defaultValues.projectObjectives ?? "",
      expectedOutcomes: defaultValues.expectedOutcomes ?? "",
      projectStartDate: defaultValues.projectStartDate ?? "",
      projectEndDate: defaultValues.projectEndDate ?? "",
      beneficiaryGroups: defaultValues.beneficiaryGroups ?? "",
      beneficiaryCount: defaultValues.beneficiaryCount ?? "",
      geographicImpact: defaultValues.geographicImpact ?? "",
      diversityInclusionImpact: defaultValues.diversityInclusionImpact ?? "",
      jobsCreated: defaultValues.jobsCreated ?? "",
      revenueGrowthExpected: defaultValues.revenueGrowthExpected ?? "",
      co2Reduction: defaultValues.co2Reduction ?? "",
      productivityImprovements: defaultValues.productivityImprovements ?? "",
      milestones: defaultValues.milestones ?? "",
      deliverables: defaultValues.deliverables ?? "",
      partnerOrganisations: defaultValues.partnerOrganisations ?? "",
      collaborationDetails: defaultValues.collaborationDetails ?? "",
      risksMitigation: defaultValues.risksMitigation ?? "",
      exitStrategy: defaultValues.exitStrategy ?? "",
      projectSustainabilityPlan: defaultValues.projectSustainabilityPlan ?? "",
      socialImpact: defaultValues.socialImpact ?? "",
      innovationCapabilities: defaultValues.innovationCapabilities ?? "",
      sustainabilityInitiatives: defaultValues.sustainabilityInitiatives ?? "",
      communityEngagement: defaultValues.communityEngagement ?? "",
      keyAchievements: defaultValues.keyAchievements ?? "",
      teamExpertise: defaultValues.teamExpertise ?? "",
    },
  });

  async function handleSave(data: Step6Data) {
    await onSubmit(data);
  }

  async function handleSaveAndComplete(data: Step6Data) {
    const saved = await onSubmit(data);
    if (saved) onComplete();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSaveAndComplete)} className="space-y-5">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
          <strong>Why this matters:</strong> Grant applications ask about impact, innovation,
          sustainability, and team strength. The more detail you provide here, the better
          GrantsCopilot can tailor each application to match what that specific funder cares about
          — instead of writing generic answers.
        </div>

        {FIELDS.map((f) => (
          <FormField
            key={f.name}
            control={form.control}
            name={f.name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{f.label}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    placeholder={f.placeholder}
                    rows={3}
                    className="resize-y"
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">{f.hint}</p>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={form.handleSubmit(handleSave)}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Page
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Complete Profile
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
