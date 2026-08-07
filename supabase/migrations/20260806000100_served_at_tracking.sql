-- Aggiunge il tracciamento del momento in cui un ticket viene servito,
-- necessario per calcolare l'attesa media reale nella pagina Statistiche
-- (statisticheComplete in src/lib/queries.js: attesaMedia = served_at - created_at).

alter table tickets add column if not exists served_at timestamptz;

create or replace function avanza_numero_atomico(business_id_input uuid)
returns integer
language plpgsql
as $$
declare
  nuovo_current integer;
begin
  update businesses
  set current = current + 1
  where id = business_id_input
    and current < last_issued
  returning current into nuovo_current;

  if nuovo_current is null then
    raise exception 'Nessun cliente in coda';
  end if;

  update tickets
  set status = 'servito', served_at = now()
  where business_id = business_id_input
    and number = nuovo_current;

  return nuovo_current;
end;
$$;

create or replace function richiama_numero_atomico(business_id_input uuid)
returns integer
language plpgsql
as $$
declare
  nuovo_current integer;
begin
  update businesses
  set current = current - 1
  where id = business_id_input
    and current > 0
  returning current into nuovo_current;

  if nuovo_current is null then
    raise exception 'Nessun numero da richiamare';
  end if;

  update tickets
  set status = 'in_attesa', served_at = null
  where business_id = business_id_input
    and number = nuovo_current + 1;

  return nuovo_current;
end;
$$;
