"use client";

import { useActionState } from "react";
import { cambiaRuoloUtente, type RuoloFormState } from "./actions";
import type { Profile } from "@/types/database";

interface UsersListProps {
  users: Pick<Profile, "id" | "nome" | "email" | "role">[];
  currentUserId: string;
}

export default function UsersList({ users, currentUserId }: UsersListProps) {
  const [state, formAction, pending] = useActionState<RuoloFormState | null, FormData>(
    cambiaRuoloUtente,
    null,
  );

  return (
    <div className="space-y-4">
      {state?.error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 animate-fade-in">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 animate-fade-in">
          Ruolo aggiornato.
        </p>
      )}

      <div className="panel p-6">
        <div className="space-y-2">
          {users.map((u) => {
            const isAdmin = u.role === "admin";
            const isSelf = u.id === currentUserId;
            const displayName = u.nome || u.email || "—";

            return (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-lg border border-border bg-base px-4 py-3 animate-fade-in"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-fg">
                      {displayName}
                      {isSelf && (
                        <span className="ml-2 font-mono text-xs text-accent">(tu)</span>
                      )}
                    </div>
                    <div className="truncate font-mono text-xs text-fg-dim">
                      {u.email}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider ${
                      isAdmin ? "badge-admin" : "badge-employee"
                    }`}
                  >
                    {isAdmin ? "admin" : "employee"}
                  </span>
                </div>

                {/* Pulsanti azione: niente su se stessi */}
                {!isSelf && (
                  <form action={formAction} className="shrink-0">
                    <input type="hidden" name="user_id" value={u.id} />
                    <input
                      type="hidden"
                      name="ruolo"
                      value={isAdmin ? "employee" : "admin"}
                    />
                    <button
                      type="submit"
                      disabled={pending}
                      className={`px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                        isAdmin
                          ? "btn-ghost text-fg-dim hover:text-red-400"
                          : "btn-accent"
                      }`}
                      title={
                        isAdmin
                          ? "Rimuovi privilegi admin"
                          : "Promuovi ad admin"
                      }
                    >
                      {isAdmin ? "Rimuovi admin" : "Rendi admin"}
                    </button>
                  </form>
                )}
              </div>
            );
          })}

          {users.length === 0 && (
            <p className="font-mono text-sm text-fg-dim">
              Nessun utente trovato.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
