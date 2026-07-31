"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
//  Componente principale
// ============================================================================
export default function Calendar({
  turni,
  monthTurni,
  members,
  isAdmin,
  mondayIso,
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
  const todayIso = new Date().toISOString().slice(0, 10);
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

  // Navigazione mese (vista Mese): sposta il mese di ±1 e usa il 15°
  // giorno del mese target come riferimento. Il 15° è garantito nello
  // stesso mese (anche se il lunedì della sua settimana cade nel mese
  // precedente, monthRange() deriva il mese dal mondayIso che a sua
  // volta deriva dal 15°, che è sempre nel mese corretto).
  // Usare il 1° del mese causava bug: se il 1° è sabato/domenica, il
  // lunedì della sua settimana ricade nel mese precedente.
  const prevMonthRef = useMemo(() => {
    const d = new Date(mondayIso + "T00:00:00Z");
    d.setUTCDate(15); // evita overflow setUTCMonth (es. 31 mar -> 31 feb)
    d.setUTCMonth(d.getUTCMonth() - 1);
    return mondayOfWeekFromDate(d.toISOString().slice(0, 10));
  }, [mondayIso]);
  const nextMonthRef = useMemo(() => {
    const d = new Date(mondayIso + "T00:00:00Z");
    d.setUTCDate(15);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return mondayOfWeekFromDate(d.toISOString().slice(0, 10));
  }, [mondayIso]);

  // Destinazioni di navigazione condizionali in base alla vista attiva.
  const prevHref = viewMode === "mese" ? `/?week=${prevMonthRef}` : `/?week=${prevIso}`;
  const nextHref = viewMode === "mese" ? `/?week=${nextMonthRef}` : `/?week=${nextIso}`;
  // "Oggi" torna alla settimana corrente in entrambe le viste; in Vista
  // Mese questo mostra il mese corrente (la settimana corrente è nel
  // mese corrente).
  const todayHref = `/?week=${todayIso}`;

  const firstLabel = formatDayLabel(days[0]);
  const lastLabel = formatDayLabel(days[6]);
  const mRange = monthRange(mondayIso);
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
            onClick={() => setViewMode("lista")}
            className="rounded-lg px-5 py-1.5 text-sm font-medium transition-all"
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
            onClick={() => setViewMode("mese")}
            className="rounded-lg px-5 py-1.5 text-sm font-medium transition-all"
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
          <Link href={prevHref} className="px-3 py-2 text-sm" aria-label="Precedente" style={navBtnStyle}>
            ←
          </Link>
          <Link href={todayHref} className="px-4 py-2 text-sm font-medium" style={navBtnStyle}>
            Oggi
          </Link>
          <Link href={nextHref} className="px-3 py-2 text-sm" aria-label="Successivo" style={navBtnStyle}>
            →
          </Link>
          {isAdmin && viewMode === "lista" && (
            <button
              type="button"
              onClick={() => setModal({ kind: "create-blank" })}
              className="btn-accent px-4 py-2 text-sm"
            >
              + Nuovo turno
            </button>
          )}
        </div>
      </div>

      {/* ============ VISTA LISTA (default) ============ */}
      {viewMode === "lista" && (
        <>
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
        </>
      )}

      {/* ============ VISTA MESE ============ */}
      {viewMode === "mese" && (
        <MonthView
          mondayIso={mondayIso}
          monthTurniByDay={monthTurniByDay}
          currentUserId={currentUserId}
          onlyMine={onlyMine}
          setOnlyMine={setOnlyMine}
          onSelectDay={handleSelectDay}
        />
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
        {/* Card 1: Il tuo mese */}
        <div
          className="flex shrink-0 flex-col rounded-2xl border p-4"
          style={{
            width: "200px",
            background: "var(--color-surface-active)",
            borderColor: "rgba(0, 229, 255, 0.25)",
            boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 2px 12px rgba(0, 0, 0, 0.22)",
          }}
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
            Il tuo mese
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-mono text-3xl font-bold text-accent">
              {stats.myMonthHours}
            </span>
            <span className="font-mono text-xs text-fg-muted">ore</span>
          </div>
          <div className="mt-1 font-mono text-xs text-fg-muted">
            {stats.myMonthTurniCount} turni
          </div>
        </div>

        {/* Card 2: Podio FantaTab */}
        <div
          className="flex shrink-0 flex-col rounded-2xl border p-4"
          style={{
            width: "220px",
            background: "var(--color-surface-active)",
            borderColor: "rgba(255, 210, 74, 0.25)",
            boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 2px 12px rgba(0, 0, 0, 0.22)",
          }}
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
            Podio FantaTab
          </div>
          <div className="mt-2 space-y-1.5">
            {stats.podio.length === 0 ? (
              <div className="font-mono text-xs text-fg-dim">Nessun dato</div>
            ) : (
              stats.podio.map((r, i) => (
                <div key={r.user_id} className="flex items-center gap-2">
                  <span className="text-sm">{positions[i]}</span>
                  <span
                    className="truncate text-xs font-medium"
                    style={{ color: r.user_id === currentUserId ? "var(--color-accent)" : "var(--color-fg)" }}
                  >
                    {r.nome}
                  </span>
                  <span className="ml-auto font-mono text-xs font-bold" style={{ color: VALUTE.fuoco.color }}>
                    {r.totale_fuoco}
                  </span>
                  {r.totale_diamanti > 0 && (
                    <span className="font-mono text-xs" style={{ color: VALUTE.diamante.color }}>
                      {r.totale_diamanti}💎
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Card 3: Prossimo turno */}
        <div
          className="flex shrink-0 flex-col rounded-2xl border p-4"
          style={{
            width: "200px",
            background: "var(--color-surface-active)",
            borderColor: "rgba(0, 255, 163, 0.25)",
            boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 2px 12px rgba(0, 0, 0, 0.22)",
          }}
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
            Prossimo turno
          </div>
          {stats.nextTurno ? (
            <>
              <div className="mt-2 font-mono text-lg font-bold text-fg">
                {formatDayLabel(stats.nextTurno.data).weekday} {stats.nextTurno.data.slice(8)}
              </div>
              <div className="mt-1 font-mono text-xs text-fg-muted">
                {stats.nextTurno.oraInizio} – {stats.nextTurno.oraFine}
              </div>
            </>
          ) : (
            <div className="mt-2 font-mono text-xs text-fg-dim">
              Nessun turno programmato
            </div>
          )}
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
  monthTurniByDay,
  currentUserId,
  onlyMine,
  setOnlyMine,
  onSelectDay,
}: {
  mondayIso: string;
  monthTurniByDay: Map<string, TurnoWithMember[]>;
  currentUserId: string;
  onlyMine: boolean;
  setOnlyMine: (v: boolean) => void;
  onSelectDay: (iso: string) => void;
}) {
  const grid = useMemo(() => monthGrid(mondayIso), [mondayIso]);
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
            onClick={() => setOnlyMine(!onlyMine)}
            className="relative h-6 w-11 rounded-full transition-colors"
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
  const tap = useTapHandler(() => onSelectDay(iso));

  return (
    <button
      type="button"
      onTouchStart={tap.onTouchStart}
      onTouchMove={tap.onTouchMove}
      onClick={tap.onClick}
      className="relative flex min-h-[64px] flex-col rounded-lg border p-1.5 text-left transition-all active:scale-95"
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
        // touch-action: pan-y permette lo scroll verticale nativo del
        // browser senza che il browser attenda il nostro handler custom.
        touchAction: "pan-y",
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
      {/* Deduplica per user_id: una persona può avere più turni lo stesso giorno */}
      <div className="mt-1 flex items-center">
        {(() => {
          const seen = new Set<string>();
          const unique = dayTurni.filter((t) => {
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
                      // Sovrapposizione: primo avatar a sinistra, successivi
                      // si sovrappongono di ~6px (33% di 18px).
                      marginLeft: idx === 0 ? 0 : "-6px",
                      // Bordo del colore della cella per separare gli avatar
                      border: `1.5px solid ${
                        today ? "rgba(0, 229, 255, 0.3)" : "var(--color-base)"
                      }`,
                      // Glow per l'avatar dell'utente corrente
                      boxShadow: isMe ? `0 0 6px ${entry.color}` : "none",
                      zIndex: shown.length - idx, // primo avatar sopra gli altri
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
