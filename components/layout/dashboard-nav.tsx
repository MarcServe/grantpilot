"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BriefcaseBusiness,
  CreditCard,
  Database,
  FileText,
  LayoutDashboard,
  Menu,
  MessageSquareReply,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const primaryNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/grants/eligible", label: "Opportunities", icon: BriefcaseBusiness },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/applications/outcomes", label: "Outcome feedback", icon: MessageSquareReply },
  { href: "/profile", label: "My Profile", icon: UserRound },
  { href: "/profile", label: "Data Vault", icon: Database },
  { href: "/intelligence", label: "Intelligence", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

const secondaryNavItems = [
  { href: "/founder-pack", label: "Founder Pack", icon: Sparkles },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

function isActive(pathname: string, href: string, label: string): boolean {
  if (label === "Data Vault") return false;
  if (href === "/dashboard") return pathname === href;
  if (href === "/applications/outcomes") {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  if (href === "/applications") {
    if (pathname.startsWith("/applications/outcomes")) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  className,
  onLinkClick,
  compact = false,
}: {
  className?: string;
  onLinkClick?: () => void;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const groups = [primaryNavItems, secondaryNavItems];

  return (
    <>
      {groups.map((items, groupIndex) => (
        <div key={groupIndex} className={cn(groupIndex > 0 && "mt-7 border-t border-white/10 pt-5")}>
          {groupIndex > 0 && !compact && (
            <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white/45">
              Growth
            </p>
          )}
          <div className="space-y-1.5">
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href, item.label);
              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  prefetch
                  onMouseEnter={() => router.prefetch(item.href)}
                  onFocus={() => router.prefetch(item.href)}
                  onClick={onLinkClick}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-lg px-3 text-[14px] font-extrabold transition-colors",
                    compact
                      ? active
                        ? "bg-[#2167e8] text-white"
                        : "text-[#243a5a] hover:bg-[#eaf3ff] hover:text-[#071a3a]"
                      : active
                        ? "bg-[#2f6df0] text-white shadow-[0_12px_24px_rgba(33,103,232,0.24)]"
                        : "text-white/86 hover:bg-white/9 hover:text-white",
                    className
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

type DashboardNavPlacement = "sidebar" | "header";

export function DashboardNav({
  profileStrength = 0,
  placement = "sidebar",
}: {
  profileStrength?: number;
  placement?: DashboardNavPlacement;
}) {
  const [open, setOpen] = useState(false);
  const score = Math.max(0, Math.min(100, Math.round(profileStrength)));

  if (placement === "header") {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] bg-white sm:max-w-[300px]">
          <SheetHeader>
            <SheetTitle className="text-left text-xl font-black text-[#071a3a]">
              Grants<span className="text-[#2468e8]">Copilot</span>
            </SheetTitle>
          </SheetHeader>
          <nav className="mt-6">
            <NavLinks compact onLinkClick={() => setOpen(false)} />
          </nav>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch] pr-0.5">
        <NavLinks />
      </nav>

      <div className="mt-auto shrink-0 rounded-2xl border border-white/18 bg-white/[0.04] p-4 text-white">
        <p className="text-[13px] font-bold text-white/86">Profile Strength</p>
        <p className="mt-2 text-[28px] font-black leading-none">{score}%</p>
        <div className="mt-4 h-2 rounded-full bg-white/18">
          <div className="h-full rounded-full bg-[#35c386]" style={{ width: `${score}%` }} />
        </div>
        <p className="mt-3 text-[12px] font-medium text-white/82">
          {score >= 85 ? "Excellent" : score >= 60 ? "Good progress" : "Needs attention"}
        </p>
      </div>
    </>
  );
}
