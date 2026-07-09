import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
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
import { PLAN_CATALOG } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { HeroMotionVideo } from "@/components/marketing/hero-motion-video";

const navItems = ["Features", "How It Works", "Pricing", "Resources", "About Us"];

const stats = [
  { label: "Opportunities", value: "12", detail: "New matches", icon: BriefcaseBusiness, tone: "blue" },
  { label: "In Progress", value: "7", detail: "Applications", icon: FileCheck2, tone: "green" },
  { label: "Submitted", value: "5", detail: "Applications", icon: ClipboardCheck, tone: "purple" },
  { label: "Readiness", value: "85%", detail: "High fit", icon: Gauge, tone: "mint" },
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
  { label: "Intelligence", icon: BarChart3 },
  { label: "Settings", icon: Settings },
];

const audienceSegments = ["Startup founders", "SMEs", "Social enterprises", "Advisors", "Innovation teams", "Community groups"];

const featureCards = [
  {
    icon: Sparkles,
    title: "Business DNA Engine",
    text: "Builds a living company profile from your sector, website, funding goals, financials, documents, and previous applications.",
  },
  {
    icon: Target,
    title: "Eligibility & Fit Scoring",
    text: "Scores grants by eligibility fit, evidence gaps, location, deadline, and readiness so users know what to review first.",
  },
  {
    icon: FileCheck2,
    title: "Application Prep Workspace",
    text: "Drafts funder-ready answers, document checklists, pitch decks, budget narratives, and application tasks before you file.",
  },
  {
    icon: ShieldCheck,
    title: "Fresh Link Verification",
    text: "Prioritises live opportunities, separates direct applications from login-required portals, and avoids stale grant links.",
  },
];

const pricingTiers = PLAN_CATALOG.map((plan) => ({
  name: plan.marketingName,
  price: plan.price,
  detail: plan.detail,
  /** Short bullets above the fold */
  summaryFeatures: plan.homepageFeatures,
  /** Same grouped breakdown as Billing */
  featureBlocks: plan.features,
  cta: plan.cta,
  href: plan.href,
  featured: plan.featured,
}));

const resources = [
  {
    title: "Grant Readiness Checklist",
    text: "Know what documents, financial details, and evidence you need before applying.",
    href: "#features",
  },
  {
    title: "Direct vs Portal Grants",
    text: "Understand which grants can be prepared quickly and which require portal login or human review.",
    href: "#how-it-works",
  },
  {
    title: "Founder Funding Pack",
    text: "Generate business plans, innovation statements, market analysis, and financial projection drafts.",
    href: "/founder-pack",
  },
];

const toneClasses: Record<string, string> = {
  blue: "bg-blue-100 text-blue-600",
  green: "bg-emerald-100 text-emerald-600",
  purple: "bg-violet-100 text-violet-600",
  mint: "bg-teal-100 text-teal-600",
};

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isSignedIn = Boolean(user);

  return (
    <div className="min-h-screen overflow-hidden bg-[#f7fbff] text-[#071a3a]">
      <header className="mx-auto flex max-w-[1480px] items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6 lg:px-10">
        <Link href="/" className="flex min-w-0 items-center gap-2 sm:gap-3" aria-label="GrantsCopilot home">
          <Image
            src="/logogc.png"
            alt=""
            width={88}
            height={88}
            className="h-11 w-11 shrink-0 object-contain sm:h-16 sm:w-16"
            priority
          />
          <div className="min-w-0 leading-none">
            <div className="truncate text-[22px] font-black tracking-tight min-[420px]:text-[26px] sm:text-[30px]">
              Grants<span className="text-[#2468e8]">Copilot</span>
            </div>
            <div className="mt-1 hidden text-[12px] font-semibold text-[#071a3a] min-[430px]:block sm:text-[13px]">
              Find it. Fill it. Fund it. <span className="text-[#2fbf84]">Apply on autopilot.</span>
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

        {isSignedIn ? (
          <Link
            href="/dashboard"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#2167e8] px-3 text-[13px] font-bold text-white shadow-[0_12px_24px_rgba(33,103,232,0.25)] transition hover:bg-[#1858cf] min-[430px]:h-11 min-[430px]:px-4 sm:h-12 sm:px-6 sm:text-[15px]"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
        ) : (
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="hidden text-[15px] font-bold text-[#071a3a] sm:inline-flex">
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex h-10 shrink-0 items-center rounded-lg bg-[#2167e8] px-3 text-[13px] font-bold text-white shadow-[0_12px_24px_rgba(33,103,232,0.25)] transition hover:bg-[#1858cf] min-[430px]:h-11 min-[430px]:px-4 sm:h-12 sm:px-6 sm:text-[15px]"
            >
              <span className="min-[360px]:hidden">Start</span>
              <span className="hidden min-[360px]:inline">Get started</span>
            </Link>
          </div>
        )}
      </header>

      <main>
        <section className="mx-auto flex max-w-[1480px] flex-col gap-8 px-4 pb-10 pt-6 sm:px-6 lg:flex-row lg:items-start lg:gap-10 lg:px-10 lg:pb-12 lg:pt-10">
          <div className="order-2 w-full max-w-[610px] shrink-0 lg:order-1 lg:max-w-[min(100%,610px)] lg:basis-[min(610px,44%)]">
            <div className="inline-flex max-w-full items-start gap-2 rounded-xl bg-[#e8f0ff] px-3 py-2 text-[13px] font-bold leading-snug text-[#105fdf] sm:px-4 sm:text-[14px]">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span>Instead of searching, what if grants came to you?</span>
                <span>That is GrantsCopilot.</span>
              </span>
            </div>

            <h1 className="mt-7 text-[clamp(2.55rem,11vw,4.4rem)] font-black leading-[1.06] tracking-normal text-[#071a3a] sm:mt-8 lg:text-[72px]">
              Find Grants.
              <br />
              <span className="text-[#2167e8]">Check Eligibility.</span>
              <br />
              <span className="text-[#35c386]">Get Funded.</span>
            </h1>

            <p className="mt-5 max-w-[560px] text-[18px] font-medium leading-[1.55] text-[#09224a] sm:mt-6 sm:text-[20px]">
              Instead of spending hours searching, GrantsCopilot brings matched opportunities to you, checks each grant
              against your Business DNA, separates direct application links from grant pages, and prepares the next step.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:gap-4">
              <Link
                href={isSignedIn ? "/dashboard" : "/sign-up"}
                className="inline-flex h-[52px] min-h-[52px] items-center justify-center gap-3 rounded-lg bg-[#2167e8] px-5 text-[16px] font-extrabold text-white shadow-[0_14px_26px_rgba(33,103,232,0.24)] transition hover:bg-[#1858cf] sm:h-14 sm:px-7 sm:text-[17px]"
              >
                {isSignedIn ? "Return to dashboard" : "Get Started Free"}
                {isSignedIn ? <LayoutDashboard className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex h-[52px] min-h-[52px] items-center justify-center gap-3 rounded-lg border border-[#d8e2f2] bg-white px-5 text-[16px] font-extrabold text-[#071a3a] shadow-[0_10px_22px_rgba(9,34,74,0.08)] sm:h-14 sm:px-7 sm:text-[17px]"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#071a3a]">
                  <Play className="ml-0.5 h-3.5 w-3.5 fill-[#071a3a]" />
                </span>
                See How It Works
              </a>
            </div>

            <div className="mt-8 grid max-w-[640px] grid-cols-2 gap-4 text-[14px] font-bold text-[#09224a] min-[560px]:grid-cols-4 sm:mt-10 sm:gap-5">
              <Feature icon={Search} title="Fresh grant" detail="discovery" />
              <Feature icon={Target} title="Eligibility" detail="scoring" />
              <Feature icon={FileCheck2} title="Automated" detail="prep" />
              <Feature icon={Bell} title="Deadline" detail="reminders" />
            </div>
          </div>

          <div className="order-1 mx-auto min-w-0 w-full max-w-[640px] flex-1 rounded-2xl border border-[#e2ebf6] bg-white p-6 shadow-[0_18px_45px_rgba(7,26,58,0.07)] sm:p-8 lg:order-2 lg:mx-0 lg:mt-30 lg:max-w-none lg:rounded-2xl lg:p-8">
            <div className="flex justify-center lg:justify-start">
              <HeroMotionVideo className="h-auto max-h-[220px] w-full max-w-[560px] object-contain lg:max-h-[min(260px,28vw)] lg:max-w-full" />
            </div>
          </div>
        </section>

        <section
          className="mx-auto max-w-[1480px] px-4 pb-12 pt-2 sm:px-6 lg:px-10 lg:pb-16"
          aria-label="Workspace preview"
        >
          <div className="flex justify-center lg:justify-end">
            <DashboardPreview />
          </div>
        </section>

        <section id="features" className="mx-auto max-w-[1480px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.14em] text-[#2167e8]">Features</p>
              <h2 className="mt-4 max-w-[560px] text-[32px] font-black leading-tight tracking-normal text-[#071a3a] sm:text-[42px]">
                From grant search to grant flow.
              </h2>
              <p className="mt-5 max-w-[560px] text-lg font-medium leading-8 text-[#334766]">
                GrantsCopilot is not another grant directory. It learns what your business does, brings the right
                opportunities forward, and turns funding work into a structured application preparation pipeline.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={isSignedIn ? "/dashboard" : "/sign-up"}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#2167e8] px-6 text-sm font-black text-white shadow-[0_12px_24px_rgba(33,103,232,0.22)]"
                >
                  {isSignedIn ? "Open dashboard" : "Build My DNA Profile"}{" "}
                  {isSignedIn ? <LayoutDashboard className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                </Link>
                {!isSignedIn && (
                  <Link
                    href="/sign-in"
                    className="inline-flex h-12 items-center justify-center rounded-lg border border-[#d8e2f2] bg-white px-6 text-sm font-black text-[#071a3a]"
                  >
                    Log in
                  </Link>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {featureCards.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="rounded-2xl border border-[#e2ebf6] bg-white p-6 shadow-[0_18px_45px_rgba(7,26,58,0.07)]"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e7f1ff] text-[#2167e8]">
                      <Icon className="h-6 w-6" />
                    </span>
                    <h3 className="mt-5 text-xl font-black text-[#071a3a]">{feature.title}</h3>
                    <p className="mt-3 text-sm font-medium leading-6 text-[#51627d]">{feature.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-[1480px] px-4 pb-8 pt-2 sm:px-6 lg:px-10">
          <div className="rounded-[18px] bg-[linear-gradient(115deg,#123577_0%,#0d3e95_52%,#2468e8_100%)] px-5 py-7 text-white shadow-[0_22px_55px_rgba(10,50,120,0.16)] sm:px-9 lg:px-10">
            <div className="mb-5 flex items-center justify-center gap-7">
              <span className="hidden h-px w-20 bg-white/25 sm:block" />
              <h2 className="text-center text-[26px] font-black tracking-normal sm:text-[30px]">How GrantsCopilot Works</h2>
              <span className="hidden h-px w-20 bg-white/25 sm:block" />
            </div>

            <div className="grid items-center gap-6 lg:grid-cols-[1fr_0.36fr_1fr_0.36fr_1fr_0.36fr_1.5fr]">
              <Step icon={Search} title="1. Watch" text="Your funding radar scans grant feeds, databases, and web sources so you do not have to keep searching." />
              <ArrowDivider />
              <Step icon={Target} title="2. Match" text="Our AI checks eligibility signals and ranks opportunities by fit, gaps, and readiness." accent="green" />
              <ArrowDivider />
              <Step icon={Send} title="3. Prepare" text="Generate funder-ready answers, document checklists, pitch decks, and application tasks." accent="purple" />
              <ArrowDivider />
              <div className="flex min-h-[126px] items-center gap-6 rounded-xl border border-white/22 bg-white/8 px-7 py-5">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#35c386]/20">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#35c386] text-white shadow-[0_0_0_8px_rgba(53,195,134,0.18)]">
                    <Trophy className="h-8 w-8" />
                  </div>
                </div>
                <div>
                  <h3 className="text-[22px] font-black">Apply Faster</h3>
                  <p className="mt-2 text-[14px] font-medium leading-6 text-white/90">
                    Review the grants that matter, prepare faster, and stop losing time to stale funding pages. Full auto-filing is planned for V2.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-[1480px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10">
          <div className="text-center">
            <p className="text-sm font-black uppercase tracking-[0.14em] text-[#2167e8]">Pricing</p>
            <h2 className="mt-4 text-[32px] font-black leading-tight text-[#071a3a] sm:text-[40px]">Start with funding intelligence. Scale into automation.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg font-medium leading-8 text-[#51627d]">
              Pick the level of funding support that matches your team. Upgrade when you are ready for deeper scoring,
              application preparation, and founder pack generation. Today, GrantsCopilot focuses on discovery, scoring,
              preparation, and reminders; full auto-filing remains a V2 workflow.
            </p>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {pricingTiers.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-2xl border p-5 shadow-[0_18px_45px_rgba(7,26,58,0.07)] sm:p-7 ${
                  tier.featured
                    ? "border-[#2167e8] bg-[#071a3a] text-white"
                    : "border-[#e2ebf6] bg-white text-[#071a3a]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-black">{tier.name}</h3>
                    <p className={`mt-2 text-sm font-semibold ${tier.featured ? "text-white/72" : "text-[#51627d]"}`}>
                      {tier.detail}
                    </p>
                  </div>
                  {tier.featured && (
                    <span className="rounded-full bg-[#35c386] px-3 py-1 text-xs font-black text-white">Most useful</span>
                  )}
                </div>
                <p className="mt-7 text-4xl font-black">{tier.price}</p>
                <ul className="mt-7 space-y-3">
                  {tier.summaryFeatures.map((item) => (
                    <li key={item} className="flex gap-3 text-sm font-bold">
                      <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${tier.featured ? "text-[#35c386]" : "text-[#2167e8]"}`} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <details
                  className={`group mt-6 border-t pt-5 ${tier.featured ? "border-white/25" : "border-[#e2ebf6]"}`}
                >
                  <summary
                    className={`flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-black [&::-webkit-details-marker]:hidden ${
                      tier.featured ? "text-white/95" : "text-[#2167e8]"
                    }`}
                  >
                    <span>See full plan details</span>
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <div className={`mt-4 space-y-4 text-left ${tier.featured ? "text-white/92" : "text-[#071a3a]"}`}>
                    {tier.featureBlocks.map((block) => (
                      <div key={block.heading}>
                        <p
                          className={`text-[11px] font-black uppercase tracking-[0.12em] ${
                            tier.featured ? "text-white/55" : "text-[#51627d]"
                          }`}
                        >
                          {block.heading}
                        </p>
                        <ul className="mt-2 space-y-2">
                          {block.bullets.map((bullet) => (
                            <li key={bullet} className="flex gap-2 text-xs font-bold leading-snug sm:text-sm">
                              <CheckCircle2
                                className={`mt-0.5 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${tier.featured ? "text-[#35c386]" : "text-[#2167e8]"}`}
                              />
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
                <Link
                  href={tier.href}
                  className={`mt-8 inline-flex h-12 w-full items-center justify-center rounded-lg text-sm font-black ${
                    tier.featured
                      ? "bg-white text-[#071a3a]"
                      : "bg-[#2167e8] text-white"
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section id="resources" className="mx-auto max-w-[1480px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10">
          <div className="rounded-[24px] bg-white p-5 shadow-[0_20px_60px_rgba(7,26,58,0.08)] sm:p-7 lg:p-9">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.14em] text-[#2167e8]">Resources</p>
                <h2 className="mt-4 text-[30px] font-black leading-tight text-[#071a3a] sm:text-[38px]">Practical funding help for non-grant experts.</h2>
              </div>
              <Link href={isSignedIn ? "/dashboard" : "/sign-up"} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#2167e8] px-6 text-sm font-black text-white">
                {isSignedIn ? "Open dashboard" : "Open Workspace"}{" "}
                {isSignedIn ? <LayoutDashboard className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              </Link>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {resources.map((resource) => (
                <Link
                  key={resource.title}
                  href={resource.href}
                  className="group rounded-2xl border border-[#e2ebf6] bg-[#f7fbff] p-6 transition hover:border-[#2167e8] hover:bg-white"
                >
                  <h3 className="text-xl font-black text-[#071a3a]">{resource.title}</h3>
                  <p className="mt-3 text-sm font-medium leading-6 text-[#51627d]">{resource.text}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#2167e8]">
                    Read more <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="about-us" className="mx-auto max-w-[1480px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[24px] bg-[#071a3a] p-6 text-white shadow-[0_22px_55px_rgba(7,26,58,0.16)] sm:p-8">
              <p className="text-sm font-black uppercase tracking-[0.14em] text-[#8bb6ff]">About Us</p>
              <h2 className="mt-4 text-[30px] font-black leading-tight sm:text-[38px]">Building the operating system for business funding.</h2>
              <p className="mt-5 text-base font-medium leading-8 text-white/78">
                GrantsCopilot helps founders and SMEs move from fragmented funding discovery to an intelligent funding
                pipeline: profile, match, draft, prepare, learn, and improve. Auto-filing sits on the V2 roadmap.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <AboutStat value="24/7" label="Funding discovery and monitoring" />
              <AboutStat value="AI" label="Eligibility reasoning and application drafting" />
              <AboutStat value="UK+" label="Built for UK SMEs with global expansion in mind" />
              <AboutStat value="Review" label="Human approval before sensitive submission steps" />
            </div>
          </div>
        </section>

        <section id="get-started" className="mx-auto max-w-[1480px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10">
          <div className="grid items-center gap-6 rounded-[24px] bg-[linear-gradient(115deg,#e7f1ff,#ffffff)] p-6 shadow-[0_18px_50px_rgba(7,26,58,0.08)] sm:p-8 lg:grid-cols-[1fr_auto] lg:p-10">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.14em] text-[#2167e8]">Get started</p>
              <h2 className="mt-3 text-[30px] font-black leading-tight text-[#071a3a] sm:text-[36px]">
                Let your next grant opportunity come to you.
              </h2>
              <p className="mt-4 max-w-3xl text-base font-medium leading-7 text-[#51627d]">
                Create your Business DNA profile once. GrantsCopilot keeps scanning, scoring, reminding, and preparing
                applications around what your company actually qualifies for.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={isSignedIn ? "/dashboard" : "/sign-up"} className="inline-flex h-12 items-center justify-center rounded-lg bg-[#2167e8] px-7 text-sm font-black text-white">
                {isSignedIn ? "Return to dashboard" : "Get started"}
              </Link>
              {!isSignedIn && (
                <Link href="/sign-in" className="inline-flex h-12 items-center justify-center rounded-lg border border-[#d8e2f2] bg-white px-7 text-sm font-black text-[#071a3a]">
                  Log in
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 pb-12 pt-4 text-center sm:px-6">
          <p className="text-[16px] font-semibold text-[#09224a]">Built for founders, SMEs, and funding teams</p>
          <div className="mt-7 grid grid-cols-2 items-center gap-8 text-[#071a3a] sm:grid-cols-3 lg:grid-cols-6">
            {audienceSegments.map((segment) => (
              <div key={segment} className="flex items-center justify-center gap-2 text-[18px] font-black tracking-tight">
                <span className="h-5 w-5 rounded-[4px] bg-[#071a3a]" />
                <span>{segment}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-[#d8e2f2] bg-white/75">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-4 px-4 py-8 text-sm font-semibold text-[#51627d] sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <p>© 2026 GrantsCopilot. Funding intelligence for founders and SMEs.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/privacy" className="hover:text-[#2167e8]">Privacy</Link>
            <Link href="/terms" className="hover:text-[#2167e8]">Terms</Link>
            <Link href="/refund" className="hover:text-[#2167e8]">Refund policy</Link>
            <Link href={isSignedIn ? "/dashboard" : "/sign-in"} className="hover:text-[#2167e8]">
              {isSignedIn ? "Dashboard" : "Log in"}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[860px] lg:mx-0 lg:max-w-none">
      <div className="pointer-events-none absolute inset-x-[-1.25rem] top-[4.5rem] bottom-[-1.25rem] z-0 rounded-[34px] bg-[#dceaff]/65 blur-3xl" />
      <div className="relative z-10 grid overflow-hidden rounded-[20px] bg-white shadow-[0_30px_80px_rgba(7,26,58,0.14)] lg:grid-cols-[180px_1fr]">
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

        <div className="@container/preview min-w-0 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[21px] font-black text-[#071a3a]">Welcome back</h2>
              <p className="mt-1 text-[12px] font-medium text-[#54657f]">Here&apos;s your funding overview</p>
            </div>
            <div className="flex items-center gap-4">
              <Bell className="h-5 w-5 text-[#071a3a]" />
              <div className="hidden items-center gap-2 sm:flex">
                <div className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#123577,#35c386)]" />
                <span className="text-[12px] font-bold">Funding team</span>
              </div>
            </div>
          </div>

          <div className="mt-7 grid min-w-0 grid-cols-1 gap-3 @min-[340px]/preview:grid-cols-2 @min-[580px]/preview:grid-cols-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="@container/stat min-w-0 rounded-lg border border-[#eef2f7] bg-white p-4 shadow-[0_10px_28px_rgba(9,34,74,0.07)]"
                >
                  <div className="flex flex-col gap-2 @[200px]/stat:flex-row @[200px]/stat:items-center @[200px]/stat:gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${toneClasses[stat.tone]}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold leading-snug text-[#65748c]">{stat.label}</p>
                      <p className="break-words text-xl font-black leading-none tracking-tight text-[#071a3a] @[200px]/stat:text-2xl">
                        {stat.value}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold leading-snug text-[#071a3a]">{stat.detail}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 @min-[460px]/preview:grid-cols-2">
            <div className="min-w-0 rounded-lg border border-[#eef2f7] bg-white p-5 shadow-[0_10px_28px_rgba(9,34,74,0.07)]">
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

            <div className="@container/aprog min-w-0 rounded-lg border border-[#eef2f7] bg-white p-5 shadow-[0_10px_28px_rgba(9,34,74,0.07)]">
              <h3 className="text-[15px] font-black text-[#071a3a]">Application Progress</h3>
              <div className="mt-5 flex flex-col items-center gap-6 @min-[260px]/aprog:flex-row @min-[260px]/aprog:justify-center @min-[260px]/aprog:gap-8">
                <div className="grid h-32 w-32 shrink-0 place-items-center rounded-full bg-[conic-gradient(#2167e8_0_42%,#35c386_42%_73%,#4bc7ad_73%_100%)]">
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-center shadow-inner">
                    <div>
                      <p className="text-[26px] font-black leading-none text-[#071a3a]">7</p>
                      <p className="mt-1 text-[11px] font-semibold text-[#54657f]">In Progress</p>
                    </div>
                  </div>
                </div>
                <div className="w-full min-w-0 max-w-[200px] space-y-4 text-[12px] font-bold">
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
                <p className="text-[17px] font-black text-[#071a3a]">Stop searching. Let the right grants surface.</p>
                <p className="mt-2 text-[12px] font-medium text-[#2a4065]">
                  GrantsCopilot keeps watch, ranks the best fits, and prepares the next step.
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

function AboutStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-[#e2ebf6] bg-white p-6 shadow-[0_18px_45px_rgba(7,26,58,0.07)]">
      <p className="text-3xl font-black text-[#2167e8]">{value}</p>
      <p className="mt-3 text-sm font-bold leading-6 text-[#51627d]">{label}</p>
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
    <div className="grid min-w-0 grid-cols-[14px_minmax(0,1fr)_28px] items-center gap-2">
      <span className={`h-3 w-3 shrink-0 rounded-full ${color}`} />
      <span className="min-w-0 break-words leading-snug">{label}</span>
      <span className="shrink-0 text-right tabular-nums">{value}</span>
    </div>
  );
}
