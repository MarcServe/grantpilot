function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#eef3fb] ${className}`} />;
}

export default function GrantDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:p-6">
      <SkeletonLine className="mb-6 h-4 w-36" />
      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <SkeletonLine className="h-8 w-72 max-w-[70vw]" />
            <SkeletonLine className="h-4 w-56" />
            <div className="flex flex-wrap gap-2 pt-2">
              <SkeletonLine className="h-7 w-24 rounded-full" />
              <SkeletonLine className="h-7 w-28 rounded-full" />
              <SkeletonLine className="h-7 w-20 rounded-full" />
            </div>
          </div>
          <SkeletonLine className="h-10 w-28 rounded-full bg-[#d9e7ff]" />
        </div>

        <div className="mt-8 space-y-6">
          <div className="space-y-3">
            <SkeletonLine className="h-5 w-36" />
            <SkeletonLine className="h-4 w-full" />
            <SkeletonLine className="h-4 w-11/12" />
          </div>
          <div className="rounded-xl border p-4">
            <SkeletonLine className="h-5 w-40" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2, 3].map((item) => (
                <SkeletonLine key={item} className="h-4 w-full" />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
