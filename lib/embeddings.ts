/**
 * Layer 2: Embedding-based similarity scoring.
 * Uses OpenAI text-embedding-3-small (~$0.02/1M tokens) to produce
 * dense vectors stored in Supabase (JSON float array).
 * Replaces the expensive Claude matchGrantsToProfile call.
 */

import OpenAI from "openai";
import { getSupabaseAdmin } from "@/lib/supabase";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set — required for embeddings");
    _openai = new OpenAI({ apiKey: key });
  }
  return _openai;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 8000);
  if (!cleaned) return [];

  const res = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: cleaned,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return res.data[0]?.embedding ?? [];
}

function buildGrantText(grant: {
  name: string;
  funder: string;
  eligibility: string;
  description?: string | null;
  objectives?: string | null;
  sectors?: string[];
  applicantTypes?: string[];
  regions?: string[];
}): string {
  const parts = [
    `Grant: ${grant.name}`,
    `Funder: ${grant.funder}`,
    grant.eligibility ? `Eligibility: ${grant.eligibility.slice(0, 2000)}` : "",
    grant.description ? `Description: ${grant.description.slice(0, 1500)}` : "",
    grant.objectives ? `Objectives: ${grant.objectives.slice(0, 500)}` : "",
    grant.sectors?.length ? `Sectors: ${grant.sectors.join(", ")}` : "",
    grant.applicantTypes?.length ? `Applicant types: ${grant.applicantTypes.join(", ")}` : "",
    grant.regions?.length ? `Regions: ${grant.regions.join(", ")}` : "",
  ];
  return parts.filter(Boolean).join("\n");
}

function buildProfileText(profile: {
  businessName: string;
  sector: string;
  missionStatement: string;
  description: string;
  location: string;
  fundingPurposes: string[];
  fundingDetails?: string | null;
  employeeCount?: number | null;
  annualRevenue?: number | null;
}): string {
  const parts = [
    `Business: ${profile.businessName}`,
    `Sector: ${profile.sector}`,
    `Mission: ${profile.missionStatement}`,
    `Description: ${profile.description}`,
    `Location: ${profile.location}`,
    `Funding purposes: ${profile.fundingPurposes.join(", ")}`,
    profile.fundingDetails ? `Funding details: ${profile.fundingDetails}` : "",
    profile.employeeCount ? `Employees: ${profile.employeeCount}` : "",
    profile.annualRevenue ? `Revenue: £${profile.annualRevenue.toLocaleString("en-GB")}` : "",
  ];
  return parts.filter(Boolean).join("\n");
}

export async function generateAndStoreGrantEmbedding(grantId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: grant } = await supabase
    .from("Grant")
    .select("id, name, funder, eligibility, description, objectives, sectors, applicantTypes, regions")
    .eq("id", grantId)
    .maybeSingle();

  if (!grant) return;

  const text = buildGrantText(grant as Parameters<typeof buildGrantText>[0]);
  const embedding = await generateEmbedding(text);
  if (embedding.length === 0) return;

  await supabase
    .from("Grant")
    .update({ embedding: JSON.stringify(embedding) })
    .eq("id", grantId);
}

export async function generateAndStoreProfileEmbedding(profileId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from("BusinessProfile")
    .select("id, businessName, sector, missionStatement, description, location, fundingPurposes, fundingDetails, employeeCount, annualRevenue")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile) return;

  const text = buildProfileText(profile as Parameters<typeof buildProfileText>[0]);
  const embedding = await generateEmbedding(text);
  if (embedding.length === 0) return;

  await supabase
    .from("BusinessProfile")
    .update({ embedding: JSON.stringify(embedding) })
    .eq("id", profileId);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface EmbeddingMatch {
  grantId: string;
  similarity: number;
}

/**
 * Rank grants by embedding similarity to a profile.
 * Returns top N sorted by similarity descending.
 */
export async function rankGrantsByEmbedding(
  profileId: string,
  grantIds: string[],
  topN: number = 10
): Promise<EmbeddingMatch[]> {
  if (grantIds.length === 0) return [];

  const supabase = getSupabaseAdmin();

  const { data: profileRow } = await supabase
    .from("BusinessProfile")
    .select("embedding")
    .eq("id", profileId)
    .maybeSingle();

  const profileEmbedding = parseEmbedding(profileRow?.embedding);
  if (!profileEmbedding) return [];

  const { data: grantRows } = await supabase
    .from("Grant")
    .select("id, embedding")
    .in("id", grantIds);

  if (!grantRows?.length) return [];

  const results: EmbeddingMatch[] = [];
  for (const g of grantRows) {
    const grantEmbedding = parseEmbedding(g.embedding);
    if (!grantEmbedding) continue;
    const similarity = cosineSimilarity(profileEmbedding, grantEmbedding);
    results.push({ grantId: g.id, similarity });
  }

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);
}

function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Backfill embeddings for all grants/profiles that don't have one yet.
 * Call from an admin endpoint or one-off script.
 */
export async function backfillMissingEmbeddings(): Promise<{ grants: number; profiles: number }> {
  const supabase = getSupabaseAdmin();
  let grantCount = 0;
  let profileCount = 0;

  const { data: grants } = await supabase
    .from("Grant")
    .select("id")
    .is("embedding", null)
    .limit(200);

  for (const g of grants ?? []) {
    try {
      await generateAndStoreGrantEmbedding(g.id);
      grantCount++;
    } catch (err) {
      console.error(`[embeddings] Grant ${g.id} failed:`, err);
    }
  }

  const { data: profiles } = await supabase
    .from("BusinessProfile")
    .select("id")
    .is("embedding", null)
    .limit(50);

  for (const p of profiles ?? []) {
    try {
      await generateAndStoreProfileEmbedding(p.id);
      profileCount++;
    } catch (err) {
      console.error(`[embeddings] Profile ${p.id} failed:`, err);
    }
  }

  return { grants: grantCount, profiles: profileCount };
}
