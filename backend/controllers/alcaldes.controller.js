const db = require('../db');

const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN'];

function sanitize(str) { return (str || '').toString().trim(); }

// ── GET all ───────────────────────────────────────────────────
exports.getAll = (req, res) => {
  db.query(
    `SELECT * FROM alcaldias ORDER BY departamento ASC, municipio ASC LIMIT 3000`,
    (err, rows) => {
      if (err) {
        console.error('[alcaldes] getAll:', err);
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

  const departamento = sanitize(req.body.departamento).toUpperCase();
  const municipio    = sanitize(req.body.municipio).toUpperCase();
  const alcalde      = sanitize(req.body.alcalde).toUpperCase();
  const partido      = sanitize(req.body.partido).toUpperCase() || null;

  if (!departamento) return res.status(400).json({ message: 'El departamento es requerido.' });
  if (!municipio)    return res.status(400).json({ message: 'El municipio es requerido.' });
  if (!alcalde)      return res.status(400).json({ message: 'El nombre del alcalde es requerido.' });
  if (departamento.length > 100) return res.status(400).json({ message: 'Departamento demasiado largo (máx. 100).' });
  if (municipio.length > 150)    return res.status(400).json({ message: 'Municipio demasiado largo (máx. 150).' });
  if (alcalde.length > 200)      return res.status(400).json({ message: 'Nombre de alcalde demasiado largo (máx. 200).' });

  db.query(
    `INSERT INTO alcaldias (departamento, municipio, alcalde, partido) VALUES (?, ?, ?, ?)`,
    [departamento, municipio, alcalde, partido],
    (err, result) => {
      if (err) {
        console.error('[alcaldes] create:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      res.status(201).json({ id: result.insertId, message: 'Alcalde registrado correctamente.' });
    }
  );
};

// ── PUT update ────────────────────────────────────────────────
exports.update = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para editar.' });

  const id           = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });

  const departamento = sanitize(req.body.departamento).toUpperCase();
  const municipio    = sanitize(req.body.municipio).toUpperCase();
  const alcalde      = sanitize(req.body.alcalde).toUpperCase();
  const partido      = sanitize(req.body.partido).toUpperCase() || null;

  if (!departamento) return res.status(400).json({ message: 'El departamento es requerido.' });
  if (!municipio)    return res.status(400).json({ message: 'El municipio es requerido.' });
  if (!alcalde)      return res.status(400).json({ message: 'El nombre del alcalde es requerido.' });

  db.query(
    `UPDATE alcaldias SET departamento=?, municipio=?, alcalde=?, partido=? WHERE id=?`,
    [departamento, municipio, alcalde, partido, id],
    (err, result) => {
      if (err) {
        console.error('[alcaldes] update:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      if (result.affectedRows === 0)
        return res.status(404).json({ message: 'Registro no encontrado.' });
      res.json({ message: 'Alcalde actualizado correctamente.' });
    }
  );
};

// ── DELETE ────────────────────────────────────────────────────
exports.remove = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para eliminar.' });

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });

  db.query('DELETE FROM alcaldias WHERE id=?', [id], (err, result) => {
    if (err) {
      console.error('[alcaldes] remove:', err);
      return res.status(500).json({ message: 'Error interno del servidor.' });
    }
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Registro no encontrado.' });
    res.json({ message: 'Alcalde eliminado correctamente.' });
  });
};
