-- Giorni della settimana in cui l'attivita' e' aperta, in aggiunta alla
-- fascia oraria (ora_apertura/ora_chiusura) gia' esistente. Convenzione
-- JavaScript Date.getDay(): 0 = domenica, 1 = lunedi', ..., 6 = sabato.
-- Default: aperta tutti i giorni, per compatibilita' con le attivita'
-- create prima di questo campo.

alter table businesses add column if not exists giorni_apertura smallint[] not null default '{0,1,2,3,4,5,6}';
