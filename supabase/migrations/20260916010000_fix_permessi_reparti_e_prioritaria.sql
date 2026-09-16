-- Fix di sicurezza: le funzioni SECURITY DEFINER introdotte da
-- 20260908020000_chiamata_prioritaria.sql e 20260908030000_reparti.sql
-- per le azioni dell'operatore (chiamare con priorita', completarla,
-- annullarla; avanti/richiama/non presente per reparto) NON verificavano
-- chi le stesse chiamando.
--
-- SECURITY DEFINER fa girare la funzione con i permessi di chi l'ha
-- creata (bypassa la RLS), a differenza delle funzioni "atomiche"
-- originali per l'attivita' intera (avanza_numero_atomico e affini, in
-- 20260806000000_atomic_queue_operations.sql), che NON sono SECURITY
-- DEFINER: girano con i permessi di chi chiama, quindi la RLS su
-- "businesses"/"tickets" li blocca gia' se non sono titolare/staff/admin
-- di quell'attivita'.
--
-- Risultato concreto prima di questo fix: qualsiasi utente autenticato
-- (anche il titolare di un'attivita' completamente diversa) poteva
-- chiamare ad es. avanza_numero_reparto('<uuid di un reparto altrui>')
-- o chiama_prioritario('<uuid di un'attivita' altrui>', 5) e alterare la
-- coda di un'attivita' che non gli appartiene -- un controllo di accesso
-- mancante (IDOR), non solo un bug di RLS.
--
-- Fix: replicare lo stesso controllo gia' usato ovunque nel resto del
-- progetto (vedi 20260811010000_fix_permessi_staff.sql,
-- 20260813000000_staff_e_statistiche_operatore.sql): titolare, staff
-- invitato o admin, altrimenti eccezione. prendi_numero_reparto NON
-- viene toccata: resta intenzionalmente pubblica, come
-- prendi_numero_atomico, perche' e' l'azione con cui un cliente prende
-- un numero senza login.
--
-- Nessuna riga esistente cambia: chi ha sempre usato l'app da
-- titolare/staff/admin continua a poter fare esattamente le stesse cose
-- di prima, il fix chiude solo l'accesso a chi non dovrebbe averlo.

create or replace function chiama_prioritario(business_id_input uuid, numero_input integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  if not (e_proprietario_di(business_id_input) or e_staff_di(business_id_input) or e_admin()) then
    raise exception 'Non autorizzato';
  end if;

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
  if not (e_proprietario_di(business_id_input) or e_staff_di(business_id_input) or e_admin()) then
    raise exception 'Non autorizzato';
  end if;

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
  if not (e_proprietario_di(business_id_input) or e_staff_di(business_id_input) or e_admin()) then
    raise exception 'Non autorizzato';
  end if;

  update businesses set chiamata_prioritaria = null where id = business_id_input;
end;
$$;

create or replace function avanza_numero_reparto(reparto_id_input uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  nuovo_current integer;
begin
  select business_id into v_business_id from reparti where id = reparto_id_input;
  if v_business_id is null then
    raise exception 'Reparto non trovato';
  end if;
  if not (e_proprietario_di(v_business_id) or e_staff_di(v_business_id) or e_admin()) then
    raise exception 'Non autorizzato';
  end if;

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
  v_business_id uuid;
  nuovo_current integer;
begin
  select business_id into v_business_id from reparti where id = reparto_id_input;
  if v_business_id is null then
    raise exception 'Reparto non trovato';
  end if;
  if not (e_proprietario_di(v_business_id) or e_staff_di(v_business_id) or e_admin()) then
    raise exception 'Non autorizzato';
  end if;

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
  v_business_id uuid;
  nuovo_current integer;
begin
  select business_id into v_business_id from reparti where id = reparto_id_input;
  if v_business_id is null then
    raise exception 'Reparto non trovato';
  end if;
  if not (e_proprietario_di(v_business_id) or e_staff_di(v_business_id) or e_admin()) then
    raise exception 'Non autorizzato';
  end if;

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

-- --- RLS reparti: mancava il bypass admin per la gestione diretta da
-- tabella (crea/rinomina/elimina reparto nel form "Modifica attivita'",
-- vedi src/lib/queries.js: creaReparto/rinominaReparto/eliminaReparto
-- sono chiamate dirette a supabase.from("reparti"), non RPC, quindi
-- restano soggette alla RLS qui sotto). Senza e_admin() un admin che
-- apre "Modifica orari" sull'attivita' di un altro utente dalla scheda
-- Utenti vedeva la sezione Reparti ma ogni aggiunta/rinomina/rimozione
-- falliva silenziosamente contro la RLS -- stessa regola gia' rispettata
-- per "businesses" (vedi "admin aggiorna qualsiasi attivita'").
drop policy if exists "titolare o staff gestiscono i reparti" on reparti;
create policy "titolare o staff gestiscono i reparti"
on reparti for all
using (e_proprietario_di(reparti.business_id) or e_staff_di(reparti.business_id) or e_admin())
with check (e_proprietario_di(reparti.business_id) or e_staff_di(reparti.business_id) or e_admin());
