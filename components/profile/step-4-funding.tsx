"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  step4Schema,
  type Step4Data,
  FUNDING_PURPOSES,
} from "@/lib/validations/profile";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  Lightbulb,
  Sparkles,
  Target,
  Wand2,
  Star,
  Brain,
  Wrench,
  Users,
  TrendingUp,
  Briefcase,
  Leaf,
  GraduationCap,
  Globe,
  FlaskConical,
  Shield,
  MoreHorizontal,
  DollarSign,
  Megaphone,
  Cpu,
} from "lucide-react";
import { toast } from "sonner";

interface Step4Props {
  defaultValues: Partial<Step4Data>;
  onSubmit: (data: Step4Data) => Promise<void>;
  onBack: () => void;
  isPending: boolean;
  profileContext?: {
    businessName: string;
    sector: string;
    description: string;
    missionStatement?: string;
    employeeCount?: number | null;
    annualRevenue?: number | null;
  };
}

const PURPOSE_ICONS: Record<string, React.ReactNode> = {
  "Marketing & Customer Acquisition": <Megaphone className="h-3.5 w-3.5" />,
  "Product Development": <Wrench className="h-3.5 w-3.5" />,
  "Research & Development": <Brain className="h-3.5 w-3.5" />,
  "Hiring & Team Expansion": <Users className="h-3.5 w-3.5" />,
  "Equipment & Infrastructure": <Briefcase className="h-3.5 w-3.5" />,
  "Business Expansion / New Markets": <TrendingUp className="h-3.5 w-3.5" />,
  "Working Capital": <DollarSign className="h-3.5 w-3.5" />,
  "Technology & Software": <Cpu className="h-3.5 w-3.5" />,
  "Training & Skills Development": <GraduationCap className="h-3.5 w-3.5" />,
  "Sustainability & Green Initiatives": <Leaf className="h-3.5 w-3.5" />,
  "Export & International Growth": <Globe className="h-3.5 w-3.5" />,
  "Prototyping & Testing": <FlaskConical className="h-3.5 w-3.5" />,
  "IP & Patent Filing": <Shield className="h-3.5 w-3.5" />,
  "Other": <MoreHorizontal className="h-3.5 w-3.5" />,
};

const PURPOSE_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "Product & Innovation",
    items: ["Product Development", "Research & Development", "Prototyping & Testing", "Technology & Software"],
  },
  {
    label: "Business Growth",
    items: ["Hiring & Team Expansion", "Business Expansion / New Markets", "Export & International Growth"],
  },
  {
    label: "Operations",
    items: ["Marketing & Customer Acquisition", "Working Capital", "Equipment & Infrastructure"],
  },
  {
    label: "Strategic",
    items: ["Sustainability & Green Initiatives", "Training & Skills Development", "IP & Patent Filing", "Other"],
  },
];

interface AIRecommendation {
  recommendedPurposes: string[];
  fundingRangeMin: number;
  fundingRangeMax: number;
  fundingRangeReason: string;
  strategyHint: string;
  compatibleGrantTypes: string[];
}

export function Step4Funding({
  defaultValues,
  onSubmit,
  onBack,
  isPending,
  profileContext,
}: Step4Props) {
  const form = useForm<Step4Data>({
    resolver: zodResolver(step4Schema),
    defaultValues: {
      fundingMin: defaultValues.fundingMin ?? undefined,
      fundingMax: defaultValues.fundingMax ?? undefined,
      fundingPurposes: defaultValues.fundingPurposes ?? [],
      fundingDetails: defaultValues.fundingDetails ?? "",
    },
  });

  const [aiRecommendation, setAiRecommendation] = useState<AIRecommendation | null>(null);
  const [loadingAI, setLoadingAI] = useState<string | null>(null);
  const [, setGeneratedSummary] = useState<string | null>(null);

  const callAI = useCallback(async (action: string, extra?: Record<string, unknown>) => {
    if (!profileContext?.businessName || !profileContext?.sector) {
      toast.error("Complete your business profile first (steps 1-2)");
      return null;
    }
    setLoadingAI(action);
    try {
      const res = await fetch("/api/profile/funding-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          businessName: profileContext.businessName,
          sector: profileContext.sector,
          description: profileContext.description,
          missionStatement: profileContext.missionStatement,
          employeeCount: profileContext.employeeCount,
          annualRevenue: profileContext.annualRevenue,
          selectedPurposes: form.getValues("fundingPurposes"),
          fundingMin: form.getValues("fundingMin"),
          fundingMax: form.getValues("fundingMax"),
          ...extra,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "AI request failed");
        return null;
      }
      return await res.json();
    } catch {
      toast.error("Something went wrong");
      return null;
    } finally {
      setLoadingAI(null);
    }
  }, [profileContext, form]);

  async function handleGetRecommendations() {
    const result = await callAI("recommend");
    if (!result) return;
    setAiRecommendation(result);
    toast.success("AI recommendations ready");
  }

  async function handleApplyRecommendations() {
    if (!aiRecommendation) return;
    if (aiRecommendation.recommendedPurposes?.length) {
      form.setValue("fundingPurposes", aiRecommendation.recommendedPurposes, { shouldValidate: true });
    }
    if (aiRecommendation.fundingRangeMin) {
      form.setValue("fundingMin", aiRecommendation.fundingRangeMin, { shouldValidate: true });
    }
    if (aiRecommendation.fundingRangeMax) {
      form.setValue("fundingMax", aiRecommendation.fundingRangeMax, { shouldValidate: true });
    }
    toast.success("Recommendations applied — review and adjust as needed");
  }

  async function handleGenerateSummary() {
    const result = await callAI("generate_summary");
    if (!result?.summary) return;
    setGeneratedSummary(result.summary);
    form.setValue("fundingDetails", result.summary, { shouldValidate: true });
    toast.success("Funding summary generated");
  }

  function toPlanLine(item: unknown): string {
    if (typeof item === "string") return item;
    if (item != null && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const s =
        (typeof o.text === "string" && o.text) ||
        (typeof o.milestone === "string" && o.milestone) ||
        (typeof o.content === "string" && o.content) ||
        (typeof o.title === "string" && o.title) ||
        (typeof o.description === "string" && o.description);
      if (s) return s;
    }
    return String(item ?? "");
  }

  async function handleGeneratePlan() {
    const result = await callAI("generate_plan");
    if (!result) return;
    const milestones = (result.milestones ?? []).map((m: unknown, i: number) => `${i + 1}. ${toPlanLine(m)}`);
    const outcomes = (result.outcomes ?? []).map((o: unknown) => `• ${toPlanLine(o)}`);
    const planText = [
      result.summary ?? "",
      "",
      "Key Milestones:",
      ...milestones,
      "",
      "Expected Outcomes:",
      ...outcomes,
    ].join("\n");
    setGeneratedSummary(planText);
    form.setValue("fundingDetails", planText, { shouldValidate: true });
    toast.success("Funding plan generated");
  }

  const watchedPurposes = form.watch("fundingPurposes") ?? [];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {profileContext?.businessName && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGetRecommendations}
              disabled={!!loadingAI}
              className="gap-2"
            >
              {loadingAI === "recommend" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              AI Funding Strategy
            </Button>
          </div>
        )}

        {aiRecommendation && (
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
            <CardContent className="space-y-4 pt-4">
              <div className="flex items-start gap-2">
                <Lightbulb className="mt-0.5 h-4 w-4 text-blue-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Funding Strategy Insight</p>
                  <p className="mt-1 text-sm text-blue-800 dark:text-blue-200">{aiRecommendation.strategyHint}</p>
                </div>
              </div>

              {aiRecommendation.fundingRangeReason && (
                <div className="flex items-start gap-2">
                  <Target className="mt-0.5 h-4 w-4 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Suggested range: £{aiRecommendation.fundingRangeMin?.toLocaleString()} – £{aiRecommendation.fundingRangeMax?.toLocaleString()}
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">{aiRecommendation.fundingRangeReason}</p>
                  </div>
                </div>
              )}

              {aiRecommendation.compatibleGrantTypes?.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-blue-900 dark:text-blue-100">Eligible Grant Categories</p>
                  <div className="flex flex-wrap gap-1.5">
                    {aiRecommendation.compatibleGrantTypes.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <Button
                type="button"
                size="sm"
                onClick={handleApplyRecommendations}
                className="gap-2"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Apply AI Recommendations
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          <FormLabel>Funding Range (GBP)</FormLabel>
          <p className="text-xs text-muted-foreground">
            Most early-stage innovation grants fall between £25,000 – £250,000. Choose a range aligned with your development stage.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="fundingMin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm text-muted-foreground">Minimum</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="10000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fundingMax"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm text-muted-foreground">Maximum</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="500000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <FormField
          control={form.control}
          name="fundingPurposes"
          render={() => (
            <FormItem>
              <FormLabel>How will you use the funding?</FormLabel>
              <p className="text-sm text-muted-foreground">Select all that apply</p>
              <div className="space-y-5 mt-3">
                {PURPOSE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.items.filter((p) => FUNDING_PURPOSES.includes(p as typeof FUNDING_PURPOSES[number])).map((purpose) => {
                        const isRecommended = aiRecommendation?.recommendedPurposes?.includes(purpose);
                        return (
                          <FormField
                            key={purpose}
                            control={form.control}
                            name="fundingPurposes"
                            render={({ field }) => (
                              <FormItem className={`flex items-center gap-2 space-y-0 rounded-md border p-2 transition-colors ${isRecommended ? "border-blue-200 bg-blue-50/50 dark:border-blue-800" : ""} ${field.value?.includes(purpose) ? "border-primary/50 bg-primary/5" : ""}`}>
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(purpose)}
                                    onCheckedChange={(checked) => {
                                      const current = field.value ?? [];
                                      field.onChange(
                                        checked
                                          ? [...current, purpose]
                                          : current.filter((v: string) => v !== purpose)
                                      );
                                    }}
                                  />
                                </FormControl>
                                <span className="text-muted-foreground">{PURPOSE_ICONS[purpose]}</span>
                                <FormLabel className="flex-1 text-sm font-normal cursor-pointer">
                                  {purpose}
                                </FormLabel>
                                {isRecommended && (
                                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                                )}
                              </FormItem>
                            )}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="fundingDetails"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>
                  Funding Use Summary{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </FormLabel>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateSummary}
                    disabled={!!loadingAI || watchedPurposes.length === 0}
                    className="gap-1.5 text-xs h-7"
                  >
                    {loadingAI === "generate_summary" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Generate Summary
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGeneratePlan}
                    disabled={!!loadingAI || watchedPurposes.length === 0}
                    className="gap-1.5 text-xs h-7"
                  >
                    {loadingAI === "generate_plan" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                    Generate Plan
                  </Button>
                </div>
              </div>
              <FormControl>
                <Textarea
                  placeholder={"Example:\n• Build product v1 platform\n• Deploy pilot with 3 organisations\n• Complete testing and validation\n• Launch scalable SaaS platform"}
                  rows={6}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <p className="text-xs text-muted-foreground">
          Grants-Copilot uses this information to match your business with the most relevant grants and prepare stronger applications automatically.
        </p>

        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Funding Strategy &rarr;
          </Button>
        </div>
      </form>
    </Form>
  );
}
