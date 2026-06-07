export default function DashboardLoading() {
  return (
    <div className="min-w-0 space-y-6 sm:space-y-7">
      <section className="overflow-hidden rounded-[26px] bg-white shadow-[0_24px_70px_rgba(7,26,58,0.08)]">
        <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 p-4 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="h-8 w-64 max-w-[70vw] animate-pulse rounded bg-[#e8eef7]" />
                <div className="h-4 w-44 animate-pulse rounded bg-[#e8eef7]" />
              </div>
              <div className="hidden h-11 w-11 animate-pulse rounded-full bg-[#e8eef7] sm:block" />
            </div>

            <div className="mt-8 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="rounded-2xl border border-[#e7edf6] bg-white p-5">
                  <div className="h-4 w-24 animate-pulse rounded bg-[#e8eef7]" />
                  <div className="mt-3 h-8 w-16 animate-pulse rounded bg-[#e8eef7]" />
                  <div className="mt-3 h-3 w-28 animate-pulse rounded bg-[#e8eef7]" />
                </div>
              ))}
            </div>

            <div className="mt-5 grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
              {[0, 1].map((item) => (
                <div key={item} className="rounded-2xl border border-[#e7edf6] bg-white p-5">
                  <div className="h-5 w-48 animate-pulse rounded bg-[#e8eef7]" />
                  <div className="mt-5 space-y-4">
                    {[0, 1, 2].map((row) => (
                      <div key={row} className="flex items-center gap-3">
                        <div className="h-10 w-10 animate-pulse rounded-full bg-[#e8eef7]" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="h-4 w-4/5 animate-pulse rounded bg-[#e8eef7]" />
                          <div className="h-3 w-2/3 animate-pulse rounded bg-[#e8eef7]" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 border-t border-[#e7edf6] bg-[#eef6ff] p-4 sm:p-6 xl:border-l xl:border-t-0">
            <div className="rounded-2xl border border-[#dbe7f6] bg-white p-5">
              <div className="h-4 w-28 animate-pulse rounded bg-[#e8eef7]" />
              <div className="mt-3 h-8 w-20 animate-pulse rounded bg-[#e8eef7]" />
              <div className="mt-5 h-2.5 animate-pulse rounded bg-[#e8eef7]" />
            </div>
            <div className="mt-6 rounded-2xl border border-[#dbe7f6] bg-white p-5">
              <div className="h-5 w-32 animate-pulse rounded bg-[#e8eef7]" />
              <div className="mt-5 space-y-3">
                <div className="h-4 w-full animate-pulse rounded bg-[#e8eef7]" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-[#e8eef7]" />
                <div className="h-10 w-full animate-pulse rounded bg-[#e8eef7]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((item) => (
          <div key={item} className="h-40 animate-pulse rounded-2xl border bg-white" />
        ))}
      </div>
    </div>
  );
}
