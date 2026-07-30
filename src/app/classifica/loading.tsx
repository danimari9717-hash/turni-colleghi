import Header from "@/components/Header";

/**
 * Skeleton mostrato istantaneamente mentre il Server Component
 * della Classifica fetcha i dati dal database.
 */
export default function Loading() {
  return (
    <>
      <Header profile={null} />
      <main className="safe-bottom mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
        </div>

        <div className="mb-6 h-8 w-64 animate-pulse rounded bg-surface-2" />

        {/* Podio skeleton */}
        <div className="mb-6 p-6 rounded-3xl border border-border bg-surface-2/50">
          <div className="mb-5 h-4 w-40 animate-pulse rounded bg-surface-2" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="p-5 text-center rounded-2xl border border-border bg-surface-2/50">
                <div className="mx-auto h-8 w-8 animate-pulse rounded-full bg-surface-2" />
                <div className="mx-auto mt-3 h-4 w-20 animate-pulse rounded bg-surface-2" />
                <div className="mx-auto mt-3 h-8 w-12 animate-pulse rounded bg-surface-2" />
                <div className="mx-auto mt-1 h-3 w-16 animate-pulse rounded bg-surface-2" />
              </div>
            ))}
          </div>
        </div>

        {/* Lista classifica skeleton */}
        <div className="panel p-7">
          <div className="mb-5 h-4 w-32 animate-pulse rounded bg-surface-2" />
          <div className="space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-2xl border border-border p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-6 animate-pulse rounded bg-surface-2" />
                    <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
                  </div>
                  <div className="h-6 w-12 animate-pulse rounded bg-surface-2" />
                </div>
                <div className="mt-3 h-2 w-full animate-pulse rounded-full bg-surface-2" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
