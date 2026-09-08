-- Avviso via SMS al cliente ("mancano pochi numeri" / "e' il tuo turno"),
-- alternativa alla notifica push per chi non vuole tenere una scheda del
-- browser aperta o concedere permessi di notifica -- l'SMS funziona su
-- qualsiasi telefono, senza app ne' permessi.
--
-- sms_abilitato di default e' FALSE (a differenza di schermo_abilitato,
-- che di default e' TRUE): l'invio SMS richiede un provider a pagamento
-- (Twilio) configurato dal titolare, quindi va abilitato esplicitamente
-- solo da chi ha gia' impostato il provider e accetta il costo per
-- messaggio -- mostrare l'opzione ai clienti prima che l'invio funzioni
-- davvero sarebbe una falsa promessa.
--
-- Stessa Edge Function "send-push" gia' esistente si occupa anche
-- dell'invio SMS (stesso trigger, nessuna configurazione aggiuntiva del
-- webhook): richiede in piu' le secrets TWILIO_ACCOUNT_SID,
-- TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER. Se mancanti, l'invio SMS viene
-- saltato in silenzio (nessun errore, il push continua a funzionare).

alter table businesses add column if not exists sms_abilitato boolean not null default false;

create table if not exists sms_notifiche (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  ticket_number integer not null,
  telefono text not null,
  avviso_vicino_inviato boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, ticket_number)
);

create index if not exists sms_notifiche_business_idx on sms_notifiche (business_id);

alter table sms_notifiche enable row level security;

-- Il cliente (anonimo) si iscrive solo con il proprio ticket -- nessuna
-- policy SELECT/DELETE: la lettura/cancellazione avviene solo dalla Edge
-- Function con la service role key, che bypassa la RLS.
drop policy if exists "cliente si iscrive con il proprio ticket" on sms_notifiche;
create policy "cliente si iscrive con il proprio ticket"
on sms_notifiche for insert
with check (ticket_number is not null and telefono is not null);

-- Upsert (INSERT ... ON CONFLICT DO UPDATE) lato client: serve anche la
-- policy UPDATE, altrimenti il ramo di conflitto verrebbe bloccato dalla
-- RLS -- stesso bug gia' preso e corretto per push_subscriptions.
drop policy if exists "cliente aggiorna la propria iscrizione sms" on sms_notifiche;
create policy "cliente aggiorna la propria iscrizione sms"
on sms_notifiche for update
using (ticket_number is not null)
with check (ticket_number is not null and telefono is not null);
