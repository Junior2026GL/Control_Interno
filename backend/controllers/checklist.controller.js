const db = require('../db');
const { logEvent, getClientIP } = require('../middleware/audit');

const BOOL_FIELDS = [
  'orden_pago_da', 'acta_recepcion', 'acta_entrega', 'validacion_factura_sar',
  'factura_original', 'formato_sap', 'orden_compra', 'solvencia_fiscal',
  'permiso_operacion', 'validacion_rtn', 'resumen_cotizacion', 'cotizaciones',
  'informe_tecnico', 'solicitud_eventos', 'memo_requisicion', 'constancia_legal', 'otros',
];

function sanitize(str) { return (str || '').toString().trim(); }
function toBool(v) { return v ? 1 : 0; }
const RESERVA_TTL_MINUTES = 15;

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
  const numero_orden      = req.body.numero_orden ? parseInt(req.body.numero_orden, 10) : null;
  const numero_orden_id   = req.body.numero_orden_id ? parseInt(req.body.numero_orden_id, 10) : null;
  const numero_orden_anio = req.body.numero_orden_anio ? parseInt(req.body.numero_orden_anio, 10) : null;

  if (!numero_folios)
    return res.status(400).json({ message: 'El N° de Folios Expediente es obligatorio.' });

  if (isNaN(numero_orden) || numero_orden <= 0 || isNaN(numero_orden_id) || numero_orden_id <= 0 || isNaN(numero_orden_anio) || numero_orden_anio < 2020 || numero_orden_anio > 2100)
    return res.status(409).json({ message: 'Debe reservar una orden válida antes de crear el check list.' });

  if (observaciones && observaciones.length > 2000)
    return res.status(400).json({ message: 'Las observaciones no pueden superar 2000 caracteres.' });

  const bools = {};
  for (const f of BOOL_FIELDS) bools[f] = toBool(req.body[f]);
  const numero = String(numero_orden).padStart(4, '0');

  db.getConnection((connErr, conn) => {
    if (connErr) {
      console.error('[checklist] create getConnection:', connErr);
      return res.status(500).json({ message: 'Error interno del servidor.' });
    }

    conn.beginTransaction(txErr => {
      if (txErr) {
        conn.release();
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }

      conn.query(
        `SELECT id, numero, anio, estado, usuario_id, fecha_registro
         FROM orden_checklist
         WHERE id = ?
           AND numero = ?
           AND anio = ?
           AND estado = 'reservado'
           AND usuario_id = ?
           AND fecha_registro >= DATE_SUB(NOW(), INTERVAL ${RESERVA_TTL_MINUTES} MINUTE)
         FOR UPDATE`,
        [numero_orden_id, numero_orden, numero_orden_anio, req.user.id],
        (orderErr, orderRows) => {
          if (orderErr) {
            return conn.rollback(() => {
              conn.release();
              console.error('[checklist] create SELECT orden_checklist:', orderErr);
              res.status(500).json({ message: 'Error interno del servidor.' });
            });
          }

          if (!orderRows.length) {
            return conn.rollback(() => {
              conn.release();
              res.status(409).json({ message: 'La orden reservada ya no está disponible. Cierre el modal y vuelva a intentarlo.' });
            });
          }

          conn.query(
            'SELECT id FROM checklist_expediente WHERE CAST(numero AS UNSIGNED) = ? LIMIT 1 FOR UPDATE',
            [numero_orden],
            (dupErr, dupRows) => {
              if (dupErr) {
                return conn.rollback(() => {
                  conn.release();
                  console.error('[checklist] create SELECT checklist_expediente:', dupErr);
                  res.status(500).json({ message: 'Error interno del servidor.' });
                });
              }

              if (dupRows.length) {
                return conn.rollback(() => {
                  conn.release();
                  res.status(409).json({ message: `La orden ${numero} ya está asociada a otro check list. Cierre el modal y vuelva a intentarlo.` });
                });
              }

              conn.query(
                `INSERT INTO checklist_expediente
                  (numero, numero_folios, numero_expediente,
                   orden_pago_da, acta_recepcion, acta_entrega, validacion_factura_sar,
                   factura_original, formato_sap, orden_compra, solvencia_fiscal,
                   permiso_operacion, validacion_rtn, resumen_cotizacion, cotizaciones,
                   informe_tecnico, solicitud_eventos, memo_requisicion, constancia_legal, otros,
                   observaciones, creado_por)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                  numero, numero_folios, numero_expediente,
                  bools.orden_pago_da, bools.acta_recepcion, bools.acta_entrega, bools.validacion_factura_sar,
                  bools.factura_original, bools.formato_sap, bools.orden_compra, bools.solvencia_fiscal,
                  bools.permiso_operacion, bools.validacion_rtn, bools.resumen_cotizacion, bools.cotizaciones,
                  bools.informe_tecnico, bools.solicitud_eventos, bools.memo_requisicion, bools.constancia_legal, bools.otros,
                  observaciones, req.user.id,
                ],
                (insertErr, result) => {
                  if (insertErr) {
                    return conn.rollback(() => {
                      conn.release();
                      if (insertErr.code === 'ER_DUP_ENTRY') {
                        return res.status(409).json({ message: `La orden ${numero} ya está asociada a otro check list. Cierre el modal y vuelva a intentarlo.` });
                      }
                      console.error('[checklist] create INSERT checklist_expediente:', insertErr);
                      res.status(500).json({ message: 'Error interno del servidor.' });
                    });
                  }

                  conn.query(
                    `UPDATE orden_checklist
                     SET estado = 'usado', checklist_id = ?, fecha_registro = NOW()
                     WHERE id = ? AND estado = 'reservado' AND usuario_id = ?`,
                    [result.insertId, numero_orden_id, req.user.id],
                    (updateErr, updateResult) => {
                      if (updateErr) {
                        return conn.rollback(() => {
                          conn.release();
                          console.error('[checklist] create UPDATE orden_checklist:', updateErr);
                          res.status(500).json({ message: 'Error interno del servidor.' });
                        });
                      }

                      if (updateResult.affectedRows === 0) {
                        return conn.rollback(() => {
                          conn.release();
                          res.status(409).json({ message: 'La orden reservada cambió de estado antes de guardar. Cierre el modal y vuelva a intentarlo.' });
                        });
                      }

                      conn.commit(commitErr => {
                        conn.release();
                        if (commitErr) {
                          console.error('[checklist] create COMMIT:', commitErr);
                          return res.status(500).json({ message: 'Error interno del servidor.' });
                        }
                        logEvent({ usuario_id: req.user.id, usuario_nombre: req.user.nombre || null, accion: 'CREAR', modulo: 'checklist', detalle: `Creó expediente N° ${numero}${numero_expediente ? ' — ' + numero_expediente : ''}`, ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO' });
                        res.status(201).json({ id: result.insertId, numero, message: 'Check list creado correctamente.' });
                      });
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
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

  if (!numero_folios)
    return res.status(400).json({ message: 'El N° de Folios Expediente es obligatorio.' });

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
         orden_pago_da = ?, acta_recepcion = ?, acta_entrega = ?, validacion_factura_sar = ?,
         factura_original = ?, formato_sap = ?, orden_compra = ?, solvencia_fiscal = ?,
         permiso_operacion = ?, validacion_rtn = ?, resumen_cotizacion = ?, cotizaciones = ?,
         informe_tecnico = ?, solicitud_eventos = ?, memo_requisicion = ?, constancia_legal = ?, otros = ?,
         observaciones = ?
       WHERE id = ?`,
      [
        numero_folios, numero_expediente,
        bools.orden_pago_da, bools.acta_recepcion, bools.acta_entrega, bools.validacion_factura_sar,
        bools.factura_original, bools.formato_sap, bools.orden_compra, bools.solvencia_fiscal,
        bools.permiso_operacion, bools.validacion_rtn, bools.resumen_cotizacion, bools.cotizaciones,
        bools.informe_tecnico, bools.solicitud_eventos, bools.memo_requisicion, bools.constancia_legal, bools.otros,
        observaciones, id,
      ],
      (err2) => {
        if (err2) { console.error('[checklist] update UPDATE:', err2); return res.status(500).json({ message: 'Error interno del servidor.' }); }
        logEvent({ usuario_id: req.user.id, usuario_nombre: req.user.nombre || null, accion: 'ACTUALIZAR', modulo: 'checklist', detalle: `Actualizó expediente ID #${id}${numero_expediente ? ' — ' + numero_expediente : ''}`, ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO' });
        res.json({ message: 'Check list actualizado correctamente.' });
      }
    );
  });
};

// ── DELETE /api/checklist/:id — bloqueado, usar /anular ───────────────────
exports.remove = (_req, res) => {
  return res.status(405).json({ message: 'La eliminación está deshabilitada. Use la opción de Anular.' });
};

// ── POST /api/checklist/:id/anular ────────────────────────────────────────
exports.anular = (req, res) => {
  if (!['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'].includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permiso para anular.' });

  const id     = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  const motivo = (req.body.motivo || '').toString().trim();
  if (!motivo) return res.status(400).json({ message: 'Debe indicar el motivo de anulación.' });
  if (motivo.length > 500) return res.status(400).json({ message: 'El motivo no puede superar 500 caracteres.' });

  db.query(
    `UPDATE checklist_expediente
     SET estado = 'anulado', motivo_anulacion = ?, anulado_por = ?, fecha_anulacion = NOW()
     WHERE id = ? AND estado = 'activo'`,
    [motivo, req.user.id, id],
    (err, result) => {
      if (err) { console.error('[checklist] anular:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
      if (result.affectedRows === 0) return res.status(404).json({ message: 'Check list no encontrado o ya estaba anulado.' });
      // Liberar la orden asociada en orden_checklist para que no quede como 'usado'
      // (el número quedará bloqueado por la restricción UNIQUE de checklist_expediente)
      db.query(
        `UPDATE orden_checklist
         SET estado = 'libre', usuario_id = NULL, fecha_registro = NULL, checklist_id = NULL
         WHERE checklist_id = ? AND estado = 'usado'`,
        [id],
        (errOC) => { if (errOC) console.error('[checklist] anular — liberar orden_checklist:', errOC.message); }
      );
      logEvent({
        usuario_id: req.user.id, usuario_nombre: req.user.nombre || null,
        accion: 'ANULAR', modulo: 'checklist',
        detalle: `Anuló expediente ID #${id}. Motivo: ${motivo}`,
        ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO',
      });
      res.json({ message: 'Check list anulado correctamente.' });
    }
  );
};
