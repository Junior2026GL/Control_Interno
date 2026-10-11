const db = require('../db');
const { parseFecha } = require('./cumpleanos_diputados.controller');

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Guarda/actualiza el beneficiario de una ayuda social (único por DNI) y toma
// su fecha de nacimiento del censo nacional. Nunca lanza: un fallo aquí no debe
// impedir que la ayuda se registre.
exports.registrarDesdeAyuda = async ({ dni, nombre, telefono, departamento }) => {
  try {
    if (!dni || !/^\d{13}$/.test(dni)) return;

    const [censo] = await db.promise().query(
      'SELECT FECHA_NACIMIENTO FROM censo_nacional WHERE NUMERO_IDENTIDAD = ? LIMIT 1',
      [dni]
    );
    const parsed = censo.length ? parseFecha(censo[0].FECHA_NACIMIENTO) : null;
    const fechaNac = parsed
      ? `${parsed.anio}-${String(parsed.mes).padStart(2, '0')}-${String(parsed.dia).padStart(2, '0')}`
      : null;

    await db.promise().query(
      `INSERT INTO beneficiarios_ayuda (dni, nombre, telefono, departamento, fecha_nacimiento)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         nombre           = VALUES(nombre),
         telefono         = COALESCE(VALUES(telefono), telefono),
         departamento     = COALESCE(VALUES(departamento), departamento),
         fecha_nacimiento = COALESCE(VALUES(fecha_nacimiento), fecha_nacimiento)`,
      [dni, nombre || 'SIN NOMBRE', telefono || null, departamento || null, fechaNac]
    );
  } catch (err) {
    console.error('[beneficiarios_ayuda] Error en registrarDesdeAyuda:', err.message);
  }
};

// Calcula edad, fecha de cumpleaños y días que faltan para el próximo cumpleaños.
function calcularCumple(fechaIso) {
  if (!fechaIso) return { edad: null, cumple: null, dias_para_cumple: null };
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  const hoy = new Date();
  const hoyUtc = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  let edad = hoy.getFullYear() - anio;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) edad -= 1;

  let proximo = Date.UTC(hoy.getFullYear(), mes - 1, dia);
  if (proximo < hoyUtc) proximo = Date.UTC(hoy.getFullYear() + 1, mes - 1, dia);

  return {
    edad,
    cumple: `${String(dia).padStart(2, '0')} de ${MESES[mes - 1]}`,
    dias_para_cumple: Math.round((proximo - hoyUtc) / 86400000),
  };
}

// GET /api/beneficiarios-ayuda
exports.getAll = (req, res) => {
  const sql = `
    SELECT b.id, b.dni, b.nombre, b.telefono, b.departamento,
           DATE_FORMAT(b.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
           COUNT(a.id)                AS total_ayudas,
           COALESCE(SUM(a.monto), 0)  AS monto_total,
           DATE_FORMAT(MAX(a.fecha), '%Y-%m-%d') AS ultima_ayuda
    FROM beneficiarios_ayuda b
    LEFT JOIN ayudas_sociales a
      ON CONVERT(a.beneficiario_dni USING utf8mb4) COLLATE utf8mb4_unicode_ci
       = CONVERT(b.dni USING utf8mb4) COLLATE utf8mb4_unicode_ci
    GROUP BY b.id
    ORDER BY b.nombre ASC
  `;
  db.query(sql, (err, rows) => {
    if (err) {
      console.error('[beneficiarios_ayuda] Error en getAll:', err);
      return res.status(500).json({ message: 'Error al obtener los beneficiarios.' });
    }
    res.json(rows.map(r => ({
      ...r,
      monto_total: parseFloat(r.monto_total),
      ...calcularCumple(r.fecha_nacimiento),
    })));
  });
};
