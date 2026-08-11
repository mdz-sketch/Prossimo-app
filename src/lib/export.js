// Esportazione delle statistiche in CSV (apribile in Excel/Google Sheets
// senza dipendenze aggiuntive) e PDF, e generazione del PDF con il QR code
// da stampare.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

function nomeFile(business, periodo, etichetta, estensione) {
  const parteEtichetta = etichetta.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const parteNome = business.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `statistiche-${parteNome}-${periodo}-${parteEtichetta}.${estensione}`;
}

function righeTabella(andamentoStats) {
  return andamentoStats.labels.map((label, i) => [
    label,
    String(andamentoStats.serviti[i] ?? 0),
    String(andamentoStats.nonPresentati[i] ?? 0),
    String(andamentoStats.attesaMedia[i] ?? 0),
  ]);
}

function scaricaBlob(blob, nomeFile) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(valore) {
  const s = String(valore);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function esportaCsv(business, periodo, etichetta, statsData, andamentoStats) {
  const righe = [
    ["Attivita'", business.name],
    ["Periodo", periodo],
    ["Intervallo", etichetta],
    [],
    ["Serviti totali", statsData.serviti],
    ["Non presentati totali", statsData.nonPresentati],
    ["Attesa media (min)", statsData.attesaMedia],
    [],
    ["Fascia", "Serviti", "Non presentati", "Attesa media (min)"],
    ...righeTabella(andamentoStats),
  ];

  const csv = righe.map((riga) => riga.map(csvEscape).join(";")).join("\n");
  // BOM per far riconoscere correttamente gli accenti a Excel
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  scaricaBlob(blob, nomeFile(business, periodo, etichetta, "csv"));
}

export function esportaPdf(business, periodo, etichetta, statsData, andamentoStats) {
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text(business.name, 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(90);
  doc.text(`Statistiche — ${etichetta}`, 14, 26);

  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(`Serviti: ${statsData.serviti}`, 14, 38);
  doc.text(`Non presentati: ${statsData.nonPresentati}`, 80, 38);
  doc.text(`Attesa media: ${statsData.attesaMedia} min`, 14, 46);

  autoTable(doc, {
    startY: 54,
    head: [["Fascia", "Serviti", "Non presentati", "Attesa media (min)"]],
    body: righeTabella(andamentoStats),
    headStyles: { fillColor: [22, 48, 43] },
    styles: { fontSize: 9 },
  });

  doc.save(nomeFile(business, periodo, etichetta, "pdf"));
}

// --- QR code da stampare in cassa -----------------------------------------
// Apre direttamente il PDF in una nuova scheda (invece di scaricarlo), cosi'
// da poterlo stampare subito con Ctrl/Cmd+P dal visualizzatore del browser.
export async function apriQrPdf(business) {
  const url = `${window.location.origin}/coda/${business.slug}`;
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 600 });

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(22);
  doc.setFont(undefined, "bold");
  doc.setTextColor(20);
  doc.text(business.name, pageWidth / 2, 40, { align: "center" });

  doc.setFontSize(13);
  doc.setFont(undefined, "normal");
  doc.setTextColor(90);
  doc.text("Inquadra il QR code per prendere il tuo numero", pageWidth / 2, 52, { align: "center" });

  const qrSize = 110;
  const qrX = (pageWidth - qrSize) / 2;
  doc.addImage(qrDataUrl, "PNG", qrX, 70, qrSize, qrSize);

  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(url, pageWidth / 2, 70 + qrSize + 14, { align: "center" });

  window.open(doc.output("bloburl"), "_blank");
}
