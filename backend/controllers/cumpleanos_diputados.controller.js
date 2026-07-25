const db = require('../db');
const { logEvent, getClientIP } = require('../middleware/audit');

// Caché en memoria — TTL de 2 horas (los cumpleaños no cambian frecuentemente)
const CACHE_TTL = 2 * 60 * 60 * 1000;
const cache = { data: null, stats: null, ts: 0 };

function cacheValid() {
  return cache.data !== null && (Date.now() - cache.ts) < CACHE_TTL;
}

/**
 * Intenta parsear FECHA_NACIMIENTO desde varios formatos:
 *   YYYY/MM/DD  →  formato del censo nacional de Honduras
 *   YYYY-MM-DD  →  ISO / MySQL
 *   MM/DD/YYYY  →  inglés americano
 * Devuelve { mes, dia, anio, formateada } o null si no se puede parsear.
 */
function parseFecha(str) {
  if (!str) return null;
  const s = String(str).trim();

  // YYYY/MM/DD  (formato del censo nacional de Honduras — ej: 1965/05/31)
  let m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (m) {
    const [, yr, mo, dy] = m;
    return {
      mes: parseInt(mo, 10),
      dia: parseInt(dy, 10),
      anio: parseInt(yr, 10),
      formateada: `${dy}/${mo}/${yr}`,
    };
  }

  // YYYY-MM-DD  (ISO / exportación MySQL)
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [, yr, mo, dy] = m;
    return {
      mes: parseInt(mo, 10),
      dia: parseInt(dy, 10),
      anio: parseInt(yr, 10),
      formateada: `${dy}/${mo}/${yr}`,
    };
  }

  // MM/DD/YYYY  (inglés americano — solo si primer segmento <= 12)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, mo, dy, yr] = m;
    if (parseInt(mo, 10) <= 12 && parseInt(dy, 10) <= 31) {
      return {
        mes: parseInt(mo, 10),
        dia: parseInt(dy, 10),
        anio: parseInt(yr, 10),
        formateada: `${dy.padStart(2, '0')}/${mo.padStart(2, '0')}/${yr}`,
      };
    }
  }

  return null;
}

// GET /api/cumpleanos-diputados
exports.getAll = (req, res) => {
  if (cacheValid()) {
    return res.json(cache.data);
  }

  const sql = `
    SELECT
      d.id,
      d.nombre,
      d.partido,
      d.tipo,
      d.departamento,
      d.telefono,
      d.activo,
      dc.fecha_nacimiento
    FROM diputados d
    INNER JOIN diputados_cumpleanos dc ON dc.diputado_id = d.id
    ORDER BY d.nombre ASC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error('[cumpleanos_diputados] Error en getAll:', err);
      return res.status(500).json({ message: 'Error al obtener cumpleaños de diputados.' });
    }

    const data = rows
      .map(r => {
        if (!r.fecha_nacimiento) return null;
        const dt  = new Date(r.fecha_nacimiento);
        const mes = dt.getUTCMonth() + 1;
        const dia = dt.getUTCDate();
        const anio = dt.getUTCFullYear();
        if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
        return {
          id:              r.id,
          nombre:          r.nombre,
          partido:         r.partido || '—',
          tipo:            r.tipo,
          departamento:    r.departamento,
          telefono:        r.telefono || null,
          activo:          r.activo === 1 || r.activo === true,
          mes,
          dia,
          anio,
          fecha_nacimiento: `${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${anio}`,
        };
      })
      .filter(Boolean);

    res.json(data);

    cache.data = data;
    cache.ts   = Date.now();

    logEvent({
      usuario_id:     req.user?.id,
      usuario_nombre: req.user?.nombre || null,
      accion:         'CONSULTAR',
      modulo:         'cumpleanos-diputados',
      detalle:        `Consultó cumpleaños de diputados (${data.length} registros)`,
      ip:             getClientIP(req),
      metodo:         req.method,
      ruta:           req.originalUrl,
      resultado:      'EXITO',
    });
  });
};

// GET /api/cumpleanos-diputados/listado — todos los diputados con/sin fecha (para gestión CRUD)
exports.getListado = (req, res) => {
  const sql = `
    SELECT
      d.id,
      d.nombre,
      d.partido,
      d.tipo,
      d.departamento,
      d.telefono,
      d.activo,
      dc.id              AS cumple_id,
      dc.fecha_nacimiento,
      dc.fuente
    FROM diputados d
    LEFT JOIN diputados_cumpleanos dc ON dc.diputado_id = d.id
    ORDER BY d.nombre ASC
  `;
  db.query(sql, (err, rows) => {
    if (err) {
      console.error('[cumpleanos_diputados] Error en getListado:', err);
      return res.status(500).json({ message: 'Error al obtener listado.' });
    }
    res.json(rows.map(r => ({
      id:              r.id,
      nombre:          r.nombre,
      partido:         r.partido || '—',
      tipo:            r.tipo,
      departamento:    r.departamento,
      telefono:        r.telefono || null,
      activo:          r.activo === 1 || r.activo === true,
      cumple_id:       r.cumple_id || null,
      fecha_nacimiento: r.fecha_nacimiento
        ? new Date(r.fecha_nacimiento).toISOString().slice(0, 10)
        : null,
      fuente: r.fuente || null,
    })));
  });
};

// POST /api/cumpleanos-diputados — crear o actualizar fecha de nacimiento
exports.upsert = (req, res) => {
  const diputadoId = parseInt(req.body.diputado_id, 10);
  const fecha      = req.body.fecha_nacimiento;

  if (!diputadoId || !fecha)
    return res.status(400).json({ message: 'diputado_id y fecha_nacimiento son requeridos.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha))
    return res.status(400).json({ message: 'Formato de fecha inválido. Use YYYY-MM-DD.' });

  const sql = `
    INSERT INTO diputados_cumpleanos (diputado_id, fecha_nacimiento, fuente, editado_por)
    VALUES (?, ?, 'manual', ?)
    ON DUPLICATE KEY UPDATE
      fecha_nacimiento = VALUES(fecha_nacimiento),
      fuente           = 'manual',
      editado_por      = VALUES(editado_por),
      actualizado_at   = NOW()
  `;
  db.query(sql, [diputadoId, fecha, req.user?.id || null], (err) => {
    if (err) {
      console.error('[cumpleanos_diputados] Error en upsert:', err);
      return res.status(500).json({ message: 'Error al guardar la fecha.' });
    }
    cache.data = null;
    cache.ts   = 0;
    logEvent({
      usuario_id:     req.user?.id,
      usuario_nombre: req.user?.nombre || null,
      accion:         'GUARDAR',
      modulo:         'cumpleanos-diputados',
      detalle:        `Guardó fecha de nacimiento para diputado ID ${diputadoId}: ${fecha}`,
      ip:             getClientIP(req),
      metodo:         req.method,
      ruta:           req.originalUrl,
      resultado:      'EXITO',
    });
    res.json({ message: 'Fecha guardada correctamente.' });
  });
};

// DELETE /api/cumpleanos-diputados/:diputadoId — eliminar fecha de nacimiento
exports.remove = (req, res) => {
  const diputadoId = parseInt(req.params.diputadoId, 10);
  if (!diputadoId)
    return res.status(400).json({ message: 'ID de diputado inválido.' });

  db.query(
    'DELETE FROM diputados_cumpleanos WHERE diputado_id = ?',
    [diputadoId],
    (err, result) => {
      if (err) {
        console.error('[cumpleanos_diputados] Error en remove:', err);
        return res.status(500).json({ message: 'Error al eliminar la fecha.' });
      }
      if (result.affectedRows === 0)
        return res.status(404).json({ message: 'Registro no encontrado.' });
      cache.data = null;
      cache.ts   = 0;
      logEvent({
        usuario_id:     req.user?.id,
        usuario_nombre: req.user?.nombre || null,
        accion:         'ELIMINAR',
        modulo:         'cumpleanos-diputados',
        detalle:        `Eliminó fecha de nacimiento del diputado ID ${diputadoId}`,
        ip:             getClientIP(req),
        metodo:         req.method,
        ruta:           req.originalUrl,
        resultado:      'EXITO',
      });
      res.json({ message: 'Fecha eliminada correctamente.' });
    }
  );
};

// GET /api/cumpleanos-diputados/stats — totales de teléfono sobre todos los diputados activos
exports.getStats = (req, res) => {
  if (cacheValid() && cache.stats !== null) {
    return res.json(cache.stats);
  }

  db.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN telefono IS NOT NULL AND telefono <> '' THEN 1 ELSE 0 END) AS con_telefono,
       SUM(CASE WHEN telefono IS NULL OR telefono = ''      THEN 1 ELSE 0 END) AS sin_telefono
     FROM diputados`,
    (err, rows) => {
      if (err) {
        console.error('[cumpleanos_diputados] Error en getStats:', err);
        return res.status(500).json({ message: 'Error al obtener estadísticas.' });
      }
      const r = rows[0];
      const stats = {
        total:        r.total,
        con_telefono: r.con_telefono,
        sin_telefono: r.sin_telefono,
      };
      cache.stats = stats;
      res.json(stats);
    }
  );
};
