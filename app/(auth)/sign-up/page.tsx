"use client";

import Image from "next/image";
import { Suspense } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { normaliseCommunitySlug, partnerNameFromSlug } from "@/lib/community-access-shared";

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const communitySlug = normaliseCommunitySlug(searchParams?.get("community") ?? "");
  const communityCode = searchParams?.get("code")?.trim() ?? "";
  const hasCommunityAccess = Boolean(communitySlug && communityCode);
  const partnerName = hasCommunityAccess ? partnerNameFromSlug(communitySlug) : "";
  const claimPath = hasCommunityAccess
    ? `/community/claim?community=${encodeURIComponent(communitySlug)}&code=${encodeURIComponent(communityCode)}`
    : "/dashboard";
  const signInHref = hasCommunityAccess
    ? `/sign-in?redirect=${encodeURIComponent(claimPath)}`
    : "/sign-in";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: hasCommunityAccess
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(claimPath)}`
          : `${window.location.origin}/auth/callback`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto flex justify-center mb-2">
              <div className="relative flex items-center">
                <Image
                  src="/logogc.png"
                  alt="GrantsCopilot Logo"
                  width={480}
                  height={120}
                  className="h-40 w-auto object-contain"
                  priority
                />
              </div>
            </div>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription>
              We&apos;ve sent a confirmation link to <strong>{email}</strong>.
              Click the link in your email to activate your account.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={() => router.push("/sign-in")}>
              Back to Sign In
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex justify-center mb-2">
              <div className="relative flex items-center">
                <Image
                  src="/logogc.png"
                  alt="GrantsCopilot Logo"
                  width={480}
                  height={120}
                  className="h-40 w-auto object-contain"
                  priority
                />
              </div>
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>
            {hasCommunityAccess
              ? `${partnerName} members get 90 days of GrantsCopilot pilot access. No card required.`
              : "Start your Grants-Copilot journey today"}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Account
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href={signInHref} className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <SignUpForm />
    </Suspense>
  );
}
