// Riceve gli eventi di Stripe sul ciclo di vita degli abbonamenti e
// aggiorna businesses.piano di conseguenza. E' l'UNICO punto che puo'
// scrivere piano/stripe_customer_id/stripe_subscription_id (vedi trigger
// blocca_modifica_piano in 20260921010000_blocca_modifica_piano_lato_client.sql
// -- usa la service role key, quindi passa il trigger).
//
// Configurazione richiesta, Supabase -> Edge Functions -> Secrets:
// - STRIPE_SECRET_KEY (stessa chiave usata da stripe-checkout)
// - STRIPE_WEBHOOK_SECRET (whsec_..., generato alla creazione del webhook
//   endpoint su Stripe -- diverso dalla secret key)
//
// verify_jwt disabilitato: Stripe chiama questo endpoint direttamente
// senza i nostri header di autenticazione, l'autenticazione e' la firma
// verificata da Stripe.webhooks.constructEventAsync qui sotto.

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Price ID (creati con stripe-setup, usa e getta) -> nome piano. Se in
// futuro si cambiano i prezzi, aggiornare qui.
const PIANO_PER_PRICE: Record<string, string> = {
  price_1UIApyGobISDxDjflkn7xTP3: "pro",
  price_1UIApyGobISDxDjfLsxlTZ83: "business",
};
const PRICE_EXPORT_ADDON = "price_1UIB8NGobISDxDjfBfQM1jp9";

async function aggiornaPianoDaSubscription(subscription: Stripe.Subscription) {
  const businessId = subscription.metadata?.business_id;
  if (!businessId) {
    console.error("Subscription senza business_id nei metadata:", subscription.id);
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  const attiva = subscription.status === "active" || subscription.status === "trialing";

  if (priceId === PRICE_EXPORT_ADDON) {
    // Add-on export (+5EUR/mese sul piano gratis): non tocca piano, solo
    // export_abilitato -- indipendente dall'eventuale abbonamento Pro/Business.
    await supabase
      .from("businesses")
      .update({
        export_abilitato: attiva,
        stripe_export_subscription_id: attiva ? subscription.id : null,
      })
      .eq("id", businessId);
    return;
  }

  if (attiva) {
    const piano = priceId ? PIANO_PER_PRICE[priceId] : undefined;
    if (!piano) {
      console.error("Price id sconosciuto sulla subscription:", priceId);
      return;
    }
    await supabase
      .from("businesses")
      .update({
        piano,
        stripe_customer_id: subscription.customer as string,
        stripe_subscription_id: subscription.id,
      })
      .eq("id", businessId);
  } else {
    // canceled, incomplete_expired, unpaid, ecc. -- si torna al gratis.
    await supabase
      .from("businesses")
      .update({ piano: "gratis", stripe_subscription_id: null })
      .eq("id", businessId);
  }
}

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature!, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Firma webhook Stripe non valida:", err);
    return new Response("Firma non valida", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        await aggiornaPianoDaSubscription(subscription);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await aggiornaPianoDaSubscription(subscription);
      break;
    }
  }

  return new Response("ok", { status: 200 });
});
