-- Campo piano per attivita' (Gratis/Pro/Business, vedi
-- docs/piani-abbonamento.md) e riferimenti Stripe per l'abbonamento.
-- Aggiornati solo dal webhook stripe-webhook (service role), mai a mano
-- lato client -- vedi trigger in
-- 20260921020000_blocca_modifica_piano_lato_client.sql.

alter table businesses
  add column if not exists piano text not null default 'gratis'
    check (piano in ('gratis', 'pro', 'business')),
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

comment on column businesses.piano is
  'gratis/pro/business. Aggiornato dal webhook Stripe (stripe-webhook), mai a mano lato client.';
