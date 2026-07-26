"use client";

import { useActionState, useEffect, useState } from "react";
import { createTurno, updateTurno, type TurnoFormState } from "@/app/actions";
import { SHIFTS, SHIFT_ORDER, type ShiftSlot } from "@/lib/shifts";
import type { TeamMember, TurnoWithMember } from "@/types/database";

interface ShiftFormProps {
  mode: "create" | "edit";
  turno?: TurnoWithMember | null;
  members: TeamMember[];
  // Per pre-popolare data/slot in modalità create (click su cella)
  initialDate?: string;
  initialSlot?: ShiftSlot;
  onClose: () => void;
}

export default function ShiftForm({
  mode,
  turno,
  members,
  initialDate,
  initialSlot,
  onClose,
}: ShiftFormProps) {
  const isEdit = mode === "edit";

  // Stato iniziale: dai valori del turno (edit) o dai predefiniti (create)
  const [selectedSlot, setSelectedSlot] = useState<ShiftSlot>(
    turno
      ? (Object.values(SHIFTS).find((s) => s.start === turno.ora_inizio)?.slot ?? "morning")
      : (initialSlot ?? "morning"),
  );

  const action = isEdit ? updateTurno : createTurno;
  const [state, formAction, pending] = useActionState<TurnoFormState | null, FormData>(
    action,
    null,
  );

  // Chiudi modale al successo
  useEffect(() => {
    if (state?.success) {
      onClose();
    }
  }, [state, onClose]);

  // Chiudi con ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="panel-glow w-full max-w-md p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-fg">
            {isEdit ? "Modifica turno" : "Nuovo turno"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-dim transition hover:text-fg"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        <form action={formAction} className="space-y-5">
          {/* ID turno (hidden, solo edit) */}
          {isEdit && turno && <input type="hidden" name="id" value={turno.id} />}

          {/* Collega */}
          <div>
            <label className="mb-2 block font-mono text-xs uppercase tracking-wider text-fg-dim">
              Collega
            </label>
            <select
              name="user_id"
              required
              defaultValue={turno?.user_id ?? ""}
              className="input w-full px-3 py-2.5 text-sm"
            >
              <option value="" disabled>
                Seleziona…
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Data */}
          <div>
            <label className="mb-2 block font-mono text-xs uppercase tracking-wider text-fg-dim">
              Data
            </label>
            <input
              name="data"
              type="date"
              required
              defaultValue={turno?.data ?? initialDate ?? ""}
              className="input w-full px-3 py-2.5 text-sm font-mono"
            />
          </div>

          {/* Fascia — 3 bottoni */}
          <div>
            <label className="mb-2 block font-mono text-xs uppercase tracking-wider text-fg-dim">
              Fascia
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SHIFT_ORDER.map((slot) => {
                const shift = SHIFTS[slot];
                const isSelected = selectedSlot === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`rounded-lg border px-2 py-3 text-center transition-all 120ms ${
                      isSelected
                        ? "border-2"
                        : "border border-border bg-base hover:border-border-bright"
                    }`}
                    style={
                      isSelected
                        ? {
                            borderColor: shift.color.accent,
                            background: shift.color.bg,
                            boxShadow: `0 0 12px ${shift.color.glow}`,
                          }
                        : undefined
                    }
                  >
                    {/* Hidden input per inviare il valore del slot */}
                    {isSelected && <input type="hidden" name="slot" value={slot} />}
                    <div
                      className="font-mono text-xs font-medium uppercase tracking-wider"
                      style={{ color: isSelected ? shift.color.accent : "var(--color-fg-muted)" }}
                    >
                      {shift.label}
                    </div>
                    <div
                      className="mt-1 font-mono text-[11px]"
                      style={{ color: isSelected ? shift.color.accent : "var(--color-fg-dim)" }}
                    >
                      {shift.start}–{shift.end}
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Fallback hidden input se nessun slot selezionato (non dovrebbe succedere) */}
            {!SHIFT_ORDER.includes(selectedSlot) && (
              <input type="hidden" name="slot" value="morning" />
            )}
          </div>

          {/* Note */}
          <div>
            <label className="mb-2 block font-mono text-xs uppercase tracking-wider text-fg-dim">
              Note <span className="text-fg-dim/60">(opzionale)</span>
            </label>
            <textarea
              name="note"
              rows={2}
              defaultValue={turno?.note ?? ""}
              className="input w-full px-3 py-2.5 text-sm resize-none"
              placeholder="Eventuali note…"
            />
          </div>

          {/* Errore */}
          {state?.error && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 animate-fade-in">
              {state.error}
            </p>
          )}

          {/* Azioni */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost flex-1 px-4 py-2.5 text-sm font-medium"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={pending}
              className="btn-accent flex-1 px-4 py-2.5 text-sm"
            >
              {pending ? "Salvataggio…" : isEdit ? "Salva" : "Crea turno"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
