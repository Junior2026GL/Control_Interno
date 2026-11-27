import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { numeroALetras } from './numeroLetras';
import { resumenDeRegistro } from './viaticoSeguridadResumen';

const AZUL = [39, 76, 141], AZUL_OSC = [24, 48, 92], NEGRO = [30, 30, 30], BLANCO = [255, 255, 255];
const GRIS = [238, 242, 250], GRIS2 = [248, 250, 254], AZUL_L = [205, 218, 240], FINDE = [255, 243, 214];
const ETIQ = [55, 85, 145];

/* Las fuentes del PDF (Helvetica / Times) soportan tildes y Ñ, así que el texto se escribe tal cual */
const sa = s => (s || '');

const num = v => parseFloat(v) || 0;
const cantHosp = c => (c === '' || c == null || isNaN(parseFloat(c)) ? 1 : parseFloat(c));
const miles = v => num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = v => `L ${miles(v)}`;
const dash = v => (num(v) > 0 ? fmt(v) : '-');
const cellMonto = v => (num(v) > 0 ? fmt(v) : '');

function fmtFecha(s) {
  if (!s) return '';
  const [y, m, d] = String(s).split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}
/* "13:13" → "01:13 PM" (el input de hora guarda 24 h) */
function fmtHora(h) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '').trim());
  if (!m) return '';
  const hh = parseInt(m[1], 10);
  return `${String(hh % 12 || 12).padStart(2, '0')}:${m[2]} ${hh >= 12 ? 'PM' : 'AM'}`;
}
const partes = iso => String(iso).split('T')[0].split('-').map(Number);
function dayName(iso) {
  const [y, m, d] = partes(iso);
  return ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'][new Date(y, m - 1, d).getDay()];
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

/* Rectángulo que ocupa el contenido (lo que no es blanco ni transparente) de un
   canvas; se usa para recortar los márgenes blancos del logo. */
export function limitesContenido(ctx, w, h, umbral = 245, margen = 1) {
  const { data } = ctx.getImageData(0, 0, w, h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 10 && (data[i] < umbral || data[i + 1] < umbral || data[i + 2] < umbral)) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - margen); y0 = Math.max(0, y0 - margen);
  x1 = Math.min(w - 1, x1 + margen); y1 = Math.min(h - 1, y1 + margen);
  return { x: x0, y: y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1 };
}

/* Icono de viaje nacional: carretera entre montañas con el sol, dibujado en vector
   (centro cx, cy; con s = 1 mide unos 26 × 18 mm) */
function iconoNacional(doc, cx, cy, s) {
  const forma = (pts, estilo, cerrar) => {
    const lados = pts.slice(1).map((p, i) => [(p[0] - pts[i][0]) * s, (p[1] - pts[i][1]) * s]);
    doc.lines(lados, cx + pts[0][0] * s, cy + pts[0][1] * s, [1, 1], estilo, cerrar);
  };
  doc.setDrawColor(...BLANCO); doc.setFillColor(...BLANCO);
  doc.setLineWidth(0.7 * s); doc.setLineJoin('round');
  forma([[-13, 0], [-7, -6], [-3.5, -2.3], [2.5, -8.5], [9, -1.8], [10.5, -3], [13, 0]], 'S', false);   // montañas
  doc.circle(cx - 11 * s, cy - 6.5 * s, 1.7 * s, 'F');                                                  // sol
  forma([[-1.4, 1], [1.4, 1], [9.5, 9.3], [-9.5, 9.3]], 'F', true);                                     // carretera
  doc.setFillColor(...AZUL);                                       // línea central: [inicio, largo, ancho]
  [[1.9, 1.1, 0.35], [4, 1.7, 0.6], [6.8, 2.2, 0.95]].forEach(([y, h, w]) => doc.rect(cx - w * s / 2, cy + y * s, w * s, h * s, 'F'));
  doc.setLineJoin('miter');
}

/* ══════════════════════════════════════════════════════════
   Dibuja el recibo con la escala `k` (1 = tamaño normal).
   Todo lo vertical (alturas, espacios, letras) se multiplica por k.
══════════════════════════════════════════════════════════ */
function dibujar(doc, rec, logoDataUrl, k) {
  const W = 279.4, H = 215.9, M = 5, CW = W - 2 * M;   // M: margen igual en los cuatro bordes
  const FH = 8, FY = H - M - FH;            // franja del pie de página
  const MB = H - FY + 2;                    // margen inferior para las tablas
  const V = v => v * k;                       // longitudes verticales
  const F = v => Math.max(5, v * k);          // tamaños de letra (mínimo legible)
  let y = M;

  const alimentacion = rec.detalle_alimentacion || [];
  const hospedaje    = rec.detalle_hospedaje || [];

  /* ─ ENCABEZADO ─ */
  const HH = V(23), LW = HH + 4, TW = 80, MIDW = CW - LW - TW;
  doc.setFillColor(255, 255, 255); doc.setDrawColor(...AZUL); doc.setLineWidth(0.5);
  doc.rect(M, y, CW, HH, 'FD');
  if (logoDataUrl) {
    // alto = toda la caja; el ancho respeta la proporción del logo
    const p = doc.getImageProperties(logoDataUrl);
    const hL = HH - 0.8, wL = Math.min(LW - 1, hL * p.width / p.height);
    doc.addImage(logoDataUrl, 'PNG', M + (LW - wL) / 2, y + 0.4, wL, hL);
  }
  doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.3);
  doc.line(M + LW, y + 2, M + LW, y + HH - 2);
  const mX = M + LW + MIDW / 2;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
  doc.setFontSize(F(10)); doc.text('REPÚBLICA DE HONDURAS', mX, y + HH * 0.30, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(F(7.5));
  doc.text('CONGRESO NACIONAL DE HONDURAS', mX, y + HH * 0.54, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(F(9));
  doc.text('PAGADURÍA ESPECIAL', mX, y + HH * 0.80, { align: 'center' });
  const tX = M + LW + MIDW;
  doc.setFillColor(...AZUL); doc.rect(tX, y, TW, HH, 'F');
  const esc = HH / 23, zonaIcono = 34 * esc;
  iconoNacional(doc, tX + 19 * esc, y + HH / 2, esc);
  const cT = tX + zonaIcono + (TW - zonaIcono) / 2;      // los textos se centran en el espacio junto al icono
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...BLANCO);
  doc.setFontSize(F(9));  doc.text('RECIBO DE', cT, y + HH * 0.28, { align: 'center' });
  doc.setFontSize(F(15)); doc.text('VIÁTICOS', cT, y + HH * 0.64, { align: 'center' });
  doc.setFontSize(F(8));  doc.text('NACIONALES', cT, y + HH * 0.88, { align: 'center' });
  y += HH;

  /* ─ "RECIBI DE LA PAGADURIA…" ─ */
  const montoVal = num(rec.gran_total);
  const letras = sa(numeroALetras(montoVal));
  const RB = V(11);
  doc.setFillColor(...GRIS2); doc.setDrawColor(...AZUL); doc.setLineWidth(0.4);
  doc.rect(M, y, CW, RB, 'FD');
  const medir = (txt, fuente, estilo, tam) => { doc.setFont(fuente, estilo); doc.setFontSize(tam); return doc.getTextWidth(txt); };
  // Tres partes: [ etiqueta en recuadro azul ] [ monto en recuadro blanco ] [ cantidad en letras ]
  const etiqueta = 'Recibí de la Pagaduría Especial, la cantidad de:';
  const montoTxt = `L ${miles(montoVal)}`;
  const fsEtq = F(10.5), fsMonto = F(16);
  const etqW = medir(etiqueta, 'helvetica', 'bold', fsEtq) + 9;
  const montoW = medir(montoTxt, 'helvetica', 'bold', fsMonto) + 12;
  const letrasX = M + etqW + montoW + 7;
  const letrasW = M + CW - letrasX - 3;
  // La cantidad en letras usa hasta dos renglones; la letra solo se reduce si aun así no cabe
  let fsLetras = F(10), lineasL = [];
  for (;;) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fsLetras);
    lineasL = doc.splitTextToSize(letras, letrasW);
    if (lineasL.length <= 2 || fsLetras <= 6) break;
    fsLetras -= 0.25;
  }
  // 1) etiqueta: bloque azul con letra blanca (Helvetica en negrita, sin cursiva)
  doc.setFillColor(...AZUL); doc.rect(M, y, etqW, RB, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(fsEtq); doc.setTextColor(...BLANCO);
  doc.text(etiqueta, M + etqW / 2, y + RB / 2 + fsEtq * 0.3528 * 0.33, { align: 'center' });
  // 2) monto: recuadro blanco con borde, número grande
  const mx = M + etqW + 3.5, my = y + 1.4, mh = RB - 2.8;
  doc.setFillColor(255, 255, 255); doc.setDrawColor(...AZUL); doc.setLineWidth(0.35);
  doc.roundedRect(mx, my, montoW, mh, 1.2, 1.2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(fsMonto); doc.setTextColor(...AZUL);
  doc.text(montoTxt, mx + montoW / 2, my + mh / 2 + fsMonto * 0.3528 * 0.34, { align: 'center' });
  // 3) cantidad en letras, centrada en vertical
  doc.setFont('helvetica', 'bold'); doc.setFontSize(fsLetras); doc.setTextColor(...AZUL_OSC);
  const lhL = fsLetras * 0.3528 * 1.2;
  const y0 = y + (RB - lineasL.length * lhL) / 2 + lhL * 0.78;
  lineasL.forEach((l, i) => doc.text(l, letrasX, y0 + i * lhL));
  y += RB + V(1);

  /* ─ CAMPOS ─ */
  const RH = V(4.8);
  const cell = (lbl, val, ox, w, lblW = 34, h = RH, big = false, wrap = false) => {
    // Con wrap, el texto largo baja a más renglones y la celda crece en alto
    let lineas = null;
    if (wrap && !big) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(F(8));
      lineas = doc.splitTextToSize(sa(val || ''), w - lblW - 4);
      const lh = F(8) * 0.3528 * 1.2;
      h = Math.max(h, lineas.length * lh + V(1.8));
    }
    doc.setFillColor(...GRIS); doc.rect(M + ox, y, lblW, h, 'F');
    doc.setFillColor(255, 255, 255); doc.rect(M + ox + lblW, y, w - lblW, h, 'F');
    doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.2);
    doc.rect(M + ox, y, w, h, 'S'); doc.line(M + ox + lblW, y, M + ox + lblW, y + h);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(F(6)); doc.setTextColor(...ETIQ);
    doc.text(sa(lbl + ':'), M + ox + 1.5, y + (lineas ? RH : h) * 0.66);
    if (lineas) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(F(8)); doc.setTextColor(...NEGRO);
      const lh = F(8) * 0.3528 * 1.2;
      lineas.forEach((l, i) => doc.text(l, M + ox + lblW + 2, y + RH * 0.68 + i * lh));
      return h;
    }
    // El texto se escribe completo en una línea; si no cabe, se reduce la letra
    const txt = sa(val || '');
    const maxW = w - lblW - (big ? 3 : 4);
    let fs = F(big ? 10.5 : 8);
    doc.setFont('helvetica', big ? 'bold' : 'normal'); doc.setFontSize(fs);
    while (fs > 4 && doc.getTextWidth(txt) > maxW) { fs -= 0.25; doc.setFontSize(fs); }
    if (big) {
      doc.setTextColor(...AZUL);
      doc.text(txt, M + ox + lblW + (w - lblW) / 2, y + h * 0.68, { align: 'center' });
    } else {
      doc.setTextColor(...NEGRO);
      doc.text(txt, M + ox + lblW + 2, y + h * 0.68);
    }
  };

  y += cell('MISIÓN', rec.mision, 0, CW, 34, RH, false, true) || RH;
  cell('LUGAR', rec.lugar, 0, CW * 0.6); cell('DEPENDENCIA', rec.dependencia, CW * 0.6, CW * 0.4); y += RH;
  cell('NOMBRE DE QUIEN RECIBE', (rec.nombre_beneficiario || '').toUpperCase(), 0, CW * 0.68, 40, V(6.6), true);
  cell('IDENTIDAD', rec.numero_identidad, CW * 0.68, CW * 0.32, 22, V(6.6)); y += V(6.6);
  cell('CARGO', rec.cargo, 0, CW / 2); cell('ENCARGADO DE LA MISIÓN', rec.encargado_mision, CW / 2, CW / 2, 40); y += RH;
  const PL = 34, q = (CW - PL) / 4;
  doc.setFillColor(...GRIS); doc.rect(M, y, PL, RH, 'F');
  doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.2); doc.rect(M, y, PL, RH, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(F(6)); doc.setTextColor(...ETIQ);
  doc.text('PERÍODO DE TIEMPO:', M + 1.5, y + RH * 0.66);
  cell('DESDE', fmtFecha(rec.periodo_desde), PL, q, 14);
  cell('HASTA', fmtFecha(rec.periodo_hasta), PL + q, q, 14);
  cell('HORA DE SALIDA', fmtHora(rec.hora_salida) || '-', PL + 2 * q, q, 26);
  cell('HORA DE REGRESO', fmtHora(rec.hora_regreso) || '-', PL + 3 * q, q, 28);
  y += RH + V(2);

  /* ─ RESUMEN DE GASTOS (una sola tabla, filas editables) ─ */
  const pad = { top: V(1.2), bottom: V(1.2), left: 2.5, right: 2.5 };
  const filas = resumenDeRegistro(rec).map(r => [sa((r.descripcion || '').toUpperCase()), cellMonto(r.monto)]);
  while (filas.length < 5) filas.push(['', '']);
  autoTable(doc, {
    startY: y, margin: { left: M, right: W - M - Math.round(CW * 0.42), bottom: MB }, tableWidth: Math.round(CW * 0.42),
    head: [['No.', 'Detalle', 'TOTAL']],
    body: filas.map((f, i) => [String(i + 1), ...f]),
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
  y = doc.lastAutoTable.finalY + V(2.5);

  /* ─ TABLAS CON COLUMNAS POR DÍA (alimentación / hospedaje) ─ */
  const tablaDias = ({ titulo, cols, rows, mult }) => {
    const fechas = fechasColumna(rows);
    const n = fechas.length;
    const nc = cols.head.length;                      // columnas de texto (antes de los días)
    const b = 1 + nc;                                 // índice de la primera columna de día
    // Cada columna de texto mide lo que ocupa su contenido (el más largo de sus filas o su título);
    // después todo se reparte para llenar el ancho de la hoja, sin que una sola columna acapare el sobrante.
    const medirTxt = (txt, estilo, tam) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); return doc.getTextWidth(String(txt || '')); };
    let anchosTxt = cols.head.map((h, ci) => Math.max(
      medirTxt(h, 'bold', F(6.5)),
      ...rows.map(r => medirTxt(cols.fila(r)[ci], 'normal', F(7))),
    ) + 6);                                             // relleno de la celda + un poco de aire
    const cantidad = r => (mult ? cantHosp(r.cantidad) : 1);
    const montoFila = r => cantidad(r) * fechas.reduce((s, f) => s + montoDia(r, f), 0);
    const totDia = fechas.map(f => rows.reduce((s, r) => s + cantidad(r) * montoDia(r, f), 0));
    const totalGeneral = rows.reduce((s, r) => s + montoFila(r), 0);
    // Ancho mínimo de cada columna de día y del total: lo que mide su contenido (fecha, día de la semana y montos),
    // para que las fechas y los montos nunca se partan en dos renglones.
    const medirNeg = (txt, tam) => medirTxt(txt, 'bold', tam);
    const dayW = n > 0 ? Math.max(...fechas.flatMap(f => [
      ...String(dayHead(f)).split('\n').map(l => medirNeg(l, F(6.5))),
      ...rows.map(r => medirNeg(cellMonto(montoDia(r, f)), F(7))),
      medirNeg(cellMonto(rows.reduce((t, r) => t + cantidad(r) * montoDia(r, f), 0)), F(7)),
    ])) + 3.8 : 0;
    let fw = n > 0 ? Math.max(19, dayW) : 0;
    let anchoTot = Math.max(18, medirNeg(fmt(totalGeneral), F(7)) + 3.8, medirNeg('TOTAL', F(6.5)) + 3.8);
    const ANCHO_NUM = 8;                                // columna "#"
    const sumaAnchos = () => ANCHO_NUM + anchosTxt.reduce((x, y) => x + y, 0) + n * fw + anchoTot;
    if (sumaAnchos() > CW) {                            // falta espacio: primero se achican los días (sin partir fechas ni montos)
      if (n > 0) fw = Math.max(dayW, fw - (sumaAnchos() - CW) / n);
      let falta = sumaAnchos() - CW;
      if (falta > 0) {
        // Se recorta primero de las últimas columnas (Cargo) hasta el 55 % de su ancho natural, dejando el Nombre completo
        // en una sola línea mientras se pueda; la primera columna (Detalle) se respeta.
        const orden = anchosTxt.map((_, i) => i).filter(i => i > 0 || anchosTxt.length === 1).reverse();
        for (const i of orden) {
          const quita = Math.min(falta, anchosTxt[i] * 0.45);
          anchosTxt[i] -= quita; falta -= quita;
        }
        if (falta > 0.01) {                             // aún falta: se reparte entre esas columnas
          const tot = orden.reduce((x, i) => x + anchosTxt[i], 0);
          orden.forEach(i => { anchosTxt[i] -= (anchosTxt[i] / tot) * falta; });
        }
      }
    } else {                                            // sobra espacio: se reparte de forma proporcional
      const k = (CW - ANCHO_NUM) / (sumaAnchos() - ANCHO_NUM);
      anchosTxt = anchosTxt.map(w => w * k); fw *= k; anchoTot *= k;
    }
    const totalCol = b + n;
    const body = rows.map((r, i) => [
      String(i + 1), ...cols.fila(r),
      ...fechas.map(f => cellMonto(montoDia(r, f))),
      { content: fmt(montoFila(r)), styles: { fontStyle: 'bold', textColor: AZUL } },
    ]);
    if (!body.length) body.push(['1', ...cols.head.map(() => ''), ...fechas.map(() => ''), '']);
    const cp = { top: V(1.3), bottom: V(1.3), left: 1.5, right: 1.5 };

    if (y > FY - 40) { doc.addPage(); y = M; }
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, bottom: MB }, tableWidth: CW,
      head: [
        [{ content: titulo, colSpan: 2 + nc + n, styles: { fillColor: AZUL_OSC, textColor: BLANCO, fontStyle: 'bold', fontSize: F(7.5), halign: 'left', cellPadding: { top: V(1.4), bottom: V(1.4), left: 3, right: 3 } } }],
        ['#', ...cols.head, ...fechas.map(dayHead), 'TOTAL'],
      ],
      body,
      foot: [['', ...cols.head.map((_, i) => (i === 0 ? 'TOTAL:' : '')), ...totDia.map(t => ({ content: cellMonto(t), styles: { halign: 'center' } })),
        { content: fmt(totalGeneral), styles: { halign: 'right', textColor: AZUL } }]],
      headStyles: { fillColor: AZUL, textColor: BLANCO, fontStyle: 'bold', fontSize: F(6.5), halign: 'center', cellPadding: cp },
      bodyStyles: { fontSize: F(7), textColor: NEGRO, cellPadding: cp },
      footStyles: { fillColor: GRIS, textColor: NEGRO, fontSize: F(7), fontStyle: 'bold', cellPadding: cp },
      alternateRowStyles: { fillColor: GRIS2 },
      styles: { lineColor: AZUL_L, lineWidth: 0.2, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        ...Object.fromEntries(anchosTxt.map((w, i) => [i + 1, { cellWidth: w, halign: cols.alineos[i] }])),
        ...Object.fromEntries(fechas.map((_, i) => [i + b, { cellWidth: fw, halign: 'center' }])),
        [totalCol]: { cellWidth: anchoTot, halign: 'right' },
      },
      didParseCell(data) {
        const ci = data.column.index;
        if (data.section !== 'head' && ci >= b && ci < totalCol && esFinDeSemana(fechas[ci - b])) data.cell.styles.fillColor = FINDE;
      },
    });
    y = doc.lastAutoTable.finalY + V(2.5);
  };

  tablaDias({
    titulo: 'DETALLES DEL VIÁTICO', mult: false,
    cols: {
      head: ['Detalle', 'Nombre', 'Cargo'], anchos: [36, 'auto', 38], alineos: ['left', 'left', 'left'],
      fila: r => [sa((r.detalle || '').toUpperCase()), sa((r.nombre || '').toUpperCase()), sa((r.cargo || '').toUpperCase())],
    },
    rows: alimentacion,
  });
  /* Tabla de hospedaje oculta temporalmente (para volver a mostrarla, quitar el "false &&") */
  if (false && hospedaje) tablaDias({
    titulo: 'DETALLE DE HOSPEDAJE', mult: true,
    cols: { head: ['DETALLE', 'CANTIDAD'], anchos: ['auto', 22], alineos: ['left', 'center'], fila: r => [sa((r.detalle || '').toUpperCase()), String(cantHosp(r.cantidad))] },
    rows: hospedaje,
  });

  /* ─ FIRMA ─ */
  const FR = V(8.5);                       // alto de cada renglón de firma
  const ESPACIO_FIRMA = V(9);               // espacio extra para firmar a mano
  if (y > FY - 2 - FR * 4 - ESPACIO_FIRMA) { doc.addPage(); y = M + 6; }
  else y -= V(3);                           // sube un poco el bloque de firma, lejos del pie
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
  renglon(2, 'FECHA:', '');                 // se llena a mano
  renglon(3, 'FIRMA:', '', ESPACIO_FIRMA);

  /* ─ OBSERVACIONES: recuadro a la derecha de la firma; solo aparece si se escribió algo ─ */
  const obs = sa((rec.observaciones || '').trim());
  if (obs) {
    const bx = M + CW * 0.55, bw = CW * 0.45;
    const sep = V(6);                                  // separación respecto a la tabla de arriba
    const by = y + sep;
    const maxH = FR * 3.75 + ESPACIO_FIRMA - sep;      // no pasa del final del bloque de firma
    const th = V(5), pad = 2.5;                        // franja del título y margen interno
    // El texto se escribe completo; si no cabe en el espacio, se reduce la letra
    const anchoTxt = bw - 6;
    const parrafos = obs.split(/\r?\n/);
    // Cada línea guarda si es la última de su párrafo (esa no se justifica, igual que en Word)
    const envolver = () => parrafos.flatMap(p => {
      const ls = p.trim() ? doc.splitTextToSize(p, anchoTxt) : [''];
      return ls.map((t, i) => ({ t, ultima: i === ls.length - 1 }));
    });
    let fs = F(8.5), lineas = [];
    for (;;) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(fs);
      lineas = envolver();
      if (th + pad * 2 + lineas.length * fs * 0.3528 * 1.25 <= maxH || fs <= 5) break;
      fs -= 0.5;
    }
    const lh = fs * 0.3528 * 1.25;
    const maxLineas = Math.max(1, Math.floor((maxH - th - pad * 2) / lh));
    const mostradas = lineas.slice(0, maxLineas);
    const bh = Math.min(maxH, th + pad * 2 + mostradas.length * lh);   // el alto se adapta al contenido
    doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.3);
    doc.setFillColor(255, 255, 255); doc.rect(bx, by, bw, bh, 'F');
    doc.setFillColor(...GRIS); doc.rect(bx, by, bw, th, 'F');
    doc.rect(bx, by, bw, bh, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(F(6.5)); doc.setTextColor(...ETIQ);
    doc.text('OBSERVACIONES:', bx + 2, by + th * 0.7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(fs); doc.setTextColor(...NEGRO);
    // Texto justificado (tipo Word): el espacio sobrante se reparte entre las palabras de cada línea
    const anchoEspacio = doc.getTextWidth(' ');
    mostradas.forEach((ln, i) => {
      const yy = by + th + pad + (i + 0.8) * lh;
      const palabras = ln.t.split(' ').filter(Boolean);
      if (ln.ultima || palabras.length < 2) { doc.text(ln.t, bx + 3, yy); return; }
      const suma = palabras.reduce((s, p) => s + doc.getTextWidth(p), 0);
      const espacio = (anchoTxt - suma) / (palabras.length - 1);
      // Si habría que separar demasiado las palabras (líneas con muy pocas), se deja alineada a la izquierda
      if (espacio > anchoEspacio * 4) { doc.text(ln.t, bx + 3, yy); return; }
      let xx = bx + 3;
      palabras.forEach(p => { doc.text(p, xx, yy); xx += doc.getTextWidth(p) + espacio; });
    });
  }

  /* ─ PIE DE PÁGINA (todas las hojas) ─ */
  const totalPaginas = doc.getNumberOfPages();
  for (let pg = 1; pg <= totalPaginas; pg++) {
    doc.setPage(pg);
    doc.setFillColor(...AZUL);
    doc.rect(M, FY, CW, FH, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...BLANCO);
    doc.text('Congreso Nacional - Pagaduría Especial', M + 3, FY + FH * 0.65);
    doc.text(`Página ${pg} de ${totalPaginas}`, W / 2, FY + FH * 0.65, { align: 'center' });  }
}

/* Prueba escalas de mayor a menor hasta que todo quepa en una hoja. */
export async function generarReciboSeguridadPdf(rec, logoDataUrl) {
  const nuevo = () => new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const K_MIN = 0.6;
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
