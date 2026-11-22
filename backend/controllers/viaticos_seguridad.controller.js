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
    .map(r => ({
      detalle: sanitize(r.detalle).toUpperCase().slice(0, 60),   // ALIMENTACION / HOSPEDAJE / ALIMENTACION Y HOSPEDAJE
      nombre: sanitize(r.nombre).toUpperCase(),
      cargo: sanitize(r.cargo).toUpperCase(),
      dias: normDias(r.dias),
    }))
    .filter(r => r.nombre || sumDias(r.dias) > 0);
}
function normHospedaje(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 30)
    .map(r => {
      const cant = parseFloat(r.cantidad);
      return {
        detalle: sanitize(r.detalle).toUpperCase(),
        cantidad: isNaN(cant) || cant < 0 ? 1 : cant,
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

// Resumen de gastos (tabla editable): [{ descripcion, monto, auto }]
// auto: 'ah' = hospedaje + alimentación, 'a' = alimentación, 'h' = hospedaje (el monto lo calcula el servidor)
function normResumen(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 15)
    .map(r => ({
      descripcion: sanitize(r.descripcion).toUpperCase().slice(0, 200),
      monto: toDecimal(r.monto),
      auto: ['ah', 'a', 'h'].includes(r.auto) ? r.auto : null,
    }))
    .filter(r => r.descripcion || r.monto > 0 || r.auto);
}

// Valida el cuerpo y calcula los totales en el servidor
function buildRecord(body) {
  const dni    = sanitize(body.numero_identidad).replace(/\D/g, '');
  const nombre = sanitize(body.nombre_beneficiario);
  const mision = sanitize(body.mision);
  const lugar  = sanitize(body.lugar);

  if (dni.length < 13 || dni.length > 17) return { error: 'El DNI debe tener entre 13 y 17 dígitos.' };
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
  let monto_combustible = round2(combustible.reduce((s, r) => s + r.monto, 0));
  let monto_imprevistos = round2(toDecimal(body.monto_imprevistos));
  let monto_otros       = round2(toDecimal(body.monto_otros));
  let otros_descripcion = sanitize(body.otros_descripcion) || null;
  let gran_total = round2(monto_alimentacion + monto_hospedaje + monto_combustible + monto_imprevistos + monto_otros);
  let detalleCombustible = combustible;
  let detalleResumen = null;

  // Formato nuevo: el resumen de gastos reemplaza combustible / imprevisto / otros
  if (Array.isArray(body.detalle_resumen)) {
    const autoValor = { ah: monto_alimentacion + monto_hospedaje, a: monto_alimentacion, h: monto_hospedaje };
    const resumen = normResumen(body.detalle_resumen).map(r => ({
      ...r,
      monto: round2(r.auto ? autoValor[r.auto] : r.monto),
    }));
    detalleResumen = resumen;
    gran_total = round2(resumen.reduce((s, r) => s + r.monto, 0));
    monto_combustible = 0; monto_imprevistos = 0; monto_otros = 0; otros_descripcion = null;
    detalleCombustible = [];
  }

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
      otros_descripcion,
      monto_otros, gran_total,
      detalle_alimentacion: JSON.stringify(alimentacion),
      detalle_hospedaje:    JSON.stringify(hospedaje),
      detalle_combustible:  JSON.stringify(detalleCombustible),
      detalle_resumen:      detalleResumen ? JSON.stringify(detalleResumen) : null,
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
     ORDER BY vs.id DESC
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

// ── GET última información guardada de una persona (por DNI) ──
// Sirve para autocompletar nombre, cargo y dependencia al escribir el DNI.
exports.getByDni = (req, res) => {
  const dni = sanitize(req.params.dni).replace(/\D/g, '');
  if (dni.length < 13 || dni.length > 17)
    return res.status(400).json({ message: 'DNI inválido.' });

  db.query(
    `SELECT nombre_beneficiario, cargo, dependencia, detalle_alimentacion, creado_en
     FROM viaticos_seguridad
     WHERE numero_identidad = ?
     ORDER BY id DESC
     LIMIT 20`,
    [dni],
    (err, rows) => {
      if (err) {
        console.error('[viaticos_seguridad] getByDni:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      if (!rows || rows.length === 0)
        return res.status(404).json({ message: 'Sin recibos anteriores.' });

      // El nombre sale del recibo más reciente; el cargo y la dependencia, del más reciente que los tenga escritos
      const nombre = rows[0].nombre_beneficiario;
      const clave = s => (s || '').trim().toUpperCase();
      const primero = campo => (rows.find(r => (r[campo] || '').trim()) || {})[campo] || '';

      let cargo = primero('cargo').trim();
      if (!cargo) {
        // Si ningún recibo tiene cargo, se busca el de esta persona en las tablas de alimentación
        for (const r of rows) {
          const fila = parseJson(r.detalle_alimentacion)
            .find(x => clave(x.nombre) === clave(nombre) && (x.cargo || '').trim());
          if (fila) { cargo = fila.cargo.trim(); break; }
        }
      }
      res.json({ nombre_beneficiario: nombre, cargo, dependencia: primero('dependencia').trim() });
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
      rec.detalle_resumen      = parseJson(rec.detalle_resumen);
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
