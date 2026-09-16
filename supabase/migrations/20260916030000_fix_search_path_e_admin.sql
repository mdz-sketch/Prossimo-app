-- Hardening: e_admin() era l'unica delle funzioni SECURITY DEFINER del
-- progetto senza "set search_path", segnalato dal linter di sicurezza
-- Supabase (function_search_path_mutable). Rischio basso in pratica (il
-- corpo legge solo auth.jwt(), non risolve nomi di tabelle/funzioni
-- tramite search_path), ma tutte le altre funzioni del progetto
-- (e_proprietario_di, e_staff_di, chiama_prioritario, ecc.) lo hanno gia'
-- per lo stesso motivo di difesa in profondita' -- un search_path
-- mutabile permetterebbe in teoria a un utente con privilegi di CREATE
-- su uno schema di dirottare la risoluzione di un nome non qualificato.

create or replace function e_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;
