"use client";

import { useActionState, useState } from "react";
import { createAdjustment, deleteAdjustment, type AdjustmentFormState } from "./actions";
import { VALUTE } from "@/lib/objectives";
import type { PuntiAdjustment, TeamMember } from "@/types/database";

interface AdminAdjustmentsProps {
  members: TeamMember[];
  adjustments: PuntiAdjustment[];
  currentUserId: string;
}

export default function AdminAdjustments({
  members,
  adjustments,
  currentUserId,
}: AdminAdjustmentsProps) {
  const [showForm, setShowForm] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [state, formAction, pending] = useActionState<AdjustmentFormState | null, FormData>(
    createAdjustment,
    null,
  );

  // Raggruppa adjustment per utente
  const adjustmentsByUser = new Map<string, PuntiAdjustment[]>();
  for (const a of adjustments) {
    const arr = adjustmentsByUser.get(a.user_id) ?? [];
    arr.push(a);
    adjustmentsByUser.set(a.user_id, arr);
  }

  async function handleDelete(id: string) {
    if (!confirm("Eliminare questo adjustment? I punti verranno ricalcolati.")) return;
    const fd = new FormData();
    fd.set("id", id);
    await deleteAdjustment(null, fd);
  }

  return (
    <div className="panel p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-fg">
          <span className="text-lg">⚙</span>
          Adjustment manuali (admin)
        </h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="btn-ghost px-3 py-1.5 text-sm"
        >
          {showForm ? "Annulla" : "+ Nuovo adjustment"}
        </button>
      </div>

      {/* Form nuovo adjustment */}
      {showForm && (
        <form action={formAction} className="mb-6 space-y-4 rounded-lg border border-border bg-base p-4 animate-fade-in">
          <div>
            <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-fg-dim">
              Utente
            </label>
            <select
              name="user_id"
              required
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="input w-full px-3 py-2 text-sm"
            >
              <option value="" disabled>Seleziona…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-fg-dim">
                Delta {VALUTE.fuoco.symbol} (può essere negativo)
              </label>
              <input
                name="delta_fuoco"
                type="number"
                defaultValue="0"
                className="input w-full px-3 py-2 text-sm font-mono"
                placeholder="es. -10 o +5"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-fg-dim">
                Delta {VALUTE.diamante.symbol} (può essere negativo)
              </label>
              <input
                name="delta_diamanti"
                type="number"
                defaultValue="0"
                className="input w-full px-3 py-2 text-sm font-mono"
                placeholder="es. -1 o +1"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-fg-dim">
              Nota / motivo <span className="text-fg-dim/60">(opzionale)</span>
            </label>
            <input
              name="note"
              type="text"
              className="input w-full px-3 py-2 text-sm"
              placeholder="es. Obiettivo assegnato per sbaglio"
            />
          </div>

          {state?.error && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 animate-fade-in">
              {state.error}
            </p>
          )}
          {state?.success && (
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 animate-fade-in">
              Adjustment applicato.
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="btn-accent px-4 py-2 text-sm"
          >
            {pending ? "Salvataggio…" : "Applica adjustment"}
          </button>
        </form>
      )}

      {/* Lista adjustment esistenti */}
      {adjustments.length === 0 ? (
        <p className="font-mono text-sm text-fg-dim">Nessun adjustment manuale.</p>
      ) : (
        <div className="space-y-2">
          {adjustments
            .slice()
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((a) => {
              const member = members.find((m) => m.id === a.user_id);
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-md border border-border bg-base px-3 py-2 animate-fade-in"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-fg">{member?.nome ?? "—"}</span>
                    {a.delta_fuoco !== 0 && (
                      <span
                        className="font-mono text-sm font-medium"
                        style={{ color: VALUTE.fuoco.color }}
                      >
                        {a.delta_fuoco > 0 ? "+" : ""}{a.delta_fuoco} {VALUTE.fuoco.symbol}
                      </span>
                    )}
                    {a.delta_diamanti !== 0 && (
                      <span
                        className="font-mono text-sm font-medium"
                        style={{ color: VALUTE.diamante.color }}
                      >
                        {a.delta_diamanti > 0 ? "+" : ""}{a.delta_diamanti} {VALUTE.diamante.symbol}
                      </span>
                    )}
                    {a.note && (
                      <span className="text-xs text-fg-dim">— {a.note}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
                    className="rounded p-1 text-fg-dim transition hover:text-red-400"
                    aria-label="Elimina adjustment"
                    title="Elimina adjustment"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
