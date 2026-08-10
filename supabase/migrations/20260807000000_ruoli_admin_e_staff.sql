-- Ruoli: proprietario (businesses.owner_id, invariato) vs operatore invitato
-- (nuova tabella business_staff) vs admin (app_metadata, non user_metadata).
--
-- Perche': l'app leggeva il ruolo admin da user_metadata, modificabile
-- dall'utente stesso via browser (supabase.auth.updateUser). Con la
-- registrazione libera ora attiva, chiunque poteva auto-promuoversi.
-- app_metadata invece si puo' impostare solo da qui (SQL/dashboard con
-- permessi elevati), mai dal client.
--
-- In piu': il proprietario di un'attivita' non e' detto sia la persona che
-- la gestisce ogni giorno alla cassa. business_staff collega altri utenti
-- (operatori invitati) a un'attivita' che non possiedono, tramite un
-- invite_code univoco per attivita'.

-- --- Colonna invite_code su businesses ------------------------------------
alter table businesses add column if not exists invite_code text unique
  default substr(md5(random()::text || clock_timestamp()::text), 1, 10);

-- backfill per le attivita' create prima di questa colonna
update businesses
set invite_code = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 10)
where invite_code is null;

-- --- Tabella business_staff ------------------------------------------------
create table if not exists business_staff (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

alter table business_staff enable row level security;

drop policy if exists "vedi il tuo staff o le tue righe di staff" on business_staff;
create policy "vedi il tuo staff o le tue righe di staff"
on business_staff for select
using (
  user_id = auth.uid()
  or exists (select 1 from businesses b where b.id = business_staff.business_id and b.owner_id = auth.uid())
);

-- Un utente autenticato puo' aggiungere solo se stesso come staff (mai un
-- altro utente): la validazione del codice invito avviene lato applicazione
-- prima di questa insert.
drop policy if exists "un utente puo' aggiungersi come staff" on business_staff;
create policy "un utente puo' aggiungersi come staff"
on business_staff for insert
with check (user_id = auth.uid());

drop policy if exists "il proprietario puo' rimuovere staff" on business_staff;
create policy "il proprietario puo' rimuovere staff"
on business_staff for delete
using (exists (select 1 from businesses b where b.id = business_staff.business_id and b.owner_id = auth.uid()));

-- --- Estende i permessi su businesses/tickets allo staff invitato ---------
-- Policy additive: si sommano a quelle gia' esistenti (permissive in
-- Postgres = valutate in OR), senza toccare ne' rimuovere nulla.

drop policy if exists "staff invitato legge l'attivita' assegnata" on businesses;
create policy "staff invitato legge l'attivita' assegnata"
on businesses for select
using (exists (select 1 from business_staff bs where bs.business_id = businesses.id and bs.user_id = auth.uid()));

drop policy if exists "staff invitato aggiorna l'attivita' assegnata" on businesses;
create policy "staff invitato aggiorna l'attivita' assegnata"
on businesses for update
using (exists (select 1 from business_staff bs where bs.business_id = businesses.id and bs.user_id = auth.uid()));

drop policy if exists "staff invitato legge i ticket dell'attivita' assegnata" on tickets;
create policy "staff invitato legge i ticket dell'attivita' assegnata"
on tickets for select
using (exists (select 1 from business_staff bs where bs.business_id = tickets.business_id and bs.user_id = auth.uid()));

drop policy if exists "staff invitato aggiorna i ticket dell'attivita' assegnata" on tickets;
create policy "staff invitato aggiorna i ticket dell'attivita' assegnata"
on tickets for update
using (exists (select 1 from business_staff bs where bs.business_id = tickets.business_id and bs.user_id = auth.uid()));

-- --- Admin (app_metadata) vede/gestisce tutto, in aggiunta a tutto il resto --
drop policy if exists "admin legge tutte le attivita'" on businesses;
create policy "admin legge tutte le attivita'"
on businesses for select
using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false));

drop policy if exists "admin aggiorna qualsiasi attivita'" on businesses;
create policy "admin aggiorna qualsiasi attivita'"
on businesses for update
using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false));

drop policy if exists "admin elimina qualsiasi attivita'" on businesses;
create policy "admin elimina qualsiasi attivita'"
on businesses for delete
using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false));

drop policy if exists "admin legge tutti i ticket" on tickets;
create policy "admin legge tutti i ticket"
on tickets for select
using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false));
