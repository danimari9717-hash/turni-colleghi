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
      accent: "#FFB300",
      glow: "rgba(255, 179, 0, 0.25)",
      bg: "rgba(255, 179, 0, 0.06)",
      bgHover: "rgba(255, 179, 0, 0.12)",
    },
  },
  afternoon: {
    slot: "afternoon",
    label: "Pomeriggio",
    start: "16:00",
    end: "00:00",
    color: {
      name: "orange",
      accent: "#FF5722",
      glow: "rgba(255, 87, 34, 0.25)",
      bg: "rgba(255, 87, 34, 0.06)",
      bgHover: "rgba(255, 87, 34, 0.12)",
    },
  },
  night: {
    slot: "night",
    label: "Notte",
    start: "00:00",
    end: "08:00",
    color: {
      name: "violet",
      accent: "#7C4DFF",
      glow: "rgba(124, 77, 255, 0.25)",
      bg: "rgba(124, 77, 255, 0.06)",
      bgHover: "rgba(124, 77, 255, 0.12)",
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

// Restituisce il lunedì della settimana contenente `date` (come ISO date string).
export function mondayOfWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Dom, 1=Lun, ..., 6=Sab
  const diff = day === 0 ? -6 : 1 - day; // distanza dal lunedì
  d.setDate(d.getDate() + diff);
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
