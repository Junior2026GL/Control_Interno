'use strict';
const db                    = require('../db');
const { logEvent, getClientIP } = require('../middleware/audit');
const { generarOrdenPagoPDF }   = require('../services/pdf_generator.service');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/firma/imprimir
// Genera el PDF con las firmas y registra la impresión.
// ─────────────────────────────────────────────────────────────────────────────
exports.imprimir = async (req, res) => {
  const ip = getClientIP(req);
  try {
    const pdfBytes = await generarOrdenPagoPDF({});

    // Registrar impresión (sin bloquear la respuesta)
    db.promise().query(
      `INSERT INTO firma_impresiones (usuario_id, usuario_nombre, ip_cliente)
       VALUES (?, ?, ?)`,
      [req.user.id, req.user.nombre, ip],
    ).catch(e => console.error('[firma] Error al registrar impresión:', e));

    logEvent({
      usuario_id:     req.user.id,
      usuario_nombre: req.user.nombre,
      accion:         'IMPRIMIR',
      modulo:         'firma',
      detalle:        'Impresión de firma',
      ip,
      metodo:         req.method,
      ruta:           req.originalUrl,
      resultado:      'EXITO',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="firma.pdf"');
    res.setHeader('Content-Length', pdfBytes.length);
    return res.end(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('[firma] Error al generar PDF:', err.message);
    return res.status(500).json({ message: 'Error al generar el PDF de firma.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/firma/historial
// Devuelve el historial de impresiones con total por usuario.
// ─────────────────────────────────────────────────────────────────────────────
exports.historial = async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT
         fi.id,
         fi.usuario_id,
         fi.usuario_nombre,
         fi.fecha_hora,
         fi.ip_cliente,
         totales.total_impresiones
       FROM firma_impresiones fi
       JOIN (
         SELECT usuario_id, COUNT(*) AS total_impresiones
         FROM firma_impresiones
         GROUP BY usuario_id
       ) totales ON totales.usuario_id = fi.usuario_id
       ORDER BY fi.fecha_hora DESC
       LIMIT 500`,
    );
    return res.json(rows);
  } catch (err) {
    console.error('[firma] Error al obtener historial:', err.message);
    return res.status(500).json({ message: 'Error al obtener el historial.' });
  }
};
