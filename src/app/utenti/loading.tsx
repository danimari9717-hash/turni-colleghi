import Header from "@/components/Header";

/**
 * Skeleton mostrato istantaneamente mentre il Server Component
 * di Gestione Utenti fetcha la lista utenti dal database.
 */
export default function Loading() {
  return (
    <>
      <Header profile={null} />
      <main className="safe-bottom mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
        </div>

        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-surface-2" />

        {/* Lista utenti skeleton */}
        <div className="panel p-5">
          <div className="space-y-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-2xl border border-border p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />
                  <div>
                    <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
                    <div className="mt-1.5 h-3 w-40 animate-pulse rounded bg-surface-2" />
                  </div>
                </div>
                <div className="h-7 w-24 animate-pulse rounded-lg bg-surface-2" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
