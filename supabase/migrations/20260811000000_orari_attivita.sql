-- Fascia oraria di lavoro dell'attivita', usata per generare le colonne del
-- grafico "Giorno" nelle statistiche (prima fisso a 9-20 per tutti).

alter table businesses add column if not exists ora_apertura smallint not null default 9;
alter table businesses add column if not exists ora_chiusura smallint not null default 20;
