import Image from "next/image";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdmin } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { GrantImportUploader } from "@/components/admin/grant-import-uploader";
import { TestNotificationButton } from "@/components/admin/test-notification-button";
import { ScoutModeSettings } from "@/components/admin/scout-mode-settings";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in?redirect=/admin");
  }

  const allowed = await isAdmin();
  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldCheck className="h-5 w-5" />
              Access denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Only the admin account can access this page. You are signed in as{" "}
              <span className="font-medium text-foreground">{user.email}</span>.
            </p>
            <Link href="/dashboard" className="mt-4 block">
              <Button variant="outline">Back to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/admin" className="flex items-center gap-2">
            <Image 
              src="/logo.png" 
              alt="GrantsCopilot Logo" 
              width={240} 
              height={60} 
              className="h-10 w-auto object-contain grayscale"
              priority
            />
            <span className="text-xl font-bold">Admin</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">Dashboard</Button>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="mt-1 text-muted-foreground">
            You are logged in as the admin account. Grant import and other admin tools can be added here.
          </p>
        </div>
        <GrantImportUploader />
        <ScoutModeSettings />
        <TestNotificationButton />
        <Card>
          <CardHeader>
            <CardTitle>API import</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You can also import via API: <code className="rounded bg-muted px-1 py-0.5">POST /api/admin/grants/import</code> with header{" "}
              <code className="rounded bg-muted px-1 py-0.5">x-grants-import-secret</code> and a JSON array of grants.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
