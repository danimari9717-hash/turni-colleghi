import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";
import Calendar from "@/components/Calendar";
import { mondayOfWeek, monthRange, shiftHours } from "@/lib/shifts";
import type {
  Profile,
  TeamMember,
  TurnoWithMember,
  Obiettivo,
  ObiettivoCompletatoWithObiettivo,
  PuntiAdjustment,
} from "@/types/database";

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

  // Range del mese corrente (per vista Mese + carosello "Il tuo mese").
  const mRange = monthRange(mondayIso);
  const todayIso = new Date().toISOString().slice(0, 10);

  // Query parallele: tutti i dati necessari in un unico round-trip logico.
  // 1. profile (utente corrente)
  // 2. turni settimana (vista Lista)
  // 3. turni mese intero (vista Mese + carosello "Il tuo mese")
  // 4. members (lookup nomi)
  // 5. obiettivi + completamenti + adjustments (carosello podio FantaTab)
  const [
    profileResult,
    weekTurniResult,
    monthTurniResult,
    membersResult,
    obiettiviResult,
    completatiResult,
    adjustmentsResult,
  ] = await Promise.all([
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
      .from("turni")
      .select("id, user_id, data, ora_inizio, ora_fine, note, created_by, created_at, updated_at")
      .gte("data", mRange.firstDayIso)
      .lte("data", mRange.lastDayIso)
      .order("data", { ascending: true })
      .order("ora_inizio", { ascending: true })
      .returns<TurnoWithMember[]>(),
    supabase
      .from("team_members")
      .select("id, nome, role")
      .order("nome", { ascending: true })
      .returns<TeamMember[]>(),
    supabase
      .from("obiettivi")
      .select("id, titolo, tipo, valore_ricompensa, valuta, soglia_gruppo, created_at")
      .returns<Obiettivo[]>(),
    supabase
      .from("obiettivi_completati")
      .select("id, obiettivo_id, user_id, turno_id, data_completamento, note")
      .returns<ObiettivoCompletatoWithObiettivo[]>(),
    supabase
      .from("punti_adjustments")
      .select("id, user_id, delta_fuoco, delta_diamanti, note, created_by, created_at")
      .returns<PuntiAdjustment[]>(),
  ]);

  const profile = profileResult.data;
  const weekTurni = weekTurniResult.data;
  const monthTurni = monthTurniResult.data;
  const members = membersResult.data;
  const obiettivi = obiettiviResult.data;
  const completati = completatiResult.data;
  const adjustments = adjustmentsResult.data;

  const isAdmin = profile?.role === "admin";

  // Arricchisce i turni con il nome del collega (lookup lato server).
  const memberMap = new Map((members ?? []).map((m) => [m.id, m.nome]));
  const enrichTurni = (arr: TurnoWithMember[] | null) =>
    (arr ?? []).map((t) => ({ ...t, member_nome: memberMap.get(t.user_id) }));
  const weekTurniWithMember = enrichTurni(weekTurni);
  const monthTurniWithMember = enrichTurni(monthTurni);

  // === Carosello statistiche: calcoli lato server ===

  // 1. "Il tuo mese": ore + turni dell'utente corrente nel mese
  const myMonthTurni = (monthTurni ?? []).filter((t) => t.user_id === user.id);
  const myMonthHours = myMonthTurni.reduce(
    (sum, t) => sum + shiftHours(t.ora_inizio, t.ora_fine),
    0,
  );

  // 2. Podio FantaTab (top 3 per diamanti, come classifica)
  const objMap = new Map(
    (obiettivi ?? []).map((o) => [o.id, { valuta: o.valuta, valore: o.valore_ricompensa }]),
  );
  const totals = new Map<
    string,
    { user_id: string; nome: string; totale_fuoco: number; totale_diamanti: number }
  >();
  for (const m of members ?? []) {
    totals.set(m.id, { user_id: m.id, nome: m.nome, totale_fuoco: 0, totale_diamanti: 0 });
  }
  for (const c of completati ?? []) {
    const obj = objMap.get(c.obiettivo_id);
    if (!obj) continue;
    const t = totals.get(c.user_id);
    if (!t) continue;
    if (obj.valuta === "fuoco") t.totale_fuoco += obj.valore;
    else t.totale_diamanti += obj.valore;
  }
  for (const a of adjustments ?? []) {
    const t = totals.get(a.user_id);
    if (!t) continue;
    t.totale_fuoco += a.delta_fuoco;
    t.totale_diamanti += a.delta_diamanti;
  }
  const podio = Array.from(totals.values())
    .sort((a, b) => {
      if (b.totale_fuoco !== a.totale_fuoco) return b.totale_fuoco - a.totale_fuoco;
      return b.totale_diamanti - a.totale_diamanti;
    })
    .slice(0, 3);

  // 3. "Prossimo turno": primo turno futuro dell'utente (data >= oggi)
  const nextTurno = (monthTurni ?? [])
    .filter((t) => t.user_id === user.id && t.data >= todayIso)
    .sort((a, b) => a.data.localeCompare(b.data) || a.ora_inizio.localeCompare(b.ora_inizio))[0];

  return (
    <>
      <Header profile={profile} />
      <main className="safe-bottom mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Calendar
          turni={weekTurniWithMember}
          monthTurni={monthTurniWithMember}
          members={members ?? []}
          isAdmin={isAdmin}
          mondayIso={mondayIso}
          currentUserId={user.id}
          stats={{
            myMonthHours,
            myMonthTurniCount: myMonthTurni.length,
            podio,
            nextTurno: nextTurno
              ? {
                  data: nextTurno.data,
                  oraInizio: nextTurno.ora_inizio.slice(0, 5),
                  oraFine: nextTurno.ora_fine.slice(0, 5),
                  memberNome: memberMap.get(nextTurno.user_id) ?? "—",
                }
              : null,
          }}
        />
      </main>
    </>
  );
}
