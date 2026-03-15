import Link from "next/link";
import { FileCheck } from "lucide-react";
import { UserNav } from "@/components/layout/user-nav";
import { DashboardNav } from "@/components/layout/dashboard-nav";

export const dynamic = "force-dynamic";

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
              Grants-Copilot
            </span>
          </Link>

          <DashboardNav />

          <UserNav />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
