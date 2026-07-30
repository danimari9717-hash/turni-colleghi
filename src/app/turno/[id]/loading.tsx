import Header from "@/components/Header";

/**
 * Skeleton mostrato istantaneamente mentre il Server Component
 * del dettaglio turno fetcha i dati dal database.
 */
export default function Loading() {
  return (
    <>
      <Header profile={null} />
      <main className="safe-bottom mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
        </div>

        {/* Info turno skeleton */}
        <div className="panel-glow mb-6 p-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-32 animate-pulse rounded bg-surface-2" />
            <div className="h-5 w-16 animate-pulse rounded-md bg-surface-2" />
          </div>
          <div className="mt-3 flex items-center gap-4">
            <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
          </div>
        </div>

        {/* Obiettivi skeleton */}
        <div className="panel p-6">
          <div className="mb-5 h-5 w-40 animate-pulse rounded bg-surface-2" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="obj-card p-4">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
                  <div className="h-6 w-12 animate-pulse rounded-full bg-surface-2" />
                </div>
                <div className="mt-2 h-3 w-24 animate-pulse rounded bg-surface-2" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
