-- Avviso via WhatsApp al cliente ("mancano pochi numeri" / "e' il tuo
-- turno"), stesso meccanismo gia' esistente per l'SMS (sms_notifiche),
-- solo un canale in piu': si riusa la stessa tabella invece di
-- duplicarla, con una colonna "canale" a distinguere come va inviato il
-- messaggio (stesso vincolo unique(business_id, ticket_number) di prima:
-- un cliente ha un solo canale attivo alla volta per ticket, sms O
-- whatsapp, non entrambi).
--
-- whatsapp_abilitato di default FALSE, stesso motivo di sms_abilitato:
-- richiede un WhatsApp Sender configurato su Twilio (in fase di test,
-- il Sandbox -- gratuito, ma richiede che ogni numero di test "si
-- unisca" mandando il codice indicato da Twilio prima di poter ricevere
-- messaggi) prima di attivarlo per i clienti veri.
--
-- Stessa Edge Function "send-push" gia' esistente gestisce anche
-- l'invio WhatsApp (stesso trigger, nessuna configurazione webhook in
-- piu'): richiede in aggiunta la secret TWILIO_WHATSAPP_FROM_NUMBER
-- (in sandbox: whatsapp:+14155238886, il numero condiviso del Sandbox
-- Twilio; in produzione: il proprio Sender approvato, col prefisso
-- "whatsapp:"). Se mancante, l'invio WhatsApp viene saltato in
-- silenzio, esattamente come gia' avviene per l'SMS senza le sue
-- secrets.

alter table businesses add column if not exists whatsapp_abilitato boolean not null default false;

alter table sms_notifiche add column if not exists canale text not null default 'sms' check (canale in ('sms', 'whatsapp'));
