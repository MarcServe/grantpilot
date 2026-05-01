import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  ChevronRight,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileText,
  Gauge,
  LayoutDashboard,
  Play,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
} from "lucide-react";

const navItems = ["Features", "How It Works", "Pricing", "Resources", "About Us"];

const stats = [
  { label: "Opportunities", value: "12", detail: "New matches", icon: BriefcaseBusiness, tone: "blue" },
  { label: "In Progress", value: "7", detail: "Applications", icon: FileCheck2, tone: "green" },
  { label: "Submitted", value: "5", detail: "Applications", icon: ClipboardCheck, tone: "purple" },
  { label: "Success Rate", value: "78%", detail: "Above avg.", icon: Gauge, tone: "mint" },
];

const opportunities = [
  { name: "Innovate UK Smart Grant", detail: "Up to £25,000 · Innovation", score: "92%" },
  { name: "Small Business Research Initiative", detail: "Up to £15,000 · Research", score: "85%" },
  { name: "Green Growth Fund", detail: "Up to £50,000 · Sustainability", score: "78%" },
];

const menuItems = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Opportunities", icon: BriefcaseBusiness },
  { label: "Applications", icon: FileText },
  { label: "My Profile", icon: Users },
  { label: "Data Vault", icon: Database },
  { label: "Activity", icon: Gauge },
  { label: "Analytics", icon: BarChart3 },
  { label: "Settings", icon: Settings },
];

const trustLogos = ["startpath", "LaunchHub", "Founders.Space", "UKTN", "Enterprise Nation", "tech spark"];

const toneClasses: Record<string, string> = {
  blue: "bg-blue-100 text-blue-600",
  green: "bg-emerald-100 text-emerald-600",
  purple: "bg-violet-100 text-violet-600",
  mint: "bg-teal-100 text-teal-600",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#f7fbff] text-[#071a3a]">
      <header className="mx-auto flex max-w-[1480px] items-center justify-between px-6 py-6 lg:px-10">
        <Link href="/" className="flex items-center gap-3" aria-label="GrantsCopilot home">
          <Image
            src="/logogc.png"
            alt=""
            width={88}
            height={88}
            className="h-16 w-16 object-contain"
            priority
          />
          <div className="leading-none">
            <div className="text-[30px] font-black tracking-tight">
              Grants<span className="text-[#2468e8]">Copilot</span>
            </div>
            <div className="mt-1 text-[13px] font-semibold text-[#071a3a]">
              Find it. Fill it. Fund it. <span className="text-[#2fbf84]">On Autopilot.</span>
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-12 text-[15px] font-bold text-[#071a3a] lg:flex">
          {navItems.map((item) => (
            <a key={item} href={`#${item.toLowerCase().replaceAll(" ", "-")}`}>
              {item}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="hidden text-[15px] font-bold text-[#071a3a] sm:inline-flex">
            Log in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-12 items-center rounded-lg bg-[#2167e8] px-6 text-[15px] font-bold text-white shadow-[0_12px_24px_rgba(33,103,232,0.25)] transition hover:bg-[#1858cf]"
          >
            Book a Demo
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1480px] items-center gap-10 px-6 pb-10 pt-8 lg:grid-cols-[0.78fr_1.22fr] lg:px-10 lg:pb-12 lg:pt-10">
          <div className="max-w-[610px]">
            <div className="inline-flex h-8 items-center gap-2 rounded-full bg-[#e8f0ff] px-4 text-[14px] font-bold text-[#105fdf]">
              <Sparkles className="h-4 w-4" />
              AI-Powered Grant Automation
            </div>

            <h1 className="mt-8 text-[54px] font-black leading-[1.04] tracking-normal text-[#071a3a] sm:text-[70px] lg:text-[72px]">
              Find Grants.
              <br />
              Apply Automatically.
              <br />
              <span className="text-[#35c386]">Get Funded.</span>
            </h1>

            <p className="mt-6 max-w-[560px] text-[20px] font-medium leading-[1.5] text-[#09224a]">
              GrantsCopilot uses AI to find the right funding for your business, check your eligibility, and complete
              applications — all on autopilot.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/sign-up"
                className="inline-flex h-14 items-center justify-center gap-3 rounded-lg bg-[#2167e8] px-7 text-[17px] font-extrabold text-white shadow-[0_14px_26px_rgba(33,103,232,0.24)] transition hover:bg-[#1858cf]"
              >
                Get Started Free
                <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex h-14 items-center justify-center gap-3 rounded-lg border border-[#d8e2f2] bg-white px-7 text-[17px] font-extrabold text-[#071a3a] shadow-[0_10px_22px_rgba(9,34,74,0.08)]"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#071a3a]">
                  <Play className="ml-0.5 h-3.5 w-3.5 fill-[#071a3a]" />
                </span>
                See How It Works
              </a>
            </div>

            <div className="mt-10 grid max-w-[560px] grid-cols-1 gap-6 text-[14px] font-bold text-[#09224a] sm:grid-cols-3">
              <Feature icon={Sparkles} title="AI-Powered" detail="Intelligence" />
              <Feature icon={ShieldCheck} title="Secure &" detail="Compliant" />
              <Feature icon={Users} title="Trusted by" detail="Startups & SMEs" />
            </div>
          </div>

          <DashboardPreview />
        </section>

        <section id="how-it-works" className="mx-auto max-w-[1480px] px-6 pb-8 pt-2 lg:px-10">
          <div className="rounded-[18px] bg-[linear-gradient(115deg,#123577_0%,#0d3e95_52%,#2468e8_100%)] px-9 py-7 text-white shadow-[0_22px_55px_rgba(10,50,120,0.16)] lg:px-10">
            <div className="mb-5 flex items-center justify-center gap-7">
              <span className="hidden h-px w-20 bg-white/25 sm:block" />
              <h2 className="text-center text-[30px] font-black tracking-normal">How GrantsCopilot Works</h2>
              <span className="hidden h-px w-20 bg-white/25 sm:block" />
            </div>

            <div className="grid items-center gap-6 lg:grid-cols-[1fr_0.36fr_1fr_0.36fr_1fr_0.36fr_1.5fr]">
              <Step icon={Search} title="1. Find" text="We scan thousands of sources daily to find relevant grants for your business." />
              <ArrowDivider />
              <Step icon={Target} title="2. Match" text="Our AI checks your eligibility and ranks opportunities by your chance of success." accent="green" />
              <ArrowDivider />
              <Step icon={Send} title="3. Apply" text="We complete and submit applications automatically using your data." accent="purple" />
              <ArrowDivider />
              <div className="flex min-h-[126px] items-center gap-6 rounded-xl border border-white/22 bg-white/8 px-7 py-5">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#35c386]/20">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#35c386] text-white shadow-[0_0_0_8px_rgba(53,195,134,0.18)]">
                    <Trophy className="h-8 w-8" />
                  </div>
                </div>
                <div>
                  <h3 className="text-[22px] font-black">Get Funded</h3>
                  <p className="mt-2 text-[14px] font-medium leading-6 text-white/90">
                    More approvals. Less effort. That&apos;s the power of GrantsCopilot.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-6 pb-12 pt-4 text-center">
          <p className="text-[16px] font-semibold text-[#09224a]">Trusted by ambitious founders and growing businesses</p>
          <div className="mt-7 grid grid-cols-2 items-center gap-8 text-[#071a3a] sm:grid-cols-3 lg:grid-cols-6">
            {trustLogos.map((logo) => (
              <div key={logo} className="flex items-center justify-center gap-2 text-[21px] font-black tracking-tight">
                <span className="h-5 w-5 rounded-[4px] bg-[#071a3a]" />
                <span>{logo}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[860px]">
      <div className="absolute -inset-5 rounded-[34px] bg-[#dceaff]/65 blur-3xl" />
      <div className="relative grid overflow-hidden rounded-[20px] bg-white shadow-[0_30px_80px_rgba(7,26,58,0.14)] lg:grid-cols-[180px_1fr]">
        <aside className="hidden bg-[#001a34] px-4 py-6 text-white lg:block">
          <h2 className="px-2 text-[21px] font-black">GrantsCopilot</h2>
          <div className="mt-6 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className={`flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-bold ${
                    item.active ? "bg-[#2167e8]" : "text-white/88"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </div>
              );
            })}
          </div>
          <div className="mt-12 rounded-xl border border-white/22 p-4">
            <p className="text-[13px] font-semibold text-white/86">Profile Strength</p>
            <p className="mt-2 text-[24px] font-black">92%</p>
            <div className="mt-3 h-2 rounded-full bg-white/18">
              <div className="h-full w-[92%] rounded-full bg-[#35c386]" />
            </div>
            <p className="mt-3 text-[12px] font-medium text-white/82">Excellent</p>
          </div>
        </aside>

        <div className="min-w-0 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[21px] font-black text-[#071a3a]">Welcome back, Michael! 👋</h2>
              <p className="mt-1 text-[12px] font-medium text-[#54657f]">Here&apos;s your funding overview</p>
            </div>
            <div className="flex items-center gap-4">
              <Bell className="h-5 w-5 text-[#071a3a]" />
              <div className="hidden items-center gap-2 sm:flex">
                <div className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#123577,#35c386)]" />
                <span className="text-[12px] font-bold">Michael Orji</span>
              </div>
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-lg border border-[#eef2f7] bg-white p-4 shadow-[0_10px_28px_rgba(9,34,74,0.07)]">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-full ${toneClasses[stat.tone]}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold text-[#65748c]">{stat.label}</p>
                      <p className="text-[24px] font-black leading-none text-[#071a3a]">{stat.value}</p>
                      <p className="mt-1 text-[11px] font-semibold text-[#071a3a]">{stat.detail}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border border-[#eef2f7] bg-white p-5 shadow-[0_10px_28px_rgba(9,34,74,0.07)]">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-black text-[#071a3a]">Top Matched Opportunities</h3>
                <Link href="/grants/eligible" className="text-[12px] font-bold text-[#2167e8]">
                  View all
                </Link>
              </div>
              <div className="mt-4 divide-y divide-[#edf2f7]">
                {opportunities.map((grant) => (
                  <div key={grant.name} className="flex items-center gap-3 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-[#2167e8]">
                      <FileCheck2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-black text-[#071a3a]">{grant.name}</p>
                      <p className="mt-1 text-[10px] font-semibold text-[#54657f]">{grant.detail}</p>
                    </div>
                    <span className="rounded-md bg-[#dff8ed] px-2 py-1 text-center text-[11px] font-black leading-none text-[#087f59]">
                      {grant.score}
                      <br />
                      <span className="text-[9px] font-bold">Match</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-[#9aabc1]" />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[#eef2f7] bg-white p-5 shadow-[0_10px_28px_rgba(9,34,74,0.07)]">
              <h3 className="text-[15px] font-black text-[#071a3a]">Application Progress</h3>
              <div className="mt-5 flex items-center justify-center gap-8">
                <div className="grid h-32 w-32 place-items-center rounded-full bg-[conic-gradient(#2167e8_0_42%,#35c386_42%_73%,#4bc7ad_73%_100%)]">
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-center shadow-inner">
                    <div>
                      <p className="text-[26px] font-black leading-none text-[#071a3a]">7</p>
                      <p className="mt-1 text-[11px] font-semibold text-[#54657f]">In Progress</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4 text-[12px] font-bold">
                  <Legend color="bg-[#2167e8]" label="Draft" value="3" />
                  <Legend color="bg-[#4bc7ad]" label="In Review" value="2" />
                  <Legend color="bg-[#35c386]" label="Ready to Submit" value="2" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg bg-[#eaf3ff] px-8 py-5">
            <div className="flex items-center justify-between gap-5">
              <div>
                <p className="text-[17px] font-black text-[#071a3a]">Save time. Increase success. Get funded.</p>
                <p className="mt-2 text-[12px] font-medium text-[#2a4065]">
                  GrantsCopilot handles the heavy lifting, so you can focus on growing your business.
                </p>
              </div>
              <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#d7e8ff] text-[#2167e8] sm:flex">
                <Bot className="h-9 w-9" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, detail }: { icon: typeof Sparkles; title: string; detail: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-6 w-6 shrink-0 text-[#2167e8]" />
      <div className="leading-tight">
        <div>{title}</div>
        <div>{detail}</div>
      </div>
    </div>
  );
}

function Step({
  icon: Icon,
  title,
  text,
  accent = "blue",
}: {
  icon: typeof Search;
  title: string;
  text: string;
  accent?: "blue" | "green" | "purple";
}) {
  const accentClass =
    accent === "green" ? "text-[#35c386] shadow-[#35c386]/30" : accent === "purple" ? "text-[#8d6bf6] shadow-[#8d6bf6]/30" : "text-[#2167e8] shadow-[#2167e8]/30";

  return (
    <div className="grid grid-cols-[86px_1fr] items-center gap-5">
      <div className={`flex h-20 w-20 items-center justify-center rounded-full bg-white ${accentClass} shadow-[0_0_0_8px_var(--tw-shadow-color)]`}>
        <Icon className="h-9 w-9" />
      </div>
      <div>
        <h3 className="text-[22px] font-black">{title}</h3>
        <p className="mt-2 text-[14px] font-medium leading-6 text-white/92">{text}</p>
      </div>
    </div>
  );
}

function ArrowDivider() {
  return (
    <div className="hidden items-center justify-center text-[#35c386] lg:flex">
      <div className="h-px w-full border-t border-dashed border-[#35c386]/70" />
      <ArrowRight className="-ml-2 h-6 w-6 shrink-0" />
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[14px_1fr_16px] items-center gap-2">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
