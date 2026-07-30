import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";
import UsersList from "./UsersList";
import type { Profile } from "@/types/database";

// Forza rendering dinamico: ruoli utenti possono cambiare in qualsiasi momento.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function UtentiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Query parallele: profile e all-users sono indipendenti.
  // Se l'utente non è admin, la RLS profiles_select_admin restituisce 0 righe.
  const [profileResult, usersResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nome, email, role")
      .eq("id", user.id)
      .single<Pick<Profile, "id" | "nome" | "email" | "role">>(),
    supabase
      .from("profiles")
      .select("id, nome, email, role")
      .order("nome", { ascending: true })
      .returns<Pick<Profile, "id" | "nome" | "email" | "role">[]>(),
  ]);

  const profile = profileResult.data;
  const users = usersResult.data;

  // Blocco accesso: solo admin. Anche se un utente non-admin
  // tentasse di accedere direttamente a /utenti, la RLS
  // profiles_select_admin restituirebbe 0 righe (solo il proprio
  // profilo sarebbe leggibile). Questo redirect è una safety net.
  if (profile?.role !== "admin") {
    redirect("/");
  }

  return (
    <>
      <Header profile={profile} />
      <main className="safe-bottom mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <a
            href="/"
            className="font-mono text-xs uppercase tracking-wider text-fg-dim transition hover:text-accent"
          >
            ← Calendario
          </a>
        </div>

        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-fg">
          Gestione utenti
        </h1>

        <p className="mb-6 font-mono text-sm text-fg-dim">
          Promuovi o declassa gli utenti del team. Il tuo ruolo non può essere
          modificato da questa schermata.
        </p>

        <UsersList users={users ?? []} currentUserId={user.id} />
      </main>
    </>
  );
}
