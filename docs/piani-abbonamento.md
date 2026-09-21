# Piani di abbonamento Prossimo

Spec decisa il 2026-09-21, confrontata con Qminder e Waitwhile (Waitwhile è
il comparabile vero: piccoli negozi/saloni, non enterprise come Qminder).
Questo file esiste per non perdere le decisioni tra una sessione e l'altra
e per essere la fonte di verità quando si scriverà la landing page/sito e
quando si implementerà il gating lato codice.

## Gratis — €0/mese

- 1 attività, coda singola (niente reparti)
- Accesso cliente via QR code
- Schermo per chiamare i numeri
- Notifiche push browser (gratis, nessun costo di invio)
- Pannello operatore: Avanti / Richiama / Assente
- Statistiche: **profondità 12 mesi**, solo visualizzazione (niente export)
- Add-on opzionale **+€5/mese**: sblocca l'export Excel/PDF delle
  statistiche (stessa profondità di 12 mesi del piano Gratis — non
  aggiunge profondità, solo la possibilità di esportare)
- 1 solo operatore (il titolare)

## Pro — €14,90/mese

Tutto il Gratis, con export incluso nel prezzo (l'add-on €5 non serve su
questo piano), più:

- Reparti multipli (code indipendenti per reparto/sportello)
- Chiamata prioritaria (far passare un numero fuori ordine)
- Prenotazioni
- Staff multipli (inviti operatori via codice, ruoli owner/staff)
- Feedback post-servizio (1-5 stelle + commenti) con redirect automatico
  a Google Recensioni per chi lascia 4-5 stelle
- Statistiche: **profondità 24 mesi**, export incluso

## Business — €24,90/mese + crediti SMS/WhatsApp a consumo

Tutto il Pro, più:

- SMS al cliente ("è il tuo turno" via SMS)
- WhatsApp al cliente (stesso avviso via WhatsApp)
- Statistiche: **nessun limite di profondità** (storico completo), export
  incluso
- Supporto prioritario

SMS/WhatsApp restano sempre a consumo (pacchetti di crediti, es. 100/300/
1000 messaggi, prezzo per messaggio sopra il costo reale Twilio/Meta) e
mai inclusi flat in nessun piano — stessa scelta di Qminder e Waitwhile,
entrambi tengono la messaggistica separata dall'abbonamento.

## Principi guida per l'implementazione

- **Non cancellare mai dati storici per cambio piano o downgrade.** Solo
  la profondità di navigazione/export nelle Statistiche cambia in base al
  piano attivo al momento — mai i dati salvati. Chi fa downgrade da
  Business a Gratis vede solo gli ultimi 12 mesi ma la cronologia
  precedente resta nel database, pronta a riapparire con un upgrade.
- Le tab "Giorno / Settimana / Mese / Anno" con navigazione a periodi
  (`statsPeriodPage`/`statsOffset` in `src/App.jsx`) esistono già: il
  gating per profondità si implementa limitando quanto indietro può
  andare `statsOffset` in base al piano, non costruendo nuove viste.
- Serve un campo piano su `businesses` (non esiste ancora) per sapere
  quale profondità/export applicare.
- Da riprendere quando si costruisce la landing page/sito: questa
  struttura a 3 piani (Gratis/Pro/Business) + add-on export è la fonte
  di verità per nomi, prezzi e elenco funzioni da mostrare.
