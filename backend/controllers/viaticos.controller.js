const db = require('../db');

function sanitize(str) { return (str || '').toString().trim(); }

// GET /api/viaticos/diputado/:identidad — buscar diputado por DNI
exports.getByDNI = (req, res) => {
  const identidad = sanitize(req.params.identidad);
  if (!identidad) return res.status(400).json({ message: 'DNI requerido.' });

  db.query(
    `SELECT id, nombre, tipo, cargo_display, identidad, departamento, partido
     FROM (
       SELECT id, nombre, tipo,
         CONCAT('DIPUTADO ', tipo) AS cargo_display,
         identidad, departamento, partido
       FROM diputados
       WHERE identidad = ? AND activo = 1
     ) t LIMIT 1`,
    [identidad],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Error al buscar diputado.' });
      if (!rows.length) return res.status(404).json({ message: 'Diputado no encontrado.' });
      res.json(rows[0]);
    }
  );
};

// GET /api/viaticos — listar todos
exports.getAll = (req, res) => {
  db.query(
    `SELECT v.*, d.nombre AS diputado_nombre, d.tipo AS diputado_tipo,
            u.nombre AS elaborado_por_nombre
     FROM viaticos v
     JOIN diputados d ON v.diputado_id = d.id
     JOIN usuarios  u ON v.creado_por  = u.id
     ORDER BY v.creado_en DESC LIMIT 200`,
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Error al obtener viáticos.' });
      res.json(rows);
    }
  );
};

// GET /api/viaticos/:id — obtener uno completo (con detalle y días)
exports.getOne = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });

  db.query(
    `SELECT v.*, d.nombre AS diputado_nombre, d.tipo AS diputado_tipo,
            d.identidad, d.departamento, d.partido,
            u.nombre AS elaborado_por_nombre
     FROM viaticos v
     JOIN diputados d ON v.diputado_id = d.id
     JOIN usuarios  u ON v.creado_por  = u.id
     WHERE v.id = ?`,
    [id],
    (err, rows) => {
      if (err || !rows.length) return res.status(404).json({ message: 'Viático no encontrado.' });
      const viatico = rows[0];

      db.query('SELECT * FROM viaticos_detalle WHERE viatico_id = ? ORDER BY id', [id], (e2, detalle) => {
        if (e2) return res.status(500).json({ message: 'Error al obtener detalle.' });

        db.query('SELECT * FROM viaticos_dias WHERE viatico_id = ? ORDER BY fecha', [id], (e3, dias) => {
          if (e3) return res.status(500).json({ message: 'Error al obtener días.' });
          res.json({ ...viatico, detalle, dias });
        });
      });
    }
  );
};

// POST /api/viaticos — crear
exports.create = (req, res) => {
  const motivo_viaje  = sanitize(req.body.motivo_viaje);
  const lugar         = sanitize(req.body.lugar);
  const diputado_id   = parseInt(req.body.diputado_id, 10);
  const fecha_inicio  = sanitize(req.body.fecha_inicio);
  const fecha_fin     = sanitize(req.body.fecha_fin);
  const cargo         = sanitize(req.body.cargo);
  const tasa_cambio   = parseFloat(req.body.tasa_cambio) || 1;
  const nota1         = sanitize(req.body.nota1);
  const nota2         = sanitize(req.body.nota2);
  const detalle       = Array.isArray(req.body.detalle) ? req.body.detalle : [];
  const dias          = Array.isArray(req.body.dias)    ? req.body.dias    : [];

  if (!motivo_viaje || !lugar || isNaN(diputado_id) || !fecha_inicio || !fecha_fin || !cargo)
    return res.status(400).json({ message: 'Faltan campos requeridos.' });

  // Calcular periodo_dias
  const diff = Math.round((new Date(fecha_fin) - new Date(fecha_inicio)) / 86400000) + 1;
  const periodo_dias = diff > 0 ? diff : 1;

  db.query(
    `INSERT INTO viaticos (motivo_viaje, lugar, diputado_id, periodo_dias, fecha_inicio, fecha_fin,
       cargo, tasa_cambio, nota1, nota2, creado_por)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [motivo_viaje, lugar, diputado_id, periodo_dias, fecha_inicio, fecha_fin,
     cargo, tasa_cambio, nota1, nota2, req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'Error al crear viático.' });
      const vId = result.insertId;

      // Insertar filas de detalle
      const detallePromises = detalle.map(row => new Promise((resolve, reject) => {
        db.query(
          `INSERT INTO viaticos_detalle (viatico_id, nombre, cargo, detalle) VALUES (?,?,?,?)`,
          [vId, sanitize(row.nombre), sanitize(row.cargo), sanitize(row.detalle) || 'ALIMENTACION Y HOSPEDAJE'],
          (e) => e ? reject(e) : resolve()
        );
      }));

      // Insertar días
      const diasPromises = dias.map(d => new Promise((resolve, reject) => {
        db.query(
          `INSERT INTO viaticos_dias (viatico_id, fecha, monto) VALUES (?,?,?)`,
          [vId, d.fecha, parseFloat(d.monto) || 0],
          (e) => e ? reject(e) : resolve()
        );
      }));

      Promise.all([...detallePromises, ...diasPromises])
        .then(() => res.status(201).json({ message: 'Viático creado.', id: vId }))
        .catch(() => res.status(500).json({ message: 'Error al guardar detalles.' }));
    }
  );
};

// DELETE /api/viaticos/:id
exports.remove = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });
  db.query('DELETE FROM viaticos WHERE id = ?', [id], (err, r) => {
    if (err) return res.status(500).json({ message: 'Error al eliminar.' });
    if (!r.affectedRows) return res.status(404).json({ message: 'No encontrado.' });
    res.json({ message: 'Viático eliminado.' });
  });
};

// PUT /api/viaticos/:id — editar
exports.update = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });

  const motivo_viaje = sanitize(req.body.motivo_viaje);
  const lugar        = sanitize(req.body.lugar);
  const diputado_id  = parseInt(req.body.diputado_id, 10);
  const fecha_inicio = sanitize(req.body.fecha_inicio);
  const fecha_fin    = sanitize(req.body.fecha_fin);
  const cargo        = sanitize(req.body.cargo);
  const tasa_cambio  = parseFloat(req.body.tasa_cambio) || 1;
  const nota1        = sanitize(req.body.nota1);
  const nota2        = sanitize(req.body.nota2);
  const detalle      = Array.isArray(req.body.detalle) ? req.body.detalle : [];
  const dias         = Array.isArray(req.body.dias)    ? req.body.dias    : [];

  if (!motivo_viaje || !lugar || isNaN(diputado_id) || !fecha_inicio || !fecha_fin || !cargo)
    return res.status(400).json({ message: 'Faltan campos requeridos.' });

  const diff = Math.round((new Date(fecha_fin) - new Date(fecha_inicio)) / 86400000) + 1;
  const periodo_dias = diff > 0 ? diff : 1;

  db.query(
    `UPDATE viaticos SET motivo_viaje=?, lugar=?, diputado_id=?, periodo_dias=?,
       fecha_inicio=?, fecha_fin=?, cargo=?, tasa_cambio=?, nota1=?, nota2=?
     WHERE id=?`,
    [motivo_viaje, lugar, diputado_id, periodo_dias, fecha_inicio, fecha_fin,
     cargo, tasa_cambio, nota1, nota2, id],
    (err, r) => {
      if (err) return res.status(500).json({ message: 'Error al actualizar viático.' });
      if (!r.affectedRows) return res.status(404).json({ message: 'Viático no encontrado.' });

      // Reemplazar detalle y días
      db.query('DELETE FROM viaticos_detalle WHERE viatico_id = ?', [id], (e1) => {
        if (e1) return res.status(500).json({ message: 'Error al actualizar detalle.' });
        db.query('DELETE FROM viaticos_dias WHERE viatico_id = ?', [id], (e2) => {
          if (e2) return res.status(500).json({ message: 'Error al actualizar días.' });

          const detalleP = detalle.map(row => new Promise((resolve, reject) => {
            db.query(
              `INSERT INTO viaticos_detalle (viatico_id, nombre, cargo, detalle) VALUES (?,?,?,?)`,
              [id, sanitize(row.nombre), sanitize(row.cargo), sanitize(row.detalle) || 'ALIMENTACION Y HOSPEDAJE'],
              (e) => e ? reject(e) : resolve()
            );
          }));
          const diasP = dias.map(d => new Promise((resolve, reject) => {
            db.query(
              `INSERT INTO viaticos_dias (viatico_id, fecha, monto) VALUES (?,?,?)`,
              [id, d.fecha, parseFloat(d.monto) || 0],
              (e) => e ? reject(e) : resolve()
            );
          }));

          Promise.all([...detalleP, ...diasP])
            .then(() => res.json({ message: 'Viático actualizado.' }))
            .catch(() => res.status(500).json({ message: 'Error al guardar detalles.' }));
        });
      });
    }
  );
};
