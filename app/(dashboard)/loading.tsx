import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Card key={item}>
            <CardHeader>
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-8 w-20 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-16 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
    </div>
  );
}
