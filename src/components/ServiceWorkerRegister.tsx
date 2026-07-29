"use client";

import { useEffect } from "react";

/**
 * Registra il service worker per abilitare l'installabilità PWA.
 * Sicuro in development (registra solo in production per evitare caching
 * che interferisce con HMR).
 *
 * Forza l'attivazione immediata del nuovo SW (skipWaiting) quando disponibile,
 * così gli update arrivano senza dover chiudere/riaprire tutti i tab.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Quando un nuovo SW prende il controllo, ricarica la pagina
        // per assicurarsi che usi la nuova cache + nuovi asset.
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      })
      .catch((err) => console.warn("SW registration failed:", err));
  }, []);

  return null;
}
