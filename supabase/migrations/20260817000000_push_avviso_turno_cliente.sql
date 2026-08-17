-- Il push "manca poco" al cliente veniva inviato una volta sola per
-- sottoscrizione, e la riga veniva subito eliminata -- quindi non poteva
-- mai arrivare un secondo push esattamente quando arriva il turno vero
-- e proprio (ticket_number == current), il momento piu' importante per
-- il cliente. Serve un flag per distinguere "gia' avvisato che si
-- avvicina" da "sottoscrizione esaurita", cosi' la riga puo' restare
-- viva fino al turno effettivo invece di essere cancellata subito.

alter table push_subscriptions add column if not exists avviso_vicino_inviato boolean not null default false;
