function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#eef3fb] ${className}`} />;
}

export default function GrantsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <SkeletonLine className="h-8 w-48" />
          <SkeletonLine className="h-4 w-full max-w-lg" />
          <div className="flex flex-wrap gap-2 pt-1">
            <SkeletonLine className="h-8 w-28 rounded-full" />
            <SkeletonLine className="h-8 w-32 rounded-full" />
            <SkeletonLine className="h-8 w-24 rounded-full" />
          </div>
        </div>
        <SkeletonLine className="h-10 w-full lg:w-72" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden rounded-xl border bg-white p-4 lg:block">
          <SkeletonLine className="h-5 w-28" />
          <div className="mt-5 space-y-3">
            {[0, 1, 2, 3].map((item) => (
              <SkeletonLine key={item} className="h-9 w-full" />
            ))}
          </div>
        </aside>
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <SkeletonLine className="h-5 w-3/4" />
                  <SkeletonLine className="h-4 w-48" />
                  <SkeletonLine className="h-4 w-full" />
                </div>
                <SkeletonLine className="h-8 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
