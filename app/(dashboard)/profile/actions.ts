"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
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
  if (!organisationId?.trim()) {
    throw new Error("Organisation ID is required to load or create profile.");
  }
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("BusinessProfile")
    .select("*, Document(*)")
    .eq("organisationId", organisationId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const rawDocs =
      (existing as Record<string, unknown>).Document ??
      (existing as Record<string, unknown>).document ??
      (existing as Record<string, unknown>).documents ??
      [];
    const documents = Array.isArray(rawDocs) ? rawDocs : [];
    return {
      ...existing,
      documents,
    };
  }

  const id = crypto.randomUUID();
  const { data: created, error } = await supabase
    .from("BusinessProfile")
    .insert({
      id,
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
    })
    .select("*, Document(*)")
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? "Failed to create profile");
  }

  const rawDocs =
    (created as Record<string, unknown>).Document ??
    (created as Record<string, unknown>).document ??
    (created as Record<string, unknown>).documents ??
    [];
  const documents = Array.isArray(rawDocs) ? rawDocs : [];
  return {
    ...created,
    documents,
  };
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

  const supabase = getSupabaseAdmin();
  const { data: updated, error: updateError } = await supabase
    .from("BusinessProfile")
    .update({
      businessName: parsed.data.businessName,
      registrationNumber: parsed.data.registrationNumber ?? null,
      location: parsed.data.location,
    })
    .eq("id", profile.id)
    .select()
    .single();

  if (updateError || !updated) return { error: updateError?.message ?? "Update failed" };

  await supabase
    .from("BusinessProfile")
    .update({ completionScore: calculateCompletionScore(updated) })
    .eq("id", profile.id);

  return { success: true };
}

export async function saveStep2(data: Step2Data) {
  const parsed = step2Schema.safeParse(data);
  if (!parsed.success) return { error: "Invalid data" };

  const orgId = await getOrgId();
  const profile = await getOrCreateProfile(orgId);

  const supabase = getSupabaseAdmin();
  const { data: updated, error: updateError } = await supabase
    .from("BusinessProfile")
    .update({
      sector: parsed.data.sector,
      missionStatement: parsed.data.missionStatement,
      description: parsed.data.description,
    })
    .eq("id", profile.id)
    .select()
    .single();

  if (updateError || !updated) return { error: updateError?.message ?? "Update failed" };

  await supabase
    .from("BusinessProfile")
    .update({ completionScore: calculateCompletionScore(updated) })
    .eq("id", profile.id);

  return { success: true };
}

export async function saveStep3(data: Step3Data) {
  const parsed = step3Schema.safeParse(data);
  if (!parsed.success) return { error: "Invalid data" };

  const orgId = await getOrgId();
  const profile = await getOrCreateProfile(orgId);

  const supabase = getSupabaseAdmin();
  const { data: updated, error: updateError } = await supabase
    .from("BusinessProfile")
    .update({
      employeeCount: parsed.data.employeeCount ?? null,
      annualRevenue: parsed.data.annualRevenue ?? null,
      previousGrants: parsed.data.previousGrants ?? null,
    })
    .eq("id", profile.id)
    .select()
    .single();

  if (updateError || !updated) return { error: updateError?.message ?? "Update failed" };

  await supabase
    .from("BusinessProfile")
    .update({ completionScore: calculateCompletionScore(updated) })
    .eq("id", profile.id);

  return { success: true };
}

export async function saveStep4(data: Step4Data) {
  const parsed = step4Schema.safeParse(data);
  if (!parsed.success) return { error: "Invalid data" };

  const orgId = await getOrgId();
  const profile = await getOrCreateProfile(orgId);

  const supabase = getSupabaseAdmin();
  const { data: updated, error: updateError } = await supabase
    .from("BusinessProfile")
    .update({
      fundingMin: parsed.data.fundingMin,
      fundingMax: parsed.data.fundingMax,
      fundingPurposes: parsed.data.fundingPurposes,
      fundingDetails: parsed.data.fundingDetails ?? null,
    })
    .eq("id", profile.id)
    .select()
    .single();

  if (updateError || !updated) return { error: updateError?.message ?? "Update failed" };

  await supabase
    .from("BusinessProfile")
    .update({ completionScore: calculateCompletionScore(updated) })
    .eq("id", profile.id);

  return { success: true };
}

export async function saveDocument(doc: {
  name: string;
  url: string;
  type: string;
  size: number;
  category?: string | null;
}) {
  const orgId = await getOrgId();
  const profile = await getOrCreateProfile(orgId);

  const supabase = getSupabaseAdmin();
  const insert: Record<string, unknown> = {
    profileId: profile.id,
    name: doc.name,
    url: doc.url,
    type: doc.type,
    size: doc.size,
  };
  if (doc.category != null && doc.category !== "") {
    insert.category = doc.category;
  }
  const { error } = await supabase.from("Document").insert(insert);

  if (error) return { error: error.message };
  return { success: true };
}

export async function removeDocument(documentId: string) {
  const orgId = await getOrgId();
  const profile = await getOrCreateProfile(orgId);

  const supabase = getSupabaseAdmin();
  await supabase
    .from("Document")
    .delete()
    .eq("id", documentId)
    .eq("profileId", profile.id);

  return { success: true };
}
