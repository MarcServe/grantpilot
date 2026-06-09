export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-3 px-4 sm:h-24 sm:px-6 lg:px-8">
          <div className="h-10 w-52 animate-pulse rounded-lg bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded-md bg-muted" />
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:p-6">
        <div>
          <div className="h-8 w-28 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
        </div>

        <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="rounded-lg border bg-white p-5">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="mt-4 h-9 w-16 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-4 w-40 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="min-h-80 rounded-lg border bg-white p-5">
                <div className="h-5 w-44 animate-pulse rounded bg-muted" />
                <div className="mt-5 space-y-3">
                  {[0, 1, 2, 3].map((row) => (
                    <div key={row} className="h-16 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
