// Riceve il payload di un Database Webhook su UPDATE di "businesses" e
// invia le notifiche push vere (Web Push standard: funzionano anche ad
// app chiusa, se installata come PWA) quando:
// 1) la coda supera la soglia impostata dal titolare (soglia_coda);
// 2) un cliente arriva a 3 numeri o meno dal proprio turno ("manca poco",
//    una volta sola: la sottoscrizione resta viva, solo segnata);
// 3) e' esattamente il turno del cliente (ticket_number == current):
//    qui la sottoscrizione ha finito il suo lavoro e viene eliminata.
//
// Configurazione richiesta una tantum, da Supabase -> Edge Functions ->
// send-push -> Secrets:
// - VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (generate insieme al codice
//   frontend: la chiave pubblica e' anche in src/lib/push.js. Non
//   rigenerarle dopo il primo deploy, invaliderebbe tutte le
//   sottoscrizioni gia' salvate).
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono gia' disponibili di
// default in ogni Edge Function Supabase, non serve impostarle a mano.
//
// Il webhook che chiama questa function va configurato a parte dalla
// dashboard (Database -> Webhooks): tabella "businesses", evento UPDATE,
// destinazione l'URL di questa function una volta deployata.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
webpush.setVapidDetails("mailto:info@prossimo.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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

Deno.serve(async (req) => {
  const { record, old_record } = await req.json();
  if (!record || !old_record) return new Response("ok", { status: 200 });

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

  // --- 2) Avviso al cliente: mancano pochi numeri (una volta sola, non si
  // elimina la sottoscrizione: serve ancora per il punto 3 qui sotto). ------
  const { data: subsVicino } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("business_id", businessId)
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

  // --- 3) Avviso al cliente: e' il suo turno -------------------------------
  const { data: subsTurno } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("business_id", businessId)
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

  return new Response("ok", { status: 200 });
});
