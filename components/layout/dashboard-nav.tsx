"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileCheck,
  LayoutDashboard,
  Building2,
  Search,
  Sparkles,
  FileText,
  CreditCard,
  Brain,
  Menu,
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

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "Profile", icon: Building2 },
  { href: "/grants/eligible", label: "My Matches", icon: Sparkles },
  { href: "/grants", label: "Grants", icon: Search },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/intelligence", label: "Intelligence", icon: Brain },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

function NavLinks({ className, onLinkClick }: { className?: string; onLinkClick?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onLinkClick}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            (pathname === item.href || (item.href !== "/grants" && pathname.startsWith(item.href)))
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
            className
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
    </>
  );
}

export function DashboardNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Desktop nav: hidden below md */}
      <nav className="hidden items-center gap-1 md:flex">
        <NavLinks />
      </nav>

      {/* Mobile: hamburger + sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] sm:max-w-[280px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-left">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <FileCheck className="h-5 w-5 text-primary-foreground" />
              </div>
              Grants-Copilot
            </SheetTitle>
          </SheetHeader>
          <nav className="mt-6 flex flex-col gap-1">
            <NavLinks className="w-full justify-start" onLinkClick={() => setOpen(false)} />
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
