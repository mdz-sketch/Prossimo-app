-- La policy UPDATE su businesses ("solo il proprietario aggiorna la
-- propria attivita'") non ha un with_check per colonna: senza questo
-- trigger, il proprietario potrebbe scriversi piano='business' da solo
-- con una semplice update via client SDK, scavalcando Stripe del tutto.
-- Solo il webhook (service role) puo' cambiare questi campi.
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
    then
      raise exception 'Non autorizzato a modificare il piano direttamente';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_blocca_modifica_piano on businesses;
create trigger trg_blocca_modifica_piano
  before update on businesses
  for each row
  execute function blocca_modifica_piano();
