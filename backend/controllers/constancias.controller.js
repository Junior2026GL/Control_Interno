const db = require('../db');

const MESES_VALIDOS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTO_MAX = 99_999_999;
const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN'];

// GET /api/constancias
exports.getAll = (req, res) => {
  const esAdmin = ROLES_ADMIN.includes(req.user.rol);
  const sql = esAdmin
    ? `SELECT ct.*, u.nombre AS usuario_nombre
       FROM constancias_transferencia ct
       LEFT JOIN usuarios u ON u.id = ct.usuario_id
       ORDER BY ct.created_at DESC LIMIT 500`
    : `SELECT ct.*, u.nombre AS usuario_nombre
       FROM constancias_transferencia ct
       LEFT JOIN usuarios u ON u.id = ct.usuario_id
       WHERE ct.usuario_id = ?
       ORDER BY ct.created_at DESC LIMIT 500`;
  const params = esAdmin ? [] : [req.user.id];
  db.query(sql, params, (err, rows) => {
    if (err) { console.error('[constancias] getAll:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
    res.json(rows);
  });
};

// GET /api/constancias/:id
exports.getOne = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
  db.query('SELECT * FROM constancias_transferencia WHERE id = ?', [id], (err, rows) => {
    if (err) { console.error('[constancias] getOne:', err); return res.status(500).json({ message: 'Error interno del servidor.' }); }
    if (!rows.length) return res.status(404).json({ message: 'Constancia no encontrada.' });
    const row = rows[0];
    const esAdmin = ROLES_ADMIN.includes(req.user.rol);
    if (!esAdmin && row.usuario_id !== req.user.id) return res.status(403).json({ message: 'Acceso denegado.' });
    res.json(row);
  });
};

// POST /api/constancias
exports.create = (req, res) => {
  const { nombre, dni, telefono, direccion, correo, funcionario, cargo, dependencia,
          monto, bancoEmisor, bancoReceptor, numeroCuenta, fechaDia, fechaMes, fechaAnio, concepto } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ message: 'El nombre es requerido.' });
  if (!dni?.trim()) return res.status(400).json({ message: 'El DNI es requerido.' });
  const montoNum = parseFloat(monto);
  if (isNaN(montoNum) || montoNum <= 0) return res.status(400).json({ message: 'El monto debe ser mayor a cero.' });
  if (montoNum > MONTO_MAX) return res.status(400).json({ message: 'El monto excede el límite permitido.' });
  if (!bancoEmisor?.trim()) return res.status(400).json({ message: 'El banco emisor es requerido.' });
  if (!bancoReceptor?.trim()) return res.status(400).json({ message: 'El banco receptor es requerido.' });
  if (!numeroCuenta?.trim()) return res.status(400).json({ message: 'El número de cuenta es requerido.' });
  if (!fechaMes || !MESES_VALIDOS.includes(fechaMes)) return res.status(400).json({ message: 'El mes no es válido.' });
  const dia = parseInt(fechaDia, 10);
  if (!dia || dia < 1 || dia > 31) return res.status(400).json({ message: 'El día no es válido (1-31).' });
  const anio = parseInt(fechaAnio, 10);
  if (!anio || anio < 2000 || anio > 2100) return res.status(400).json({ message: 'El año no es válido.' });
  if (!concepto?.trim()) return res.status(400).json({ message: 'El concepto es requerido.' });
  const usuarioId = req.user?.id || null;
  db.query(
    `INSERT INTO constancias_transferencia (nombre,dni,telefono,direccion,correo,funcionario,cargo,dependencia,monto,banco_emisor,banco_receptor,numero_cuenta,fecha_dia,fecha_mes,fecha_anio,concepto,usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [nombre.trim(),dni.trim(),(telefono||'').trim(),(direccion||'').trim(),(correo||'').trim(),(funcionario||'').trim(),(cargo||'').trim(),(dependencia||'').trim(),montoNum,bancoEmisor.trim(),bancoReceptor.trim(),numeroCuenta.trim(),dia,fechaMes.trim(),anio,concepto.trim(),usuarioId],
    (err, result) => {
      if (err) { console.error('[constancias] create:', err); return res.status(500).json({ message: 'Error al guardar la constancia.' }); }
      res.status(201).json({ id: result.insertId, message: 'Constancia guardada correctamente.' });
    }
  );
};

// PUT /api/constancias/:id
exports.update = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
  const { nombre, dni, telefono, direccion, correo, funcionario, cargo, dependencia,
          monto, bancoEmisor, bancoReceptor, numeroCuenta, fechaDia, fechaMes, fechaAnio, concepto } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ message: 'El nombre es requerido.' });
  if (!dni?.trim()) return res.status(400).json({ message: 'El DNI es requerido.' });
  const montoNum = parseFloat(monto);
  if (isNaN(montoNum) || montoNum <= 0) return res.status(400).json({ message: 'El monto debe ser mayor a cero.' });
  if (montoNum > MONTO_MAX) return res.status(400).json({ message: 'El monto excede el límite permitido.' });
  if (!bancoEmisor?.trim()) return res.status(400).json({ message: 'El banco emisor es requerido.' });
  if (!bancoReceptor?.trim()) return res.status(400).json({ message: 'El banco receptor es requerido.' });
  if (!numeroCuenta?.trim()) return res.status(400).json({ message: 'El número de cuenta es requerido.' });
  if (!fechaMes || !MESES_VALIDOS.includes(fechaMes)) return res.status(400).json({ message: 'El mes no es válido.' });
  const dia = parseInt(fechaDia, 10);
  if (!dia || dia < 1 || dia > 31) return res.status(400).json({ message: 'El día no es válido (1-31).' });
  const anio = parseInt(fechaAnio, 10);
  if (!anio || anio < 2000 || anio > 2100) return res.status(400).json({ message: 'El año no es válido.' });
  if (!concepto?.trim()) return res.status(400).json({ message: 'El concepto es requerido.' });
  const esAdmin = ROLES_ADMIN.includes(req.user.rol);
  const doUpdate = () => {
    db.query(
      `UPDATE constancias_transferencia SET nombre=?,dni=?,telefono=?,direccion=?,correo=?,funcionario=?,cargo=?,dependencia=?,monto=?,banco_emisor=?,banco_receptor=?,numero_cuenta=?,fecha_dia=?,fecha_mes=?,fecha_anio=?,concepto=? WHERE id=?`,
      [nombre.trim(),dni.trim(),(telefono||'').trim(),(direccion||'').trim(),(correo||'').trim(),(funcionario||'').trim(),(cargo||'').trim(),(dependencia||'').trim(),montoNum,bancoEmisor.trim(),bancoReceptor.trim(),numeroCuenta.trim(),dia,fechaMes.trim(),anio,concepto.trim(),id],
      (err, result) => {
        if (err) { console.error('[constancias] update:', err); return res.status(500).json({ message: 'Error al actualizar la constancia.' }); }
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Constancia no encontrada.' });
        res.json({ message: 'Constancia actualizada correctamente.' });
      }
    );
  };
  if (esAdmin) return doUpdate();
  db.query('SELECT usuario_id FROM constancias_transferencia WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Error interno del servidor.' });
    if (!rows.length) return res.status(404).json({ message: 'Constancia no encontrada.' });
    if (rows[0].usuario_id !== req.user.id) return res.status(403).json({ message: 'No tiene permiso para editar esta constancia.' });
    doUpdate();
  });
};

// DELETE /api/constancias/:id
exports.remove = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
  const esAdmin = ROLES_ADMIN.includes(req.user.rol);
  const doDelete = () => {
    db.query('DELETE FROM constancias_transferencia WHERE id = ?', [id], (err, result) => {
      if (err) { console.error('[constancias] remove:', err); return res.status(500).json({ message: 'Error al eliminar la constancia.' }); }
      if (result.affectedRows === 0) return res.status(404).json({ message: 'Constancia no encontrada.' });
      res.json({ message: 'Constancia eliminada.' });
    });
  };
  if (esAdmin) return doDelete();
  db.query('SELECT usuario_id FROM constancias_transferencia WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Error interno del servidor.' });
    if (!rows.length) return res.status(404).json({ message: 'Constancia no encontrada.' });
    if (rows[0].usuario_id !== req.user.id) return res.status(403).json({ message: 'No tiene permiso para eliminar esta constancia.' });
    doDelete();
  });
};
