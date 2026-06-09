function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#eef3fb] ${className}`} />;
}

export default function ProfileLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:p-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <SkeletonLine className="h-4 w-36" />
          <SkeletonLine className="h-4 w-24" />
        </div>
        <SkeletonLine className="h-2 w-full" />
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <SkeletonLine className="h-5 w-44" />
            <SkeletonLine className="h-3 w-64 max-w-[70vw]" />
          </div>
          <SkeletonLine className="h-9 w-28" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-4 py-5 sm:px-6">
          <SkeletonLine className="h-6 w-40" />
        </div>
        <div className="space-y-5 px-4 py-5 sm:px-6">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="space-y-2">
              <SkeletonLine className="h-4 w-40" />
              <SkeletonLine className="h-12 w-full" />
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonLine className="h-12 w-full bg-[#d9e7ff]" />
            <SkeletonLine className="h-12 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
