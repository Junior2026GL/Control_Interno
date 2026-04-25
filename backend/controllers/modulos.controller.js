const db = require('../db');

// GET /api/modulos — lista todos los módulos disponibles
exports.getAllModulos = (req, res) => {
  db.query('SELECT id, clave, nombre FROM modulos ORDER BY id', (err, results) => {
    if (err) return res.status(500).json({ message: 'Error al obtener módulos' });
    res.json(results);
  });
};

// GET /api/modulos/usuario/:id — módulos asignados a un usuario
exports.getUserModulos = (req, res) => {
  const { id } = req.params;
  db.query(
    'SELECT m.clave FROM modulos m JOIN usuario_modulos um ON m.id = um.modulo_id WHERE um.usuario_id = ?',
    [id],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'Error al obtener módulos del usuario' });
      res.json(results.map(r => r.clave));
    }
  );
};

// PUT /api/modulos/usuario/:id — reemplaza todos los módulos del usuario
exports.setUserModulos = (req, res) => {
  const { id } = req.params;
  const { modulos } = req.body; // array de claves, ej: ['caja', 'usuarios']

  if (!Array.isArray(modulos)) {
    return res.status(400).json({ message: 'Se esperaba un array de módulos' });
  }

  db.query('DELETE FROM usuario_modulos WHERE usuario_id = ?', [id], (err) => {
    if (err) return res.status(500).json({ message: 'Error al actualizar módulos' });

    if (modulos.length === 0) {
      return res.json({ message: 'Módulos actualizados' });
    }

    db.query(
      'INSERT INTO usuario_modulos (usuario_id, modulo_id) SELECT ?, id FROM modulos WHERE clave IN (?)',
      [id, modulos],
      (err2) => {
        if (err2) return res.status(500).json({ message: 'Error al asignar módulos' });
        res.json({ message: 'Módulos actualizados' });
      }
    );
  });
};
