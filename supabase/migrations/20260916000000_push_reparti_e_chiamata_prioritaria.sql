-- Fix: le notifiche push vere (Web Push/SMS, funzionano ad app chiusa)
-- smettevano di arrivare per due flussi aggiunti di recente:
--
-- 1) Reparti (code multiple, vedi 20260908030000_reparti.sql): avanti/
--    richiama/non presente per un reparto aggiornano reparti.current/
--    last_issued, mai businesses.current/last_issued -- il trigger che
--    chiama la Edge Function send-push era agganciato solo a
--    "businesses" e non scattava mai per un reparto.
-- 2) Chiamata prioritaria (vedi 20260908020000_chiamata_prioritaria.sql):
--    chiama_prioritario() scrive solo businesses.chiamata_prioritaria,
--    colonna che il trigger esistente ignorava nel suo WHEN.
--
-- In entrambi i casi il cliente vedeva comunque "e' il tuo turno" se
-- teneva la scheda del browser aperta (in-app, via realtime), ma non
-- riceveva ne' push ne' SMS se aveva chiuso la scheda o messo il
-- telefono in tasca -- esattamente il caso che la notifica push serve a
-- coprire.
--
-- Default sicuro: nessuna riga esistente cambia comportamento per le
-- attivita' senza reparti e senza chiamate prioritarie in corso; le
-- sottoscrizioni push gia' salvate restano valide (reparto_id nullo =
-- sottoscrizione "a livello di attivita'", come sempre).

-- --- 1) Reparti: distinguere le sottoscrizioni per reparto -------------
-- Ogni reparto ha la propria numerazione indipendente (vedi
-- reparti.last_issued in 20260908030000_reparti.sql): senza questa
-- colonna, un cliente del reparto A col ticket #3 e uno del reparto B
-- anch'esso col ticket #3 finirebbero per condividere la stessa riga di
-- sottoscrizione (o peggio, ricevere l'avviso dell'altro).
alter table push_subscriptions add column if not exists reparto_id uuid references reparti(id) on delete cascade;

create index if not exists push_subscriptions_reparto_idx on push_subscriptions (reparto_id, ticket_number);

-- Il vincolo di unicita' usato dall'upsert in src/lib/push.js va allargato
-- per includere reparto_id, altrimenti l'upsert tratterebbe come lo
-- stesso conflitto due sottoscrizioni per reparti diversi con lo stesso
-- numero di ticket sullo stesso dispositivo/attivita'.
alter table push_subscriptions drop constraint if exists push_subscriptions_endpoint_scope_key;
alter table push_subscriptions
  add constraint push_subscriptions_endpoint_scope_key
  unique nulls not distinct (endpoint, business_id, user_id, ticket_number, reparto_id);

-- Riusa la stessa funzione trigger gia' esistente per "businesses"
-- (generica: legge NEW/OLD dal contesto del trigger, non serve
-- ridefinirla ne' incollare di nuovo URL/service key). Stesso pattern:
-- scatta solo quando current/last_issued cambiano davvero.
drop trigger if exists trg_invia_push_reparto on reparti;
create trigger trg_invia_push_reparto
after update on reparti
for each row
when (new.current is distinct from old.current or new.last_issued is distinct from old.last_issued)
execute function trigger_invia_push();

-- --- 2) Chiamata prioritaria: includerla nel trigger su "businesses" ---
drop trigger if exists trg_invia_push on businesses;
create trigger trg_invia_push
after update on businesses
for each row
when (
  new.current is distinct from old.current
  or new.last_issued is distinct from old.last_issued
  or new.chiamata_prioritaria is distinct from old.chiamata_prioritaria
)
execute function trigger_invia_push();

-- NB: la function send-push (supabase/functions/send-push/index.ts) va
-- ridistribuita (supabase functions deploy send-push) per riconoscere i
-- payload dei reparti e il nuovo caso "chiamata prioritaria" -- questa
-- migration aggiorna solo lato database (trigger/colonna/vincolo).
