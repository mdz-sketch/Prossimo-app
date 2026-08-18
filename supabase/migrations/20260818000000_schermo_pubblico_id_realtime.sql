-- Aggiunge l'id dell'attivita' al risultato di schermo_pubblico(): serve
-- al client per sottoscriversi agli aggiornamenti realtime della riga
-- "businesses" (stesso meccanismo gia' usato dal pannello operatore),
-- invece di dover aspettare fino a 10s del prossimo controllo periodico.
--
-- CREATE OR REPLACE non basta per cambiare le colonne restituite da una
-- RETURNS TABLE: va eliminata e ricreata.

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
    v_business.id,
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
