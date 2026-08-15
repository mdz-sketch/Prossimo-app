-- Corregge un bug: un dispositivo/browser ha un solo "endpoint" di
-- sottoscrizione push (lo riusa sempre lo stesso finche' non lo revoca),
-- ma puo' avere piu' scopi diversi nel tempo sullo stesso endpoint --
-- es. il titolare che prova l'app anche come cliente dallo stesso
-- telefono, o un cliente che prende un secondo numero in una visita
-- successiva. Con "unique(endpoint)" la seconda sottoscrizione andava in
-- conflitto con la prima e veniva scartata in silenzio (nessun errore
-- mostrato, ma la riga non si aggiornava).
--
-- Si allarga il vincolo a (endpoint, business_id, user_id, ticket_number):
-- NULLS NOT DISTINCT serve perche' altrimenti due righe con user_id/
-- ticket_number entrambi NULL non verrebbero considerate duplicate dal
-- vincolo (per lo standard SQL, NULL non e' mai uguale a NULL).

do $$
declare
  nome_vincolo text;
begin
  select conname into nome_vincolo
  from pg_constraint
  where conrelid = 'push_subscriptions'::regclass
    and contype = 'u'
    and array_length(conkey, 1) = 1
    and conkey[1] = (
      select attnum from pg_attribute
      where attrelid = 'push_subscriptions'::regclass and attname = 'endpoint'
    );

  if nome_vincolo is not null then
    execute format('alter table push_subscriptions drop constraint %I', nome_vincolo);
  end if;
end $$;

alter table push_subscriptions
  add constraint push_subscriptions_endpoint_scope_key
  unique nulls not distinct (endpoint, business_id, user_id, ticket_number);

-- Secondo bug collegato: src/lib/push.js fa un upsert (INSERT ... ON
-- CONFLICT DO UPDATE), ma la migration precedente aveva solo policy
-- INSERT/SELECT/DELETE -- il ramo UPDATE dell'upsert veniva bloccato
-- dalla RLS (nessuna policy permissiva = negato di default). Mancavano
-- queste due:

drop policy if exists "cliente aggiorna la propria sottoscrizione" on push_subscriptions;
create policy "cliente aggiorna la propria sottoscrizione"
on push_subscriptions for update
using (user_id is null and ticket_number is not null)
with check (user_id is null and ticket_number is not null);

drop policy if exists "staff aggiorna la propria sottoscrizione" on push_subscriptions;
create policy "staff aggiorna la propria sottoscrizione"
on push_subscriptions for update
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and ticket_number is null
  and (e_proprietario_di(business_id) or e_staff_di(business_id) or e_admin())
);
