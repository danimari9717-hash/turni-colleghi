// Helper per feedback tattile (Vibration API).
// Su iOS Safari la Vibration API non è supportata: la chiamata viene
// ignorata senza errori. Su Android (PWA Chrome) funziona.
// Usiamo solo su azioni "di conferma" significative, non su ogni tap.

/**
 * Vibrazione leggera e breve (10ms). Ignorata se non supportata.
 */
export function hapticLight(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(10);
    } catch {
      // Ignora errori (es. permessi negati su alcuni browser)
    }
  }
}

/**
 * Vibrazione di conferma (15ms). Per azioni completate con successo.
 */
export function hapticConfirm(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(15);
    } catch {
      // Ignora
    }
  }
}
