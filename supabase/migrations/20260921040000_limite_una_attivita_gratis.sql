-- Un account puo' possedere una sola attivita' sul piano gratis: per
-- crearne una seconda serve che almeno una delle attivita' gia'
-- possedute sia su un piano a pagamento (pro/business). Applicato anche
-- lato DB (non solo nascondendo il pulsante) perche' altrimenti basta
-- una chiamata diretta dal browser per aggirare il limite.
create or replace function blocca_seconda_attivita_gratis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ne_possiede integer;
  ne_possiede_a_pagamento integer;
begin
  select count(*) into ne_possiede
  from businesses
  where owner_id = new.owner_id;

  if ne_possiede = 0 then
    return new;
  end if;

  select count(*) into ne_possiede_a_pagamento
  from businesses
  where owner_id = new.owner_id and piano <> 'gratis';

  if ne_possiede_a_pagamento = 0 then
    raise exception 'Con il piano Gratis puoi avere una sola attivita''. Passa a Pro o Business per crearne altre.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_blocca_seconda_attivita_gratis on businesses;
create trigger trg_blocca_seconda_attivita_gratis
  before insert on businesses
  for each row
  execute function blocca_seconda_attivita_gratis();
