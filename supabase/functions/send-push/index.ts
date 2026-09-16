// Riceve il payload di un Database Webhook su UPDATE di "businesses" o di
// "reparti" e invia le notifiche push vere (Web Push standard: funzionano
// anche ad app chiusa, se installata come PWA) e/o SMS (Twilio, se
// configurato) quando:
// 1) la coda supera la soglia impostata dal titolare (soglia_coda,
//    solo a livello di attivita': i reparti non hanno una soglia propria);
// 2) un cliente arriva a 3 numeri o meno dal proprio turno ("manca poco",
//    una volta sola: la sottoscrizione resta viva, solo segnata);
// 3) e' esattamente il turno del cliente (ticket_number == current, o
//    chiamata_prioritaria per una chiamata fuori ordine): qui la
//    sottoscrizione ha finito il suo lavoro e viene eliminata.
//
// Reparti (code multiple all'interno della stessa attivita', vedi
// 20260908030000_reparti.sql): ciascun reparto ha la propria numerazione
// indipendente (reparti.current/last_issued), quindi il payload del
// webhook per un aggiornamento di "reparti" ha una forma diversa da
// quello di "businesses" (niente soglia_coda/sms_abilitato/nome -- questi
// restano scelte a livello di attivita', non ancora per singolo reparto).
// Si riconosce dalla presenza di business_id nel record (le righe di
// "businesses" non hanno questo campo).
//
// Configurazione richiesta una tantum, da Supabase -> Edge Functions ->
// send-push -> Secrets:
// - VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (generate insieme al codice
//   frontend: la chiave pubblica e' anche in src/lib/push.js. Non
//   rigenerarle dopo il primo deploy, invaliderebbe tutte le
//   sottoscrizioni gia' salvate).
// - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (solo se si
//   vuole anche l'SMS: senza queste l'invio SMS viene saltato in
//   silenzio, il push continua a funzionare comunque). L'SMS al cliente
//   va comunque abilitato per-attivita' dal titolare (businesses.
//   sms_abilitato), quindi non parte mai per un'attivita' che non l'ha
//   attivato esplicitamente. Non ancora disponibile per i reparti (stesso
//   ambito v1 della migration reparti).
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono gia' disponibili di
// default in ogni Edge Function Supabase, non serve impostarle a mano.
//
// I webhook che chiamano questa function vanno configurati a parte dalla
// dashboard (Database -> Webhooks): tabelle "businesses" e "reparti",
// evento UPDATE, stessa destinazione (l'URL di questa function una volta
// deployata) per entrambi -- oppure, se il progetto usa il trigger SQL di
// 20260814010000_trigger_push_via_sql.sql, la migration
// 20260916000000_push_reparti_e_chiamata_prioritaria.sql aggiunge gia' lo
// stesso trigger anche su "reparti", nessuna azione extra richiesta.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
webpush.setVapidDetails("mailto:info@prossimo.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER");

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SOGLIA_AVVISO_CLIENTE = 3;

async function invia(sub: { id: string; endpoint: string; p256dh: string; auth: string }, payload: unknown) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
  } catch (err) {
    // Sottoscrizione scaduta/revocata: la rimuoviamo, altrimenti
    // riproveremmo invano ad ogni futuro avanzamento della coda.
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 410 || statusCode === 404) {
      await supabase.from("push_subscriptions").delete().eq("id", sub.id);
    } else {
      console.error("Invio push fallito:", err);
    }
  }
}

// Chiamata REST diretta all'API di Twilio (nessun SDK: piu' semplice da
// far girare su Deno). Se le secrets non sono configurate, salta senza
// errori -- il resto della function (push) deve continuare a funzionare
// anche per chi non ha mai configurato l'SMS.
async function inviaSms(telefono: string, corpo: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) return;
  try {
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const body = new URLSearchParams({ To: telefono, From: TWILIO_FROM_NUMBER, Body: corpo });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );
    if (!res.ok) {
      console.error("Invio SMS fallito:", await res.text());
    }
  } catch (err) {
    console.error("Invio SMS fallito:", err);
  }
}

// --- Aggiornamento di un reparto: solo "manca poco" / "e' il tuo turno"
// al cliente, filtrati per reparto_id (numerazione indipendente per
// reparto, vedi sopra). Niente soglia coda/SMS: fuori dall'ambito v1.
async function gestisciAggiornamentoReparto(record: Record<string, unknown>) {
  const repartoId = record.id as string;
  const businessId = record.business_id as string;
  const current = (record.current as number) ?? 0;

  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .single();
  const nome = business?.name ?? "";

  const { data: subsVicino } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("reparto_id", repartoId)
    .not("ticket_number", "is", null)
    .gt("ticket_number", current)
    .lte("ticket_number", current + SOGLIA_AVVISO_CLIENTE)
    .eq("avviso_vicino_inviato", false);

  for (const sub of subsVicino ?? []) {
    const posizione = sub.ticket_number - current - 1;
    await invia(sub, {
      title: `${nome}: manca poco!`,
      body: posizione <= 0
        ? "Tocca a te tra pochissimo, preparati."
        : `Mancano solo ${posizione} numeri prima del tuo turno.`,
      url: "/",
    });
    await supabase.from("push_subscriptions").update({ avviso_vicino_inviato: true }).eq("id", sub.id);
  }

  const { data: subsTurno } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("reparto_id", repartoId)
    .eq("ticket_number", current);

  for (const sub of subsTurno ?? []) {
    await invia(sub, {
      title: `${nome}: tocca a te!`,
      body: "È il tuo turno, vai alla cassa.",
      url: "/",
    });
    await supabase.from("push_subscriptions").delete().eq("id", sub.id);
  }
}

Deno.serve(async (req) => {
  const { record, old_record } = await req.json();
  if (!record || !old_record) return new Response("ok", { status: 200 });

  // Le righe di "reparti" hanno business_id, quelle di "businesses" no:
  // basta per distinguere quale tabella ha generato l'update.
  if (record.business_id != null) {
    await gestisciAggiornamentoReparto(record);
    return new Response("ok", { status: 200 });
  }

  const businessId = record.id;
  const current = record.current ?? 0;
  const lastIssued = record.last_issued ?? 0;
  const oldCurrent = old_record.current ?? 0;
  const oldLastIssued = old_record.last_issued ?? 0;

  // --- 1) Avviso coda lunga per titolare/staff (solo soglia sul numero in
  // coda: la soglia sull'attesa stimata resta per ora solo lato client,
  // richiederebbe qui una query aggiuntiva sullo storico dei ticket). ------
  if (record.soglia_coda != null) {
    const inCodaPrima = Math.max(oldLastIssued - oldCurrent, 0);
    const inCodaOra = Math.max(lastIssued - current, 0);
    const superataPrima = inCodaPrima > record.soglia_coda;
    const superataOra = inCodaOra > record.soglia_coda;

    if (superataOra && !superataPrima) {
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("business_id", businessId)
        .not("user_id", "is", null);

      for (const sub of subs ?? []) {
        await invia(sub, {
          title: `${record.name}: coda lunga`,
          body: `${inCodaOra} persone in coda (soglia: ${record.soglia_coda})`,
          url: "/",
        });
      }
    }
  }

  // --- 2) Push al cliente: mancano pochi numeri (una volta sola, non si
  // elimina la sottoscrizione: serve ancora per il punto 3 qui sotto).
  // reparto_id nullo: solo i clienti senza reparto (coda unica), quelli
  // di un reparto sono gestiti da gestisciAggiornamentoReparto sopra. ------
  const { data: subsVicino } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("business_id", businessId)
    .is("reparto_id", null)
    .not("ticket_number", "is", null)
    .gt("ticket_number", current)
    .lte("ticket_number", current + SOGLIA_AVVISO_CLIENTE)
    .eq("avviso_vicino_inviato", false);

  for (const sub of subsVicino ?? []) {
    const posizione = sub.ticket_number - current - 1;
    await invia(sub, {
      title: `${record.name}: manca poco!`,
      body: posizione <= 0
        ? "Tocca a te tra pochissimo, preparati."
        : `Mancano solo ${posizione} numeri prima del tuo turno.`,
      url: "/",
    });
    await supabase.from("push_subscriptions").update({ avviso_vicino_inviato: true }).eq("id", sub.id);
  }

  // --- 3) Push al cliente: e' il suo turno ---------------------------------
  const { data: subsTurno } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("business_id", businessId)
    .is("reparto_id", null)
    .eq("ticket_number", current);

  for (const sub of subsTurno ?? []) {
    await invia(sub, {
      title: `${record.name}: tocca a te!`,
      body: "È il tuo turno, vai alla cassa.",
      url: "/",
    });
    // Qui la sottoscrizione ha finito il suo lavoro: si elimina.
    await supabase.from("push_subscriptions").delete().eq("id", sub.id);
  }

  // --- 3b) Push al cliente: chiamata prioritaria (fuori ordine). Non
  // sposta "current" (vedi 20260908020000_chiamata_prioritaria.sql), quindi
  // senza questo blocco il punto 3 sopra non lo intercetta mai: il
  // controllo su "distinct from old" evita di reinviare ad ogni update
  // (es. quando annulla_prioritario la azzera di nuovo a null). ------------
  if (record.chiamata_prioritaria != null && record.chiamata_prioritaria !== old_record.chiamata_prioritaria) {
    const { data: subsPrioritari } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("business_id", businessId)
      .is("reparto_id", null)
      .eq("ticket_number", record.chiamata_prioritaria);

    for (const sub of subsPrioritari ?? []) {
      await invia(sub, {
        title: `${record.name}: tocca a te!`,
        body: "Sei stato chiamato con priorita', vai alla cassa.",
        url: "/",
      });
      await supabase.from("push_subscriptions").delete().eq("id", sub.id);
    }
  }

  // --- 4) SMS al cliente: mancano pochi numeri (stessa logica del push,
  // tabella separata perche' sms_notifiche non richiede permessi/gesture
  // del browser, solo un numero di telefono). -------------------------------
  if (record.sms_abilitato) {
    const { data: smsVicino } = await supabase
      .from("sms_notifiche")
      .select("*")
      .eq("business_id", businessId)
      .gt("ticket_number", current)
      .lte("ticket_number", current + SOGLIA_AVVISO_CLIENTE)
      .eq("avviso_vicino_inviato", false);

    for (const sms of smsVicino ?? []) {
      const posizione = sms.ticket_number - current - 1;
      await inviaSms(
        sms.telefono,
        `${record.name}: ${posizione <= 0 ? "tocca a te tra pochissimo, preparati." : `mancano solo ${posizione} numeri prima del tuo turno.`}`
      );
      await supabase.from("sms_notifiche").update({ avviso_vicino_inviato: true }).eq("id", sms.id);
    }

    // --- 5) SMS al cliente: e' il suo turno ---------------------------------
    const { data: smsTurno } = await supabase
      .from("sms_notifiche")
      .select("*")
      .eq("business_id", businessId)
      .eq("ticket_number", current);

    for (const sms of smsTurno ?? []) {
      await inviaSms(sms.telefono, `${record.name}: e' il tuo turno, vai alla cassa.`);
      await supabase.from("sms_notifiche").delete().eq("id", sms.id);
    }

    // --- 5b) SMS al cliente: chiamata prioritaria (fuori ordine), stesso
    // motivo del punto 3b sopra. ---------------------------------------------
    if (record.chiamata_prioritaria != null && record.chiamata_prioritaria !== old_record.chiamata_prioritaria) {
      const { data: smsPrioritari } = await supabase
        .from("sms_notifiche")
        .select("*")
        .eq("business_id", businessId)
        .eq("ticket_number", record.chiamata_prioritaria);

      for (const sms of smsPrioritari ?? []) {
        await inviaSms(sms.telefono, `${record.name}: sei stato chiamato con priorita', vai alla cassa.`);
        await supabase.from("sms_notifiche").delete().eq("id", sms.id);
      }
    }
  }

  return new Response("ok", { status: 200 });
});
