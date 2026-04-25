const db = require('../db');

const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN'];

const TIPOS_AYUDA = [
  'Económica',
  'Médica',
  'Alimentaria',
  'Educativa',
  'Material / Especie',
  'Social',
  'Otra',
];

const DATE_REGEX  = /^\d{4}-\d{2}-\d{2}$/;
const CANTIDAD_MAX = 9_999_999;

// ── GET all ───────────────────────────────────────────────
exports.getAyudas = (req, res) => {
  db.query(
    `SELECT a.*, u.nombre AS registrado_por
     FROM ayudas a
     LEFT JOIN usuarios u ON u.id = a.usuario_id
     ORDER BY a.fecha DESC, a.id DESC
     LIMIT 2000`,
    (err, results) => {
      if (err) {
        console.error('[ayudas] getAyudas:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      res.json(results);
    }
  );
};

// ── POST create ───────────────────────────────────────────
exports.createAyuda = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para registrar ayudas.' });
  const {
    nombre_completo: rawNombre,
    dni:             rawDni,
    rtn:             rawRtn,
    fecha,
    cantidad,
    tipo_ayuda:      rawTipo,
    nombre_gestor:   rawGestor,
    observaciones:   rawObs,
  } = req.body;

  // nombre_completo
  const nombre_completo = (rawNombre || '').toString().trim();
  if (!nombre_completo)
    return res.status(400).json({ message: 'El nombre completo es requerido.' });
  if (nombre_completo.length < 3 || nombre_completo.length > 200)
    return res.status(400).json({ message: 'El nombre debe tener entre 3 y 200 caracteres.' });

  // dni
  const dni = (rawDni || '').toString().trim();
  if (!dni)
    return res.status(400).json({ message: 'El DNI es requerido.' });
  if (dni.length > 20)
    return res.status(400).json({ message: 'El DNI no puede superar 20 caracteres.' });

  // rtn
  const rtn = (rawRtn || '').toString().trim();
  if (!rtn)
    return res.status(400).json({ message: 'El RTN es requerido.' });
  if (rtn.length > 25)
    return res.status(400).json({ message: 'El RTN no puede superar 25 caracteres.' });

  // fecha
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

  // cantidad
  if (cantidad === undefined || cantidad === null || cantidad === '')
    return res.status(400).json({ message: 'La cantidad es requerida.' });
  const cantidadNum = parseFloat(cantidad);
  if (isNaN(cantidadNum) || cantidadNum <= 0)
    return res.status(400).json({ message: 'La cantidad debe ser mayor a cero.' });
  if (cantidadNum > CANTIDAD_MAX)
    return res.status(400).json({ message: `La cantidad no puede superar ${CANTIDAD_MAX.toLocaleString('es-HN')}.` });

  // tipo_ayuda
  const tipo_ayuda = (rawTipo || '').toString().trim();
  if (!tipo_ayuda || !TIPOS_AYUDA.includes(tipo_ayuda))
    return res.status(400).json({ message: 'El tipo de ayuda no es válido.' });

  // nombre_gestor (opcional)
  const nombre_gestor = (rawGestor || '').toString().trim().slice(0, 200) || null;

  // observaciones (opcional)
  const observaciones = (rawObs || '').toString().trim().slice(0, 500) || null;

  db.query(
    `INSERT INTO ayudas
       (nombre_completo, dni, rtn, fecha, cantidad, tipo_ayuda, nombre_gestor, observaciones, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nombre_completo, dni, rtn, fecha, cantidadNum, tipo_ayuda, nombre_gestor, observaciones, req.user.id],
    (err, result) => {
      if (err) {
        console.error('[ayudas] createAyuda:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      res.status(201).json({ id: result.insertId, message: 'Ayuda registrada correctamente.' });
    }
  );
};

// ── PUT update ────────────────────────────────────────────
exports.updateAyuda = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para editar ayudas.' });

  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  const {
    nombre_completo: rawNombre,
    dni:             rawDni,
    rtn:             rawRtn,
    fecha,
    cantidad,
    tipo_ayuda:      rawTipo,
    nombre_gestor:   rawGestor,
    observaciones:   rawObs,
  } = req.body;

  const nombre_completo = (rawNombre || '').toString().trim();
  if (!nombre_completo || nombre_completo.length < 3 || nombre_completo.length > 200)
    return res.status(400).json({ message: 'El nombre completo debe tener entre 3 y 200 caracteres.' });

  const dni = (rawDni || '').toString().trim();
  if (!dni || dni.length > 20)
    return res.status(400).json({ message: 'DNI inválido.' });

  const rtn = (rawRtn || '').toString().trim();
  if (!rtn || rtn.length > 25)
    return res.status(400).json({ message: 'RTN inválido.' });

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

  const cantidadNum = parseFloat(cantidad);
  if (isNaN(cantidadNum) || cantidadNum <= 0)
    return res.status(400).json({ message: 'La cantidad debe ser mayor a cero.' });
  if (cantidadNum > CANTIDAD_MAX)
    return res.status(400).json({ message: `La cantidad no puede superar ${CANTIDAD_MAX.toLocaleString('es-HN')}.` });

  const tipo_ayuda = (rawTipo || '').toString().trim();
  if (!tipo_ayuda || !TIPOS_AYUDA.includes(tipo_ayuda))
    return res.status(400).json({ message: 'El tipo de ayuda no es válido.' });

  const nombre_gestor = (rawGestor || '').toString().trim().slice(0, 200) || null;
  const observaciones = (rawObs || '').toString().trim().slice(0, 500) || null;

  db.query(
    `UPDATE ayudas
     SET nombre_completo=?, dni=?, rtn=?, fecha=?, cantidad=?, tipo_ayuda=?, nombre_gestor=?, observaciones=?
     WHERE id=?`,
    [nombre_completo, dni, rtn, fecha, cantidadNum, tipo_ayuda, nombre_gestor, observaciones, id],
    (err, result) => {
      if (err) {
        console.error('[ayudas] updateAyuda:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      if (result.affectedRows === 0)
        return res.status(404).json({ message: 'Ayuda no encontrada.' });
      res.json({ message: 'Ayuda actualizada correctamente.' });
    }
  );
};

// ── DELETE ────────────────────────────────────────────────
exports.deleteAyuda = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para eliminar ayudas.' });

  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  db.query('DELETE FROM ayudas WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('[ayudas] deleteAyuda:', err);
      return res.status(500).json({ message: 'Error interno del servidor.' });
    }
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Ayuda no encontrada.' });
    res.json({ message: 'Ayuda eliminada correctamente.' });
  });
};

exports.TIPOS_AYUDA = TIPOS_AYUDA;
