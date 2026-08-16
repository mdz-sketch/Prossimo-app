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

// --- Numerazione giornaliera: quanti numeri erano gia' stati emessi prima
// di oggi (es. 1827), cosi' la UI puo' mostrare solo i numeri di oggi
// (es. 37) sottraendo questa base da "current"/"last_issued"/il proprio
// ticket, senza toccare la numerazione reale salvata nel database. ------
export async function numeroBaseOggi(businessId) {
  const oggiInizio = new Date();
  oggiInizio.setHours(0, 0, 0, 0);

  // Ordina per "number" (non per created_at): sono normalmente coerenti,
  // ma se una fonte esterna avesse inserito ticket fuori ordine cronologico
  // il numero più alto resta comunque la base corretta da sottrarre.
  const { data, error } = await supabase
    .from("tickets")
    .select("number")
    .eq("business_id", businessId)
    .lt("created_at", oggiInizio.toISOString())
    .order("number", { ascending: false })
    .limit(1);
  if (error) throw error;

  return data && data.length > 0 ? data[0].number : 0;
}

// --- Statistiche: conteggi + attesa media per periodo (pagina Statistiche) --
// offset conta i periodi indietro/avanti rispetto a quello corrente
// (0 = oggi/questa settimana/questo mese/quest'anno, -1 = il precedente, ecc.)
function dataInizioPeriodo(periodo, offset = 0) {
  const now = new Date();
  if (periodo === "giorno") {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (periodo === "settimana") {
    const giorno = now.getDay() === 0 ? 7 : now.getDay();
    const lunedi = new Date(now);
    lunedi.setDate(now.getDate() - giorno + 1 + offset * 7);
    lunedi.setHours(0, 0, 0, 0);
    return lunedi;
  }
  if (periodo === "mese") return new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return new Date(now.getFullYear() + offset, 0, 1);
}

// Confine superiore (esclusivo) dello stesso periodo: inizio del periodo successivo.
function dataFinePeriodo(periodo, offset = 0) {
  return dataInizioPeriodo(periodo, offset + 1);
}

// Etichetta leggibile del periodo mostrato, per le frecce di navigazione.
export function etichettaPeriodo(periodo, offset = 0) {
  const now = new Date();
  if (periodo === "giorno") {
    if (offset === 0) return "Oggi";
    if (offset === -1) return "Ieri";
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  }
  if (periodo === "settimana") {
    if (offset === 0) return "Questa settimana";
    const inizio = dataInizioPeriodo("settimana", offset);
    const fine = new Date(inizio);
    fine.setDate(inizio.getDate() + 6);
    return `${inizio.getDate()}–${fine.getDate()} ${fine.toLocaleDateString("it-IT", { month: "short" })}`;
  }
  if (periodo === "mese") {
    if (offset === 0) return "Questo mese";
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  }
  if (offset === 0) return "Quest'anno";
  return String(now.getFullYear() + offset);
}

export async function statisticheComplete(businessId, periodo, offset = 0) {
  const from = dataInizioPeriodo(periodo, offset).toISOString();
  const to = dataFinePeriodo(periodo, offset).toISOString();

  const { count: serviti } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "servito")
    .gte("created_at", from)
    .lt("created_at", to);

  const { count: nonPresentati } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "non_presentato")
    .gte("created_at", from)
    .lt("created_at", to);

  const { data: ticketServiti } = await supabase
    .from("tickets")
    .select("created_at, served_at")
    .eq("business_id", businessId)
    .eq("status", "servito")
    .not("served_at", "is", null)
    .gte("created_at", from)
    .lt("created_at", to);

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

// --- Statistiche: andamento reale per il grafico (serviti / non presentati /
// attesa media per fascia oraria, giorno della settimana, giorno del mese o mese) --
// oraApertura/oraChiusura sono la fascia oraria configurata sull'attivita'
// (default 9-20 per compatibilita' con le attivita' create prima di questo campo).
function bucketPerPeriodo(periodo, offset = 0, oraApertura = 9, oraChiusura = 20) {
  if (periodo === "giorno") {
    const labels = [];
    for (let h = oraApertura; h <= oraChiusura; h++) labels.push(String(h));
    return { labels, indiceDi: (d) => labels.indexOf(String(d.getHours())) };
  }
  if (periodo === "settimana") {
    const labels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
    return { labels, indiceDi: (d) => { const g = d.getDay(); return g === 0 ? 6 : g - 1; } };
  }
  if (periodo === "mese") {
    const meseTarget = dataInizioPeriodo("mese", offset);
    const giorniInMese = new Date(meseTarget.getFullYear(), meseTarget.getMonth() + 1, 0).getDate();
    const labels = Array.from({ length: giorniInMese }, (_, i) => String(i + 1));
    return { labels, indiceDi: (d) => { const g = d.getDate(); return g >= 1 && g <= giorniInMese ? g - 1 : -1; } };
  }
  const labels = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  return { labels, indiceDi: (d) => d.getMonth() };
}

export async function andamentoPeriodo(businessId, periodo, offset = 0, oraApertura = 9, oraChiusura = 20) {
  const from = dataInizioPeriodo(periodo, offset).toISOString();
  const to = dataFinePeriodo(periodo, offset).toISOString();

  const { data, error } = await supabase
    .from("tickets")
    .select("status, created_at, served_at")
    .eq("business_id", businessId)
    .gte("created_at", from)
    .lt("created_at", to);
  if (error) throw error;

  const { labels, indiceDi } = bucketPerPeriodo(periodo, offset, oraApertura, oraChiusura);
  const serviti = labels.map(() => 0);
  const nonPresentati = labels.map(() => 0);
  const sommaAttesaMin = labels.map(() => 0);
  const conteggioAttesa = labels.map(() => 0);

  data.forEach((t) => {
    const idx = indiceDi(new Date(t.created_at));
    if (idx === -1 || idx === undefined) return;
    if (t.status === "servito") {
      serviti[idx]++;
      if (t.served_at) {
        sommaAttesaMin[idx] += (new Date(t.served_at) - new Date(t.created_at)) / 60000;
        conteggioAttesa[idx]++;
      }
    } else if (t.status === "non_presentato") {
      nonPresentati[idx]++;
    }
  });

  const attesaMedia = labels.map((_, i) => (conteggioAttesa[i] ? Math.round(sommaAttesaMin[i] / conteggioAttesa[i]) : 0));

  return { labels, serviti, nonPresentati, attesaMedia };
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
// --- Operatore: le mie attivita' (possedute + quelle a cui si e' stati
// invitati come staff) -----------------------------------------------------
export async function mieAttivita(userId) {
  const { data: possedute, error: errPossedute } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", userId);
  if (errPossedute) throw errPossedute;

  const { data: staffRows, error: errStaff } = await supabase
    .from("business_staff")
    .select("business_id")
    .eq("user_id", userId);
  if (errStaff) throw errStaff;

  const idAssegnati = (staffRows || []).map((r) => r.business_id);
  let assegnate = [];
  if (idAssegnati.length > 0) {
    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .in("id", idAssegnati);
    if (error) throw error;
    assegnate = data;
  }

  return [
    ...possedute.map((b) => ({ ...b, ruolo: "proprietario" })),
    ...assegnate.map((b) => ({ ...b, ruolo: "operatore" })),
  ];
}

// --- Operatore: entra in un'attivita' tramite codice invito ---------------
// La validazione del codice e l'insert su business_staff avvengono insieme,
// dentro la funzione RPC (SECURITY DEFINER): l'insert diretto dal client su
// business_staff e' bloccato dalla RLS, quindi questo e' l'unico modo di
// entrare a far parte dello staff di un'attivita'.
export async function unisciAttivita(inviteCode) {
  const { data, error } = await supabase.rpc("unisciti_con_invito", {
    codice_input: inviteCode.trim(),
  });
  if (error) throw new Error(error.message);
  return data;
}

// --- Proprietario: elenco staff e rimozione -------------------------------
export async function staffDiAttivita(businessId) {
  const { data, error } = await supabase.rpc("staff_di_attivita", {
    business_id_input: businessId,
  });
  if (error) throw error;
  return data;
}

export async function rimuoviStaff(businessId, userId) {
  const { error } = await supabase
    .from("business_staff")
    .delete()
    .eq("business_id", businessId)
    .eq("user_id", userId);
  if (error) throw error;
}

// --- Statistiche: serviti/non presentati per operatore, per periodo -------
export async function statistichePerOperatore(businessId, periodo, offset = 0) {
  const from = dataInizioPeriodo(periodo, offset).toISOString();
  const to = dataFinePeriodo(periodo, offset).toISOString();
  const { data, error } = await supabase.rpc("statistiche_per_operatore", {
    business_id_input: businessId,
    da: from,
    a: to,
  });
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

// --- Admin: lista di tutti gli utenti registrati --------------------------
export async function listaUtentiAdmin(query = "") {
  const { data, error } = await supabase.rpc("admin_lista_utenti", { cerca: query });
  if (error) throw error;
  return data;
}

export async function modificaEmailUtenteAdmin(userId, nuovaEmail) {
  const { error } = await supabase.rpc("admin_modifica_email_utente", {
    user_id_input: userId,
    nuova_email: nuovaEmail,
  });
  if (error) throw error;
}

export async function eliminaUtenteAdmin(userId) {
  const { error } = await supabase.rpc("admin_elimina_utente", { user_id_input: userId });
  if (error) throw error;
}

// --- Schermo pubblico per i clienti (nessun login) -------------------------
export async function schermoPubblico(slug) {
  const { data, error } = await supabase.rpc("schermo_pubblico", { slug_input: slug });
  if (error) throw error;
  return data?.[0] ?? null;
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