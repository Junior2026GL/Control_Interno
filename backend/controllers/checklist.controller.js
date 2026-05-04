const db = require('../db');

const BOOL_FIELDS = [
  'orden_pago_da', 'validacion_factura_sar', 'formato_sap', 'orden_compra',
  'acta_recepcion', 'resumen_cotizacion', 'acta_entrega', 'cotizaciones',
  'factura_original', 'memo_requisicion', 'solicitud_eventos', 'informe_tecnico',
  'validacion_rtn', 'constancia_legal', 'solvencia_fiscal', 'otros',
];

function sanitize(str) { return (str || '').toString().trim(); }
function toBool(v) { return v ? 1 : 0; }

// ── folio secuencial con transacción (evita duplicados) ──────────────────────
function nextNumero(cb) {
  db.getConnection((connErr, conn) => {
    if (connErr) return cb(connErr);
    conn.beginTransaction(txErr => {
      if (txErr) { conn.release(); return cb(txErr); }
      conn.query(
        'SELECT IFNULL(MAX(CAST(numero AS UNSIGNED)), 0) AS ultimo FROM checklist_expediente FOR UPDATE',
        [],
        (err, rows) => {
          if (err) {
            return conn.rollback(() => { conn.release(); cb(err); });
          }
          const last = rows.length ? parseInt(rows[0].ultimo, 10) : 0;
          const next = String(last + 1).padStart(4, '0');
          conn.commit(commitErr => {
            conn.release();
            if (commitErr) return cb(commitErr);
            cb(null, next);
          });
        }
      );
    });
  });
}

// ── GET /api/checklist ─────────────────────────────────────────────────────
// SUPER_ADMIN / ADMIN / ASISTENTE: ve todos los registros
exports.getAll = (req, res) => {
  const canSeeAll = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'].includes(req.user.rol);
  const sql = canSeeAll
    ? `SELECT cl.*, u.nombre AS creado_por_nombre
       FROM checklist_expediente cl
       JOIN usuarios u ON u.id = cl.creado_por
       ORDER BY cl.id DESC LIMIT 2000`
    : `SELECT cl.*, u.nombre AS creado_por_nombre
       FROM checklist_expediente cl
       JOIN usuarios u ON u.id = cl.creado_por
       WHERE cl.creado_por = ?
       ORDER BY cl.id DESC LIMIT 2000`;
  const params = canSeeAll ? [] : [req.user.id];
  db.query(sql, params, (err, rows) => {
    if (err) { console.error('[checklist] getAll:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
    res.json(rows);
  });
};

// ── GET /api/checklist/:id ─────────────────────────────────────────────────
exports.getOne = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
  const canSeeAll = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'].includes(req.user.rol);
  const sql = canSeeAll
    ? `SELECT cl.*, u.nombre AS creado_por_nombre FROM checklist_expediente cl
       JOIN usuarios u ON u.id = cl.creado_por WHERE cl.id = ?`
    : `SELECT cl.*, u.nombre AS creado_por_nombre FROM checklist_expediente cl
       JOIN usuarios u ON u.id = cl.creado_por WHERE cl.id = ? AND cl.creado_por = ?`;
  const params = canSeeAll ? [id] : [id, req.user.id];
  db.query(sql, params, (err, rows) => {
    if (err) { console.error('[checklist] getOne:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
    if (!rows.length) return res.status(404).json({ message: 'Check list no encontrado.' });
    res.json(rows[0]);
  });
};

// ── POST /api/checklist ────────────────────────────────────────────────────
exports.create = (req, res) => {
  const numero_folios     = sanitize(req.body.numero_folios)     || null;
  const numero_expediente = sanitize(req.body.numero_expediente) || null;
  const observaciones     = sanitize(req.body.observaciones)     || null;

  if (observaciones && observaciones.length > 2000)
    return res.status(400).json({ message: 'Las observaciones no pueden superar 2000 caracteres.' });

  const bools = {};
  for (const f of BOOL_FIELDS) bools[f] = toBool(req.body[f]);

  nextNumero((err, numero) => {
    if (err) { console.error('[checklist] nextNumero:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
    db.query(
      `INSERT INTO checklist_expediente
        (numero, numero_folios, numero_expediente,
         orden_pago_da, validacion_factura_sar, formato_sap, orden_compra,
         acta_recepcion, resumen_cotizacion, acta_entrega, cotizaciones,
         factura_original, memo_requisicion, solicitud_eventos, informe_tecnico,
         validacion_rtn, constancia_legal, solvencia_fiscal, otros,
         observaciones, creado_por)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        numero, numero_folios, numero_expediente,
        bools.orden_pago_da, bools.validacion_factura_sar, bools.formato_sap, bools.orden_compra,
        bools.acta_recepcion, bools.resumen_cotizacion, bools.acta_entrega, bools.cotizaciones,
        bools.factura_original, bools.memo_requisicion, bools.solicitud_eventos, bools.informe_tecnico,
        bools.validacion_rtn, bools.constancia_legal, bools.solvencia_fiscal, bools.otros,
        observaciones, req.user.id,
      ],
      (err2, result) => {
        if (err2) { console.error('[checklist] create:', err2); return res.status(500).json({ message: 'Error interno del servidor.' }); }
        res.status(201).json({ id: result.insertId, numero, message: 'Check list creado correctamente.' });
      }
    );
  });
};

// ── PUT /api/checklist/:id ─────────────────────────────────────────────────
exports.update = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  const canEditAll = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'].includes(req.user.rol);

  const numero_folios     = sanitize(req.body.numero_folios)     || null;
  const numero_expediente = sanitize(req.body.numero_expediente) || null;
  const observaciones     = sanitize(req.body.observaciones)     || null;

  if (observaciones && observaciones.length > 2000)
    return res.status(400).json({ message: 'Las observaciones no pueden superar 2000 caracteres.' });

  const bools = {};
  for (const f of BOOL_FIELDS) bools[f] = toBool(req.body[f]);

  const selectSql    = canEditAll
    ? 'SELECT id FROM checklist_expediente WHERE id = ?'
    : 'SELECT id FROM checklist_expediente WHERE id = ? AND creado_por = ?';
  const selectParams = canEditAll ? [id] : [id, req.user.id];

  db.query(selectSql, selectParams, (err, rows) => {
    if (err) { console.error('[checklist] update SELECT:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
    if (!rows.length) return res.status(404).json({ message: 'Check list no encontrado.' });

    db.query(
      `UPDATE checklist_expediente SET
         numero_folios = ?, numero_expediente = ?,
         orden_pago_da = ?, validacion_factura_sar = ?, formato_sap = ?, orden_compra = ?,
         acta_recepcion = ?, resumen_cotizacion = ?, acta_entrega = ?, cotizaciones = ?,
         factura_original = ?, memo_requisicion = ?, solicitud_eventos = ?, informe_tecnico = ?,
         validacion_rtn = ?, constancia_legal = ?, solvencia_fiscal = ?, otros = ?,
         observaciones = ?
       WHERE id = ?`,
      [
        numero_folios, numero_expediente,
        bools.orden_pago_da, bools.validacion_factura_sar, bools.formato_sap, bools.orden_compra,
        bools.acta_recepcion, bools.resumen_cotizacion, bools.acta_entrega, bools.cotizaciones,
        bools.factura_original, bools.memo_requisicion, bools.solicitud_eventos, bools.informe_tecnico,
        bools.validacion_rtn, bools.constancia_legal, bools.solvencia_fiscal, bools.otros,
        observaciones, id,
      ],
      (err2) => {
        if (err2) { console.error('[checklist] update UPDATE:', err2); return res.status(500).json({ message: 'Error interno del servidor.' }); }
        res.json({ message: 'Check list actualizado correctamente.' });
      }
    );
  });
};

// ── DELETE /api/checklist/:id ──────────────────────────────────────────────
exports.remove = (req, res) => {
  if (!['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'].includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permiso para eliminar.' });

  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  db.query('DELETE FROM checklist_expediente WHERE id = ?', [id], (err, result) => {
    if (err) { console.error('[checklist] remove:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Check list no encontrado.' });
    res.json({ message: 'Check list eliminado correctamente.' });
  });
};
