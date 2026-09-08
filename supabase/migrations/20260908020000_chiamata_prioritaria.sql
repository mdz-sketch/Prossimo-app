-- Chiamata prioritaria: un cliente in attesa (persona con disabilita',
-- donna incinta, anziano...) puo' essere chiamato subito dall'operatore,
-- fuori dal normale ordine numerico.
--
-- Approccio scelto (il piu' semplice tra i due possibili, vedi
-- discussione): il numero prioritario viene servito "a parte" -- current
-- NON si sposta, quindi i numeri intermedi restano visibilmente "in
-- attesa" come devono e vengono richiamati singolarmente al loro turno
-- come sempre. L'alternativa (rifare lo stato della coda da un contatore
-- unico a uno stato per ticket) risolverebbe il problema alla radice ma
-- e' un lavoro molto piu' grande, rimandato a quando servira' davvero.
--
-- businesses.chiamata_prioritaria: il numero attualmente in chiamata
-- prioritaria (null se nessuna). Il cliente con quel numero vede "e' il
-- tuo turno" sul proprio schermo, esattamente come un cliente normale.
--
-- businesses.ultimo_prioritario_servito: l'ultimo numero servito in
-- questo modo (mai azzerato, si aggiorna solo in avanti). Serve al
-- dispositivo del cliente gia' servito con priorita' per riconoscere di
-- essere stato servito anche se "current" non arrivera' mai al suo
-- numero specifico (altrimenti resterebbe bloccato a vedere "sei in
-- attesa" per sempre, invece del messaggio di ringraziamento).

alter table businesses add column if not exists chiamata_prioritaria integer;
alter table businesses add column if not exists ultimo_prioritario_servito integer;

create or replace function chiama_prioritario(business_id_input uuid, numero_input integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  select exists(
    select 1 from tickets
    where business_id = business_id_input
      and number = numero_input
      and status = 'in_attesa'
  ) into ok;

  if not ok then
    raise exception 'Numero non valido o non piu in attesa';
  end if;

  update businesses set chiamata_prioritaria = numero_input where id = business_id_input;
end;
$$;

create or replace function completa_prioritario(business_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  numero integer;
begin
  select chiamata_prioritaria into numero from businesses where id = business_id_input;
  if numero is null then
    raise exception 'Nessuna chiamata prioritaria in corso';
  end if;

  update tickets set status = 'servito', served_at = now()
  where business_id = business_id_input and number = numero;

  update businesses
  set chiamata_prioritaria = null, ultimo_prioritario_servito = numero
  where id = business_id_input;
end;
$$;

create or replace function annulla_prioritario(business_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update businesses set chiamata_prioritaria = null where id = business_id_input;
end;
$$;

grant execute on function chiama_prioritario(uuid, integer) to authenticated;
grant execute on function completa_prioritario(uuid) to authenticated;
grant execute on function annulla_prioritario(uuid) to authenticated;

-- Anche lo schermo pubblico mostra la chiamata prioritaria in corso: chi
-- e' stato chiamato con priorita' potrebbe non avere l'app aperta sul suo
-- telefono. CREATE OR REPLACE non basta per cambiare le colonne
-- restituite da una RETURNS TABLE: va eliminata e ricreata.
drop function if exists schermo_pubblico(text);

create function schermo_pubblico(slug_input text)
returns table(
  id uuid,
  nome text,
  ora_apertura smallint,
  ora_chiusura smallint,
  giorni_apertura smallint[],
  current_oggi int,
  in_coda int,
  attesa_media_min int,
  chiamata_prioritaria_oggi int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business businesses%rowtype;
  v_oggi_inizio timestamptz := date_trunc('day', now());
  v_base_oggi int;
  v_attesa_media int;
begin
  select * into v_business from businesses where slug = slug_input;
  if not found then
    raise exception 'Attivita'' non trovata';
  end if;
  if not v_business.schermo_abilitato then
    raise exception 'Schermo non abilitato per questa attivita''';
  end if;

  select coalesce(min(t.number), v_business.current + 1) - 1 into v_base_oggi
    from tickets t
    where t.business_id = v_business.id and t.created_at >= v_oggi_inizio;

  select round(avg(extract(epoch from (t.served_at - t.created_at)) / 60))::int into v_attesa_media
    from tickets t
    where t.business_id = v_business.id
      and t.status = 'servito'
      and t.served_at is not null
      and t.created_at >= v_oggi_inizio;

  return query select
    v_business.id,
    v_business.name,
    v_business.ora_apertura,
    v_business.ora_chiusura,
    v_business.giorni_apertura,
    greatest(v_business.current - v_base_oggi, 0),
    greatest(v_business.last_issued - v_business.current, 0),
    coalesce(v_attesa_media, 0),
    case when v_business.chiamata_prioritaria is null then null
         else v_business.chiamata_prioritaria - v_base_oggi end;
end;
$$;

grant execute on function schermo_pubblico(text) to anon, authenticated;
