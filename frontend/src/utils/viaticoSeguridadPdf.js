import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { numeroALetras } from './numeroLetras';

const AZUL = [39, 76, 141], AZUL_OSC = [24, 48, 92], NEGRO = [30, 30, 30], BLANCO = [255, 255, 255];
const GRIS = [238, 242, 250], GRIS2 = [248, 250, 254], AZUL_L = [205, 218, 240], FINDE = [255, 243, 214];
const ETIQ = [55, 85, 145];

const sa = s => (s || '').replace(/[ÁÉÍÓÚÑáéíóúñ]/g,
  c => ({ Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N', á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n' }[c] || c));

const num = v => parseFloat(v) || 0;
const miles = v => num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = v => `L ${miles(v)}`;
const dash = v => (num(v) > 0 ? fmt(v) : '-');
const cellMonto = v => (num(v) > 0 ? fmt(v) : '');

function fmtFecha(s) {
  if (!s) return '';
  const [y, m, d] = String(s).split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}
const partes = iso => String(iso).split('T')[0].split('-').map(Number);
function dayName(iso) {
  const [y, m, d] = partes(iso);
  return ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][new Date(y, m - 1, d).getDay()];
}
function dayHead(iso) {
  const [y, m, d] = partes(iso);
  return `${dayName(iso)}\n${d}/${m}/${y}`;
}
function esFinDeSemana(iso) {
  const [y, m, d] = partes(iso);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}

/* Fechas que se muestran como columna: las que tienen algún monto en la sección
   (si ninguna lo tiene, todas las que traen los renglones). */
function fechasColumna(rows) {
  const todas = new Set();
  const conMonto = new Set();
  rows.forEach(r => (r.dias || []).forEach(d => {
    const f = String(d.fecha).slice(0, 10);
    todas.add(f);
    if (num(d.monto) > 0) conMonto.add(f);
  }));
  return [...(conMonto.size ? conMonto : todas)].sort();
}
const montoDia = (r, fecha) => num((r.dias || []).find(d => String(d.fecha).slice(0, 10) === fecha)?.monto);

/* ══════════════════════════════════════════════════════════
   Dibuja el recibo con la escala `k` (1 = tamaño normal).
   Todo lo vertical (alturas, espacios, letras) se multiplica por k.
══════════════════════════════════════════════════════════ */
function dibujar(doc, rec, logoDataUrl, k) {
  const W = 279.4, H = 215.9, M = 10, CW = W - 2 * M;
  const V = v => v * k;                       // longitudes verticales
  const F = v => Math.max(5, v * k);          // tamaños de letra (mínimo legible)
  let y = M;

  const alimentacion = rec.detalle_alimentacion || [];
  const hospedaje    = rec.detalle_hospedaje || [];
  const combustible  = rec.detalle_combustible || [];

  /* ─ ENCABEZADO ─ */
  const HH = V(23), LW = HH + 8, TW = 80, MIDW = CW - LW - TW;
  doc.setFillColor(255, 255, 255); doc.setDrawColor(...AZUL); doc.setLineWidth(0.5);
  doc.rect(M, y, CW, HH, 'FD');
  if (logoDataUrl) { const s = HH - 0.8; doc.addImage(logoDataUrl, 'PNG', M + (LW - s) / 2, y + 0.4, s, s); }
  doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.3);
  doc.line(M + LW, y + 2, M + LW, y + HH - 2);
  const mX = M + LW + MIDW / 2;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
  doc.setFontSize(F(10)); doc.text('REPUBLICA DE HONDURAS', mX, y + HH * 0.30, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(F(7.5));
  doc.text('CONGRESO NACIONAL DE HONDURAS', mX, y + HH * 0.54, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(F(9));
  doc.text('PAGADURIA ESPECIAL', mX, y + HH * 0.80, { align: 'center' });
  const tX = M + LW + MIDW;
  doc.setFillColor(...AZUL); doc.rect(tX, y, TW, HH, 'F');
  doc.setTextColor(...BLANCO); doc.setFontSize(F(9));
  doc.text('RECIBO DE', tX + TW / 2, y + HH * 0.36, { align: 'center' });
  doc.setFontSize(F(15)); doc.text('VIATICOS', tX + TW / 2, y + HH * 0.80, { align: 'center' });
  y += HH;

  /* ─ "RECIBI DE LA PAGADURIA…" ─ */
  const montoVal = num(rec.gran_total);
  const letras = sa(numeroALetras(montoVal));
  const RB = V(9);
  doc.setFillColor(...GRIS2); doc.setDrawColor(...AZUL); doc.setLineWidth(0.4);
  doc.rect(M, y, CW, RB, 'FD');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(F(6.5)); doc.setTextColor(80, 80, 80);
  doc.text('Recibi de la Pagaduria Especial, la cantidad de:', M + 2, y + RB * 0.36);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(F(8.5)); doc.setTextColor(...AZUL);
  doc.text(doc.splitTextToSize(letras, CW - 60)[0] || letras, M + 2, y + RB * 0.80);
  doc.setFontSize(F(14));
  doc.text(`(L ${miles(montoVal)})`, M + CW - 2, y + RB * 0.70, { align: 'right' });
  y += RB + V(1);

  /* ─ CAMPOS ─ */
  const RH = V(4.8);
  const cell = (lbl, val, ox, w, lblW = 34, h = RH, big = false) => {
    doc.setFillColor(...GRIS); doc.rect(M + ox, y, lblW, h, 'F');
    doc.setFillColor(255, 255, 255); doc.rect(M + ox + lblW, y, w - lblW, h, 'F');
    doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.2);
    doc.rect(M + ox, y, w, h, 'S'); doc.line(M + ox + lblW, y, M + ox + lblW, y + h);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(F(6)); doc.setTextColor(...ETIQ);
    doc.text(sa(lbl + ':'), M + ox + 1.5, y + h * 0.66);
    const txt = doc.splitTextToSize(sa(val || ''), w - lblW - 3)[0] || '';
    if (big) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(F(10.5)); doc.setTextColor(...AZUL);
      doc.text(txt, M + ox + lblW + (w - lblW) / 2, y + h * 0.68, { align: 'center' });
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(F(8)); doc.setTextColor(...NEGRO);
      doc.text(txt, M + ox + lblW + 2, y + h * 0.68);
    }
  };

  cell('MISION', rec.mision, 0, CW); y += RH;
  cell('LUGAR', rec.lugar, 0, CW * 0.6); cell('DEPENDENCIA', rec.dependencia, CW * 0.6, CW * 0.4); y += RH;
  cell('NOMBRE DE QUIEN RECIBE', (rec.nombre_beneficiario || '').toUpperCase(), 0, CW * 0.68, 40, V(6.6), true);
  cell('IDENTIDAD', rec.numero_identidad, CW * 0.68, CW * 0.32, 22, V(6.6)); y += V(6.6);
  cell('CARGO', rec.cargo, 0, CW / 2); cell('ENCARGADO DE LA MISION', rec.encargado_mision, CW / 2, CW / 2, 40); y += RH;
  const PL = 34, q = (CW - PL) / 4;
  doc.setFillColor(...GRIS); doc.rect(M, y, PL, RH, 'F');
  doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.2); doc.rect(M, y, PL, RH, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(F(6)); doc.setTextColor(...ETIQ);
  doc.text('PERIODO DE TIEMPO:', M + 1.5, y + RH * 0.66);
  cell('DESDE', fmtFecha(rec.periodo_desde), PL, q, 14);
  cell('HASTA', fmtFecha(rec.periodo_hasta), PL + q, q, 14);
  cell('HORA DE SALIDA', rec.hora_salida || '-', PL + 2 * q, q, 26);
  cell('HORA DE REGRESO', rec.hora_regreso || '-', PL + 3 * q, q, 28);
  y += RH + V(2);

  /* ─ RESUMEN DE GASTOS (izquierda) + COMBUSTIBLE (derecha) ─ */
  const pad = { top: V(1.2), bottom: V(1.2), left: 2.5, right: 2.5 };
  const gastosW = Math.round(CW * 0.42), gapT = 4, combW = CW - gastosW - gapT;
  const yTablas = y;
  autoTable(doc, {
    startY: y, margin: { left: M, right: W - M - gastosW }, tableWidth: gastosW,
    head: [['No.', 'Detalle', 'TOTAL']],
    body: [
      ['1', 'HOSPEDAJE', dash(rec.monto_hospedaje)],
      ['2', 'ALIMENTACION', dash(rec.monto_alimentacion)],
      ['3', 'COMBUSTIBLE', dash(rec.monto_combustible)],
      ['4', 'IMPREVISTO', dash(rec.monto_imprevistos)],
      ['5', rec.otros_descripcion ? `OTROS  ${sa(rec.otros_descripcion.toUpperCase())}` : 'OTROS', dash(rec.monto_otros)],
    ],
    foot: [[
      { content: 'GRAN TOTAL:', colSpan: 2, styles: { halign: 'right' } },
      { content: fmt(rec.gran_total), styles: { halign: 'right' } },
    ]],
    headStyles: { fillColor: AZUL, textColor: BLANCO, fontStyle: 'bold', fontSize: F(7), cellPadding: pad },
    bodyStyles: { fontSize: F(7.5), textColor: NEGRO, cellPadding: pad },
    footStyles: { fillColor: AZUL_OSC, textColor: BLANCO, fontStyle: 'bold', fontSize: F(9), cellPadding: pad },
    alternateRowStyles: { fillColor: GRIS2 },
    styles: { lineColor: AZUL_L, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 11, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 36, halign: 'right' } },
  });
  const yGastos = doc.lastAutoTable.finalY;

  const cbody = combustible.map((r, i) => [String(i + 1), sa((r.nombre || '').toUpperCase()), sa((r.detalle || '').toUpperCase()), cellMonto(r.monto)]);
  while (cbody.length < 3) cbody.push([String(cbody.length + 1), '', '', '']);
  const cpad = { top: V(1.2), bottom: V(1.2), left: 1.5, right: 1.5 };
  autoTable(doc, {
    startY: yTablas, margin: { left: M + gastosW + gapT, right: M }, tableWidth: combW,
    head: [
      [{ content: 'DETALLE DE COMBUSTIBLE', colSpan: 4, styles: { fillColor: AZUL_OSC, textColor: BLANCO, fontStyle: 'bold', fontSize: F(7.5), halign: 'left', cellPadding: { top: V(1.4), bottom: V(1.4), left: 3, right: 3 } } }],
      ['#', 'Nombre', 'DETALLE / VEHICULOS', 'TOTAL'],
    ],
    body: cbody,
    foot: [['', 'TOTAL:', '', dash(rec.monto_combustible)]],
    headStyles: { fillColor: AZUL, textColor: BLANCO, fontStyle: 'bold', fontSize: F(6.5), halign: 'center', cellPadding: cpad },
    bodyStyles: { fontSize: F(7), textColor: NEGRO, cellPadding: cpad },
    footStyles: { fillColor: GRIS, textColor: NEGRO, fontSize: F(7), fontStyle: 'bold', cellPadding: cpad },
    styles: { lineColor: AZUL_L, lineWidth: 0.2 },
    alternateRowStyles: { fillColor: GRIS2 },
    columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 42 }, 3: { cellWidth: 28, halign: 'right' } },
  });
  y = Math.max(yGastos, doc.lastAutoTable.finalY) + V(2.5);

  /* ─ TABLAS CON COLUMNAS POR DÍA (alimentación / hospedaje) ─ */
  const tablaDias = ({ titulo, cols, rows, mult }) => {
    const fechas = fechasColumna(rows);
    const n = fechas.length;
    const fijo = 8 + cols.ancho + 28;                // # + columna fija + total
    const fw = n > 0 ? Math.min(24, Math.max(12, Math.floor((CW - fijo - 70) / n))) : 0;
    const totalCol = 3 + n;
    const cantidad = r => (mult ? num(r.cantidad) || 1 : 1);
    const montoFila = r => cantidad(r) * fechas.reduce((s, f) => s + montoDia(r, f), 0);
    const body = rows.map((r, i) => [
      String(i + 1), ...cols.fila(r),
      ...fechas.map(f => cellMonto(montoDia(r, f))),
      { content: fmt(montoFila(r)), styles: { fontStyle: 'bold', textColor: AZUL } },
    ]);
    if (!body.length) body.push(['1', '', '', ...fechas.map(() => ''), '']);
    const totDia = fechas.map(f => rows.reduce((s, r) => s + cantidad(r) * montoDia(r, f), 0));
    const totalGeneral = rows.reduce((s, r) => s + montoFila(r), 0);
    const cp = { top: V(1.3), bottom: V(1.3), left: 1.5, right: 1.5 };

    if (y > H - 45) { doc.addPage(); y = M; }
    autoTable(doc, {
      startY: y, margin: { left: M, right: M }, tableWidth: CW,
      head: [
        [{ content: titulo, colSpan: 4 + n, styles: { fillColor: AZUL_OSC, textColor: BLANCO, fontStyle: 'bold', fontSize: F(7.5), halign: 'left', cellPadding: { top: V(1.4), bottom: V(1.4), left: 3, right: 3 } } }],
        ['#', ...cols.head, ...fechas.map(dayHead), 'TOTAL'],
      ],
      body,
      foot: [['', 'TOTAL:', '', ...totDia.map(t => ({ content: cellMonto(t), styles: { halign: 'center' } })),
        { content: fmt(totalGeneral), styles: { halign: 'right', textColor: AZUL } }]],
      headStyles: { fillColor: AZUL, textColor: BLANCO, fontStyle: 'bold', fontSize: F(6.5), halign: 'center', cellPadding: cp },
      bodyStyles: { fontSize: F(7), textColor: NEGRO, cellPadding: cp },
      footStyles: { fillColor: GRIS, textColor: NEGRO, fontSize: F(7), fontStyle: 'bold', cellPadding: cp },
      alternateRowStyles: { fillColor: GRIS2 },
      styles: { lineColor: AZUL_L, lineWidth: 0.2, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: cols.ancho, halign: cols.alineo },
        ...Object.fromEntries(fechas.map((_, i) => [i + 3, { cellWidth: fw, halign: 'center' }])),
        [totalCol]: { cellWidth: 28, halign: 'right' },
      },
      didParseCell(data) {
        const ci = data.column.index;
        if (data.section !== 'head' && ci >= 3 && ci < totalCol && esFinDeSemana(fechas[ci - 3])) data.cell.styles.fillColor = FINDE;
      },
    });
    y = doc.lastAutoTable.finalY + V(2.5);
  };

  tablaDias({
    titulo: 'DETALLE DE ALIMENTACION', mult: false,
    cols: { head: ['Nombre', 'Cargo'], ancho: 38, alineo: 'left', fila: r => [sa((r.nombre || '').toUpperCase()), sa((r.cargo || '').toUpperCase())] },
    rows: alimentacion,
  });
  tablaDias({
    titulo: 'DETALLE DE HOSPEDAJE', mult: true,
    cols: { head: ['DETALLE', 'CANTIDAD'], ancho: 22, alineo: 'center', fila: r => [sa((r.detalle || '').toUpperCase()), String(num(r.cantidad) || 1)] },
    rows: hospedaje,
  });

  /* ─ FIRMA ─ */
  const FR = V(8.5);                       // alto de cada renglón de firma
  const ESPACIO_FIRMA = V(9);               // espacio extra para firmar a mano
  if (y > H - M - FR * 3 - ESPACIO_FIRMA) { doc.addPage(); y = M + 6; }
  const lblW = 24, lineW = 70;              // líneas cortas: NOMBRE, IDENTIDAD y FIRMA
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3); doc.setTextColor(...NEGRO);
  const renglon = (i, etiqueta, valor, extra = 0) => {
    const base = y + FR * (i + 0.75) + extra;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(F(8));
    doc.text(etiqueta, M, base);
    if (valor) {
      doc.setFont('helvetica', 'normal');
      let fs = F(8);
      doc.setFontSize(fs);
      while (fs > 5 && doc.getTextWidth(valor) > lineW - 1) { fs -= 0.5; doc.setFontSize(fs); }
      doc.text(valor, M + lblW, base - 0.8);
    }
    doc.line(M + lblW, base + 0.8, M + lblW + lineW, base + 0.8);
  };
  renglon(0, 'NOMBRE:', sa((rec.nombre_beneficiario || '').toUpperCase()));
  renglon(1, 'IDENTIDAD:', sa(rec.numero_identidad || ''));
  renglon(2, 'FIRMA:', '', ESPACIO_FIRMA);
}

/* Prueba escalas de mayor a menor hasta que todo quepa en una hoja. */
export async function generarReciboSeguridadPdf(rec, logoDataUrl) {
  const nuevo = () => new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const K_MIN = 0.7;
  let k = 1;
  for (; k > K_MIN; k = Math.round((k - 0.04) * 100) / 100) {
    const prueba = nuevo();
    dibujar(prueba, rec, null, k);
    if (prueba.getNumberOfPages() === 1) break;
  }
  k = Math.max(k, K_MIN);

  const doc = nuevo();
  dibujar(doc, rec, logoDataUrl, k);
  doc.save(`recibo_viaticos_seguridad_${(rec.numero_identidad || '').slice(-6)}_${String(rec.periodo_desde || '').slice(0, 10)}.pdf`);
}
