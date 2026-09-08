-- Code multiple (reparti/servizi distinti) all'interno della stessa
-- attivita', es. una farmacia con "Farmaco" e "Consulenza" -- ciascuno
-- con la propria numerazione indipendente, il proprio operatore.
--
-- Ambito v1 (concordato esplicitamente prima di scrivere questa
-- migrazione, vista la dimensione della feature):
-- - Un'attivita' SENZA reparti configurati continua a funzionare
--   esattamente come oggi (tickets.reparto_id resta null, si usano
--   ancora businesses.current/last_issued, nessuna riga di codice
--   esistente cambia comportamento).
-- - Prenotazione fascia oraria, avviso SMS e chiamata prioritaria
--   restano per ora a livello di attivita' (non per singolo reparto) --
--   lato app, quando un'attivita' ha reparti configurati, questi tre
--   pulsanti/schermate restano semplicemente nascosti lato cliente,
--   per non creare un secondo binario di numerazione parallelo e
--   confuso rispetto a quello dei reparti.
-- - Lo schermo pubblico e la vista "In coda" nel pannello Admin restano
--   agganciati a businesses.current/last_issued: per un'attivita' con
--   reparti attivi mostreranno un numero fermo/non aggiornato, perche'
--   l'emissione dei numeri si sposta sui reparti. Rimandato a un
--   prossimo giro (schermo multi-reparto e' un lavoro a se').

create table if not exists reparti (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  nome text not null,
  ordine integer not null default 0,
  current integer not null default 0,
  last_issued integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists reparti_business_idx on reparti (business_id, ordine);

alter table reparti enable row level security;

-- Lettura pubblica: serve al cliente per scegliere il reparto dopo aver
-- scansionato il QR, senza login (stessa idea di "businesses").
drop policy if exists "reparti leggibili da chiunque" on reparti;
create policy "reparti leggibili da chiunque"
on reparti for select
using (true);

-- Titolare o staff gestiscono i reparti della propria attivita'. Riusa
-- le funzioni SECURITY DEFINER gia' esistenti (e_proprietario_di /
-- e_staff_di) invece di una subquery diretta, per non reintrodurre il
-- rischio di ricorsione RLS gia' risolto in passato per businesses/
-- business_staff.
drop policy if exists "titolare o staff gestiscono i reparti" on reparti;
create policy "titolare o staff gestiscono i reparti"
on reparti for all
using (e_proprietario_di(reparti.business_id) or e_staff_di(reparti.business_id))
with check (e_proprietario_di(reparti.business_id) or e_staff_di(reparti.business_id));

-- "on delete set null" (non cascade): eliminare un reparto non deve
-- cancellare lo storico dei ticket gia' emessi in quel reparto.
alter table tickets add column if not exists reparto_id uuid references reparti(id) on delete set null;

create index if not exists tickets_reparto_idx on tickets (reparto_id, number);

-- --- Cliente: prende un numero nel reparto scelto (mirror di
-- prendi_numero_atomico, ma scritto sulla riga del reparto invece che
-- dell'attivita'). -----------------------------------------------------
create or replace function prendi_numero_reparto(reparto_id_input uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  nuovo_numero integer;
begin
  update reparti
  set last_issued = last_issued + 1
  where id = reparto_id_input
  returning last_issued, business_id into nuovo_numero, v_business_id;

  if nuovo_numero is null then
    raise exception 'Reparto non trovato';
  end if;

  insert into tickets (business_id, reparto_id, number, status, created_at)
  values (v_business_id, reparto_id_input, nuovo_numero, 'in_attesa', now());

  return nuovo_numero;
end;
$$;

-- --- Operatore: avanti / richiama / non presente, per reparto (mirror
-- esatto delle funzioni atomiche gia' esistenti per l'attivita'). --------
create or replace function avanza_numero_reparto(reparto_id_input uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  nuovo_current integer;
begin
  update reparti
  set current = current + 1
  where id = reparto_id_input
    and current < last_issued
  returning current into nuovo_current;

  if nuovo_current is null then
    raise exception 'Nessun cliente in coda';
  end if;

  update tickets
  set status = 'servito', served_at = now()
  where reparto_id = reparto_id_input
    and number = nuovo_current;

  return nuovo_current;
end;
$$;

create or replace function richiama_numero_reparto(reparto_id_input uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  nuovo_current integer;
begin
  update reparti
  set current = current - 1
  where id = reparto_id_input
    and current > 0
  returning current into nuovo_current;

  if nuovo_current is null then
    raise exception 'Nessun numero da richiamare';
  end if;

  update tickets
  set status = 'in_attesa', served_at = null
  where reparto_id = reparto_id_input
    and number = nuovo_current + 1;

  return nuovo_current;
end;
$$;

create or replace function non_presente_reparto(reparto_id_input uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  nuovo_current integer;
begin
  update reparti
  set current = current + 1
  where id = reparto_id_input
    and current < last_issued
  returning current into nuovo_current;

  if nuovo_current is null then
    raise exception 'Nessun cliente in coda';
  end if;

  update tickets
  set status = 'non_presentato'
  where reparto_id = reparto_id_input
    and number = nuovo_current;

  return nuovo_current;
end;
$$;

grant execute on function prendi_numero_reparto(uuid) to anon, authenticated;
grant execute on function avanza_numero_reparto(uuid) to authenticated;
grant execute on function richiama_numero_reparto(uuid) to authenticated;
grant execute on function non_presente_reparto(uuid) to authenticated;
