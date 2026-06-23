"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, Check, ChevronDown, LogOut, Plus, User } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { switchBusinessProfile } from "@/app/(dashboard)/profile/actions";

type UserNavProfile = {
  id: string;
  businessName: string | null;
  completionScore?: number | null;
};

function displayInitials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "U";
}

export function UserNav({
  accountName,
  profiles = [],
  activeProfileId,
  profileLimit = 1,
}: {
  accountName?: string | null;
  profiles?: UserNavProfile[];
  activeProfileId?: string | null;
  profileLimit?: number;
}) {
  const router = useRouter();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSwitching, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />;
  }

  if (!user) return null;

  const fallbackName = user.email?.split("@")[0] ?? "Account";
  const displayName = accountName?.trim() || fallbackName;
  const initials = displayInitials(displayName);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  function handleSwitchProfile(profileId: string) {
    if (profileId === activeProfileId || isSwitching) return;
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-11 gap-2 rounded-full border border-[#dce6f4] bg-white px-1.5 text-[#071a3a] shadow-sm hover:bg-[#f5f9ff] sm:px-2.5 sm:pr-3"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#2468e8,#35c386)] text-xs font-black text-white">
            {initials}
          </span>
          <span className="hidden max-w-[150px] truncate text-sm font-extrabold sm:inline">
            {displayName}
          </span>
          <ChevronDown className="hidden h-4 w-4 text-[#64748b] sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="end" forceMount>
        <div className="flex items-center gap-2 p-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </div>
          <div className="flex flex-col space-y-0.5">
            <p className="text-sm font-medium">{displayName}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        {profiles.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-bold uppercase text-muted-foreground">
              Business profiles
            </DropdownMenuLabel>
            {profiles.map((profile) => {
              const active = profile.id === activeProfileId;
              const name = profile.businessName?.trim() || "Untitled business profile";
              return (
                <DropdownMenuItem
                  key={profile.id}
                  disabled={active || isSwitching}
                  onSelect={() => handleSwitchProfile(profile.id)}
                  className="items-start gap-2"
                >
                  {active ? (
                    <Check className="mt-0.5 h-4 w-4 text-[#18a45f]" />
                  ) : (
                    <Building2 className="mt-0.5 h-4 w-4" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {Math.max(0, Number(profile.completionScore ?? 0))}% complete
                    </span>
                  </span>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuItem onClick={() => router.push("/profile?manage=profiles")}>
              <Plus className="mr-2 h-4 w-4" />
              {profiles.length < profileLimit ? "Add or manage profiles" : "Manage profiles"}
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/profile")}>
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
