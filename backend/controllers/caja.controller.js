const db = require('../db');

const VALID_TIPOS = ['RECARGA', 'EGRESO', 'INGRESO'];
const VALID_CATEGORIAS = [
  'Papelería / Útiles', 'Transporte / Viáticos', 'Limpieza',
  'Mantenimiento', 'Servicios', 'Alimentación', 'Otros',
];
const MONTO_MAX  = 9_999_999;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Devuelve el usuario_id objetivo según rol y query param
function targetUserId(req) {
  const canViewOthers = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.rol);
  if (canViewOthers && req.query.usuario_id) {
    const uid = parseInt(req.query.usuario_id, 10);
    return (!isNaN(uid) && uid > 0) ? uid : req.user.id;
  }
  return req.user.id;
}

exports.getMovimientos = (req, res) => {
  const uid = targetUserId(req);
  db.query(
    'SELECT * FROM caja_chica WHERE usuario_id = ? ORDER BY fecha DESC, id DESC LIMIT 2000',
    [uid],
    (err, results) => {
      if (err) {
        console.error('[caja] Error en getMovimientos:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      res.json(results);
    }
  );
};

exports.createMovimiento = (req, res) => {
  const {
    fecha,
    descripcion: rawDesc,
    tipo,
    monto,
    categoria: rawCat,
    usuario_id: bodyUid,
  } = req.body;

  // ── fecha ─────────────────────────────────────────
  if (!fecha || !DATE_REGEX.test(fecha)) {
    return res.status(400).json({ message: 'La fecha no tiene un formato válido.' });
  }
  const fechaDate = new Date(fecha + 'T12:00:00');
  if (isNaN(fechaDate.getTime())) {
    return res.status(400).json({ message: 'La fecha no es válida.' });
  }
  const now = new Date();
  const oneYearAhead = new Date(now); oneYearAhead.setFullYear(now.getFullYear() + 1);
  const tenYearsBack = new Date(now); tenYearsBack.setFullYear(now.getFullYear() - 10);
  if (fechaDate > oneYearAhead)
    return res.status(400).json({ message: 'La fecha no puede estar más de un año en el futuro.' });
  if (fechaDate < tenYearsBack)
    return res.status(400).json({ message: 'La fecha es demasiado antigua (máx. 10 años atrás).' });

  // ── descripcion ───────────────────────────────────
  const descripcion = (rawDesc || '').toString().trim();
  if (!descripcion)
    return res.status(400).json({ message: 'La descripción es requerida.' });
  if (descripcion.length < 3)
    return res.status(400).json({ message: 'La descripción debe tener al menos 3 caracteres.' });
  if (descripcion.length > 200)
    return res.status(400).json({ message: 'La descripción no puede superar 200 caracteres.' });

  // ── tipo ──────────────────────────────────────────
  if (!tipo || !VALID_TIPOS.includes(tipo)) {
    return res.status(400).json({ message: 'Tipo de movimiento inválido.' });
  }

  // ── monto ─────────────────────────────────────────
  if (monto === undefined || monto === null || monto === '') {
    return res.status(400).json({ message: 'El monto es requerido.' });
  }
  const montoNum = parseFloat(monto);
  if (isNaN(montoNum))
    return res.status(400).json({ message: 'El monto debe ser un número válido.' });
  if (montoNum <= 0)
    return res.status(400).json({ message: 'El monto debe ser mayor a cero.' });
  if (montoNum > MONTO_MAX)
    return res.status(400).json({ message: `El monto no puede superar Lps. ${MONTO_MAX.toLocaleString()}.` });
  const montoFinal = Math.round(montoNum * 100) / 100;

  // ── categoria (solo EGRESO) ───────────────────────
  let categoria = null;
  if (tipo === 'EGRESO') {
    const cat = (rawCat || '').toString().trim();
    if (!cat || !VALID_CATEGORIAS.includes(cat)) {
      return res.status(400).json({ message: 'Categoría de egreso inválida.' });
    }
    categoria = cat;
  }

  // ── usuario_id ────────────────────────────────────
  const canActForOthers = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.rol);
  let uid = req.user.id;
  if (canActForOthers && bodyUid !== undefined && bodyUid !== null && bodyUid !== '') {
    const parsedUid = parseInt(bodyUid, 10);
    if (isNaN(parsedUid) || parsedUid <= 0) {
      return res.status(400).json({ message: 'usuario_id inválido.' });
    }
    uid = parsedUid;
  }

  db.query(
    'INSERT INTO caja_chica (fecha, descripcion, tipo, monto, categoria, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
    [fecha, descripcion, tipo, montoFinal, categoria, uid],
    (err, result) => {
      if (err) {
        console.error('[caja] Error en createMovimiento:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      res.json({ message: 'Movimiento registrado correctamente', id: result.insertId });
    }
  );
};

exports.getSaldo = (req, res) => {
  const uid = targetUserId(req);
  db.query(
    `SELECT
      IFNULL(SUM(CASE WHEN tipo IN ('INGRESO','RECARGA') THEN monto ELSE 0 END), 0) AS total_recargas,
      IFNULL(SUM(CASE WHEN tipo = 'EGRESO'              THEN monto ELSE 0 END), 0) AS total_egresos,
      IFNULL(SUM(CASE WHEN tipo IN ('INGRESO','RECARGA') THEN monto ELSE 0 END), 0) -
      IFNULL(SUM(CASE WHEN tipo = 'EGRESO'              THEN monto ELSE 0 END), 0) AS saldo
     FROM caja_chica
     WHERE usuario_id = ?`,
    [uid],
    (err, results) => {
      if (err) {
        console.error('[caja] Error en getSaldo:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      res.json(results[0]);
    }
  );
};

exports.updateMovimiento = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  const { fecha, descripcion: rawDesc, monto, categoria: rawCat } = req.body;

  if (!fecha || !DATE_REGEX.test(fecha))
    return res.status(400).json({ message: 'La fecha no tiene un formato válido.' });
  const fechaDate = new Date(fecha + 'T12:00:00');
  if (isNaN(fechaDate.getTime()))
    return res.status(400).json({ message: 'La fecha no es válida.' });
  const now = new Date();
  const oneYearAhead = new Date(now); oneYearAhead.setFullYear(now.getFullYear() + 1);
  const tenYearsBack = new Date(now); tenYearsBack.setFullYear(now.getFullYear() - 10);
  if (fechaDate > oneYearAhead)
    return res.status(400).json({ message: 'La fecha no puede estar más de un año en el futuro.' });
  if (fechaDate < tenYearsBack)
    return res.status(400).json({ message: 'La fecha es demasiado antigua (máx. 10 años atrás).' });

  const descripcion = (rawDesc || '').toString().trim();
  if (!descripcion)
    return res.status(400).json({ message: 'La descripción es requerida.' });
  if (descripcion.length < 3)
    return res.status(400).json({ message: 'La descripción debe tener al menos 3 caracteres.' });
  if (descripcion.length > 200)
    return res.status(400).json({ message: 'La descripción no puede superar 200 caracteres.' });

  if (monto === undefined || monto === null || monto === '')
    return res.status(400).json({ message: 'El monto es requerido.' });
  const montoNum = parseFloat(monto);
  if (isNaN(montoNum))
    return res.status(400).json({ message: 'El monto debe ser un número válido.' });
  if (montoNum <= 0)
    return res.status(400).json({ message: 'El monto debe ser mayor a cero.' });
  if (montoNum > MONTO_MAX)
    return res.status(400).json({ message: `El monto no puede superar Lps. ${MONTO_MAX.toLocaleString()}.` });
  const montoFinal = Math.round(montoNum * 100) / 100;

  const canEditAll = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.rol);
  const selectSql    = canEditAll
    ? 'SELECT * FROM caja_chica WHERE id = ?'
    : 'SELECT * FROM caja_chica WHERE id = ? AND usuario_id = ?';
  const selectParams = canEditAll ? [id] : [id, req.user.id];

  db.query(selectSql, selectParams, (err, rows) => {
    if (err) {
      console.error('[caja] Error en updateMovimiento (select):', err);
      return res.status(500).json({ message: 'Error interno del servidor.' });
    }
    if (rows.length === 0) return res.status(404).json({ message: 'Movimiento no encontrado.' });

    const existing = rows[0];
    let categoria = existing.categoria;

    if (existing.tipo === 'EGRESO') {
      const cat = (rawCat || '').toString().trim();
      if (!cat || !VALID_CATEGORIAS.includes(cat))
        return res.status(400).json({ message: 'Categoría de egreso inválida.' });
      categoria = cat;
    }

    db.query(
      'UPDATE caja_chica SET fecha = ?, descripcion = ?, monto = ?, categoria = ? WHERE id = ?',
      [fecha, descripcion, montoFinal, categoria, id],
      (updateErr) => {
        if (updateErr) {
          console.error('[caja] Error en updateMovimiento (update):', updateErr);
          return res.status(500).json({ message: 'Error interno del servidor.' });
        }
        res.json({ message: 'Movimiento actualizado correctamente.' });
      }
    );
  });
};

exports.deleteMovimiento = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  // SUPER_ADMIN y ADMIN pueden eliminar cualquiera; ASISTENTE solo los suyos
  const canDeleteAll = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.rol);
  const sql = canDeleteAll
    ? 'DELETE FROM caja_chica WHERE id = ?'
    : 'DELETE FROM caja_chica WHERE id = ? AND usuario_id = ?';
  const params = canDeleteAll ? [id] : [id, req.user.id];

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error('[caja] Error en deleteMovimiento:', err);
      return res.status(500).json({ message: 'Error interno del servidor.' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Movimiento no encontrado.' });
    }
    res.json({ message: 'Movimiento eliminado correctamente' });
  });
};

// GET /api/caja/usuarios — lista de usuarios con módulo caja asignado
// SUPER_ADMIN ve a todos; ADMIN solo ve ASISTENTE
exports.getUsuariosCaja = (req, res) => {
  const esSuperAdmin = req.user.rol === 'SUPER_ADMIN';
  const sql = esSuperAdmin
    ? `SELECT u.id, u.nombre
       FROM usuarios u
       JOIN usuario_modulos um ON u.id = um.usuario_id
       JOIN modulos m ON m.id = um.modulo_id
       WHERE m.clave = 'caja' AND u.activo = 1 AND u.id != ?
       ORDER BY u.nombre`
    : `SELECT u.id, u.nombre
       FROM usuarios u
       JOIN usuario_modulos um ON u.id = um.usuario_id
       JOIN modulos m ON m.id = um.modulo_id
       WHERE m.clave = 'caja' AND u.activo = 1 AND u.rol = 'ASISTENTE'
       ORDER BY u.nombre`;

  db.query(sql, [req.user.id], (err, results) => {
    if (err) {
      console.error('[caja] Error en getUsuariosCaja:', err);
      return res.status(500).json({ message: 'Error interno del servidor.' });
    }
    res.json(results);
  });
};