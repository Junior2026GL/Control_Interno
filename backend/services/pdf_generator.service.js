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
  cantidad_a_pagar:        { x: 543, y: 158, size: 13, align: 'right' },

  // Total (repetición del monto en sección inferior)
  total:                   { x: 543, y: 136, size: 12, align: 'right' },

  // Fecha  (Tegucigalpa, M.D.C., ____ de _____ de _____)
  fecha_texto:             { x: 249, y: 82,  size: 8 },

  // Firma del presidente — imagen
  // Calibración: x centra la imagen sobre la línea de firma del preimpreso.
  // y es desde el borde inferior de la hoja (pdf-lib). Bajar = reducir y.
  // Centro horizontal de la línea de firma ≈ 490 pts → x = 490 - width/2
  firma_presidente: {
    x: 378,   // pts desde izquierda  (ajustar ±5 para centrar horizontalmente)
    y: 15,    // pts desde abajo      (ajustar ±5 para subir/bajar)
    width: 235,
    height: 92,
    opacity: 1.0,
  },
};

// Ajuste global (mm) — útil cuando toda la impresión está desplazada
const OFFSET_X_MM = 0;
const OFFSET_Y_MM = 0;
const OFFSET_X    = OFFSET_X_MM * 2.835;
const OFFSET_Y    = OFFSET_Y_MM * 2.835;

// Ruta del archivo de firma del presidente
// Prioridad: 1) private/firma_presidente.svg  2) private/firma_presidente.png
const FIRMA_PNG_PATH  = path.join(__dirname, '../private/firma_presidente.png');
const FIRMA_SVG_PATH  = path.join(__dirname, '../private/firma_presidente.svg');

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
 * Prioridad: SVG (private/) → PNG (private/).
 * Retorna null si no se encuentra ningún archivo.
 *
 * Para impresoras de matriz de puntos (dot matrix) como la Epson LQ-590 II:
 * - Se convierte a blanco/negro puro (sin grises ni anti-aliasing)
 * - Se aplana la transparencia contra fondo blanco
 * - Se usa alta resolución para mejor definición del trazo
 */
async function cargarFirma() {
  const sharp = require('sharp');

  // 1. SVG vectorial → convierte con sharp a B&N puro
  if (fs.existsSync(FIRMA_SVG_PATH)) {
    try {
      const buffer = await sharp(FIRMA_SVG_PATH)
        .resize(1200, 450, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 255 } })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .grayscale()
        .threshold(140)
        .png()
        .toBuffer();
      return { buffer, tipo: 'png' };
    } catch (e) {
      console.warn('[pdf_generator] Error al convertir firma_presidente.svg con sharp:', e.message);
    }
  }

  // 2. Fallback: PNG directo → también se convierte a B&N puro
  if (fs.existsSync(FIRMA_PNG_PATH)) {
    try {
      const buffer = await sharp(FIRMA_PNG_PATH)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .grayscale()
        .threshold(140)
        .png()
        .toBuffer();
      return { buffer, tipo: 'png' };
    } catch (e) {
      console.warn('[pdf_generator] sharp falló al procesar PNG, usando archivo directo:', e.message);
      return { buffer: fs.readFileSync(FIRMA_PNG_PATH), tipo: 'png' };
    }
  }

  return null;
}

/**
 * Genera el PDF de una Orden de Pago — solo estampa la firma del presidente.
 * El resto del contenido ya está en el papel preimpreso físico.
 *
 * @param {Object} datos - Datos de la orden (se usa numero_orden para el título)
 * @returns {Promise<Uint8Array>} - Bytes del PDF generado
 */
async function generarOrdenPagoPDF(datos) {
  const { PDFDocument } = require('pdf-lib');

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Orden de Pago ${datos.numero_orden || ''}`);
  pdfDoc.setCreator('Sistema Control Interno');

  const page = pdfDoc.addPage([612, 792]); // Carta

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
