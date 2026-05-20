import Image from "next/image";
import Link from "next/link";
import { Bell } from "lucide-react";
import { UserNav } from "@/components/layout/user-nav";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { getActiveOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { org } = await getActiveOrg();
  const profile = org.profiles?.[0];
  const profileStrength = profile?.completionScore ?? 0;

  return (
    <div className="min-h-screen bg-[#f4f8ff] text-[#071a3a]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden h-screen max-h-screen w-[250px] flex-col overflow-hidden bg-[#041d38] px-5 py-7 text-white lg:flex">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-3" aria-label="GrantsCopilot dashboard">
          <Image
            src="/logogc.png"
            alt=""
            width={58}
            height={58}
            className="h-12 w-12 rounded-xl object-contain"
            priority
          />
          <div className="leading-none">
            <div className="text-[22px] font-black tracking-tight">
              Grants<span className="text-[#69a1ff]">Copilot</span>
            </div>
            <div className="mt-1 text-[10px] font-semibold text-white/58">
              Funding intelligence
            </div>
          </div>
        </Link>

        <div className="mt-8 flex min-h-0 flex-1 flex-col overflow-hidden">
          <DashboardNav profileStrength={profileStrength} placement="sidebar" />
        </div>
      </aside>

      <div className="min-w-0 lg:pl-[250px]">
        <header className="sticky top-0 z-30 border-b border-[#dfe8f5] bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-20 max-w-[1280px] items-center justify-between gap-2 px-3 sm:px-7 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <DashboardNav profileStrength={profileStrength} placement="header" />
              <Link href="/dashboard" className="flex min-w-0 items-center gap-2 lg:hidden">
                <Image
                  src="/logogc.png"
                  alt=""
                  width={42}
                  height={42}
                  className="h-10 w-10 object-contain"
                  priority
                />
                <span className="hidden truncate text-lg font-black min-[390px]:inline">
                  Grants<span className="text-[#2468e8]">Copilot</span>
                </span>
              </Link>
              <div className="hidden lg:block">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6f7f96]">
                  Autonomous Funding Infrastructure
                </p>
                <p className="mt-1 text-sm font-semibold text-[#243a5a]">
                  Find it. Fill it. Fund it. Apply on autopilot.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                className="hidden h-10 w-10 items-center justify-center rounded-full border border-[#dce6f4] bg-white text-[#071a3a] shadow-sm min-[360px]:flex"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
              </button>
              <UserNav />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-[1280px] px-3 py-5 sm:px-7 sm:py-7 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
