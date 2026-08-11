import { useState, useRef, useEffect } from "react";
import { QrCode, ArrowRight, RotateCcw, SkipForward, X, Bell, Clock, CheckCircle2, Building2, Link2, Check, Plus, Search, BarChart3, MapPin, Tag, ChevronLeft, ChevronRight, FileSpreadsheet, FileText } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "./lib/supabaseClient";
import Login from "./components/Login";
import ImpostaNuovaPassword from "./components/ImpostaNuovaPassword";
import {
  prendiNumero as prendiNumeroSupabase,
  avanti as avantiSupabase,
  richiama as richiamaSupabase,
  nonPresente as nonPresenteSupabase,
  statisticheServiti,
  statisticheComplete,
  andamentoPeriodo,
  etichettaPeriodo,
  cercaAttivita,
  mieAttivita,
  unisciAttivita,
  eliminaAttivita,
  ascoltaAggiornamenti,
} from "./lib/queries";
import { esportaCsv, esportaPdf } from "./lib/export";

function Flap({ char }) {
  const [display, setDisplay] = useState(char);
  const [flipped, setFlipped] = useState(false);
  const prev = useRef(char);

  useEffect(() => {
    if (prev.current === char) return;
    prev.current = char;
    setFlipped(true);
    const t = setTimeout(() => {
      setDisplay(char);
      setFlipped(false);
    }, 260);
    return () => clearTimeout(t);
  }, [char]);

  return (
    <div className="flap-shell">
      <div className={"flap-card" + (flipped ? " is-flipping" : "")}>
        <span className="flap-face">{display}</span>
      </div>
      <div className="flap-hinge" />
    </div>
  );
}

function FlapNumber({ value, size = "lg" }) {
  const digits = String(value ?? 0).padStart(2, "0").split("");
  return (
    <div className={"flap-row " + size}>
      {digits.map((d, i) => (
        <Flap key={i} char={d} />
      ))}
    </div>
  );
}

function MiniBarChart({ labels, series }) {
  // Limite condiviso da tutte le serie del grafico (stessa unita' di misura),
  // cosi' le altezze delle barre restano davvero confrontabili tra loro.
  const limite = Math.max(...series.flatMap((s) => s.data), 0) + 5;
  return (
    <div>
      <div className="bar-chart">
        {labels.map((label, i) => (
          <div className="bar-col" key={i}>
            <div className="bar-group">
              {series.map((s) => (
                <div
                  key={s.name}
                  className="bar"
                  style={{
                    height: s.data[i] > 0 ? `${Math.max((s.data[i] / limite) * 100, 4)}%` : "0%",
                    background: s.color,
                  }}
                  title={`${s.name}: ${s.data[i]}`}
                />
              ))}
            </div>
            <span className="bar-lbl">{label}</span>
          </div>
        ))}
      </div>
      <div className="bar-chart-legend">
        {series.map((s) => (
          <span className="legend-item" key={s.name}>
            <span className="legend-dot" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

const ORE_GIORNO = ["9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"];

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Percentuale di non presentati sul totale di clienti gestiti (serviti +
// non presentati) — chi e' ancora in coda non conta, non ha ancora avuto
// la sua occasione di presentarsi o no.
const percentualeNonPresenti = (serviti, nonPresentati) => {
  const totale = serviti + nonPresentati;
  return totale > 0 ? Math.round((nonPresentati / totale) * 100) : 0;
};

export default function App() {
  const [view, setView] = useState("cliente");
const [currentUser, setCurrentUser] = useState(null);
  const isLoggedIn = currentUser !== null;
  // app_metadata (a differenza di user_metadata) non e' modificabile
  // dall'utente stesso: puo' essere impostato solo via SQL/dashboard con
  // permessi elevati, quindi e' l'unico posto sicuro da cui leggere il ruolo.
  const isAdmin = currentUser?.app_metadata?.role === "admin";
  const [recuperoPassword, setRecuperoPassword] = useState(false);

  // Ripristina la sessione gia' attiva (es. dopo un refresh della pagina):
  // Supabase mantiene il token in localStorage, ma senza questo lo stato
  // dell'app perdeva comunque il login ad ogni ricaricamento.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setCurrentUser(session.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecuperoPassword(true);
      }
      if (event === "SIGNED_OUT") {
        setCurrentUser(null);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);
const handleCondividi = async (business) => {
    const url = `${window.location.origin}/coda/${business.slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: business.name, text: `Prendi il tuo numero per ${business.name}`, url });
      } catch {
        // utente ha annullato la condivisione, nessun errore da mostrare
      }
    } else {
      navigator.clipboard.writeText(url);
      alert("Link copiato negli appunti!");
    }
  };
const handleCondividiInvito = async (business) => {
    const url = `${window.location.origin}/unisciti/${business.invite_code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: business.name, text: `Unisciti come operatore per ${business.name}`, url });
      } catch {
        // utente ha annullato la condivisione, nessun errore da mostrare
      }
    } else {
      navigator.clipboard.writeText(url);
      alert("Link invito copiato negli appunti!");
    }
  };
const handleElimina = async (business) => {
    const conferma = window.confirm(`Sei sicuro di voler eliminare "${business.name}"? Questa azione non può essere annullata.`);
    if (!conferma) return;
    try {
      await eliminaAttivita(business.id);
      setMieAttivitaList((prev) => prev.filter((b) => b.id !== business.id));
      setBusinesses((prev) => prev.filter((b) => b.id !== business.id));
      if (activeBusiness?.id === business.id) setActiveBusiness(null);
    } catch (err) {
      alert("Errore nell'eliminazione: " + err.message);
    }
  };
const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setView("cliente");
    setActiveBusiness(null);
    localStorage.removeItem("prossimo_active_business_id");
  };

  // Se nel browser era rimasta selezionata (via localStorage) l'attivita'
  // di un altro utente, il login non deve ereditarla: si riparte da
  // "Le mie attivita'" pulite per l'account appena entrato.
  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    if (activeBusiness && activeBusiness.owner_id !== user.id) {
      setActiveBusiness(null);
      localStorage.removeItem("prossimo_active_business_id");
    }
  };

  // Attivita' attualmente "attiva" per le viste Cliente/Operatore.
  // Viene impostata registrando una nuova attivita' o scegliendo
  // "Gestisci" da un'attivita' esistente nel pannello Admin.
  const [activeBusiness, setActiveBusiness] = useState(null);
  const [mieAttivitaList, setMieAttivitaList] = useState([]);
  const [codiceInvito, setCodiceInvito] = useState("");
  const [erroreInvito, setErroreInvito] = useState("");
  const [invitoInCorso, setInvitoInCorso] = useState(false);
  const [attivitaDaInvitare, setAttivitaDaInvitare] = useState(null);

  const ricaricaMieAttivita = () => {
    if (currentUser) mieAttivita(currentUser.id).then(setMieAttivitaList).catch(console.error);
  };

  useEffect(() => {
    if (view === "operatore" && isLoggedIn && !activeBusiness) {
      ricaricaMieAttivita();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, isLoggedIn, activeBusiness, currentUser]);

  const handleUnisciAttivita = async (e) => {
    e.preventDefault();
    if (!codiceInvito.trim()) return;
    setErroreInvito("");
    setInvitoInCorso(true);
    try {
      await unisciAttivita(codiceInvito, currentUser.id);
      setCodiceInvito("");
      ricaricaMieAttivita();
    } catch (e2) {
      setErroreInvito(e2.message);
    } finally {
      setInvitoInCorso(false);
    }
  };

  const [myTicket, setMyTicket] = useState(null);
  const [pulse, setPulse] = useState(false);
  const [servedToday, setServedToday] = useState(0);
  const [skippedToday, setSkippedToday] = useState(0);
  const [statsPeriodPage, setStatsPeriodPage] = useState("giorno");
  const [statsOffset, setStatsOffset] = useState(0);
  const [statsData, setStatsData] = useState({ serviti: 0, nonPresentati: 0, attesaMedia: 0 });
  const [avgWaitToday, setAvgWaitToday] = useState(0);
  const andamentoVuoto = { labels: ORE_GIORNO, serviti: ORE_GIORNO.map(() => 0), nonPresentati: ORE_GIORNO.map(() => 0), attesaMedia: ORE_GIORNO.map(() => 0) };
  const [andamentoGiorno, setAndamentoGiorno] = useState(andamentoVuoto);
  const [andamentoStats, setAndamentoStats] = useState(andamentoVuoto);

  const cambiaPeriodoStatistiche = (periodo) => {
    setStatsPeriodPage(periodo);
    setStatsOffset(0);
  };

  useEffect(() => {
    if (view !== "statistiche" || !activeBusiness?.id) return;
    statisticheComplete(activeBusiness.id, statsPeriodPage, statsOffset).then(setStatsData).catch(console.error);
    andamentoPeriodo(
      activeBusiness.id,
      statsPeriodPage,
      statsOffset,
      activeBusiness.ora_apertura,
      activeBusiness.ora_chiusura
    ).then(setAndamentoStats).catch(console.error);
  }, [view, activeBusiness?.id, activeBusiness?.ora_apertura, activeBusiness?.ora_chiusura, statsPeriodPage, statsOffset]);

  const [registered, setRegistered] = useState(false);
  const [businesses, setBusinesses] = useState([]);
  const [adminSearch, setAdminSearch] = useState("");
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formType, setFormType] = useState("Pizzeria");
  const [formOraApertura, setFormOraApertura] = useState(9);
  const [formOraChiusura, setFormOraChiusura] = useState(20);
  const [errore, setErrore] = useState("");

  // Finche' non ci sono ancora dati storici sufficienti (attivita' nuova,
  // nessuno ancora servito oggi), usa una stima prudente invece di "0 min".
  const avgWaitStimata = avgWaitToday > 0 ? avgWaitToday : 3;
  const current = activeBusiness?.current ?? 0;
  const lastIssued = activeBusiness?.last_issued ?? 0;
  const inCoda = Math.max(lastIssued - current, 0);
  const position = myTicket ? Math.max(myTicket - current - 1, 0) : null;
  const isMyTurn = myTicket !== null && current === myTicket;
  const giaServito = myTicket !== null && current > myTicket;
  const isNext = myTicket !== null && position === 0 && !isMyTurn && !giaServito;

  useEffect(() => {
    if (isMyTurn) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1800);
      return () => clearTimeout(t);
    }
  }, [isMyTurn]);

  // Link di invito operatore (/unisciti/<codice>): precompila il campo,
  // l'utente deve comunque essere loggato e confermare per unirsi.
  useEffect(() => {
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    if (pathParts[0] === "unisciti" && pathParts[1]) {
      setCodiceInvito(pathParts[1]);
      setView("operatore");
    }
  }, []);

  // Al primo avvio, se c'era un'attivita' scelta in precedenza, la ricarica
  useEffect(() => {
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const slugFromUrl = pathParts[0] === "coda" ? pathParts[1] : null;

    if (slugFromUrl) {
      supabase
        .from("businesses")
        .select("*")
        .eq("slug", slugFromUrl)
        .single()
        .then(({ data }) => {
          if (data) {
            setActiveBusiness(data);
            localStorage.setItem("prossimo_active_business_id", data.id);
            setView("cliente");
          }
        });
      return;
    }

    const savedId = localStorage.getItem("prossimo_active_business_id");
    if (savedId) {
      supabase
        .from("businesses")
        .select("*")
        .eq("id", savedId)
        .single()
        .then(({ data }) => {
          if (data) setActiveBusiness(data);
        });
    }
  }, []);

  // Sottoscrizione realtime: quando "current"/"last_issued" cambiano su
  // Supabase (perche' un operatore ha premuto Avanti da un altro dispositivo),
  // la UI si aggiorna da sola.
  useEffect(() => {
    if (!activeBusiness?.id) return;
    const cleanup = ascoltaAggiornamenti(activeBusiness.id, (nuovo) => {
      setActiveBusiness((b) => (b ? { ...b, ...nuovo } : b));
    });
    return cleanup;
  }, [activeBusiness?.id]);

  const refreshStats = async (businessId) => {
    if (!businessId) return;
    const oggiDaMezzanotte = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const serviti = await statisticheServiti(businessId, "giorno");
    setServedToday(serviti);
    const { count } = await supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "non_presentato")
      .gte("created_at", oggiDaMezzanotte);
    setSkippedToday(count || 0);
    const oggi = await statisticheComplete(businessId, "giorno");
    setAvgWaitToday(oggi.attesaMedia);
    andamentoPeriodo(
      businessId,
      "giorno",
      0,
      activeBusiness?.ora_apertura,
      activeBusiness?.ora_chiusura
    ).then(setAndamentoGiorno).catch(console.error);
  };

  useEffect(() => {
    refreshStats(activeBusiness?.id);
  }, [activeBusiness?.id]);

  const selezionaAttivita = (b) => {
    setActiveBusiness(b);
    localStorage.setItem("prossimo_active_business_id", b.id);
    setMyTicket(null);
    setStatsOffset(0);
  };

  // --- Cliente --------------------------------------------------------
  const prendiNumero = async () => {
    if (!activeBusiness) return;
    try {
      const n = await prendiNumeroSupabase(activeBusiness.id);
      setMyTicket(n);
      setActiveBusiness((b) => ({ ...b, last_issued: n }));
    } catch (e) {
      setErrore(e.message);
    }
  };

  const annulla = () => setMyTicket(null);

  // --- Operatore --------------------------------------------------------
  const avanti = async () => {
    if (!activeBusiness) return;
    try {
      await avantiSupabase(activeBusiness.id);
      refreshStats(activeBusiness.id);
    } catch (e) {
      setErrore(e.message);
    }
  };

  const richiama = async () => {
    if (!activeBusiness) return;
    try {
      await richiamaSupabase(activeBusiness.id);
      refreshStats(activeBusiness.id);
    } catch (e) {
      setErrore(e.message);
    }
  };

  const nonPresente = async () => {
    if (!activeBusiness) return;
    try {
      await nonPresenteSupabase(activeBusiness.id);
      refreshStats(activeBusiness.id);
    } catch (e) {
      setErrore(e.message);
    }
  };

  // --- Registrazione ------------------------------------------------------
  const generaAttivita = async () => {
    if (!formName.trim()) return;
    if (formOraChiusura <= formOraApertura) {
      setErrore("L'orario di chiusura deve essere dopo quello di apertura");
      return;
    }
    setErrore("");
    const rand = Math.random().toString(16).slice(2, 6);
    const slug = `${slugify(formName) || "attivita"}-${rand}`;
    const { data, error } = await supabase
      .from("businesses")
      .insert({
        name: formName.trim(),
        address: formAddress.trim(),
        type: formType,
        slug,
        current: 0,
        last_issued: 0,
        ora_apertura: formOraApertura,
        ora_chiusura: formOraChiusura,
owner_id: currentUser.id,
      })
      .select()
      .single();

    if (error) {
      setErrore("Errore nel salvataggio: " + error.message);
      return;
    }

    selezionaAttivita(data);
    setRegistered(true);
  };

  const nuovaRegistrazione = () => {
    setRegistered(false);
    setFormName("");
    setFormAddress("");
    setFormType("Pizzeria");
    setFormOraApertura(9);
    setFormOraChiusura(20);
  };

  // --- Admin --------------------------------------------------------------
  useEffect(() => {
    if (view !== "admin") return;
    cercaAttivita(adminSearch).then(setBusinesses).catch((e) => setErrore(e.message));
  }, [view, adminSearch]);

  return (
    <div className="board">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@700;800;900&family=IBM+Plex+Mono:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

        .board, .board *, .board *::before, .board *::after {
          box-sizing: border-box;
        }

        .board {
          min-height: 100vh;
          width: 100%;
          background: #16302B;
          background-image:
            radial-gradient(circle at 15% 8%, rgba(201,154,62,0.10), transparent 40%),
            radial-gradient(circle at 85% 92%, rgba(183,71,42,0.10), transparent 45%);
          font-family: 'IBM Plex Sans', sans-serif;
          color: #F1ECDA;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 28px 16px 60px;
        }
        .wrap { width: 100%; max-width: 420px; }

        .wordmark {
          font-family: 'Archivo', sans-serif;
          font-weight: 900;
          letter-spacing: -0.02em;
          font-size: 15px;
          text-transform: uppercase;
          color: #C99A3E;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .wordmark .dot { width: 7px; height: 7px; border-radius: 999px; background: #B7472A; }

        .tabs {
          margin-top: 18px;
          display: flex;
          background: #0F211D;
          border-radius: 999px;
          padding: 4px;
          gap: 4px;
        }
        .tab-btn {
          flex: 1;
          border: none;
          padding: 10px 14px;
          border-radius: 999px;
          font-family: 'IBM Plex Sans', sans-serif;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          background: transparent;
          color: #9FB3AC;
          transition: all 0.2s ease;
        }
        .tab-btn.active { background: #C99A3E; color: #16302B; }

        .ticket {
          margin-top: 22px;
          background: #F1ECDA;
          color: #16302B;
          border-radius: 18px;
          padding: 26px 22px 22px;
          position: relative;
          box-shadow: 0 18px 40px -18px rgba(0,0,0,0.55);
        }
        .ticket::before, .ticket::after {
          content: "";
          position: absolute;
          width: 22px; height: 22px;
          background: #16302B;
          border-radius: 999px;
          top: 50%;
          transform: translateY(-50%);
        }
        .ticket::before { left: -11px; }
        .ticket::after { right: -11px; }
        .perf {
          border-top: 2px dashed rgba(22,48,43,0.25);
          margin: 18px 0;
        }

        .eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(22,48,43,0.55);
        }

        .flap-row { display: flex; gap: 6px; perspective: 400px; }
        .flap-row.lg .flap-shell { width: 58px; height: 78px; }
        .flap-row.lg .flap-face { font-size: 44px; }
        .flap-row.sm .flap-shell { width: 30px; height: 42px; }
        .flap-row.sm .flap-face { font-size: 22px; }

        .flap-shell {
          position: relative;
          background: #16302B;
          border-radius: 6px;
          overflow: hidden;
        }
        .flap-card {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          transform-style: preserve-3d;
        }
        .flap-face {
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 700;
          color: #F1ECDA;
        }
        .flap-card.is-flipping { animation: flipDown 0.26s ease-in-out; }
        @keyframes flipDown {
          0% { transform: rotateX(0deg); }
          50% { transform: rotateX(-90deg); }
          100% { transform: rotateX(0deg); }
        }
        .flap-hinge {
          position: absolute; left: 0; right: 0; top: 50%;
          height: 2px; background: rgba(0,0,0,0.35);
          transform: translateY(-1px);
        }
        @media (prefers-reduced-motion: reduce) {
          .flap-card.is-flipping { animation: none; }
        }

        .cta {
          margin-top: 22px;
          width: 100%;
          border: none;
          border-radius: 14px;
          padding: 15px 18px;
          font-family: 'IBM Plex Sans', sans-serif;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .cta.primary { background: #C99A3E; color: #16302B; }
        .cta.primary:hover { background: #d9ac52; }
        .cta.ghost { background: transparent; color: #9FB3AC; border: 1px solid rgba(159,179,172,0.3); margin-top: 12px; }
        .cta.ghost:hover { color: #F1ECDA; border-color: rgba(241,236,218,0.4); }
        .cta.dark { background: #0F211D; color: #F1ECDA; }
        .cta.dark:hover { background: #142a24; }
        .cta:focus-visible { outline: 2px solid #C99A3E; outline-offset: 2px; }
        .cta:disabled { opacity: 0.4; cursor: not-allowed; }

        .status-line {
          display: flex; align-items: center; justify-content: space-between;
          margin-top: 4px;
        }
        .status-label { font-size: 13px; color: rgba(22,48,43,0.65); font-weight: 500; }
        .status-value { font-family: 'IBM Plex Mono', monospace; font-weight: 600; font-size: 15px; }

        .turn-banner {
          margin-top: 22px;
          background: #B7472A;
          color: #F1ECDA;
          border-radius: 14px;
          padding: 16px 18px;
          display: flex; align-items: center; gap: 10px;
          font-weight: 700;
        }
        .turn-banner.pulse { animation: pulseGlow 0.9s ease-in-out 2; }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(183,71,42,0.0); }
          50% { box-shadow: 0 0 0 10px rgba(183,71,42,0.0), 0 0 24px 4px rgba(183,71,42,0.55); }
        }

        .board-panel {
          margin-top: 22px;
          background: #0F211D;
          border-radius: 18px;
          padding: 22px;
        }
        .board-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #9FB3AC;
          margin-bottom: 12px;
        }

        .stat-grid {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .stat-box {
          background: #16302B;
          border-radius: 12px;
          padding: 10px 6px;
          text-align: center;
        }
        .stat-num {
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 700;
          font-size: 18px;
          color: #C99A3E;
        }
        .stat-lbl {
          font-size: 10.5px;
          color: #9FB3AC;
          margin-top: 2px;
        }

        .op-actions { display: flex; gap: 8px; margin-top: 18px; }
        .op-actions .cta {
          margin-top: 0;
          flex: 1 1 0;
          min-width: 0;
          padding: 12px 8px;
          font-size: 12.5px;
          white-space: normal;
          text-align: center;
          line-height: 1.25;
        }

        .queue-strip {
          margin-top: 16px;
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .queue-chip {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 600;
          background: #16302B;
          color: #9FB3AC;
          border-radius: 8px;
          padding: 5px 9px;
        }

        .field-label {
          display: block;
          font-size: 11.5px;
          font-weight: 600;
          color: #9FB3AC;
          margin: 16px 0 6px;
        }
        .field-input {
          width: 100%;
          background: #16302B;
          border: 1px solid rgba(159,179,172,0.25);
          border-radius: 10px;
          padding: 12px 13px;
          color: #F1ECDA;
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 14px;
          box-sizing: border-box;
        }
        .field-input::placeholder { color: rgba(159,179,172,0.5); }
        .field-input:focus { outline: none; border-color: #C99A3E; }

        .chip-row { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 2px; }
        .chip {
          border: 1px solid rgba(159,179,172,0.3);
          background: transparent;
          color: #9FB3AC;
          border-radius: 999px;
          padding: 7px 13px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .chip.active { background: #C99A3E; color: #16302B; border-color: #C99A3E; }

        .url-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #16302B;
          color: #C99A3E;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 999px;
        }

        .stats-divider {
          border-top: 1px solid rgba(159,179,172,0.15);
          margin: 22px 0 18px;
        }

        .bar-chart {
          margin-top: 16px;
          height: 110px;
          display: flex;
          align-items: flex-end;
          gap: 3px;
        }
        .bar-col {
          flex: 1;
          min-width: 0;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          align-items: center;
        }
        .bar-group {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 1px;
        }
        .bar {
          flex: 1;
          min-width: 2px;
          max-width: 5px;
          background: #C99A3E;
          border-radius: 2px 2px 0 0;
          transition: height 0.3s ease;
        }
        .bar-lbl {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 7px;
          color: #9FB3AC;
          margin-top: 5px;
        }
        .bar-chart-legend {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 14px;
          margin-top: 12px;
          font-size: 10.5px;
          color: #9FB3AC;
        }
        .legend-item { display: inline-flex; align-items: center; gap: 5px; }
        .legend-dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; }

        .search-box {
          margin-top: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: #16302B;
          border: 1px solid rgba(159,179,172,0.25);
          border-radius: 10px;
          padding: 11px 13px;
          color: #9FB3AC;
        }
        .search-input {
          flex: 1;
          background: transparent;
          border: none;
          color: #F1ECDA;
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 13.5px;
        }
        .search-input:focus { outline: none; }
        .search-input::placeholder { color: rgba(159,179,172,0.5); }

        .admin-list { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
        .admin-card {
          background: #16302B;
          border-radius: 12px;
          padding: 14px;
        }
        .admin-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        .admin-card-name {
          font-family: 'Archivo', sans-serif;
          font-weight: 800;
          font-size: 14.5px;
        }
        .admin-card-type {
          display: flex; align-items: center; gap: 4px;
          font-size: 11.5px;
          color: #C99A3E;
          margin-top: 2px;
        }
        .admin-card-row {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px;
          color: #9FB3AC;
          margin-top: 6px;
        }
        .error-box {
          margin-top: 14px;
          background: rgba(183,71,42,0.15);
          border: 1px solid rgba(183,71,42,0.4);
          color: #F1ECDA;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 12.5px;
        }
      `}</style>

      <div className="wrap">
        <div className="wordmark"><span className="dot" />Prossimo</div>

        {recuperoPassword ? (
          <ImpostaNuovaPassword
            onCompletato={(user) => {
              handleLoginSuccess(user);
              setRecuperoPassword(false);
              setView("operatore");
            }}
          />
        ) : (
        <>
        <div className="tabs">
          {!isLoggedIn && (
            <button className={"tab-btn" + (view === "cliente" ? " active" : "")} onClick={() => setView("cliente")}>Cliente</button>
          )}
          {isLoggedIn && !isAdmin && (
            <button className={"tab-btn" + (view === "operatore" ? " active" : "")} onClick={() => setView("operatore")}>Operatore</button>
          )}
          {isLoggedIn && (
            <button className={"tab-btn" + (view === "registrazione" ? " active" : "")} onClick={() => setView("registrazione")}>Crea Attività</button>
          )}
          {isAdmin && (
            <button className={"tab-btn" + (view === "admin" ? " active" : "")} onClick={() => setView("admin")}>Admin</button>
          )}
          {isLoggedIn && (
            <button className="tab-btn" onClick={handleLogout}>Esci</button>
          )}
        </div>

        {!isLoggedIn && (
          <div style={{ textAlign: "center" }}>
            <button
              onClick={() => setView("operatore")}
              style={{
                background: "none",
                border: "none",
                color: "rgba(241,236,218,0.35)",
                fontSize: 11.5,
                marginTop: 14,
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              Accesso operatore / admin
            </button>
          </div>
        )}

        {(view === "operatore" || view === "statistiche") && isLoggedIn && (
          <div style={{ marginTop: 10, marginBottom: -6, display: "flex", gap: 8 }}>
            {isAdmin ? (
              <button className="cta ghost" onClick={() => setView("admin")}>Torna ad Admin</button>
            ) : (
              <button className="cta ghost" onClick={() => { setActiveBusiness(null); setView("operatore"); }}>Le mie attività</button>
            )}
            <button className="cta ghost" onClick={() => setView("statistiche")}>Statistiche</button>
          </div>
        )}

        {errore && (
          <div className="error-box">{errore}</div>
        )}

        {view === "cliente" ? (
          !activeBusiness ? (
            <div className="board-panel">
              <div className="board-label">Nessuna attivita' selezionata</div>
              <p style={{ fontSize: 13, color: "#9FB3AC" }}>
                Scansiona il QR code esposto nel locale per prendere il tuo numero. Sei il gestore di un'attivita'? Usa "Accesso operatore / admin" qui sopra.
              </p>
            </div>
          ) : myTicket === null ? (
            <div className="ticket" style={{ textAlign: "center" }}>
              <div className="eyebrow">{activeBusiness.name} — Cassa</div>
              <div style={{ margin: "18px 0 6px" }}>
                <QrCode size={64} color="#16302B" style={{ margin: "0 auto" }} />
              </div>
              <p style={{ fontSize: 13, color: "rgba(22,48,43,0.65)", marginTop: 10 }}>
                Inquadra il QR code all'ingresso per prendere il tuo numero.
              </p>
              <button className="cta primary" onClick={prendiNumero}>
                Simula scansione QR <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <div className="ticket">
              <div className="eyebrow">{activeBusiness.name} — Cassa</div>
              <div style={{ marginTop: 14 }}>
                <div className="status-label" style={{ marginBottom: 6 }}>Il tuo numero</div>
                <FlapNumber value={myTicket} size="lg" />
              </div>

              <div className="perf" />

              <div className="status-line">
                <span className="status-label">Ora in servizio</span>
                <FlapNumber value={current} size="sm" />
              </div>
              <div className="status-line" style={{ marginTop: 12 }}>
                <span className="status-label">Persone davanti a te</span>
                <span className="status-value">{position}</span>
              </div>
              <div className="status-line" style={{ marginTop: 8 }}>
                <span className="status-label">Attesa stimata</span>
                <span className="status-value">~{position * avgWaitStimata} min</span>
              </div>

              {isMyTurn && (
                <div className={"turn-banner" + (pulse ? " pulse" : "")}>
                  <Bell size={20} />
                  È il tuo turno — vai alla cassa
                </div>
              )}
              {isNext && !isMyTurn && (
                <div className="turn-banner" style={{ background: "#C99A3E", color: "#16302B" }}>
                  <Clock size={20} />
                  Preparati, tocca a te tra poco
                </div>
              )}
		{giaServito && (
                <div className="turn-banner" style={{ background: "#0F211D", color: "#F1ECDA" }}>
                  <CheckCircle2 size={20} />
                  Grazie per essere stato da noi
                </div>
              )}
              <button className="cta ghost" onClick={annulla}>
                <X size={15} /> Annulla prenotazione
              </button>
            </div>
          )
         ) : view === "operatore" ? (
          !isLoggedIn ? (
            <Login onLoginSuccess={handleLoginSuccess} />
          ) : !activeBusiness ? (
            <div className="board-panel">
              <div className="board-label">Le tue attivita'</div>
              {mieAttivitaList.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9FB3AC" }}>
                  Non hai ancora nessuna attivita'. Vai su "Crea Attività" per crearne una, oppure inserisci un codice invito qui sotto.
                </p>
              ) : (
                <div className="admin-list">
                  {mieAttivitaList.map((b) => (
                    <div className="admin-card" key={b.id}>
                      <div className="admin-card-top">
                        <div>
                          <div className="admin-card-name">{b.name}</div>
                          <div className="admin-card-type"><Tag size={11} /> {b.type}</div>
                        </div>
                        <span className="queue-chip">{b.ruolo === "proprietario" ? "Tua" : "Gestita per conto di"}</span>
                      </div>

                      {attivitaDaInvitare === b.id && b.ruolo === "proprietario" && (
                        <div style={{ marginTop: 10, padding: 10, background: "#16302B", borderRadius: 10 }}>
                          <div style={{ fontSize: 11, color: "#9FB3AC", marginBottom: 6 }}>Codice invito operatore</div>
                          <div className="url-chip">{b.invite_code}</div>
                          <button
                            className="cta ghost"
                            style={{ fontSize: 12, padding: "6px 10px", marginTop: 8 }}
                            onClick={() => handleCondividiInvito(b)}
                          >
                            Condividi link invito
                          </button>
                        </div>
                      )}

                     <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="cta dark" style={{ flex: 1 }} onClick={() => { selezionaAttivita(b); setView("operatore"); }}>
                      Gestisci
                    </button>
                    {b.ruolo === "proprietario" && (
                      <button
                        className="cta dark"
                        style={{ flex: 1 }}
                        onClick={() => setAttivitaDaInvitare(attivitaDaInvitare === b.id ? null : b.id)}
                      >
                        Invita
                      </button>
                    )}
                    {b.ruolo === "proprietario" && (
                      <button className="cta" style={{ flex: 1, background: "#C0392B", color: "#F1ECDA", border: "none" }} onClick={() => handleElimina(b)}>
                        Elimina
                      </button>
                    )}
                  </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(241,236,218,0.12)" }}>
                <label className="field-label" style={{ marginTop: 0 }}>Hai un codice invito?</label>
                <form onSubmit={handleUnisciAttivita} style={{ display: "flex", gap: 8 }}>
                  <input
                    className="field-input"
                    placeholder="Codice invito"
                    value={codiceInvito}
                    onChange={(e) => setCodiceInvito(e.target.value)}
                  />
                  <button
                    className="cta dark"
                    type="submit"
                    disabled={invitoInCorso || !codiceInvito.trim()}
                    style={{ marginTop: 0, width: "auto", padding: "0 16px", flexShrink: 0 }}
                  >
                    {invitoInCorso ? "..." : "Entra"}
                  </button>
                </form>
                {erroreInvito && <p style={{ color: "#B7472A", fontSize: 12, marginTop: 6 }}>{erroreInvito}</p>}
              </div>
            </div>
          ) : (
            <div className="board-panel">
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid rgba(241,236,218,0.12)" }}>
                <QRCodeSVG
                  value={`${window.location.origin}/coda/${activeBusiness.slug}`}
                  size={64}
                  bgColor="#F1ECDA"
                  fgColor="#16302B"
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11.5, color: "#9FB3AC", marginBottom: 6 }}>QR della tua coda</div>
                  <button className="cta ghost" style={{ fontSize: 12.5, padding: "6px 10px" }} onClick={() => handleCondividi(activeBusiness)}>
                    Condividi link
                  </button>
                </div>
              </div>
              <div className="board-label">{activeBusiness.name} — Ora in servizio</div>
              <FlapNumber value={current} size="lg" />

              <div className="op-actions">
                <button className="cta primary" onClick={avanti} disabled={inCoda === 0}>
                  <ArrowRight size={16} /> Avanti
                </button>
                <button className="cta dark" onClick={richiama} disabled={current === 0} title="Torna al numero precedente">
                  <RotateCcw size={16} /> Richiama
                </button>
                <button className="cta dark" onClick={nonPresente} disabled={inCoda === 0} title="Il cliente non si e' presentato">
                  <SkipForward size={16} /> Non presente
                </button>
              </div>

              <div className="stat-grid">
                <div className="stat-box">
                  <div className="stat-num">{inCoda}</div>
                  <div className="stat-lbl">In coda</div>
                </div>
                <div className="stat-box">
                  <div className="stat-num">{servedToday}</div>
                  <div className="stat-lbl">Serviti oggi</div>
                </div>
                <div className="stat-box">
                  <div className="stat-num">{avgWaitToday}m</div>
                  <div className="stat-lbl">Attesa media</div>
                </div>
                <div className="stat-box">
                  <div className="stat-num" style={{ color: "#B7472A" }}>{skippedToday}</div>
                  <div className="stat-lbl">Non presenti ({percentualeNonPresenti(servedToday, skippedToday)}%)</div>
                </div>
              </div>

              <div className="board-label" style={{ marginTop: 20 }}>In attesa</div>
              <div className="queue-strip">
                {Array.from({ length: inCoda }).map((_, i) => (
                  <span className="queue-chip" key={i}>#{current + i + 1}</span>
                ))}
                {inCoda === 0 && <span style={{ fontSize: 13, color: "#9FB3AC" }}>Nessuno in coda al momento.</span>}
              </div>

              <div className="stats-divider" />

              <div className="board-label"><BarChart3 size={13} style={{ display: "inline", marginRight: 6, position: "relative", top: -1 }} />Andamento oggi — persone</div>
              <MiniBarChart
                labels={andamentoGiorno.labels}
                series={[
                  { name: "Serviti", data: andamentoGiorno.serviti, color: "#C99A3E" },
                  { name: "Non presentati", data: andamentoGiorno.nonPresentati, color: "#B7472A" },
                ]}
              />
              <p style={{ fontSize: 11, color: "#9FB3AC", marginTop: 10, textAlign: "center" }}>
                Per fascia oraria di oggi
              </p>

              <div className="board-label" style={{ marginTop: 18 }}>Andamento oggi — attesa media (min)</div>
              <MiniBarChart
                labels={andamentoGiorno.labels}
                series={[
                  { name: "Attesa media (min)", data: andamentoGiorno.attesaMedia, color: "#5C87A6" },
                ]}
              />
              <p style={{ fontSize: 11, color: "#9FB3AC", marginTop: 10, textAlign: "center" }}>
                Per fascia oraria di oggi
              </p>
            </div>
          )
        ) : view === "admin" ? (
          !isAdmin ? (
            <Login onLoginSuccess={handleLoginSuccess} />
          ) : (
          <div className="board-panel">
            <button className="cta ghost" style={{ marginBottom: 12 }} onClick={() => setView("statistiche")}>Statistiche</button>

            <div className="search-box">
              <Search size={15} />
              <input
                className="search-input"
                placeholder="Cerca per nome, indirizzo, tipo..."
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
              />
            </div>

            <div className="board-label" style={{ marginTop: 16 }}>
              {businesses.length} attivita' trovate
            </div>

            <div className="admin-list">
              {businesses.map((b) => (
                <div className="admin-card" key={b.id}>
                  <div className="admin-card-top">
                    <div>
                      <div className="admin-card-name">{b.name}</div>
                      <div className="admin-card-type"><Tag size={11} /> {b.type}</div>
                    </div>
                    <span className="queue-chip">#{Math.max((b.last_issued ?? 0) - (b.current ?? 0), 0)} in coda</span>
                  </div>
                  <div className="admin-card-row"><MapPin size={12} /> {b.address || "—"}</div>
                  <div className="admin-card-row"><Link2 size={12} /> tuapp.it/coda/{b.slug}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="cta dark" style={{ flex: 1 }} onClick={() => { selezionaAttivita(b); setView("operatore"); }}>
                      Gestisci
                    </button>
                    <button className="cta dark" style={{ flex: 1, opacity: 0.75 }} onClick={() => { selezionaAttivita(b); setView("statistiche"); }}>
                      Statistiche
                    </button>
                    <button className="cta" style={{ flex: 1, background: "#C0392B", color: "#F1ECDA", border: "none" }} onClick={() => handleElimina(b)}>
                      Elimina
                    </button>
                  </div>
                </div>
              ))}
              {businesses.length === 0 && (
                <p style={{ fontSize: 13, color: "#9FB3AC", textAlign: "center", marginTop: 20 }}>
                  Nessuna attivita' corrisponde alla ricerca.
                </p>
              )}
            </div>
          </div>
          )
        ) : !isLoggedIn ? (
          <Login onLoginSuccess={handleLoginSuccess} />
        ) : view === "statistiche" ? (
          <div className="board-panel">
            <div className="board-label"><BarChart3 size={13} style={{ display: "inline", marginRight: 6, position: "relative", top: -1 }} />
              {activeBusiness ? activeBusiness.name : "Statistiche"}
            </div>
            {!activeBusiness ? (
              <p style={{ fontSize: 13, color: "#9FB3AC", marginTop: 10 }}>
                Seleziona un'attivita' da "Le mie attivita'" per vederne le statistiche.
              </p>
            ) : (
              <>
                <div className="tabs" style={{ marginTop: 12 }}>
                  <button className={"tab-btn" + (statsPeriodPage === "giorno" ? " active" : "")} onClick={() => cambiaPeriodoStatistiche("giorno")}>Giorno</button>
                  <button className={"tab-btn" + (statsPeriodPage === "settimana" ? " active" : "")} onClick={() => cambiaPeriodoStatistiche("settimana")}>Settimana</button>
                  <button className={"tab-btn" + (statsPeriodPage === "mese" ? " active" : "")} onClick={() => cambiaPeriodoStatistiche("mese")}>Mese</button>
                  <button className={"tab-btn" + (statsPeriodPage === "anno" ? " active" : "")} onClick={() => cambiaPeriodoStatistiche("anno")}>Anno</button>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
                  <button
                    className="cta dark"
                    style={{ margin: 0, width: "auto", padding: "8px 10px" }}
                    onClick={() => setStatsOffset((o) => o - 1)}
                    aria-label="Periodo precedente"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span style={{ fontSize: 12.5, color: "#9FB3AC", fontWeight: 600 }}>
                    {etichettaPeriodo(statsPeriodPage, statsOffset)}
                  </span>
                  <button
                    className="cta dark"
                    style={{ margin: 0, width: "auto", padding: "8px 10px" }}
                    onClick={() => setStatsOffset((o) => Math.min(o + 1, 0))}
                    disabled={statsOffset === 0}
                    aria-label="Periodo successivo"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button
                    className="cta dark"
                    style={{ margin: 0, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12.5 }}
                    onClick={() => esportaCsv(activeBusiness, statsPeriodPage, etichettaPeriodo(statsPeriodPage, statsOffset), statsData, andamentoStats)}
                  >
                    <FileSpreadsheet size={14} /> Esporta Excel
                  </button>
                  <button
                    className="cta dark"
                    style={{ margin: 0, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12.5 }}
                    onClick={() => esportaPdf(activeBusiness, statsPeriodPage, etichettaPeriodo(statsPeriodPage, statsOffset), statsData, andamentoStats)}
                  >
                    <FileText size={14} /> Esporta PDF
                  </button>
                </div>

                <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 14 }}>
                  <div className="stat-box">
                    <div className="stat-num">{statsData.serviti}</div>
                    <div className="stat-lbl">Serviti</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-num">{statsData.attesaMedia}m</div>
                    <div className="stat-lbl">Attesa media</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-num" style={{ color: "#B7472A" }}>{statsData.nonPresentati}</div>
                    <div className="stat-lbl">Non presentati ({percentualeNonPresenti(statsData.serviti, statsData.nonPresentati)}%)</div>
                  </div>
                </div>

                <div className="board-label" style={{ marginTop: 4 }}>Persone</div>
                <MiniBarChart
                  labels={andamentoStats.labels}
                  series={[
                    { name: "Serviti", data: andamentoStats.serviti, color: "#C99A3E" },
                    { name: "Non presentati", data: andamentoStats.nonPresentati, color: "#B7472A" },
                  ]}
                />
                <p style={{ fontSize: 11, color: "#9FB3AC", marginTop: 10, textAlign: "center" }}>
                  Per fascia del periodo selezionato
                </p>

                <div className="board-label" style={{ marginTop: 18 }}>Attesa media (min)</div>
                <MiniBarChart
                  labels={andamentoStats.labels}
                  series={[
                    { name: "Attesa media (min)", data: andamentoStats.attesaMedia, color: "#5C87A6" },
                  ]}
                />
                <p style={{ fontSize: 11, color: "#9FB3AC", marginTop: 10, textAlign: "center" }}>
                  Per fascia del periodo selezionato
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="board-panel">
            {!registered ? (
              <>
                <div className="board-label"><Building2 size={13} style={{ display: "inline", marginRight: 6, position: "relative", top: -1 }} />Registra la tua attivita'</div>

                <label className="field-label">Nome attivita'</label>
                <input
                  className="field-input"
                  placeholder="Es. Pizzeria Da Mario"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />

                <label className="field-label">Indirizzo</label>
                <input
                  className="field-input"
                  placeholder="Es. Via Roma 12, Milano"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                />

                <label className="field-label">Tipo di attivita'</label>
                <div className="chip-row">
                  {["Pizzeria", "Bar", "Ristorante", "Farmacia", "Ufficio"].map((t) => (
                    <button
                      key={t}
                      className={"chip" + (formType === t ? " active" : "")}
                      onClick={() => setFormType(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <label className="field-label">Orario di lavoro</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <select
                    className="field-input"
                    value={formOraApertura}
                    onChange={(e) => setFormOraApertura(Number(e.target.value))}
                  >
                    {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                      <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                  <span style={{ color: "#9FB3AC", fontSize: 13 }}>—</span>
                  <select
                    className="field-input"
                    value={formOraChiusura}
                    onChange={(e) => setFormOraChiusura(Number(e.target.value))}
                  >
                    {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                      <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                </div>

                <button className="cta primary" onClick={generaAttivita} disabled={!formName.trim()}>
                  <Plus size={16} /> Crea attivita' e genera QR
                </button>
                <p style={{ fontSize: 11.5, color: "#9FB3AC", marginTop: 10, textAlign: "center" }}>
                  Ogni attivita' ottiene un QR code univoco collegato alla propria coda.
                </p>
              </>
            ) : (
              <>
                <div className="board-label"><Check size={13} style={{ display: "inline", marginRight: 6, position: "relative", top: -1 }} />Attivita' registrata</div>

                <div className="ticket" style={{ marginTop: 12, textAlign: "center" }}>
                  <div className="eyebrow">{activeBusiness.type}</div>
                  <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 20, marginTop: 6 }}>
                    {activeBusiness.name}
                  </div>
                  {activeBusiness.address && (
                    <div style={{ fontSize: 12.5, color: "rgba(22,48,43,0.6)", marginTop: 2 }}>{activeBusiness.address}</div>
                  )}

                  <div style={{ display: "flex", justifyContent: "center", margin: "16px 0" }}>
                    <QRCodeSVG
                      value={`${window.location.origin}/coda/${activeBusiness.slug}`}
                      size={160}
                      bgColor="#F1ECDA"
                      fgColor="#16302B"
                    />
                  </div>

                  <div className="url-chip">
                    <Link2 size={13} />
                    tuapp.it/coda/{activeBusiness.slug}
                  </div>
                  <p style={{ fontSize: 11.5, color: "rgba(22,48,43,0.55)", marginTop: 10 }}>
                    Stampa questo QR ed esponilo in cassa: ogni scansione apre la coda di "{activeBusiness.name}".
                  </p>
                </div>

                <button className="cta primary" onClick={() => setView("operatore")}>
                  <ArrowRight size={16} /> Vai alla dashboard operatore
                </button>
                <button className="cta ghost" onClick={nuovaRegistrazione}>
                  <Plus size={15} /> Registra un'altra attivita'
                </button>
              </>
            )}
          </div>
        )}

        <div style={{ marginTop: 18, textAlign: "center", fontSize: 11.5, color: "rgba(241,236,218,0.35)" }}>
          <CheckCircle2 size={12} style={{ display: "inline", marginRight: 4, position: "relative", top: -1 }} />
          Collegato a Supabase — dati reali e sincronizzati in tempo reale
        </div>
        </>
        )}
      </div>
    </div>
  );
}