const db = require('../db');
const { logEvent, getClientIP } = require('../middleware/audit');

const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];

// ── GET /api/orden-checklist?anio=2026 ────────────────────────────────────
// Devuelve todas las órdenes de un año (para el grid)
exports.getByAnio = (req, res) => {
  const anio = parseInt(req.query.anio, 10) || new Date().getFullYear();
  db.query(
    `SELECT oc.*, u.nombre AS usuario_nombre,
            cl.numero AS checklist_numero
     FROM orden_checklist oc
     LEFT JOIN usuarios u ON u.id = oc.usuario_id
     LEFT JOIN checklist_expediente cl ON cl.id = oc.checklist_id
     WHERE oc.anio = ?
     ORDER BY oc.numero ASC`,
    [anio],
    (err, rows) => {
      if (err) { console.error('[orden_checklist] getByAnio:', err); return res.status(500).json({ message: 'Error interno.' }); }
      res.json(rows);
    }
  );
};

// ── GET /api/orden-checklist/proxima?anio=2026 ───────────────────────────
// Devuelve la próxima orden libre (sin reservar — solo consulta)
exports.getProxima = (req, res) => {
  const anio = parseInt(req.query.anio, 10) || new Date().getFullYear();
  db.query(
    `SELECT id, numero, anio FROM orden_checklist
     WHERE anio = ? AND estado = 'libre'
     ORDER BY numero ASC LIMIT 1`,
    [anio],
    (err, rows) => {
      if (err) { console.error('[orden_checklist] getProxima:', err); return res.status(500).json({ message: 'Error interno.' }); }
      if (!rows.length) return res.status(404).json({ message: 'No hay órdenes disponibles para este año.' });
      res.json(rows[0]);
    }
  );
};

// ── POST /api/orden-checklist/reservar ───────────────────────────────────
// Reserva la próxima orden libre con bloqueo para evitar concurrencia
exports.reservar = (req, res) => {
  const anio = parseInt(req.body.anio, 10) || new Date().getFullYear();

  db.getConnection((connErr, conn) => {
    if (connErr) { console.error('[orden_checklist] reservar getConnection:', connErr); return res.status(500).json({ message: 'Error interno.' }); }

    conn.beginTransaction(txErr => {
      if (txErr) { conn.release(); return res.status(500).json({ message: 'Error interno.' }); }

      conn.query(
        `SELECT id, numero, anio FROM orden_checklist
         WHERE anio = ? AND estado = 'libre'
         ORDER BY numero ASC LIMIT 1 FOR UPDATE`,
        [anio],
        (err, rows) => {
          if (err) return conn.rollback(() => { conn.release(); res.status(500).json({ message: 'Error interno.' }); });
          if (!rows.length) return conn.rollback(() => { conn.release(); res.status(404).json({ message: 'No hay órdenes disponibles para este año.' }); });

          const orden = rows[0];
          conn.query(
            `UPDATE orden_checklist SET estado = 'reservado', usuario_id = ?, fecha_registro = NOW() WHERE id = ?`,
            [req.user.id, orden.id],
            (err2) => {
              if (err2) return conn.rollback(() => { conn.release(); res.status(500).json({ message: 'Error interno.' }); });

              conn.commit(commitErr => {
                conn.release();
                if (commitErr) return res.status(500).json({ message: 'Error interno.' });
                res.json({ id: orden.id, numero: orden.numero, anio: orden.anio });
              });
            }
          );
        }
      );
    });
  });
};

// ── POST /api/orden-checklist/liberar ────────────────────────────────────
// Libera una orden reservada si el usuario cancela el modal
exports.liberar = (req, res) => {
  const id = parseInt(req.body.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  db.query(
    `UPDATE orden_checklist
     SET estado = 'libre', usuario_id = NULL, fecha_registro = NULL, checklist_id = NULL
     WHERE id = ? AND estado = 'reservado' AND usuario_id = ?`,
    [id, req.user.id],
    (err, result) => {
      if (err) { console.error('[orden_checklist] liberar:', err); return res.status(500).json({ message: 'Error interno.' }); }
      res.json({ message: 'Orden liberada.' });
    }
  );
};

// ── POST /api/orden-checklist/confirmar ──────────────────────────────────
// Confirma la orden (la pone en 'usado') al crear el checklist
exports.confirmar = (req, res) => {
  const id           = parseInt(req.body.id, 10);
  const checklist_id = parseInt(req.body.checklist_id, 10);
  if (isNaN(id) || id <= 0)           return res.status(400).json({ message: 'ID inválido.' });
  if (isNaN(checklist_id) || checklist_id <= 0) return res.status(400).json({ message: 'checklist_id inválido.' });

  db.query(
    `UPDATE orden_checklist
     SET estado = 'usado', checklist_id = ?, fecha_registro = NOW()
     WHERE id = ? AND usuario_id = ?`,
    [checklist_id, id, req.user.id],
    (err, result) => {
      if (err) { console.error('[orden_checklist] confirmar:', err); return res.status(500).json({ message: 'Error interno.' }); }
      if (result.affectedRows === 0) return res.status(404).json({ message: 'Orden no encontrada o no pertenece al usuario.' });
      logEvent({ usuario_id: req.user.id, usuario_nombre: req.user.nombre || null, accion: 'CREAR', modulo: 'orden-checklist', detalle: `Confirmó orden ID #${id} para checklist ID #${checklist_id}`, ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO' });
      res.json({ message: 'Orden confirmada.' });
    }
  );
};

// ── POST /api/orden-checklist/generar ────────────────────────────────────
// Genera N órdenes a partir del último número existente para un año
// Solo SUPER_ADMIN / ADMIN
exports.generar = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'Sin permiso.' });

  const anio     = parseInt(req.body.anio, 10);
  const cantidad = parseInt(req.body.cantidad, 10);

  if (!anio || anio < 2020 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido.' });
  if (!cantidad || cantidad < 1 || cantidad > 1000)
    return res.status(400).json({ message: 'Cantidad debe ser entre 1 y 1000.' });

  // Obtener el último número existente para ese año
  db.query(
    `SELECT IFNULL(MAX(numero), 0) AS ultimo FROM orden_checklist WHERE anio = ?`,
    [anio],
    (err, rows) => {
      if (err) { console.error('[orden_checklist] generar query ultimo:', err); return res.status(500).json({ message: 'Error interno.' }); }

      const desde = rows[0].ultimo + 1;
      const hasta = desde + cantidad - 1;

      const valores = [];
      for (let n = desde; n <= hasta; n++) {
        valores.push([n, anio]);
      }

      db.query(
        `INSERT IGNORE INTO orden_checklist (numero, anio) VALUES ?`,
        [valores],
        (err2, result) => {
          if (err2) { console.error('[orden_checklist] generar insert:', err2); return res.status(500).json({ message: 'Error interno.' }); }
          logEvent({ usuario_id: req.user.id, usuario_nombre: req.user.nombre || null, accion: 'CREAR', modulo: 'orden-checklist', detalle: `Generó ${result.affectedRows} órdenes para año ${anio} (del ${desde} al ${hasta})`, ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO' });
          res.status(201).json({ message: `${result.affectedRows} órdenes generadas (del ${desde} al ${hasta}).`, desde, hasta });
        }
      );
    }
  );
};

// ── GET /api/orden-checklist/anios ───────────────────────────────────────
// Devuelve los años que tienen órdenes generadas
exports.getAnios = (req, res) => {
  db.query(
    `SELECT DISTINCT anio FROM orden_checklist ORDER BY anio DESC`,
    (err, rows) => {
      if (err) { console.error('[orden_checklist] getAnios:', err); return res.status(500).json({ message: 'Error interno.' }); }
      res.json(rows.map(r => r.anio));
    }
  );
};
