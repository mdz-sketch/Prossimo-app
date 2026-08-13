-- Soglie opzionali per l'avviso di coda lunga: se impostate, l'operatore
-- vede un banner nel pannello quando la coda o il tempo di attesa stimato
-- le superano. NULL = soglia disattivata (default per compatibilita' con
-- le attivita' esistenti).

alter table businesses add column if not exists soglia_coda smallint;
alter table businesses add column if not exists soglia_attesa smallint;
