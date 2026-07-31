// Costanti e helper per la gestione turni.

export type ShiftSlot = "morning" | "afternoon" | "night";

export interface ShiftDefinition {
  slot: ShiftSlot;
  label: string;
  start: string; // 'HH:mm'
  end: string; // 'HH:mm' (può essere < start se overnight, es. 16:00→00:00)
  // Palette colore "command center" per la fascia.
  color: {
    name: string;
    accent: string; // colore principale (bordo, testo)
    glow: string; // rgba per box-shadow glow
    bg: string; // sfondo cella
    bgHover: string; // sfondo cella hover
  };
}

// Le 3 fasce orarie fisse del team.
export const SHIFTS: Record<ShiftSlot, ShiftDefinition> = {
  morning: {
    slot: "morning",
    label: "Mattino",
    start: "08:00",
    end: "16:00",
    color: {
      name: "amber",
      accent: "#FFD24A",
      glow: "rgba(255, 210, 74, 0.32)",
      bg: "rgba(255, 210, 74, 0.07)",
      bgHover: "rgba(255, 210, 74, 0.14)",
    },
  },
  afternoon: {
    slot: "afternoon",
    label: "Pomeriggio",
    start: "16:00",
    end: "00:00",
    color: {
      name: "orange",
      accent: "#FF7D52",
      glow: "rgba(255, 125, 82, 0.32)",
      bg: "rgba(255, 125, 82, 0.07)",
      bgHover: "rgba(255, 125, 82, 0.14)",
    },
  },
  night: {
    slot: "night",
    label: "Notte",
    start: "00:00",
    end: "08:00",
    color: {
      name: "violet",
      accent: "#9B8CFF",
      glow: "rgba(155, 140, 255, 0.32)",
      bg: "rgba(155, 140, 255, 0.07)",
      bgHover: "rgba(155, 140, 255, 0.14)",
    },
  },
};

export const SHIFT_ORDER: ShiftSlot[] = ["morning", "afternoon", "night"];

// Determina la fascia di un turno a partire da ora_inizio.
export function slotFromStart(oraInizio: string): ShiftSlot | null {
  for (const slot of SHIFT_ORDER) {
    if (SHIFTS[slot].start === oraInizio) return slot;
  }
  return null;
}

// Formatta un range orario per display: "08:00 – 16:00".
export function formatShiftRange(start: string, end: string): string {
  return `${start} – ${end}`;
}

// Restituisce il lunedì (ISO date YYYY-MM-DD, UTC) della settimana contenente `date`.
// Calcolo in UTC per coerenza con weekDays() ed evitare off-by-one tra timezone.
export function mondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Dom, 1=Lun, ..., 6=Sab
  const diff = day === 0 ? -6 : 1 - day; // distanza dal lunedì
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

// Restituisce i 7 giorni (ISO date) di una settimana a partire dal lunedì.
export function weekDays(mondayIso: string): string[] {
  const monday = new Date(mondayIso + "T00:00:00Z");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

// Formatta una data ISO per display: "Lun 26/07".
export function formatDayLabel(iso: string): { weekday: string; day: string } {
  const d = new Date(iso + "T00:00:00Z");
  const weekdays = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  const wd = weekdays[d.getUTCDay()];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return { weekday: wd, day: `${dd}/${mm}` };
}

// Verifica se una data ISO è oggi (UTC).
export function isToday(iso: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return iso === today;
}

// ============================================================================
//  Helper per vista Mese
// ============================================================================

// Restituisce { year, month, firstDayIso, lastDayIso } per il mese contenente
// una data ISO (o il mese corrente se non specificata). ISO date YYYY-MM-DD.
export function monthRange(iso?: string): {
  year: number;
  month: number; // 0-11
  firstDayIso: string;
  lastDayIso: string;
} {
  const d = iso ? new Date(iso + "T00:00:00Z") : new Date();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  return {
    year,
    month,
    firstDayIso: first.toISOString().slice(0, 10),
    lastDayIso: last.toISOString().slice(0, 10),
  };
}

// Restituisce tutte le date (ISO) del mese, in ordine, UTC.
export function monthDays(iso?: string): string[] {
  const { year, month } = monthRange(iso);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, i) => {
    const d = new Date(Date.UTC(year, month, i + 1));
    return d.toISOString().slice(0, 10);
  });
}

// Restituisce la griglia del mese per la vista Mese: array di celle
// (ISO date | null per i giorni del mese precedente/successivo che riempiono
// la griglia a settimane complete). Inizia dal lunedì prima del primo del mese.
export function monthGrid(iso?: string): (string | null)[] {
  const { firstDayIso } = monthRange(iso);
  const days = monthDays(iso);
  const firstDow = new Date(firstDayIso + "T00:00:00Z").getUTCDay(); // 0=Dom
  const offset = firstDow === 0 ? 6 : firstDow - 1; // distanza dal lunedì

  const cells: (string | null)[] = [];
  // Giorni del mese precedente (padding iniziale)
  for (let i = offset; i > 0; i--) {
    cells.push(null);
  }
  // Giorni del mese
  for (const d of days) {
    cells.push(d);
  }
  // Padding finale fino a multiplo di 7
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

// Calcola le ore lavorate di un turno (differenza tra ora_fine e ora_inizio).
// Gestisce il caso overnight (es. 16:00→00:00 = 8h).
export function shiftHours(oraInizio: string, oraFine: string): number {
  const [ih, im] = oraInizio.slice(0, 5).split(":").map(Number);
  const [fh, fm] = oraFine.slice(0, 5).split(":").map(Number);
  let start = ih * 60 + im;
  let end = fh * 60 + fm;
  if (end <= start) end += 24 * 60; // overnight
  return (end - start) / 60;
}

// ============================================================================
//  Mappa persona → colore (pallini vista Mese)
//  Palette di 8 colori vivaci ma leggibili su sfondo dark.
//  Assegnazione deterministica basata su hash dell'user_id.
// ============================================================================
const PERSON_COLORS = [
  "#00e5ff", // ciano
  "#00ffa3", // verde acqua
  "#ffd24a", // oro
  "#ff7d52", // arancio
  "#9b8cff", // viola
  "#ff5e8a", // rosa
  "#5eb3ff", // azzurro
  "#a8ff5e", // lime
];

export function personColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return PERSON_COLORS[Math.abs(hash) % PERSON_COLORS.length];
}
