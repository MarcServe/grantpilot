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
  const profile = await getProfile();
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
