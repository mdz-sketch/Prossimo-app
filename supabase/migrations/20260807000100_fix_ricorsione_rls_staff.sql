-- Fix: "infinite recursion detected in policy for relation businesses"
--
-- Le policy della migration precedente creavano un ciclo: quelle su
-- businesses controllano business_staff (per sapere se sei staff), e
-- quella su business_staff controlla businesses (per sapere se sei
-- proprietario) -> Postgres rivaluta le policy a vicenda all'infinito.
--
-- Si risolve con due funzioni SECURITY DEFINER: eseguono la query interna
-- bypassando la RLS della tabella che interrogano, quindi non triggerano
-- di nuovo le policy dell'altra tabella e il ciclo si spezza.

create or replace function e_staff_di(business_id_input uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from business_staff bs
    where bs.business_id = business_id_input and bs.user_id = auth.uid()
  );
$$;

create or replace function e_proprietario_di(business_id_input uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from businesses b
    where b.id = business_id_input and b.owner_id = auth.uid()
  );
$$;

-- --- business_staff: usa e_proprietario_di invece della subquery diretta --
drop policy if exists "vedi il tuo staff o le tue righe di staff" on business_staff;
create policy "vedi il tuo staff o le tue righe di staff"
on business_staff for select
using (
  user_id = auth.uid()
  or e_proprietario_di(business_staff.business_id)
);

drop policy if exists "il proprietario puo' rimuovere staff" on business_staff;
create policy "il proprietario puo' rimuovere staff"
on business_staff for delete
using (e_proprietario_di(business_staff.business_id));

-- --- businesses: usa e_staff_di invece della subquery diretta ------------
drop policy if exists "staff invitato legge l'attivita' assegnata" on businesses;
create policy "staff invitato legge l'attivita' assegnata"
on businesses for select
using (e_staff_di(businesses.id));

drop policy if exists "staff invitato aggiorna l'attivita' assegnata" on businesses;
create policy "staff invitato aggiorna l'attivita' assegnata"
on businesses for update
using (e_staff_di(businesses.id));

-- --- tickets: idem, altrimenti il ciclo si ripresenta passando di qui ----
drop policy if exists "staff invitato legge i ticket dell'attivita' assegnata" on tickets;
create policy "staff invitato legge i ticket dell'attivita' assegnata"
on tickets for select
using (e_staff_di(tickets.business_id));

drop policy if exists "staff invitato aggiorna i ticket dell'attivita' assegnata" on tickets;
create policy "staff invitato aggiorna i ticket dell'attivita' assegnata"
on tickets for update
using (e_staff_di(tickets.business_id));
