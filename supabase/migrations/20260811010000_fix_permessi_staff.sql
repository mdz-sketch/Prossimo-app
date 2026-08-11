-- Fix di due falle di sicurezza nel ruolo "operatore invitato" (business_staff),
-- trovate durante una revisione completa dell'app.
--
-- 1) business_staff INSERT: la policy controllava solo "user_id = auth.uid()",
--    cioe' che stai aggiungendo TE STESSO come staff -- ma non verificava
--    affatto il codice invito. La validazione del codice avveniva solo lato
--    JavaScript (unisciAttivita in queries.js), che pero' e' codice che gira
--    nel browser dell'utente: chiunque poteva chiamare direttamente l'API
--    Supabase (bypassando l'app) con un business_id qualsiasi -- anche senza
--    conoscerne l'invite_code -- e diventare staff di QUALSIASI attivita'.
--
-- 2) businesses UPDATE per lo staff: la policy "staff invitato aggiorna
--    l'attivita' assegnata" permetteva di aggiornare QUALSIASI colonna della
--    riga, non solo current/last_issued (le uniche che servono per gestire
--    la coda). Un operatore invitato poteva quindi, chiamando direttamente
--    l'API Supabase, cambiare owner_id e impossessarsi dell'attivita', o
--    cambiarne nome/orari/invite_code.
--
-- Fix: le azioni sulla coda (Avanti/Richiama/Non presente) diventano
-- SECURITY DEFINER e verificano loro stesse che chi chiama sia proprietario,
-- staff o admin di QUELLA attivita' -- non hanno piu' bisogno che lo staff
-- abbia UPDATE diretto sulla tabella, quindi quella policy viene rimossa.
-- L'ingresso in un'attivita' tramite codice invito passa da una funzione
-- dedicata che valida il codice PRIMA di scrivere su business_staff, e
-- l'insert diretto dal client viene bloccato.

create or replace function e_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- --- 1) Ingresso staff solo tramite funzione che valida il codice invito ---
drop policy if exists "un utente puo' aggiungersi come staff" on business_staff;
create policy "nessun insert diretto: solo tramite unisciti_con_invito"
on business_staff for insert
with check (false);

create or replace function unisciti_con_invito(codice_input text)
returns businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  business_trovata businesses;
begin
  select * into business_trovata
  from businesses
  where invite_code = trim(codice_input)
  limit 1;

  if business_trovata.id is null then
    raise exception 'Codice invito non valido';
  end if;

  begin
    insert into business_staff (business_id, user_id)
    values (business_trovata.id, auth.uid());
  exception
    when unique_violation then
      raise exception 'Sei gia'' staff di questa attivita''';
  end;

  return business_trovata;
end;
$$;

grant execute on function unisciti_con_invito(text) to authenticated;

-- --- 2) Lo staff non ha piu' UPDATE diretto su businesses ------------------
drop policy if exists "staff invitato aggiorna l'attivita' assegnata" on businesses;

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
  set status = 'servito', served_at = now()
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

  update tickets
  set status = 'in_attesa', served_at = null
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
  set status = 'non_presentato'
  where business_id = business_id_input
    and number = nuovo_current;

  return nuovo_current;
end;
$$;

grant execute on function avanza_numero_atomico(uuid) to authenticated;
grant execute on function richiama_numero_atomico(uuid) to authenticated;
grant execute on function non_presente_atomico(uuid) to authenticated;
