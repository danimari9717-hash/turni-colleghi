-- ============================================================================
--  Turni App — Schema database + Row Level Security
--  Target: Supabase (Postgres 15+)
--
--  Come eseguire:
--    1) Supabase Dashboard -> SQL Editor -> incolla questo file -> Run
--    OPPURE
--    2) supabase db push (se si usa la Supabase CLI con supabase/migrations/)
--
--  PRIMO ADMIN: dopo aver registrato il primo utente via Supabase Auth,
--  promuovilo ad admin manualmente (il default è 'employee'):
--    UPDATE profiles SET role = 'admin' WHERE email = 'tu@email.ext';
--
--  Convenzione: tutti i timestamp in UTC (timestamptz).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Estensioni
-- ----------------------------------------------------------------------------
-- pgcrypto serve per gen_random_uuid() (già abilitata in Supabase di default).
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Tipo enum per il ruolo utente
-- ----------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'employee');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. Tabella `profiles` (estende auth.users)
--    Una riga per ogni utente registrato in auth.users.
--    Popolata automaticamente da un trigger alla registrazione (vedi §5).
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  nome        text not null default '',
  role        user_role not null default 'employee',
  created_at  timestamptz not null default now()
);

comment on table  public.profiles is 'Profili utente, estensione di auth.users (1:1).';
comment on column public.profiles.role is 'admin = può gestire i turni; employee = sola lettura calendario.';

-- ----------------------------------------------------------------------------
-- 3. Tabella `turni`
--    Un turno di lavoro assegnato a un utente (user_id) e creato da un admin
--    (created_by). Tutti gli autenticati vedono tutti i turni (vista team).
-- ----------------------------------------------------------------------------
create table if not exists public.turni (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  data         date not null,
  ora_inizio   time not null,
  ora_fine     time not null,
  note         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Un turno è valido se ora_fine != ora_inizio. Permette sia turni
  -- same-day (es. 08:00→16:00, fine>inizio) sia overnight (es. 16:00→00:00,
  -- fine<inizio perché attraversa mezzanotte). Esclude solo turni nulli.
  constraint turni_ora_fine_diversa check (ora_fine <> ora_inizio)
);

comment on table  public.turni is 'Turni di lavoro assegnati agli utenti.';
comment on column public.turni.user_id    is 'Utente a cui è assegnato il turno.';
comment on column public.turni.created_by is 'Admin che ha creato il turno (nullable se l''admin viene eliminato).';

-- Indici per le query più frequenti (calendario per data, elenco per utente).
create index if not exists turni_data_idx        on public.turni (data);
create index if not exists turni_user_id_idx     on public.turni (user_id);
create index if not exists turni_user_data_idx   on public.turni (user_id, data);

-- ----------------------------------------------------------------------------
-- 4. Trigger: updated_at automatico su `turni`
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_turni_set_updated_at on public.turni;
create trigger trg_turni_set_updated_at
  before update on public.turni
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Trigger: crea automaticamente una riga in `profiles` alla registrazione
--    (handle_new_user). Copia id, email da auth.users; role default 'employee'.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    'employee'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 5a. Helper: verifica se l'utente corrente è admin.
--     Definita qui (prima dei trigger e delle policy che la usano) per
--     garantire l'ordine di definizione corretto.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- 5b. Trigger: impedisce ai non-admin di cambiare il ruolo (proprio o altrui)
--     RLS non può confrontare NEW vs OLD in una policy, quindi usiamo un
--     trigger BEFORE UPDATE. Se il ruolo cambia e l'utente corrente non è
--     admin, solleva un'eccezione. Gli admin possono cambiare qualsiasi ruolo.
-- ----------------------------------------------------------------------------
create or replace function public.prevent_non_admin_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Solo gli admin possono modificare il ruolo di un utente.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_prevent_role_change on public.profiles;
create trigger trg_profiles_prevent_role_change
  before update on public.profiles
  for each row execute function public.prevent_non_admin_role_change();

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================

-- Abilita RLS su entrambe le tabelle.
alter table public.profiles enable row level security;
alter table public.turni    enable row level security;

-- ----------------------------------------------------------------------------
-- 6.1 RLS — `profiles`
-- ----------------------------------------------------------------------------
--  SELECT: un utente legge solo il proprio profilo.
--  UPDATE: admin può aggiornare qualsiasi profilo (incluso il ruolo);
--          un utente non-admin può aggiornare solo il proprio profilo.
--          Il controllo "non-admin non può cambiare ruolo" è affidato al
--          trigger trg_profiles_prevent_role_change (vedi §5b), perché RLS
--          non può confrontare NEW vs OLD in una policy (Postgres non
--          supporta i prefissi new./old. nelle espressioni di policy).
--  INSERT/DELETE: non esposti (le righe sono create dal trigger su auth.users;
--                 la cancellazione avviene in cascata eliminando l'utente).
-- ----------------------------------------------------------------------------

-- DROP policies esistenti (idempotente per re-run).
drop policy if exists profiles_select_self   on public.profiles;
drop policy if exists profiles_update_admin   on public.profiles;
drop policy if exists profiles_update_self    on public.profiles;

-- SELECT: solo il proprio profilo.
create policy profiles_select_self
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- UPDATE (admin): qualsiasi profilo, qualsiasi modifica (incl. ruolo).
create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- UPDATE (self, non-admin): proprio profilo.
--   using  -> quali righe può selezionare per l'update (la propria)
--   check  -> stato risultante ammissibile (deve restare la propria riga)
--   Il controllo sul ruolo è gestito dal trigger trg_profiles_prevent_role_change.
create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6.1b Vista `team_members` — esposizione sicura di nome/role a tutto il team
-- ----------------------------------------------------------------------------
--  La tabella `profiles` resta self-only in SELECT (policy sopra) per non
--  esporre `email` agli altri utenti. Per il calendario condiviso serve però
--  mostrare nome e ruolo dei colleghi. RLS è row-level e non può nascondere
--  colonne, quindi creiamo una VISTA che espone solo (id, nome, role).
--
--  La vista è di proprietà di `postgres` (owner della vista): per costrutto
--  Postgres, una vista esegue con i privilegi del suo owner, che bypassa RLS.
--  Questo permette alla vista di leggere tutte le righe di `profiles` anche
--  se l'utente chiamante non avrebbe accesso via RLS. Concediamo SELECT sulla
--  vista solo al role `authenticated`: in questo modo ogni utente autenticato
--  vede nome/role di tutti i colleghi, MA non email.
--
--  NOTA: non impostiamo `security_invoker = true` (PG15+) perché
--  proprio NON vogliamo che la vista erediti i permessi/RLS del chiamante
--  (altrimenti restituirebbe solo la riga propria, vanificando lo scopo).
--
--  NOTA: RLS è una feature delle TABELLE, non delle viste. L'accesso alla
--  vista si controlla via GRANT (sotto), non via policy.
-- ----------------------------------------------------------------------------
drop view if exists public.team_members;
create view public.team_members as
  select id, nome, role from public.profiles;

comment on view public.team_members is
  'Vista pubblica (team) con sole colonne non sensibili (id, nome, role). '
  'Usata dal calendario condiviso per mostrare i nomi dei colleghi.';

-- Concede SELECT sulla vista agli utenti autenticati.
-- (Il role `authenticated` è il role usato da Supabase per le sessioni JWT.)
grant select on public.team_members to authenticated;

-- ----------------------------------------------------------------------------
-- 6.2 RLS — `turni`
-- ----------------------------------------------------------------------------
--  SELECT: tutti gli utenti autenticati leggono tutti i turni
--          (vista condivisa del calendario team).
--  INSERT / UPDATE / DELETE: solo admin. Inoltre, su INSERT/UPDATE si impone
--  che created_by sia l'utente corrente (tracciabilità).
-- ----------------------------------------------------------------------------

drop policy if exists turni_select_all      on public.turni;
drop policy if exists turni_insert_admin    on public.turni;
drop policy if exists turni_update_admin    on public.turni;
drop policy if exists turni_delete_admin    on public.turni;

-- SELECT: tutti gli autenticati vedono tutti i turni.
create policy turni_select_all
  on public.turni for select
  to authenticated
  using (true);

-- INSERT: solo admin, e created_by deve essere l'utente corrente.
create policy turni_insert_admin
  on public.turni for insert
  to authenticated
  with check (public.is_admin() and created_by = auth.uid());

-- UPDATE: solo admin.
create policy turni_update_admin
  on public.turni for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- DELETE: solo admin.
create policy turni_delete_admin
  on public.turni for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- 7. SISTEMA OBIETTIVI E MONETE (gamification)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 7.1 Tipo enum per categoria obiettivo
-- ----------------------------------------------------------------------------
do $$ begin
  create type obiettivo_tipo as enum ('gratta_vinci', 'incasso_tab', 'speciale');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 7.2 Tabella `obiettivi` (predefiniti, creati da admin via SQL/seed)
-- ----------------------------------------------------------------------------
create table if not exists public.obiettivi (
  id                uuid primary key default gen_random_uuid(),
  titolo            text not null,
  tipo              obiettivo_tipo not null,
  valore_ricompensa integer not null check (valore_ricompensa > 0),
  valuta            text not null check (valuta in ('fuoco', 'diamante')),
  -- Per raggruppare le soglie incasso_tab come opzioni mutuamente esclusive.
  -- NULL per obiettivi non raggruppati (gratta_vinci, speciale).
  soglia_gruppo     text,
  created_at        timestamptz not null default now()
);

comment on table public.obiettivi is 'Obiettivi predefiniti (seed). Non modificabili da employee.';
comment on column public.obiettivi.soglia_gruppo is 'Raggruppa soglie mutuamente esclusive (es. incasso_tab). NULL = indipendente.';

-- ----------------------------------------------------------------------------
-- 7.3 Tabella `obiettivi_completati` (conferme self-report dei dipendenti)
-- ----------------------------------------------------------------------------
create table if not exists public.obiettivi_completati (
  id                 uuid primary key default gen_random_uuid(),
  obiettivo_id       uuid not null references public.obiettivi(id) on delete cascade,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  turno_id           uuid not null references public.turni(id) on delete cascade,
  data_completamento timestamptz not null default now(),
  note               text
);

comment on table public.obiettivi_completati is 'Conferme obiettivi self-report dai dipendenti.';

create index if not exists obj_comp_user_idx     on public.obiettivi_completati (user_id);
create index if not exists obj_comp_turno_idx    on public.obiettivi_completati (turno_id);
create index if not exists obj_comp_obiettivo_idx on public.obiettivi_completati (obiettivo_id);

-- ----------------------------------------------------------------------------
-- 7.4 RLS — `obiettivi`
--   SELECT: tutti gli autenticati leggono gli obiettivi predefiniti.
--   INSERT/UPDATE/DELETE: solo admin (gestione seed futura via UI admin).
-- ----------------------------------------------------------------------------
alter table public.obiettivi enable row level security;

drop policy if exists obiettivi_select_all    on public.obiettivi;
drop policy if exists obiettivi_insert_admin  on public.obiettivi;
drop policy if exists obiettivi_update_admin  on public.obiettivi;
drop policy if exists obiettivi_delete_admin  on public.obiettivi;

create policy obiettivi_select_all
  on public.obiettivi for select
  to authenticated
  using (true);

create policy obiettivi_insert_admin
  on public.obiettivi for insert
  to authenticated
  with check (public.is_admin());

create policy obiettivi_update_admin
  on public.obiettivi for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy obiettivi_delete_admin
  on public.obiettivi for delete
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 7.5 RLS — `obiettivi_completati`
--   SELECT: tutti gli autenticati leggono tutte le conferme (classifica + monitoraggio).
--   INSERT: ogni autenticato può inserire solo conferme con il proprio user_id.
--   UPDATE/DELETE: ogni autenticato può modificare/eliminare solo le proprie conferme.
--   (Sistema basato su fiducia, gruppo piccolo. Admin non modifica, solo legge.)
-- ----------------------------------------------------------------------------
alter table public.obiettivi_completati enable row level security;

drop policy if exists obj_comp_select_all   on public.obiettivi_completati;
drop policy if exists obj_comp_insert_self  on public.obiettivi_completati;
drop policy if exists obj_comp_update_self  on public.obiettivi_completati;
drop policy if exists obj_comp_delete_self  on public.obiettivi_completati;

create policy obj_comp_select_all
  on public.obiettivi_completati for select
  to authenticated
  using (true);

create policy obj_comp_insert_self
  on public.obiettivi_completati for insert
  to authenticated
  with check (user_id = auth.uid());

create policy obj_comp_update_self
  on public.obiettivi_completati for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy obj_comp_delete_self
  on public.obiettivi_completati for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 7.6 Seed obiettivi predefiniti (idempotente)
-- ----------------------------------------------------------------------------
-- Gratta e vinci (indipendenti, cumulabili più volte nello stesso turno)
insert into public.obiettivi (titolo, tipo, valore_ricompensa, valuta, soglia_gruppo)
values
  ('1 stecca gratta e vinci', 'gratta_vinci', 5,  'fuoco', null),
  ('3 stecche gratta e vinci', 'gratta_vinci', 10, 'fuoco', null),
  ('5 stecche gratta e vinci', 'gratta_vinci', 20, 'fuoco', null)
on conflict do nothing;

-- Incasso tab (SCELTA SINGOLA per turno: soglie mutuamente esclusive, stesso soglia_gruppo)
insert into public.obiettivi (titolo, tipo, valore_ricompensa, valuta, soglia_gruppo)
values
  ('Incasso tab 1000€', 'incasso_tab', 5,  'fuoco',   'incasso_tab'),
  ('Incasso tab 1500€', 'incasso_tab', 10, 'fuoco',   'incasso_tab'),
  ('Incasso tab 2000€', 'incasso_tab', 15, 'fuoco',   'incasso_tab'),
  ('Incasso tab 2500€', 'incasso_tab', 20, 'fuoco',   'incasso_tab'),
  ('Incasso tab 3000€', 'incasso_tab', 1,  'diamante','incasso_tab')
on conflict do nothing;

-- Gratta e vinci vinto da cliente (valore ≥ 1000€) → diamante
insert into public.obiettivi (titolo, tipo, valore_ricompensa, valuta, soglia_gruppo)
values
  ('Gratta vinto da cliente ≥1000€', 'gratta_vinci', 1, 'diamante', null)
on conflict do nothing;

-- Speciale
insert into public.obiettivi (titolo, tipo, valore_ricompensa, valuta, soglia_gruppo)
values
  ('Passa Mari', 'speciale', 30, 'fuoco', null)
on conflict do nothing;

-- ============================================================================
--  Fine schema.
-- ============================================================================
