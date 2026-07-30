import Header from "@/components/Header";

/**
 * Skeleton mostrato istantaneamente mentre il Server Component
 * della home (Calendario) fetcha i turni dal database.
 * Next.js mostra questo file subito, prima che page.tsx completi.
 */
export default function Loading() {
  return (
    <>
      <Header profile={null} />
      <main className="safe-bottom mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Titolo + nav skeleton */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="h-7 w-48 animate-pulse rounded bg-surface-2" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-surface-2" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-10 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-9 w-16 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-9 w-10 animate-pulse rounded-xl bg-surface-2" />
          </div>
        </div>

        {/* Legenda skeleton */}
        <div className="mb-4 flex gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 animate-pulse rounded-sm bg-surface-2" />
              <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
            </div>
          ))}
        </div>

        {/* Card giorno skeleton (mobile) */}
        <div className="space-y-3 sm:hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="panel overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-baseline gap-3">
                  <div className="h-3 w-10 animate-pulse rounded bg-surface-2" />
                  <div className="h-5 w-6 animate-pulse rounded bg-surface-2" />
                </div>
                <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
              </div>
              <div className="divide-y divide-border">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="flex items-stretch">
                    <div className="w-20 shrink-0 border-r border-border px-3 py-3">
                      <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
                    </div>
                    <div className="flex-1 p-2">
                      <div className="h-8 animate-pulse rounded-xl bg-surface-2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Griglia desktop skeleton */}
        <div className="panel hidden overflow-hidden sm:block">
          <div className="grid grid-cols-[100px_repeat(7,1fr)] border-b border-border bg-surface-2">
            <div className="px-3 py-2.5">
              <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
            </div>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="px-3 py-2.5 text-center border-l border-border">
                <div className="mx-auto h-3 w-8 animate-pulse rounded bg-surface-2" />
                <div className="mx-auto mt-1 h-4 w-6 animate-pulse rounded bg-surface-2" />
              </div>
            ))}
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid grid-cols-[100px_repeat(7,1fr)] border-b border-border last:border-b-0">
              <div className="px-3 py-3 border-r border-border">
                <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
              </div>
              {[0, 1, 2, 3, 4, 5, 6].map((j) => (
                <div key={j} className="min-h-[80px] border-l border-border p-2">
                  <div className="h-8 animate-pulse rounded-xl bg-surface-2" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
