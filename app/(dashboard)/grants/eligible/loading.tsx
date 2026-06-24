function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#eef3fb] ${className}`} />;
}

function MatchCardSkeleton() {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonLine className="h-5 w-3/4" />
          <SkeletonLine className="h-4 w-48" />
          <SkeletonLine className="h-4 w-full" />
        </div>
        <SkeletonLine className="h-7 w-20 rounded-full bg-[#d9e7ff]" />
      </div>
      <div className="mt-4 flex gap-2">
        <SkeletonLine className="h-9 w-28" />
        <SkeletonLine className="h-9 w-20 bg-[#d9e7ff]" />
      </div>
    </div>
  );
}

export default function EligibleGrantsLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:p-6">
      <SkeletonLine className="mb-6 h-4 w-28" />
      <div className="mb-8 space-y-3">
        <SkeletonLine className="h-8 w-44" />
        <SkeletonLine className="h-4 w-full max-w-xl" />
        <div className="flex flex-wrap gap-2 pt-2">
          <SkeletonLine className="h-7 w-28 rounded-full bg-[#d9e7ff]" />
          <SkeletonLine className="h-7 w-32 rounded-full bg-[#d9e7ff]" />
          <SkeletonLine className="h-7 w-20 rounded-full" />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <SkeletonLine className="h-7 w-24 rounded-full" />
            <SkeletonLine className="h-7 w-32 rounded-full" />
            <SkeletonLine className="h-7 w-20 rounded-full" />
          </div>
          <SkeletonLine className="h-9 w-full sm:w-60" />
        </div>
        <div className="rounded-xl border bg-background p-4">
          <SkeletonLine className="h-5 w-40" />
          <SkeletonLine className="mt-2 h-4 w-72" />
          <div className="mt-4 space-y-3">
            {[0, 1].map((item) => (
              <MatchCardSkeleton key={item} />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-dashed bg-background/60 px-4 py-3">
          <SkeletonLine className="h-4 w-64" />
        </div>
        <div className="rounded-lg border border-dashed bg-background/60 px-4 py-3">
          <SkeletonLine className="h-4 w-56" />
        </div>
      </div>
    </div>
  );
}
