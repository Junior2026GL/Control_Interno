const db = require('../db');

const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];

function sanitize(str) { return (str || '').toString().trim(); }
function toInt(v) { const n = parseInt(v, 10); return isNaN(n) ? null : n; }

// ── GET all ───────────────────────────────────────────────────
exports.getAll = (req, res) => {
  db.query(
    `SELECT *,
      ROUND((COALESCE(eval_calidad,0) + COALESCE(eval_puntualidad,0) +
             COALESCE(eval_precio,0)  + COALESCE(eval_servicio,0)) /
            NULLIF(
              (eval_calidad IS NOT NULL) + (eval_puntualidad IS NOT NULL) +
              (eval_precio  IS NOT NULL) + (eval_servicio    IS NOT NULL), 0
            ), 2) AS puntuacion_global
     FROM proveedores ORDER BY nombre ASC LIMIT 5000`,
    (err, rows) => {
      if (err) {
        console.error('[proveedores] getAll:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      res.json(rows);
    }
  );
};

// ── POST create ───────────────────────────────────────────────
exports.create = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para registrar.' });

  const nombre       = sanitize(req.body.nombre);
  const rtn          = sanitize(req.body.rtn) || null;
  const rp           = sanitize(req.body.rp) || null;
  const categoria    = sanitize(req.body.categoria);
  const tipo_servicio = sanitize(req.body.tipo_servicio) || null;
  const vendedor     = sanitize(req.body.vendedor) || null;
  const telefono     = sanitize(req.body.telefono) || null;
  const correo       = sanitize(req.body.correo) || null;
  const direccion    = sanitize(req.body.direccion) || null;
  const estado       = ['ACTIVO','INACTIVO','SUSPENDIDO'].includes(req.body.estado) ? req.body.estado : 'ACTIVO';
  const eval_calidad     = toInt(req.body.eval_calidad);
  const eval_puntualidad = toInt(req.body.eval_puntualidad);
  const eval_precio      = toInt(req.body.eval_precio);
  const eval_servicio    = toInt(req.body.eval_servicio);
  const observaciones    = sanitize(req.body.observaciones) || null;
  const registrado_por   = req.user.nombre || req.user.usuario || null;

  if (!nombre)    return res.status(400).json({ message: 'El nombre del proveedor es requerido.' });
  if (!categoria) return res.status(400).json({ message: 'La categoría es requerida.' });
  if (nombre.length > 200) return res.status(400).json({ message: 'El nombre no puede superar 200 caracteres.' });
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))
    return res.status(400).json({ message: 'Formato de correo electrónico inválido.' });
  if ([eval_calidad, eval_puntualidad, eval_precio, eval_servicio].some(v => v !== null && (v < 1 || v > 5)))
    return res.status(400).json({ message: 'Las evaluaciones deben ser entre 1 y 5.' });

  db.query(
    `INSERT INTO proveedores
      (nombre, rtn, rp, categoria, tipo_servicio, vendedor, telefono, correo, direccion,
       estado, eval_calidad, eval_puntualidad, eval_precio, eval_servicio, observaciones, registrado_por)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [nombre, rtn, rp, categoria, tipo_servicio, vendedor, telefono, correo, direccion,
     estado, eval_calidad, eval_puntualidad, eval_precio, eval_servicio, observaciones, registrado_por],
    (err, result) => {
      if (err) {
        console.error('[proveedores] create:', err);
        if (err.code === 'ER_DUP_ENTRY')
          return res.status(409).json({ message: 'Ya existe un proveedor con ese RTN.' });
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      res.status(201).json({ id: result.insertId, message: 'Proveedor registrado correctamente.' });
    }
  );
};

// ── PUT update ────────────────────────────────────────────────
exports.update = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para editar.' });

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });

  const nombre       = sanitize(req.body.nombre);
  const rtn          = sanitize(req.body.rtn) || null;
  const rp           = sanitize(req.body.rp) || null;
  const categoria    = sanitize(req.body.categoria);
  const tipo_servicio = sanitize(req.body.tipo_servicio) || null;
  const vendedor     = sanitize(req.body.vendedor) || null;
  const telefono     = sanitize(req.body.telefono) || null;
  const correo       = sanitize(req.body.correo) || null;
  const direccion    = sanitize(req.body.direccion) || null;
  const estado       = ['ACTIVO','INACTIVO','SUSPENDIDO'].includes(req.body.estado) ? req.body.estado : 'ACTIVO';
  const eval_calidad     = toInt(req.body.eval_calidad);
  const eval_puntualidad = toInt(req.body.eval_puntualidad);
  const eval_precio      = toInt(req.body.eval_precio);
  const eval_servicio    = toInt(req.body.eval_servicio);
  const observaciones    = sanitize(req.body.observaciones) || null;

  if (!nombre)    return res.status(400).json({ message: 'El nombre del proveedor es requerido.' });
  if (!categoria) return res.status(400).json({ message: 'La categoría es requerida.' });
  if (nombre.length > 200) return res.status(400).json({ message: 'El nombre no puede superar 200 caracteres.' });
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))
    return res.status(400).json({ message: 'Formato de correo electrónico inválido.' });
  if ([eval_calidad, eval_puntualidad, eval_precio, eval_servicio].some(v => v !== null && (v < 1 || v > 5)))
    return res.status(400).json({ message: 'Las evaluaciones deben ser entre 1 y 5.' });

  db.query(
    `UPDATE proveedores SET
      nombre=?, rtn=?, rp=?, categoria=?, tipo_servicio=?, vendedor=?,
      telefono=?, correo=?, direccion=?, estado=?,
      eval_calidad=?, eval_puntualidad=?, eval_precio=?, eval_servicio=?, observaciones=?
     WHERE id=?`,
    [nombre, rtn, rp, categoria, tipo_servicio, vendedor, telefono, correo, direccion, estado,
     eval_calidad, eval_puntualidad, eval_precio, eval_servicio, observaciones, id],
    (err, result) => {
      if (err) {
        console.error('[proveedores] update:', err);
        if (err.code === 'ER_DUP_ENTRY')
          return res.status(409).json({ message: 'Ya existe un proveedor con ese RTN.' });
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      if (result.affectedRows === 0)
        return res.status(404).json({ message: 'Proveedor no encontrado.' });
      res.json({ message: 'Proveedor actualizado correctamente.' });
    }
  );
};

// ── DELETE ────────────────────────────────────────────────────
exports.remove = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para eliminar.' });

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });

  db.query('DELETE FROM proveedores WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('[proveedores] delete:', err);
      return res.status(500).json({ message: 'Error interno del servidor.' });
    }
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Proveedor no encontrado.' });
    res.json({ message: 'Proveedor eliminado correctamente.' });
  });
};
