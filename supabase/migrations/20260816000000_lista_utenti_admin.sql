-- Pannello Admin: lista di tutti gli utenti registrati.
--
-- auth.users non e' leggibile direttamente dal client via RLS (ne' lo
-- sarebbe opportuno: contiene colonne sensibili come la password
-- cifrata). Stesso pattern gia' usato per staff_di_attivita(): una
-- funzione SECURITY DEFINER che legge solo le colonne non sensibili e
-- verifica lei stessa, con e_admin(), che sia un admin a chiamarla.

create or replace function admin_lista_utenti(cerca text default '')
returns table(
  id uuid,
  email text,
  creato_il timestamptz,
  ultimo_accesso timestamptz,
  email_confermata boolean,
  ruolo text,
  attivita_possedute int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not e_admin() then
    raise exception 'Non autorizzato';
  end if;

  return query
    select
      au.id,
      au.email::text,
      au.created_at,
      au.last_sign_in_at,
      (au.email_confirmed_at is not null) as email_confermata,
      coalesce(au.raw_app_meta_data ->> 'role', 'utente') as ruolo,
      (select count(*) from businesses b where b.owner_id = au.id)::int as attivita_possedute
    from auth.users au
    where cerca = '' or au.email ilike '%' || cerca || '%'
    order by au.created_at desc;
end;
$$;

grant execute on function admin_lista_utenti(text) to authenticated;
