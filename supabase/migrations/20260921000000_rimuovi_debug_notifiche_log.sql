-- Rimuove la tabella di debug temporanea usata per diagnosticare l'invio
-- SMS/WhatsApp (vedi 20260917010000_debug_log_notifiche_temporaneo.sql).
-- Il problema di consegna e' stato risolto, non serve piu'.

drop table if exists debug_notifiche_log;
