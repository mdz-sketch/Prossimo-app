// Crea una Stripe Checkout Session per far passare un'attivita' al piano
// Pro o Business. Il frontend chiama questa function (autenticato) e
// reindirizza il browser all'url restituito -- pagina di pagamento
// ospitata da Stripe, non tocchiamo mai i dati della carta.
//
// Configurazione richiesta, Supabase -> Edge Functions -> Secrets:
// - STRIPE_SECRET_KEY
//
// verify_jwt DISABILITATO a livello piattaforma: con verify_jwt attivo,
// Supabase blocca anche la richiesta preflight OPTIONS del browser (non
// porta l'header Authorization) prima ancora che arrivi a questo codice
// -- effetto "clicco e non succede niente", nessun errore visibile.
// L'autenticazione la si fa qui sotto a mano (auth.getUser sul token
// ricevuto), e si verifica anche che chi chiama sia proprio il
// proprietario dell'attivita' richiesta (altrimenti chiunque autenticato
// potrebbe avviare un checkout -- e a fine pagamento il webhook -- per
// l'attivita' di qualcun altro).

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const PRICE_ID: Record<string, string> = {
  pro: "price_1UIApyGobISDxDjflkn7xTP3",
  business: "price_1UIApyGobISDxDjfLsxlTZ83",
};

// A differenza delle altre edge function di questo progetto (chiamate
// server-to-server da un webhook), questa la chiama direttamente il
// browser: senza header CORS il preflight OPTIONS fallisce e la
// richiesta non parte nemmeno, con l'effetto "clicco e non succede
// niente" (nessun errore visibile, il fetch non arriva neanche a
// eseguirsi).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  const jsonHeaders = { ...CORS_HEADERS, "Content-Type": "application/json" };
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), { status: 401, headers: jsonHeaders });
    }

    const { businessId, piano, successUrl, cancelUrl } = await req.json();
    if (!businessId || !piano || !PRICE_ID[piano]) {
      return new Response(JSON.stringify({ error: "Parametri mancanti o piano non valido" }), { status: 400, headers: jsonHeaders });
    }

    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .select("id, name, owner_id, stripe_customer_id")
      .eq("id", businessId)
      .single();
    if (bizErr || !business) {
      return new Response(JSON.stringify({ error: "Attivita' non trovata" }), { status: 404, headers: jsonHeaders });
    }
    if (business.owner_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "Non sei il proprietario di questa attivita'" }), { status: 403, headers: jsonHeaders });
    }

    let customerId = business.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.user.email,
        name: business.name,
        metadata: { business_id: businessId },
      });
      customerId = customer.id;
      await supabase.from("businesses").update({ stripe_customer_id: customerId }).eq("id", businessId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: PRICE_ID[piano], quantity: 1 }],
      subscription_data: { metadata: { business_id: businessId } },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return new Response(JSON.stringify({ url: session.url }), { headers: jsonHeaders });
  } catch (err) {
    console.error("Errore creazione checkout:", err);
    return new Response(JSON.stringify({ error: "Errore interno" }), { status: 500, headers: jsonHeaders });
  }
});
