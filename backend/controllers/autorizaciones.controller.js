const db      = require('../db');
const bcrypt  = require('bcryptjs');

const VALID_TIPOS = ['CHEQUE', 'CONTRA_ENTREGA', 'TRANSFERENCIA', 'PAGO_LINEA'];
const MONTO_MAX   = 99_999_999;
const ANIO_REGEX  = /^\d{4}$/; // valida año de 4 dígitos

// ── helpers ──────────────────────────────────────────────────────────────────

// nextNumero usa transacción para evitar race condition en folios duplicados
function nextNumero(cb) {
  db.getConnection((connErr, conn) => {
    if (connErr) return cb(connErr);
    conn.beginTransaction(txErr => {
      if (txErr) { conn.release(); return cb(txErr); }
      conn.query(
        'SELECT IFNULL(MAX(CAST(numero AS UNSIGNED)), 0) AS ultimo FROM autorizaciones_pago FOR UPDATE',
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

// ── GET /api/autorizaciones ───────────────────────────────────────────────────
// SUPER_ADMIN / ADMIN: ve todas
// ASISTENTE: solo las suyas
exports.getAll = (req, res) => {
  const canSeeAll = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.rol);
  const sql = canSeeAll
    ? `SELECT ap.*,
              u1.nombre AS creado_por_nombre,
              u2.nombre AS autorizado_por_nombre
       FROM autorizaciones_pago ap
       JOIN usuarios u1 ON u1.id = ap.creado_por
       LEFT JOIN usuarios u2 ON u2.id = ap.autorizado_por
       ORDER BY ap.id DESC LIMIT 2000`
    : `SELECT ap.*,
              u1.nombre AS creado_por_nombre,
              u2.nombre AS autorizado_por_nombre
       FROM autorizaciones_pago ap
       JOIN usuarios u1 ON u1.id = ap.creado_por
       LEFT JOIN usuarios u2 ON u2.id = ap.autorizado_por
       WHERE ap.creado_por = ?
       ORDER BY ap.id DESC LIMIT 2000`;
  const params = canSeeAll ? [] : [req.user.id];
  db.query(sql, params, (err, rows) => {
    if (err) { console.error('[autorizaciones] Error en getAll:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
    res.json(rows);
  });
};

// ── GET /api/autorizaciones/:id ───────────────────────────────────────────────
exports.getOne = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
  const canSeeAll = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.rol);
  const sql = canSeeAll
    ? `SELECT ap.*, u1.nombre AS creado_por_nombre, u2.nombre AS autorizado_por_nombre
       FROM autorizaciones_pago ap
       JOIN usuarios u1 ON u1.id = ap.creado_por
       LEFT JOIN usuarios u2 ON u2.id = ap.autorizado_por
       WHERE ap.id = ?`
    : `SELECT ap.*, u1.nombre AS creado_por_nombre, u2.nombre AS autorizado_por_nombre
       FROM autorizaciones_pago ap
       JOIN usuarios u1 ON u1.id = ap.creado_por
       LEFT JOIN usuarios u2 ON u2.id = ap.autorizado_por
       WHERE ap.id = ? AND ap.creado_por = ?`;
  const params = canSeeAll ? [id] : [id, req.user.id];
  db.query(sql, params, (err, rows) => {
    if (err) { console.error('[autorizaciones] Error en getOne:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
    if (!rows.length) return res.status(404).json({ message: 'Autorización no encontrada.' });
    res.json(rows[0]);
  });
};

// ── POST /api/autorizaciones ──────────────────────────────────────────────────
exports.create = (req, res) => {
  const {
    tipo_pago, beneficiario: rawBenef, monto, monto_letras: rawLetras,
    detalle: rawDetalle, anio, org: rawOrg, fondo: rawFondo,
  } = req.body;

  // tipo_pago
  if (!tipo_pago || !VALID_TIPOS.includes(tipo_pago))
    return res.status(400).json({ message: 'Tipo de pago inválido.' });

  // beneficiario
  const beneficiario = (rawBenef || '').trim();
  if (!beneficiario || beneficiario.length < 2 || beneficiario.length > 200)
    return res.status(400).json({ message: 'El beneficiario es requerido (2-200 caracteres).' });

  // monto
  const montoNum = parseFloat(monto);
  if (!monto || isNaN(montoNum) || montoNum <= 0)
    return res.status(400).json({ message: 'El monto debe ser mayor a cero.' });
  if (montoNum > MONTO_MAX)
    return res.status(400).json({ message: 'El monto excede el límite permitido.' });
  const montoFinal = Math.round(montoNum * 100) / 100;

  // monto_letras
  const monto_letras = (rawLetras || '').trim();
  if (!monto_letras || monto_letras.length < 3 || monto_letras.length > 600)
    return res.status(400).json({ message: 'El monto en letras es requerido.' });

  // detalle
  const detalle = (rawDetalle || '').trim();
  if (!detalle || detalle.length < 3 || detalle.length > 1000)
    return res.status(400).json({ message: 'El detalle es requerido (3-1000 caracteres).' });

  // anio
  const anioNum = parseInt(anio, 10);
  if (!anio || isNaN(anioNum) || anioNum < 2000 || anioNum > 2100)
    return res.status(400).json({ message: 'El año es inválido.' });

  const org   = (rawOrg   || '').trim().substring(0, 20) || null;
  const fondo = (rawFondo || '').trim().substring(0, 20) || null;

  nextNumero((err, numero) => {
    if (err) { console.error('[autorizaciones] Error en nextNumero:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
    db.query(
      `INSERT INTO autorizaciones_pago
        (numero, tipo_pago, beneficiario, monto, monto_letras, detalle, anio, org, fondo, creado_por)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [numero, tipo_pago, beneficiario, montoFinal, monto_letras, detalle, anioNum, org, fondo, req.user.id],
      (err2, result) => {
        if (err2) { console.error('[autorizaciones] Error en create INSERT:', err2); return res.status(500).json({ message: 'Error interno del servidor.' }); }
        res.status(201).json({ message: 'Autorización creada.', id: result.insertId, numero });
      }
    );
  });
};

// ── PUT /api/autorizaciones/:id ─────────────────────────────────────────────
// Editar autorización — solo si está PENDIENTE
exports.update = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  const canEditAll = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.rol);

  const {
    tipo_pago, beneficiario: rawBenef, monto, monto_letras: rawLetras,
    detalle: rawDetalle, anio, org: rawOrg, fondo: rawFondo,
  } = req.body;

  if (!tipo_pago || !VALID_TIPOS.includes(tipo_pago))
    return res.status(400).json({ message: 'Tipo de pago inválido.' });

  const beneficiario = (rawBenef || '').trim();
  if (!beneficiario || beneficiario.length < 2 || beneficiario.length > 200)
    return res.status(400).json({ message: 'El beneficiario es requerido (2-200 caracteres).' });

  const montoNum = parseFloat(monto);
  if (!monto || isNaN(montoNum) || montoNum <= 0)
    return res.status(400).json({ message: 'El monto debe ser mayor a cero.' });
  if (montoNum > MONTO_MAX)
    return res.status(400).json({ message: 'El monto excede el límite permitido.' });
  const montoFinal = Math.round(montoNum * 100) / 100;

  const monto_letras = (rawLetras || '').trim();
  if (!monto_letras || monto_letras.length < 3 || monto_letras.length > 600)
    return res.status(400).json({ message: 'El monto en letras es requerido.' });

  const detalle = (rawDetalle || '').trim();
  if (!detalle || detalle.length < 3 || detalle.length > 1000)
    return res.status(400).json({ message: 'El detalle es requerido (3-1000 caracteres).' });

  const anioNum = parseInt(anio, 10);
  if (!anio || isNaN(anioNum) || anioNum < 2000 || anioNum > 2100)
    return res.status(400).json({ message: 'El año es inválido.' });

  const org   = (rawOrg   || '').trim().substring(0, 20) || null;
  const fondo = (rawFondo || '').trim().substring(0, 20) || null;

  // Solo el creador o un admin puede editar; solo si está PENDIENTE
  const selectSql = canEditAll
    ? "SELECT id FROM autorizaciones_pago WHERE id = ? AND estado = 'PENDIENTE'"
    : "SELECT id FROM autorizaciones_pago WHERE id = ? AND estado = 'PENDIENTE' AND creado_por = ?";
  const selectParams = canEditAll ? [id] : [id, req.user.id];

  db.query(selectSql, selectParams, (err, rows) => {
    if (err) { console.error('[autorizaciones] Error en update SELECT:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
    if (!rows.length) return res.status(404).json({ message: 'Autorización no encontrada o ya procesada.' });

    db.query(
      `UPDATE autorizaciones_pago
         SET tipo_pago = ?, beneficiario = ?, monto = ?, monto_letras = ?,
             detalle = ?, anio = ?, org = ?, fondo = ?
       WHERE id = ?`,
      [tipo_pago, beneficiario, montoFinal, monto_letras, detalle, anioNum, org, fondo, id],
      (err2) => {
        if (err2) { console.error('[autorizaciones] Error en update UPDATE:', err2); return res.status(500).json({ message: 'Error interno del servidor.' }); }
        res.json({ message: 'Autorización actualizada correctamente.' });
      }
    );
  });
};

// ── PUT /api/autorizaciones/:id/autorizar ─────────────────────────────────────
// Solo ADMIN y SUPER_ADMIN — requiere contraseña del autorizador
exports.autorizar = (req, res) => {
  if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permiso para autorizar.' });

  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  const { password } = req.body;
  if (!password || typeof password !== 'string' || password.length < 1)
    return res.status(400).json({ message: 'La contraseña es requerida para firmar.' });

  // 1. Verificar contraseña del autorizador (y obtener nombre para la firma)
  db.query('SELECT password, nombre FROM usuarios WHERE id = ?', [req.user.id], (err, rows) => {
    if (err) { console.error('[autorizaciones] Error en autorizar SELECT:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
    if (!rows.length) return res.status(401).json({ message: 'Usuario no encontrado.' });

    bcrypt.compare(password, rows[0].password, (err2, match) => {
      if (err2) { console.error('[autorizaciones] Error en bcrypt.compare:', err2); return res.status(500).json({ message: 'Error interno del servidor.' }); }
      if (!match) return res.status(401).json({ message: 'Contraseña incorrecta. Firma no aplicada.' });

      const firmaNombre = rows[0].nombre || req.user.nombre || '';

      // 2. Marcar como AUTORIZADO
      db.query(
        `UPDATE autorizaciones_pago
         SET estado = 'AUTORIZADO',
             autorizado_por = ?,
             fecha_autorizacion = NOW(),
             firma_nombre = ?
         WHERE id = ? AND estado = 'PENDIENTE'`,
        [req.user.id, firmaNombre, id],
        (err3, result) => {
          if (err3) { console.error('[autorizaciones] Error en autorizar UPDATE:', err3); return res.status(500).json({ message: 'Error interno del servidor.' }); }
          if (result.affectedRows === 0)
            return res.status(409).json({ message: 'La autorización ya fue procesada o no existe.' });
          res.json({ message: 'Autorización firmada y aprobada correctamente.' });
        }
      );
    });
  });
};

// ── PUT /api/autorizaciones/:id/rechazar ──────────────────────────────────────
exports.rechazar = (req, res) => {
  if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permiso para rechazar.' });

  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  const motivo = (req.body.motivo || '').trim();
  if (!motivo || motivo.length < 5)
    return res.status(400).json({ message: 'Debe indicar el motivo del rechazo (mínimo 5 caracteres).' });

  db.query(
    `UPDATE autorizaciones_pago
     SET estado = 'RECHAZADO', autorizado_por = ?, fecha_autorizacion = NOW(),
         motivo_rechazo = ?, firma_nombre = ?
     WHERE id = ? AND estado = 'PENDIENTE'`,
    [req.user.id, motivo.substring(0, 1000), (req.user.nombre || ''), id],
    (err, result) => {
      if (err) { console.error('[autorizaciones] Error en rechazar:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
      if (result.affectedRows === 0)
        return res.status(409).json({ message: 'La autorización ya fue procesada o no existe.' });
      res.json({ message: 'Autorización rechazada.' });
    }
  );
};

// ── DELETE /api/autorizaciones/:id ───────────────────────────────────────────
// Solo SUPER_ADMIN puede eliminar; solo si está PENDIENTE
exports.remove = (req, res) => {
  if (req.user.rol !== 'SUPER_ADMIN')
    return res.status(403).json({ message: 'No tiene permiso para eliminar.' });

  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  db.query(
    "DELETE FROM autorizaciones_pago WHERE id = ? AND estado = 'PENDIENTE'",
    [id],
    (err, result) => {
      if (err) { console.error('[autorizaciones] Error en remove:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
      if (result.affectedRows === 0)
        return res.status(409).json({ message: 'Solo se pueden eliminar autorizaciones pendientes.' });
      res.json({ message: 'Autorización eliminada.' });
    }
  );
};
