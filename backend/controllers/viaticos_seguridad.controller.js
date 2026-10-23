const db  = require('../db');
const { logEvent, getClientIP } = require('../middleware/audit');

const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];

function sanitize(str) { return (str || '').toString().trim(); }
function toDecimal(v)  { const n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; }
function round2(n)     { return Math.round(n * 100) / 100; }

// ── Normalización de los detalles (JSON) ──────────────────────
function normDias(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 62).map(d => ({ fecha: sanitize(d.fecha).slice(0, 10), monto: toDecimal(d.monto) }));
}
const sumDias = (dias) => dias.reduce((s, d) => s + d.monto, 0);

function normAlimentacion(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 60)
    .map(r => ({ nombre: sanitize(r.nombre).toUpperCase(), cargo: sanitize(r.cargo).toUpperCase(), dias: normDias(r.dias) }))
    .filter(r => r.nombre || sumDias(r.dias) > 0);
}
function normHospedaje(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 30)
    .map(r => {
      const cant = parseFloat(r.cantidad);
      return {
        detalle: sanitize(r.detalle).toUpperCase(),
        cantidad: isNaN(cant) || cant <= 0 ? 1 : cant,
        dias: normDias(r.dias),
      };
    })
    .filter(r => r.detalle || sumDias(r.dias) > 0);
}
function normCombustible(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 30)
    .map(r => ({ nombre: sanitize(r.nombre).toUpperCase(), detalle: sanitize(r.detalle).toUpperCase(), monto: toDecimal(r.monto) }))
    .filter(r => r.nombre || r.detalle || r.monto > 0);
}

// Valida el cuerpo y calcula los totales en el servidor
function buildRecord(body) {
  const dni    = sanitize(body.numero_identidad).replace(/\D/g, '');
  const nombre = sanitize(body.nombre_beneficiario);
  const mision = sanitize(body.mision);
  const lugar  = sanitize(body.lugar);

  if (dni.length !== 13)            return { error: 'El DNI debe tener exactamente 13 dígitos.' };
  if (nombre.length < 2)            return { error: 'El nombre del beneficiario es requerido.' };
  if (mision.length < 2)            return { error: 'La misión es requerida.' };
  if (lugar.length < 2)             return { error: 'El lugar es requerido.' };
  if (!body.periodo_desde || !body.periodo_hasta)
    return { error: 'Las fechas del período son requeridas.' };
  if (body.periodo_hasta < body.periodo_desde)
    return { error: 'La fecha "hasta" no puede ser anterior a "desde".' };

  const alimentacion = normAlimentacion(body.detalle_alimentacion);
  const hospedaje    = normHospedaje(body.detalle_hospedaje);
  const combustible  = normCombustible(body.detalle_combustible);

  const monto_alimentacion = round2(alimentacion.reduce((s, r) => s + sumDias(r.dias), 0));
  const monto_hospedaje    = round2(hospedaje.reduce((s, r) => s + r.cantidad * sumDias(r.dias), 0));
  const monto_combustible  = round2(combustible.reduce((s, r) => s + r.monto, 0));
  const monto_imprevistos  = round2(toDecimal(body.monto_imprevistos));
  const monto_otros        = round2(toDecimal(body.monto_otros));
  const gran_total = round2(monto_alimentacion + monto_hospedaje + monto_combustible + monto_imprevistos + monto_otros);

  return {
    values: {
      numero_identidad: dni,
      nombre_beneficiario: nombre,
      mision,
      lugar,
      dependencia: sanitize(body.dependencia),
      cargo: sanitize(body.cargo),
      encargado_mision: sanitize(body.encargado_mision) || null,
      periodo_desde: body.periodo_desde,
      periodo_hasta: body.periodo_hasta,
      hora_salida: sanitize(body.hora_salida) || null,
      hora_regreso: sanitize(body.hora_regreso) || null,
      monto_hospedaje, monto_alimentacion, monto_combustible, monto_imprevistos,
      otros_descripcion: sanitize(body.otros_descripcion) || null,
      monto_otros, gran_total,
      detalle_alimentacion: JSON.stringify(alimentacion),
      detalle_hospedaje:    JSON.stringify(hospedaje),
      detalle_combustible:  JSON.stringify(combustible),
      observaciones: sanitize(body.observaciones).slice(0, 1000) || null,
    },
  };
}

function parseJson(v) {
  if (!v || typeof v !== 'string') return [];
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
}

// ── GET all ───────────────────────────────────────────────
exports.getAll = (req, res) => {
  db.query(
    `SELECT vs.id, vs.numero_identidad, vs.nombre_beneficiario,
            vs.mision, vs.lugar, vs.dependencia, vs.cargo,
            vs.periodo_desde, vs.periodo_hasta, vs.gran_total,
            vs.creado_en, u.nombre AS registrado_por
     FROM viaticos_seguridad vs
     LEFT JOIN usuarios u ON u.id = vs.usuario_id
     ORDER BY vs.periodo_desde DESC, vs.id DESC
     LIMIT 3000`,
    (err, results) => {
      if (err) {
        console.error('[viaticos_seguridad] getAll:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      res.json(results);
    }
  );
};

// ── GET by ID ─────────────────────────────────────────────
exports.getById = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  db.query(
    `SELECT vs.*, u.nombre AS registrado_por
     FROM viaticos_seguridad vs
     LEFT JOIN usuarios u ON u.id = vs.usuario_id
     WHERE vs.id = ?`,
    [id],
    (err, rows) => {
      if (err) {
        console.error('[viaticos_seguridad] getById:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      if (!rows || rows.length === 0)
        return res.status(404).json({ message: 'Registro no encontrado.' });

      const rec = rows[0];
      rec.detalle_alimentacion = parseJson(rec.detalle_alimentacion);
      rec.detalle_hospedaje    = parseJson(rec.detalle_hospedaje);
      rec.detalle_combustible  = parseJson(rec.detalle_combustible);
      res.json(rec);
    }
  );
};

// ── POST create ───────────────────────────────────────────
exports.create = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'Sin permisos para registrar viáticos.' });

  const { values: v, error } = buildRecord(req.body);
  if (error) return res.status(400).json({ message: error });

  db.query('INSERT INTO viaticos_seguridad SET ?', [{ ...v, usuario_id: req.user.id }], (err, result) => {
    if (err) {
      console.error('[viaticos_seguridad] create:', err);
      return res.status(500).json({ message: 'Error interno del servidor.' });
    }
    logEvent({
      usuario_id: req.user.id, usuario_nombre: req.user.nombre || null,
      accion: 'CREAR', modulo: 'viaticos-seguridad',
      detalle: `Registró viático seguridad de presidencia — ${v.nombre_beneficiario} (DNI ${v.numero_identidad}), Lugar: ${v.lugar}`,
      ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO',
    });
    res.status(201).json({ id: result.insertId, message: 'Viático registrado correctamente.' });
  });
};

// ── PUT update ────────────────────────────────────────────
exports.update = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'Sin permisos para editar viáticos.' });

  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  const { values: v, error } = buildRecord(req.body);
  if (error) return res.status(400).json({ message: error });

  db.query('UPDATE viaticos_seguridad SET ? WHERE id = ?', [v, id], (err, result) => {
    if (err) {
      console.error('[viaticos_seguridad] update:', err);
      return res.status(500).json({ message: 'Error interno del servidor.' });
    }
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Registro no encontrado.' });
    logEvent({
      usuario_id: req.user.id, usuario_nombre: req.user.nombre || null,
      accion: 'ACTUALIZAR', modulo: 'viaticos-seguridad',
      detalle: `Actualizó viático seguridad ID #${id} — ${v.nombre_beneficiario}`,
      ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO',
    });
    res.json({ message: 'Viático actualizado correctamente.' });
  });
};

// ── DELETE ────────────────────────────────────────────────
exports.remove = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'Sin permisos para eliminar viáticos.' });

  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  db.query('DELETE FROM viaticos_seguridad WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('[viaticos_seguridad] delete:', err);
      return res.status(500).json({ message: 'Error interno del servidor.' });
    }
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Registro no encontrado.' });
    logEvent({
      usuario_id: req.user.id, usuario_nombre: req.user.nombre || null,
      accion: 'ELIMINAR', modulo: 'viaticos-seguridad',
      detalle: `Eliminó viático seguridad ID #${id}`,
      ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO',
    });
    res.json({ message: 'Viático eliminado correctamente.' });
  });
};
