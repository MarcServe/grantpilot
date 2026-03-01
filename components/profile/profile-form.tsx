"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Step1Basics } from "./step-1-basics";
import { Step2Description } from "./step-2-description";
import { Step3Financials } from "./step-3-financials";
import { Step4Funding } from "./step-4-funding";
import { Step5Documents } from "./step-5-documents";
import {
  saveStep1,
  saveStep2,
  saveStep3,
  saveStep4,
  removeDocument,
} from "@/app/(dashboard)/profile/actions";
import type {
  Step1Data,
  Step2Data,
  Step3Data,
  Step4Data,
} from "@/lib/validations/profile";

interface ProfileData {
  id: string;
  businessName: string;
  registrationNumber: string | null;
  location: string;
  sector: string;
  missionStatement: string;
  description: string;
  employeeCount: number | null;
  annualRevenue: number | null;
  previousGrants: string | null;
  fundingMin: number;
  fundingMax: number;
  fundingPurposes: string[];
  fundingDetails: string | null;
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
];

export function ProfileForm({ profile }: { profile: ProfileData }) {
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [docs, setDocs] = useState(profile.documents);

  const progressPercent = (step / 5) * 100;

  function handleStep1(data: Step1Data) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await saveStep1(data);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Business basics saved");
          setStep(2);
        }
        resolve();
      });
    });
  }

  function handleStep2(data: Step2Data) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await saveStep2(data);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Description saved");
          setStep(3);
        }
        resolve();
      });
    });
  }

  function handleStep3(data: Step3Data) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await saveStep3(data);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Financials saved");
          setStep(4);
        }
        resolve();
      });
    });
  }

  function handleStep4(data: Step4Data) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await saveStep4(data);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Funding goals saved");
          setStep(5);
        }
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
    });
  }

  function handleComplete() {
    toast.success("Profile complete! You can now browse and apply for grants.");
    window.location.href = "/dashboard";
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">
            Step {step} of 5: {STEP_LABELS[step - 1]}
          </span>
          <span className="text-muted-foreground">
            {Math.round(progressPercent)}%
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{STEP_LABELS[step - 1]}</CardTitle>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <Step1Basics
              defaultValues={{
                businessName: profile.businessName,
                registrationNumber: profile.registrationNumber ?? undefined,
                location: profile.location,
              }}
              onSubmit={handleStep1}
              isPending={isPending}
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
              isPending={isPending}
            />
          )}
          {step === 3 && (
            <Step3Financials
              defaultValues={{
                employeeCount: profile.employeeCount ?? undefined,
                annualRevenue: profile.annualRevenue ?? undefined,
                previousGrants: profile.previousGrants ?? undefined,
              }}
              onSubmit={handleStep3}
              onBack={() => setStep(2)}
              isPending={isPending}
            />
          )}
          {step === 4 && (
            <Step4Funding
              defaultValues={{
                fundingMin: profile.fundingMin || undefined,
                fundingMax: profile.fundingMax || undefined,
                fundingPurposes: profile.fundingPurposes ?? [],
                fundingDetails: profile.fundingDetails ?? "",
              }}
              onSubmit={handleStep4}
              onBack={() => setStep(3)}
              isPending={isPending}
            />
          )}
          {step === 5 && (
            <Step5Documents
              documents={docs}
              onUpload={handleUpload}
              onRemove={handleRemoveDoc}
              onBack={() => setStep(4)}
              onComplete={handleComplete}
              isPending={isPending}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
