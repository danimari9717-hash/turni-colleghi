"use client";

import { useState } from "react";
import Link from "next/link";
import { deleteTurno } from "@/app/actions";
import {
  SHIFTS,
  SHIFT_ORDER,
  weekDays,
  formatDayLabel,
  isToday,
  slotFromStart,
  type ShiftSlot,
  type ShiftDefinition,
} from "@/lib/shifts";
import type { TeamMember, TurnoWithMember } from "@/types/database";
import ShiftForm from "./ShiftForm";

interface CalendarProps {
  turni: TurnoWithMember[];
  members: TeamMember[];
  isAdmin: boolean;
  mondayIso: string;
}

type ModalState =
  | { kind: "closed" }
  | { kind: "create"; date: string; slot: ShiftSlot }
  | { kind: "create-blank" }
  | { kind: "edit"; turno: TurnoWithMember };

export default function Calendar({ turni, members, isAdmin, mondayIso }: CalendarProps) {
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const days = weekDays(mondayIso);

  // Mappa turni per accesso rapido: key = `${date}|${slot}`
  const turniMap = new Map<string, TurnoWithMember[]>();
  for (const t of turni) {
    const slot = slotFromStart(t.ora_inizio.slice(0, 5));
    if (!slot) continue;
    const key = `${t.data}|${slot}`;
    const arr = turniMap.get(key) ?? [];
    arr.push(t);
    turniMap.set(key, arr);
  }

  // Navigazione settimana
  const prevWeek = new Date(mondayIso + "T00:00:00Z");
  prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);
  const nextWeek = new Date(mondayIso + "T00:00:00Z");
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const prevIso = prevWeek.toISOString().slice(0, 10);
  const nextIso = nextWeek.toISOString().slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);

  const firstLabel = formatDayLabel(days[0]);
  const lastLabel = formatDayLabel(days[6]);

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

  return (
    <>
      {/* Header calendario: navigazione settimana */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Calendario turni</h1>
          <p className="mt-1 font-mono text-sm text-fg-muted">
            {firstLabel.day} – {lastLabel.day}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/?week=${prevIso}`}
            className="btn-glass px-3 py-2 text-sm"
            aria-label="Settimana precedente"
          >
            ←
          </Link>
          <Link
            href={`/?week=${todayIso}`}
            className="btn-glass px-4 py-2 text-sm font-medium"
          >
            Oggi
          </Link>
          <Link
            href={`/?week=${nextIso}`}
            className="btn-glass px-3 py-2 text-sm"
            aria-label="Settimana successiva"
          >
            →
          </Link>
          {isAdmin && (
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

      {/* Legenda fasce */}
      <div className="mb-4 flex flex-wrap gap-4">
        {SHIFT_ORDER.map((slot) => {
          const shift = SHIFTS[slot];
          return (
            <div key={slot} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{
                  background: shift.color.accent,
                  boxShadow: `0 0 8px ${shift.color.glow}`,
                }}
              />
              <span className="font-mono text-xs text-fg-muted">
                {shift.label} <span className="text-fg-dim">{shift.start}–{shift.end}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* ============ VISTA DESKTOP (≥640px): griglia orizzontale ============ */}
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
              {/* Label fascia */}
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

              {/* Celle giorni */}
              {days.map((iso) => {
                const key = `${iso}|${slot}`;
                const cellTurni = turniMap.get(key) ?? [];
                const hasTurni = cellTurni.length > 0;
                const canAddMore = cellTurni.length < 2;
                return (
                  <div
                    key={iso}
                    className="group relative min-h-[80px] overflow-hidden border-l border-border p-2 transition-colors"
                    style={{
                      background: hasTurni ? shift.color.bg : "var(--color-base)",
                    }}
                    onMouseEnter={(e) => {
                      if (isAdmin && canAddMore) {
                        e.currentTarget.style.background = shift.color.bgHover;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (isAdmin && canAddMore) {
                        e.currentTarget.style.background = hasTurni ? shift.color.bg : "var(--color-base)";
                      }
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
                          onEdit={openEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>

                    {/* "+" per slot vuoto (overlay) o per aggiungere seconda persona (in basso) */}
                    {isAdmin && canAddMore && !hasTurni && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-60 pointer-events-none">
                        <span
                          className="font-mono text-lg"
                          style={{ color: shift.color.accent }}
                        >
                          +
                        </span>
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

      {/* ============ VISTA MOBILE (<640px): lista verticale di giorni ============ */}
      <div className="space-y-3 sm:hidden">
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
              className={`panel overflow-hidden ${
                today ? "today-card" : ""
              }`}
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
                </div>
                <span className="font-mono text-[11px] text-fg-dim">
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
                      {/* Label fascia (colonna sinistra) */}
                      <div
                        className="flex w-20 shrink-0 flex-col justify-center px-3 py-3 border-r border-border"
                      >
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

                      {/* Contenuto fasce */}
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
                                onEdit={openEdit}
                                onDelete={handleDelete}
                              />
                            ))}
                            {/* Pulsante "+" per aggiungere seconda persona (mobile) */}
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
                              <span
                                className="font-mono text-base"
                                style={{ color: shift.color.accent }}
                              >
                                +
                              </span>
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

      {/* Errore delete */}
      {deleteError && (
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 animate-fade-in">
          Errore eliminazione: {deleteError}
        </div>
      )}

      {/* Stato vuoto (nessun turno nella settimana) */}
      {turni.length === 0 && (
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
        <ShiftForm
          mode="create"
          members={members}
          onClose={() => setModal({ kind: "closed" })}
        />
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
// TurnoCard — card di un turno, condivisa tra vista desktop e mobile.
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
      className="max-w-full overflow-hidden px-3 py-2 animate-fade-in"
      style={{
        // Glass simulato: sfondo molto trasparente per far passare il gradiente body,
        // + gradient diagonale marcato che simula il riflesso luce sul vetro.
        // Il blur reale su sfondo uniforme non è visibile, quindi ci affidiamo
        // a trasparenza + bordo luminoso + inner glow per dare percezione di vetro.
        background:
          "linear-gradient(135deg, rgba(126, 235, 176, 0.22) 0%, rgba(46, 125, 50, 0.08) 60%, rgba(126, 235, 176, 0.14) 100%)",
        backdropFilter: "blur(12px) saturate(160%)",
        WebkitBackdropFilter: "blur(12px) saturate(160%)",
        border: "1px solid rgba(126, 235, 176, 0.55)",
        borderRadius: "14px",
        boxShadow:
          "inset 0 1px 0 0 rgba(255, 255, 255, 0.2), inset 0 0 12px rgba(126, 235, 176, 0.12), 0 2px 14px rgba(0, 0, 0, 0.28)",
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
