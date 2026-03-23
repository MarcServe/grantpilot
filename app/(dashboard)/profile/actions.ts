"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  notificationPreferencesSchema,
  Step1Data,
  Step2Data,
  Step3Data,
  Step4Data,
  NotificationPreferencesData,
} from "@/lib/validations/profile";

async function getOrgId(): Promise<string> {
  const { orgId } = await getActiveOrg();
  return orgId;
}

function calculateCompletionScore(profile: Record<string, unknown>): number {
  const get = (camel: string, snake?: string): unknown =>
    profile[camel] ?? (snake ? profile[snake] : undefined);

  let score = 0;
  const total = 10;

  const businessName = get("businessName", "business_name");
  const location = get("location");
  const sector = get("sector");
  const missionStatement = get("missionStatement", "mission_statement");
  const description = get("description");
  const employeeCount = get("employeeCount", "employee_count");
  const annualRevenue = get("annualRevenue", "annual_revenue");
  const fundingMin = get("fundingMin", "funding_min");
  const fundingMax = get("fundingMax", "funding_max");
  const fundingPurposes = get("fundingPurposes", "funding_purposes");

  if (businessName && String(businessName).trim()) score++;
  if (location && String(location).trim()) score++;
  if (sector && String(sector).trim()) score++;
  if (missionStatement && String(missionStatement).trim()) score++;
  if (description && String(description).trim()) score++;
  if (employeeCount != null && Number(employeeCount) > 0) score++;
  if (annualRevenue != null && Number(annualRevenue) > 0) score++;
  if (fundingMin != null && Number(fundingMin) > 0) score++;
  if (fundingMax != null && Number(fundingMax) > 0) score++;
  if (Array.isArray(fundingPurposes) && fundingPurposes.length > 0) score++;

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
      funderLocations: [],
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
      funderLocations: parsed.data.funderLocations ?? [],
    })
    .eq("id", profile.id)
    .select()
    .single();

  if (updateError || !updated) return { error: updateError?.message ?? "Update failed" };

  const { data: full } = await supabase.from("BusinessProfile").select("*").eq("id", profile.id).single();
  if (full) {
    await supabase.from("BusinessProfile").update({ completionScore: calculateCompletionScore(full as Record<string, unknown>) }).eq("id", profile.id);
  }

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

  const { data: full } = await supabase.from("BusinessProfile").select("*").eq("id", profile.id).single();
  if (full) {
    await supabase.from("BusinessProfile").update({ completionScore: calculateCompletionScore(full as Record<string, unknown>) }).eq("id", profile.id);
  }

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

  const { data: full } = await supabase.from("BusinessProfile").select("*").eq("id", profile.id).single();
  if (full) {
    await supabase.from("BusinessProfile").update({ completionScore: calculateCompletionScore(full as Record<string, unknown>) }).eq("id", profile.id);
  }

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

  const { data: full } = await supabase.from("BusinessProfile").select("*").eq("id", profile.id).single();
  if (full) {
    await supabase.from("BusinessProfile").update({ completionScore: calculateCompletionScore(full as Record<string, unknown>) }).eq("id", profile.id);
  }

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

export async function updateNotificationPreferences(data: NotificationPreferencesData) {
  const parsed = notificationPreferencesSchema.safeParse(data);
  if (!parsed.success) return { error: "Invalid data" };

  const { user } = await getActiveOrg();
  const userId = (user as { id?: string }).id;
  if (!userId) return { error: "User not found" };

  const supabase = getSupabaseAdmin();
  const update: Record<string, unknown> = {
    phoneNumber: parsed.data.phoneNumber ?? null,
    whatsappOptIn: parsed.data.whatsappOptIn,
  };
  if (parsed.data.whatsappOptIn) {
    update.whatsappOptInAt = new Date().toISOString();
  }

  const { error } = await supabase.from("User").update(update).eq("id", userId);

  if (error) return { error: error.message };
  return { success: true };
}
