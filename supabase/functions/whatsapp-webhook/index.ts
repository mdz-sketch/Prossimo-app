// DEBUG TEMPORANEO: riceve i callback di stato di Meta (WhatsApp Cloud API)
// per un messaggio inviato -- sent/delivered/read/failed, con l'eventuale
// motivo dell'errore. La risposta sincrona di /messages (200 + id) dice
// solo che Meta ha ACCETTATO il messaggio, non che sia arrivato: per
// scoprire cosa succede dopo serve questo webhook, l'unico canale con cui
// Meta comunica lo stato reale. Va rimosso una volta risolto il problema
// di consegna WhatsApp.
//
// Configurazione su Meta for Developers -> la tua app -> WhatsApp ->
// Configuration -> Webhook:
// - Callback URL: l'URL di questa function una volta deployata
// - Verify token: vedi VERIFY_TOKEN sotto
// - Iscriviti al campo "messages"
//
// verify_jwt disabilitato: Meta chiama questo endpoint direttamente senza
// header di autenticazione nostri, l'autenticazione e' il verify token
// nella handshake GET iniziale.

import { createClient } from "npm:@supabase/supabase-js@2";

const VERIFY_TOKEN = "prossimo_wh_9f3a7c2e1b";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const payload = await req.json();
    await supabase.from("debug_notifiche_log").insert({
      canale: "whatsapp-webhook",
      telefono: "",
      http_status: null,
      corpo_risposta: JSON.stringify(payload),
    });
    return new Response("ok", { status: 200 });
  }

  return new Response("ok", { status: 200 });
});
