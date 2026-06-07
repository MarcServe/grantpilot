export default function AppLoading() {
  return (
    <main className="min-h-screen bg-[#f4f8ff] px-4 py-6 text-[#071a3a]">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <div className="h-10 w-48 animate-pulse rounded-lg bg-[#dbeafe]" />
          <div className="h-10 w-28 animate-pulse rounded-full bg-[#dbeafe]" />
        </div>
        <section className="mt-10 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <div className="h-8 w-44 animate-pulse rounded-full bg-[#dbeafe]" />
            <div className="h-16 w-full animate-pulse rounded-xl bg-[#dbeafe]" />
            <div className="h-16 w-4/5 animate-pulse rounded-xl bg-[#dbeafe]" />
            <div className="h-12 w-48 animate-pulse rounded-lg bg-[#2167e8]/30" />
          </div>
          <div className="h-80 animate-pulse rounded-2xl border border-[#d8e5f8] bg-white" />
        </section>
      </div>
    </main>
  );
}
