"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Step1Basics } from "./step-1-basics";
import { Step2Description } from "./step-2-description";
import { Step3Financials } from "./step-3-financials";
import { Step4Funding } from "./step-4-funding";
import { Step5Documents } from "./step-5-documents";
import { Step6GrantReadiness } from "./step-6-grant-readiness";
import { Step7EligibilityFacts } from "./step-7-eligibility-facts";
import { CompanyDnaAutofill } from "./company-dna-autofill";
import {
  saveStep1,
  saveStep2,
  saveStep3,
  saveStep4,
  saveStep6,
  saveStep7,
  removeDocument,
} from "@/app/(dashboard)/profile/actions";
import type {
  Step1Data,
  Step2Data,
  Step3Data,
  Step4Data,
  Step6Data,
  Step7Data,
} from "@/lib/validations/profile";
import { normalizeEligibilityFacts, type EligibilityFact } from "@/lib/eligibility-facts";

interface ProfileData {
  id: string;
  businessName: string;
  tradingName?: string | null;
  businessType?: string | null;
  legalStructure?: string | null;
  businessStage?: string | null;
  businessSizeBand?: string | null;
  founderEmploymentStatus?: string | null;
  registrationNumber: string | null;
  charityNumber?: string | null;
  vatNumber?: string | null;
  yearEstablished?: number | null;
  incorporationDate?: string | null;
  tradingStartDate?: string | null;
  location: string;
  registeredAddress?: string | null;
  operatingAddress?: string | null;
  postcode?: string | null;
  country?: string | null;
  region?: string | null;
  expectedEmployeeGrowth?: string | null;
  localAuthority?: string | null;
  areasServed?: string | null;
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
  previousGrantExperience?: string | null;
  previousGrants: string | null;
  previousGrantHistory?: string | null;
  fundingMin: number;
  fundingMax: number;
  fundingPurposes: string[];
  preferredOpportunityTypes?: string[];
  fundingDetails: string | null;
  fundingUrgency?: string | null;
  fundingPosition?: string | null;
  documentReadiness?: string | null;
  coFundingCapacity?: string | null;
  reimbursementReadiness?: string | null;
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
  eligibilityFacts?: EligibilityFact[] | null;
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
  "Eligibility Facts",
];

export function ProfileForm({
  profile,
  initialStep = 1,
  companyDnaAutofillEnabled,
}: {
  profile: ProfileData;
  initialStep?: number;
  companyDnaAutofillEnabled: boolean;
}) {
  const router = useRouter();
  const [formRevision, setFormRevision] = useState(0);
  const [step, setStep] = useState(initialStep);
  const [isPending, startTransition] = useTransition();
  const [savingStep, setSavingStep] = useState<number | null>(null);
  const [docs, setDocs] = useState(profile.documents);

  const completionFields = [
    ["businessName", "Business name", 1, "Enter your registered or trading name"],
    ["businessType", "Business type", 1, "Choose a dropdown option"],
    ["legalStructure", "Legal structure", 1, "Choose your registered legal structure"],
    ["businessStage", "Business stage", 1, "Choose your current stage"],
    ["businessSizeBand", "Business size", 1, "Choose your business size band"],
    ["location", "Location", 1, "Confirm where your business operates"],
    ["localAuthority", "Local authority", 1, "Confirm your council or local authority"],
    ["sector", "Sector", 2, "AI can suggest this; confirm the sector"],
    ["missionStatement", "Mission statement", 2, "AI can draft this from your website"],
    ["description", "Business description", 2, "AI can draft this from your website"],
    ["employeeCount", "Employee count", 3, "Enter the actual number; zero is valid"],
    ["annualRevenue", "Annual revenue", 3, "Enter your actual revenue; zero is valid"],
    ["fundingMin", "Minimum funding", 4, "Set the minimum amount you want to seek"],
    ["fundingMax", "Maximum funding", 4, "Set the maximum amount you want to seek"],
    ["fundingPurposes", "Funding purposes", 4, "Select what you want funding for"],
    ["preferredOpportunityTypes", "Opportunity types", 4, "Select the opportunities you want"],
    ["coFundingCapacity", "Co-funding capacity", 4, "Confirm whether you can contribute funding"],
    ["reimbursementReadiness", "Reimbursement readiness", 4, "Confirm whether you can pay costs upfront"],
    ["eligibilityFacts", "Eligibility facts", 7, "Add a verified fact with supporting evidence"],
    ["documents", "Supporting document", 5, "Upload at least one supporting document"],
  ] as const;
  const missingFields = completionFields.filter(([field]) => {
    const value = field === "documents" ? docs : profile[field];
    if (Array.isArray(value)) return value.length === 0;
    if (field === "fundingMin" || field === "fundingMax") return value == null || Number(value) <= 0;
    if (field === "employeeCount" || field === "annualRevenue") return value == null || Number(value) < 0;
    return value == null || !String(value).trim();
  });
  const completionScore = Math.round(((completionFields.length - missingFields.length) / completionFields.length) * 100);
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

  function handleStep7(data: Step7Data) {
    return new Promise<boolean>((resolve) => {
      setSavingStep(7);
      startTransition(async () => {
        const result = await saveStep7(data);
        if (result.error) {
          toast.error(result.error);
          setSavingStep(null);
          resolve(false);
          return;
        } else {
          toast.success("Eligibility facts saved");
          router.refresh();
        }
        setSavingStep(null);
        resolve(true);
      });
    });
  }

  function handleComplete() {
    toast.success(missingFields.length ? "Progress saved. You can return to complete the remaining items." : "Profile complete! You can now browse and apply for grants.");
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 overflow-hidden px-0 sm:space-y-6">
      <div>
        <div className="mb-2 flex flex-col gap-1 text-sm min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <span className="font-medium">
            Step {step} of {STEP_LABELS.length}: {STEP_LABELS[step - 1]}
          </span>
          <span className="text-muted-foreground">
            {Math.round(progressPercent)}% complete
          </span>
        </div>
        <Progress value={Math.min(100, Math.max(0, progressPercent))} className="h-2" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{missingFields.length ? `${missingFields.length} items left to complete` : "Core profile complete"}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">AI drafts your written sections. Dropdown choices, financial figures, funding preferences, verified facts and uploads need your confirmation. Improving an already completed section may not increase your score.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {missingFields.map(([field, label, targetStep, help]) => (
              <Button key={field} type="button" variant="outline" className="h-auto justify-start whitespace-normal py-3 text-left" onClick={() => {
                setStep(targetStep);
                document.getElementById("profile-step")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}>
                <span><span className="block font-medium">{label}</span><span className="block text-xs font-normal text-muted-foreground">{help}</span></span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <CompanyDnaAutofill
        key={profile.id}
        profileId={profile.id}
        onApplied={() => setFormRevision((value) => value + 1)}
        hasProfileEvidence={Boolean(profile.description?.trim() || profile.missionStatement?.trim())}
        hasWebsiteUrl={Boolean(profile.websiteUrl?.trim())}
        hasWebsiteIntelligence={Boolean(profile.websiteIntelligence?.trim())}
        companyDnaAutofillEnabled={companyDnaAutofillEnabled}
      />

      <Card id="profile-step" className="scroll-mt-24 overflow-hidden rounded-2xl">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle>{STEP_LABELS[step - 1]}</CardTitle>
        </CardHeader>
        <CardContent key={`${formRevision}:${JSON.stringify(profile)}`} className="min-w-0 px-4 sm:px-6">
          {step === 1 && (
            <Step1Basics
              defaultValues={{
                businessName: profile.businessName,
                tradingName: profile.tradingName ?? "",
                businessType: profile.businessType ?? "",
                legalStructure: profile.legalStructure ?? "",
                businessStage: profile.businessStage ?? "",
                businessSizeBand: profile.businessSizeBand ?? "",
                founderEmploymentStatus: profile.founderEmploymentStatus ?? "",
                registrationNumber: profile.registrationNumber ?? undefined,
                charityNumber: profile.charityNumber ?? "",
                vatNumber: profile.vatNumber ?? "",
                yearEstablished: profile.yearEstablished ?? "",
                incorporationDate: profile.incorporationDate ?? "",
                tradingStartDate: profile.tradingStartDate ?? "",
                employeeCount: profile.employeeCount ?? "",
                expectedEmployeeGrowth: profile.expectedEmployeeGrowth ?? "",
                location: profile.location,
                registeredAddress: profile.registeredAddress ?? "",
                operatingAddress: profile.operatingAddress ?? "",
                postcode: profile.postcode ?? "",
                country: profile.country ?? "",
                region: profile.region ?? "",
                localAuthority: profile.localAuthority ?? "",
                areasServed: profile.areasServed ?? "",
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
                previousGrantExperience: profile.previousGrantExperience ?? "",
                previousGrants: profile.previousGrants ?? undefined,
                previousGrantHistory: profile.previousGrantHistory ?? "",
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
                preferredOpportunityTypes: profile.preferredOpportunityTypes ?? [],
                fundingDetails: profile.fundingDetails ?? "",
                fundingUrgency: profile.fundingUrgency ?? "",
                fundingPosition: profile.fundingPosition ?? "",
                documentReadiness: profile.documentReadiness ?? "",
                coFundingCapacity: profile.coFundingCapacity ?? "",
                reimbursementReadiness: profile.reimbursementReadiness ?? "",
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
              onComplete={() => setStep(7)}
              isPending={isPending || savingStep === 6}
              completeLabel="Save & Next"
            />
          )}
          {step === 7 && (
            <Step7EligibilityFacts
              defaultValues={{
                eligibilityFacts: normalizeEligibilityFacts(profile.eligibilityFacts),
              }}
              onSubmit={handleStep7}
              onBack={() => setStep(6)}
              onComplete={handleComplete}
              isPending={isPending || savingStep === 7}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
