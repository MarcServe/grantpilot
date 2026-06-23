"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg, setActiveProfileCookie } from "@/lib/auth";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step6Schema,
  notificationPreferencesSchema,
  Step1Data,
  Step2Data,
  Step3Data,
  Step4Data,
  Step6Data,
  NotificationPreferencesData,
} from "@/lib/validations/profile";
import { syncGrantMemoryFromProfile } from "@/lib/grant-memory";
import { requestEligibilityRefresh } from "@/lib/eligibility-refresh-trigger";
import { analyseWebsite } from "@/lib/website-intelligence";
import { generateAndStoreProfileEmbedding } from "@/lib/embeddings";
import { PLAN_LIMITS } from "@/lib/plans";
import { PLAN_CAPABILITY_MESSAGES } from "@/lib/plan-features";
import { getOrganisationPlanKey, organisationAllowsCapability } from "@/lib/plan-check";
import { syncEligibilityWhatsAppPreference } from "@/lib/eligibility-preferences";

const PROFILE_DOCUMENT_BATCH_SIZE = 20;

async function getOrgId(): Promise<string> {
  const { orgId } = await getActiveOrg();
  return orgId;
}

function calculateCompletionScore(profile: Record<string, unknown>, documentCount = 0): number {
  const get = (camel: string, snake?: string): unknown =>
    profile[camel] ?? (snake ? profile[snake] : undefined);

  let score = 0;
  const total = 11; // 10 core profile fields + supporting documents

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
  if (documentCount >= 1) score++;

  return Math.round((score / total) * 100);
}

async function recalcAndSaveCompletionScore(profileId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from("BusinessProfile")
    .select("businessName, businessType, location, sector, missionStatement, description, employeeCount, annualRevenue, fundingMin, fundingMax, fundingPurposes, fundingDetails, directorNames, directorProfiles, teamMembers")
    .eq("id", profileId)
    .single();
  if (!profile) return;
  const { count } = await supabase
    .from("Document")
    .select("id", { count: "exact", head: true })
    .eq("profileId", profileId);
  const score = calculateCompletionScore(profile as Record<string, unknown>, count ?? 0);
  await supabase.from("BusinessProfile").update({ completionScore: score }).eq("id", profileId);
}

async function syncGrantMemoryForProfile(profileId: string): Promise<void> {
  try {
    const orgId = await getOrgId();
    await syncGrantMemoryFromProfile(profileId, orgId);
  } catch {
    // non-fatal
  }
}

async function refreshProfileEmbedding(profileId: string): Promise<void> {
  generateAndStoreProfileEmbedding(profileId).catch((err) =>
    console.error("[profile] Embedding generation failed:", err)
  );
}

async function triggerEligibilityForOrg(organisationId: string, source: string): Promise<void> {
  await requestEligibilityRefresh(organisationId, source);
}

function optionalNumber(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function loadProfileDocuments(profileId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("Document")
    .select("id, name, url, type, size, category, createdAt")
    .eq("profileId", profileId)
    .order("createdAt", { ascending: false })
    .limit(PROFILE_DOCUMENT_BATCH_SIZE);

  return data ?? [];
}

async function getOrCreateProfile(organisationId: string) {
  if (!organisationId?.trim()) {
    throw new Error("Organisation ID is required to load or create profile.");
  }
  const supabase = getSupabaseAdmin();
  const { activeProfileId } = await getActiveOrg();

  const { count: profileCount } = await supabase
    .from("BusinessProfile")
    .select("id", { count: "exact", head: true })
    .eq("organisationId", organisationId);

  if (activeProfileId) {
    const { data: activeProfile } = await supabase
      .from("BusinessProfile")
      .select("*")
      .eq("organisationId", organisationId)
      .eq("id", activeProfileId)
      .maybeSingle();

    if (activeProfile) {
      const documents = await loadProfileDocuments(activeProfile.id);
      return {
        ...activeProfile,
        documents,
      };
    }
  }

  const { data: existing } = await supabase
    .from("BusinessProfile")
    .select("*")
    .eq("organisationId", organisationId)
    .order("createdAt", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const documents = await loadProfileDocuments(existing.id);
    return {
      ...existing,
      documents,
    };
  }

  const plan = await getOrganisationPlanKey(organisationId);
  const profileLimit = PLAN_LIMITS[plan].profiles;
  if ((profileCount ?? 0) >= profileLimit) {
    throw new Error(
      `Your plan allows up to ${profileLimit} business profile(s). Upgrade on Billing to add more.`
    );
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
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? "Failed to create profile");
  }

  return {
    ...created,
    documents: [],
  };
}

export async function getProfile() {
  const orgId = await getOrgId();
  return getOrCreateProfile(orgId);
}

export async function createBusinessProfile(data: { businessName: string }) {
  const businessName = data.businessName?.trim();
  if (!businessName) return { error: "Business name is required." };
  if (businessName.length > 140) return { error: "Business name must be 140 characters or fewer." };

  const { orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();
  const plan = await getOrganisationPlanKey(orgId);
  const profileLimit = PLAN_LIMITS[plan].profiles;

  const { count } = await supabase
    .from("BusinessProfile")
    .select("id", { count: "exact", head: true })
    .eq("organisationId", orgId);

  if ((count ?? 0) >= profileLimit) {
    return {
      error: `Your ${plan.replace("_", " ").toLowerCase()} plan allows up to ${profileLimit} business profile${profileLimit === 1 ? "" : "s"}. Upgrade on Billing to add more.`,
    };
  }

  const id = crypto.randomUUID();
  const { data: created, error } = await supabase
    .from("BusinessProfile")
    .insert({
      id,
      organisationId: orgId,
      businessName,
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
    .select("id, businessName")
    .single();

  if (error || !created) {
    return { error: error?.message ?? "Failed to create business profile." };
  }

  await setActiveProfileCookie(created.id);
  return { success: true, profileId: created.id };
}

export async function switchBusinessProfile(profileId: string) {
  const requestedProfileId = profileId?.trim();
  if (!requestedProfileId) return { error: "Business profile is required." };

  const { orgId } = await getActiveOrg();
  const { data: profile, error } = await getSupabaseAdmin()
    .from("BusinessProfile")
    .select("id, businessName")
    .eq("organisationId", orgId)
    .eq("id", requestedProfileId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!profile) return { error: "Business profile not found for this account." };

  await setActiveProfileCookie(profile.id);
  return { success: true, profileId: profile.id };
}

export async function saveStep1(data: Step1Data) {
  const parsed = step1Schema.safeParse(data);
  if (!parsed.success) return { error: "Invalid data" };

  const orgId = await getOrgId();
  const profile = await getOrCreateProfile(orgId);

  const supabase = getSupabaseAdmin();
  const newUrl = parsed.data.websiteUrl?.trim() || null;
  const { data: updated, error: updateError } = await supabase
    .from("BusinessProfile")
    .update({
      businessName: parsed.data.businessName,
      tradingName: parsed.data.tradingName || null,
      businessType: parsed.data.businessType || null,
      registrationNumber: parsed.data.registrationNumber ?? null,
      charityNumber: parsed.data.charityNumber || null,
      vatNumber: parsed.data.vatNumber || null,
      yearEstablished: optionalNumber(parsed.data.yearEstablished),
      location: parsed.data.location,
      registeredAddress: parsed.data.registeredAddress || null,
      operatingAddress: parsed.data.operatingAddress || null,
      postcode: parsed.data.postcode || null,
      country: parsed.data.country || null,
      region: parsed.data.region || null,
      primaryContactName: parsed.data.primaryContactName || null,
      primaryContactRole: parsed.data.primaryContactRole || null,
      primaryContactEmail: parsed.data.primaryContactEmail || null,
      primaryContactPhone: parsed.data.primaryContactPhone || null,
      primaryContactLinkedIn: parsed.data.primaryContactLinkedIn || null,
      preferredContactMethod: parsed.data.preferredContactMethod || null,
      funderLocations: parsed.data.funderLocations ?? [],
      websiteUrl: newUrl,
    })
    .eq("id", profile.id)
    .select()
    .single();

  if (updateError || !updated) return { error: updateError?.message ?? "Update failed" };

  await recalcAndSaveCompletionScore(profile.id);
  await syncGrantMemoryForProfile(profile.id);
  await triggerEligibilityForOrg(orgId, "profile.step1.saved");

  const previousUrl = (profile as Record<string, unknown>).websiteUrl as string | null;
  if (newUrl && newUrl !== previousUrl) {
    analyseAndSaveWebsiteIntelligence(profile.id, newUrl, orgId).catch((err) =>
      console.error("[website-intelligence] Background analysis failed:", err)
    );
  }

  return { success: true };
}

async function analyseAndSaveWebsiteIntelligence(
  profileId: string,
  url: string,
  organisationId: string
): Promise<void> {
  try {
    if (!(await organisationAllowsCapability(organisationId, "website_intelligence_refresh"))) return;

    console.info(`[website-intelligence] Analysing ${url} for profile ${profileId}`);
    const intelligence = await analyseWebsite(url);
    const supabase = getSupabaseAdmin();
    await supabase
      .from("BusinessProfile")
      .update({ websiteIntelligence: intelligence })
      .eq("id", profileId);
    console.info(`[website-intelligence] Saved ${intelligence.length} chars for profile ${profileId}`);
  } catch (err) {
    console.error(`[website-intelligence] Failed for ${url}:`, err);
  }
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

  await recalcAndSaveCompletionScore(profile.id);
  await syncGrantMemoryForProfile(profile.id);
  await refreshProfileEmbedding(profile.id);
  await triggerEligibilityForOrg(orgId, "profile.step2.saved");

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
      contractorCount: optionalNumber(parsed.data.contractorCount),
      annualRevenue: parsed.data.annualRevenue ?? null,
      profitLoss: parsed.data.profitLoss || null,
      cashReserves: parsed.data.cashReserves || null,
      financialProjections: parsed.data.financialProjections || null,
      previousGrants: parsed.data.previousGrants ?? null,
    })
    .eq("id", profile.id)
    .select()
    .single();

  if (updateError || !updated) return { error: updateError?.message ?? "Update failed" };

  await recalcAndSaveCompletionScore(profile.id);
  await syncGrantMemoryForProfile(profile.id);
  await triggerEligibilityForOrg(orgId, "profile.step3.saved");

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
      coFundingAvailable: parsed.data.coFundingAvailable || null,
      matchFundingDetails: parsed.data.matchFundingDetails || null,
    })
    .eq("id", profile.id)
    .select()
    .single();

  if (updateError || !updated) return { error: updateError?.message ?? "Update failed" };

  await recalcAndSaveCompletionScore(profile.id);
  await syncGrantMemoryForProfile(profile.id);
  await refreshProfileEmbedding(profile.id);
  await triggerEligibilityForOrg(orgId, "profile.step4.saved");

  return { success: true };
}

export async function saveStep6(data: Step6Data) {
  const parsed = step6Schema.safeParse(data);
  if (!parsed.success) return { error: "Invalid data" };

  const orgId = await getOrgId();
  const profile = await getOrCreateProfile(orgId);

  const supabase = getSupabaseAdmin();
  const { data: updated, error: updateError } = await supabase
    .from("BusinessProfile")
    .update({
      directorNames: parsed.data.directorNames || null,
      directorProfiles: parsed.data.directorProfiles || null,
      teamMembers: parsed.data.teamMembers || null,
      boardMembers: parsed.data.boardMembers || null,
      founderBackground: parsed.data.founderBackground || null,
      projectTitle: parsed.data.projectTitle || null,
      projectSummary: parsed.data.projectSummary || null,
      problemStatement: parsed.data.problemStatement || null,
      proposedSolution: parsed.data.proposedSolution || null,
      projectObjectives: parsed.data.projectObjectives || null,
      expectedOutcomes: parsed.data.expectedOutcomes || null,
      projectStartDate: parsed.data.projectStartDate || null,
      projectEndDate: parsed.data.projectEndDate || null,
      beneficiaryGroups: parsed.data.beneficiaryGroups || null,
      beneficiaryCount: optionalNumber(parsed.data.beneficiaryCount),
      geographicImpact: parsed.data.geographicImpact || null,
      diversityInclusionImpact: parsed.data.diversityInclusionImpact || null,
      jobsCreated: optionalNumber(parsed.data.jobsCreated),
      revenueGrowthExpected: parsed.data.revenueGrowthExpected || null,
      co2Reduction: parsed.data.co2Reduction || null,
      productivityImprovements: parsed.data.productivityImprovements || null,
      milestones: parsed.data.milestones || null,
      deliverables: parsed.data.deliverables || null,
      partnerOrganisations: parsed.data.partnerOrganisations || null,
      collaborationDetails: parsed.data.collaborationDetails || null,
      risksMitigation: parsed.data.risksMitigation || null,
      exitStrategy: parsed.data.exitStrategy || null,
      projectSustainabilityPlan: parsed.data.projectSustainabilityPlan || null,
      socialImpact: parsed.data.socialImpact || null,
      innovationCapabilities: parsed.data.innovationCapabilities || null,
      sustainabilityInitiatives: parsed.data.sustainabilityInitiatives || null,
      communityEngagement: parsed.data.communityEngagement || null,
      keyAchievements: parsed.data.keyAchievements || null,
      teamExpertise: parsed.data.teamExpertise || null,
    })
    .eq("id", profile.id)
    .select()
    .single();

  if (updateError || !updated) return { error: updateError?.message ?? "Update failed" };

  await recalcAndSaveCompletionScore(profile.id);
  await syncGrantMemoryForProfile(profile.id);
  await refreshProfileEmbedding(profile.id);
  await triggerEligibilityForOrg(orgId, "profile.step6.saved");

  return { success: true };
}

export async function saveTeamVault(data: Pick<
  Step6Data,
  "directorNames" | "directorProfiles" | "teamMembers" | "boardMembers" | "teamExpertise"
>) {
  const parsed = step6Schema
    .pick({
      directorNames: true,
      directorProfiles: true,
      teamMembers: true,
      boardMembers: true,
      teamExpertise: true,
    })
    .safeParse(data);
  if (!parsed.success) return { error: "Invalid data" };

  const orgId = await getOrgId();
  const profile = await getOrCreateProfile(orgId);

  const supabase = getSupabaseAdmin();
  const { data: updated, error: updateError } = await supabase
    .from("BusinessProfile")
    .update({
      directorNames: parsed.data.directorNames || null,
      directorProfiles: parsed.data.directorProfiles || null,
      teamMembers: parsed.data.teamMembers || null,
      boardMembers: parsed.data.boardMembers || null,
      teamExpertise: parsed.data.teamExpertise || null,
    })
    .eq("id", profile.id)
    .select()
    .single();

  if (updateError || !updated) return { error: updateError?.message ?? "Update failed" };

  await recalcAndSaveCompletionScore(profile.id);
  await syncGrantMemoryForProfile(profile.id);
  await refreshProfileEmbedding(profile.id);
  await triggerEligibilityForOrg(orgId, "data-vault.team.saved");

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
  await recalcAndSaveCompletionScore(profile.id);
  await syncGrantMemoryForProfile(profile.id);
  await triggerEligibilityForOrg(orgId, "profile.document.saved");
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

  await recalcAndSaveCompletionScore(profile.id);
  await syncGrantMemoryForProfile(profile.id);
  await triggerEligibilityForOrg(orgId, "profile.document.removed");
  return { success: true };
}

export async function updateNotificationPreferences(data: NotificationPreferencesData) {
  const parsed = notificationPreferencesSchema.safeParse(data);
  if (!parsed.success) return { error: "Invalid data" };

  const { user, orgId } = await getActiveOrg();
  const userId = (user as { id?: string }).id;
  if (!userId) return { error: "User not found" };
  if (
    parsed.data.whatsappOptIn &&
    !(await organisationAllowsCapability(orgId, "whatsapp_opportunity_alerts"))
  ) {
    return { error: PLAN_CAPABILITY_MESSAGES.whatsapp_opportunity_alerts };
  }

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
  try {
    await syncEligibilityWhatsAppPreference(orgId, parsed.data.whatsappOptIn);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not sync eligibility WhatsApp preference" };
  }
  return { success: true };
}
