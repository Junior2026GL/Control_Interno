const db = require('../db');

const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];
const DATE_REGEX  = /^\d{4}-\d{2}-\d{2}$/;

function sanitize(str) {
  return (str || '').toString().trim();
}

// ── GET all ───────────────────────────────────────────────
exports.getAll = (req, res) => {
  db.query(
    `SELECT rb.*, u.nombre AS registrado_por
     FROM retiro_bodegas rb
     LEFT JOIN usuarios u ON u.id = rb.usuario_id
     ORDER BY rb.fecha_entrega DESC, rb.id DESC
     LIMIT 3000`,
    (err, results) => {
      if (err) {
        console.error('[retiro_bodegas] getAll:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      res.json(results);
    }
  );
};

// ── POST create ───────────────────────────────────────────
exports.create = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para registrar retiros.' });

  const {
    diputado_id,
    diputado_nombre: rawNombre,
    departamento:    rawDepto,
    partido:         rawPartido,
    persona_retiro:  rawPersona,
    fecha_entrega,
    cantidad_recibida,
    numero_orden:    rawOrden,
    observaciones:   rawObs,
  } = req.body;

  const diputado_nombre   = sanitize(rawNombre);
  const departamento      = sanitize(rawDepto);
  const partido           = sanitize(rawPartido) || null;
  const persona_retiro    = sanitize(rawPersona);
  const numero_orden      = sanitize(rawOrden);
  const observaciones     = sanitize(rawObs).slice(0, 500) || null;
  const dip_id            = diputado_id ? parseInt(diputado_id, 10) : null;

  // Validaciones
  if (!diputado_nombre || diputado_nombre.length < 2 || diputado_nombre.length > 200)
    return res.status(400).json({ message: 'El nombre del diputado es requerido (máx. 200 caracteres).' });

  if (!departamento || departamento.length < 2 || departamento.length > 100)
    return res.status(400).json({ message: 'El departamento es requerido (máx. 100 caracteres).' });

  if (!persona_retiro || persona_retiro.length < 2 || persona_retiro.length > 200)
    return res.status(400).json({ message: 'La persona que retiró es requerida (máx. 200 caracteres).' });

  if (!fecha_entrega || !DATE_REGEX.test(fecha_entrega))
    return res.status(400).json({ message: 'La fecha de entrega no tiene un formato válido (YYYY-MM-DD).' });

  const fechaDate = new Date(fecha_entrega + 'T12:00:00');
  if (isNaN(fechaDate.getTime()))
    return res.status(400).json({ message: 'La fecha de entrega no es válida.' });

  const now          = new Date();
  const oneYearAhead = new Date(now); oneYearAhead.setFullYear(now.getFullYear() + 1);
  const tenYearsBack = new Date(now); tenYearsBack.setFullYear(now.getFullYear() - 10);
  if (fechaDate > oneYearAhead)
    return res.status(400).json({ message: 'La fecha no puede estar más de un año en el futuro.' });
  if (fechaDate < tenYearsBack)
    return res.status(400).json({ message: 'La fecha es demasiado antigua (máx. 10 años atrás).' });

  const cantNum = parseInt(cantidad_recibida, 10);
  if (isNaN(cantNum) || cantNum <= 0)
    return res.status(400).json({ message: 'La cantidad recibida debe ser un número mayor a cero.' });
  if (cantNum > 9_999_999)
    return res.status(400).json({ message: 'La cantidad recibida supera el máximo permitido.' });

  if (!numero_orden || numero_orden.length < 1 || numero_orden.length > 30)
    return res.status(400).json({ message: 'El número de orden es requerido (máx. 30 caracteres).' });

  db.query(
    `INSERT INTO retiro_bodegas
       (diputado_id, diputado_nombre, departamento, partido, persona_retiro,
        fecha_entrega, cantidad_recibida, numero_orden, observaciones, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [dip_id, diputado_nombre, departamento, partido, persona_retiro,
     fecha_entrega, cantNum, numero_orden, observaciones, req.user.id],
    (err, result) => {
      if (err) {
        console.error('[retiro_bodegas] create:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      res.status(201).json({ id: result.insertId, message: 'Retiro registrado correctamente.' });
    }
  );
};

// ── PUT update ────────────────────────────────────────────
exports.update = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para editar retiros.' });

  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  const {
    diputado_id,
    diputado_nombre: rawNombre,
    departamento:    rawDepto,
    partido:         rawPartido,
    persona_retiro:  rawPersona,
    fecha_entrega,
    cantidad_recibida,
    numero_orden:    rawOrden,
    observaciones:   rawObs,
  } = req.body;

  const diputado_nombre   = sanitize(rawNombre);
  const departamento      = sanitize(rawDepto);
  const partido           = sanitize(rawPartido) || null;
  const persona_retiro    = sanitize(rawPersona);
  const numero_orden      = sanitize(rawOrden);
  const observaciones     = sanitize(rawObs).slice(0, 500) || null;
  const dip_id            = diputado_id ? parseInt(diputado_id, 10) : null;

  if (!diputado_nombre || diputado_nombre.length < 2 || diputado_nombre.length > 200)
    return res.status(400).json({ message: 'El nombre del diputado es requerido.' });

  if (!departamento || departamento.length < 2 || departamento.length > 100)
    return res.status(400).json({ message: 'El departamento es requerido.' });

  if (!persona_retiro || persona_retiro.length < 2 || persona_retiro.length > 200)
    return res.status(400).json({ message: 'La persona que retiró es requerida.' });

  if (!fecha_entrega || !DATE_REGEX.test(fecha_entrega))
    return res.status(400).json({ message: 'La fecha de entrega no tiene un formato válido.' });

  const fechaDate = new Date(fecha_entrega + 'T12:00:00');
  if (isNaN(fechaDate.getTime()))
    return res.status(400).json({ message: 'La fecha de entrega no es válida.' });

  const now          = new Date();
  const oneYearAhead = new Date(now); oneYearAhead.setFullYear(now.getFullYear() + 1);
  const tenYearsBack = new Date(now); tenYearsBack.setFullYear(now.getFullYear() - 10);
  if (fechaDate > oneYearAhead)
    return res.status(400).json({ message: 'La fecha no puede estar más de un año en el futuro.' });
  if (fechaDate < tenYearsBack)
    return res.status(400).json({ message: 'La fecha es demasiado antigua (máx. 10 años atrás).' });

  const cantNum = parseInt(cantidad_recibida, 10);
  if (isNaN(cantNum) || cantNum <= 0)
    return res.status(400).json({ message: 'La cantidad recibida debe ser mayor a cero.' });
  if (cantNum > 9_999_999)
    return res.status(400).json({ message: 'La cantidad recibida supera el máximo permitido.' });

  if (!numero_orden || numero_orden.length < 1 || numero_orden.length > 30)
    return res.status(400).json({ message: 'El número de orden es requerido.' });

  db.query(
    `UPDATE retiro_bodegas
     SET diputado_id=?, diputado_nombre=?, departamento=?, partido=?, persona_retiro=?,
         fecha_entrega=?, cantidad_recibida=?, numero_orden=?, observaciones=?
     WHERE id=?`,
    [dip_id, diputado_nombre, departamento, partido, persona_retiro,
     fecha_entrega, cantNum, numero_orden, observaciones, id],
    (err, result) => {
      if (err) {
        console.error('[retiro_bodegas] update:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      if (result.affectedRows === 0)
        return res.status(404).json({ message: 'Registro no encontrado.' });
      res.json({ message: 'Retiro actualizado correctamente.' });
    }
  );
};

// ── DELETE ────────────────────────────────────────────────
exports.remove = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para eliminar retiros.' });

  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  db.query('DELETE FROM retiro_bodegas WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('[retiro_bodegas] delete:', err);
      return res.status(500).json({ message: 'Error interno del servidor.' });
    }
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Registro no encontrado.' });
    res.json({ message: 'Retiro eliminado correctamente.' });
  });
};
