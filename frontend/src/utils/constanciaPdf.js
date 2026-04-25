import jsPDF from 'jspdf';

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

function numeroALetras(num) {
  const n   = Math.floor(Math.abs(parseFloat(num) || 0));
  const dec = Math.round((Math.abs(parseFloat(num) || 0) - n) * 100);
  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const decenas  = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  function grupo(x) {
    if (x === 0) return '';
    if (x === 100) return 'CIEN';
    let res = '';
    const c = Math.floor(x / 100); const resto = x % 100;
    if (c > 0) res += centenas[c] + (resto > 0 ? ' ' : '');
    if (resto < 20) res += unidades[resto];
    else { const d = Math.floor(resto / 10); const u = resto % 10; res += decenas[d] + (u > 0 ? ' Y ' + unidades[u] : ''); }
    return res.trim();
  }
  if (n === 0) return `CERO LEMPIRAS CON ${dec.toString().padStart(2, '0')}/100`;
  const millones = Math.floor(n / 1000000);
  const miles    = Math.floor((n % 1000000) / 1000);
  const resto    = n % 1000;
  let r = '';
  if (millones > 0) r += (millones === 1 ? 'UN MILLON' : grupo(millones) + ' MILLONES') + ' ';
  if (miles    > 0) r += (miles === 1 ? 'MIL' : grupo(miles) + ' MIL') + ' ';
  if (resto    > 0) r += grupo(resto);
  return r.trim() + ` LEMPIRAS CON ${dec.toString().padStart(2, '0')}/100`;
}

export async function generarConstanciaPdf(data) {
  const logoData = await loadImg('/logo-congreso.png.png');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const PW  = doc.internal.pageSize.getWidth();
  const PH  = doc.internal.pageSize.getHeight();
  const L   = 10;
  const CW  = PW - L * 2;
  const ML  = L;

  const AZUL   = [39, 76, 141];
  const NEGRO  = [20, 20, 20];
  const BLANCO = [255, 255, 255];
  const GRIS   = [150, 150, 150];

  // fecha/hora generado
  const now      = new Date();
  const fechaGen = now.toLocaleDateString('es-HN', { day:'2-digit', month:'2-digit', year:'numeric' });
  const horaGen  = now.toLocaleTimeString('es-HN', { hour:'2-digit', minute:'2-digit' });

  //  Marco estandar (igual que CajaChica) 
  const drawMarco = () => {
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(1.2);
    doc.rect(L - 4, 5, CW + 8, PH - 10, 'S');
  };

  //  Footer estandar (igual que CajaChica) 
  const drawFooter = (pageNum, totalPages) => {
    const FH = 9;
    const FY = PH - 5 - FH;
    doc.setFillColor(...AZUL);
    doc.rect(L - 4, FY, CW + 8, FH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...BLANCO);
    doc.text('Congreso Nacional - Pagaduría Especial', L - 1, FY + 5.8);
    doc.text('Página ' + pageNum + ' de ' + totalPages, PW / 2, FY + 5.8, { align: 'center' });
    doc.text('Generado: ' + fechaGen + ' ' + horaGen, L + CW + 1, FY + 5.8, { align: 'right' });
  };

  const bold   = (s = 9) => { doc.setFont('helvetica', 'bold');   doc.setFontSize(s); };
  const normal = (s = 9) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(s); };
  const hline  = (x1, y1, x2, col = GRIS, w = 0.25) => {
    doc.setDrawColor(...col); doc.setLineWidth(w); doc.line(x1, y1, x2, y1);
  };

  const AZUL_OSC = [15, 39, 68];

  const secHeader = (txt, y) => {
    bold(9.5); doc.setTextColor(...AZUL_OSC);
    doc.text(txt, PW / 2, y, { align: 'center' });
    return y + 6;
  };

  const drawField = (label, value, x, y, w) => {
    const H = 9.5;
    // Fondo gris claro
    doc.setFillColor(245, 247, 252);
    doc.rect(x, y - 2.5, w, H, 'F');
    // Barra azul izquierda
    doc.setFillColor(...AZUL);
    doc.rect(x, y - 2.5, 1.5, H, 'F');
    // Etiqueta pequeña gris arriba
    normal(7); doc.setTextColor(120, 130, 150);
    doc.text(label.toUpperCase(), x + 3.5, y + 0.8);
    // Valor negro/azul oscuro en negrita
    bold(9.5); doc.setTextColor(...AZUL_OSC);
    const shown = value ? (doc.splitTextToSize(String(value), w - 5)[0] || '') : '\u2014';
    doc.text(shown, x + 3.5, y + 5.5);
  };

  const ROW = 10.5;

  /*  PAGE 1  */
  drawMarco();
  let y = 10;

  // ════ HEADER: [LOGO | INSTITUCIÓN] ════
  const LOGO_W = 50;
  const HDR_H  = 42;

  doc.setFillColor(...BLANCO);
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.5);
  doc.rect(L, y, CW, HDR_H, 'FD');

  // Logo
  if (logoData) {
    const lSize = HDR_H - 6;
    doc.addImage(logoData, 'PNG', L + (LOGO_W - lSize) / 2, y + 3, lSize, lSize);
  }

  // Divider logo | institución
  doc.setDrawColor(180, 200, 235);
  doc.setLineWidth(0.3);
  doc.line(L + LOGO_W, y + 4, L + LOGO_W, y + HDR_H - 4);

  // Institución centrada
  const instCX = L + LOGO_W + (CW - LOGO_W) / 2;
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');   doc.setFontSize(13);
  doc.text('REPÚBLICA DE HONDURAS', instCX, y + 11, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text('CONGRESO NACIONAL', instCX, y + 18, { align: 'center' });
  doc.setFont('helvetica', 'bold');   doc.setFontSize(16);
  doc.text('PAGADURÍA ESPECIAL', instCX, y + 29, { align: 'center' });

  // ════ BARRA TÍTULO ════
  y += HDR_H;
  const TBAR_H = 11;
  doc.setFillColor(...AZUL);
  doc.rect(L, y, CW, TBAR_H, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.setTextColor(...BLANCO);
  doc.text('CONSTANCIA DE RECEPCIÓN DE TRANSFERENCIA ELECTRÓNICA', PW / 2, y + 7.2, { align: 'center' });
  y += TBAR_H + 8;

  y = secHeader('I. DATOS DE LA PERSONA QUE RECIBE EL PAGO', y);
  drawField('Nombre completo:', data.nombre, ML, y, CW);
  y += ROW;

  const halfL = CW * 0.56;
  const halfR = CW * 0.42;
  const xR    = ML + CW * 0.58;

  drawField('Número de Identidad (DNI):', data.dni,      ML, y, halfL);
  drawField('Teléfono:',                  data.telefono, xR, y, halfR);
  y += ROW;

  drawField('Dirección:',          data.direccion, ML, y, halfL);
  drawField('Correo electrónico:', data.correo,    xR, y, halfR);
  y += ROW + 2;

  y = secHeader('II. DATOS DE QUIÉN AUTORIZA / REALIZA EL PAGO', y);
  drawField('Nombre del funcionario:', data.funcionario, ML, y, CW);
  y += ROW;

  drawField('Cargo:', data.cargo, ML, y, CW * 0.48);
  drawField('Dependencia/Unidad:', data.dependencia, ML + CW * 0.52, y, CW * 0.48);
  y += ROW + 1;

  normal(8.5); doc.setTextColor(...GRIS);
  doc.text('INSTITUCIÓN:', ML, y);
  bold(9); doc.setTextColor(...AZUL_OSC);
  doc.text('Congreso Nacional de la República de Honduras', ML + doc.getTextWidth('INSTITUCIÓN:') + 2, y);
  y += 8;

  y = secHeader('III. DATOS DE LA TRANSFERENCIA ELECTRÓNICA', y);
  y += 2;

  const montoStr = data.monto
    ? `L. ${parseFloat(data.monto).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '';
  drawField('Monto transferido:', montoStr, ML, y, CW);
  y += ROW;

  const letras = data.monto ? numeroALetras(data.monto) : '';
  drawField('Monto en letras:', letras, ML, y, CW);
  y += ROW;

  drawField('Banco desde el cual se realizó la transferencia:', data.bancoEmisor, ML, y, CW);
  y += ROW;

  drawField('Banco receptor:', data.bancoReceptor, ML, y, CW);
  y += ROW;

  let fechaStr = '';
  if (data.fechaDia && data.fechaMes && data.fechaAnio) {
    fechaStr = `${data.fechaDia}  /  ${data.fechaMes}  /  ${data.fechaAnio}`;
  }
  drawField('Número de cuenta bancaria receptora:', data.numeroCuenta, ML, y, CW * 0.55);
  drawField('Fecha de la transferencia:', fechaStr, ML + CW * 0.58, y, CW * 0.42);
  y += ROW + 2;

  y = secHeader('IV. CONCEPTO DEL PAGO', y);
  if (data.concepto) {
    const conceptoLines = doc.splitTextToSize(data.concepto, CW - 4);
    // Caja de concepto con fondo
    const conceptoH = Math.max(14, conceptoLines.length * 5.5 + 8);
    doc.setFillColor(245, 247, 252);
    doc.rect(ML, y - 2, CW, conceptoH, 'F');
    doc.setFillColor(...AZUL);
    doc.rect(ML, y - 2, 1.5, conceptoH, 'F');
    normal(7); doc.setTextColor(120, 130, 150);
    doc.text('DETALLE O MOTIVO DE LA TRANSFERENCIA', ML + 3.5, y + 1.5);
    normal(9); doc.setTextColor(...NEGRO);
    let cy = y + 6.5;
    conceptoLines.forEach(ln => { doc.text(ln, ML + 3.5, cy); cy += 5.5; });
    y += conceptoH + 3;
  } else {
    y += 15;
  }

  drawFooter(1, 2);

  /*  PAGE 2  */
  doc.addPage();
  drawMarco();
  y = 10;

  // mismo encabezado
  doc.setFillColor(...BLANCO);
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.5);
  doc.rect(L, y, CW, HDR_H, 'FD');
  if (logoData) {
    const lSize = HDR_H - 6;
    doc.addImage(logoData, 'PNG', L + (LOGO_W - lSize) / 2, y + 3, lSize, lSize);
  }
  doc.setDrawColor(180, 200, 235); doc.setLineWidth(0.3);
  doc.line(L + LOGO_W, y + 4, L + LOGO_W, y + HDR_H - 4);
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');   doc.setFontSize(13);
  doc.text('REPÚBLICA DE HONDURAS', instCX, y + 11, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text('CONGRESO NACIONAL', instCX, y + 18, { align: 'center' });
  doc.setFont('helvetica', 'bold');   doc.setFontSize(16);
  doc.text('PAGADURÍA ESPECIAL', instCX, y + 29, { align: 'center' });
  y += HDR_H;
  doc.setFillColor(...AZUL);
  doc.rect(L, y, CW, TBAR_H, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.setTextColor(...BLANCO);
  doc.text('CONSTANCIA DE RECEPCIÓN DE TRANSFERENCIA ELECTRÓNICA', PW / 2, y + 7.2, { align: 'center' });
  y += TBAR_H + 10;

  bold(10); doc.setTextColor(...AZUL_OSC);
  doc.text('V. DECLARACIÓN DE RECEPCIÓN', ML, y);
  y += 9;

  // "Yo, _____ " — línea para firma a mano
  normal(9.5); doc.setTextColor(...NEGRO);
  doc.text('Yo,', ML, y);
  hline(ML + 8, y + 0.5, ML + CW, AZUL, 0.4);
  y += 8;

  const pref = 'de generales arriba indicadas ';
  doc.text(pref, ML, y);
  const pw = doc.getTextWidth(pref);
  bold(9.5); doc.setTextColor(...AZUL_OSC);
  doc.text('DECLARO BAJO FE DE JURAMENTO que:', ML + pw, y);
  y += 8;

  normal(9.5); doc.setTextColor(...NEGRO);
  const items = [
    '1. He recibido mediante transferencia electrónica bancaria la cantidad anteriormente indicada.',
    '2. El monto corresponde al concepto descrito en el presente documento.',
    '3. Confirmo que el pago ha sido recibido a mi entera satisfacción, sin que exista reclamo posterior relacionado con esta transferencia.',
    '4. Reconozco que la presente constancia sirve como respaldo administrativo y financiero del pago realizado.',
  ];
  items.forEach(item => {
    const ls = doc.splitTextToSize(item, CW);
    ls.forEach(l => { doc.text(l, ML, y); y += 5.5; });
    y += 1.5;
  });

  y += 3;

  // Párrafo de cierre con líneas dibujadas para fecha
  normal(9.5); doc.setTextColor(...NEGRO);
  const p1 = 'Para los efectos administrativos y legales correspondientes, se firma la presente constancia';
  const p2 = 'en la ciudad de Tegucigalpa M.D.C., a los';
  const p3 = 'días del mes de';
  const p4 = 'del año';

  doc.text(p1, ML, y); y += 6;

  // línea 2 con blancos: "a los [__] dias del mes de [____________] del año [______]."
  const x1 = ML;
  doc.text(p2, x1, y);
  const x2 = x1 + doc.getTextWidth(p2) + 2;
  // blanco día (12mm)
  hline(x2, y + 0.5, x2 + 12, AZUL, 0.4);
  const x3 = x2 + 13;
  doc.text(p3, x3, y);
  const x4 = x3 + doc.getTextWidth(p3) + 2;
  // blanco mes (32mm)
  hline(x4, y + 0.5, x4 + 32, AZUL, 0.4);
  const x5 = x4 + 33;
  doc.text(p4, x5, y);
  const x6 = x5 + doc.getTextWidth(p4) + 2;
  // blanco año (18mm)
  hline(x6, y + 0.5, x6 + 18, AZUL, 0.4);
  y += 38;

  // ── Líneas de firma ──────────────────────────────────
  const sigW  = 60;
  const sigL  = ML + 18;
  const sigR  = ML + CW - 18 - sigW;

  hline(sigL, y, sigL + sigW, AZUL, 0.5);
  hline(sigR, y, sigR + sigW, AZUL, 0.5);
  y += 6;

  normal(12); doc.setTextColor(...NEGRO);
  doc.text('Persona que recibe el pago', sigL + sigW / 2, y, { align: 'center' });
  doc.text('Personal que autoriza el pago', sigR + sigW / 2, y, { align: 'center' });

  drawFooter(2, 2);

  const nombreFile = (data.nombre || 'constancia').replace(/\s+/g, '_');
  doc.save(`Constancia_Transferencia_${nombreFile}.pdf`);
}