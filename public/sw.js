// Service Worker minimo per PWA installabile.
// Strategia:
// - Navigation requests (pagine HTML): NETWORK-ONLY, mai cache.
//   Le pagine sono Server Components con dati live (turni, classifica).
//   Cachare l'HTML servirebbe dati stale al riavvio (bug: turni scomparsi).
//   Fallback offline: shell /login statica (no dati sensibili).
// - Asset statici (JS/CSS/font/immagini): cache-first.
// - API Supabase: sempre network (no cache, dati live).

const CACHE_VERSION = "turni-v5";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PRECACHE = [
  "/login",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
];

// Install: precache shell (SOLO asset statici, NON pagine con dati)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => null),
  );
  self.skipWaiting();
});

// Message: permette al client di forzare l'attivazione immediata
// del nuovo SW (SKIP_WAITING) senza aspettare che tutti i tab vengano chiusi.
// Critico per iOS PWA dove i tab restano aperti a lungo.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Activate: pulisci cache vecchie
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

// Fetch: strategia per tipo di richiesta
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo GET
  if (req.method !== "GET") return;

  // Supabase API: sempre network, mai cache
  if (url.hostname.endsWith(".supabase.co")) return;

  // Navigations (HTML): NETWORK-ONLY.
  // NON cachiamo le pagine HTML perché contengono dati live (turni, ecc.).
  // Se il network fallisce, fallback alla shell /login statica (no dati).
  // Questo fixa il bug "turni scomparsi al riavvio".
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match("/login").then((r) => r || new Response("Offline", { status: 503 })),
      ),
    );
    return;
  }

  // Asset statici (same-origin): cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).catch(() => null);
          }
          return res;
        });
      }),
    );
    return;
  }
});
