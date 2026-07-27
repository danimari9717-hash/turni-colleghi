import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";
import Calendar from "@/components/Calendar";
import { mondayOfWeek } from "@/lib/shifts";
import type { Profile, TeamMember, TurnoWithMember } from "@/types/database";

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

  // Legge il proprio profilo (policy profiles_select_self).
  const profileQuery = await supabase
    .from("profiles")
    .select("id, nome, email, role")
    .eq("id", user.id)
    .single<Pick<Profile, "id" | "nome" | "email" | "role">>();
  const { data: profile, error: profileError } = profileQuery;

  const isAdmin = profile?.role === "admin";

  // DEBUG temporaneo: mostra errori di lettura profilo.
  if (profileError) {
    return (
      <main className="safe-bottom mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="mb-4 text-xl font-semibold text-fg">Debug: errore profilo</h1>
        <pre className="rounded-md border border-border bg-base p-4 text-xs text-red-400 overflow-auto">
{JSON.stringify({
  userId: user.id,
  userEmail: user.email,
  error: profileError,
}, null, 2)}
        </pre>
        <p className="mt-4 text-sm text-fg-dim">
          Copia questo output e invialo a Devin.
        </p>
      </main>
    );
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

  // Fetch turni della settimana (policy turni_select_all: tutti gli autenticati).
  const { data: turni } = await supabase
    .from("turni")
    .select("id, user_id, data, ora_inizio, ora_fine, note, created_by, created_at, updated_at")
    .gte("data", startDay)
    .lte("data", endDay)
    .order("data", { ascending: true })
    .order("ora_inizio", { ascending: true })
    .returns<TurnoWithMember[]>();

  // Fetch membri team (vista team_members: nome/role di tutti).
  const { data: members } = await supabase
    .from("team_members")
    .select("id, nome, role")
    .order("nome", { ascending: true })
    .returns<TeamMember[]>();

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
