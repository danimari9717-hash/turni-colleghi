"use client";

import { useEffect } from "react";

/**
 * Registra il service worker per abilitare l'installabilità PWA.
 * Sicuro in development (registra solo in production per evitare caching
 * che interferisce con HMR).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.warn("SW registration failed:", err));
    }
  }, []);

  return null;
}
