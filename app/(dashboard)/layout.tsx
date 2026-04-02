import Image from "next/image";
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
            <Image 
              src="/logo.png" 
              alt="GrantsCopilot Logo" 
              width={160} 
              height={40} 
              className="h-8 w-auto object-contain"
              priority
            />
          </Link>

          <DashboardNav />

          <UserNav />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
