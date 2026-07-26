// Helper per il sistema obiettivi.

import type { Obiettivo, ObiettivoTipo, Valuta } from "@/types/database";

export const VALUTE: Record<Valuta, { symbol: string; label: string; color: string }> = {
  fuoco: { symbol: "🔥", label: "Fuoco", color: "#FF5722" },
  diamante: { symbol: "💎", label: "Diamante", color: "#00E5FF" },
};

export const TIPI_LABEL: Record<ObiettivoTipo, string> = {
  gratta_vinci: "Gratta e vinci",
  incasso_tab: "Incasso tab",
  speciale: "Speciali",
};

// Raggruppa gli obiettivi per tipo, mantenendo l'ordine: gratta_vinci, incasso_tab, speciale.
export function groupByTipo(obiettivi: Obiettivo[]): Record<ObiettivoTipo, Obiettivo[]> {
  const groups: Record<ObiettivoTipo, Obiettivo[]> = {
    gratta_vinci: [],
    incasso_tab: [],
    speciale: [],
  };
  for (const o of obiettivi) {
    groups[o.tipo].push(o);
  }
  // Ordina per valore_ricompensa crescente dentro ogni gruppo
  for (const k of Object.keys(groups) as ObiettivoTipo[]) {
    groups[k].sort((a, b) => a.valore_ricompensa - b.valore_ricompensa);
  }
  return groups;
}

// Formatta la ricompensa per display: "+5 🔥" o "+1 💎"
export function formatReward(o: Obiettivo): string {
  return `+${o.valore_ricompensa} ${VALUTE[o.valuta].symbol}`;
}
