-- Tabella di debug TEMPORANEA: la Console Twilio del progetto richiede
-- un upgrade a pagamento per vedere i log di invio, e i log della Edge
-- Function accessibili da qui mostrano solo la riga della richiesta HTTP
-- al gateway, non l'output interno (console.error) della funzione --
-- quindi non c'e' modo di vedere la risposta vera di Twilio (successo o
-- errore, e perche') per capire perche' SMS/WhatsApp non arrivano nonostante
-- risposta 200 dalla function. Questa tabella la rende visibile via SQL.
--
-- Solo service role puo' scriverci/leggerla (RLS abilitata, nessuna
-- policy) -- stesso pattern gia' usato per "prenotazioni".

create table if not exists debug_notifiche_log (
  id uuid primary key default gen_random_uuid(),
  canale text not null,
  telefono text not null,
  http_status integer,
  corpo_risposta text,
  created_at timestamptz not null default now()
);

alter table debug_notifiche_log enable row level security;
