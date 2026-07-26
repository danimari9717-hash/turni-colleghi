"use client";

import { useActionState, useEffect, useState } from "react";
import { completaObiettivo, rimuoviCompletamento, type ObiettivoFormState } from "./actions";
import { groupByTipo, formatReward, VALUTE, TIPI_LABEL } from "@/lib/objectives";
import type {
  Obiettivo,
  ObiettivoCompletatoWithObiettivo,
  ObiettivoTipo,
} from "@/types/database";

interface ObjectivesPanelProps {
  turnoId: string;
  obiettivi: Obiettivo[];
  completati: ObiettivoCompletatoWithObiettivo[];
  currentUserId: string;
  isOwnTurno: boolean;
  memberNome: string;
}

interface Toast {
  id: number;
  message: string;
  color: string;
}

export default function ObjectivesPanel({
  turnoId,
  obiettivi,
  completati,
  currentUserId,
  isOwnTurno,
  memberNome,
}: ObjectivesPanelProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [state, formAction, pending] = useActionState<ObiettivoFormState | null, FormData>(
    completaObiettivo,
    null,
  );

  // Mostra toast al successo
  useEffect(() => {
    if (state?.success) {
      // Il toast viene generato dal bottone cliccato (vedi handleComplete)
    }
    if (state?.error) {
      const t: Toast = { id: Date.now(), message: state.error, color: "#ef4444" };
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 2500);
    }
  }, [state]);

  function showToast(message: string, color: string) {
    const t: Toast = { id: Date.now(), message, color };
    setToasts((prev) => [...prev, t]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 2000);
  }

  // Raggruppa obiettivi per tipo
  const groups = groupByTipo(obiettivi);

  // Completati dell'utente corrente per questo turno
  const myCompletati = completati.filter((c) => c.user_id === currentUserId);

  // Per incasso_tab: trova quale soglia è selezionata (se c'è)
  const incassoTabSelected = myCompletati.find(
    (c) => c.obiettivo?.tipo === "incasso_tab",
  );

  // Conta completati per obiettivo (per mostrare "x2" "x3" sui cumulabili)
  function countForObiettivo(objId: string): number {
    return myCompletati.filter((c) => c.obiettivo_id === objId).length;
  }

  async function handleComplete(formData: FormData, obiettivo: Obiettivo) {
    showToast(formatReward(obiettivo), VALUTE[obiettivo.valuta].color);
    formAction(formData);
  }

  async function handleRemove(id: string, obiettivoId: string) {
    const obj = obiettivi.find((o) => o.id === obiettivoId);
    if (obj) {
      showToast(`- Rimossa conferma ${VALUTE[obj.valuta].symbol}`, "#8b98a9");
    }
    const fd = new FormData();
    fd.set("id", id);
    fd.set("turno_id", turnoId);
    await rimuoviCompletamento(null, fd);
    // revalidatePath ricarica
  }

  const canEdit = isOwnTurno;

  return (
    <div className="space-y-6">
      {/* Header sezione */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fg">Obiettivi turno</h2>
        <span className="font-mono text-xs text-fg-dim">
          {isOwnTurno ? "Il tuo turno" : memberNome}
        </span>
      </div>

      {!canEdit && (
        <div className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          Non puoi confermare obiettivi per un turno non tuo.
        </div>
      )}

      {/* Sezione: Gratta e vinci (bottoni rapidi cumulabili) */}
      {groups.gratta_vinci.length > 0 && (
        <ObjectiveSection
          title={TIPI_LABEL.gratta_vinci}
          subtitle="Cumulabili · clicca per confermare"
        >
          <div className="flex flex-wrap gap-2">
            {groups.gratta_vinci.map((o) => {
              const count = countForObiettivo(o.id);
              return (
                <form key={o.id} action={(fd) => handleComplete(fd, o)}>
                  <input type="hidden" name="obiettivo_id" value={o.id} />
                  <input type="hidden" name="turno_id" value={turnoId} />
                  <button
                    type="submit"
                    disabled={!canEdit || pending}
                    className="group relative rounded-lg border px-3 py-2 text-sm transition-all 120ms disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      borderColor: count > 0 ? `${VALUTE[o.valuta].color}60` : "var(--color-border)",
                      background: count > 0 ? `${VALUTE[o.valuta].color}10` : "var(--color-base)",
                    }}
                  >
                    <span className="text-fg">{o.titolo}</span>
                    <span
                      className="ml-2 font-mono text-xs font-medium"
                      style={{ color: VALUTE[o.valuta].color }}
                    >
                      {formatReward(o)}
                    </span>
                    {count > 0 && (
                      <span
                        className="ml-2 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold"
                        style={{
                          background: VALUTE[o.valuta].color,
                          color: "#000",
                        }}
                      >
                        ×{count}
                      </span>
                    )}
                  </button>
                </form>
              );
            })}
          </div>
        </ObjectiveSection>
      )}

      {/* Sezione: Incasso tab (radio, selezione singola mutuamente esclusiva) */}
      {groups.incasso_tab.length > 0 && (
        <ObjectiveSection
          title={TIPI_LABEL.incasso_tab}
          subtitle="Selezione singola · sostituisce la precedente"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {groups.incasso_tab.map((o) => {
              const isSelected = incassoTabSelected?.obiettivo_id === o.id;
              return (
                <form key={o.id} action={(fd) => handleComplete(fd, o)}>
                  <input type="hidden" name="obiettivo_id" value={o.id} />
                  <input type="hidden" name="turno_id" value={turnoId} />
                  <button
                    type="submit"
                    disabled={!canEdit || pending}
                    className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-all 120ms disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      borderColor: isSelected ? `${VALUTE[o.valuta].color}` : "var(--color-border)",
                      background: isSelected ? `${VALUTE[o.valuta].color}10` : "var(--color-base)",
                      boxShadow: isSelected ? `0 0 12px ${VALUTE[o.valuta].color}30` : "none",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-4 w-4 items-center justify-center rounded-full border-2"
                        style={{
                          borderColor: isSelected ? VALUTE[o.valuta].color : "var(--color-border-bright)",
                        }}
                      >
                        {isSelected && (
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: VALUTE[o.valuta].color }}
                          />
                        )}
                      </span>
                      <span className="text-sm text-fg">{o.titolo}</span>
                    </div>
                    <span
                      className="font-mono text-sm font-medium"
                      style={{ color: VALUTE[o.valuta].color }}
                    >
                      {formatReward(o)}
                    </span>
                  </button>
                </form>
              );
            })}
          </div>
        </ObjectiveSection>
      )}

      {/* Sezione: Speciali */}
      {groups.speciale.length > 0 && (
        <ObjectiveSection
          title={TIPI_LABEL.speciale}
          subtitle="Cumulabili · clicca per confermare"
        >
          <div className="flex flex-wrap gap-2">
            {groups.speciale.map((o) => {
              const count = countForObiettivo(o.id);
              return (
                <form key={o.id} action={(fd) => handleComplete(fd, o)}>
                  <input type="hidden" name="obiettivo_id" value={o.id} />
                  <input type="hidden" name="turno_id" value={turnoId} />
                  <button
                    type="submit"
                    disabled={!canEdit || pending}
                    className="group relative rounded-lg border px-3 py-2 text-sm transition-all 120ms disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      borderColor: count > 0 ? `${VALUTE[o.valuta].color}60` : "var(--color-border)",
                      background: count > 0 ? `${VALUTE[o.valuta].color}10` : "var(--color-base)",
                    }}
                  >
                    <span className="text-fg">{o.titolo}</span>
                    <span
                      className="ml-2 font-mono text-xs font-medium"
                      style={{ color: VALUTE[o.valuta].color }}
                    >
                      {formatReward(o)}
                    </span>
                    {count > 0 && (
                      <span
                        className="ml-2 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold"
                        style={{
                          background: VALUTE[o.valuta].color,
                          color: "#000",
                        }}
                      >
                        ×{count}
                      </span>
                    )}
                  </button>
                </form>
              );
            })}
          </div>
        </ObjectiveSection>
      )}

      {/* Riepilogo completati (tutti gli utenti, per monitoraggio) */}
      {completati.length > 0 && (
        <div className="panel p-4">
          <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-fg-dim">
            Conferme turno ({completati.length})
          </h3>
          <div className="space-y-2">
            {completati.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border bg-base px-3 py-2 animate-fade-in"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="font-mono text-sm font-medium"
                    style={{ color: c.obiettivo ? VALUTE[c.obiettivo.valuta].color : "var(--color-fg-muted)" }}
                  >
                    {c.obiettivo ? formatReward(c.obiettivo) : "—"}
                  </span>
                  <span className="text-sm text-fg">{c.obiettivo?.titolo ?? "—"}</span>
                  {c.user_id !== currentUserId && (
                    <span className="font-mono text-xs text-fg-dim">
                      (altro utente)
                    </span>
                  )}
                </div>
                {c.user_id === currentUserId && (
                  <button
                    type="button"
                    onClick={() => handleRemove(c.id, c.obiettivo_id)}
                    className="rounded p-1 text-fg-dim transition hover:text-red-400"
                    aria-label="Rimuovi"
                    title="Rimuovi conferma"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toast container */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-lg border bg-surface px-4 py-3 text-sm font-medium shadow-lg animate-scale-in"
            style={{
              borderColor: `${t.color}60`,
              color: t.color,
              boxShadow: `0 0 20px ${t.color}30`,
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function ObjectiveSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel p-5">
      <div className="mb-4">
        <h3 className="font-mono text-sm font-medium uppercase tracking-wider text-fg">
          {title}
        </h3>
        <p className="mt-0.5 font-mono text-xs text-fg-dim">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
