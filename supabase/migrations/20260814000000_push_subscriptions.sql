-- Sottoscrizioni alle notifiche push vere (Web Push standard), che
-- arrivano anche ad app completamente chiusa se installata come PWA.
--
-- Due tipi di sottoscrizione nella stessa tabella:
-- 1) del titolare/staff (user_id valorizzato, ticket_number nullo):
--    avviso di coda lunga.
-- 2) del cliente (ticket_number valorizzato, user_id nullo -- i clienti
--    non sono autenticati): avviso "mancano pochi numeri al tuo turno".
--
-- L'invio vero avviene da una Edge Function con la service role key
-- (bypassa la RLS), chiamata da un Database Webhook su "businesses" quando
-- current/last_issued cambiano -- cosi' funziona anche se nessuno ha
-- l'app aperta in quel momento. Il webhook va configurato a parte dalla
-- dashboard di Supabase (Database -> Webhooks), non e' incluso in questa
-- migration perche' richiede l'URL della function gia' deployata.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  ticket_number integer,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_tipo_valido check (
    (user_id is not null and ticket_number is null)
    or (user_id is null and ticket_number is not null)
  )
);

create index if not exists push_subscriptions_business_idx on push_subscriptions (business_id);

alter table push_subscriptions enable row level security;

-- Un cliente (anonimo) puo' sottoscriversi solo con ticket_number, mai
-- impostando user_id (impedirebbe di intestarsi la sottoscrizione a
-- qualcun altro).
drop policy if exists "cliente si sottoscrive con il proprio ticket" on push_subscriptions;
create policy "cliente si sottoscrive con il proprio ticket"
on push_subscriptions for insert
with check (user_id is null and ticket_number is not null);

-- Staff/proprietario/admin si sottoscrive solo come se stesso, e solo per
-- un'attivita' che gestisce davvero.
drop policy if exists "staff si sottoscrive come se stesso" on push_subscriptions;
create policy "staff si sottoscrive come se stesso"
on push_subscriptions for insert
with check (
  user_id = auth.uid()
  and ticket_number is null
  and (e_proprietario_di(business_id) or e_staff_di(business_id) or e_admin())
);

drop policy if exists "vedi la tua sottoscrizione" on push_subscriptions;
create policy "vedi la tua sottoscrizione"
on push_subscriptions for select
using (user_id = auth.uid());

drop policy if exists "cancella la tua sottoscrizione" on push_subscriptions;
create policy "cancella la tua sottoscrizione"
on push_subscriptions for delete
using (user_id = auth.uid());
