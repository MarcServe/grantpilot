"use server";

import { prisma } from "@/lib/prisma";
import { getActiveOrg } from "@/lib/auth";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  Step1Data,
  Step2Data,
  Step3Data,
  Step4Data,
} from "@/lib/validations/profile";

async function getOrgId(): Promise<string> {
  const { orgId } = await getActiveOrg();
  return orgId;
}

function calculateCompletionScore(profile: {
  businessName: string;
  location: string;
  sector: string;
  missionStatement: string;
  description: string;
  employeeCount: number | null;
  annualRevenue: number | null;
  fundingMin: number;
  fundingMax: number;
  fundingPurposes: string[];
  fundingDetails: string | null;
}): number {
  let score = 0;
  const total = 10;
  if (profile.businessName) score++;
  if (profile.location) score++;
  if (profile.sector) score++;
  if (profile.missionStatement) score++;
  if (profile.description) score++;
  if (profile.employeeCount) score++;
  if (profile.annualRevenue) score++;
  if (profile.fundingMin) score++;
  if (profile.fundingMax) score++;
  if (profile.fundingPurposes?.length > 0) score++;
  return Math.round((score / total) * 100);
}

async function getOrCreateProfile(organisationId: string) {
  let profile = await prisma.businessProfile.findFirst({
    where: { organisationId },
    include: { documents: true },
  });

  if (!profile) {
    profile = await prisma.businessProfile.create({
      data: {
        organisationId,
        businessName: "",
        sector: "",
        missionStatement: "",
        description: "",
        location: "",
        fundingMin: 0,
        fundingMax: 0,
        fundingPurposes: [],
        fundingDetails: null,
      },
      include: { documents: true },
    });
  }

  return profile;
}

export async function getProfile() {
  const orgId = await getOrgId();
  return getOrCreateProfile(orgId);
}

export async function saveStep1(data: Step1Data) {
  const parsed = step1Schema.safeParse(data);
  if (!parsed.success) return { error: "Invalid data" };

  const orgId = await getOrgId();
  const profile = await getOrCreateProfile(orgId);

  const updated = await prisma.businessProfile.update({
    where: { id: profile.id },
    data: {
      businessName: parsed.data.businessName,
      registrationNumber: parsed.data.registrationNumber ?? null,
      location: parsed.data.location,
    },
  });

  await prisma.businessProfile.update({
    where: { id: profile.id },
    data: { completionScore: calculateCompletionScore(updated) },
  });

  return { success: true };
}

export async function saveStep2(data: Step2Data) {
  const parsed = step2Schema.safeParse(data);
  if (!parsed.success) return { error: "Invalid data" };

  const orgId = await getOrgId();
  const profile = await getOrCreateProfile(orgId);

  const updated = await prisma.businessProfile.update({
    where: { id: profile.id },
    data: {
      sector: parsed.data.sector,
      missionStatement: parsed.data.missionStatement,
      description: parsed.data.description,
    },
  });

  await prisma.businessProfile.update({
    where: { id: profile.id },
    data: { completionScore: calculateCompletionScore(updated) },
  });

  return { success: true };
}

export async function saveStep3(data: Step3Data) {
  const parsed = step3Schema.safeParse(data);
  if (!parsed.success) return { error: "Invalid data" };

  const orgId = await getOrgId();
  const profile = await getOrCreateProfile(orgId);

  const updated = await prisma.businessProfile.update({
    where: { id: profile.id },
    data: {
      employeeCount: parsed.data.employeeCount ?? null,
      annualRevenue: parsed.data.annualRevenue ?? null,
      previousGrants: parsed.data.previousGrants ?? null,
    },
  });

  await prisma.businessProfile.update({
    where: { id: profile.id },
    data: { completionScore: calculateCompletionScore(updated) },
  });

  return { success: true };
}

export async function saveStep4(data: Step4Data) {
  const parsed = step4Schema.safeParse(data);
  if (!parsed.success) return { error: "Invalid data" };

  const orgId = await getOrgId();
  const profile = await getOrCreateProfile(orgId);

  const updated = await prisma.businessProfile.update({
    where: { id: profile.id },
    data: {
      fundingMin: parsed.data.fundingMin,
      fundingMax: parsed.data.fundingMax,
      fundingPurposes: parsed.data.fundingPurposes,
      fundingDetails: parsed.data.fundingDetails ?? null,
    },
  });

  await prisma.businessProfile.update({
    where: { id: profile.id },
    data: { completionScore: calculateCompletionScore(updated) },
  });

  return { success: true };
}

export async function saveDocument(doc: {
  name: string;
  url: string;
  type: string;
  size: number;
}) {
  const orgId = await getOrgId();
  const profile = await getOrCreateProfile(orgId);

  await prisma.document.create({
    data: {
      profileId: profile.id,
      name: doc.name,
      url: doc.url,
      type: doc.type,
      size: doc.size,
    },
  });

  return { success: true };
}

export async function removeDocument(documentId: string) {
  const orgId = await getOrgId();
  const profile = await getOrCreateProfile(orgId);

  await prisma.document.deleteMany({
    where: {
      id: documentId,
      profileId: profile.id,
    },
  });

  return { success: true };
}
