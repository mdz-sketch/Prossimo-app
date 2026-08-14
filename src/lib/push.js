// Sottoscrizione alle notifiche push vere (Web Push standard): funzionano
// anche ad app chiusa, se installata come PWA (vedi public/sw.js per la
// ricezione lato service worker).

import { supabase } from "./supabaseClient";

// Chiave pubblica VAPID: e' pensata per essere pubblica, il browser la usa
// per verificare che le push in arrivo vengano davvero dal nostro server.
// La chiave privata corrispondente vive solo nei secrets della Edge
// Function send-push, mai nel codice frontend.
const VAPID_PUBLIC_KEY = "BO1zj2_MSEyX_wdA13UBCoIfk_m_DGZX6beZcC9KtKM98ZOawnaz9LHJlRFuZ2_KOKKQy45jpxPTtnCeOOX_Mpw";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// businessId + (userId oppure ticketNumber, mai entrambi): vedi il vincolo
// push_subscriptions_tipo_valido nella migration.
export async function sottoscriviPush({ businessId, userId, ticketNumber }) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Il tuo browser non supporta le notifiche push.");
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const { endpoint, keys } = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").insert({
    business_id: businessId,
    user_id: userId ?? null,
    ticket_number: ticketNumber ?? null,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });
  // Sottoscrizione gia' salvata in precedenza (stesso endpoint): va bene,
  // non e' un errore da mostrare all'utente.
  if (error && error.code !== "23505") throw error;
}
