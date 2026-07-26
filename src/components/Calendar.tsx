"use client";

import { useState } from "react";
import Link from "next/link";
import { deleteTurno, type TurnoFormState } from "@/app/actions";
import {
  SHIFTS,
  SHIFT_ORDER,
  weekDays,
  formatDayLabel,
  isToday,
  slotFromStart,
  type ShiftSlot,
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

  // Range display (es. "26/07 – 01/08")
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
    // Al successo, revalidatePath ricarica la pagina server-side
  }

  return (
    <>
      {/* Header calendario: navigazione settimana */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Calendario turni</h1>
          <p className="mt-1 font-mono text-sm text-fg-muted">
            {firstLabel.day} – {lastLabel.day}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/?week=${prevIso}`}
            className="btn-ghost px-3 py-2 text-sm"
            aria-label="Settimana precedente"
          >
            ←
          </Link>
          <Link
            href={`/?week=${todayIso}`}
            className="btn-ghost px-4 py-2 text-sm font-medium"
          >
            Oggi
          </Link>
          <Link
            href={`/?week=${nextIso}`}
            className="btn-ghost px-3 py-2 text-sm"
            aria-label="Settimana successiva"
          >
            →
          </Link>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setModal({ kind: "create-blank" })}
              className="btn-accent ml-2 px-4 py-2 text-sm"
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

      {/* Griglia calendario */}
      <div className="panel overflow-hidden">
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
                  today ? "bg-accent/5" : ""
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
                    today ? "text-accent" : "text-fg"
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
                return (
                  <div
                    key={iso}
                    className="group relative min-h-[80px] border-l border-border p-2 transition-colors"
                    style={{
                      background: hasTurni ? shift.color.bg : "var(--color-base)",
                    }}
                    onMouseEnter={(e) => {
                      if (isAdmin && !hasTurni) {
                        e.currentTarget.style.background = shift.color.bgHover;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (isAdmin && !hasTurni) {
                        e.currentTarget.style.background = "var(--color-base)";
                      }
                    }}
                    onClick={() => {
                      if (isAdmin && !hasTurni) {
                        setModal({ kind: "create", date: iso, slot });
                      }
                    }}
                    role={isAdmin && !hasTurni ? "button" : undefined}
                    title={isAdmin && !hasTurni ? "Clicca per assegnare turno" : undefined}
                  >
                    {/* Turni nella cella */}
                    <div className="space-y-1.5">
                      {cellTurni.map((t) => (
                        <div
                          key={t.id}
                          className="rounded-md border px-2 py-1.5 animate-fade-in"
                          style={{
                            borderColor: `${shift.color.accent}40`,
                            background: `${shift.color.bg}`,
                          }}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate text-sm font-medium"
                                style={{ color: "var(--color-fg)" }}
                              >
                                {t.member_nome ?? "—"}
                              </div>
                              {t.note && (
                                <div className="mt-0.5 truncate text-xs text-fg-dim">
                                  {t.note}
                                </div>
                              )}
                            </div>
                            {/* Azioni admin */}
                            {isAdmin && (
                              <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModal({ kind: "edit", turno: t });
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
                                    handleDelete(t.id);
                                  }}
                                  disabled={deletingId === t.id}
                                  className="rounded p-0.5 text-fg-dim transition hover:text-red-400 disabled:opacity-50"
                                  aria-label="Elimina"
                                  title="Elimina"
                                >
                                  {deletingId === t.id ? "…" : "✕"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Indicatore "+" per admin su cella vuota */}
                    {isAdmin && !hasTurni && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-60 pointer-events-none">
                        <span
                          className="font-mono text-lg"
                          style={{ color: shift.color.accent }}
                        >
                          +
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
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
            {isAdmin && " Clicca su una cella o usa \"+ Nuovo turno\"."}
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
