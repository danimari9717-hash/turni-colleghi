import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";
import AdminAdjustments from "./AdminAdjustments";
import { VALUTE } from "@/lib/objectives";
import type {
  Profile,
  Obiettivo,
  ObiettivoCompletatoWithObiettivo,
  PuntiAdjustment,
  TeamMember,
} from "@/types/database";

// Forza rendering dinamico: dati classifica cambiano quando altri utenti
// completano obiettivi. Senza questo, la pagina potrebbe servire dati stale.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ClassificaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Query parallele: profile, members, completati, obiettivi, adjustments
  // sono tutti indipendenti tra loro. Prima erano sequenziali (5 round-trip);
  // ora 1 solo round-trip logico.
  const [
    profileResult,
    membersResult,
    completatiResult,
    obiettiviResult,
    adjustmentsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nome, email, role")
      .eq("id", user.id)
      .single<Pick<Profile, "id" | "nome" | "email" | "role">>(),
    supabase
      .from("team_members")
      .select("id, nome, role")
      .order("nome", { ascending: true })
      .returns<TeamMember[]>(),
    supabase
      .from("obiettivi_completati")
      .select("id, obiettivo_id, user_id, turno_id, data_completamento, note")
      .returns<ObiettivoCompletatoWithObiettivo[]>(),
    supabase
      .from("obiettivi")
      .select("id, titolo, tipo, valore_ricompensa, valuta, soglia_gruppo, created_at")
      .returns<Obiettivo[]>(),
    supabase
      .from("punti_adjustments")
      .select("id, user_id, delta_fuoco, delta_diamanti, note, created_by, created_at")
      .returns<PuntiAdjustment[]>(),
  ]);

  const profile = profileResult.data;
  const members = membersResult.data;
  const completati = completatiResult.data;
  const obiettivi = obiettiviResult.data;
  const adjustments = adjustmentsResult.data;

  const isAdmin = profile?.role === "admin";

  // Mappa obiettivo -> {valuta, valore}
  const objMap = new Map(
    (obiettivi ?? []).map((o) => [o.id, { valuta: o.valuta, valore: o.valore_ricompensa }]),
  );

  // Calcola totali per utente
  const totals = new Map<
    string,
    { user_id: string; nome: string; totale_fuoco: number; totale_diamanti: number }
  >();

  for (const m of members ?? []) {
    totals.set(m.id, {
      user_id: m.id,
      nome: m.nome,
      totale_fuoco: 0,
      totale_diamanti: 0,
    });
  }

  // Somma i completamenti
  for (const c of completati ?? []) {
    const obj = objMap.get(c.obiettivo_id);
    if (!obj) continue;
    const t = totals.get(c.user_id);
    if (!t) continue;
    if (obj.valuta === "fuoco") {
      t.totale_fuoco += obj.valore;
    } else {
      t.totale_diamanti += obj.valore;
    }
  }

  // Somma gli adjustment manuali (possono essere negativi)
  for (const a of adjustments ?? []) {
    const t = totals.get(a.user_id);
    if (!t) continue;
    t.totale_fuoco += a.delta_fuoco;
    t.totale_diamanti += a.delta_diamanti;
  }

  // Ordina per totale fuoco desc, poi diamanti desc
  const classifica = Array.from(totals.values()).sort((a, b) => {
    if (b.totale_fuoco !== a.totale_fuoco) return b.totale_fuoco - a.totale_fuoco;
    return b.totale_diamanti - a.totale_diamanti;
  });

  const maxFuoco = Math.max(...classifica.map((r) => r.totale_fuoco), 1);

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

        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-fg">Classifica - FantaTab</h1>

        {/* Podio diamanti (top 3 per diamanti) */}
        <div className="mb-6 p-6 animate-fade-in" style={{
          background: "rgba(255, 255, 255, 0.04)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "24px",
        }}>
          <h2 className="mb-5 flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-fg">
            <span className="text-lg">{VALUTE.diamante.symbol}</span>
            Trofei diamanti
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[...classifica]
              .sort((a, b) => b.totale_diamanti - a.totale_diamanti)
              .slice(0, 3)
              .map((r, i) => {
                const positions = ["🥇", "🥈", "🥉"];
                const podiumClass = i === 0 ? "podium-gold" : i === 1 ? "podium-silver" : "podium-bronze";
                return (
                  <div
                    key={r.user_id}
                    className={`${podiumClass} p-5 text-center`}
                  >
                    <div className="text-3xl">{positions[i]}</div>
                    <div className="mt-2 truncate text-sm font-medium text-fg">{r.nome}</div>
                    <div
                      className="mt-3 font-mono text-3xl font-bold"
                      style={{ color: VALUTE.diamante.color }}
                    >
                      {r.totale_diamanti}
                    </div>
                    <div className="font-mono text-xs text-fg-dim">diamanti</div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Classifica fuoco (lista ordinata con barre) */}
        <div className="panel p-7">
          <h2 className="mb-5 flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-fg">
            <span className="text-lg">{VALUTE.fuoco.symbol}</span>
            Classifica fuoco
          </h2>
          <div className="space-y-4">
            {classifica.map((r, i) => {
              const isMe = r.user_id === user.id;
              const pct = (r.totale_fuoco / maxFuoco) * 100;
              return (
                <div
                  key={r.user_id}
                  className={`rounded-2xl border p-5 ${
                    isMe ? "border-accent/40 bg-accent/5" : "border-border bg-base"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-fg-dim">#{i + 1}</span>
                      <span className="text-sm font-medium text-fg">
                        {r.nome}
                        {isMe && (
                          <span className="ml-2 font-mono text-xs text-accent">(tu)</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      {r.totale_diamanti > 0 && (
                        <span
                          className="font-mono text-sm font-bold"
                          style={{ color: VALUTE.diamante.color }}
                        >
                          {r.totale_diamanti} {VALUTE.diamante.symbol}
                        </span>
                      )}
                      <span
                        className="font-mono text-xl font-bold"
                        style={{ color: VALUTE.fuoco.color }}
                      >
                        {r.totale_fuoco}
                      </span>
                    </div>
                  </div>
                  {/* Barra progress */}
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-base">
                    <div
                      className="h-full rounded-full transition-all 300ms"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${VALUTE.fuoco.color}80, ${VALUTE.fuoco.color})`,
                        boxShadow: `0 0 10px ${VALUTE.fuoco.color}50`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Admin adjustments (solo admin) */}
        {isAdmin && (
          <div className="mt-6">
            <AdminAdjustments
              members={members ?? []}
              adjustments={adjustments ?? []}
              currentUserId={user.id}
            />
          </div>
        )}
      </main>
    </>
  );
}
