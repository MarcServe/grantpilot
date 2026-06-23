"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBusinessProfile, switchBusinessProfile } from "@/app/(dashboard)/profile/actions";

type BusinessProfileSummary = {
  id: string;
  businessName: string | null;
  location?: string | null;
  sector?: string | null;
  completionScore?: number | null;
};

function profileLabel(profile: BusinessProfileSummary): string {
  return profile.businessName?.trim() || "Untitled business profile";
}

export function BusinessProfilesManager({
  profiles,
  activeProfileId,
  profileLimit,
  planName,
}: {
  profiles: BusinessProfileSummary[];
  activeProfileId: string | null;
  profileLimit: number;
  planName: string;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [isPending, startTransition] = useTransition();
  const canCreate = profiles.length < profileLimit;

  function handleSwitch(profileId: string) {
    if (profileId === activeProfileId || isPending) return;
    startTransition(async () => {
      const result = await switchBusinessProfile(profileId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Business profile switched");
      router.refresh();
    });
  }

  function handleCreate() {
    const name = businessName.trim();
    if (!name || isPending) return;
    startTransition(async () => {
      const result = await createBusinessProfile({ businessName: name });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Business profile created");
      setBusinessName("");
      setDialogOpen(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-[#dce6f4] bg-white p-5 shadow-[0_18px_45px_rgba(7,26,58,0.07)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#2468e8]" />
            <h2 className="text-lg font-black text-[#071a3a]">Business profiles</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Manage the companies under this account. Matches, applications, documents, and profile edits use the active
            business profile.
          </p>
        </div>
        <div className="shrink-0 rounded-full bg-[#eef5ff] px-3 py-1 text-xs font-bold text-[#31547d]">
          {profiles.length}/{profileLimit} on {planName}
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {profiles.map((profile) => {
          const active = profile.id === activeProfileId;
          return (
            <div
              key={profile.id}
              className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                active ? "border-[#2468e8] bg-[#f5f9ff]" : "border-[#dce6f4] bg-white"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-extrabold text-[#071a3a]">{profileLabel(profile)}</p>
                  {active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#dff7ea] px-2 py-0.5 text-[11px] font-bold text-[#126b3f]">
                      <Check className="h-3 w-3" />
                      Active
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {[profile.location, profile.sector].filter(Boolean).join(" - ") || "Complete this profile to improve matches"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground">
                  {Math.max(0, Number(profile.completionScore ?? 0))}% complete
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={active ? "outline" : "default"}
                  disabled={active || isPending}
                  onClick={() => handleSwitch(profile.id)}
                >
                  {active ? "Current" : "Switch"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-muted-foreground">
          {canCreate
            ? "Add another profile when you manage multiple companies or grant pipelines."
            : `Your ${planName} plan is at its business profile limit.`}
        </p>
        {canCreate ? (
          <Button type="button" onClick={() => setDialogOpen(true)} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            Add business profile
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => router.push("/billing")} className="shrink-0">
            Upgrade to add more
          </Button>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add business profile</DialogTitle>
            <DialogDescription>
              Create a separate profile for another company. It becomes the active profile immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="business-profile-name">Business name</Label>
            <Input
              id="business-profile-name"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder="e.g. Acme Innovations Ltd"
              maxLength={140}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreate} disabled={!businessName.trim() || isPending}>
              {isPending ? "Creating..." : "Create profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
