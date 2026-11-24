import { jsPDF } from 'jspdf';
import printJS from 'print-js';

/* PDF de SAP Transferencia (Solicitud de Asignación Presupuestaria).
   Mismo diseño que el PDF del Check List: borde azul, encabezado con logo, recuadro con el número,
   franja azul de título y pie de página. El contenido sigue el formato impreso del SAP. */

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const FIRMA_SOLICITA = { cargo: 'Dirección Administrativa', nombre: 'Lic. Emerson Alvarez' };
const FIRMA_VOBO     = { cargo: 'Dirección Financiera',     nombre: 'Lic. Luis Fernando Rodríguez' };

const fechaLarga = (s) => {
  const [y, m, d] = String(s || '').split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${String(d).padStart(2, '0')} DE ${MESES[m - 1]} ${y}`;
};
const montoTxt = v => 'L ' + (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cargarFuente = async (url) => {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('fuente no disponible');
  const bytes = new Uint8Array(await resp.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const cargarLogo = (url) => new Promise((resolve) => {
  fetch(url).then(r => (r.ok ? r.blob() : null)).then(blob => {
    if (!blob) return resolve(null);
    const burl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(220 / img.naturalWidth, 220 / img.naturalHeight, 1);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(burl);
        resolve(c.toDataURL('image/jpeg', 0.95));
      } catch { URL.revokeObjectURL(burl); resolve(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(burl); resolve(null); };
    img.src = burl;
  }).catch(() => resolve(null));
});

/**
 * @param {object}  sap            registro de sap_transferencia (numero, anio, fecha_solicitud, unidad_solicitante, monto_cotizacion, estado)
 * @param {string}  generadoPor    nombre del usuario que imprime
 * @param {boolean} imprimir       true = abre el diálogo de impresión; false = descarga el PDF
 */
export async function generarSapPdf(sap, generadoPor, imprimir = false) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const L = 10, CW = PW - 20;
  const AZUL = [39, 76, 141], NEGRO = [20, 20, 20], BLANCO = [255, 255, 255], GBKG = [237, 241, 250];

  // Fuente Roboto (acentos); si no carga, se usa Helvetica
  let familia = 'helvetica';
  try {
    const [normal, negrita] = await Promise.all([cargarFuente('/fonts/Roboto-Regular.ttf'), cargarFuente('/fonts/Roboto-Bold.ttf')]);
    doc.addFileToVFS('Roboto-Regular.ttf', normal); doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.addFileToVFS('Roboto-Bold.ttf', negrita);   doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
    doc.setFont('Roboto', 'normal'); doc.getTextWidth('TEST');
    familia = 'Roboto';
  } catch { familia = 'helvetica'; }
  const fuente = (estilo, tam, color = NEGRO) => { doc.setFont(familia, estilo); doc.setFontSize(tam); doc.setTextColor(...color); };

  const logo = await cargarLogo('/logo-congreso.png.png');
  const numero = `${String(sap.numero || 0).padStart(4, '0')}-${sap.anio}`;
  const ahora = new Date();
  const fGen = ahora.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hGen = ahora.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true });

  // ── Borde exterior ──
  doc.setDrawColor(...AZUL); doc.setLineWidth(1.2);
  doc.rect(L - 4, 5, CW + 8, PH - 10, 'S');          // igual que Autorizaciones: borde a 5 mm arriba y abajo

  // ── Encabezado: logo | institución | número ──
  let y = 10;
  // Encabezado y franja con el mismo margen interior que Autorizaciones: 4 mm de cada lado del borde
  const HL = L, HW = CW;
  const LOGO_W = 50, INFO_W = 62, CENT_W = HW - LOGO_W - INFO_W, HDR_H = 42;
  doc.setFillColor(...BLANCO); doc.setDrawColor(...AZUL); doc.setLineWidth(0.5);
  doc.rect(HL, y, HW, HDR_H, 'FD');
  if (logo) { const s = HDR_H - 6; doc.addImage(logo, 'JPEG', HL + (LOGO_W - s) / 2, y + 3, s, s); }

  doc.setDrawColor(180, 200, 235); doc.setLineWidth(0.3);
  doc.line(HL + LOGO_W, y + 4, HL + LOGO_W, y + HDR_H - 4);
  const cx = HL + LOGO_W + CENT_W / 2;
  fuente('bold', 13, AZUL);  doc.text('REPÚBLICA DE HONDURAS', cx, y + 11, { align: 'center' });
  fuente('normal', 10, AZUL); doc.text('CONGRESO NACIONAL', cx, y + 18, { align: 'center' });
  fuente('bold', 15, AZUL);  doc.text('PAGADURÍA ESPECIAL', cx, y + 28, { align: 'center' });
  fuente('normal', 8.5, AZUL); doc.text('UNIDAD DE ADQUISICIONES Y COMPRAS', cx, y + 34.5, { align: 'center' });

  const infoX = HL + LOGO_W + CENT_W, infoMid = infoX + INFO_W / 2;
  doc.setDrawColor(180, 200, 235); doc.setLineWidth(0.3);
  doc.line(infoX, y + 4, infoX, y + HDR_H - 4);
  fuente('bold', 11, AZUL); doc.text('SAP TRANSFERENCIA', infoMid, y + 8, { align: 'center' });
  doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.2); doc.line(infoX + 3, y + 10, infoX + INFO_W - 3, y + 10);
  // Recuadro del número: fondo suave, borde doble y letra tipo código, centrado en horizontal y en vertical
  const NB_X = infoX + 4, NB_Y = y + 12, NB_W = INFO_W - 8, NB_H = 13, NB_FS = 18;
  doc.setFillColor(...GBKG); doc.setDrawColor(...AZUL); doc.setLineWidth(0.7);
  doc.rect(NB_X, NB_Y, NB_W, NB_H, 'FD');
  doc.setDrawColor(130, 155, 205); doc.setLineWidth(0.2);
  doc.rect(NB_X + 1, NB_Y + 1, NB_W - 2, NB_H - 2, 'S');
  doc.setFont('courier', 'bold'); doc.setFontSize(NB_FS); doc.setTextColor(...AZUL);
  const altoDigito = NB_FS * 0.3528 * 0.62;                       // alto aproximado de un dígito, en mm
  doc.text(String(sap.numero || 0).padStart(4, '0'), NB_X + NB_W / 2, NB_Y + NB_H / 2 + altoDigito / 2, { align: 'center' });
  doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.2); doc.line(infoX + 3, y + 27, infoX + INFO_W - 3, y + 27);
  fuente('bold', 7, [100, 120, 160]); doc.text('GENERADO POR', infoMid, y + 31.5, { align: 'center' });
  fuente('bold', 8, AZUL); doc.text(String(generadoPor || 'Sistema').toUpperCase(), infoMid, y + 37, { align: 'center' });

  // ── Franja azul de título ──
  y += HDR_H;
  const TBAR_H = 11;
  doc.setFillColor(...AZUL); doc.setDrawColor(...AZUL); doc.setLineWidth(0);
  doc.rect(HL, y, HW, TBAR_H, 'FD');
  fuente('bold', 10.5, BLANCO);
  doc.text('SOLICITUD DE ASIGNACIÓN PRESUPUESTARIA (SAP) - TRANSFERENCIA', L + CW / 2, y + 7.5, { align: 'center' });
  y += TBAR_H + 12;

  // ── Ayudas de dibujo ──
  // jsPDF reutiliza el color del texto como relleno si no se fija antes de cada figura; por eso `caja` siempre fija sus colores.
  const MUTED = [100, 120, 160], BORDE_SUAVE = [150, 170, 210];
  const caja = (x, yy, w, h, { relleno = BLANCO, borde = NEGRO, grosor = 0.4, radio = 0 } = {}) => {
    doc.setFillColor(...relleno); doc.setDrawColor(...borde); doc.setLineWidth(grosor);
    if (radio) doc.roundedRect(x, yy, w, h, radio, radio, 'FD'); else doc.rect(x, yy, w, h, 'FD');
  };
  const baseTexto = (centroY, tam) => centroY + (tam * 0.3528 * 0.711) / 2;   // baseline para centrar el texto en vertical
  const etiqueta = (txt, x, yy) => { fuente('bold', 7.5, MUTED); doc.text(txt, x, yy); };
  const tituloSeccion = (txt, yy) => {
    caja(L, yy - 4, 1.6, 5.4, { relleno: AZUL, borde: AZUL, grosor: 0 });
    fuente('bold', 9.5, AZUL); doc.text(txt, L + 4.5, yy);
    doc.setDrawColor(...BORDE_SUAVE); doc.setLineWidth(0.25); doc.line(L, yy + 2.4, L + CW, yy + 2.4);
  };

  // ── Sección 1: datos de la solicitud (etiqueta arriba, valor en recuadro) ──
  tituloSeccion('DATOS DE LA SOLICITUD', y);
  y += 9;
  const GAP = 6, MITAD = (CW - GAP) / 2, CAMPO_H = 12;
  const campo = (etq, valor, x, w, { tam = 11.5, color = NEGRO, centrado = false } = {}) => {
    etiqueta(etq, x, y);
    caja(x, y + 2, w, CAMPO_H, { relleno: GBKG, borde: BORDE_SUAVE, grosor: 0.35, radio: 1.5 });
    fuente('bold', tam, color);
    const base = baseTexto(y + 2 + CAMPO_H / 2, tam);
    if (centrado) doc.text(valor, x + w / 2, base, { align: 'center' }); else doc.text(valor, x + 4, base);
  };
  campo('FECHA DE SOLICITUD', fechaLarga(sap.fecha_solicitud), L, MITAD);
  campo('MONTO SEGÚN COTIZACIÓN', montoTxt(sap.monto_cotizacion), L + MITAD + GAP, MITAD, { tam: 14, color: AZUL, centrado: true });
  y += CAMPO_H + 10;
  campo('UNIDAD / DEPARTAMENTO SOLICITANTE', String(sap.unidad_solicitante || '').toUpperCase(), L, CW);
  y += CAMPO_H + 12;

  // ── Sección 2: Departamento de Contabilidad (se llena a mano) ──
  const CARD_Y = y, CARD_H = 70;
  caja(L, CARD_Y, CW, CARD_H, { relleno: BLANCO, borde: BORDE_SUAVE, grosor: 0.35, radio: 1.5 });
  caja(L + 0.4, CARD_Y + 0.4, CW - 0.8, 8, { relleno: GBKG, borde: GBKG, grosor: 0 });
  fuente('bold', 9, AZUL);
  doc.text('DEPARTAMENTO DE CONTABILIDAD', L + 5, baseTexto(CARD_Y + 4.4, 9));
  fuente('normal', 7.5, MUTED);
  doc.text('Uso exclusivo', L + CW - 5, baseTexto(CARD_Y + 4.4, 7.5), { align: 'right' });

  // Aprobación: SI / NO / PENDIENTE
  const filaA = CARD_Y + 17;
  fuente('bold', 9.5); doc.text('Aprobación:', L + 5, baseTexto(filaA, 9.5));
  let ox = L + 34;
  ['SI', 'NO', 'PENDIENTE'].forEach((txt) => {
    caja(ox, filaA - 3.5, 7, 7, { relleno: BLANCO, borde: NEGRO, grosor: 0.45 });
    fuente('bold', 9.5); doc.text(txt, ox + 10, baseTexto(filaA, 9.5));
    ox += 10 + doc.getTextWidth(txt) + 12;
  });

  // Monto aprobado y fecha de aprobación (izquierda) / código de cuenta (derecha)
  const colX = L + 5, colW = 84, derX = colX + colW + 8, derW = CW - 5 - (derX - L);
  const filaB = CARD_Y + 28;
  etiqueta('MONTO APROBADO', colX, filaB);
  caja(colX, filaB + 2, colW, 11, { relleno: BLANCO, borde: NEGRO, grosor: 0.4, radio: 1 });
  fuente('bold', 11, AZUL); doc.text(montoTxt(sap.monto_cotizacion), colX + 3.5, baseTexto(filaB + 2 + 5.5, 11));
  etiqueta('FECHA DE APROBACIÓN', colX, filaB + 19);
  caja(colX, filaB + 21, colW, 11, { relleno: BLANCO, borde: NEGRO, grosor: 0.4, radio: 1 });
  fuente('normal', 9, [170, 180, 200]); doc.text('dd  /  mm  /  aaaa', colX + colW / 2, baseTexto(filaB + 21 + 5.5, 9), { align: 'center' });
  etiqueta('CÓDIGO DE CUENTA', derX, filaB);
  caja(derX, filaB + 2, derW, 30, { relleno: BLANCO, borde: NEGRO, grosor: 0.4, radio: 1 });
  y = CARD_Y + CARD_H;

  // ── Firmas ──
  const firmaY = Math.max(y + 22, PH - 52);
  const firmaW = 78;
  const dibujaFirma = (x, titulo, cargo, nombre) => {
    doc.setDrawColor(...NEGRO); doc.setLineWidth(0.4); doc.line(x, firmaY, x + firmaW, firmaY);
    fuente('bold', 10.5, AZUL); doc.text(titulo, x + firmaW / 2, firmaY + 6, { align: 'center' });
    fuente('normal', 9, NEGRO); doc.text(cargo, x + firmaW / 2, firmaY + 11, { align: 'center' });
    fuente('bold', 9.5, NEGRO); doc.text(nombre, x + firmaW / 2, firmaY + 16, { align: 'center' });
  };
  dibujaFirma(L + 4, 'Solicita', FIRMA_SOLICITA.cargo, FIRMA_SOLICITA.nombre);
  dibujaFirma(L + CW - firmaW - 4, 'Vo.Bo. SAP', FIRMA_VOBO.cargo, FIRMA_VOBO.nombre);

  // ── Sello ANULADO ──
  if (sap.estado === 'anulado') {
    try {
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.18 }));
      fuente('bold', 90, [220, 38, 38]);
      doc.text('ANULADO', PW / 2, PH / 2 + 10, { align: 'center', angle: 35 });
      doc.restoreGraphicsState();
    } catch { /* sin transparencia: se omite el sello */ }
  }

  // ── Pie de página ──
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const FH = 9, FY = PH - 5 - FH;                    // el pie termina justo en el borde azul, como en Autorizaciones
    doc.setFillColor(...AZUL); doc.rect(L - 4, FY, CW + 8, FH, 'F');
    fuente('normal', 9.5, BLANCO);
    doc.text('Congreso Nacional - Pagaduría Especial', L - 1, FY + 5.8);
    doc.text(`Página ${p} de ${total}`, L + CW / 2, FY + 5.8, { align: 'center' });
    doc.text(`Generado: ${fGen} ${hGen}`, L + CW + 1, FY + 5.8, { align: 'right' });
  }

  if (imprimir) {
    const base64 = doc.output('datauristring').split(',')[1];
    printJS({ printable: base64, type: 'pdf', base64: true });
  } else {
    doc.save(`sap-transferencia-${numero}.pdf`);
  }
}
