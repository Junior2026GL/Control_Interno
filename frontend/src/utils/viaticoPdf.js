import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { limitesContenido } from './viaticoSeguridadPdf';

/* PDF de Viáticos Internacionales, con el mismo estilo que el recibo de Viáticos Nacionales */

const AZUL = [39, 76, 141], AZUL_OSC = [24, 48, 92], NEGRO = [30, 30, 30], BLANCO = [255, 255, 255];
const GRIS = [238, 242, 250], GRIS2 = [248, 250, 254], AZUL_L = [205, 218, 240], FINDE = [255, 243, 214];
const ETIQ = [55, 85, 145];
const DIAS_POR_TABLA = 10;   // con más días la tabla continúa en otra, para que no se partan fechas ni montos

const num = v => parseFloat(v) || 0;
const miles = v => num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = v => `$${miles(v)}`;
const usdCelda = v => (num(v) > 0 ? usd(v) : '');
const mayus = s => String(s || '').toUpperCase();
const sumar = dias => dias.reduce((s, d) => s + num(d.monto), 0);

/* Carga el logo y le recorta el margen blanco para que llene el encabezado */
async function loadImg(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const b = limitesContenido(ctx, c.width, c.height);
      if (!b) { resolve(c.toDataURL('image/png')); return; }
      const r = document.createElement('canvas');
      r.width = b.ancho; r.height = b.alto;
      r.getContext('2d').drawImage(c, b.x, b.y, b.ancho, b.alto, 0, 0, b.ancho, b.alto);
      resolve(r.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function fmtFecha(isoStr) {
  const s = (isoStr || '').substring(0, 10);
  const [yy, mm, dd] = s.split('-');
  return (dd || '') + '/' + (mm || '') + '/' + (yy || '');
}

const fechaLocal = iso => { const [y, m, d] = String(iso).substring(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const DIAS_SEMANA = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const esFinDeSemana = iso => [0, 6].includes(fechaLocal(iso).getDay());
function dayHead(iso) {
  const d = fechaLocal(iso);
  return `${DIAS_SEMANA[d.getDay()]}\n${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/* ══════════════════════════════════════════════════════════
   Dibuja el cuadro con la escala `k` (1 = tamaño normal).
══════════════════════════════════════════════════════════ */
function dibujar(doc, v, nombreUsuario, logoData, k) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 10, CW = W - M * 2;
  const FH = 8, FY = H - 5 - FH;            // franja del pie de página
  const MB = H - FY + 2;                    // margen inferior para las tablas
  const V = x => x * k;                     // longitudes verticales
  const F = x => Math.max(5, x * k);        // tamaños de letra (mínimo legible)
  let y = M;

  // Días de viaje (resumen) y de estadía (detalle); sin estadía, el detalle usa los de viaje
  const diasViaje   = v.dias_viaje   || (v.dias || []).filter(d => d.tipo === 'viaje'   || !d.tipo);
  const diasEstadia = v.dias_estadia || (v.dias || []).filter(d => d.tipo === 'estadia');
  const totalUSD    = sumar(diasViaje);
  const nombre      = v.diputado_nombre || '';

  /* ─ ENCABEZADO ─ */
  const HH = V(24), LW = HH + 4, TW = 80, MIDW = CW - LW - TW;
  doc.setFillColor(255, 255, 255); doc.setDrawColor(...AZUL); doc.setLineWidth(0.5);
  doc.rect(M, y, CW, HH, 'FD');
  if (logoData) {
    const p = doc.getImageProperties(logoData);
    const hL = HH - 0.8, wL = Math.min(LW - 1, hL * p.width / p.height);
    doc.addImage(logoData, 'PNG', M + (LW - wL) / 2, y + 0.4, wL, hL);
  }
  doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.3);
  doc.line(M + LW, y + 2, M + LW, y + HH - 2);
  const mX = M + LW + MIDW / 2;
  const titulo = (txt, estilo, tam, alto) => {
    doc.setFont('helvetica', estilo); doc.setFontSize(F(tam)); doc.setTextColor(...AZUL);
    doc.text(txt, mX, y + HH * alto, { align: 'center' });
  };
  titulo('REPÚBLICA DE HONDURAS', 'bold', 10, 0.24);
  titulo('CONGRESO NACIONAL DE HONDURAS', 'normal', 7.5, 0.45);
  titulo('PAGADURÍA ESPECIAL', 'bold', 9, 0.67);
  titulo('DETALLE DE CÁLCULO DE VIÁTICOS AL EXTERIOR', 'normal', 7.5, 0.88);
  const tX = M + LW + MIDW;
  doc.setFillColor(...AZUL); doc.rect(tX, y, TW, HH, 'F');
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...BLANCO);
  doc.setFontSize(F(9));  doc.text('CUADRO DE CÁLCULOS', tX + TW / 2, y + HH * 0.28, { align: 'center' });
  doc.setFontSize(F(15)); doc.text('VIÁTICOS', tX + TW / 2, y + HH * 0.64, { align: 'center' });
  doc.setFontSize(F(8));  doc.text('AL EXTERIOR', tX + TW / 2, y + HH * 0.88, { align: 'center' });
  y += HH + V(1.5);

  /* ─ CAMPOS ─ */
  const RH = V(5.2);
  const cell = (lbl, val, ox, w, lblW = 34, h = RH, big = false, wrap = false) => {
    // Con wrap, el texto largo baja a más renglones y la celda crece en alto
    let lineas = null;
    const lh = F(8) * 0.3528 * 1.2;
    if (wrap) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(F(8));
      lineas = doc.splitTextToSize(val || '', w - lblW - 4);
      h = Math.max(h, lineas.length * lh + V(1.8));
    }
    doc.setFillColor(...GRIS); doc.rect(M + ox, y, lblW, h, 'F');
    doc.setFillColor(255, 255, 255); doc.rect(M + ox + lblW, y, w - lblW, h, 'F');
    doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.2);
    doc.rect(M + ox, y, w, h, 'S'); doc.line(M + ox + lblW, y, M + ox + lblW, y + h);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(F(6)); doc.setTextColor(...ETIQ);
    doc.text(lbl + ':', M + ox + 1.5, y + (lineas ? RH : h) * 0.66);
    if (lineas) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(F(8)); doc.setTextColor(...NEGRO);
      lineas.forEach((l, i) => doc.text(l, M + ox + lblW + 2, y + RH * 0.68 + i * lh));
      return h;
    }
    // El texto se escribe completo en una línea; si no cabe, se reduce la letra
    const txt = String(val || '');
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
    return h;
  };

  y += cell('MOTIVO DEL VIAJE', mayus(v.motivo_viaje), 0, CW, 34, RH, false, true);
  cell('LUGAR', mayus(v.lugar), 0, CW * 0.6); cell('CARGO', mayus(v.cargo), CW * 0.6, CW * 0.4); y += RH;
  cell('NOMBRE', mayus(nombre), 0, CW * 0.68, 34, V(6.8), true);
  cell('IDENTIDAD', v.identidad || '', CW * 0.68, CW * 0.32, 22, V(6.8)); y += V(6.8);
  const PL = 34, tercio = (CW - PL) / 3;
  doc.setFillColor(...GRIS); doc.rect(M, y, PL, RH, 'F');
  doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.2); doc.rect(M, y, PL, RH, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(F(6)); doc.setTextColor(...ETIQ);
  doc.text('PERÍODO DE TIEMPO:', M + 1.5, y + RH * 0.66);
  cell('DESDE', fmtFecha(v.fecha_inicio), PL, tercio, 14);
  cell('HASTA', fmtFecha(v.fecha_fin), PL + tercio, tercio, 14);
  cell('DÍAS', v.periodo_dias != null ? String(num(v.periodo_dias)) : '', PL + 2 * tercio, tercio, 14);
  y += RH + V(2.5);

  /* ─ CUADRITO DE RESUMEN ─ */
  const pad = { top: V(1.2), bottom: V(1.2), left: 2.5, right: 2.5 };
  const anchoRes = Math.round(CW * 0.42);
  autoTable(doc, {
    startY: y, margin: { left: M, right: W - M - anchoRes, bottom: MB }, tableWidth: anchoRes,
    head: [['No.', 'Detalle', 'TOTAL']],
    body: [
      ['1', 'ALIMENTACIÓN Y HOSPEDAJE', usd(totalUSD)],
      ['2', 'COMPLEMENTO', usd(0)],
      ['3', 'OTROS', usd(0)],
    ],
    foot: [[
      { content: 'GRAN TOTAL:', colSpan: 2, styles: { halign: 'right' } },
      { content: usd(totalUSD), styles: { halign: 'right' } },
    ]],
    headStyles: { fillColor: AZUL, textColor: BLANCO, fontStyle: 'bold', fontSize: F(7), cellPadding: pad },
    bodyStyles: { fontSize: F(7.5), textColor: NEGRO, cellPadding: pad },
    footStyles: { fillColor: AZUL_OSC, textColor: BLANCO, fontStyle: 'bold', fontSize: F(9), cellPadding: pad },
    alternateRowStyles: { fillColor: GRIS2 },
    styles: { lineColor: AZUL_L, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 11, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 36, halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + V(2.5);

  /* ─ TABLAS CON COLUMNAS POR DÍA (los montos van en el primer renglón) ─ */
  const tablaDias = (tituloTabla, filas, dias) => {
    const total = sumar(dias);
    const bloques = [];
    for (let i = 0; i < dias.length; i += DIAS_POR_TABLA) bloques.push(dias.slice(i, i + DIAS_POR_TABLA));
    if (!bloques.length) bloques.push([]);
    const varios = bloques.length > 1;
    bloques.forEach((bloque, nb) => {
      const n = bloque.length;
      const ultimo = nb === bloques.length - 1;
      const cabeza = ['Detalle', 'Nombre', 'Cargo'];
      const finales = varios ? (ultimo ? ['SUBTOTAL', 'TOTAL'] : ['SUBTOTAL']) : ['TOTAL'];
      const valoresFin = varios ? (ultimo ? [sumar(bloque), total] : [sumar(bloque)]) : [total];
      const medir = (txt, estilo, tam) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); return doc.getTextWidth(String(txt || '')); };
      let anchosTxt = cabeza.map((h, c) => Math.max(medir(h, 'bold', F(6.5)), ...filas.map(f => medir(f[c], 'normal', F(7)))) + 6);
      const dayW = n ? Math.max(...bloque.flatMap(d => [
        ...dayHead(d.fecha).split('\n').map(l => medir(l, 'bold', F(6.5))),
        medir(usd(d.monto), 'bold', F(7)),
      ])) + 3.8 : 0;
      let fw = n ? Math.max(19, dayW) : 0;
      let anchoFin = Math.max(18, medir(usd(total), 'bold', F(7)) + 3.8, medir('SUBTOTAL', 'bold', F(6.5)) + 3.8);
      const ANCHO_NUM = 8;
      const suma = () => ANCHO_NUM + anchosTxt.reduce((a, b) => a + b, 0) + n * fw + finales.length * anchoFin;
      if (suma() > CW) {             // falta espacio: primero se achican los días y luego las columnas de texto
        if (n) fw = Math.max(dayW, fw - (suma() - CW) / n);
        const falta = suma() - CW;
        if (falta > 0) {
          const tot = anchosTxt.reduce((a, b) => a + b, 0);
          anchosTxt = anchosTxt.map(w => w - (w / tot) * falta);
        }
      } else {                       // sobra espacio: se reparte de forma proporcional
        const r = (CW - ANCHO_NUM) / (suma() - ANCHO_NUM);
        anchosTxt = anchosTxt.map(w => w * r); fw *= r; anchoFin *= r;
      }
      const b = 1 + cabeza.length;   // primera columna de día
      const cp = { top: V(1.3), bottom: V(1.3), left: 1.5, right: 1.5 };

      if (y > FY - 30) { doc.addPage(); y = M; }
      autoTable(doc, {
        startY: y, margin: { left: M, right: M, bottom: MB }, tableWidth: CW,
        head: [
          [{ content: nb ? `${tituloTabla} (continuación)` : tituloTabla, colSpan: b + n + finales.length, styles: { fillColor: AZUL_OSC, fontSize: F(7.5), halign: 'left', cellPadding: { top: V(1.4), bottom: V(1.4), left: 3, right: 3 } } }],
          ['#', ...cabeza, ...bloque.map(d => dayHead(d.fecha)), ...finales],
        ],
        body: filas.map((f, i) => [
          String(i + 1), ...f,
          ...bloque.map(d => (i === 0 ? usdCelda(d.monto) : '')),
          ...valoresFin.map(t => ({ content: usd(i === 0 ? t : 0), styles: { fontStyle: 'bold', textColor: AZUL } })),
        ]),
        foot: [['', 'TOTAL:', '', '',
          ...bloque.map(d => ({ content: usdCelda(d.monto), styles: { halign: 'center' } })),
          ...valoresFin.map(t => ({ content: usd(t), styles: { halign: 'right', textColor: AZUL } })),
        ]],
        showFoot: 'lastPage',
        headStyles: { fillColor: AZUL, textColor: BLANCO, fontStyle: 'bold', fontSize: F(6.5), halign: 'center', cellPadding: cp },
        bodyStyles: { fontSize: F(7), textColor: NEGRO, cellPadding: cp },
        footStyles: { fillColor: GRIS, textColor: NEGRO, fontSize: F(7), fontStyle: 'bold', cellPadding: cp },
        alternateRowStyles: { fillColor: GRIS2 },
        styles: { lineColor: AZUL_L, lineWidth: 0.2, overflow: 'linebreak' },
        columnStyles: {
          0: { cellWidth: ANCHO_NUM, halign: 'center' },
          ...Object.fromEntries(anchosTxt.map((w, i) => [i + 1, { cellWidth: w, halign: 'left' }])),
          ...Object.fromEntries(bloque.map((_, i) => [b + i, { cellWidth: fw, halign: 'center' }])),
          ...Object.fromEntries(finales.map((_, i) => [b + n + i, { cellWidth: anchoFin, halign: 'right' }])),
        },
        didParseCell(data) {
          const ci = data.column.index;
          if (data.section !== 'head' && ci >= b && ci < b + n && esFinDeSemana(bloque[ci - b].fecha)) data.cell.styles.fillColor = FINDE;
        },
      });
      y = doc.lastAutoTable.finalY + V(2.5);
    });
  };

  const filasDetalle = (v.detalle?.length ? v.detalle : [{}]).map((r, i) => [
    mayus(r.detalle || (i === 0 ? 'ALIMENTACIÓN Y HOSPEDAJE' : '')),
    mayus(r.nombre || (i === 0 ? nombre : '')),
    mayus(r.cargo || (i === 0 ? v.cargo : '')),
  ]);
  // Si la estadía tiene días o montos distintos a los del viaje, se muestran las dos tablas
  const huella = dias => dias.map(d => `${String(d.fecha).slice(0, 10)}:${num(d.monto)}`).join('|');
  if (diasEstadia.length && huella(diasEstadia) !== huella(diasViaje)) {
    tablaDias('DÍAS DE VIAJE', [['ALIMENTACIÓN Y HOSPEDAJE', filasDetalle[0][1], mayus(v.cargo)]], diasViaje);
    tablaDias('DETALLE HOSPEDAJE Y ALIMENTACIÓN (ESTADÍA)', filasDetalle, diasEstadia);
  } else {
    tablaDias('DETALLES DEL VIÁTICO', filasDetalle, diasViaje);
  }

  /* ─ DÓLARES, TASA, LEMPIRAS, DETALLE + NOTAS (este bloque no cambia de tamaño) ─ */
  const tasa    = parseFloat(v.tasa_cambio) || 1;
  const lps     = totalUSD * tasa;
  const TOT_W   = Math.round(CW * 0.30);
  const NOTA_W  = CW - TOT_W;
  const NOTE_FS = 6.0;
  const NOTE_LINE_H = 3.5;
  const NOTA_TXT_W = NOTA_W - 8;
  const tw = Math.floor((TOT_W - 5) / 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(NOTE_FS);
  const n1 = doc.splitTextToSize(v.nota1 || '', NOTA_TXT_W);
  const n2 = doc.splitTextToSize(v.nota2 || '', NOTA_TXT_W);
  const obsLineas = doc.splitTextToSize(mayus(v.obs_detalle), tw - 2);
  const notaLinesH = (n1.length + (n2.length ? n2.length + 0.5 : 0)) * NOTE_LINE_H;
  const BLOQUE_H = Math.max(22, 13 + notaLinesH, 13 + obsLineas.length * NOTE_LINE_H);

  const PILL_LABELS = ['DOLARES', 'TASA DE CAMBIO', 'LEMPIRAS', 'DETALLE'];
  const PILL_VALS = [
    '$' + totalUSD.toFixed(2),
    tasa.toFixed(4),
    'L ' + lps.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  ];

  if (y + BLOQUE_H > H - MB) { doc.addPage(); y = M; }
  autoTable(doc, {
    startY: y,
    body: [['', '']],
    margin: { left: M, right: M, bottom: MB },
    tableWidth: CW,
    styles: { lineColor: AZUL, lineWidth: 0.2, cellPadding: 0, minCellHeight: BLOQUE_H },
    columnStyles: {
      0: { cellWidth: TOT_W,  fillColor: [243, 244, 248] },
      1: { cellWidth: NOTA_W, fillColor: [252, 253, 255] },
    },
    didDrawCell: ({ column, cell: c }) => {
      const cx = c.x, cy = c.y, ch = c.height;
      if (column.index === 0) {
        PILL_LABELS.forEach((etq, i) => {
          const px = cx + 1 + i * (tw + 1);
          doc.setFillColor(...AZUL);
          doc.roundedRect(px, cy + 1.5, tw, 6, 1, 1, 'F');
          doc.setTextColor(...BLANCO);
          doc.setFont('helvetica', 'bold');
          let fs = 6;
          doc.setFontSize(fs);
          while (fs > 4 && doc.getTextWidth(etq) > tw - 1) { fs -= 0.2; doc.setFontSize(fs); }   // que la etiqueta no se corte
          doc.text(etq, px + tw / 2, cy + 5.8, { align: 'center' });
          doc.setTextColor(...AZUL_OSC);
          if (i === 3) {              // DETALLE: texto libre, puede ocupar varios renglones
            doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
            obsLineas.forEach((line, li) => doc.text(line, px + tw / 2, cy + 10 + li * 3.5, { align: 'center' }));
          } else {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
            doc.text(PILL_VALS[i], px + tw / 2, cy + ch / 2 + 5, { align: 'center' });
          }
        });
      } else {
        doc.setFillColor(...AZUL);
        doc.rect(cx, cy, c.width, 6.5, 'F');
        doc.setTextColor(...BLANCO);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text('NOTAS:', cx + 3, cy + 5.0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(NOTE_FS);
        doc.setTextColor(40, 40, 40);
        doc.text(n1, cx + 3, cy + 10);
        if (n2.length) doc.text(n2, cx + 3, cy + 10 + n1.length * NOTE_LINE_H + NOTE_LINE_H * 0.6);
      }
    },
  });
  y = doc.lastAutoTable.finalY + V(2);

  /* ─ FIRMA (izquierda) y ELABORADO POR (derecha) ─ */
  const FR = V(6.8);                         // alto de cada renglón de firma
  const ESPACIO_FIRMA = V(7);                // espacio extra para firmar a mano
  const ALTO_FIRMA = FR * 5 + ESPACIO_FIRMA;
  if (y + ALTO_FIRMA > FY - 1) { doc.addPage(); y = M + 4; }
  const lblW = 24, lineW = 70;
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
  renglon(0, 'NOMBRE:', mayus(nombre));
  renglon(1, 'IDENTIDAD:', v.identidad || '');
  renglon(2, 'TELÉFONO:', v.telefono || '');
  renglon(3, 'FECHA:', '');                  // se llena a mano
  renglon(4, 'FIRMA:', '', ESPACIO_FIRMA);

  const cxR = M + CW * 0.75, mitad = 35;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(F(8)); doc.setTextColor(...NEGRO);
  doc.text('Elaborado por:', cxR, y + V(9), { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
  doc.text(mayus(nombreUsuario || v.elaborado_por_nombre), cxR, y + V(15), { align: 'center' });
  doc.line(cxR - mitad, y + V(16.5), cxR + mitad, y + V(16.5));
  doc.line(cxR - mitad, y + V(31), cxR + mitad, y + V(31));
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...NEGRO);
  doc.text('Firma', cxR, y + V(35), { align: 'center' });

  /* ─ PIE DE PÁGINA (todas las hojas) ─ */
  const totalPaginas = doc.getNumberOfPages();
  for (let pg = 1; pg <= totalPaginas; pg++) {
    doc.setPage(pg);
    doc.setFillColor(...AZUL);
    doc.rect(M, FY, CW, FH, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...BLANCO);
    doc.text('Congreso Nacional - Pagaduría Especial', M + 3, FY + FH * 0.65);
    doc.text(`Página ${pg} de ${totalPaginas}`, W / 2, FY + FH * 0.65, { align: 'center' });
  }
}

export async function generarPdfViatico(v, nombreUsuario) {
  const logoData = await loadImg('/logo-congreso.png.png');

  // Carta hasta 7 días; oficio (legal) si hay más
  const diasViaje   = v.dias_viaje   || (v.dias || []).filter(d => d.tipo === 'viaje'   || !d.tipo);
  const diasEstadia = v.dias_estadia || (v.dias || []).filter(d => d.tipo === 'estadia');
  const formato = Math.max(diasViaje.length, diasEstadia.length) > 7 ? 'legal' : 'letter';
  const nuevo = () => new jsPDF({ orientation: 'landscape', unit: 'mm', format: formato });

  // Prueba escalas de mayor a menor hasta que todo quepa en una hoja
  const K_MIN = 0.7;
  let k = 1;
  for (; k > K_MIN; k = Math.round((k - 0.04) * 100) / 100) {
    const prueba = nuevo();
    dibujar(prueba, v, nombreUsuario, null, k);
    if (prueba.getNumberOfPages() === 1) break;
  }
  // Si ni con la escala mínima cabe, se usa tamaño normal en varias hojas
  if (k <= K_MIN) {
    const prueba = nuevo();
    dibujar(prueba, v, nombreUsuario, null, K_MIN);
    k = prueba.getNumberOfPages() === 1 ? K_MIN : 1;
  }

  const doc = nuevo();
  dibujar(doc, v, nombreUsuario, logoData, k);
  doc.save('viatico_' + (v.diputado_nombre || 'doc').replace(/\s+/g, '_') + '_' + fmtFecha(v.fecha_inicio) + '.pdf');
}
