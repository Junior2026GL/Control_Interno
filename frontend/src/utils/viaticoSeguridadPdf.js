import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { numeroALetras } from './numeroLetras';

const AZUL = [39, 76, 141], AZUL_OSC = [24, 48, 92], NEGRO = [20, 20, 20], BLANCO = [255, 255, 255];
const GRIS = [238, 242, 250], GRIS2 = [248, 250, 254], AZUL_L = [210, 224, 245], FINDE = [255, 241, 209];

const sa = s => (s || '').replace(/[ÁÉÍÓÚÑáéíóúñ]/g,
  c => ({ Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N', á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n' }[c] || c));

const num = v => parseFloat(v) || 0;
const fmt = v => `L ${num(v).toFixed(2)}`;
const dash = v => (num(v) > 0 ? fmt(v) : '-');
const cellMonto = v => (num(v) > 0 ? fmt(v) : '');

function fmtFecha(s) {
  if (!s) return '';
  const [y, m, d] = String(s).split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function dayName(iso) {
  const [y, m, d] = String(iso).split('T')[0].split('-');
  return ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][new Date(+y, +m - 1, +d).getDay()];
}

function dayHead(iso) {
  const [y, m, d] = String(iso).split('T')[0].split('-');
  return `${dayName(iso)}\n${parseInt(d, 10)}/${parseInt(m, 10)}/${y}`;
}

function esFinDeSemana(iso) {
  const [y, m, d] = String(iso).split('T')[0].split('-');
  const dow = new Date(+y, +m - 1, +d).getDay();
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
  const base = conMonto.size ? conMonto : todas;
  return [...base].sort();
}

const montoDia = (r, fecha) => num((r.dias || []).find(d => String(d.fecha).slice(0, 10) === fecha)?.monto);

export async function generarReciboSeguridadPdf(rec, logoDataUrl) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const W = 279.4, H = 215.9, M = 10, CW = W - 2 * M;
  let y = M;

  const alimentacion = rec.detalle_alimentacion || [];
  const hospedaje    = rec.detalle_hospedaje || [];
  const combustible  = rec.detalle_combustible || [];

  /* ─ ENCABEZADO ─ */
  const HH = 20, LW = 30, TW = 88, MIDW = CW - LW - TW;
  doc.setFillColor(255, 255, 255); doc.setDrawColor(...AZUL); doc.setLineWidth(0.6);
  doc.rect(M, y, CW, HH, 'FD');
  if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', M + 1, y + 1, LW - 2, HH - 2);
  doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.3);
  doc.line(M + LW, y + 2, M + LW, y + HH - 2);
  doc.line(M + LW + MIDW, y + 2, M + LW + MIDW, y + HH - 2);
  const mX = M + LW + MIDW / 2;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...AZUL);
  doc.text('REPUBLICA DE HONDURAS', mX, y + 7, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text('CONGRESO NACIONAL DE HONDURAS', mX, y + 12, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('PAGADURIA ESPECIAL', mX, y + 17, { align: 'center' });
  const tX = M + LW + MIDW;
  doc.setFillColor(...AZUL); doc.rect(tX, y, TW, HH, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...BLANCO);
  doc.text('RECIBO DE', tX + TW / 2, y + 8, { align: 'center' });
  doc.setFontSize(15); doc.text('VIATICOS', tX + TW / 2, y + 17, { align: 'center' });
  y += HH;

  /* ─ "RECIBI DE LA PAGADURIA..." ─ */
  const montoVal = num(rec.gran_total);
  const montoStr = `(L${montoVal.toLocaleString('es-HN', { minimumFractionDigits: 2 })})`;
  const letras = sa(numeroALetras(montoVal));
  doc.setFillColor(...GRIS2); doc.setDrawColor(...AZUL); doc.setLineWidth(0.4);
  doc.rect(M, y, CW, 9, 'FD');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(70, 70, 70);
  doc.text('Recibi de la Pagaduria Especial, la cantidad de:', M + 2, y + 3.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...AZUL);
  doc.text(doc.splitTextToSize(letras, CW - 55)[0] || letras, M + 2, y + 7.5);
  doc.setFontSize(9.5);
  doc.text(montoStr, M + CW - 1, y + 7.5, { align: 'right' });
  y += 10;

  /* ─ CAMPOS ─ */
  const RH = 5, LBL = 40;
  const cell = (lbl, val, ox, w) => {
    doc.setFillColor(...GRIS); doc.rect(M + ox, y, LBL, RH, 'F');
    doc.setFillColor(255, 255, 255); doc.rect(M + ox + LBL, y, w - LBL, RH, 'F');
    doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.2);
    doc.rect(M + ox, y, w, RH, 'S'); doc.line(M + ox + LBL, y, M + ox + LBL, y + RH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(55, 85, 145);
    doc.text(sa(lbl + ':'), M + ox + 1.5, y + RH * 0.73);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...NEGRO);
    doc.text(doc.splitTextToSize(sa(val || ''), w - LBL - 3)[0] || '', M + ox + LBL + 2, y + RH * 0.73);
  };

  cell('MISION', rec.mision, 0, CW); y += RH;
  cell('LUGAR', rec.lugar, 0, CW / 2); cell('DEPENDENCIA', rec.dependencia, CW / 2, CW / 2); y += RH;
  doc.setFillColor(...GRIS); doc.rect(M, y, CW, RH, 'F');
  doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.2); doc.rect(M, y, CW, RH, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(55, 85, 145);
  doc.text('NOMBRE DE QUIEN RECIBE:', M + 1.5, y + RH * 0.73); y += RH;
  doc.setFillColor(255, 255, 255); doc.setDrawColor(...AZUL); doc.setLineWidth(0.5);
  doc.rect(M, y, CW, 7, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...AZUL);
  doc.text(sa((rec.nombre_beneficiario || '').toUpperCase()), M + CW / 2, y + 5, { align: 'center' }); y += 7;
  cell('CARGO', rec.cargo, 0, CW / 2); cell('ENCARGADO DE LA MISION', rec.encargado_mision, CW / 2, CW / 2); y += RH;
  const PLBL = 38, restW = CW - PLBL, halfW = restW / 2, rowsH = RH * 2;
  doc.setFillColor(...GRIS); doc.rect(M, y, PLBL, rowsH, 'F');
  doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.2); doc.rect(M, y, PLBL, rowsH, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(55, 85, 145);
  doc.text('PERIODO DE', M + 1.5, y + rowsH / 2 - 1); doc.text('TIEMPO:', M + 1.5, y + rowsH / 2 + 3);
  cell('DESDE', fmtFecha(rec.periodo_desde), PLBL, halfW);
  cell('HASTA', fmtFecha(rec.periodo_hasta), PLBL + halfW, halfW);
  y += RH;
  cell('HORA DE SALIDA', rec.hora_salida || '-', PLBL, halfW);
  cell('HORA DE REGRESO', rec.hora_regreso || '-', PLBL + halfW, halfW);
  y += RH + 1;

  /* ─ TABLA RESUMEN DE GASTOS ─ */
  const pad = { top: 1.2, bottom: 1.2, left: 2.5, right: 2.5 };
  const gastosW = Math.round(CW * 0.46), gapT = 4, combW = CW - gastosW - gapT;
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
    foot: [['',
      { content: 'GRAN TOTAL:', styles: { halign: 'right', fontStyle: 'bold', fontSize: 9 } },
      { content: fmt(rec.gran_total), styles: { fontStyle: 'bold', halign: 'right', fontSize: 9.5, textColor: AZUL } }]],
    headStyles: { fillColor: AZUL, textColor: BLANCO, fontStyle: 'bold', fontSize: 7.5, cellPadding: pad },
    bodyStyles: { fontSize: 7.5, textColor: NEGRO, cellPadding: pad },
    footStyles: { fillColor: GRIS, textColor: NEGRO, fontSize: 7.5, cellPadding: pad },
    alternateRowStyles: { fillColor: GRIS2 },
    styles: { lineColor: AZUL_L, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 34, halign: 'right' } },
  });
  const yGastos = doc.lastAutoTable.finalY;

  /* ─ DETALLE DE COMBUSTIBLE (a la derecha del resumen) ─ */
  const cbody = combustible.map((r, i) => [String(i + 1), sa((r.nombre || '').toUpperCase()), sa((r.detalle || '').toUpperCase()), cellMonto(r.monto)]);
  while (cbody.length < 3) cbody.push([String(cbody.length + 1), '', '', '']);
  const cpad = { top: 1.2, bottom: 1.2, left: 1.5, right: 1.5 };
  autoTable(doc, {
    startY: yTablas, margin: { left: M + gastosW + gapT, right: M }, tableWidth: combW,
    head: [
      [{ content: 'DETALLE DE COMBUSTIBLE', colSpan: 4, styles: { fillColor: [40, 40, 40], textColor: BLANCO, fontStyle: 'bold', fontSize: 8, halign: 'left', cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 } } }],
      ['#', 'Nombre', 'DETALLE/VEHICULOS', 'TOTAL'],
    ],
    body: cbody,
    foot: [['', 'TOTAL:', '', dash(rec.monto_combustible)]],
    headStyles: { fillColor: AZUL, textColor: BLANCO, fontStyle: 'bold', fontSize: 6.5, cellPadding: cpad },
    bodyStyles: { fontSize: 6.8, textColor: NEGRO, cellPadding: cpad },
    footStyles: { fillColor: GRIS, textColor: NEGRO, fontSize: 6.8, fontStyle: 'bold', cellPadding: cpad },
    styles: { lineColor: AZUL_L, lineWidth: 0.2 },
    alternateRowStyles: { fillColor: GRIS2 },
    columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 38 }, 3: { cellWidth: 26, halign: 'right' } },
  });
  y = Math.max(yGastos, doc.lastAutoTable.finalY) + 2;

  /* ─ TABLAS CON COLUMNAS POR DÍA (alimentación / hospedaje) ─ */
  const tablaDias = ({ titulo, colorTitulo, cols, rows, mult }) => {
    const fechas = fechasColumna(rows);
    const n = fechas.length;
    const fw = n > 0 ? Math.max(12, Math.floor((CW - 10 - 48 - 30 - 28) / n)) : 0;
    const totalCol = 3 + n;
    const montoFila = r => (mult ? num(r.cantidad) || 1 : 1) * fechas.reduce((s, f) => s + montoDia(r, f), 0);
    const body = rows.map((r, i) => [
      String(i + 1),
      ...cols.fila(r),
      ...fechas.map(f => cellMonto(montoDia(r, f))),
      { content: fmt(montoFila(r)), styles: { fontStyle: 'bold', textColor: AZUL } },
    ]);
    if (!body.length) body.push(['1', '', '', ...fechas.map(() => ''), '']);
    const totDia = fechas.map(f => rows.reduce((s, r) => s + (mult ? num(r.cantidad) || 1 : 1) * montoDia(r, f), 0));
    const totalGeneral = rows.reduce((s, r) => s + montoFila(r), 0);
    const cp = { top: 1.5, bottom: 1.5, left: 1, right: 1 };

    if (y > H - 45) { doc.addPage(); y = M; }
    autoTable(doc, {
      startY: y, margin: { left: M, right: M }, tableWidth: CW,
      head: [
        [{ content: titulo, colSpan: 4 + n, styles: { fillColor: colorTitulo, textColor: BLANCO, fontStyle: 'bold', fontSize: 8.5, halign: 'left', cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 } } }],
        ['#', ...cols.head, ...fechas.map(dayHead), 'TOTAL'],
      ],
      body,
      foot: [['', 'TOTAL:', '', ...totDia.map(t => ({ content: cellMonto(t), styles: { halign: 'center' } })),
        { content: fmt(totalGeneral), styles: { halign: 'right', textColor: AZUL } }]],
      headStyles: { fillColor: AZUL, textColor: BLANCO, fontStyle: 'bold', fontSize: 6.8, halign: 'center', cellPadding: cp },
      bodyStyles: { fontSize: 6.8, textColor: NEGRO, cellPadding: cp },
      footStyles: { fillColor: GRIS, textColor: NEGRO, fontSize: 6.8, fontStyle: 'bold', cellPadding: cp },
      alternateRowStyles: { fillColor: GRIS2 },
      styles: { lineColor: AZUL_L, lineWidth: 0.2, overflow: 'linebreak' },
      tableLineColor: AZUL, tableLineWidth: 0.35,
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 30 },
        ...Object.fromEntries(fechas.map((_, i) => [i + 3, { cellWidth: fw, halign: 'center' }])),
        [totalCol]: { cellWidth: 28, halign: 'right' },
      },
      didParseCell(data) {
        const ci = data.column.index;
        if (data.section !== 'head' && ci >= 3 && ci < totalCol && esFinDeSemana(fechas[ci - 3])) data.cell.styles.fillColor = FINDE;
      },
    });
    y = doc.lastAutoTable.finalY + 2;
  };

  tablaDias({
    titulo: 'DETALLE DE ALIMENTACION', colorTitulo: AZUL_OSC, mult: false,
    cols: { head: ['Nombre', 'Cargo'], fila: r => [sa((r.nombre || '').toUpperCase()), sa((r.cargo || '').toUpperCase())] },
    rows: alimentacion,
  });

  tablaDias({
    titulo: 'DETALLE DE HOSPEDAJE', colorTitulo: AZUL_OSC, mult: true,
    cols: { head: ['DETALLE', 'CANTIDAD'], fila: r => [sa((r.detalle || '').toUpperCase()), String(num(r.cantidad) || 1)] },
    rows: hospedaje,
  });

  /* ─ FIRMA ─ */
  if (y > H - 24) { doc.addPage(); y = M + 6; }
  const gapFirma = 8, boxW = 60, leftW = CW - boxW - gapFirma, lblW = 24, boxH = 14, fbX = M + leftW + gapFirma;
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...NEGRO);
  doc.text('NOMBRE:', M, y + 3.5);
  doc.setFont('helvetica', 'normal'); doc.text(sa((rec.nombre_beneficiario || '').toUpperCase()), M + lblW, y + 3.5);
  doc.line(M + lblW, y + 5, M + leftW, y + 5);
  doc.rect(fbX, y - 2, boxW, boxH);
  doc.setFont('helvetica', 'bold'); doc.text('FIRMA', fbX + boxW / 2, y - 2 + boxH + 4, { align: 'center' });
  y += 8;
  doc.text('IDENTIDAD:', M, y + 3.5);
  doc.setFont('helvetica', 'normal'); doc.text(sa(rec.numero_identidad || ''), M + lblW, y + 3.5);
  doc.line(M + lblW, y + 5, M + leftW, y + 5);

  doc.save(`recibo_viaticos_seguridad_${(rec.numero_identidad || '').slice(-6)}_${String(rec.periodo_desde || '').slice(0, 10)}.pdf`);
}
