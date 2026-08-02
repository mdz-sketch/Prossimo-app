import { useState, useRef, useEffect } from "react";
import { QrCode, ArrowRight, RotateCcw, SkipForward, X, Bell, Clock, CheckCircle2, Building2, Link2, Check, Plus, Search, ShieldCheck, BarChart3, MapPin, Tag } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import Login from "./components/Login";
import {
  prendiNumero as prendiNumeroSupabase,
  avanti as avantiSupabase,
  richiama as richiamaSupabase,
  nonPresente as nonPresenteSupabase,
  statisticheServiti,
  cercaAttivita,
  mieAttivita,
  eliminaAttivita,
  ascoltaAggiornamenti,
} from "./lib/queries";

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

function MiniBarChart({ data, labels }) {
  const max = Math.max(...data, 1);
  return (
    <div className="bar-chart">
      {data.map((v, i) => (
        <div className="bar-col" key={i}>
          <div className="bar" style={{ height: `${Math.max((v / max) * 100, 4)}%` }} title={`${labels[i]}: ${v}`} />
          <span className="bar-lbl">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

// Dati puramente illustrativi per l'andamento del grafico a barre
// (la distribuzione oraria/giornaliera non e' ancora calcolata dal database,
// solo il totale mostrato sopra il grafico e' reale)
const CHART_DATA = {
  giorno: { data: [4, 7, 9, 12, 8, 15, 11, 6, 9, 13, 10, 5], labels: ["9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"] },
  mese: { data: [22, 28, 19, 31, 25, 30, 27, 24, 33, 29, 21, 26, 32, 28, 24, 30, 27, 22, 29, 34, 26, 23, 31, 28, 25, 30, 27, 24, 29, 33], labels: Array.from({ length: 30 }, (_, i) => String(i + 1)) },
  anno: { data: [420, 460, 510, 480, 530, 610, 590, 570, 540, 520, 460, 500], labels: ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"] },
};

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function App() {
  const [view, setView] = useState("cliente");
const [currentUser, setCurrentUser] = useState(null);
  const isLoggedIn = currentUser !== null;
  const isAdmin = currentUser?.user_metadata?.role === "admin";
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
  };

  // Attivita' attualmente "attiva" per le viste Cliente/Operatore.
  // Viene impostata registrando una nuova attivita' o scegliendo
  // "Gestisci" da un'attivita' esistente nel pannello Admin.
  const [activeBusiness, setActiveBusiness] = useState(null);
  const [mieAttivitaList, setMieAttivitaList] = useState([]);

  useEffect(() => {
    if (view === "operatore" && isLoggedIn && !activeBusiness) {
      mieAttivita(currentUser.id).then(setMieAttivitaList).catch(console.error);
    }
  }, [view, isLoggedIn, activeBusiness, currentUser]);

  const [myTicket, setMyTicket] = useState(null);
  const [pulse, setPulse] = useState(false);
  const [servedToday, setServedToday] = useState(0);
  const [skippedToday, setSkippedToday] = useState(0);
  const [statsPeriod, setStatsPeriod] = useState("giorno");
  const [statsServiti, setStatsServiti] = useState(0);

  const [registered, setRegistered] = useState(false);
  const [businesses, setBusinesses] = useState([]);
  const [adminSearch, setAdminSearch] = useState("");
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formType, setFormType] = useState("Pizzeria");
  const [errore, setErrore] = useState("");

  const avgWaitMin = 3;
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

  // Al primo avvio, se c'era un'attivita' scelta in precedenza, la ricarica
  useEffect(() => {
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
  };

  useEffect(() => {
    refreshStats(activeBusiness?.id);
  }, [activeBusiness?.id]);

  useEffect(() => {
    if (!activeBusiness?.id) return;
    statisticheServiti(activeBusiness.id, statsPeriod).then(setStatsServiti);
  }, [activeBusiness?.id, statsPeriod]);

  const selezionaAttivita = (b) => {
    setActiveBusiness(b);
    localStorage.setItem("prossimo_active_business_id", b.id);
    setMyTicket(null);
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
  };

  // pattern deterministico "finto QR" derivato dallo slug attivita'
  const qrCells = (() => {
    const seed = activeBusiness ? activeBusiness.slug : "demo";
    const cells = [];
    for (let i = 0; i < 64; i++) {
      const code = seed.charCodeAt(i % seed.length) + i * 7;
      cells.push(code % 3 === 0);
    }
    return cells;
  })();

  // --- Admin --------------------------------------------------------------
  useEffect(() => {
    if (view !== "admin") return;
    cercaAttivita(adminSearch).then(setBusinesses).catch((e) => setErrore(e.message));
  }, [view, adminSearch]);

  return (
    <div className="board">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@700;800;900&family=IBM+Plex+Mono:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

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
        .op-actions .cta { margin-top: 0; }

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

        .qr-pattern {
          margin: 16px auto 12px;
          width: 112px;
          height: 112px;
          display: grid;
          grid-template-columns: repeat(8, 1fr);
          grid-template-rows: repeat(8, 1fr);
          gap: 2px;
          background: #16302B;
          padding: 8px;
          border-radius: 8px;
        }
        .qr-pattern .cell { background: transparent; border-radius: 1px; }
        .qr-pattern .cell.on { background: #F1ECDA; }

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
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          align-items: center;
        }
        .bar {
          width: 100%;
          max-width: 14px;
          background: #C99A3E;
          border-radius: 3px 3px 0 0;
          transition: height 0.3s ease;
        }
        .bar-lbl {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 8.5px;
          color: #9FB3AC;
          margin-top: 5px;
        }

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

        <div className="tabs">
          <button className={"tab-btn" + (view === "cliente" ? " active" : "")} onClick={() => setView("cliente")}>Cliente</button>
          <button className={"tab-btn" + (view === "operatore" ? " active" : "")} onClick={() => setView("operatore")}>Operatore</button>
          <button className={"tab-btn" + (view === "registrazione" ? " active" : "")} onClick={() => setView("registrazione")}>Crea Attività</button>
          <button className={"tab-btn" + (view === "admin" ? " active" : "")} onClick={() => setView("admin")}>Admin</button>
          {isLoggedIn && (
            <button className="tab-btn" onClick={handleLogout}>Esci</button>
          )}
        </div>

        {view === "operatore" && isLoggedIn && (
          <div style={{ marginTop: 10, marginBottom: -6 }}>
            <button className="cta ghost" onClick={() => setActiveBusiness(null)}>Le mie attività</button>
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
                Vai su "Registra" per crearne una nuova, oppure su "Admin" e scegli "Gestisci" su un'attivita' esistente.
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
                <span className="status-value">~{position * avgWaitMin} min</span>
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
            <Login onLoginSuccess={(user) => setCurrentUser(user)} />
          ) : !activeBusiness ? (
            <div className="board-panel">
              <div className="board-label">Le tue attivita'</div>
              {mieAttivitaList.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9FB3AC" }}>
                  Non hai ancora nessuna attivita'. Vai su "Crea Attività" per crearne una.
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
                      </div>
                     <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="cta dark" style={{ flex: 1 }} onClick={() => selezionaAttivita(b)}>
                          Gestisci
                        </button>
                        <button className="cta" style={{ flex: 1, background: "#C0392B", color: "#F1ECDA", border: "none" }} onClick={() => handleElimina(b)}>
                          Elimina
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="board-panel">
              <div className="board-label">{activeBusiness.name} — Ora in servizio</div>
              <FlapNumber value={current} size="lg" />

              <div className="op-actions">
                <button className="cta primary" onClick={avanti}>
                  <ArrowRight size={16} /> Avanti
                </button>
                <button className="cta dark" onClick={richiama} title="Torna al numero precedente">
                  <RotateCcw size={16} /> Richiama
                </button>
                <button className="cta dark" onClick={nonPresente} title="Il cliente non si e' presentato">
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
                  <div className="stat-num">{avgWaitMin}m</div>
                  <div className="stat-lbl">Attesa media</div>
                </div>
                <div className="stat-box">
                  <div className="stat-num" style={{ color: "#B7472A" }}>{skippedToday}</div>
                  <div className="stat-lbl">Non presenti</div>
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

              <div className="board-label"><BarChart3 size={13} style={{ display: "inline", marginRight: 6, position: "relative", top: -1 }} />Statistiche</div>

              <div className="tabs" style={{ marginTop: 0 }}>
                <button className={"tab-btn" + (statsPeriod === "giorno" ? " active" : "")} onClick={() => setStatsPeriod("giorno")}>Giorno</button>
                <button className={"tab-btn" + (statsPeriod === "mese" ? " active" : "")} onClick={() => setStatsPeriod("mese")}>Mese</button>
                <button className={"tab-btn" + (statsPeriod === "anno" ? " active" : "")} onClick={() => setStatsPeriod("anno")}>Anno</button>
              </div>

              <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", marginTop: 14 }}>
                <div className="stat-box">
                  <div className="stat-num">{statsServiti}</div>
                  <div className="stat-lbl">Serviti nel periodo</div>
                </div>
                <div className="stat-box">
                  <div className="stat-num">{avgWaitMin}m</div>
                  <div className="stat-lbl">Attesa media</div>
                </div>
              </div>

              <MiniBarChart data={CHART_DATA[statsPeriod].data} labels={CHART_DATA[statsPeriod].labels} />
              <p style={{ fontSize: 11, color: "#9FB3AC", marginTop: 10, textAlign: "center" }}>
                Andamento — grafico dimostrativo, il totale sopra e' reale
              </p>
            </div>
          )
        ) : view === "admin" ? (
          !isAdmin ? (
            <Login onLoginSuccess={(user) => setCurrentUser(user)} />
          ) : (
          <div className="board-panel">
            <div className="board-label"><ShieldCheck size={13} style={{ display: "inline", marginRight: 6, position: "relative", top: -1 }} />Pannello amministratore</div>

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
          <Login onLoginSuccess={(user) => setCurrentUser(user)} />
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

                  <div className="qr-pattern">
                    {qrCells.map((on, i) => (
                      <span key={i} className={on ? "cell on" : "cell"} />
                    ))}
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
      </div>
    </div>
  );
}