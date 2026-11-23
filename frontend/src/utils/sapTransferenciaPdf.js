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
const montoTxt = v => 'L' + (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  doc.rect(L - 4, 10, CW + 8, PH - 20, 'S');

  // ── Encabezado: logo | institución | número ──
  let y = 10;
  const LOGO_W = 50, INFO_W = 62, CENT_W = CW - LOGO_W - INFO_W, HDR_H = 42;
  doc.setFillColor(...BLANCO); doc.setDrawColor(...AZUL); doc.setLineWidth(0.5);
  doc.rect(L, y, CW, HDR_H, 'FD');
  if (logo) { const s = HDR_H - 6; doc.addImage(logo, 'JPEG', L + (LOGO_W - s) / 2, y + 3, s, s); }

  doc.setDrawColor(180, 200, 235); doc.setLineWidth(0.3);
  doc.line(L + LOGO_W, y + 4, L + LOGO_W, y + HDR_H - 4);
  const cx = L + LOGO_W + CENT_W / 2;
  fuente('bold', 13, AZUL);  doc.text('REPÚBLICA DE HONDURAS', cx, y + 11, { align: 'center' });
  fuente('normal', 10, AZUL); doc.text('CONGRESO NACIONAL', cx, y + 18, { align: 'center' });
  fuente('bold', 15, AZUL);  doc.text('PAGADURÍA ESPECIAL', cx, y + 28, { align: 'center' });
  fuente('normal', 8.5, AZUL); doc.text('UNIDAD DE ADQUISICIONES Y COMPRAS', cx, y + 34.5, { align: 'center' });

  const infoX = L + LOGO_W + CENT_W, infoMid = infoX + INFO_W / 2;
  doc.setDrawColor(180, 200, 235); doc.setLineWidth(0.3);
  doc.line(infoX, y + 4, infoX, y + HDR_H - 4);
  fuente('bold', 11, AZUL); doc.text('SAP TRANSFERENCIA', infoMid, y + 8, { align: 'center' });
  doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.2); doc.line(infoX + 3, y + 10, infoX + INFO_W - 3, y + 10);
  doc.setFillColor(...BLANCO); doc.setDrawColor(...AZUL); doc.setLineWidth(0.5);
  doc.rect(infoX + 4, y + 13, INFO_W - 8, 11, 'FD');
  fuente('bold', 14, AZUL); doc.text(numero, infoMid, y + 13 + 11 - 2, { align: 'center' });
  doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.2); doc.line(infoX + 3, y + 27, infoX + INFO_W - 3, y + 27);
  fuente('bold', 7, [100, 120, 160]); doc.text('GENERADO POR', infoMid, y + 31.5, { align: 'center' });
  fuente('bold', 8, AZUL); doc.text(String(generadoPor || 'Sistema').toUpperCase(), infoMid, y + 37, { align: 'center' });

  // ── Franja azul de título ──
  y += HDR_H;
  const TBAR_H = 11;
  doc.setFillColor(...AZUL); doc.setDrawColor(...AZUL); doc.setLineWidth(0);
  doc.rect(L, y, CW, TBAR_H, 'FD');
  fuente('bold', 10.5, BLANCO);
  doc.text('SOLICITUD DE ASIGNACIÓN PRESUPUESTARIA (SAP) - TRANSFERENCIA', L + CW / 2, y + 7.5, { align: 'center' });
  y += TBAR_H + 12;

  // ── Datos de la solicitud: etiqueta a la izquierda, valor en recuadro ──
  const LAB_W = 62, BOX_X = L + LAB_W, BOX_W = CW - LAB_W, BOX_H = 11;
  const filaDato = (etiqueta, valor) => {
    fuente('bold', 10); doc.text(etiqueta, L, y + 7.5);
    doc.setFillColor(...GBKG); doc.setDrawColor(...NEGRO); doc.setLineWidth(0.4);
    doc.rect(BOX_X, y, BOX_W, BOX_H, 'FD');
    fuente('bold', 11.5); doc.text(valor, BOX_X + BOX_W / 2, y + 7.6, { align: 'center' });
    y += BOX_H + 8;
  };
  filaDato('Fecha de Solicitud:', fechaLarga(sap.fecha_solicitud));
  filaDato('Unidad/Departamento Solicitante:', String(sap.unidad_solicitante || '').toUpperCase());
  filaDato('Monto según Cotización:', montoTxt(sap.monto_cotizacion));

  // ── Aprobación del Departamento de Contabilidad (se llena a mano) ──
  y += 4;
  fuente('bold', 10); doc.text('Aprobación Departamento de Contabilidad:', L, y + 6);
  const opciones = ['SI', 'NO', 'PENDIENTE'];
  let ox = L + 86;
  doc.setLineWidth(0.4); doc.setDrawColor(...NEGRO);
  opciones.forEach((txt) => {
    fuente('bold', 9.5); doc.text(txt, ox, y + 6);
    const tx = ox + doc.getTextWidth(txt) + 3;
    doc.setFillColor(...BLANCO); doc.rect(tx, y, 16, 9, 'FD');
    ox = tx + 16 + 8;
  });
  y += 20;

  // ── Monto aprobado / fecha de aprobación (izquierda) y código de cuenta (derecha) ──
  const colIzqW = CW * 0.52, colDerX = L + colIzqW + 8, colDerW = CW - colIzqW - 8;
  fuente('bold', 10); doc.text('Monto Aprobado', L, y + 4);
  doc.setFillColor(...BLANCO); doc.setDrawColor(...NEGRO); doc.setLineWidth(0.4);
  doc.rect(L + 38, y - 3, colIzqW - 38, 10, 'FD');
  fuente('bold', 10); doc.text('Código de Cuenta', colDerX, y + 4);
  const cuentaY = y + 8;
  doc.rect(colDerX, cuentaY, colDerW, 40, 'FD');
  fuente('bold', 10); doc.text('Fecha de Aprobación', L, y + 28);
  doc.setLineWidth(0.4); doc.line(L + 45, y + 29, L + colIzqW, y + 29);

  // ── Firmas ──
  const firmaY = Math.max(y + 60, PH - 52);
  const firmaW = 78;
  const dibujaFirma = (x, linea1, linea2, linea3) => {
    doc.setDrawColor(...NEGRO); doc.setLineWidth(0.4); doc.line(x, firmaY, x + firmaW, firmaY);
    fuente('bold', 10); doc.text(linea1, x + firmaW / 2, firmaY + 6, { align: 'center' });
    fuente('bold', 9.5); doc.text(linea2, x + firmaW / 2, firmaY + 11.5, { align: 'center' });
    fuente('bold', 9.5); doc.text(linea3, x + firmaW / 2, firmaY + 17, { align: 'center' });
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
    const FH = 9, FY = PH - 10 - FH;
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
