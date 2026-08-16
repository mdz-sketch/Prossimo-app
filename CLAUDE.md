# Istruzioni per lavorare su Prossimo

Prossimo è un'app di gestione code (React/Vite + Supabase), deployata su Vercel.

## Regole operative

- **Ogni campo configurabile aggiunto a un form di creazione deve avere anche un modo per essere modificato dopo.** Non basta permettere di impostare qualcosa una volta sola (es. orari, giorni di apertura, nome, indirizzo): va sempre previsto un punto di accesso per correggerlo/aggiornarlo in seguito, senza dover eliminare e ricreare l'attività. Prima di considerare finita una feature che aggiunge un campo, chiedersi "e se dopo bisogna cambiarlo?".

- **Migrazioni DB**: scrivere sempre il file `.sql` in `supabase/migrations/`, ma non mergiare la PR finché l'utente non conferma di averla eseguita su Supabase (questa sessione non ha accesso di rete a `*.supabase.co`, va data all'utente da eseguire lui). Se la modifica ha un default sicuro che non rompe le attività esistenti, dirlo esplicitamente.

- **Dopo ogni squash-merge**, risincronizzare il branch di lavoro su `origin/main` prima di continuare (`git fetch origin main && git checkout -B <branch> origin/main && git push --force -u origin <branch>`), altrimenti GitHub può segnalare falsi conflitti ("dirty" mergeable_state) sulle PR successive.

- **RLS/Postgres**: prima di aggiungere policy che referenziano un'altra tabella (es. business_staff che controlla businesses e viceversa), verificare il rischio di ricorsione. Se serve un controllo incrociato fra due tabelle, usare da subito una funzione `SECURITY DEFINER` invece di una subquery diretta nella policy.

- **Verifica bug di layout/CSS** con uno screenshot Playwright isolato (HTML minimale con lo stesso CSS) prima e dopo la modifica, non affidarsi solo alla lettura del codice — specialmente per problemi di overflow, allineamento o grandezza dei pulsanti su schermi stretti (320-375px).

- **Build e lint** (`npm run build`, `npm run lint`) prima di ogni push. Ci sono 3 errori e 1 warning pre-esistenti (`react-hooks/set-state-in-effect`, `react-hooks/exhaustive-deps`) non legati alle modifiche di questa sessione: non è necessario risolverli, ma nessuna modifica dovrebbe aggiungerne di nuovi.

- **Quando si rimuove un elemento UI, controllare cosa resta intorno.** Togliere un pulsante/link/tab può lasciare un contenitore vuoto (es. una barra con `background`/`border-radius` ma senza figli) che si vede comunque a schermo come un elemento "che stona" — una riga o un blocco colorato senza contenuto. Prima di considerare finita una rimozione, verificare con uno screenshot Playwright che non sia rimasto un contenitore orfano da nascondere/eliminare a sua volta, così da non doverlo sistemare in un secondo passaggio.

- **Ogni pulsante deve portare davvero da qualche parte.** Quando si tocca una schermata (nuova feature o modifica), controllare anche i pulsanti già presenti nella stessa vista: se uno chiama `setView(...)` senza impostare lo stato che la vista di destinazione richiede (es. `activeBusiness`), o se è un doppione di un altro pulsante che fa la stessa cosa ma correttamente, va sistemato o tolto subito, non lasciato per dopo — non aspettare che sia l'utente a segnalarlo.

- **La schermata iniziale deve essere quella giusta per il ruolo di chi arriva.** Dopo login o ripristino sessione, non basta una vista di default unica per tutti: un admin non gestisce di norma attività proprie, quindi non deve atterrare sulla schermata pensata per un operatore normale (es. "Le tue attività", vuota e con pulsanti fuori contesto) — va portato subito sulla vista più utile per lui (es. il pannello Admin con la lista di tutte le attività). Quando si aggiunge un ruolo o una vista, chiedersi "dove atterra ciascun tipo di utente appena entra?", non solo "cosa vede se ci clicca sopra?".
