"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { step6Schema, type Step6Data } from "@/lib/validations/profile";

const FIELDS: { name: keyof Step6Data; label: string; placeholder: string; hint: string }[] = [
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
    hint: "A reusable project title the AI can adapt per grant.",
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
    hint: "Helps the AI answer objectives, deliverables, and success criteria.",
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
    hint: "Used for timeline/date questions; the AI will avoid exact dates if uncertain.",
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

type PersonRow = {
  id: string;
  name: string;
  role: string;
  profile: string;
  linkedIn?: string;
};

function newPerson(overrides?: Partial<PersonRow>): PersonRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    role: "",
    profile: "",
    linkedIn: "",
    ...overrides,
  };
}

function splitPersonLine(value: string): Omit<PersonRow, "id"> {
  const parts = value
    .split(/\s+-\s+|\s+–\s+|,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const linkedInIndex = parts.findIndex((part) => /^linkedin:/i.test(part) || /^https?:\/\/(www\.)?linkedin\.com/i.test(part));
  const linkedIn = linkedInIndex >= 0 ? parts.slice(linkedInIndex).join(" - ").replace(/^linkedin:\s*/i, "") : "";
  const usable = linkedInIndex >= 0 ? parts.slice(0, linkedInIndex) : parts;
  return {
    name: usable[0] ?? "",
    role: usable[1] ?? "",
    profile: usable.slice(2).join(" - "),
    linkedIn,
  };
}

function splitNameRole(value: string): { name: string; role: string } {
  const person = splitPersonLine(value);
  return { name: person.name, role: person.role };
}

function parsePeople(text: string | undefined | null): PersonRow[] {
  const lines = String(text ?? "")
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [newPerson()];
  return lines.map((line) => {
    return newPerson(splitPersonLine(line));
  });
}

function parseDirectors(names: string | undefined | null, profiles: string | undefined | null): PersonRow[] {
  const nameRows = String(names ?? "")
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitNameRole);
  const profileRows = String(profiles ?? "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const count = Math.max(nameRows.length, profileRows.length);
  if (count === 0) return [newPerson()];

  return Array.from({ length: count }, (_, index) => {
    const parsedProfile = splitPersonLine(profileRows[index] ?? "");
    const nameRow = nameRows[index] ?? { name: parsedProfile.name, role: parsedProfile.role };
    return newPerson({
      name: nameRow.name,
      role: nameRow.role,
      profile: parsedProfile.profile || profileRows[index] || "",
      linkedIn: parsedProfile.linkedIn,
    });
  });
}

function serializeNames(people: PersonRow[]): string {
  return people
    .map((person) => [person.name, person.role].filter(Boolean).join(" - ").trim())
    .filter(Boolean)
    .join("; ");
}

function serializeProfiles(people: PersonRow[]): string {
  return people
    .map((person) => {
      const header = [person.name, person.role].filter(Boolean).join(" - ").trim();
      const body = person.profile.trim();
      const linkedIn = person.linkedIn?.trim() ? `LinkedIn: ${person.linkedIn.trim()}` : "";
      return [header, body, linkedIn].filter(Boolean).join(" - ");
    })
    .filter(Boolean)
    .join("\n");
}

interface Step6Props {
  defaultValues: Step6Data;
  onSubmit: (data: Step6Data) => Promise<boolean>;
  onBack: () => void;
  onComplete: () => void;
  isPending?: boolean;
}

export function Step6GrantReadiness({ defaultValues, onSubmit, onBack, onComplete, isPending }: Step6Props) {
  const [directors, setDirectors] = useState<PersonRow[]>(() =>
    parseDirectors(defaultValues.directorNames, defaultValues.directorProfiles)
  );
  const [teamMembers, setTeamMembers] = useState<PersonRow[]>(() =>
    parsePeople(defaultValues.teamMembers)
  );
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

  function syncDirectors(next: PersonRow[]) {
    setDirectors(next);
    form.setValue("directorNames", serializeNames(next), { shouldDirty: true });
    form.setValue("directorProfiles", serializeProfiles(next), { shouldDirty: true });
  }

  function syncTeam(next: PersonRow[]) {
    setTeamMembers(next);
    form.setValue("teamMembers", serializeProfiles(next), { shouldDirty: true });
  }

  function updateDirector(index: number, patch: Partial<PersonRow>) {
    syncDirectors(directors.map((person, i) => (i === index ? { ...person, ...patch } : person)));
  }

  function updateTeamMember(index: number, patch: Partial<PersonRow>) {
    syncTeam(teamMembers.map((person, i) => (i === index ? { ...person, ...patch } : person)));
  }

  async function handleSave(data: Step6Data) {
    await onSubmit({
      ...data,
      directorNames: serializeNames(directors),
      directorProfiles: serializeProfiles(directors),
      teamMembers: serializeProfiles(teamMembers),
    });
  }

  async function handleSaveAndComplete(data: Step6Data) {
    const saved = await onSubmit({
      ...data,
      directorNames: serializeNames(directors),
      directorProfiles: serializeProfiles(directors),
      teamMembers: serializeProfiles(teamMembers),
    });
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

        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Directors / Founders</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Add each director, founder, or senior leader separately. GrantsCopilot uses these details for director, capability, governance, and key personnel questions.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => syncDirectors([...directors, newPerson()])}
            >
              <Plus className="h-4 w-4" />
              Add director
            </Button>
          </div>

          <div className="space-y-3">
            {directors.map((person, index) => (
              <div key={person.id} className="rounded-md border bg-background p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FormLabel>Name</FormLabel>
                    <Input
                      value={person.name}
                      onChange={(event) => updateDirector(index, { name: event.target.value })}
                      placeholder="e.g. Michael Orji"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FormLabel>Role</FormLabel>
                    <Input
                      value={person.role}
                      onChange={(event) => updateDirector(index, { role: event.target.value })}
                      placeholder="e.g. Technical founder / CEO"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <FormLabel>Profile, responsibilities, track record</FormLabel>
                    <Textarea
                      value={person.profile}
                      onChange={(event) => updateDirector(index, { profile: event.target.value })}
                      placeholder="Experience, qualifications, responsibilities, delivery role, awards, domain expertise..."
                      rows={3}
                      className="resize-y"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <FormLabel>LinkedIn / profile URL</FormLabel>
                    <Input
                      value={person.linkedIn ?? ""}
                      onChange={(event) => updateDirector(index, { linkedIn: event.target.value })}
                      placeholder="https://www.linkedin.com/in/..."
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-destructive hover:text-destructive"
                    disabled={directors.length === 1}
                    onClick={() => syncDirectors(directors.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Team Members / Key Staff</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Add non-director staff, contractors, advisers, or delivery leads who strengthen applications where funders ask about the team.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => syncTeam([...teamMembers, newPerson()])}
            >
              <Plus className="h-4 w-4" />
              Add team member
            </Button>
          </div>

          <div className="space-y-3">
            {teamMembers.map((person, index) => (
              <div key={person.id} className="rounded-md border bg-background p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FormLabel>Name</FormLabel>
                    <Input
                      value={person.name}
                      onChange={(event) => updateTeamMember(index, { name: event.target.value })}
                      placeholder="e.g. Jane Smith"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FormLabel>Role</FormLabel>
                    <Input
                      value={person.role}
                      onChange={(event) => updateTeamMember(index, { role: event.target.value })}
                      placeholder="e.g. Operations Manager"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <FormLabel>Expertise and delivery contribution</FormLabel>
                    <Textarea
                      value={person.profile}
                      onChange={(event) => updateTeamMember(index, { profile: event.target.value })}
                      placeholder="Relevant experience, responsibilities, certifications, delivery role, technical/domain strengths..."
                      rows={3}
                      className="resize-y"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <FormLabel>LinkedIn / profile URL</FormLabel>
                    <Input
                      value={person.linkedIn ?? ""}
                      onChange={(event) => updateTeamMember(index, { linkedIn: event.target.value })}
                      placeholder="https://www.linkedin.com/in/..."
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-destructive hover:text-destructive"
                    disabled={teamMembers.length === 1}
                    onClick={() => syncTeam(teamMembers.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

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
