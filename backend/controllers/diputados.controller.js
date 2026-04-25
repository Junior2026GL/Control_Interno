const db = require('../db');

function sanitize(str) { return (str || '').toString().trim(); }

const TIPOS_VALIDOS = ['PROPIETARIO', 'SUPLENTE'];
const EMAIL_REGEX   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateFields({ departamento, tipo, nombre, correo, identidad, telefono }) {
  if (!departamento || departamento.length < 2 || departamento.length > 100)
    return 'El departamento es requerido (máx. 100 caracteres).';
  if (!TIPOS_VALIDOS.includes(tipo))
    return 'El tipo debe ser PROPIETARIO o SUPLENTE.';
  if (!nombre || nombre.length < 2 || nombre.length > 200)
    return 'El nombre es requerido (máx. 200 caracteres).';
  if (correo && !EMAIL_REGEX.test(correo))
    return 'El correo electrónico no tiene un formato válido.';
  if (identidad && identidad.length > 30)
    return 'El número de identidad no puede superar 30 caracteres.';
  if (telefono && telefono.length > 25)
    return 'El teléfono no puede superar 25 caracteres.';
  return null;
}

// GET /api/diputados
exports.getAll = (req, res) => {
  db.query(
    'SELECT * FROM diputados ORDER BY departamento ASC, numero ASC, nombre ASC LIMIT 1000',
    (err, results) => {
      if (err) { console.error('[diputados] Error en getAll:', err); return res.status(500).json({ message: 'Error al obtener diputados.' }); }
      res.json(results);
    }
  );
};

// POST /api/diputados
exports.create = (req, res) => {
  const departamento = sanitize(req.body.departamento);
  const tipo         = sanitize(req.body.tipo).toUpperCase();
  const nombre       = sanitize(req.body.nombre);
  const numero       = req.body.numero !== '' && req.body.numero != null
    ? parseInt(req.body.numero, 10) : null;
  const identidad    = sanitize(req.body.identidad).replace(/\s+/g, '') || null;
  const partido      = sanitize(req.body.partido)   || null;
  const telefono     = sanitize(req.body.telefono)  || null;
  const correo       = sanitize(req.body.correo).toLowerCase() || null;

  const err = validateFields({ departamento, tipo, nombre, correo, identidad, telefono });
  if (err) return res.status(400).json({ message: err });

  if (numero !== null && isNaN(numero))
    return res.status(400).json({ message: 'El número debe ser un valor numérico.' });

  db.query(
    `INSERT INTO diputados
      (departamento, numero, tipo, nombre, identidad, partido, telefono, correo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [departamento, numero, tipo, nombre, identidad, partido, telefono, correo],
    (dbErr, result) => {
      if (dbErr) { console.error('[diputados] Error en create:', dbErr); return res.status(500).json({ message: 'Error al crear diputado.' }); }
      res.status(201).json({ message: 'Diputado creado correctamente.', id: result.insertId });
    }
  );
};

// PUT /api/diputados/:id
exports.update = (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ message: 'ID inválido.' });

  const departamento = sanitize(req.body.departamento);
  const tipo         = sanitize(req.body.tipo).toUpperCase();
  const nombre       = sanitize(req.body.nombre);
  const numero       = req.body.numero !== '' && req.body.numero != null
    ? parseInt(req.body.numero, 10) : null;
  const identidad    = sanitize(req.body.identidad).replace(/\s+/g, '') || null;
  const partido      = sanitize(req.body.partido)   || null;
  const telefono     = sanitize(req.body.telefono)  || null;
  const correo       = sanitize(req.body.correo).toLowerCase() || null;

  const err = validateFields({ departamento, tipo, nombre, correo, identidad, telefono });
  if (err) return res.status(400).json({ message: err });

  if (numero !== null && isNaN(numero))
    return res.status(400).json({ message: 'El número debe ser un valor numérico.' });

  db.query(
    `UPDATE diputados
     SET departamento=?, numero=?, tipo=?, nombre=?, identidad=?, partido=?, telefono=?, correo=?
     WHERE id=?`,
    [departamento, numero, tipo, nombre, identidad, partido, telefono, correo, targetId],
    (dbErr, result) => {
      if (dbErr) { console.error('[diputados] Error en update:', dbErr); return res.status(500).json({ message: 'Error al actualizar diputado.' }); }
      if (result.affectedRows === 0) return res.status(404).json({ message: 'Diputado no encontrado.' });
      res.json({ message: 'Diputado actualizado correctamente.' });
    }
  );
};

// PATCH /api/diputados/:id/toggle
exports.toggleActive = (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ message: 'ID inválido.' });

  const activo = req.body.activo ? 1 : 0;

  db.query('UPDATE diputados SET activo=? WHERE id=?', [activo, targetId], (err, result) => {
    if (err) { console.error('[diputados] Error en toggleActive:', err); return res.status(500).json({ message: 'Error al cambiar estado.' }); }
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Diputado no encontrado.' });
    res.json({ message: activo ? 'Diputado activado correctamente.' : 'Diputado desactivado correctamente.' });
  });
};
