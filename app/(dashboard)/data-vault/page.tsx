import { loadFounderPackLabels } from "@/lib/founder-pack-labels";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { savedPackDocumentTypes } from "@/lib/founder-pack-vault";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getProfile } from "@/app/(dashboard)/profile/actions";
import { Button } from "@/components/ui/button";
import { DataVaultClient } from "@/components/data-vault/data-vault-client";

type RawDocument = {
  id?: string;
  name?: string;
  url?: string;
  type?: string;
  size?: number;
  category?: string | null;
};

export default async function DataVaultPage() {
  const [{ orgId }, profile] = await Promise.all([getActiveOrg(), getProfile()]);
  const { data: packs, error: packError } = await getSupabaseAdmin()
    .from("FounderFundingPack").select("id, inputs, createdAt")
    .eq("organisationId", orgId).eq("profileId", profile.id)
    .order("createdAt", { ascending: false }).limit(20);
  const packLabels = await loadFounderPackLabels(getSupabaseAdmin(), orgId, packs ?? []);
  const documents = Array.isArray(profile.documents)
    ? profile.documents.map((document: RawDocument) => ({
        id: String(document.id ?? ""),
        name: String(document.name ?? "Untitled document"),
        url: String(document.url ?? ""),
        type: String(document.type ?? ""),
        size: Number(document.size ?? 0),
        category: document.category ?? null,
      }))
    : [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-0 sm:px-2">
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-[0_18px_45px_rgba(7,26,58,0.07)] sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#667895]">Reusable funding evidence</p>
          <h1 className="mt-2 text-2xl font-black text-[#071a3a]">Data Vault</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#51627d] sm:text-base">
            Keep supporting documents, team roles, and leadership evidence in one place. GrantsCopilot uses this data during eligibility reasoning and document preparation.
          </p>
        </div>
        <Button asChild variant="outline" className="w-full gap-2 sm:w-auto">
          <Link href="/profile?step=6">
            Open full profile
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <section className="rounded-2xl border bg-white p-5 sm:p-6" aria-labelledby="saved-founder-documents">
        <h2 id="saved-founder-documents" className="text-xl font-bold">Founder Pack documents</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Generated documents are saved here automatically for this business, including existing packs.
          The assistant can reuse the three latest packs as draft reference material.
          Review drafts before use; they do not replace confirmed business facts or verified supporting evidence.
        </p>
        {packError ? <p role="status" className="mt-4">Saved documents could not be loaded. Refresh to try again.</p> :
          !packs?.length ? <p className="mt-4 text-sm">Create your first documents in <Link href="/founder-pack" className="underline">Founder Pack</Link>.</p> :
          <div className="mt-4 space-y-3">{packs.map(pack => <details key={pack.id} className="rounded-xl border p-4">
            <summary className="cursor-pointer font-medium">{packLabels.get(pack.id)}<span className="mt-1 block text-xs font-normal text-muted-foreground">{new Date(pack.createdAt).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" })} · AI draft</span></summary>
            <ul className="mt-3 space-y-3">{savedPackDocumentTypes(pack.inputs).map(type => <li key={type.value} className="flex flex-wrap items-center justify-between gap-3">
              <span>{type.label}</span>
              <span className="flex gap-4">{["pdf", "docx"].map(format => <a key={format} className="text-sm text-blue-700 underline" href={`/api/founder-pack/${encodeURIComponent(pack.id)}/export?format=${format}&documentType=${type.value}`} aria-label={`Download ${type.label} as ${format.toUpperCase()}`}>{format.toUpperCase()}</a>)}</span>
            </li>)}</ul>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <a className="underline" href={`/api/founder-pack/${encodeURIComponent(pack.id)}/export?format=pdf`}>Download complete pack PDF</a>
              <Link className="underline" href="/founder-pack">Open Founder Pack workspace</Link>
            </div>
          </details>)}</div>}
        <p className="mt-3 text-xs text-muted-foreground">Showing the latest 20 packs. Full-pack history remains in Founder Pack. Downloads follow your application-pack access.</p>
      </section>

      <DataVaultClient
        profile={{
          id: profile.id,
          businessName: profile.businessName ?? null,
          directorNames: profile.directorNames ?? null,
          directorProfiles: profile.directorProfiles ?? null,
          teamMembers: profile.teamMembers ?? null,
          boardMembers: profile.boardMembers ?? null,
          teamExpertise: profile.teamExpertise ?? null,
          documents,
        }}
      />
    </div>
  );
}
