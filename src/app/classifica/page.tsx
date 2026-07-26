import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";
import { VALUTE } from "@/lib/objectives";
import type {
  Profile,
  Obiettivo,
  ObiettivoCompletatoWithObiettivo,
  TeamMember,
} from "@/types/database";

export default async function ClassificaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Profilo proprio
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nome, email, role")
    .eq("id", user.id)
    .single<Pick<Profile, "id" | "nome" | "email" | "role">>();

  // Tutti i membri del team
  const { data: members } = await supabase
    .from("team_members")
    .select("id, nome, role")
    .order("nome", { ascending: true })
    .returns<TeamMember[]>();

  // Tutti i completamenti (con dati obiettivo per calcolare totali)
  const { data: completati } = await supabase
    .from("obiettivi_completati")
    .select("id, obiettivo_id, user_id, turno_id, data_completamento, note")
    .returns<ObiettivoCompletatoWithObiettivo[]>();

  // Tutti gli obiettivi (per mappare valuta/valore)
  const { data: obiettivi } = await supabase
    .from("obiettivi")
    .select("id, titolo, tipo, valore_ricompensa, valuta, soglia_gruppo, created_at")
    .returns<Obiettivo[]>();

  // Costruisci mappa obiettivo -> {valuta, valore}
  const objMap = new Map(
    (obiettivi ?? []).map((o) => [o.id, { valuta: o.valuta, valore: o.valore_ricompensa }]),
  );

  // Calcola totali per utente
  const totals = new Map<
    string,
    { user_id: string; nome: string; totale_fuoco: number; totale_diamanti: number }
  >();

  // Inizializza tutti i membri (anche quelli con 0)
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
    if (!t) {
      // Utente non in team_members (es. eliminato) — skip
      continue;
    }
    if (obj.valuta === "fuoco") {
      t.totale_fuoco += obj.valore;
    } else {
      t.totale_diamanti += obj.valore;
    }
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

        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-fg">Classifica</h1>

        {/* Podio diamanti (top 3 per diamanti) */}
        <div className="panel-glow mb-6 p-6 animate-fade-in">
          <h2 className="mb-4 flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-fg">
            <span className="text-lg">{VALUTE.diamante.symbol}</span>
            Trofei diamanti
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[...classifica]
              .sort((a, b) => b.totale_diamanti - a.totale_diamanti)
              .slice(0, 3)
              .map((r, i) => {
                const positions = ["🥇", "🥈", "🥉"];
                return (
                  <div
                    key={r.user_id}
                    className="rounded-lg border p-4 text-center"
                    style={{
                      borderColor: r.totale_diamanti > 0 ? `${VALUTE.diamante.color}40` : "var(--color-border)",
                      background: r.totale_diamanti > 0 ? `${VALUTE.diamante.color}08` : "var(--color-base)",
                    }}
                  >
                    <div className="text-2xl">{positions[i]}</div>
                    <div className="mt-1 truncate text-sm font-medium text-fg">{r.nome}</div>
                    <div
                      className="mt-2 font-mono text-2xl font-bold"
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
        <div className="panel p-6">
          <h2 className="mb-4 flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-fg">
            <span className="text-lg">{VALUTE.fuoco.symbol}</span>
            Classifica fuoco
          </h2>
          <div className="space-y-3">
            {classifica.map((r, i) => {
              const isMe = r.user_id === user.id;
              const pct = (r.totale_fuoco / maxFuoco) * 100;
              return (
                <div
                  key={r.user_id}
                  className={`rounded-lg border p-4 ${
                    isMe ? "border-accent/40 bg-accent/5" : "border-border bg-base"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-fg-dim">#{i + 1}</span>
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
                          className="font-mono text-sm font-medium"
                          style={{ color: VALUTE.diamante.color }}
                        >
                          {r.totale_diamanti} {VALUTE.diamante.symbol}
                        </span>
                      )}
                      <span
                        className="font-mono text-lg font-bold"
                        style={{ color: VALUTE.fuoco.color }}
                      >
                        {r.totale_fuoco}
                      </span>
                    </div>
                  </div>
                  {/* Barra progress */}
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-base">
                    <div
                      className="h-full rounded-full transition-all 300ms"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${VALUTE.fuoco.color}80, ${VALUTE.fuoco.color})`,
                        boxShadow: `0 0 8px ${VALUTE.fuoco.color}40`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
