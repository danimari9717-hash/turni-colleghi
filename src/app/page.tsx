import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";
import Calendar from "@/components/Calendar";
import { mondayOfWeek } from "@/lib/shifts";
import type { Profile, TeamMember, TurnoWithMember } from "@/types/database";

// Forza rendering dinamico ad ogni richiesta + no-store su tutte le fetch.
// Critico per dati multi-utente: senza questo, Next.js può cacheare la pagina
// e servire dati stale quando un altro utente scrive (es. note su turno).
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protezione route: se non autenticato, vai al login.
  if (!user) {
    redirect("/login");
  }

  // Determina la settimana da mostrare (searchParams.week o settimana corrente).
  const params = await searchParams;
  const weekParam = params.week;
  const mondayIso = weekParam
    ? /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(weekParam)
      ? weekParam
      : mondayOfWeek(new Date())
    : mondayOfWeek(new Date());

  // Calcola range date della settimana (lun-dom, UTC).
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mondayIso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const startDay = days[0];
  const endDay = days[6];

  // Query parallele: profile, turni, e members sono indipendenti tra loro.
  // Prima erano sequenziali (3 round-trip); ora 1 solo round-trip logico.
  const [profileResult, turniResult, membersResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nome, email, role")
      .eq("id", user.id)
      .single<Pick<Profile, "id" | "nome" | "email" | "role">>(),
    supabase
      .from("turni")
      .select("id, user_id, data, ora_inizio, ora_fine, note, created_by, created_at, updated_at")
      .gte("data", startDay)
      .lte("data", endDay)
      .order("data", { ascending: true })
      .order("ora_inizio", { ascending: true })
      .returns<TurnoWithMember[]>(),
    supabase
      .from("team_members")
      .select("id, nome, role")
      .order("nome", { ascending: true })
      .returns<TeamMember[]>(),
  ]);

  const profile = profileResult.data;
  const turni = turniResult.data;
  const members = membersResult.data;

  const isAdmin = profile?.role === "admin";

  // Arricchisce i turni con il nome del collega (lookup lato server).
  const memberMap = new Map((members ?? []).map((m) => [m.id, m.nome]));
  const turniWithMember: TurnoWithMember[] = (turni ?? []).map((t) => ({
    ...t,
    member_nome: memberMap.get(t.user_id),
  }));

  return (
    <>
      <Header profile={profile} />
      <main className="safe-bottom mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Calendar
          turni={turniWithMember}
          members={members ?? []}
          isAdmin={isAdmin}
          mondayIso={mondayIso}
        />
      </main>
    </>
  );
}
