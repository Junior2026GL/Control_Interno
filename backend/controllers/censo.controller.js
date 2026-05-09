const db = require('../db');

// GET /api/censo/:dni
// Busca una persona por número de identidad (13 dígitos, sin guiones)
exports.buscarPorDni = (req, res) => {
  const dni = (req.params.dni || '').replace(/\D/g, '').trim();

  if (!/^\d{13}$/.test(dni)) {
    return res.status(400).json({ message: 'El DNI debe contener exactamente 13 dígitos.' });
  }

  db.query(
    `SELECT NUMERO_IDENTIDAD, PRIMER_NOMBRE, SEGUNDO_NOMBRE,
            PRIMER_APELLIDO, SEGUNDO_APELLIDO
     FROM censo_nacional
     WHERE NUMERO_IDENTIDAD = ?
     LIMIT 1`,
    [dni],
    (err, rows) => {
      if (err) {
        console.error('[censo] buscarPorDni:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: 'Persona no encontrada en el registro.' });
      }

      const r = rows[0];
      const nombreCompleto = [
        r.PRIMER_NOMBRE,
        r.SEGUNDO_NOMBRE,
        r.PRIMER_APELLIDO,
        r.SEGUNDO_APELLIDO,
      ]
        .filter(Boolean)
        .join(' ')
        .toUpperCase();

      res.json({ nombreCompleto });
    }
  );
};
