-- Feedback post-servizio: dopo essere stato servito, il cliente puo'
-- lasciare una valutazione 1-5. Se e' alta (>=4) e il titolare ha
-- configurato un link alle recensioni Google, gli viene proposto di
-- lasciarla anche li'; se e' bassa, gli viene chiesto un commento privato
-- (mai pubblico) su cosa migliorare -- niente viene mai pubblicato senza
-- che sia il cliente stesso a farlo su Google.
--
-- Default sicuro: feedback_abilitato parte a FALSE (come sms_abilitato/
-- prenotazioni_abilitato) -- non cambia nulla per le attivita' esistenti
-- finche' il titolare non lo attiva esplicitamente dal form di modifica.

alter table businesses add column if not exists feedback_abilitato boolean not null default false;
alter table businesses add column if not exists google_review_url text;

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  reparto_id uuid references reparti(id) on delete set null,
  ticket_number integer,
  valutazione smallint not null check (valutazione between 1 and 5),
  commento text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_business_idx on feedback (business_id, created_at);

alter table feedback enable row level security;

-- Il cliente (anonimo, come per i ticket) lascia un feedback: stesso
-- livello di fiducia gia' usato per prendi_numero_atomico/prenotazioni,
-- nessun account quindi nessun modo di legare il feedback a un'identita'
-- verificabile lato server -- accettabile per un feedback interno al
-- titolare, non per una recensione pubblica (quella resta su Google,
-- dove le regole di Google stesso si applicano).
drop policy if exists "cliente lascia un feedback" on feedback;
create policy "cliente lascia un feedback"
on feedback for insert
with check (valutazione between 1 and 5);

-- Titolare, staff o admin leggono/gestiscono i feedback della propria
-- attivita' (stesso pattern di reparti/business_staff).
drop policy if exists "titolare o staff leggono i feedback" on feedback;
create policy "titolare o staff leggono i feedback"
on feedback for select
using (e_proprietario_di(business_id) or e_staff_di(business_id) or e_admin());

drop policy if exists "titolare o staff eliminano i feedback" on feedback;
create policy "titolare o staff eliminano i feedback"
on feedback for delete
using (e_proprietario_di(business_id) or e_staff_di(business_id) or e_admin());
