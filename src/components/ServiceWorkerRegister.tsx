"use client";

import { useEffect } from "react";

/**
 * Registra il service worker per abilitare l'installabilità PWA.
 * Sicuro in development (registra solo in production per evitare caching
 * che interferisce con HMR).
 *
 * MECCANISMO AUTO-UPDATE ROBUSTO:
 * 1. Ad ogni avvio, forza il check di nuove versioni SW (reg.update())
 * 2. Quando un nuovo SW viene trovato (updatefound), attendi che si installi
 * 3. Invia SKIP_WAITING al nuovo SW per forzarne l'attivazione immediata
 *    (senza dover chiudere tutti i tab — critico su iOS PWA)
 * 4. Quando il nuovo SW prende il controllo (controllerchange), ricarica
 *    la pagina per usare la nuova cache + nuovi asset
 *
 * Questo assicura che ad ogni deploy, gli utenti ricevano l'update
 * automaticamente al prossimo avvio dell'app, senza dover disinstallare/
 * reinstallare la PWA.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;

    // Quando un nuovo SW prende il controllo, ricarica una sola volta.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // 1. Forza il check di nuove versioni ad ogni avvio.
        //    Il browser di default controlla ogni ~24h; così controlla sempre.
        reg.update().catch(() => null);

        // 2. Quando il browser trova un nuovo SW, ascolta il suo ciclo.
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            // 3. Quando il nuovo SW è installato (in stato "installed" e
            //    in attesa = "waiting"), forzalo ad attivarsi subito.
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // navigator.serviceWorker.controller esiste solo se c'è già
              // un SW attivo → questo è un UPDATE, non la prima installazione.
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch((err) => console.warn("SW registration failed:", err));
  }, []);

  return null;
}
