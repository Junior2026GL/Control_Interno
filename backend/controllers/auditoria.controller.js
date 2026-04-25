const db = require('../db');

// ── GET /api/auditoria ────────────────────────────────────────
// Parámetros opcionales: page, limit, accion, modulo, resultado, ip, usuario, desde, hasta
exports.getAll = (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page  || '1',   10));
  const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit || '50',  10)));
  const offset = (page - 1) * limit;

  const filters = [];
  const params  = [];

  if (req.query.accion)    { filters.push('accion = ?');              params.push(req.query.accion); }
  if (req.query.modulo)    { filters.push('modulo = ?');              params.push(req.query.modulo); }
  if (req.query.resultado) { filters.push('resultado = ?');           params.push(req.query.resultado); }
  if (req.query.ip)        { filters.push('ip LIKE ?');               params.push(`%${req.query.ip}%`); }
  if (req.query.usuario)   { filters.push('usuario_nombre LIKE ?');   params.push(`%${req.query.usuario}%`); }
  if (req.query.desde)     { filters.push('creado_en >= ?');          params.push(req.query.desde); }
  if (req.query.hasta)     { filters.push('creado_en <= ?');          params.push(`${req.query.hasta} 23:59:59`); }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  db.query(
    `SELECT COUNT(*) AS total FROM auditoria ${where}`,
    params,
    (err, countResult) => {
      if (err) return res.status(500).json({ message: 'Error al obtener auditoría.' });

      const total = countResult[0].total;
      db.query(
        `SELECT id, usuario_id, usuario_nombre, accion, modulo, detalle, ip, metodo, ruta, resultado, creado_en
         FROM auditoria ${where}
         ORDER BY creado_en DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
        (err2, rows) => {
          if (err2) return res.status(500).json({ message: 'Error al obtener auditoría.' });
          res.json({ total, page, limit, data: rows });
        }
      );
    }
  );
};

// ── GET /api/auditoria/stats ──────────────────────────────────
exports.getStats = (req, res) => {
  db.query(
    `SELECT
       COUNT(*)                                     AS total,
       SUM(accion = 'LOGIN_FAIL')                   AS login_fallidos,
       SUM(resultado = 'BLOQUEADO')                 AS bloqueados,
       SUM(resultado = 'FALLO')                     AS errores,
       SUM(DATE(creado_en) = CURDATE())             AS hoy
     FROM auditoria`,
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Error al obtener estadísticas.' });
      res.json(rows[0]);
    }
  );
};

// ── GET /api/auditoria/export ───────────────────────────────
// Igual que getAll pero sin paginación (máx 5000 filas)
exports.exportAll = (req, res) => {
  const filters = [];
  const params  = [];

  if (req.query.accion)    { filters.push('accion = ?');              params.push(req.query.accion); }
  if (req.query.modulo)    { filters.push('modulo = ?');              params.push(req.query.modulo); }
  if (req.query.resultado) { filters.push('resultado = ?');           params.push(req.query.resultado); }
  if (req.query.ip)        { filters.push('ip LIKE ?');               params.push(`%${req.query.ip}%`); }
  if (req.query.usuario)   { filters.push('usuario_nombre LIKE ?');   params.push(`%${req.query.usuario}%`); }
  if (req.query.desde)     { filters.push('creado_en >= ?');          params.push(req.query.desde); }
  if (req.query.hasta)     { filters.push('creado_en <= ?');          params.push(`${req.query.hasta} 23:59:59`); }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  db.query(
    `SELECT id, usuario_nombre, accion, modulo, detalle, ip, metodo, ruta, resultado, creado_en
     FROM auditoria ${where}
     ORDER BY creado_en DESC
     LIMIT 5000`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Error al exportar auditoría.' });
      res.json(rows);
    }
  );
};

// ── DELETE /api/auditoria/purge?dias=90 ──────────────────────
exports.purge = (req, res) => {
  const dias = parseInt(req.query.dias || '90', 10);
  if (isNaN(dias) || dias < 7) {
    return res.status(400).json({ message: 'El mínimo permitido es 7 días.' });
  }

  db.query(
    'DELETE FROM auditoria WHERE creado_en < DATE_SUB(NOW(), INTERVAL ? DAY)',
    [dias],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'Error al purgar registros.' });
      res.json({ message: `${result.affectedRows} registro(s) eliminado(s).`, eliminados: result.affectedRows });
    }
  );
};
