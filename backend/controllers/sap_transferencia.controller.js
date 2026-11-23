const db = require('../db');
const { logEvent, getClientIP } = require('../middleware/audit');

const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];
const UNIDAD_DEFECTO = 'PAGADURIA ESPECIAL';
const RESERVA_TTL_MINUTES = 15;

const limpiar = v => (v == null ? '' : String(v)).trim();
const numero4 = n => String(n).padStart(4, '0');
const esFecha = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00').getTime());
const error500 = (res) => res.status(500).json({ message: 'Error interno del servidor.' });

// Valida y normaliza los campos que escribe el usuario
function leerCampos(body) {
  const fecha_solicitud    = limpiar(body.fecha_solicitud).slice(0, 10);
  const unidad_solicitante = limpiar(body.unidad_solicitante).toUpperCase() || UNIDAD_DEFECTO;
  const monto_cotizacion   = Math.round(parseFloat(body.monto_cotizacion) * 100) / 100;
  if (!esFecha(fecha_solicitud)) return { error: 'La fecha de solicitud es obligatoria.' };
  const anio = parseInt(fecha_solicitud.slice(0, 4), 10);
  if (anio < 2020 || anio > 2100) return { error: 'La fecha de solicitud no es válida.' };
  if (unidad_solicitante.length > 200) return { error: 'La unidad solicitante no puede superar 200 caracteres.' };
  if (isNaN(monto_cotizacion) || monto_cotizacion <= 0) return { error: 'El monto según cotización debe ser mayor que cero.' };
  if (monto_cotizacion > 999999999999) return { error: 'El monto según cotización es demasiado grande.' };
  return { fecha_solicitud, unidad_solicitante, monto_cotizacion };
}

const SELECT_BASE = `SELECT s.*, u.nombre AS creado_por_nombre
                     FROM sap_transferencia s
                     JOIN usuarios u ON u.id = s.creado_por`;

const conTexto = r => ({ ...r, numero_texto: numero4(r.numero) });

// ── GET /api/sap-transferencia ─────────────────────────────
// SUPER_ADMIN / ADMIN / ASISTENTE ven todo; el resto solo lo que creó.
exports.getAll = (req, res) => {
  const todo = ROLES_ADMIN.includes(req.user.rol);
  const sql = `${SELECT_BASE} ${todo ? '' : 'WHERE s.creado_por = ?'} ORDER BY s.anio DESC, s.numero DESC LIMIT 3000`;
  db.query(sql, todo ? [] : [req.user.id], (err, rows) => {
    if (err) { console.error('[sap_transferencia] getAll:', err); return error500(res); }
    res.json(rows.map(conTexto));
  });
};

// ── GET /api/sap-transferencia/:id ─────────────────────────
exports.getOne = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
  const todo = ROLES_ADMIN.includes(req.user.rol);
  db.query(`${SELECT_BASE} WHERE s.id = ?${todo ? '' : ' AND s.creado_por = ?'}`, todo ? [id] : [id, req.user.id], (err, rows) => {
    if (err) { console.error('[sap_transferencia] getOne:', err); return error500(res); }
    if (!rows.length) return res.status(404).json({ message: 'SAP no encontrado.' });
    res.json(conTexto(rows[0]));
  });
};

// ── POST /api/sap-transferencia ────────────────────────────
// Requiere una orden reservada por el mismo usuario (reservada hace menos de 15 minutos).
// En una sola transacción: valida la orden, guarda el SAP y marca la orden como 'usado'.
exports.create = (req, res) => {
  const c = leerCampos(req.body);
  if (c.error) return res.status(400).json({ message: c.error });

  const ordenId   = parseInt(req.body.numero_orden_id, 10);
  const ordenNum  = parseInt(req.body.numero_orden, 10);
  const ordenAnio = parseInt(req.body.numero_orden_anio, 10);
  if ([ordenId, ordenNum, ordenAnio].some(n => isNaN(n) || n <= 0))
    return res.status(409).json({ message: 'Debe reservar una orden válida antes de crear el SAP.' });

  db.getConnection((connErr, conn) => {
    if (connErr) { console.error('[sap_transferencia] getConnection:', connErr); return error500(res); }
    const abortar = (status, message, err) => conn.rollback(() => {
      conn.release();
      if (err) console.error('[sap_transferencia] create:', err);
      res.status(status).json({ message });
    });

    conn.beginTransaction(txErr => {
      if (txErr) { conn.release(); return error500(res); }
      conn.query(
        `SELECT id FROM orden_sap_transferencia
         WHERE id = ? AND numero = ? AND anio = ? AND estado = 'reservado' AND usuario_id = ?
           AND fecha_registro >= DATE_SUB(NOW(), INTERVAL ${RESERVA_TTL_MINUTES} MINUTE)
         FOR UPDATE`,
        [ordenId, ordenNum, ordenAnio, req.user.id],
        (err, rows) => {
          if (err) return abortar(500, 'Error interno del servidor.', err);
          if (!rows.length) return abortar(409, 'La orden reservada ya no está disponible. Cierre el formulario y vuelva a intentarlo.');

          conn.query(
            `INSERT INTO sap_transferencia (orden_id, numero, anio, fecha_solicitud, unidad_solicitante, monto_cotizacion, creado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [ordenId, ordenNum, ordenAnio, c.fecha_solicitud, c.unidad_solicitante, c.monto_cotizacion, req.user.id],
            (err2, result) => {
              if (err2) return abortar(500, 'Error interno del servidor.', err2);
              conn.query(
                `UPDATE orden_sap_transferencia SET estado = 'usado', sap_id = ?, fecha_registro = NOW()
                 WHERE id = ? AND estado = 'reservado' AND usuario_id = ?`,
                [result.insertId, ordenId, req.user.id],
                (err3, upd) => {
                  if (err3) return abortar(500, 'Error interno del servidor.', err3);
                  if (upd.affectedRows === 0) return abortar(409, 'La orden reservada cambió de estado antes de guardar. Vuelva a intentarlo.');
                  conn.commit(cErr => {
                    if (cErr) return abortar(500, 'Error interno del servidor.', cErr);
                    conn.release();
                    logEvent({
                      usuario_id: req.user.id, usuario_nombre: req.user.nombre || null, accion: 'CREAR', modulo: 'sap-transferencia',
                      detalle: `Creó SAP Transferencia N° ${numero4(ordenNum)}-${ordenAnio} — ${c.unidad_solicitante}, monto ${c.monto_cotizacion.toFixed(2)}`,
                      ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO',
                    });
                    res.status(201).json({ id: result.insertId, numero: ordenNum, numero_texto: numero4(ordenNum), message: 'SAP creado correctamente.' });
                  });
                }
              );
            }
          );
        }
      );
    });
  });
};

// ── PUT /api/sap-transferencia/:id ─────────────────────────
// Se puede cambiar fecha, unidad y monto; el número no cambia.
exports.update = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
  const c = leerCampos(req.body);
  if (c.error) return res.status(400).json({ message: c.error });

  const todo = ROLES_ADMIN.includes(req.user.rol);
  db.query(`SELECT id, anio, numero, estado FROM sap_transferencia WHERE id = ?${todo ? '' : ' AND creado_por = ?'}`, todo ? [id] : [id, req.user.id], (err, rows) => {
    if (err) { console.error('[sap_transferencia] update SELECT:', err); return error500(res); }
    if (!rows.length) return res.status(404).json({ message: 'SAP no encontrado.' });
    if (rows[0].estado === 'anulado') return res.status(409).json({ message: 'Un SAP anulado no se puede editar.' });
    db.query(
      'UPDATE sap_transferencia SET fecha_solicitud = ?, unidad_solicitante = ?, monto_cotizacion = ? WHERE id = ?',
      [c.fecha_solicitud, c.unidad_solicitante, c.monto_cotizacion, id],
      (err2) => {
        if (err2) { console.error('[sap_transferencia] update:', err2); return error500(res); }
        logEvent({
          usuario_id: req.user.id, usuario_nombre: req.user.nombre || null, accion: 'ACTUALIZAR', modulo: 'sap-transferencia',
          detalle: `Actualizó SAP Transferencia N° ${numero4(rows[0].numero)}-${rows[0].anio} — monto ${c.monto_cotizacion.toFixed(2)}`,
          ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO',
        });
        res.json({ message: 'SAP actualizado correctamente.' });
      }
    );
  });
};

// ── POST /api/sap-transferencia/:id/anular ─────────────────
// No se elimina: se anula con motivo y el número queda ocupado (no se reutiliza).
exports.anular = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol)) return res.status(403).json({ message: 'No tiene permiso para anular.' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
  const motivo = limpiar(req.body.motivo);
  if (!motivo) return res.status(400).json({ message: 'Debe indicar el motivo de anulación.' });
  if (motivo.length > 500) return res.status(400).json({ message: 'El motivo no puede superar 500 caracteres.' });
  db.query(
    `UPDATE sap_transferencia SET estado = 'anulado', motivo_anulacion = ?, anulado_por = ?, fecha_anulacion = NOW()
     WHERE id = ? AND estado = 'activo'`,
    [motivo, req.user.id, id],
    (err, result) => {
      if (err) { console.error('[sap_transferencia] anular:', err); return error500(res); }
      if (result.affectedRows === 0) return res.status(404).json({ message: 'SAP no encontrado o ya estaba anulado.' });
      logEvent({
        usuario_id: req.user.id, usuario_nombre: req.user.nombre || null, accion: 'ANULAR', modulo: 'sap-transferencia',
        detalle: `Anuló SAP Transferencia ID #${id}. Motivo: ${motivo}`,
        ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO',
      });
      res.json({ message: 'SAP anulado correctamente.' });
    }
  );
};
