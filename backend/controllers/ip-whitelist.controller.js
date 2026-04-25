const db = require('../db');
const { invalidateCache } = require('../middleware/ip-whitelist');

// Valida IP exacta o rango CIDR básico (IPv4)
const IP_REGEX   = /^(\d{1,3}\.){3}\d{1,3}$/;
const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/(\d|[12]\d|3[0-2])$/;

function isValidEntry(ip) {
  return IP_REGEX.test(ip) || CIDR_REGEX.test(ip);
}

function sanitize(str) {
  return (str || '').trim();
}

function normalizeIP(ip) {
  if (ip && ip.startsWith('::ffff:')) return ip.slice(7);
  return ip || '';
}

// GET /api/ip-whitelist
exports.getAll = (req, res) => {
  db.query(
    'SELECT id, ip, descripcion, activo, creado_en FROM ip_whitelist ORDER BY creado_en DESC',
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Error al obtener la lista de IPs.' });
      res.json(rows);
    }
  );
};

// GET /api/ip-whitelist/my-ip  — devuelve la IP del cliente actual
exports.getMyIP = (req, res) => {
  const ip = normalizeIP(req.ip);
  res.json({ ip });
};

// POST /api/ip-whitelist
exports.create = (req, res) => {
  const ip          = sanitize(req.body.ip);
  const descripcion = sanitize(req.body.descripcion).slice(0, 120) || null;

  if (!ip) return res.status(400).json({ message: 'La IP es requerida.' });
  if (!isValidEntry(ip)) return res.status(400).json({ message: 'Formato de IP inválido. Use IPv4 exacta o rango CIDR (ej. 192.168.1.0/24).' });

  db.query(
    'INSERT INTO ip_whitelist (ip, descripcion, creado_por) VALUES (?, ?, ?)',
    [ip, descripcion, req.user.id],
    (err) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY')
          return res.status(409).json({ message: 'Esa IP ya existe en la lista.' });
        return res.status(500).json({ message: 'Error al agregar la IP.' });
      }
      invalidateCache();
      res.status(201).json({ message: 'IP agregada correctamente.' });
    }
  );
};

// PUT /api/ip-whitelist/:id
exports.update = (req, res) => {
  const id          = parseInt(req.params.id, 10);
  const descripcion = sanitize(req.body.descripcion).slice(0, 120) || null;
  const activo      = req.body.activo === true || req.body.activo === 1 ? 1 : 0;

  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });

  db.query(
    'UPDATE ip_whitelist SET descripcion = ?, activo = ? WHERE id = ?',
    [descripcion, activo, id],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'Error al actualizar la IP.' });
      if (result.affectedRows === 0) return res.status(404).json({ message: 'IP no encontrada.' });
      invalidateCache();
      res.json({ message: 'IP actualizada correctamente.' });
    }
  );
};

// DELETE /api/ip-whitelist/:id
exports.remove = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });

  db.query('DELETE FROM ip_whitelist WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ message: 'Error al eliminar la IP.' });
    if (result.affectedRows === 0) return res.status(404).json({ message: 'IP no encontrada.' });
    invalidateCache();
    res.json({ message: 'IP eliminada correctamente.' });
  });
};
