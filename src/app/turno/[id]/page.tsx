import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";
import ObjectivesPanel from "./ObjectivesPanel";
import { SHIFTS, slotFromStart, formatShiftRange } from "@/lib/shifts";
import { TIPI_LABEL, VALUTE } from "@/lib/objectives";
import type {
  Profile,
  TeamMember,
  TurnoWithMember,
  Obiettivo,
  ObiettivoCompletatoWithObiettivo,
} from "@/types/database";

// Forza rendering dinamico: note e obiettivi dei turni cambiano quando
// altri utenti scrivono. Senza questo, la pagina potrebbe servire dati stale.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function TurnoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Query parallele: profile, turno, obiettivi, e completati sono indipendenti.
  // (member dipende da turnoRow, ma è una query leggera fatta dopo).
  const [profileResult, turnoResult, obiettiviResult, completatiResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, nome, email, role")
        .eq("id", user.id)
        .single<Pick<Profile, "id" | "nome" | "email" | "role">>(),
      supabase
        .from("turni")
        .select("id, user_id, data, ora_inizio, ora_fine, note, created_by, created_at, updated_at")
        .eq("id", id)
        .single<TurnoWithMember>(),
      supabase
        .from("obiettivi")
        .select("id, titolo, tipo, valore_ricompensa, valuta, soglia_gruppo, created_at")
        .order("valore_ricompensa", { ascending: true })
        .returns<Obiettivo[]>(),
      supabase
        .from("obiettivi_completati")
        .select("id, obiettivo_id, user_id, turno_id, data_completamento, note")
        .eq("turno_id", id)
        .order("data_completamento", { ascending: false })
        .returns<ObiettivoCompletatoWithObiettivo[]>(),
    ]);

  const profile = profileResult.data;
  const turnoRow = turnoResult.data;
  const obiettivi = obiettiviResult.data;
  const completati = completatiResult.data;

  if (!turnoRow) notFound();

  // Nome del collega assegnato (lookup team_members) — query leggera dipendente da turnoRow
  const { data: member } = await supabase
    .from("team_members")
    .select("id, nome, role")
    .eq("id", turnoRow.user_id)
    .single<TeamMember>();

  const turno: TurnoWithMember = { ...turnoRow, member_nome: member?.nome };

  // Arricchisci completati con i dati dell'obiettivo
  const objMap = new Map((obiettivi ?? []).map((o) => [o.id, o]));
  const completatiRich: ObiettivoCompletatoWithObiettivo[] = (completati ?? []).map((c) => ({
    ...c,
    obiettivo: objMap.get(c.obiettivo_id),
  }));

  // Determina fascia
  const slot = slotFromStart(turno.ora_inizio.slice(0, 5));
  const shift = slot ? SHIFTS[slot] : null;

  // Verifica se l'utente corrente è il proprietario del turno
  const isOwnTurno = turno.user_id === user.id;

  return (
    <>
      <Header profile={profile} />
      <main className="safe-bottom mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Breadcrumb + info turno */}
        <div className="mb-6">
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-wider text-fg-dim transition hover:text-accent"
          >
            ← Calendario
          </Link>
        </div>

        <div className="panel-glow mb-6 p-6 animate-fade-in">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-fg">
                  {turno.member_nome ?? "—"}
                </h1>
                {shift && (
                  <span
                    className="rounded-md border px-2 py-0.5 font-mono text-xs uppercase tracking-wider"
                    style={{
                      borderColor: `${shift.color.accent}40`,
                      color: shift.color.accent,
                      background: shift.color.bg,
                    }}
                  >
                    {shift.label}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-4 font-mono text-sm text-fg-muted">
                <span>{turno.data}</span>
                {shift && <span>{formatShiftRange(shift.start, shift.end)}</span>}
              </div>
              {turno.note && (
                <p className="mt-3 text-sm text-fg-muted">{turno.note}</p>
              )}
            </div>
          </div>
        </div>

        {/* Pannello obiettivi (client component) */}
        <ObjectivesPanel
          turnoId={turno.id}
          obiettivi={obiettivi ?? []}
          completati={completatiRich}
          currentUserId={user.id}
          isOwnTurno={isOwnTurno}
          memberNome={turno.member_nome ?? "—"}
        />
      </main>
    </>
  );
}
