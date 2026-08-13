-- Tre aggiunte legate alla gestione dello staff, richieste dal proprietario:
--
-- 1) Un operatore/proprietario possa vedere chi fa parte dello staff di
--    un'attivita' e rimuoverlo -- prima si poteva solo invitare, mai vedere
--    o togliere chi era stato invitato.
-- 2) Tracciare quale utente ha gestito ogni ticket (servito/segnato come
--    non presentato), per poter mostrare statistiche per operatore.
-- 3) Le funzioni per leggere queste informazioni con l'email dell'utente
--    (auth.users non e' leggibile direttamente dal client via RLS) restano
--    SECURITY DEFINER con lo stesso controllo di autorizzazione gia' usato
--    per le altre funzioni di gestione coda.

alter table tickets add column if not exists gestito_da uuid references auth.users(id);

-- --- 1) Elenco staff (solo proprietario/admin: e' un'azione di gestione) ---
create or replace function staff_di_attivita(business_id_input uuid)
returns table(user_id uuid, email text, creato_il timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (e_proprietario_di(business_id_input) or e_admin()) then
    raise exception 'Non autorizzato a gestire questa attivita''';
  end if;

  return query
    select bs.user_id, au.email::text, bs.created_at
    from business_staff bs
    join auth.users au on au.id = bs.user_id
    where bs.business_id = business_id_input
    order by bs.created_at;
end;
$$;

grant execute on function staff_di_attivita(uuid) to authenticated;

-- La rimozione usa gia' la policy DELETE esistente su business_staff
-- ("il proprietario puo' rimuovere staff"), nessuna nuova funzione serve.

-- --- 2) Traccia chi ha gestito ogni ticket ----------------------------------
create or replace function avanza_numero_atomico(business_id_input uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  nuovo_current integer;
begin
  if not (e_proprietario_di(business_id_input) or e_staff_di(business_id_input) or e_admin()) then
    raise exception 'Non autorizzato a gestire questa attivita''';
  end if;

  update businesses
  set current = current + 1
  where id = business_id_input
    and current < last_issued
  returning current into nuovo_current;

  if nuovo_current is null then
    raise exception 'Nessun cliente in coda';
  end if;

  update tickets
  set status = 'servito', served_at = now(), gestito_da = auth.uid()
  where business_id = business_id_input
    and number = nuovo_current;

  return nuovo_current;
end;
$$;

create or replace function richiama_numero_atomico(business_id_input uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  nuovo_current integer;
begin
  if not (e_proprietario_di(business_id_input) or e_staff_di(business_id_input) or e_admin()) then
    raise exception 'Non autorizzato a gestire questa attivita''';
  end if;

  update businesses
  set current = current - 1
  where id = business_id_input
    and current > 0
  returning current into nuovo_current;

  if nuovo_current is null then
    raise exception 'Nessun numero da richiamare';
  end if;

  -- Richiamato = non e' piu' stato gestito da nessuno, torna in attesa.
  update tickets
  set status = 'in_attesa', served_at = null, gestito_da = null
  where business_id = business_id_input
    and number = nuovo_current + 1;

  return nuovo_current;
end;
$$;

create or replace function non_presente_atomico(business_id_input uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  nuovo_current integer;
begin
  if not (e_proprietario_di(business_id_input) or e_staff_di(business_id_input) or e_admin()) then
    raise exception 'Non autorizzato a gestire questa attivita''';
  end if;

  update businesses
  set current = current + 1
  where id = business_id_input
    and current < last_issued
  returning current into nuovo_current;

  if nuovo_current is null then
    raise exception 'Nessun cliente in coda';
  end if;

  update tickets
  set status = 'non_presentato', gestito_da = auth.uid()
  where business_id = business_id_input
    and number = nuovo_current;

  return nuovo_current;
end;
$$;

grant execute on function avanza_numero_atomico(uuid) to authenticated;
grant execute on function richiama_numero_atomico(uuid) to authenticated;
grant execute on function non_presente_atomico(uuid) to authenticated;

-- --- 3) Statistiche aggregate per operatore (proprietario, staff o admin) --
create or replace function statistiche_per_operatore(business_id_input uuid, da timestamptz, a timestamptz)
returns table(user_id uuid, email text, serviti int, non_presentati int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (e_proprietario_di(business_id_input) or e_staff_di(business_id_input) or e_admin()) then
    raise exception 'Non autorizzato a gestire questa attivita''';
  end if;

  return query
    select t.gestito_da, au.email::text,
           count(*) filter (where t.status = 'servito')::int as serviti,
           count(*) filter (where t.status = 'non_presentato')::int as non_presentati
    from tickets t
    join auth.users au on au.id = t.gestito_da
    where t.business_id = business_id_input
      and t.gestito_da is not null
      and t.created_at >= da
      and t.created_at < a
    group by t.gestito_da, au.email
    order by serviti desc;
end;
$$;

grant execute on function statistiche_per_operatore(uuid, timestamptz, timestamptz) to authenticated;
