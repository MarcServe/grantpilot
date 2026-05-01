"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Step1Basics } from "./step-1-basics";
import { Step2Description } from "./step-2-description";
import { Step3Financials } from "./step-3-financials";
import { Step4Funding } from "./step-4-funding";
import { Step5Documents } from "./step-5-documents";
import { Step6GrantReadiness } from "./step-6-grant-readiness";
import { CompanyDnaAutofill } from "./company-dna-autofill";
import {
  saveStep1,
  saveStep2,
  saveStep3,
  saveStep4,
  saveStep6,
  removeDocument,
} from "@/app/(dashboard)/profile/actions";
import type {
  Step1Data,
  Step2Data,
  Step3Data,
  Step4Data,
  Step6Data,
} from "@/lib/validations/profile";

interface ProfileData {
  id: string;
  businessName: string;
  tradingName?: string | null;
  businessType?: string | null;
  registrationNumber: string | null;
  charityNumber?: string | null;
  vatNumber?: string | null;
  yearEstablished?: number | null;
  location: string;
  registeredAddress?: string | null;
  operatingAddress?: string | null;
  postcode?: string | null;
  country?: string | null;
  region?: string | null;
  primaryContactName?: string | null;
  primaryContactRole?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  primaryContactLinkedIn?: string | null;
  preferredContactMethod?: string | null;
  funderLocations?: string[];
  websiteUrl?: string | null;
  websiteIntelligence?: string | null;
  sector: string;
  missionStatement: string;
  description: string;
  employeeCount: number | null;
  contractorCount?: number | null;
  annualRevenue: number | null;
  profitLoss?: string | null;
  cashReserves?: string | null;
  financialProjections?: string | null;
  previousGrants: string | null;
  fundingMin: number;
  fundingMax: number;
  fundingPurposes: string[];
  fundingDetails: string | null;
  coFundingAvailable?: string | null;
  matchFundingDetails?: string | null;
  directorNames: string | null;
  directorProfiles: string | null;
  teamMembers?: string | null;
  boardMembers?: string | null;
  founderBackground?: string | null;
  projectTitle?: string | null;
  projectSummary?: string | null;
  problemStatement?: string | null;
  proposedSolution?: string | null;
  projectObjectives?: string | null;
  expectedOutcomes?: string | null;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
  beneficiaryGroups?: string | null;
  beneficiaryCount?: number | null;
  geographicImpact?: string | null;
  diversityInclusionImpact?: string | null;
  jobsCreated?: number | null;
  revenueGrowthExpected?: string | null;
  co2Reduction?: string | null;
  productivityImprovements?: string | null;
  milestones?: string | null;
  deliverables?: string | null;
  partnerOrganisations?: string | null;
  collaborationDetails?: string | null;
  risksMitigation?: string | null;
  exitStrategy?: string | null;
  projectSustainabilityPlan?: string | null;
  socialImpact: string | null;
  innovationCapabilities: string | null;
  sustainabilityInitiatives: string | null;
  communityEngagement: string | null;
  keyAchievements: string | null;
  teamExpertise: string | null;
  completionScore: number;
  documents: {
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
    category?: string | null;
  }[];
}

const STEP_LABELS = [
  "Business Basics",
  "Description",
  "Financials",
  "Funding Goals",
  "Documents",
  "Grant Readiness",
];

export function ProfileForm({ profile, initialStep = 1 }: { profile: ProfileData; initialStep?: number }) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [isPending, startTransition] = useTransition();
  const [savingStep, setSavingStep] = useState<number | null>(null);
  const [docs, setDocs] = useState(profile.documents);

  const completionScore = profile.completionScore ?? 0;
  const progressPercent = completionScore;

  function handleStep1(data: Step1Data) {
    return new Promise<void>((resolve) => {
      setSavingStep(1);
      startTransition(async () => {
        const result = await saveStep1(data);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Business basics saved");
          setStep(2);
          router.refresh();
        }
        setSavingStep(null);
        resolve();
      });
    });
  }

  function handleStep2(data: Step2Data) {
    return new Promise<void>((resolve) => {
      setSavingStep(2);
      startTransition(async () => {
        const result = await saveStep2(data);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Description saved");
          setStep(3);
          router.refresh();
        }
        setSavingStep(null);
        resolve();
      });
    });
  }

  function handleStep3(data: Step3Data) {
    return new Promise<void>((resolve) => {
      setSavingStep(3);
      startTransition(async () => {
        const result = await saveStep3(data);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Financials saved");
          setStep(4);
          router.refresh();
        }
        setSavingStep(null);
        resolve();
      });
    });
  }

  function handleStep4(data: Step4Data) {
    return new Promise<void>((resolve) => {
      setSavingStep(4);
      startTransition(async () => {
        const result = await saveStep4(data);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Funding goals saved");
          setStep(5);
          router.refresh();
        }
        setSavingStep(null);
        resolve();
      });
    });
  }

  async function handleUpload(file: File, category?: string | null) {
    try {
      const formData = new FormData();
      formData.set("file", file);
      if (category) formData.set("category", category);

      const res = await fetch("/api/profile/documents/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.error ?? `Upload failed (${res.status})`;
        toast.error(msg);
        return;
      }

      if (data.document) {
        setDocs((prev) => [
          ...prev,
          {
            id: data.document.id,
            name: data.document.name,
            url: data.document.url,
            type: data.document.type,
            size: data.document.size,
            category: data.document.category ?? null,
          },
        ]);
        toast.success("Document uploaded");
        router.refresh();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to upload document";
      toast.error(msg);
    }
  }

  async function handleRemoveDoc(id: string) {
    startTransition(async () => {
      await removeDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      toast.success("Document removed");
      router.refresh();
    });
  }

  function handleStep6(data: Step6Data) {
    return new Promise<boolean>((resolve) => {
      setSavingStep(6);
      startTransition(async () => {
        const result = await saveStep6(data);
        if (result.error) {
          toast.error(result.error);
          setSavingStep(null);
          resolve(false);
          return;
        } else {
          toast.success("Grant readiness saved");
          router.refresh();
        }
        setSavingStep(null);
        resolve(true);
      });
    });
  }

  function handleComplete() {
    toast.success("Profile complete! You can now browse and apply for grants.");
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 overflow-hidden px-0 sm:space-y-6">
      <div>
        <div className="mb-2 flex flex-col gap-1 text-sm min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <span className="font-medium">
            Step {step} of 6: {STEP_LABELS[step - 1]}
          </span>
          <span className="text-muted-foreground">
            {Math.round(progressPercent)}% complete
          </span>
        </div>
        <Progress value={Math.min(100, Math.max(0, progressPercent))} className="h-2" />
      </div>

      <CompanyDnaAutofill
        hasWebsiteUrl={Boolean(profile.websiteUrl?.trim())}
        hasWebsiteIntelligence={Boolean(profile.websiteIntelligence?.trim())}
      />

      <Card className="overflow-hidden rounded-2xl">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle>{STEP_LABELS[step - 1]}</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 px-4 sm:px-6">
          {step === 1 && (
            <Step1Basics
              defaultValues={{
                businessName: profile.businessName,
                tradingName: profile.tradingName ?? "",
                businessType: profile.businessType ?? "",
                registrationNumber: profile.registrationNumber ?? undefined,
                charityNumber: profile.charityNumber ?? "",
                vatNumber: profile.vatNumber ?? "",
                yearEstablished: profile.yearEstablished ?? "",
                location: profile.location,
                registeredAddress: profile.registeredAddress ?? "",
                operatingAddress: profile.operatingAddress ?? "",
                postcode: profile.postcode ?? "",
                country: profile.country ?? "",
                region: profile.region ?? "",
                primaryContactName: profile.primaryContactName ?? "",
                primaryContactRole: profile.primaryContactRole ?? "",
                primaryContactEmail: profile.primaryContactEmail ?? "",
                primaryContactPhone: profile.primaryContactPhone ?? "",
                primaryContactLinkedIn: profile.primaryContactLinkedIn ?? "",
                preferredContactMethod: profile.preferredContactMethod ?? "",
                funderLocations: (profile.funderLocations ?? []) as Step1Data["funderLocations"],
                websiteUrl: profile.websiteUrl ?? "",
              }}
              onSubmit={handleStep1}
              isPending={isPending || savingStep === 1}
            />
          )}
          {step === 2 && (
            <Step2Description
              defaultValues={{
                sector: profile.sector,
                missionStatement: profile.missionStatement,
                description: profile.description,
              }}
              onSubmit={handleStep2}
              onBack={() => setStep(1)}
              isPending={isPending || savingStep === 2}
            />
          )}
          {step === 3 && (
            <Step3Financials
              defaultValues={{
                employeeCount: profile.employeeCount ?? undefined,
                contractorCount: profile.contractorCount ?? "",
                annualRevenue: profile.annualRevenue ?? undefined,
                profitLoss: profile.profitLoss ?? "",
                cashReserves: profile.cashReserves ?? "",
                financialProjections: profile.financialProjections ?? "",
                previousGrants: profile.previousGrants ?? undefined,
              }}
              onSubmit={handleStep3}
              onBack={() => setStep(2)}
              isPending={isPending || savingStep === 3}
            />
          )}
          {step === 4 && (
            <Step4Funding
              defaultValues={{
                fundingMin: profile.fundingMin || undefined,
                fundingMax: profile.fundingMax || undefined,
                fundingPurposes: profile.fundingPurposes ?? [],
                fundingDetails: profile.fundingDetails ?? "",
                coFundingAvailable: profile.coFundingAvailable ?? "",
                matchFundingDetails: profile.matchFundingDetails ?? "",
              }}
              onSubmit={handleStep4}
              onBack={() => setStep(3)}
              isPending={isPending || savingStep === 4}
              profileContext={{
                businessName: profile.businessName,
                sector: profile.sector,
                description: profile.description,
                missionStatement: profile.missionStatement,
                employeeCount: profile.employeeCount,
                annualRevenue: profile.annualRevenue,
              }}
            />
          )}
          {step === 5 && (
            <Step5Documents
              documents={docs}
              onUpload={handleUpload}
              onRemove={handleRemoveDoc}
              onBack={() => setStep(4)}
              onComplete={() => setStep(6)}
              isPending={isPending || savingStep === 5}
            />
          )}
          {step === 6 && (
            <Step6GrantReadiness
              defaultValues={{
                directorNames: profile.directorNames ?? "",
                directorProfiles: profile.directorProfiles ?? "",
                teamMembers: profile.teamMembers ?? "",
                boardMembers: profile.boardMembers ?? "",
                founderBackground: profile.founderBackground ?? "",
                projectTitle: profile.projectTitle ?? "",
                projectSummary: profile.projectSummary ?? "",
                problemStatement: profile.problemStatement ?? "",
                proposedSolution: profile.proposedSolution ?? "",
                projectObjectives: profile.projectObjectives ?? "",
                expectedOutcomes: profile.expectedOutcomes ?? "",
                projectStartDate: profile.projectStartDate ?? "",
                projectEndDate: profile.projectEndDate ?? "",
                beneficiaryGroups: profile.beneficiaryGroups ?? "",
                beneficiaryCount: profile.beneficiaryCount ?? "",
                geographicImpact: profile.geographicImpact ?? "",
                diversityInclusionImpact: profile.diversityInclusionImpact ?? "",
                jobsCreated: profile.jobsCreated ?? "",
                revenueGrowthExpected: profile.revenueGrowthExpected ?? "",
                co2Reduction: profile.co2Reduction ?? "",
                productivityImprovements: profile.productivityImprovements ?? "",
                milestones: profile.milestones ?? "",
                deliverables: profile.deliverables ?? "",
                partnerOrganisations: profile.partnerOrganisations ?? "",
                collaborationDetails: profile.collaborationDetails ?? "",
                risksMitigation: profile.risksMitigation ?? "",
                exitStrategy: profile.exitStrategy ?? "",
                projectSustainabilityPlan: profile.projectSustainabilityPlan ?? "",
                socialImpact: profile.socialImpact ?? "",
                innovationCapabilities: profile.innovationCapabilities ?? "",
                sustainabilityInitiatives: profile.sustainabilityInitiatives ?? "",
                communityEngagement: profile.communityEngagement ?? "",
                keyAchievements: profile.keyAchievements ?? "",
                teamExpertise: profile.teamExpertise ?? "",
              }}
              onSubmit={handleStep6}
              onBack={() => setStep(5)}
              onComplete={handleComplete}
              isPending={isPending || savingStep === 6}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
