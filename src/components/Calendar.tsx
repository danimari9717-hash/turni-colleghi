"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hapticLight } from "@/lib/haptics";
import { deleteTurno } from "@/app/actions";
import {
  SHIFTS,
  SHIFT_ORDER,
  weekDays,
  formatDayLabel,
  isToday,
  slotFromStart,
  monthGrid,
  monthRange,
  personColorEntry,
  personInitial,
  personColorList,
  type ShiftSlot,
  type ShiftDefinition,
} from "@/lib/shifts";
import { VALUTE } from "@/lib/objectives";
import type { TeamMember, TurnoWithMember } from "@/types/database";
import ShiftForm from "./ShiftForm";

// ============================================================================
//  Tipi per le statistiche del carosello
// ============================================================================
interface PodioEntry {
  user_id: string;
  nome: string;
  totale_fuoco: number;
  totale_diamanti: number;
}

interface NextTurnoInfo {
  data: string;
  oraInizio: string;
  oraFine: string;
  memberNome: string;
}

interface StatsData {
  myMonthHours: number;
  myMonthTurniCount: number;
  podio: PodioEntry[];
  nextTurno: NextTurnoInfo | null;
}

// ============================================================================
//  Props del Calendar
// ============================================================================
interface CalendarProps {
  turni: TurnoWithMember[]; // turni della settimana (vista Lista)
  monthTurni: TurnoWithMember[]; // turni del mese intero (vista Mese + carosello)
  members: TeamMember[];
  isAdmin: boolean;
  mondayIso: string;
  todayIso: string; // data di oggi (per calcolo mese corrente in Vista Mese)
  currentUserId: string;
  stats: StatsData;
}

type ModalState =
  | { kind: "closed" }
  | { kind: "create"; date: string; slot: ShiftSlot }
  | { kind: "create-blank" }
  | { kind: "edit"; turno: TurnoWithMember };

type ViewMode = "lista" | "mese";

// ============================================================================
//  useTap: handler tap che distingue tap netto da scroll/swipe.
//  Traccia la posizione del touchstart; se il dito si sposta più di
//  TAP_THRESHOLD px prima del touchend, l'evento è considerato scroll
//  e il tap viene ignorato. Funziona sia con touch che con mouse.
// ============================================================================
const TAP_THRESHOLD = 10; // px di movimento massimo per considerarlo tap

function useTapHandler(onTap: () => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
    movedRef.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!startRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;
    if (Math.hypot(dx, dy) > TAP_THRESHOLD) {
      movedRef.current = true;
    }
  };

  const onClick = (e: React.MouseEvent) => {
    // Su desktop il click è sempre valido (no swipe). Su mobile il
    // click sintetico arriva dopo touchend; se movedRef è true, ignora.
    if (movedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onTap();
  };

  return { onTouchStart, onTouchMove, onClick };
}

// ============================================================================
//  useCellInteraction: tap + long-press combinato sulle celle-giorno.
//  - Tap netto (< 400ms, < 10px movimento) → onTap (naviga a Vista Lista)
//  - Long-press (≥ 400ms, < 10px movimento) → onLongPress (mostra popup giorno)
//  - Scroll/swipe (> 10px movimento) → ignora entrambi
// ============================================================================
const INTERACTION_THRESHOLD = 10; // px
const LONG_PRESS_DELAY = 400; // ms

function useCellInteraction(onTap: () => void, onLongPress: (x: number, y: number) => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const longPressFiredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
    movedRef.current = false;
    longPressFiredRef.current = false;
    clearTimer();
    timerRef.current = setTimeout(() => {
      if (!movedRef.current) {
        longPressFiredRef.current = true;
        hapticLight();
        onLongPress(t.clientX, t.clientY);
      }
    }, LONG_PRESS_DELAY);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!startRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;
    if (Math.hypot(dx, dy) > INTERACTION_THRESHOLD) {
      movedRef.current = true;
      clearTimer();
    }
  };

  const onTouchEnd = () => {
    clearTimer();
  };

  const onClick = (e: React.MouseEvent) => {
    // Se long-press è scattato o il dito si è mosso, ignora il tap.
    if (longPressFiredRef.current || movedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onTap();
  };

  // Desktop: mouse hold per long-press
  const onMouseDown = (e: React.MouseEvent) => {
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    longPressFiredRef.current = false;
    clearTimer();
    timerRef.current = setTimeout(() => {
      if (!movedRef.current) {
        longPressFiredRef.current = true;
        onLongPress(e.clientX, e.clientY);
      }
    }, LONG_PRESS_DELAY);
  };

  const onMouseUp = () => {
    clearTimer();
  };

  const onMouseLeave = () => {
    clearTimer();
  };

  return { onTouchStart, onTouchMove, onTouchEnd, onClick, onMouseDown, onMouseUp, onMouseLeave };
}

// ============================================================================
//  DayPreview: popup con TUTTI i turni del giorno (long-press, sola lettura).
//  Si chiude al rilascio del dito o al tap fuori.
// ============================================================================
function DayPreview({
  dayIso,
  dayTurni,
  currentUserId,
  x,
  y,
  onClose,
}: {
  dayIso: string;
  dayTurni: TurnoWithMember[];
  currentUserId: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const dateLabel = formatDayLabel(dayIso);
  const isTodayCell = isToday(dayIso);

  // Ordina turni per fascia (Mattina → Pomeriggio → Notte).
  const slotOrder: Record<string, number> = { morning: 0, afternoon: 1, night: 2 };
  const sorted = [...dayTurni].sort((a, b) => {
    const sa = slotFromStart(a.ora_inizio.slice(0, 5));
    const sb = slotFromStart(b.ora_inizio.slice(0, 5));
    const oa = sa !== null ? slotOrder[sa] : 99;
    const ob = sb !== null ? slotOrder[sb] : 99;
    if (oa !== ob) return oa - ob;
    return a.ora_inizio.localeCompare(b.ora_inizio);
  });

  // Posizionamento con clamp orizzontale.
  const popupWidth = 240;
  const margin = 8;
  const left = Math.max(margin, Math.min(x - popupWidth / 2, window.innerWidth - popupWidth - margin));
  // Stima altezza per decidere sopra/sotto.
  const estimatedHeight = Math.max(80, sorted.length * 44 + 48);
  const top = y - estimatedHeight - margin > 0 ? y - estimatedHeight - margin : y + margin;

  return (
    <>
      {/* Overlay per chiudere al tap fuori (desktop) */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 9998 }}
      />
      <div
        className="animate-scale-in"
        style={{
          position: "fixed",
          left,
          top,
          width: popupWidth,
          zIndex: 9999,
        }}
      >
        <div
          className="rounded-xl border p-3 shadow-lg"
          style={{
            background: "var(--color-surface-active)",
            borderColor: isTodayCell ? "rgba(0, 229, 255, 0.4)" : "rgba(255, 255, 255, 0.22)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
          }}
        >
          {/* Header: data */}
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span
                className={`font-mono text-xs uppercase tracking-wider ${
                  isTodayCell ? "text-accent" : "text-fg-dim"
                }`}
              >
                {dateLabel.weekday}
              </span>
              <span
                className={`font-mono text-sm font-semibold ${
                  isTodayCell ? "text-white" : "text-fg"
                }`}
              >
                {dateLabel.day}
              </span>
              {isTodayCell && (
                <span className="rounded bg-accent/20 px-1.5 font-mono text-[8px] font-bold uppercase text-accent">
                  Oggi
                </span>
              )}
            </div>
            <span className="font-mono text-[10px] text-fg-dim">
              {sorted.length > 0 ? `${sorted.length} turni` : "vuoto"}
            </span>
          </div>

          {/* Lista turni */}
          {sorted.length === 0 ? (
            <div className="py-3 text-center font-mono text-xs text-fg-dim">
              Nessun turno assegnato
            </div>
          ) : (
            <div className="space-y-1.5">
              {sorted.map((t) => {
                const nome = t.member_nome ?? "—";
                const entry = personColorEntry(nome);
                const slot = slotFromStart(t.ora_inizio.slice(0, 5));
                const slotLabel = slot ? SHIFTS[slot].label : "—";
                const slotColor = slot ? SHIFTS[slot].color.accent : "#9aa7b8";
                const isMe = t.user_id === currentUserId;
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                    style={{ background: "rgba(255, 255, 255, 0.04)" }}
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-bold"
                      style={{ background: entry.color, color: entry.textColor, fontSize: "10px" }}
                    >
                      {personInitial(nome)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-xs font-medium"
                        style={{ color: isMe ? "var(--color-accent)" : "var(--color-fg)" }}
                      >
                        {nome}
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className="h-1.5 w-1.5 rounded-sm"
                          style={{ background: slotColor }}
                        />
                        <span className="font-mono text-[10px]" style={{ color: slotColor }}>
                          {slotLabel}
                        </span>
                        <span className="font-mono text-[10px] text-fg-muted">
                          {t.ora_inizio.slice(0, 5)}–{t.ora_fine.slice(0, 5)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================================
//  Componente principale
// ============================================================================
export default function Calendar({
  turni,
  monthTurni,
  members,
  isAdmin,
  mondayIso,
  todayIso,
  currentUserId,
  stats,
}: CalendarProps) {
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Persisti viewMode in sessionStorage: le navigazioni con <Link>
  // attivano loading.tsx che smonta il Calendar; al remount, senza
  // persistenza, viewMode ripristinerebbe "lista" di default.
  const [viewMode, setViewModeRaw] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("turni-viewMode");
      if (saved === "mese" || saved === "lista") return saved;
    }
    return "lista";
  });
  const setViewMode = (v: ViewMode) => {
    setViewModeRaw(v);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("turni-viewMode", v);
    }
  };
  const [onlyMine, setOnlyMine] = useState(false);
  // Giorno target per lo scroll (es. dopo tap da vista Mese).
  // Se impostato, la vista Lista scrolla a questo giorno invece di "oggi".
  const [scrollTargetDay, setScrollTargetDay] = useState<string | null>(null);

  const router = useRouter();

  // Ref per auto-scroll al giorno corrente (solo vista Lista mobile).
  const todayRef = useRef<HTMLDivElement>(null);
  // Ref per scroll a un giorno specifico (es. dopo tap da vista Mese).
  const dayRef = useRef<HTMLDivElement>(null);

  const days = weekDays(mondayIso);
  const todayIsInWeek = days.includes(todayIso);

  // Auto-scroll fluido: al giorno corrente (default) o al giorno target
  // (dopo tap da vista Mese). Solo vista Lista mobile.
  // IMPORTANTE: scrollTargetDay viene resettato a null dopo l'uso, così
  // le navigazioni successive (es. dal menu) tornano a scrollare a "oggi".
  useEffect(() => {
    if (viewMode !== "lista") return;

    // Caso 1: target specifico (da tap in Vista Mese).
    if (scrollTargetDay) {
      // Se il target non è nella settimana visualizzata, attendi la
      // navigazione (router.push) — non scrollare a "oggi" come fallback.
      if (!days.includes(scrollTargetDay)) return;
      const raf = requestAnimationFrame(() => {
        dayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        // Reset: le prossime navigazioni tornano a "oggi" come default.
        setScrollTargetDay(null);
      });
      return () => cancelAnimationFrame(raf);
    }

    // Caso 2: nessun target specifico → scrolla al giorno corrente (default).
    if (!todayIsInWeek) return;
    const raf = requestAnimationFrame(() => {
      todayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(raf);
  }, [viewMode, mondayIso, scrollTargetDay, todayIsInWeek, days]);

  // Mappa turni settimana per accesso rapido: key = `${date}|${slot}`
  const turniMap = useMemo(() => {
    const map = new Map<string, TurnoWithMember[]>();
    for (const t of turni) {
      const slot = slotFromStart(t.ora_inizio.slice(0, 5));
      if (!slot) continue;
      const key = `${t.data}|${slot}`;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [turni]);

  // Mappa turni mese per giorno: key = date ISO
  const monthTurniByDay = useMemo(() => {
    const map = new Map<string, TurnoWithMember[]>();
    for (const t of monthTurni) {
      const arr = map.get(t.data) ?? [];
      arr.push(t);
      map.set(t.data, arr);
    }
    return map;
  }, [monthTurni]);

  // Navigazione settimana (vista Lista)
  const prevWeek = new Date(mondayIso + "T00:00:00Z");
  prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);
  const nextWeek = new Date(mondayIso + "T00:00:00Z");
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const prevIso = prevWeek.toISOString().slice(0, 10);
  const nextIso = nextWeek.toISOString().slice(0, 10);

  // Determina se mondayIso è la settimana di default (no navigazione
  // esplicita). In tal caso, la Vista Mese deve usare todayIso come
  // riferimento mese: mondayOfWeek(today) può cadere nel mese precedente
  // se oggi è nei primi giorni del mese (es. sabato 1 agosto → lunedì 27
  // luglio → monthRange = luglio, ma dovrebbe essere agosto).
  const isDefaultWeek = mondayIso === mondayOfWeekFromDate(todayIso);
  const monthRefIso = isDefaultWeek ? todayIso : mondayIso;

  // Navigazione mese (vista Mese): sposta il mese di ±1 a partire da
  // monthRefIso e usa il 15° giorno del mese target come riferimento.
  // Il 15° è garantito nello stesso mese (evita overflow setUTCMonth
  // e il bug del 1° del mese che può cadere nel mese precedente).
  const prevMonthRef = useMemo(() => {
    const d = new Date(monthRefIso + "T00:00:00Z");
    d.setUTCDate(15);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return mondayOfWeekFromDate(d.toISOString().slice(0, 10));
  }, [monthRefIso]);
  const nextMonthRef = useMemo(() => {
    const d = new Date(monthRefIso + "T00:00:00Z");
    d.setUTCDate(15);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return mondayOfWeekFromDate(d.toISOString().slice(0, 10));
  }, [monthRefIso]);

  // Destinazioni di navigazione condizionali in base alla vista attiva.
  const prevHref = viewMode === "mese" ? `/?week=${prevMonthRef}` : `/?week=${prevIso}`;
  const nextHref = viewMode === "mese" ? `/?week=${nextMonthRef}` : `/?week=${nextIso}`;
  // "Oggi" torna alla settimana corrente in entrambe le viste; in Vista
  // Mese questo mostra il mese corrente (la settimana corrente è nel
  // mese corrente).
  const todayHref = `/?week=${todayIso}`;

  const firstLabel = formatDayLabel(days[0]);
  const lastLabel = formatDayLabel(days[6]);
  // Calcolo mese per Vista Mese: usa monthRefIso (todayIso se default,
  // mondayIso se navigato).
  const mRange = monthRange(monthRefIso);
  const monthName = new Date(Date.UTC(mRange.year, mRange.month, 1)).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  async function handleDelete(turnoId: string) {
    if (!confirm("Eliminare questo turno?")) return;
    setDeletingId(turnoId);
    setDeleteError(null);
    const fd = new FormData();
    fd.set("id", turnoId);
    const result = await deleteTurno(null, fd);
    if (result?.error) {
      setDeleteError(result.error);
      setDeletingId(null);
    }
  }

  const openCreate = (date: string, slot: ShiftSlot) => setModal({ kind: "create", date, slot });
  const openEdit = (turno: TurnoWithMember) => setModal({ kind: "edit", turno });

  // Handler: tap su un giorno nella vista Mese.
  // Passa alla vista Lista, naviga alla settimana corretta e scrolla al giorno.
  function handleSelectDay(iso: string) {
    const targetMonday = mondayOfWeekFromDate(iso);
    setScrollTargetDay(iso);
    setViewMode("lista");
    // Se il giorno è in una settimana diversa da quella attuale, naviga.
    if (targetMonday !== mondayIso) {
      router.push(`/?week=${targetMonday}`);
    }
  }

  // Stile inline per pulsanti nav (riusato)
  const navBtnStyle: React.CSSProperties = {
    background: "rgba(255, 255, 255, 0.07)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    border: "1px solid rgba(255, 255, 255, 0.25)",
    borderRadius: "12px",
    color: "var(--color-fg)",
    display: "inline-flex",
    alignItems: "center",
    textDecoration: "none",
  };

  return (
    <>
      {/* ============ CAROSELLO STATISTICHE ============ */}
      <StatsCarousel stats={stats} currentUserId={currentUserId} />

      {/* ============ TOGGLE LISTA / MESE ============ */}
      <div className="mb-4 flex items-center justify-center">
        <div
          className="inline-flex rounded-xl border border-border p-1"
          style={{ background: "rgba(255, 255, 255, 0.04)" }}
        >
          <button
            type="button"
            onClick={() => { hapticLight(); setViewMode("lista"); }}
            className="press-state rounded-lg px-5 py-1.5 text-sm font-medium transition-all"
            style={
              viewMode === "lista"
                ? {
                    background: "linear-gradient(135deg, #00e5ff 0%, #00ffa3 100%)",
                    color: "#001316",
                    fontWeight: 700,
                  }
                : { color: "var(--color-fg-muted)" }
            }
          >
            Lista
          </button>
          <button
            type="button"
            onClick={() => { hapticLight(); setViewMode("mese"); }}
            className="press-state rounded-lg px-5 py-1.5 text-sm font-medium transition-all"
            style={
              viewMode === "mese"
                ? {
                    background: "linear-gradient(135deg, #00e5ff 0%, #00ffa3 100%)",
                    color: "#001316",
                    fontWeight: 700,
                  }
                : { color: "var(--color-fg-muted)" }
            }
          >
            Mese
          </button>
        </div>
      </div>

      {/* ============ HEADER CALENDARIO: navigazione ============ */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Calendario turni</h1>
          <p className="mt-1 font-mono text-sm text-fg-muted">
            {viewMode === "lista"
              ? `${firstLabel.day} – ${lastLabel.day}`
              : monthName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={prevHref} className="press-state px-3 py-2 text-sm" aria-label="Precedente" style={navBtnStyle}>
            ←
          </Link>
          <Link href={todayHref} className="press-state px-4 py-2 text-sm font-medium" style={navBtnStyle}>
            Oggi
          </Link>
          <Link href={nextHref} className="press-state px-3 py-2 text-sm" aria-label="Successivo" style={navBtnStyle}>
            →
          </Link>
          {isAdmin && viewMode === "lista" && (
            <button
              type="button"
              onClick={() => { hapticLight(); setModal({ kind: "create-blank" }); }}
              className="press-state btn-accent px-4 py-2 text-sm"
            >
              + Nuovo turno
            </button>
          )}
        </div>
      </div>

      {/* ============ VISTA LISTA (default) ============ */}
      {viewMode === "lista" && (
        <div key="lista" className="view-transition">
          {/* Legenda fasce */}
          <div className="mb-4 flex flex-wrap gap-4">
            {SHIFT_ORDER.map((slot) => {
              const shift = SHIFTS[slot];
              return (
                <div key={slot} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: shift.color.accent, boxShadow: `0 0 8px ${shift.color.glow}` }}
                  />
                  <span className="font-mono text-xs text-fg-muted">
                    {shift.label} <span className="text-fg-dim">{shift.start}–{shift.end}</span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Vista Desktop (≥640px) */}
          <WeekViewDesktop
            days={days}
            turniMap={turniMap}
            isAdmin={isAdmin}
            deletingId={deletingId}
            onEdit={openEdit}
            onDelete={handleDelete}
            openCreate={openCreate}
          />

          {/* Vista Mobile (<640px) */}
          <WeekViewMobile
            days={days}
            turniMap={turniMap}
            isAdmin={isAdmin}
            deletingId={deletingId}
            onEdit={openEdit}
            onDelete={handleDelete}
            openCreate={openCreate}
            todayRef={todayRef}
            dayRef={dayRef}
            scrollTargetDay={scrollTargetDay}
          />
        </div>
      )}

      {/* ============ VISTA MESE ============ */}
      {viewMode === "mese" && (
        <div key="mese" className="view-transition">
          <MonthView
          mondayIso={mondayIso}
          monthRefIso={isDefaultWeek ? todayIso : mondayIso}
          monthTurniByDay={monthTurniByDay}
          currentUserId={currentUserId}
          onlyMine={onlyMine}
          setOnlyMine={setOnlyMine}
          onSelectDay={handleSelectDay}
        />
        </div>
      )}

      {/* Errore delete */}
      {deleteError && (
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 animate-fade-in">
          Errore eliminazione: {deleteError}
        </div>
      )}

      {/* Stato vuoto (nessun turno nella settimana) */}
      {viewMode === "lista" && turni.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-border bg-surface/50 p-8 text-center">
          <p className="font-mono text-sm text-fg-dim">
            Nessun turno assegnato per questa settimana.
            {isAdmin && " Tocca una fascia vuota o usa \"+ Nuovo turno\"."}
          </p>
        </div>
      )}

      {/* Modale form */}
      {modal.kind === "create" && (
        <ShiftForm
          mode="create"
          members={members}
          initialDate={modal.date}
          initialSlot={modal.slot}
          onClose={() => setModal({ kind: "closed" })}
        />
      )}
      {modal.kind === "create-blank" && (
        <ShiftForm mode="create" members={members} onClose={() => setModal({ kind: "closed" })} />
      )}
      {modal.kind === "edit" && (
        <ShiftForm
          mode="edit"
          turno={modal.turno}
          members={members}
          onClose={() => setModal({ kind: "closed" })}
        />
      )}
    </>
  );
}

// ============================================================================
//  CAROSELLO STATISTICHE
// ============================================================================
function StatsCarousel({
  stats,
  currentUserId,
}: {
  stats: StatsData;
  currentUserId: string;
}) {
  const positions = ["🥇", "🥈", "🥉"];

  return (
    <div className="mb-6 -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex gap-3" style={{ minWidth: "min-content" }}>
        {/* ============================================================
            Card 1: Il tuo mese — ciano, gradiente accento
            ============================================================ */}
        <div
          className="flex shrink-0 flex-col justify-between rounded-2xl border p-4"
          style={{
            width: "210px",
            minHeight: "120px",
            background:
              "linear-gradient(160deg, rgba(0, 229, 255, 0.12) 0%, var(--color-surface-active) 60%)",
            borderColor: "rgba(0, 229, 255, 0.35)",
            boxShadow:
              "inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 0 4px 20px rgba(0, 229, 255, 0.12)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-md text-[10px]"
              style={{ background: "rgba(0, 229, 255, 0.2)", color: "var(--color-accent)" }}
            >
              ⏱
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
              Il tuo mese
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span
                className="font-mono text-4xl font-bold"
                style={{
                  background: "linear-gradient(135deg, #00e5ff 0%, #00ffa3 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {stats.myMonthHours}
              </span>
              <span className="font-mono text-sm text-fg-muted">ore</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
                style={{ background: "rgba(0, 229, 255, 0.15)", color: "var(--color-accent)" }}
              >
                {stats.myMonthTurniCount} turni
              </span>
            </div>
          </div>
        </div>

        {/* ============================================================
            Card 2: Prossimo turno — verde acqua, glow
            ============================================================ */}
        <div
          className="flex shrink-0 flex-col justify-between rounded-2xl border p-4"
          style={{
            width: "210px",
            minHeight: "120px",
            background:
              "linear-gradient(160deg, rgba(0, 255, 163, 0.12) 0%, var(--color-surface-active) 60%)",
            borderColor: "rgba(0, 255, 163, 0.35)",
            boxShadow:
              "inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 0 4px 20px rgba(0, 255, 163, 0.12)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-md text-[10px]"
              style={{ background: "rgba(0, 255, 163, 0.2)", color: "#00ffa3" }}
            >
              📅
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: "#00ffa3" }}>
              Prossimo turno
            </span>
          </div>
          {stats.nextTurno ? (
            <div className="mt-3">
              <div
                className="font-mono text-2xl font-bold text-fg"
                style={{ textShadow: "0 0 12px rgba(0, 255, 163, 0.25)" }}
              >
                {formatDayLabel(stats.nextTurno.data).weekday}{" "}
                {stats.nextTurno.data.slice(8)}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: "#00ffa3", boxShadow: "0 0 8px #00ffa3" }}
                />
                <span className="font-mono text-sm font-medium text-fg-muted">
                  {stats.nextTurno.oraInizio} – {stats.nextTurno.oraFine}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-1.5">
              <span className="text-base opacity-50">🌙</span>
              <span className="font-mono text-xs text-fg-dim">
                Nessun turno programmato
              </span>
            </div>
          )}
        </div>

        {/* ============================================================
            Card 3: Podio FantaTab — oro, gradiente caldo
            ============================================================ */}
        <div
          className="flex shrink-0 flex-col justify-between rounded-2xl border p-4"
          style={{
            width: "230px",
            minHeight: "120px",
            background:
              "linear-gradient(160deg, rgba(255, 210, 74, 0.12) 0%, var(--color-surface-active) 60%)",
            borderColor: "rgba(255, 210, 74, 0.35)",
            boxShadow:
              "inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 0 4px 20px rgba(255, 210, 74, 0.1)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-md text-[10px]"
              style={{ background: "rgba(255, 210, 74, 0.2)", color: "#ffd24a" }}
            >
              🏆
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: "#ffd24a" }}>
              Podio FantaTab
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            {stats.podio.length === 0 ? (
              <div className="font-mono text-xs text-fg-dim">Nessun dato</div>
            ) : (
              stats.podio.map((r, i) => {
                const isMe = r.user_id === currentUserId;
                return (
                  <div
                    key={r.user_id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1"
                    style={{
                      background: isMe ? "rgba(0, 229, 255, 0.08)" : "rgba(255, 255, 255, 0.03)",
                    }}
                  >
                    <span className="text-sm" style={{ filter: i === 0 ? "drop-shadow(0 0 4px rgba(255, 210, 74, 0.5))" : "none" }}>
                      {positions[i]}
                    </span>
                    <span
                      className="truncate text-xs font-semibold"
                      style={{ color: isMe ? "var(--color-accent)" : "var(--color-fg)" }}
                    >
                      {r.nome}
                    </span>
                    <span
                      className="ml-auto font-mono text-xs font-bold"
                      style={{ color: VALUTE.fuoco.color }}
                    >
                      {r.totale_fuoco}🔥
                    </span>
                    {r.totale_diamanti > 0 && (
                      <span
                        className="font-mono text-xs"
                        style={{ color: VALUTE.diamante.color }}
                      >
                        {r.totale_diamanti}💎
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
//  VISTA MESE
// ============================================================================
function MonthView({
  mondayIso,
  monthRefIso,
  monthTurniByDay,
  currentUserId,
  onlyMine,
  setOnlyMine,
  onSelectDay,
}: {
  mondayIso: string;
  monthRefIso: string; // data di riferimento per calcolare il mese da mostrare
  monthTurniByDay: Map<string, TurnoWithMember[]>;
  currentUserId: string;
  onlyMine: boolean;
  setOnlyMine: (v: boolean) => void;
  onSelectDay: (iso: string) => void;
}) {
  const grid = useMemo(() => monthGrid(monthRefIso), [monthRefIso]);
  const todayIso = new Date().toISOString().slice(0, 10);
  const weekdays = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  const legend = useMemo(() => personColorList(), []);

  return (
    <>
      {/* Toggle "Solo i miei turni" + legenda persone */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Legenda colori persone */}
        <div className="flex flex-wrap gap-2">
          {legend.map((entry) => (
            <div key={entry.label} className="flex items-center gap-1.5">
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full font-bold"
                style={{
                  background: entry.color,
                  color: entry.textColor,
                  fontSize: "8px",
                }}
              >
                {personInitial(entry.label)}
              </span>
              <span className="font-mono text-[10px] text-fg-muted">{entry.label}</span>
            </div>
          ))}
        </div>

        {/* Toggle */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-fg-muted">Solo i miei turni</span>
          <button
            type="button"
            onClick={() => { hapticLight(); setOnlyMine(!onlyMine); }}
            className="press-state-opacity relative h-6 w-11 rounded-full transition-colors"
            style={{
              background: onlyMine
                ? "linear-gradient(135deg, #00e5ff 0%, #00ffa3 100%)"
                : "rgba(255, 255, 255, 0.12)",
            }}
            aria-pressed={onlyMine}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
              style={{ left: onlyMine ? "22px" : "2px" }}
            />
          </button>
        </div>
      </div>

      {/* Lettere giorni con glow ciano */}
      <div className="mb-2 grid grid-cols-7 gap-1">
        {weekdays.map((wd) => (
          <div
            key={wd}
            className="py-1.5 text-center font-mono text-xs font-bold uppercase tracking-wider"
            style={{
              color: "var(--color-accent)",
              textShadow: "0 0 8px rgba(0, 229, 255, 0.4)",
            }}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Griglia mese */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((iso, i) => {
          if (iso === null) {
            return <div key={`empty-${i}`} className="min-h-[64px] rounded-lg" />;
          }

          const dayTurni = monthTurniByDay.get(iso) ?? [];
          const today = iso === todayIso;
          const hasMine = dayTurni.some((t) => t.user_id === currentUserId);
          const label = formatDayLabel(iso);

          // Filtro "Solo i miei turni": oscura i giorni senza l'utente
          const dimmed = onlyMine && !hasMine;

          return (
            <MonthDayCell
              key={iso}
              iso={iso}
              today={today}
              hasMine={hasMine}
              dayTurni={dayTurni}
              dimmed={dimmed}
              currentUserId={currentUserId}
              onSelectDay={onSelectDay}
            />
          );
        })}
      </div>
    </>
  );
}

// ============================================================================
//  MonthDayCell: singola cella-giorno della Vista Mese.
//  Usa useTapHandler per distinguere tap netto da scroll/swipe.
// ============================================================================
function MonthDayCell({
  iso,
  today,
  hasMine,
  dayTurni,
  dimmed,
  currentUserId,
  onSelectDay,
}: {
  iso: string;
  today: boolean;
  hasMine: boolean;
  dayTurni: TurnoWithMember[];
  dimmed: boolean;
  currentUserId: string;
  onSelectDay: (iso: string) => void;
}) {
  const [dayPreview, setDayPreview] = useState<{ x: number; y: number } | null>(null);

  const interaction = useCellInteraction(
    () => onSelectDay(iso), // tap → naviga a Vista Lista
    (x, y) => setDayPreview({ x, y }), // long-press → mostra popup giorno
  );

  return (
    <>
      <button
        type="button"
        onTouchStart={interaction.onTouchStart}
        onTouchMove={interaction.onTouchMove}
        onTouchEnd={interaction.onTouchEnd}
        onClick={interaction.onClick}
        onMouseDown={interaction.onMouseDown}
        onMouseUp={interaction.onMouseUp}
        onMouseLeave={interaction.onMouseLeave}
        className="press-state relative flex min-h-[64px] flex-col rounded-lg border p-1.5 text-left transition-all"
        style={{
          background: today
            ? "linear-gradient(180deg, rgba(0, 229, 255, 0.18) 0%, rgba(0, 229, 255, 0.06) 100%)"
            : dayTurni.length > 0
              ? "var(--color-surface-active)"
              : "rgba(255, 255, 255, 0.03)",
          borderColor: today
            ? "rgba(0, 229, 255, 0.55)"
            : hasMine
              ? "rgba(0, 255, 163, 0.5)"
              : "rgba(255, 255, 255, 0.1)",
          boxShadow: today
            ? "0 0 16px rgba(0, 229, 255, 0.2)"
            : hasMine
              ? "0 0 12px rgba(0, 255, 163, 0.18)"
              : "none",
          opacity: dimmed ? 0.3 : 1,
          filter: dimmed ? "grayscale(0.6)" : "none",
          cursor: "pointer",
          touchAction: "pan-y",
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
      >
        {/* Numero giorno */}
        <div className="flex items-center justify-between">
          <span
            className={`font-mono text-xs font-semibold ${
              today ? "text-white" : "text-fg"
            }`}
          >
            {iso.slice(8)}
          </span>
          {today && (
            <span className="rounded bg-accent/20 px-1 font-mono text-[8px] font-bold uppercase text-accent">
              Oggi
            </span>
          )}
        </div>

        {/* Avatar iniziali colorate (stile Google Calendar) */}
        <div className="mt-1 flex items-center">
          {(() => {
            const slotOrder: Record<string, number> = {
              morning: 0,
              afternoon: 1,
              night: 2,
            };
            const sorted = [...dayTurni].sort((a, b) => {
              const sa = slotFromStart(a.ora_inizio.slice(0, 5));
              const sb = slotFromStart(b.ora_inizio.slice(0, 5));
              const oa = sa !== null ? slotOrder[sa] : 99;
              const ob = sb !== null ? slotOrder[sb] : 99;
              if (oa !== ob) return oa - ob;
              return a.ora_inizio.localeCompare(b.ora_inizio);
            });
            const seen = new Set<string>();
            const unique = sorted.filter((t) => {
              if (seen.has(t.user_id)) return false;
              seen.add(t.user_id);
              return true;
            });
            const maxShow = 3;
            const shown = unique.slice(0, maxShow);
            const extra = unique.length - shown.length;
            return (
              <>
                {shown.map((t, idx) => {
                  const nome = t.member_nome ?? t.user_id;
                  const entry = personColorEntry(nome);
                  const isMe = t.user_id === currentUserId;
                  return (
                    <span
                      key={t.id}
                      className="relative flex items-center justify-center rounded-full font-bold"
                      style={{
                        width: "18px",
                        height: "18px",
                        fontSize: "9px",
                        background: entry.color,
                        color: entry.textColor,
                        marginLeft: idx === 0 ? 0 : "-6px",
                        border: `1.5px solid ${
                          today ? "rgba(0, 229, 255, 0.3)" : "var(--color-base)"
                        }`,
                        boxShadow: isMe ? `0 0 6px ${entry.color}` : "none",
                        zIndex: shown.length - idx,
                        WebkitTouchCallout: "none",
                        WebkitUserSelect: "none",
                        userSelect: "none",
                      }}
                    >
                      {personInitial(nome)}
                    </span>
                  );
                })}
                {extra > 0 && (
                  <span
                    className="relative flex items-center justify-center rounded-full font-mono font-bold"
                    style={{
                      width: "18px",
                      height: "18px",
                      fontSize: "8px",
                      background: "rgba(255, 255, 255, 0.15)",
                      color: "var(--color-fg-muted)",
                      marginLeft: "-6px",
                      border: `1.5px solid ${
                        today ? "rgba(0, 229, 255, 0.3)" : "var(--color-base)"
                      }`,
                      zIndex: 0,
                    }}
                  >
                    +{extra}
                  </span>
                )}
              </>
            );
          })()}
        </div>
      </button>
      {/* Popup long-press: tutti i turni del giorno */}
      {dayPreview && (
        <DayPreview
          dayIso={iso}
          dayTurni={dayTurni}
          currentUserId={currentUserId}
          x={dayPreview.x}
          y={dayPreview.y}
          onClose={() => setDayPreview(null)}
        />
      )}
    </>
  );
}

// Helper: lunedì della settimana contenente una data ISO
function mondayOfWeekFromDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ============================================================================
//  VISTA SETTIMANA DESKTOP (≥640px)
// ============================================================================
function WeekViewDesktop({
  days,
  turniMap,
  isAdmin,
  deletingId,
  onEdit,
  onDelete,
  openCreate,
}: {
  days: string[];
  turniMap: Map<string, TurnoWithMember[]>;
  isAdmin: boolean;
  deletingId: string | null;
  onEdit: (t: TurnoWithMember) => void;
  onDelete: (id: string) => void;
  openCreate: (date: string, slot: ShiftSlot) => void;
}) {
  return (
    <div className="panel hidden overflow-hidden sm:block">
      {/* Header giorni */}
      <div className="grid grid-cols-[100px_repeat(7,1fr)] border-b border-border bg-surface-2">
        <div className="px-3 py-2.5 font-mono text-[11px] uppercase tracking-wider text-fg-dim">
          Fascia
        </div>
        {days.map((iso) => {
          const label = formatDayLabel(iso);
          const today = isToday(iso);
          return (
            <div
              key={iso}
              className={`px-3 py-2.5 text-center border-l border-border ${
                today ? "today-highlight" : ""
              }`}
            >
              <div
                className={`font-mono text-[11px] uppercase tracking-wider ${
                  today ? "text-accent" : "text-fg-dim"
                }`}
              >
                {label.weekday}
              </div>
              <div
                className={`font-mono text-sm font-medium ${
                  today ? "text-white" : "text-fg"
                }`}
              >
                {label.day}
              </div>
            </div>
          );
        })}
      </div>

      {/* Righe fasce */}
      {SHIFT_ORDER.map((slot) => {
        const shift = SHIFTS[slot];
        return (
          <div
            key={slot}
            className="grid grid-cols-[100px_repeat(7,1fr)] border-b border-border last:border-b-0"
          >
            <div
              className="flex flex-col justify-center px-3 py-3 border-r border-border"
              style={{ background: shift.color.bg }}
            >
              <div
                className="font-mono text-xs font-medium uppercase tracking-wider"
                style={{ color: shift.color.accent }}
              >
                {shift.label}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-fg-dim">
                {shift.start}–{shift.end}
              </div>
            </div>

            {days.map((iso) => {
              const key = `${iso}|${slot}`;
              const cellTurni = turniMap.get(key) ?? [];
              const hasTurni = cellTurni.length > 0;
              const canAddMore = cellTurni.length < 2;
              return (
                <div
                  key={iso}
                  className="group relative min-h-[80px] overflow-hidden border-l border-border p-2 transition-colors"
                  style={{ background: hasTurni ? shift.color.bg : "var(--color-base)" }}
                  onMouseEnter={(e) => {
                    if (isAdmin && canAddMore) e.currentTarget.style.background = shift.color.bgHover;
                  }}
                  onMouseLeave={(e) => {
                    if (isAdmin && canAddMore)
                      e.currentTarget.style.background = hasTurni ? shift.color.bg : "var(--color-base)";
                  }}
                  onClick={() => {
                    if (isAdmin && canAddMore) openCreate(iso, slot);
                  }}
                  role={isAdmin && canAddMore ? "button" : undefined}
                  title={isAdmin && canAddMore ? (hasTurni ? "Aggiungi seconda persona" : "Clicca per assegnare turno") : undefined}
                >
                  <div className="space-y-1.5">
                    {cellTurni.map((t) => (
                      <TurnoCard
                        key={t.id}
                        turno={t}
                        shift={shift}
                        isAdmin={isAdmin}
                        deleting={deletingId === t.id}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>

                  {isAdmin && canAddMore && !hasTurni && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-60 pointer-events-none">
                      <span className="font-mono text-lg" style={{ color: shift.color.accent }}>+</span>
                    </div>
                  )}
                  {isAdmin && canAddMore && hasTurni && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCreate(iso, slot);
                      }}
                      className="mt-1.5 flex w-full items-center justify-center rounded-md border border-dashed py-1 text-xs opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-70"
                      style={{ borderColor: `${shift.color.accent}40`, color: shift.color.accent }}
                    >
                      + seconda persona
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
//  VISTA SETTIMANA MOBILE (<640px)
// ============================================================================
function WeekViewMobile({
  days,
  turniMap,
  isAdmin,
  deletingId,
  onEdit,
  onDelete,
  openCreate,
  todayRef,
  dayRef,
  scrollTargetDay,
}: {
  days: string[];
  turniMap: Map<string, TurnoWithMember[]>;
  isAdmin: boolean;
  deletingId: string | null;
  onEdit: (t: TurnoWithMember) => void;
  onDelete: (id: string) => void;
  openCreate: (date: string, slot: ShiftSlot) => void;
  todayRef: React.RefObject<HTMLDivElement | null>;
  dayRef: React.RefObject<HTMLDivElement | null>;
  scrollTargetDay: string | null;
}) {
  return (
    <div className="space-y-5 sm:hidden">
      {days.map((iso) => {
        const label = formatDayLabel(iso);
        const today = isToday(iso);
        const dayTurni = SHIFT_ORDER.map((slot) => ({
          slot,
          shift: SHIFTS[slot],
          turni: turniMap.get(`${iso}|${slot}`) ?? [],
        }));
        const dayHasTurni = dayTurni.some((d) => d.turni.length > 0);

        return (
          <div
            key={iso}
            ref={
              iso === scrollTargetDay
                ? dayRef
                : today
                  ? todayRef
                  : undefined
            }
            className={`${
              today
                ? "today-card panel-no-blur"
                : dayHasTurni
                  ? "day-card-active"
                  : "panel-no-blur"
            } overflow-hidden`}
          >
            {/* Header giorno */}
            <div
              className={`flex items-center justify-between px-5 py-4 border-b border-border ${
                today ? "today-highlight" : "bg-surface-2"
              }`}
            >
              <div className="flex items-baseline gap-3">
                <span
                  className={`font-mono text-xs uppercase tracking-wider ${
                    today ? "text-accent" : "text-fg-dim"
                  }`}
                >
                  {label.weekday}
                </span>
                <span
                  className={`font-mono text-base font-semibold ${
                    today ? "text-white" : "text-fg"
                  }`}
                >
                  {label.day}
                </span>
                {today && (
                  <span className="rounded-md bg-accent/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-accent">
                    Oggi
                  </span>
                )}
              </div>
              <span
                className={`font-mono text-[11px] ${
                  dayHasTurni ? "text-accent" : "text-fg-dim"
                }`}
              >
                {dayHasTurni ? `${dayTurni.reduce((n, d) => n + d.turni.length, 0)} turni` : "vuoto"}
              </span>
            </div>

            {/* 3 fasce */}
            <div className="divide-y divide-border">
              {dayTurni.map(({ slot, shift, turni: cellTurni }) => {
                const hasTurni = cellTurni.length > 0;
                const canAddMore = cellTurni.length < 2;
                return (
                  <div
                    key={slot}
                    className="group relative flex items-stretch transition-colors"
                    style={{ background: hasTurni ? shift.color.bg : "var(--color-base)" }}
                    onClick={() => {
                      if (isAdmin && canAddMore && !hasTurni) openCreate(iso, slot);
                    }}
                    role={isAdmin && canAddMore && !hasTurni ? "button" : undefined}
                    title={isAdmin && canAddMore && !hasTurni ? "Tocca per assegnare turno" : undefined}
                  >
                    {/* Label fascia */}
                    <div className="flex w-20 shrink-0 flex-col justify-center px-3 py-3 border-r border-border">
                      <div
                        className="font-mono text-[11px] font-medium uppercase tracking-wider"
                        style={{ color: shift.color.accent }}
                      >
                        {shift.label}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-fg-dim">
                        {shift.start}–{shift.end}
                      </div>
                    </div>

                    {/* Contenuto */}
                    <div className="min-w-0 flex-1 p-2">
                      {cellTurni.length > 0 ? (
                        <div className="space-y-1.5">
                          {cellTurni.map((t) => (
                            <TurnoCard
                              key={t.id}
                              turno={t}
                              shift={shift}
                              isAdmin={isAdmin}
                              deleting={deletingId === t.id}
                              onEdit={onEdit}
                              onDelete={onDelete}
                            />
                          ))}
                          {isAdmin && canAddMore && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCreate(iso, slot);
                              }}
                              className="flex w-full items-center justify-center rounded-md border border-dashed py-1 text-xs transition-opacity active:opacity-100"
                              style={{ borderColor: `${shift.color.accent}40`, color: shift.color.accent }}
                            >
                              + seconda persona
                            </button>
                          )}
                        </div>
                      ) : (
                        isAdmin && canAddMore && (
                          <div className="flex h-10 items-center justify-center opacity-30 transition-opacity group-active:opacity-70">
                            <span className="font-mono text-base" style={{ color: shift.color.accent }}>+</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
//  TurnoCard — card di un turno, condivisa tra vista desktop e mobile.
// ============================================================================
interface TurnoCardProps {
  turno: TurnoWithMember;
  shift: ShiftDefinition;
  isAdmin: boolean;
  deleting: boolean;
  onEdit: (t: TurnoWithMember) => void;
  onDelete: (id: string) => void;
}

function TurnoCard({ turno, shift, isAdmin, deleting, onEdit, onDelete }: TurnoCardProps) {
  return (
    <div
      className="max-w-full px-3 py-2 animate-fade-in"
      style={{
        background: "rgba(46, 125, 50, 0.22)",
        border: "1.5px solid rgba(111, 227, 165, 0.5)",
        borderRadius: "20px",
        boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 2px 14px rgba(0, 0, 0, 0.22)",
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <a
          href={`/turno/${turno.id}`}
          className="block truncate text-sm font-medium transition hover:opacity-80"
          style={{ color: "var(--color-shift-card-fg)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {turno.member_nome ?? "—"}
        </a>
        {isAdmin && (
          <div className="flex shrink-0 gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(turno);
              }}
              className="rounded p-0.5 text-fg-dim transition hover:text-accent"
              aria-label="Modifica"
              title="Modifica"
            >
              ✎
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(turno.id);
              }}
              disabled={deleting}
              className="rounded p-0.5 text-fg-dim transition hover:text-red-400 disabled:opacity-50"
              aria-label="Elimina"
              title="Elimina"
            >
              {deleting ? "…" : "✕"}
            </button>
          </div>
        )}
      </div>
      {turno.note && (
        <div
          className="mt-1 truncate text-xs"
          style={{ color: "var(--color-shift-card-fg)", opacity: 0.7 }}
        >
          {turno.note}
        </div>
      )}
    </div>
  );
}
