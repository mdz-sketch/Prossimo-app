import { Component } from "react";

// Senza questo, un errore di rendering qualsiasi (in qualunque punto
// dell'app) produce una pagina completamente bianca, senza nessuna
// informazione ne' per chi la usa ne' per chi deve poi capire cosa e'
// successo -- un vicolo cieco per il debug. Mostra l'errore vero a
// schermo (leggibile e fotografabile) invece del bianco.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Errore non gestito:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { error } = this.state;
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#16302B",
          color: "#F1ECDA",
          padding: 20,
          fontFamily: "monospace",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
          Si e' verificato un errore
        </div>
        <p style={{ color: "#9FB3AC", marginBottom: 14 }}>
          Fai uno screenshot di questa schermata e mandalo a chi sta seguendo lo sviluppo dell'app.
        </p>
        <div
          style={{
            background: "#0F211D",
            padding: 12,
            borderRadius: 8,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            marginBottom: 16,
          }}
        >
          {error?.name}: {error?.message}
          {error?.stack ? "\n\n" + error.stack : ""}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "#C99A3E",
            color: "#16302B",
            border: "none",
            borderRadius: 8,
            padding: "10px 16px",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Ricarica la pagina
        </button>
      </div>
    );
  }
}
