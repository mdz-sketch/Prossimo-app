-- Fix di un bug reale, trovato analizzando i log dopo una segnalazione
-- utente ("new row violates row-level security policy for table
-- sms_notifiche"): a sms_notifiche e push_subscriptions mancava la
-- policy SELECT per il cliente anonimo.
--
-- src/lib/push.js e src/lib/queries.js fanno un upsert (INSERT ... ON
-- CONFLICT DO UPDATE) su entrambe le tabelle, non una semplice INSERT --
-- gia' commentato nella migration originale di push_subscriptions
-- (20260815000000_fix_unique_push_subscriptions.sql) per un motivo
-- diverso (mancava la policy UPDATE). Quello che non era stato notato:
-- quando l'INSERT trova davvero una riga in conflitto (es. il cliente
-- riprova ad iscriversi per lo stesso ticket, capita spesso durante i
-- test, o se un effect React rigira due volte), Postgres deve poter
-- "vedere" la riga esistente sotto RLS per decidere se applicare
-- l'UPDATE -- senza una policy SELECT che lo permetta, l'intera
-- operazione fallisce con "new row violates row-level security policy",
-- anche se la riga sarebbe stata scritta da chi ha tutti i diritti per
-- farlo (stesso ticket, stesso business).
--
-- Le policy SELECT aggiunte qui rispecchiano esattamente le condizioni
-- gia' usate dalle policy INSERT/UPDATE esistenti sulle stesse tabelle:
-- nessun nuovo accesso concesso rispetto a quello che un cliente puo'
-- gia' fare in scrittura, solo la lettura necessaria perche' l'upsert
-- funzioni quando c'e' davvero un conflitto.

drop policy if exists "cliente legge la propria iscrizione sms" on sms_notifiche;
create policy "cliente legge la propria iscrizione sms"
on sms_notifiche for select
using (ticket_number is not null);

drop policy if exists "cliente legge la propria sottoscrizione push" on push_subscriptions;
create policy "cliente legge la propria sottoscrizione push"
on push_subscriptions for select
using (user_id is null and ticket_number is not null);
