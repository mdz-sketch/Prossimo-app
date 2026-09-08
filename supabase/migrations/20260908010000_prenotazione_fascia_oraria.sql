-- Prenotazione di una fascia oraria (terza delle 3 migliorie lato cliente
-- approvate): il cliente puo' prenotare un orario di passaggio piu' tardi
-- nella stessa giornata, invece di dover scansionare il QR ed entrare
-- subito in coda. Al raggiungimento dell'orario prenotato, un numero di
-- coda vero viene assegnato automaticamente (stessa numerazione di chi
-- prende il numero di persona: prendi_numero_atomico), la prenotazione
-- "confluisce" nella coda esistente senza creare un sistema separato.
--
-- prenotazioni_abilitato di default e' FALSE (come sms_abilitato, a
-- differenza di schermo_abilitato): non ha un costo esterno come l'SMS,
-- ma cambia il funzionamento della coda per i clienti, quindi va comunque
-- attivata esplicitamente dal titolare invece di apparire di sorpresa.
--
-- Assegnazione automatica: la funzione assegna_prenotazioni_scadute()
-- viene chiamata sia da un cron job (se l'estensione pg_cron e' disponibile
-- sul progetto, ogni minuto), sia -- come rete di sicurezza indipendente,
-- stessa logica "piu' canali, nessuno bloccante" gia' usata per gli avvisi
-- sonori/vibrazione/notifica -- ogni volta che un cliente controlla lo
-- stato della propria prenotazione (stato_prenotazione(), chiamata dal
-- polling lato client mentre e' in attesa). Se il job cron non e'
-- disponibile o non si attiva, l'assegnazione avviene comunque appena il
-- cliente stesso (che sta aspettando proprio quella prenotazione) la
-- controlla di nuovo.

alter table businesses add column if not exists prenotazioni_abilitato boolean not null default false;
alter table businesses add column if not exists slot_prenotazione_minuti integer not null default 30;

create table if not exists prenotazioni (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  slot_start timestamptz not null,
  telefono text,
  ticket_number integer,
  stato text not null default 'attesa' check (stato in ('attesa', 'in_coda', 'annullata')),
  created_at timestamptz not null default now()
);

create index if not exists prenotazioni_business_idx on prenotazioni (business_id, stato, slot_start);

-- RLS abilitata ma SENZA policy dirette per anon/authenticated: tutto
-- l'accesso passa dalle funzioni SECURITY DEFINER sotto, che validano
-- gli input e non espongono mai le prenotazioni (numeri di telefono
-- inclusi) di altri clienti.
alter table prenotazioni enable row level security;

-- --- Il cliente crea una prenotazione -------------------------------------
create or replace function crea_prenotazione(business_id_input uuid, slot_start_input timestamptz, telefono_input text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  biz record;
  nuovo_id uuid;
begin
  select prenotazioni_abilitato into biz from businesses where id = business_id_input;

  if biz is null or not biz.prenotazioni_abilitato then
    raise exception 'Le prenotazioni non sono attive per questa attivita';
  end if;

  if slot_start_input <= now() then
    raise exception 'Questa fascia oraria non e piu disponibile';
  end if;

  insert into prenotazioni (business_id, slot_start, telefono)
  values (business_id_input, slot_start_input, telefono_input)
  returning id into nuovo_id;

  return nuovo_id;
end;
$$;

-- --- Assegna un numero di coda vero ad ogni prenotazione il cui orario e'
-- gia' arrivato (riusa prendi_numero_atomico, stessa numerazione di chi
-- prende il numero scansionando il QR di persona). --------------------------
create or replace function assegna_prenotazioni_scadute(business_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  nuovo_ticket integer;
begin
  for r in
    select id from prenotazioni
    where business_id = business_id_input
      and stato = 'attesa'
      and slot_start <= now()
    order by slot_start asc, created_at asc
  loop
    begin
      nuovo_ticket := prendi_numero_atomico(business_id_input);
      update prenotazioni set ticket_number = nuovo_ticket, stato = 'in_coda' where id = r.id;
    exception when others then
      -- Non blocca le altre prenotazioni in coda se una singola fallisce.
      raise notice 'Assegnazione prenotazione % fallita: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;

-- --- Il cliente controlla lo stato della propria prenotazione (e, come
-- effetto collaterale innocuo, fa scattare l'assegnazione per la propria
-- attivita' se in ritardo rispetto al cron). ------------------------------
create or replace function stato_prenotazione(prenotazione_id_input uuid)
returns table(stato text, ticket_number integer, slot_start timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  biz_id uuid;
begin
  select business_id into biz_id from prenotazioni where id = prenotazione_id_input;
  if biz_id is not null then
    perform assegna_prenotazioni_scadute(biz_id);
  end if;

  return query
    select p.stato, p.ticket_number, p.slot_start
    from prenotazioni p
    where p.id = prenotazione_id_input;
end;
$$;

-- --- Il cliente annulla una prenotazione non ancora scaduta -----------------
create or replace function annulla_prenotazione(prenotazione_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update prenotazioni
  set stato = 'annullata'
  where id = prenotazione_id_input
    and stato = 'attesa';
end;
$$;

grant execute on function crea_prenotazione(uuid, timestamptz, text) to anon, authenticated;
grant execute on function stato_prenotazione(uuid) to anon, authenticated;
grant execute on function annulla_prenotazione(uuid) to anon, authenticated;

-- --- Cron di riserva: ogni minuto assegna le prenotazioni scadute anche
-- senza che nessun cliente stia guardando la pagina in quel momento.
-- Se pg_cron non e' disponibile su questo progetto (piano/permessi), la
-- migrazione prosegue comunque: resta il meccanismo di sicurezza sopra
-- (stato_prenotazione chiamata dal polling del cliente in attesa). ---------
do $$
begin
  create extension if not exists pg_cron with schema extensions;
exception when others then
  raise notice 'pg_cron non disponibile: l''assegnazione avverra'' comunque tramite il controllo periodico del cliente in attesa.';
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'assegna-prenotazioni-scadute') then
    perform cron.unschedule('assegna-prenotazioni-scadute');
  end if;

  perform cron.schedule(
    'assegna-prenotazioni-scadute',
    '* * * * *',
    $sql$select assegna_prenotazioni_scadute(business_id) from businesses where prenotazioni_abilitato = true;$sql$
  );
exception when others then
  raise notice 'Impossibile pianificare il cron job: l''assegnazione avverra'' comunque tramite il controllo periodico del cliente in attesa.';
end $$;
