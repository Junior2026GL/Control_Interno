const db = require('../db');
const { logEvent, getClientIP } = require('../middleware/audit');

const MONTO_MAX = 99_999_999;
const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN'];

// GET /api/constancias-liquidacion
exports.getAll = (req, res) => {
  const esAdmin = ROLES_ADMIN.includes(req.user.rol);
  const sql = esAdmin
    ? `SELECT cl.*, u.nombre AS usuario_nombre
       FROM constancias_liquidacion cl
       LEFT JOIN usuarios u ON u.id = cl.usuario_id
       ORDER BY cl.created_at DESC LIMIT 500`
    : `SELECT cl.*, u.nombre AS usuario_nombre
       FROM constancias_liquidacion cl
       LEFT JOIN usuarios u ON u.id = cl.usuario_id
       WHERE cl.usuario_id = ?
       ORDER BY cl.created_at DESC LIMIT 500`;
  const params = esAdmin ? [] : [req.user.id];
  db.query(sql, params, (err, rows) => {
    if (err) { console.error('[constancias-liquidacion] getAll:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
    res.json(rows);
  });
};

// GET /api/constancias-liquidacion/:id
exports.getOne = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
  db.query('SELECT * FROM constancias_liquidacion WHERE id = ?', [id], (err, rows) => {
    if (err) { console.error('[constancias-liquidacion] getOne:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
    if (!rows.length) return res.status(404).json({ message: 'Registro no encontrado.' });
    const row = rows[0];
    const esAdmin = ROLES_ADMIN.includes(req.user.rol);
    if (!esAdmin && row.usuario_id !== req.user.id) return res.status(403).json({ message: 'Acceso denegado.' });
    res.json(row);
  });
};

// POST /api/constancias-liquidacion
exports.create = (req, res) => {
  const { representanteNombre, representanteDni, institucion, monto, plazoDias, correo, celular, fechaCompromiso } = req.body;
  if (!representanteNombre?.trim()) return res.status(400).json({ message: 'El nombre del representante es requerido.' });
  if (!representanteDni?.trim()) return res.status(400).json({ message: 'El DNI del representante es requerido.' });
  if (!institucion?.trim()) return res.status(400).json({ message: 'La institución/organización beneficiaria es requerida.' });
  const montoNum = parseFloat(monto);
  if (isNaN(montoNum) || montoNum <= 0) return res.status(400).json({ message: 'El monto debe ser mayor a cero.' });
  if (montoNum > MONTO_MAX) return res.status(400).json({ message: 'El monto excede el límite permitido.' });
  const plazo = parseInt(plazoDias, 10) || 30;
  if (plazo <= 0 || plazo > 365) return res.status(400).json({ message: 'El plazo de liquidación no es válido.' });
  const usuarioId = req.user?.id || null;
  db.query(
    `INSERT INTO constancias_liquidacion (representante_nombre,representante_dni,institucion,monto,plazo_dias,correo,celular,fecha_compromiso,usuario_id) VALUES (?,?,?,?,?,?,?,?,?)`,
    [representanteNombre.trim(),representanteDni.trim(),institucion.trim(),montoNum,plazo,(correo||'').trim(),(celular||'').trim(),fechaCompromiso || null,usuarioId],
    (err, result) => {
      if (err) { console.error('[constancias-liquidacion] create:', err); return res.status(500).json({ message: 'Error al guardar el compromiso de liquidación.' }); }
      logEvent({ usuario_id: req.user.id, usuario_nombre: req.user.nombre || null, accion: 'CREAR', modulo: 'constancias', detalle: `Creó compromiso de liquidación para: ${institucion.trim()} — Lps. ${montoNum.toLocaleString('es-HN')}`, ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO' });
      res.status(201).json({ id: result.insertId, message: 'Compromiso de liquidación guardado correctamente.' });
    }
  );
};

// PUT /api/constancias-liquidacion/:id
exports.update = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
  const { representanteNombre, representanteDni, institucion, monto, plazoDias, correo, celular, fechaCompromiso } = req.body;
  if (!representanteNombre?.trim()) return res.status(400).json({ message: 'El nombre del representante es requerido.' });
  if (!representanteDni?.trim()) return res.status(400).json({ message: 'El DNI del representante es requerido.' });
  if (!institucion?.trim()) return res.status(400).json({ message: 'La institución/organización beneficiaria es requerida.' });
  const montoNum = parseFloat(monto);
  if (isNaN(montoNum) || montoNum <= 0) return res.status(400).json({ message: 'El monto debe ser mayor a cero.' });
  if (montoNum > MONTO_MAX) return res.status(400).json({ message: 'El monto excede el límite permitido.' });
  const plazo = parseInt(plazoDias, 10) || 30;
  if (plazo <= 0 || plazo > 365) return res.status(400).json({ message: 'El plazo de liquidación no es válido.' });
  const esAdmin = ROLES_ADMIN.includes(req.user.rol);
  const doUpdate = () => {
    db.query(
      `UPDATE constancias_liquidacion SET representante_nombre=?,representante_dni=?,institucion=?,monto=?,plazo_dias=?,correo=?,celular=?,fecha_compromiso=? WHERE id=?`,
      [representanteNombre.trim(),representanteDni.trim(),institucion.trim(),montoNum,plazo,(correo||'').trim(),(celular||'').trim(),fechaCompromiso || null,id],
      (err, result) => {
        if (err) { console.error('[constancias-liquidacion] update:', err); return res.status(500).json({ message: 'Error al actualizar el compromiso de liquidación.' }); }
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Registro no encontrado.' });
        logEvent({ usuario_id: req.user.id, usuario_nombre: req.user.nombre || null, accion: 'ACTUALIZAR', modulo: 'constancias', detalle: `Actualizó compromiso de liquidación ID #${id} — ${institucion.trim()}`, ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO' });
        res.json({ message: 'Compromiso de liquidación actualizado correctamente.' });
      }
    );
  };
  if (esAdmin) return doUpdate();
  db.query('SELECT usuario_id FROM constancias_liquidacion WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Error interno del servidor.' });
    if (!rows.length) return res.status(404).json({ message: 'Registro no encontrado.' });
    if (rows[0].usuario_id !== req.user.id) return res.status(403).json({ message: 'No tiene permiso para editar este registro.' });
    doUpdate();
  });
};

// DELETE /api/constancias-liquidacion/:id
exports.remove = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
  if (!ROLES_ADMIN.includes(req.user.rol)) return res.status(403).json({ message: 'No tiene permiso para eliminar registros.' });
  db.query('DELETE FROM constancias_liquidacion WHERE id = ?', [id], (err, result) => {
    if (err) { console.error('[constancias-liquidacion] remove:', err); return res.status(500).json({ message: 'Error al eliminar el registro.' }); }
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Registro no encontrado.' });
    logEvent({ usuario_id: req.user.id, usuario_nombre: req.user.nombre || null, accion: 'ELIMINAR', modulo: 'constancias', detalle: `Eliminó compromiso de liquidación ID #${id}`, ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO' });
    res.json({ message: 'Registro eliminado.' });
  });
};
