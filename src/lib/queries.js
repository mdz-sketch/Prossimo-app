// src/lib/queries.js
// -----------------------------------------------------------------------
// Esempi di come le azioni del prototipo (prendi numero, avanti, richiama,
// non presente, ricerca admin) diventano vere chiamate a Supabase.
// -----------------------------------------------------------------------

import { supabase } from "./supabaseClient";

// --- Cliente: prende un numero -----------------------------------------
export async function prendiNumero(businessId) {
  const { data: nextNumber, error } = await supabase.rpc("prendi_numero_atomico", {
    business_id_input: businessId,
  });
  if (error) throw error;

  return nextNumber;
}

// --- Operatore: avanti ---------------------------------------------------
export async function avanti(businessId) {
  const { data, error } = await supabase.rpc("avanza_numero_atomico", {
    business_id_input: businessId,
  });
  if (error) throw error;
  return data;
}

// --- Operatore: richiama (torna indietro di un numero) -------------------
export async function richiama(businessId) {
  const { data, error } = await supabase.rpc("richiama_numero_atomico", {
    business_id_input: businessId,
  });
  if (error) throw error;
  return data;
}

// --- Operatore: non presente ---------------------------------------------
export async function nonPresente(businessId) {
  const { data, error } = await supabase.rpc("non_presente_atomico", {
    business_id_input: businessId,
  });
  if (error) throw error;
  return data;
}

// --- Statistiche: conteggi + attesa media per periodo (pagina Statistiche) --
function dataInizioPeriodo(periodo) {
  const now = new Date();
  if (periodo === "giorno") return new Date(now.setHours(0, 0, 0, 0));
  if (periodo === "settimana") {
    const giorno = now.getDay() === 0 ? 7 : now.getDay();
    const lunedi = new Date(now);
    lunedi.setDate(now.getDate() - giorno + 1);
    lunedi.setHours(0, 0, 0, 0);
    return lunedi;
  }
  if (periodo === "mese") return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getFullYear(), 0, 1);
}

export async function statisticheComplete(businessId, periodo) {
  const from = dataInizioPeriodo(periodo).toISOString();

  const { count: serviti } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "servito")
    .gte("created_at", from);

  const { count: nonPresentati } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "non_presentato")
    .gte("created_at", from);

  const { data: ticketServiti } = await supabase
    .from("tickets")
    .select("created_at, served_at")
    .eq("business_id", businessId)
    .eq("status", "servito")
    .not("served_at", "is", null)
    .gte("created_at", from);

  let attesaMedia = 0;
  if (ticketServiti && ticketServiti.length > 0) {
    const totaleMinuti = ticketServiti.reduce((acc, t) => {
      const diffMs = new Date(t.served_at) - new Date(t.created_at);
      return acc + diffMs / 60000;
    }, 0);
    attesaMedia = Math.round(totaleMinuti / ticketServiti.length);
  }

  return {
    serviti: serviti || 0,
    nonPresentati: nonPresentati || 0,
    attesaMedia,
  };
}

// --- Statistiche: conteggi per periodo ------------------------------------
export async function statisticheServiti(businessId, periodo) {
  const now = new Date();
  let from;
  if (periodo === "giorno") from = new Date(now.setHours(0, 0, 0, 0));
  else if (periodo === "mese") from = new Date(now.getFullYear(), now.getMonth(), 1);
  else from = new Date(now.getFullYear(), 0, 1);

  const { count, error } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "servito")
    .gte("created_at", from.toISOString());
  if (error) throw error;
  return count;
}
// --- Operatore: le mie attivita' -----------------------------------------
export async function mieAttivita(ownerId) {
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", ownerId);
  if (error) throw error;
  return data;
}
export async function eliminaAttivita(businessId) {
  const { error } = await supabase
    .from("businesses")
    .delete()
    .eq("id", businessId);
  if (error) throw error;
}
// --- Admin: ricerca attività su tutti i campi -----------------------------
export async function cercaAttivita(query) {
  if (!query.trim()) {
    const { data, error } = await supabase.from("businesses").select("*");
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .or(
      `name.ilike.%${query}%,address.ilike.%${query}%,type.ilike.%${query}%,slug.ilike.%${query}%`
    );
  if (error) throw error;
  return data;
}

// --- Realtime: iscriviti agli aggiornamenti di un'attività ----------------
export function ascoltaAggiornamenti(businessId, callback) {
  const channel = supabase
    .channel(`business-${businessId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "businesses", filter: `id=eq.${businessId}` },
      (payload) => callback(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}