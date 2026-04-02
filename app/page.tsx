import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileCheck, Search, Shield } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Image 
              src="/logo.png" 
              alt="GrantsCopilot Logo" 
              width={480} 
              height={120} 
              className="h-20 w-auto object-contain"
              priority
            />
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/sign-up">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Stop searching for grants.
              <br />
              <span className="text-primary">Start filing them.</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              Grants-Copilot discovers grants that match your business, fills in the
              applications using AI, and pauses for your review before
              submitting. One profile. Unlimited applications.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link href="/sign-up">
                <Button size="lg" className="gap-2">
                  Start Free Trial <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/50 py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 md:grid-cols-3">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Search className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">
                  AI Grant Matching
                </h3>
                <p className="mt-2 text-muted-foreground">
                  Claude analyses your business profile against hundreds of
                  grants and ranks the best matches with clear reasoning.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <FileCheck className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">
                  Autonomous Filing
                </h3>
                <p className="mt-2 text-muted-foreground">
                  Click Apply and our AI fills the entire application using your
                  business profile. Every field, every section, every upload.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">
                  Human-in-the-Loop
                </h3>
                <p className="mt-2 text-muted-foreground">
                  No application is ever submitted without your explicit review
                  and approval. You stay in control.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          &copy; {new Date().getFullYear()} Biz Boosters Ltd. All rights
          reserved.
        </div>
      </footer>
    </div>
  );
}
