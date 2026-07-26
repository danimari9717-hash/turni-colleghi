// Tipi TypeScript allineati a supabase/schema.sql.
// Per rigenerarli dal DB reale: `supabase gen types typescript --project-id <ref>`
// Qui mantenuti manualmente per la Fase 1 (nessun DB collegato ancora).

export type UserRole = "admin" | "employee";

export interface Profile {
  id: string; // uuid, corrisponde a auth.users.id
  email: string;
  nome: string;
  role: UserRole;
  created_at: string; // ISO timestamptz
}

// Vista `public.team_members`: subset pubblico (no email) per il calendario team.
export interface TeamMember {
  id: string; // uuid -> profiles.id
  nome: string;
  role: UserRole;
}

export interface Turno {
  id: string; // uuid
  user_id: string; // uuid -> profiles.id
  data: string; // ISO date 'YYYY-MM-DD'
  ora_inizio: string; // 'HH:mm:ss'
  ora_fine: string; // 'HH:mm:ss'
  note: string | null;
  created_by: string | null; // uuid -> profiles.id (nullable)
  created_at: string; // ISO timestamptz
  updated_at: string; // ISO timestamptz
}

// Forma per INSERT di un nuovo turno (lato app). created_by viene impostato
// dall'app all'id dell'admin corrente; id/created_at/updated_at sono default DB.
export type TurnoInsert = Pick<
  Turno,
  "user_id" | "data" | "ora_inizio" | "ora_fine" | "note" | "created_by"
> & { note?: string | null };

export type TurnoUpdate = Partial<
  Pick<Turno, "user_id" | "data" | "ora_inizio" | "ora_fine" | "note">
>;

// Turno arricchito con il nome del collega (join con team_members).
// Usato dal calendario per mostrare i nomi senza fare client-side lookup.
export interface TurnoWithMember extends Turno {
  member_nome?: string;
}

// ============================================================================
//  Sistema obiettivi (Fase 4)
// ============================================================================

export type ObiettivoTipo = "gratta_vinci" | "incasso_tab" | "speciale";
export type Valuta = "fuoco" | "diamante";

export interface Obiettivo {
  id: string;
  titolo: string;
  tipo: ObiettivoTipo;
  valore_ricompensa: number;
  valuta: Valuta;
  soglia_gruppo: string | null;
  created_at: string;
}

export interface ObiettivoCompletato {
  id: string;
  obiettivo_id: string;
  user_id: string;
  turno_id: string;
  data_completamento: string;
  note: string | null;
}

// Completamento arricchito con i dati dell'obiettivo (per display).
export interface ObiettivoCompletatoWithObiettivo extends ObiettivoCompletato {
  obiettivo?: Obiettivo;
}

// Riga classifica: utente + totale fuoco + totale diamanti.
export interface ClassificaRow {
  user_id: string;
  nome: string;
  totale_fuoco: number;
  totale_diamanti: number;
}

// Adjustment manuale punti (admin). delta può essere negativo.
export interface PuntiAdjustment {
  id: string;
  user_id: string;
  delta_fuoco: number;
  delta_diamanti: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}
