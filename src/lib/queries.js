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
  const { data: business } = await supabase
    .from("businesses")
    .select("current")
    .eq("id", businessId)
    .single();

  const nextCurrent = business.current + 1;

  await supabase.from("businesses").update({ current: nextCurrent }).eq("id", businessId);
  await supabase
    .from("tickets")
    .update({ status: "servito" })
    .eq("business_id", businessId)
    .eq("number", nextCurrent);
}

// --- Operatore: richiama (torna indietro di un numero) -------------------
export async function richiama(businessId) {
  const { data: business } = await supabase
    .from("businesses")
    .select("current")
    .eq("id", businessId)
    .single();

  if (business.current <= 0) return;
  const prevCurrent = business.current - 1;

  await supabase.from("businesses").update({ current: prevCurrent }).eq("id", businessId);
  await supabase
    .from("tickets")
    .update({ status: "in_attesa" })
    .eq("business_id", businessId)
    .eq("number", business.current);
}

// --- Operatore: non presente ---------------------------------------------
export async function nonPresente(businessId) {
  const { data: business } = await supabase
    .from("businesses")
    .select("current")
    .eq("id", businessId)
    .single();

  const nextCurrent = business.current + 1;

  await supabase.from("businesses").update({ current: nextCurrent }).eq("id", businessId);
  await supabase
    .from("tickets")
    .update({ status: "non_presentato" })
    .eq("business_id", businessId)
    .eq("number", nextCurrent);
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