'use strict';

/**
 * Servicio de generación de PDF para Órdenes de Pago.
 *
 * Dependencias: pdf-lib, sharp
 *   npm install pdf-lib sharp
 *
 * Firma del presidente:
 *   Colocar el archivo SVG en:  backend/private/firma_presidente.svg
 *   O en formato PNG en:        backend/private/firma_presidente.png
 *
 * CALIBRACIÓN DE COORDENADAS:
 *   Todas las coordenadas están en puntos PDF (pts).
 *   El origen en pdf-lib es la esquina INFERIOR IZQUIERDA de la hoja.
 *   Papel carta: 612 × 792 pts  (216mm × 279.4mm, 1mm ≈ 2.835 pts)
 *
 *   Fórmula de conversión desde medidas en mm tomadas desde arriba:
 *     x_pts = x_mm * 2.835
 *     y_pts = (279.4 - y_mm) * 2.835
 *
 *   Para calibrar: imprima primero sobre papel en blanco y compare con el
 *   preimpreso físico. Ajuste las constantes COORDS según sea necesario.
 *   Se puede agregar OFFSET_X y OFFSET_Y para correcciones globales.
 */

const path = require('path');
const fs   = require('fs');

// ── Coordenadas de cada campo en el preimpreso (en pts, origen abajo-izq) ────
// ¡CALIBRAR ANTES DE USAR EN PRODUCCIÓN!
// Las posiciones son estimaciones basadas en el escaneo de 300 ppp.
const COORDS = {
  // Número de orden  (caja superior derecha)
  numero_orden:            { x: 448, y: 710, size: 9, align: 'center', maxW: 155 },

  // No. de cheque / transferencia
  no_cheque_transferencia: { x: 448, y: 622, size: 9, align: 'center', maxW: 155 },

  // Marca del tipo de cuenta (se dibuja un "X" en la casilla correcta)
  tipo_cuenta: {
    CORRIENTE: { x: 459, y: 578 },
    CAPITAL:   { x: 496, y: 578 },
    D_PUB:     { x: 541, y: 578 },
  },

  // Beneficiario  (línea "Páguese a favor de")
  beneficiario:            { x: 133, y: 534, size: 9, maxW: 290 },

  // Código del beneficiario
  codigo_beneficiario:     { x: 462, y: 534, size: 9, maxW: 140 },

  // Monto en números  (En números)
  monto_numeros:           { x: 133, y: 502, size: 9, maxW: 180 },

  // Monto en letras  (En letras)
  monto_letras:            { x: 71,  y: 473, size: 8, maxW: 340 },

  // Valor que se adeuda por
  valor_adeuda_por:        { x: 133, y: 447, size: 8, maxW: 340 },

  // Tabla CARGOS — fila 1  (y base, las filas 2-5 se desplazan -23 pts)
  cargos_row1: {
    anio:      { x:  97, y: 369, size: 8 },
    org:       { x: 153, y: 369, size: 8 },
    fondo:     { x: 196, y: 369, size: 8 },
    tipo_prog: { x: 245, y: 369, size: 8 },
    sub_prog:  { x: 291, y: 369, size: 8 },
    act:       { x: 338, y: 369, size: 8 },
    cuenta:    { x: 378, y: 369, size: 8 },
    importe:   { x: 543, y: 369, size: 8, align: 'right' },
  },

  // Bloque de descripción / concepto
  concepto:                { x: 51,  y: 197, size: 8, maxW: 350 },
  descripcion_detallada:   { x: 51,  y: 178, size: 7, maxW: 350 },

  // Importe en sección descripción (columna derecha)
  importe_descripcion:     { x: 543, y: 197, size: 8, align: 'right' },

  // Cantidad a pagar
  cantidad_a_pagar:        { x: 543, y: 112, size: 9, align: 'right' },

  // Total (repetición del monto en sección inferior)
  total:                   { x: 543, y: 91,  size: 9, align: 'right' },

  // Fecha  (Tegucigalpa, M.D.C., ____ de _____ de _____)
  fecha_texto:             { x: 249, y: 52,  size: 8 },

  // Firma del presidente — imagen
  firma_presidente: {
    x: 370,   // pts desde izquierda
    y: 72,    // pts desde abajo
    width: 160,
    height: 60,
    opacity: 0.92,
  },
};

// Ajuste global (mm) — útil cuando toda la impresión está desplazada
const OFFSET_X_MM = 0;
const OFFSET_Y_MM = 0;
const OFFSET_X    = OFFSET_X_MM * 2.835;
const OFFSET_Y    = OFFSET_Y_MM * 2.835;

// Ruta del archivo de firma del presidente
// Prioridad: 1) private/firma_presidente.png  2) private/firma_presidente.svg  3) frontend/public/Firma_tm.svg
const FIRMA_PNG_PATH      = path.join(__dirname, '../private/firma_presidente.png');
const FIRMA_SVG_PATH      = path.join(__dirname, '../private/firma_presidente.svg');
const FIRMA_SVG_FALLBACK  = path.join(__dirname, '../../frontend/public/Firma_tm.svg');

/**
 * Aplica el offset global a las coordenadas.
 */
function applyOffset(c) {
  return { ...c, x: c.x + OFFSET_X, y: c.y + OFFSET_Y };
}

/**
 * Convierte un monto a string con formato "L.  200,000.00"
 */
function formatMonto(monto) {
  return 'L.  ' + parseFloat(monto).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formatea una fecha DATE a texto en español.
 * Ej: 2026-06-26 → "26 DE JUNIO DE 2026"
 */
function formatFecha(fechaStr) {
  const meses = [
    'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
    'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE',
  ];
  const d = new Date(fechaStr + 'T12:00:00');
  return `${d.getDate()} DE ${meses[d.getMonth()]} DE ${d.getFullYear()}`;
}

/**
 * Corta texto para que no supere maxWidth pts con la fuente helvetica a fontSize.
 * pdf-lib no mide texto de forma nativa, usamos estimación (0.5 * size ≈ 1 char).
 */
function truncate(text, maxW, size) {
  if (!maxW) return text;
  const maxChars = Math.floor(maxW / (size * 0.52));
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + '…';
}

/**
 * Carga el buffer de imagen de la firma del presidente.
 * Prioridad: PNG → SVG (convertido con sharp si está disponible).
 * Retorna null si no se encuentra ningún archivo.
 */
async function cargarFirma() {
  // 1. Si existe PNG, lo usa directamente
  if (fs.existsSync(FIRMA_PNG_PATH)) {
    return { buffer: fs.readFileSync(FIRMA_PNG_PATH), tipo: 'png' };
  }

  // 2. Si existe SVG, intenta convertir con sharp
  if (fs.existsSync(FIRMA_SVG_PATH)) {
    try {
      const sharp  = require('sharp');
      const buffer = await sharp(FIRMA_SVG_PATH)
        .resize(320, 120, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer();
      return { buffer, tipo: 'png' };
    } catch (e) {
      console.warn('[pdf_generator] sharp no disponible o error al convertir SVG:', e.message);
    }
  }

  return null;
}

/**
 * Genera el PDF de una Orden de Pago sobre hoja en blanco.
 * El resultado se imprime sobre el papel preimpreso físico.
 *
 * @param {Object} datos - Datos completos de la orden de pago
 * @returns {Promise<Uint8Array>} - Bytes del PDF generado
 */
async function generarOrdenPagoPDF(datos) {
  const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Orden de Pago ${datos.numero_orden || ''}`);
  pdfDoc.setCreator('Sistema Control Interno');

  const page   = pdfDoc.addPage([612, 792]); // Carta
  const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ── Número de orden ───────────────────────────────────────────────────────
  if (datos.numero_orden) {
    const c = applyOffset(COORDS.numero_orden);
    const txt = datos.numero_orden.toUpperCase();
    const textW = fontB.widthOfTextAtSize(txt, c.size);
    page.drawText(txt, {
      x: c.align === 'center' ? c.x + (c.maxW - textW) / 2 : c.x,
      y: c.y,
      size: c.size + 1,
      font: fontB,
      color: rgb(0, 0, 0),
    });
  }

  // ── No. cheque / transferencia ────────────────────────────────────────────
  if (datos.no_cheque_transferencia) {
    const c = applyOffset(COORDS.no_cheque_transferencia);
    const txt = datos.no_cheque_transferencia.toString().trim();
    const textW = font.widthOfTextAtSize(txt, c.size);
    page.drawText(txt, {
      x: c.align === 'center' ? c.x + (c.maxW - textW) / 2 : c.x,
      y: c.y,
      size: c.size,
      font,
      color: rgb(0, 0, 0),
    });
  }

  // ── Tipo de cuenta (marca X) ───────────────────────────────────────────────
  if (datos.tipo_cuenta && COORDS.tipo_cuenta[datos.tipo_cuenta]) {
    const tc = applyOffset(COORDS.tipo_cuenta[datos.tipo_cuenta]);
    page.drawText('X', { x: tc.x, y: tc.y, size: 8, font: fontB, color: rgb(0, 0, 0) });
  }

  // ── Beneficiario ──────────────────────────────────────────────────────────
  if (datos.beneficiario) {
    const c   = applyOffset(COORDS.beneficiario);
    const txt = truncate(datos.beneficiario.toUpperCase(), c.maxW, c.size);
    page.drawText(txt, { x: c.x, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }

  // ── Código beneficiario ───────────────────────────────────────────────────
  if (datos.codigo_beneficiario) {
    const c   = applyOffset(COORDS.codigo_beneficiario);
    const txt = truncate(datos.codigo_beneficiario.trim(), c.maxW, c.size);
    page.drawText(txt, { x: c.x, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }

  // ── Monto en números ──────────────────────────────────────────────────────
  {
    const c   = applyOffset(COORDS.monto_numeros);
    const txt = formatMonto(datos.monto);
    page.drawText(txt, { x: c.x, y: c.y, size: c.size, font: fontB, color: rgb(0, 0, 0) });
  }

  // ── Monto en letras ───────────────────────────────────────────────────────
  if (datos.monto_letras) {
    const c   = applyOffset(COORDS.monto_letras);
    const txt = truncate(datos.monto_letras.toUpperCase(), c.maxW, c.size);
    page.drawText(txt, { x: c.x, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }

  // ── Valor que se adeuda por ───────────────────────────────────────────────
  if (datos.valor_adeuda_por) {
    const c   = applyOffset(COORDS.valor_adeuda_por);
    const txt = truncate(datos.valor_adeuda_por.toUpperCase(), c.maxW, c.size);
    page.drawText(txt, { x: c.x, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }

  // ── Tabla CARGOS — fila 1 ────────────────────────────────────────────────
  const cr = COORDS.cargos_row1;
  if (datos.cargo_anio) {
    const c = applyOffset(cr.anio);
    page.drawText(String(datos.cargo_anio), { x: c.x, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }
  if (datos.cargo_org) {
    const c = applyOffset(cr.org);
    page.drawText(datos.cargo_org.trim(), { x: c.x, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }
  if (datos.cargo_fondo) {
    const c = applyOffset(cr.fondo);
    page.drawText(datos.cargo_fondo.trim(), { x: c.x, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }
  if (datos.cargo_tipo_prog) {
    const c = applyOffset(cr.tipo_prog);
    page.drawText(datos.cargo_tipo_prog.trim(), { x: c.x, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }
  if (datos.cargo_sub_prog) {
    const c = applyOffset(cr.sub_prog);
    page.drawText(datos.cargo_sub_prog.trim(), { x: c.x, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }
  if (datos.cargo_act) {
    const c = applyOffset(cr.act);
    page.drawText(datos.cargo_act.trim(), { x: c.x, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }
  if (datos.cargo_cuenta) {
    const c = applyOffset(cr.cuenta);
    page.drawText(datos.cargo_cuenta.trim(), { x: c.x, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }
  // Importe del cargo (alineado a la derecha)
  {
    const c   = applyOffset(cr.importe);
    const txt = formatMonto(datos.monto);
    const textW = font.widthOfTextAtSize(txt, c.size);
    page.drawText(txt, { x: c.x - textW, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }

  // ── Concepto / descripción ────────────────────────────────────────────────
  if (datos.concepto) {
    const c   = applyOffset(COORDS.concepto);
    const txt = truncate(
      (datos.cargo_cuenta ? `${datos.cargo_cuenta} ` : '') + datos.concepto.toUpperCase(),
      c.maxW, c.size,
    );
    page.drawText(txt, { x: c.x, y: c.y, size: c.size, font: fontB, color: rgb(0, 0, 0) });
  }

  if (datos.descripcion_detallada) {
    const c   = applyOffset(COORDS.descripcion_detallada);
    const txt = truncate(datos.descripcion_detallada.toUpperCase(), c.maxW, c.size);
    page.drawText(txt, { x: c.x, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }

  // ── Importe en sección descripción ───────────────────────────────────────
  {
    const c   = applyOffset(COORDS.importe_descripcion);
    const txt = formatMonto(datos.monto);
    const textW = font.widthOfTextAtSize(txt, c.size);
    page.drawText(txt, { x: c.x - textW, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }

  // ── Cantidad a pagar ──────────────────────────────────────────────────────
  {
    const c   = applyOffset(COORDS.cantidad_a_pagar);
    const txt = formatMonto(datos.monto);
    const textW = fontB.widthOfTextAtSize(txt, c.size);
    page.drawText(txt, { x: c.x - textW, y: c.y, size: c.size, font: fontB, color: rgb(0, 0, 0) });
  }

  // ── Total ─────────────────────────────────────────────────────────────────
  {
    const c   = applyOffset(COORDS.total);
    const txt = formatMonto(datos.monto);
    const textW = font.widthOfTextAtSize(txt, c.size);
    page.drawText(txt, { x: c.x - textW, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }

  // ── Fecha ─────────────────────────────────────────────────────────────────
  if (datos.fecha) {
    const c   = applyOffset(COORDS.fecha_texto);
    const txt = formatFecha(
      typeof datos.fecha === 'string'
        ? datos.fecha.slice(0, 10)
        : datos.fecha.toISOString().slice(0, 10),
    );
    page.drawText(txt, { x: c.x, y: c.y, size: c.size, font, color: rgb(0, 0, 0) });
  }

  // ── Firma del presidente ──────────────────────────────────────────────────
  try {
    const firma = await cargarFirma();
    if (firma) {
      const img = await pdfDoc.embedPng(firma.buffer);
      const fc  = applyOffset(COORDS.firma_presidente);
      page.drawImage(img, {
        x:       fc.x,
        y:       fc.y,
        width:   fc.width,
        height:  fc.height,
        opacity: fc.opacity,
      });
    } else {
      console.warn('[pdf_generator] Firma del presidente no encontrada. PDF generado sin firma.');
    }
  } catch (err) {
    console.error('[pdf_generator] Error al incrustar firma:', err.message);
    // No interrumpe la generación del PDF
  }

  return pdfDoc.save();
}

module.exports = { generarOrdenPagoPDF };
