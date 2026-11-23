const db = require('../db');
const { logEvent, getClientIP } = require('../middleware/audit');

const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];
const TTL_MINUTOS = 15;

// ── Auto-liberar órdenes reservadas por más de 15 minutos ─────────────────
setInterval(() => {
  db.query(
    `UPDATE orden_sap_transferencia
     SET estado = 'libre', usuario_id = NULL, fecha_registro = NULL, sap_id = NULL
     WHERE estado = 'reservado'
       AND fecha_registro < DATE_SUB(NOW(), INTERVAL ${TTL_MINUTOS} MINUTE)`,
    (err, result) => {
      if (err) return;
      if (result.affectedRows > 0)
        console.log(`[orden_sap_transferencia] Auto-liberadas ${result.affectedRows} órdenes expiradas.`);
    }
  );
}, 60 * 1000);

// ── GET /api/orden-sap-transferencia?anio=2026 ────────────────────────────
// Todas las órdenes de un año (para el grid)
exports.getByAnio = (req, res) => {
  const anio = parseInt(req.query.anio, 10) || new Date().getFullYear();
  db.query(
    `SELECT o.*, COALESCE(u.nombre, us.nombre) AS usuario_nombre,
            s.numero AS sap_numero, s.estado AS sap_estado, s.creado_en AS sap_fecha_creacion,
            CASE
              WHEN o.estado = 'reservado' THEN 'reservado'
              WHEN s.id IS NOT NULL THEN CASE WHEN s.estado = 'anulado' THEN 'anulado' ELSE 'usado' END
              ELSE o.estado
            END AS estado_visual
     FROM orden_sap_transferencia o
     LEFT JOIN usuarios u ON u.id = o.usuario_id
     LEFT JOIN sap_transferencia s ON s.id = o.sap_id
     LEFT JOIN usuarios us ON us.id = s.creado_por
     WHERE o.anio = ?
     ORDER BY o.numero ASC`,
    [anio],
    (err, rows) => {
      if (err) { console.error('[orden_sap_transferencia] getByAnio:', err); return res.status(500).json({ message: 'Error interno.' }); }
      res.json(rows);
    }
  );
};

// ── GET /api/orden-sap-transferencia/anios ────────────────────────────────
// Años disponibles: siempre 2026-2030 + los que tengan órdenes
exports.getAnios = (req, res) => {
  const FIJOS = [2026, 2027, 2028, 2029, 2030];
  db.query('SELECT DISTINCT anio FROM orden_sap_transferencia ORDER BY anio DESC', (err, rows) => {
    if (err) { console.error('[orden_sap_transferencia] getAnios:', err); return res.status(500).json({ message: 'Error interno.' }); }
    res.json([...new Set([...FIJOS, ...rows.map(r => r.anio)])].sort((a, b) => a - b));
  });
};

// ── GET /api/orden-sap-transferencia/proxima?anio=2026 ────────────────────
// Próxima orden libre (solo consulta, no reserva)
exports.getProxima = (req, res) => {
  const anio = parseInt(req.query.anio, 10) || new Date().getFullYear();
  db.query(
    `SELECT id, numero, anio FROM orden_sap_transferencia
     WHERE anio = ? AND estado = 'libre' ORDER BY numero ASC LIMIT 1`,
    [anio],
    (err, rows) => {
      if (err) { console.error('[orden_sap_transferencia] getProxima:', err); return res.status(500).json({ message: 'Error interno.' }); }
      if (!rows.length) return res.status(404).json({ message: 'No hay órdenes disponibles para este año.' });
      res.json(rows[0]);
    }
  );
};

// ── POST /api/orden-sap-transferencia/reservar ────────────────────────────
// Reserva la próxima orden libre (con bloqueo para evitar que dos usuarios tomen la misma)
exports.reservar = (req, res) => {
  const anio = parseInt(req.body.anio, 10) || new Date().getFullYear();
  db.getConnection((connErr, conn) => {
    if (connErr) { console.error('[orden_sap_transferencia] reservar getConnection:', connErr); return res.status(500).json({ message: 'Error interno.' }); }
    conn.beginTransaction(txErr => {
      if (txErr) { conn.release(); return res.status(500).json({ message: 'Error interno.' }); }
      conn.query(
        `SELECT id, numero, anio FROM orden_sap_transferencia
         WHERE anio = ? AND estado = 'libre' ORDER BY numero ASC LIMIT 1 FOR UPDATE`,
        [anio],
        (err, rows) => {
          if (err) return conn.rollback(() => { conn.release(); res.status(500).json({ message: 'Error interno.' }); });
          if (!rows.length) return conn.rollback(() => { conn.release(); res.status(404).json({ message: 'No hay órdenes disponibles para este año.' }); });
          const orden = rows[0];
          conn.query(
            `UPDATE orden_sap_transferencia SET estado = 'reservado', usuario_id = ?, fecha_registro = NOW() WHERE id = ?`,
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

// ── POST /api/orden-sap-transferencia/liberar ─────────────────────────────
// Libera una orden reservada si el usuario cancela
exports.liberar = (req, res) => {
  const id = parseInt(req.body.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
  db.query(
    `UPDATE orden_sap_transferencia
     SET estado = 'libre', usuario_id = NULL, fecha_registro = NULL, sap_id = NULL
     WHERE id = ? AND estado = 'reservado' AND usuario_id = ?`,
    [id, req.user.id],
    (err) => {
      if (err) { console.error('[orden_sap_transferencia] liberar:', err); return res.status(500).json({ message: 'Error interno.' }); }
      res.json({ message: 'Orden liberada.' });
    }
  );
};

// ── POST /api/orden-sap-transferencia/generar ─────────────────────────────
// Genera N órdenes desde el último número del año (o desde un número indicado). Solo administradores.
exports.generar = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol)) return res.status(403).json({ message: 'Sin permiso.' });

  const anio     = parseInt(req.body.anio, 10);
  const cantidad = parseInt(req.body.cantidad, 10);
  const desdeRaw = req.body.desde !== undefined ? parseInt(req.body.desde, 10) : null;

  if (!anio || anio < 2020 || anio > 2100) return res.status(400).json({ message: 'Año inválido.' });
  if (!cantidad || cantidad < 1 || cantidad > 1000) return res.status(400).json({ message: 'Cantidad debe ser entre 1 y 1000.' });
  if (desdeRaw !== null && (isNaN(desdeRaw) || desdeRaw < 1)) return res.status(400).json({ message: 'El número de inicio debe ser mayor a 0.' });

  const insertar = (desde) => {
    const hasta = desde + cantidad - 1;
    const valores = [];
    for (let n = desde; n <= hasta; n++) valores.push([n, anio]);
    db.query('INSERT IGNORE INTO orden_sap_transferencia (numero, anio) VALUES ?', [valores], (err, result) => {
      if (err) { console.error('[orden_sap_transferencia] generar:', err); return res.status(500).json({ message: 'Error interno.' }); }
      logEvent({
        usuario_id: req.user.id, usuario_nombre: req.user.nombre || null, accion: 'CREAR', modulo: 'orden-sap-transferencia',
        detalle: `Generó ${result.affectedRows} órdenes SAP para año ${anio} (del ${desde} al ${hasta})`,
        ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO',
      });
      res.status(201).json({ message: `${result.affectedRows} órdenes generadas (del ${desde} al ${hasta}).`, desde, hasta });
    });
  };

  if (desdeRaw !== null) return insertar(desdeRaw);
  db.query('SELECT IFNULL(MAX(numero), 0) AS ultimo FROM orden_sap_transferencia WHERE anio = ?', [anio], (err, rows) => {
    if (err) { console.error('[orden_sap_transferencia] generar ultimo:', err); return res.status(500).json({ message: 'Error interno.' }); }
    insertar(rows[0].ultimo + 1);
  });
};
