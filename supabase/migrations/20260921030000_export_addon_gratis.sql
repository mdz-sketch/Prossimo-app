-- Add-on +5EUR/mese sul piano gratis: sblocca l'export Excel/PDF delle
-- statistiche senza cambiare piano. Su piano pro/business l'export e'
-- sempre incluso, indipendentemente da questo campo. Aggiornato solo
-- dal webhook Stripe (stessa protezione del trigger su piano/
-- stripe_customer_id/stripe_subscription_id).

alter table businesses
  add column if not exists export_abilitato boolean not null default false,
  add column if not exists stripe_export_subscription_id text;

comment on column businesses.export_abilitato is
  'Add-on +5EUR/mese sul piano gratis per sbloccare export Excel/PDF delle statistiche. Su piano pro/business e'' sempre true, indipendentemente da questo campo. Aggiornato solo dal webhook Stripe.';

-- Estende il trigger esistente per proteggere anche i due nuovi campi.
create or replace function blocca_modifica_piano()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if new.piano is distinct from old.piano
      or new.stripe_customer_id is distinct from old.stripe_customer_id
      or new.stripe_subscription_id is distinct from old.stripe_subscription_id
      or new.export_abilitato is distinct from old.export_abilitato
      or new.stripe_export_subscription_id is distinct from old.stripe_export_subscription_id
    then
      raise exception 'Non autorizzato a modificare il piano direttamente';
    end if;
  end if;
  return new;
end;
$$;
