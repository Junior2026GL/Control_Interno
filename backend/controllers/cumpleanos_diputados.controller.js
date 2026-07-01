const db = require('../db');
const { logEvent, getClientIP } = require('../middleware/audit');

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
  const sql = `
    SELECT
      d.id,
      d.nombre,
      d.partido,
      d.tipo,
      d.departamento,
      d.telefono,
      d.activo,
      c.FECHA_NACIMIENTO
    FROM diputados d
    INNER JOIN censo_nacional c
      ON REPLACE(d.identidad, '-', '') = c.NUMERO_IDENTIDAD
    WHERE d.identidad IS NOT NULL
      AND d.identidad <> ''
      AND c.FECHA_NACIMIENTO IS NOT NULL
      AND c.FECHA_NACIMIENTO <> ''
    ORDER BY d.nombre ASC
    LIMIT 500
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error('[cumpleanos_diputados] Error en getAll:', err);
      return res.status(500).json({ message: 'Error al obtener cumpleaños de diputados.' });
    }

    const data = rows
      .map(r => {
        const fecha = parseFecha(r.FECHA_NACIMIENTO);
        if (!fecha || fecha.mes < 1 || fecha.mes > 12 || fecha.dia < 1 || fecha.dia > 31) {
          return null;
        }
        return {
          id:           r.id,
          nombre:       r.nombre,
          partido:      r.partido || '—',
          tipo:         r.tipo,
          departamento: r.departamento,
          telefono:     r.telefono || null,
          activo:       r.activo === 1 || r.activo === true,
          mes:          fecha.mes,
          dia:          fecha.dia,
          anio:        fecha.anio,
          fecha_nacimiento: fecha.formateada,
        };
      })
      .filter(Boolean);

    res.json(data);

    // Auditoría — registro de consulta a datos personales del censo
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

// GET /api/cumpleanos-diputados/stats — totales de teléfono sobre todos los diputados activos
exports.getStats = (req, res) => {
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
      res.json({
        total:        r.total,
        con_telefono: r.con_telefono,
        sin_telefono: r.sin_telefono,
      });
    }
  );
};
