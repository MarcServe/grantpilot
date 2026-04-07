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
  onSubmit: (data: Step6Data) => Promise<void>;
  onBack: () => void;
  onComplete: () => void;
  isPending?: boolean;
}

export function Step6GrantReadiness({ defaultValues, onSubmit, onBack, onComplete, isPending }: Step6Props) {
  const form = useForm<Step6Data>({
    resolver: zodResolver(step6Schema),
    defaultValues: {
      socialImpact: defaultValues.socialImpact ?? "",
      innovationCapabilities: defaultValues.innovationCapabilities ?? "",
      sustainabilityInitiatives: defaultValues.sustainabilityInitiatives ?? "",
      communityEngagement: defaultValues.communityEngagement ?? "",
      keyAchievements: defaultValues.keyAchievements ?? "",
      teamExpertise: defaultValues.teamExpertise ?? "",
    },
  });

  async function handleSaveAndComplete(data: Step6Data) {
    await onSubmit(data);
    onComplete();
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

        <div className="flex justify-between pt-2">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save & Finish
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
