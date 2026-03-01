import Link from "next/link";
import {
  FileCheck,
  LayoutDashboard,
  Building2,
  Search,
  FileText,
  CreditCard,
  Brain,
} from "lucide-react";
import { UserNav } from "@/components/layout/user-nav";

export const dynamic = "force-dynamic";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "Profile", icon: Building2 },
  { href: "/grants", label: "Grants", icon: Search },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/intelligence", label: "Intelligence", icon: Brain },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <FileCheck className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">
              GrantPilot
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>

          <UserNav />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
