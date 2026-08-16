-- Schermo per i clienti: una vista pubblica (nessun login), pensata per
-- essere aperta su uno schermo in negozio, che mostra chi si sta servendo
-- ora, quante persone sono in coda e l'attesa media di oggi.
--
-- name/current/last_issued/ora_apertura/giorni_apertura sono gia' leggibili
-- da un utente anonimo (serve al flusso QR /coda/<slug>), ma l'attesa media
-- richiede di leggere created_at/served_at da tickets, che non ha una
-- policy pubblica (ne' dovrebbe averla riga per riga). Una funzione
-- SECURITY DEFINER restituisce solo l'aggregato che serve, e in piu'
-- rispetta l'interruttore schermo_abilitato impostato dal titolare.

alter table businesses add column if not exists schermo_abilitato boolean not null default true;

create or replace function schermo_pubblico(slug_input text)
returns table(
  nome text,
  ora_apertura smallint,
  ora_chiusura smallint,
  giorni_apertura smallint[],
  current_oggi int,
  in_coda int,
  attesa_media_min int
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
    v_business.name,
    v_business.ora_apertura,
    v_business.ora_chiusura,
    v_business.giorni_apertura,
    greatest(v_business.current - v_base_oggi, 0),
    greatest(v_business.last_issued - v_business.current, 0),
    coalesce(v_attesa_media, 0);
end;
$$;

grant execute on function schermo_pubblico(text) to anon, authenticated;
