-- Pannello Admin > Utenti: modificare l'email e eliminare un utente.
--
-- Stesso motivo di admin_lista_utenti(): auth.users non e' scrivibile dal
-- client via RLS, quindi anche qui una funzione SECURITY DEFINER che
-- verifica lei stessa con e_admin() che sia un admin a chiamarla.
--
-- Caso d'uso per la modifica email: un utente ha perso l'accesso alla
-- casella con cui si era registrato, l'admin gli corregge l'email cosi'
-- puo' ricevere li' il link di recupero password. Essendo una correzione
-- fatta dall'admin (non l'utente stesso), la nuova email viene segnata
-- come gia' confermata.

create or replace function admin_modifica_email_utente(user_id_input uuid, nuova_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not e_admin() then
    raise exception 'Non autorizzato';
  end if;

  update auth.users
  set email = nuova_email,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = user_id_input;

  if not found then
    raise exception 'Utente non trovato';
  end if;
exception
  when unique_violation then
    raise exception 'Esiste gia'' un utente registrato con questa email';
end;
$$;

grant execute on function admin_modifica_email_utente(uuid, text) to authenticated;

-- Eliminazione: se l'utente possiede attivita' si rifiuta (andrebbero
-- prima eliminate o trasferite a un altro proprietario, non e' una
-- decisione che l'admin deve poter prendere per sbaglio con un tap).
-- Lo staff invitato e le sottoscrizioni push si eliminano da soli
-- (gia' ON DELETE CASCADE); i ticket gestiti restano ma perdono il
-- riferimento all'operatore che li ha serviti.
create or replace function admin_elimina_utente(user_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n_attivita int;
begin
  if not e_admin() then
    raise exception 'Non autorizzato';
  end if;

  select count(*) into n_attivita from businesses where owner_id = user_id_input;
  if n_attivita > 0 then
    raise exception 'Impossibile eliminare: l''utente possiede % attivita''. Eliminale o trasferiscile prima.', n_attivita;
  end if;

  update tickets set gestito_da = null where gestito_da = user_id_input;
  delete from auth.users where id = user_id_input;
end;
$$;

grant execute on function admin_elimina_utente(uuid) to authenticated;
