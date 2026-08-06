-- Funzioni atomiche per le operazioni dell'operatore (Avanti / Richiama / Non presente).
--
-- Perche': in precedenza App.jsx chiamava src/lib/queries.js che leggeva
-- "current" con una SELECT e poi lo scriveva con una UPDATE separata.
-- Due click ravvicinati (doppio tap, due dispositivi sullo stesso locale)
-- potevano leggere lo stesso valore ed incrementarlo una sola volta invece
-- di due, "perdendo" un cliente dal conteggio (stessa classe di bug gia'
-- risolta per prendi_numero_atomico).
--
-- In piu' non c'era alcun limite: un operatore poteva premere "Avanti" o
-- "Non presente" anche a coda vuota, facendo crescere "current" oltre
-- "last_issued" e rompendo la UI dei clienti futuri (venivano marcati
-- come "gia' serviti" senza mai essere stati chiamati).
--
-- Le funzioni sotto risolvono entrambi i problemi in un colpo solo: la
-- UPDATE su "businesses" blocca la riga a livello di database e la
-- condizione nella WHERE (current < last_issued / current > 0) e' quindi
-- valutata atomicamente insieme all'incremento/decremento.

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
  set status = 'servito'
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
  set status = 'in_attesa'
  where business_id = business_id_input
    and number = nuovo_current + 1;

  return nuovo_current;
end;
$$;

create or replace function non_presente_atomico(business_id_input uuid)
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
  set status = 'non_presentato'
  where business_id = business_id_input
    and number = nuovo_current;

  return nuovo_current;
end;
$$;

grant execute on function avanza_numero_atomico(uuid) to authenticated;
grant execute on function richiama_numero_atomico(uuid) to authenticated;
grant execute on function non_presente_atomico(uuid) to authenticated;
