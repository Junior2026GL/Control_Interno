import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

async function loadImg(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
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

function getDayName(isoStr) {
  const s = (isoStr || '').substring(0, 10);
  const [yy, mm, dd] = s.split('-');
  const d = new Date(parseInt(yy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
  const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  return days[d.getDay()];
}

export async function generarPdfViatico(v, nombreUsuario) {
  const logoData = await loadImg('/logo-congreso.png.png');

  // Auto-switch: carta (≤7 días) o legal/oficio (>7 días)
  const totalDias = (v.dias || []).length;
  const formato   = totalDias > 7 ? 'legal' : 'letter';

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: formato });
  const W  = doc.internal.pageSize.getWidth();
  const H  = doc.internal.pageSize.getHeight();
  const M  = 10;   // márgenes laterales
  const CW = W - M * 2;

  const C_AZUL_OSC = [22,  51, 110];
  const C_AZUL     = [39,  76, 141];
  const C_AZUL_CLR = [58,  96, 165];
  const C_GRIS     = [243, 244, 248];
  const C_NEGRO    = [25,  25,  25];
  const C_BLANCO   = [255, 255, 255];
  const C_LINEA    = [200, 210, 228];
  const C_CELDA    = [235, 242, 255];

  let y = M;

  // -------------------------------------------------------
  // ENCABEZADO  (más compacto)
  // -------------------------------------------------------
  const HH     = 42;
  const LOGO_W = 50;

  // Caja del encabezado
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...C_AZUL);
  doc.setLineWidth(0.5);
  doc.rect(M, y, CW, HH, 'FD');

  // Logo
  if (logoData) {
    const lSize = HH - 6;
    doc.addImage(logoData, 'PNG', M + (LOGO_W - lSize) / 2, y + 3, lSize, lSize);
  }

  // Línea divisoria logo | texto
  doc.setDrawColor(180, 200, 235);
  doc.setLineWidth(0.3);
  doc.line(M + LOGO_W, y + 4, M + LOGO_W, y + HH - 4);

  // Títulos centrados en la mitad derecha
  const hCX = M + LOGO_W + (CW - LOGO_W) / 2;
  doc.setTextColor(...C_AZUL_OSC);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('REPÚBLICA DE HONDURAS', hCX, y + 11, { align: 'center' });
  doc.setFontSize(10);
  doc.text('CONGRESO NACIONAL', hCX, y + 18, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('PAGADURÍA ESPECIAL', hCX, y + 27, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C_AZUL);
  doc.text('CUADRO DE CALCULOS DE VIÁTICOS', hCX, y + 35, { align: 'center' });

  y += HH + 1;

  // -------------------------------------------------------
  // DATOS GENERALES (2 columnas)
  // -------------------------------------------------------
  const datos = [
    ['MOTIVO DEL VIAJE:', (v.motivo_viaje || '').toUpperCase()],
    ['LUGAR:',            (v.lugar        || '').toUpperCase()],
    ['NOMBRE:',           (v.diputado_nombre || '').toUpperCase()],
    ['DNI:',              v.identidad || ''],
    ['PERIODO DE TIEMPO:', String(v.periodo_dias) + ' dias'],
    ['CARGO:',            (v.cargo || '').toUpperCase()],
  ];

  // Fondo gris filas pares
  const LBL_W = 44;
  const ROW_H = 5.0;
  const HALF  = CW / 2;

  datos.forEach(([lbl, val], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(...C_GRIS);
      doc.rect(M, y, CW, ROW_H, 'F');
    }
    // Etiqueta
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C_AZUL_OSC);
    doc.text(lbl, M + 2, y + ROW_H * 0.68);

    // Valor centrado y en negrita
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C_NEGRO);
    const shown = doc.splitTextToSize(val, CW - LBL_W - 4)[0] || '';
    const centerX = M + LBL_W + (CW - LBL_W) / 2;
    doc.text(shown, centerX, y + ROW_H * 0.68, { align: 'center' });

    doc.setDrawColor(...C_LINEA);
    doc.setLineWidth(0.15);
    doc.line(M, y + ROW_H, M + CW, y + ROW_H);
    y += ROW_H;
  });

  // Borde exterior datos
  doc.setDrawColor(...C_AZUL);
  doc.setLineWidth(0.4);
  doc.rect(M, y - datos.length * ROW_H, CW, datos.length * ROW_H);

  y += 2.5;

  // -------------------------------------------------------
  // FECHAS
  // -------------------------------------------------------
  const dias    = v.dias || [];
  const maxDays = Math.min(dias.length, 13);

  // Encabezado de fecha: "LUNES\n2/3/2026"
  const colFechas = dias.slice(0, maxDays).map(d => {
    const s = (d.fecha || '').substring(0, 10);
    const [yy, mm, dd] = s.split('-');
    const dayName = getDayName(s);
    return dayName + '\n' + parseInt(dd, 10) + '/' + parseInt(mm, 10) + '/' + yy;
  });

  const totalUSD = dias.reduce((s, d) => s + (parseFloat(d.monto) || 0), 0);

  // Anchos adaptativos: fecha mín 13 mm, nombre y detalle con caps razonables
  const FIXED_NO   = 7;
  const MIN_DATE   = 13;
  const MIN_TOT    = 16;

  // Anchos base: suficientes para nombres largos y "ALIMENTACIÓN Y HOSPEDAJE"
  let nombreW  = 54;
  let detalleW = 44;
  let fechaW   = 22;

  if (maxDays > 0) {
    const avail = CW - FIXED_NO - nombreW - detalleW;
    const raw   = Math.floor(avail / (maxDays + 1)); // +1 reserva columna TOTAL

    if (raw < MIN_DATE) {
      // Muchos días: comprimir nombre/detalle para que quepan las fechas a mínimo
      const totalND = CW - FIXED_NO - MIN_DATE * (maxDays + 1);
      nombreW  = Math.max(40, Math.round(totalND * 0.55));
      detalleW = Math.max(30, totalND - nombreW);
      fechaW   = MIN_DATE;
    } else {
      // Pocos días: limitar fecha a 22 mm y repartir sobrante entre nombre y detalle
      fechaW = Math.min(22, raw);
      const surplus = CW - FIXED_NO - nombreW - detalleW - fechaW * maxDays - MIN_TOT;
      if (surplus > 0) {
        nombreW  = Math.min(75, nombreW  + Math.round(surplus * 0.6));
        detalleW = Math.min(60, detalleW + Math.round(surplus * 0.4));
      }
    }
  }

  // TOTAL toma exactamente el sobrante → suma de anchos = CW siempre
  const FIXED_TOT = CW - FIXED_NO - nombreW - detalleW - fechaW * maxDays;

  const baseColStyles = {
    0: { cellWidth: FIXED_NO,  halign: 'center' },
    1: { cellWidth: nombreW,   halign: 'center' },
    2: { cellWidth: detalleW,  halign: 'left'   },
    ...Object.fromEntries(colFechas.map((_, i) => [i + 3, { cellWidth: fechaW, halign: 'center' }])),
    [3 + colFechas.length]: { cellWidth: FIXED_TOT, halign: 'right' },
  };

  const headStyle = {
    fillColor: C_AZUL,
    textColor: C_BLANCO,
    fontStyle: 'bold',
    halign: 'center',
    fontSize: 7,
    cellPadding: { top: 1.0, bottom: 1.0, left: 1, right: 1 },
  };
  const bodyStyle = {
    fontSize: 7.5,
    cellPadding: { top: 1.0, bottom: 1.0, left: 1.2, right: 1.2 },
    textColor: C_NEGRO,
    lineColor: C_LINEA,
    lineWidth: 0.2,
  };

  // ---- TABLA 1: RESUMEN -----------------------------------
  doc.setFillColor(...C_AZUL);
  doc.rect(M, y, CW, 5, 'F');
  doc.setTextColor(...C_BLANCO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('RESUMEN DE VIATICOS:', M + 3, y + 3.6);
  y += 5;

  const nombrePrincipal = (v.detalle && v.detalle[0]?.nombre) || v.diputado_nombre || '';
  const realResumenCount = (v.detalle || []).length;

  const resumenBody = (v.detalle || []).map((row, idx) => {
    const montos = dias.slice(0, maxDays).map(d =>
      idx === 0 && parseFloat(d.monto) > 0 ? '$' + parseFloat(d.monto).toFixed(2) : ''
    );
    const tot = idx === 0 ? '$' + totalUSD.toFixed(2) : '';
    const nombre = (row.nombre || (idx === 0 ? nombrePrincipal : '')).toUpperCase();
    return [String(idx + 1), nombre, row.detalle || 'ALIMENTACION Y HOSPEDAJE', ...montos, tot];
  });

  resumenBody.push(['', 'TOTAL:', '', ...colFechas.map(() => ''), '$' + totalUSD.toFixed(2)]);

  autoTable(doc, {
    startY: y,
    head: [['No.', 'NOMBRE', 'DETALLE', ...colFechas, 'TOTAL']],
    body: resumenBody,
    margin: { left: M, right: M },
    tableWidth: CW,
    styles: bodyStyle,
    headStyles: headStyle,
    columnStyles: baseColStyles,
    didParseCell: ({ row, cell, column }) => {
      if (row.section === 'body') {
        if (row.index === resumenBody.length - 1) {
          cell.styles.fontStyle = 'bold';
          cell.styles.fillColor = C_CELDA;
          cell.styles.textColor = C_AZUL_OSC;
        } else if (row.index % 2 === 1) {
          cell.styles.fillColor = [250, 252, 255];
        }
        if (column.index === 3 + colFechas.length) {
          cell.styles.textColor = C_AZUL;
          cell.styles.fontStyle = 'bold';
        }
      }
    },
  });
  y = doc.lastAutoTable.finalY + 1.5;

  // ---- TABLA 2: DETALLE ----------------------------------
  doc.setFillColor(...C_AZUL);
  doc.rect(M, y, CW, 5, 'F');
  doc.setTextColor(...C_BLANCO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('DETALLE HOSPEDAJE Y ALIMENTACION', M + 3, y + 3.6);
  y += 5;

  const realDetalleCount = (v.detalle || []).length;

  const detalleBody = (v.detalle || []).map((row, idx) => {
    const montos = dias.slice(0, maxDays).map(d =>
      idx === 0 && parseFloat(d.monto) > 0 ? '$' + parseFloat(d.monto).toFixed(2) : ''
    );
    const tot = idx === 0 ? '$' + totalUSD.toFixed(2) : '';
    const nombre = (row.nombre || (idx === 0 ? nombrePrincipal : '')).toUpperCase();
    const cargo  = (row.cargo  || (idx === 0 ? v.cargo || '' : '')).toUpperCase();
    return [String(idx + 1), nombre, cargo, ...montos, tot];
  });
  detalleBody.push(['', 'TOTAL:', '', ...colFechas.map(() => ''), '$' + totalUSD.toFixed(2)]);

  autoTable(doc, {
    startY: y,
    head: [['No.', 'NOMBRE', 'CARGO', ...colFechas, 'TOTAL']],
    body: detalleBody,
    margin: { left: M, right: M },
    tableWidth: CW,
    styles: bodyStyle,
    headStyles: headStyle,
    columnStyles: baseColStyles,
    didParseCell: ({ row, cell, column }) => {
      if (row.section === 'body') {
        if (row.index === detalleBody.length - 1) {
          cell.styles.fontStyle = 'bold';
          cell.styles.fillColor = C_CELDA;
          cell.styles.textColor = C_AZUL_OSC;
        } else if (row.index % 2 === 1) {
          cell.styles.fillColor = [250, 252, 255];
        }
        if (column.index === 3 + colFechas.length) {
          cell.styles.textColor = C_AZUL;
          cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  // -------------------------------------------------------
  // TOTALES + NOTAS  — dibujado con autoTable para bordes uniformes
  // -------------------------------------------------------
  const tasa    = parseFloat(v.tasa_cambio) || 1;
  const lps     = totalUSD * tasa;
  const TOT_W   = Math.round(CW * 0.30);
  const NOTA_W  = CW - TOT_W;
  const NOTE_FS = 6.0;
  const NOTE_LINE_H = 3.5;
  const NOTE_PAD_BOT = 3;
  const NOTA_TXT_W = NOTA_W - 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(NOTE_FS);
  const n1 = doc.splitTextToSize(v.nota1 || '', NOTA_TXT_W);
  const n2 = doc.splitTextToSize(v.nota2 || '', NOTA_TXT_W);
  const notaLinesH = (n1.length + (n2.length ? n2.length + 0.5 : 0)) * NOTE_LINE_H;
  const BLOQUE_H   = Math.max(22, 10 + notaLinesH + NOTE_PAD_BOT);

  const tcw_each = Math.floor((TOT_W - 4) / 3);
  const tcw_arr  = [tcw_each, tcw_each, tcw_each];
  const PILL_LABELS = ['DOLARES', 'TASA DE CAMBIO', 'LEMPIRAS'];
  const PILL_VALS   = [
    '$' + totalUSD.toFixed(2),
    tasa.toFixed(2),
    'L ' + lps.toLocaleString('es-HN', { minimumFractionDigits: 2 }),
  ];

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY - 0.1,  // solapa 0.1mm → sin gap visible
    body: [['', '']],
    margin: { left: M, right: M },
    tableWidth: CW,
    styles: {
      lineColor: C_AZUL,
      lineWidth: 0.2,
      cellPadding: 0,
      minCellHeight: BLOQUE_H,
    },
    columnStyles: {
      0: { cellWidth: TOT_W,  fillColor: C_GRIS },
      1: { cellWidth: NOTA_W, fillColor: [252, 253, 255] },
    },
    didDrawCell: ({ column, cell }) => {
      const cx = cell.x;
      const cy = cell.y;
      const ch = cell.height;

      if (column.index === 0) {
        // Píldoras
        tcw_arr.forEach((tw, i) => {
          const px = cx + 1 + i * (tw + 1);
          doc.setFillColor(...C_AZUL);
          doc.roundedRect(px, cy + 1.5, tw, 6, 1, 1, 'F');
          doc.setTextColor(...C_BLANCO);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6);
          doc.text(PILL_LABELS[i], px + tw / 2, cy + 5.8, { align: 'center' });
        });
        // Valores
        tcw_arr.forEach((tw, i) => {
          const px = cx + 1 + i * (tw + 1);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(...C_AZUL_OSC);
          doc.text(PILL_VALS[i], px + tw / 2, cy + ch / 2 + 5, { align: 'center' });
        });
      } else {
        // Header NOTAS azul
        doc.setFillColor(...C_AZUL);
        doc.rect(cx, cy, cell.width, 6.5, 'F');
        doc.setTextColor(...C_BLANCO);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text('NOTAS:', cx + 3, cy + 5.0);
        // Texto notas
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(NOTE_FS);
        doc.setTextColor(40, 40, 40);
        doc.text(n1, cx + 3, cy + 10);
        if (n2.length) {
          doc.text(n2, cx + 3, cy + 10 + n1.length * NOTE_LINE_H + NOTE_LINE_H * 0.6);
        }
      }
    },
  });

  y = doc.lastAutoTable.finalY + 4;

  // -------------------------------------------------------
  // FIRMAS  — etiquetas apiladas a la izquierda, elaborado por a la derecha
  // -------------------------------------------------------
  const firmaLabels  = ['FIRMA:', 'NOMBRE:', 'IDENTIDAD:', 'FECHA:', 'TELEFONO:'];
  const firmaValues  = [
    '',
    (v.diputado_nombre || '').toUpperCase(),
    v.identidad || '',
    '',
    '',
  ];
  const FIRMA_ROW_H  = 6;
  const FIRMA_HALF   = CW * 0.50;
  const FIRMA_TOTAL  = firmaLabels.length * FIRMA_ROW_H + 4;

  const elab         = (nombreUsuario || v.elaborado_por_nombre || '').toUpperCase();

  // Columna izquierda — etiquetas, valores y líneas cortas
  const LBL_END_X  = M + 22;        // fin de la etiqueta
  const LINE_END_X = M + FIRMA_HALF * 0.55; // línea corta (≈55% del ancho izq)

  firmaLabels.forEach((lbl, i) => {
    const fy  = y + i * FIRMA_ROW_H + 6;
    const val = firmaValues[i] || '';

    // Etiqueta
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_AZUL);
    doc.text(lbl, M + 2, fy);

    // Valor pre-llenado centrado sobre la línea
    if (val) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C_NEGRO);
      doc.text(val, (LBL_END_X + LINE_END_X) / 2, fy - 0.8, { align: 'center' });
    }

    // Línea corta
    doc.setDrawColor(...C_AZUL);
    doc.setLineWidth(0.4);
    doc.line(LBL_END_X, fy + 1, LINE_END_X, fy + 1);
  });

  // Columna derecha — bloques de firma centrados
  const FIRMAX   = M + CW;                  // borde derecho
  const COL_R_X  = M + FIRMA_HALF + 4;      // inicio columna derecha
  const COL_R_W  = FIRMAX - COL_R_X;        // ancho columna derecha
  const R_CX     = COL_R_X + COL_R_W / 2;  // centro columna derecha
  const LINE_W2  = Math.min(60, COL_R_W * 0.75); // ancho máx línea
  const elabY    = y + FIRMA_TOTAL * 0.18;

  // --- Elaborado por (etiqueta + nombre centrado + línea) ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C_NEGRO);
  doc.text('Elaborado por:', R_CX, elabY + 4, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_AZUL);
  doc.text(elab, R_CX, elabY + 9.5, { align: 'center' });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(R_CX - LINE_W2 / 2, elabY + 11, R_CX + LINE_W2 / 2, elabY + 11);

  // --- Firma (línea + etiqueta centrada) ---
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(R_CX - LINE_W2 / 2, elabY + 21, R_CX + LINE_W2 / 2, elabY + 21);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C_NEGRO);
  doc.text('Firma', R_CX, elabY + 25, { align: 'center' });

  y += FIRMA_TOTAL + 2;

  // -------------------------------------------------------
  // GUARDAR
  // -------------------------------------------------------
  const fname = 'viatico_' + (v.diputado_nombre || 'doc').replace(/\s+/g, '_') + '_' + fmtFecha(v.fecha_inicio) + '.pdf';
  doc.save(fname);
}