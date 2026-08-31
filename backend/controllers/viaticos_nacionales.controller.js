const db  = require('../db');
const { logEvent, getClientIP } = require('../middleware/audit');

const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];

function sanitize(str) { return (str || '').toString().trim(); }
function toDecimal(v)  { const n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; }

// ── GET all ───────────────────────────────────────────────
exports.getAll = (req, res) => {
  db.query(
    `SELECT vn.id, vn.numero_identidad, vn.nombre_beneficiario,
            vn.mision, vn.lugar, vn.dependencia, vn.cargo,
            vn.periodo_desde, vn.periodo_hasta, vn.gran_total,
            vn.creado_en, u.nombre AS registrado_por
     FROM viaticos_nacionales vn
     LEFT JOIN usuarios u ON u.id = vn.usuario_id
     ORDER BY vn.periodo_desde DESC, vn.id DESC
     LIMIT 3000`,
    (err, results) => {
      if (err) {
        console.error('[viaticos_nacionales] getAll:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      res.json(results);
    }
  );
};

// ── GET by ID (full record for view/print) ────────────────
exports.getById = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  db.query(
    `SELECT vn.*, u.nombre AS registrado_por
     FROM viaticos_nacionales vn
     LEFT JOIN usuarios u ON u.id = vn.usuario_id
     WHERE vn.id = ?`,
    [id],
    (err, rows) => {
      if (err) {
        console.error('[viaticos_nacionales] getById:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      if (!rows || rows.length === 0)
        return res.status(404).json({ message: 'Registro no encontrado.' });

      const rec = rows[0];
      if (rec.dias_detalle && typeof rec.dias_detalle === 'string') {
        try { rec.dias_detalle = JSON.parse(rec.dias_detalle); } catch { rec.dias_detalle = []; }
      }
      res.json(rec);
    }
  );
};

// ── POST create ───────────────────────────────────────────
exports.create = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'Sin permisos para registrar viáticos.' });

  const {
    numero_identidad, nombre_beneficiario, mision, lugar, dependencia, cargo,
    encargado_mision, periodo_desde, periodo_hasta, sabado,
    hora_salida, hora_regreso,
    monto_hospedaje, monto_combustible, monto_depreciacion, monto_imprevistos,
    otros_descripcion, monto_otros, dias_detalle, observaciones,
  } = req.body;

  const dni     = sanitize(numero_identidad).replace(/\D/g, '');
  const nombre  = sanitize(nombre_beneficiario);
  const misText = sanitize(mision);
  const lugarT  = sanitize(lugar);
  const deptT   = sanitize(dependencia);
  const cargoT  = sanitize(cargo);
  const encarg  = sanitize(encargado_mision) || null;
  const hSal    = sanitize(hora_salida) || null;
  const hReg    = sanitize(hora_regreso) || null;
  const otDesc  = sanitize(otros_descripcion) || null;
  const obs     = sanitize(observaciones).slice(0, 1000) || null;

  if (!dni || dni.length !== 13)
    return res.status(400).json({ message: 'El DNI debe tener exactamente 13 dígitos.' });
  if (!nombre || nombre.length < 2)
    return res.status(400).json({ message: 'El nombre del beneficiario es requerido.' });
  if (!misText || misText.length < 2)
    return res.status(400).json({ message: 'La misión es requerida.' });
  if (!lugarT || lugarT.length < 2)
    return res.status(400).json({ message: 'El lugar es requerido.' });
  if (!periodo_desde || !periodo_hasta)
    return res.status(400).json({ message: 'Las fechas del período son requeridas.' });
  if (periodo_hasta < periodo_desde)
    return res.status(400).json({ message: 'La fecha "hasta" no puede ser anterior a "desde".' });

  const hospedaje   = toDecimal(monto_hospedaje);
  const combustible = toDecimal(monto_combustible);
  const depreciacion= toDecimal(monto_depreciacion);
  const imprevistos = toDecimal(monto_imprevistos);
  const otros       = toDecimal(monto_otros);
  const granTotal   = hospedaje + combustible + depreciacion + imprevistos + otros;

  let diasJson = null;
  if (dias_detalle && Array.isArray(dias_detalle) && dias_detalle.length > 0) {
    diasJson = JSON.stringify(dias_detalle.map(d => ({
      fecha: sanitize(d.fecha),
      monto: toDecimal(d.monto),
    })));
  }

  db.query(
    `INSERT INTO viaticos_nacionales
       (numero_identidad, nombre_beneficiario, mision, lugar, dependencia, cargo,
        encargado_mision, periodo_desde, periodo_hasta, sabado,
        hora_salida, hora_regreso,
        monto_hospedaje, monto_combustible, monto_depreciacion, monto_imprevistos,
        otros_descripcion, monto_otros, gran_total, dias_detalle, observaciones, usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [dni, nombre, misText, lugarT, deptT, cargoT,
     encarg, periodo_desde, periodo_hasta, sabado ? 1 : 0,
     hSal, hReg,
     hospedaje, combustible, depreciacion, imprevistos,
     otDesc, otros, granTotal, diasJson, obs, req.user.id],
    (err, result) => {
      if (err) {
        console.error('[viaticos_nacionales] create:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      logEvent({
        usuario_id: req.user.id, usuario_nombre: req.user.nombre || null,
        accion: 'CREAR', modulo: 'viaticos-nacionales',
        detalle: `Registró viático nacional — ${nombre} (DNI ${dni}), Lugar: ${lugarT}`,
        ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO',
      });
      res.status(201).json({ id: result.insertId, message: 'Viático registrado correctamente.' });
    }
  );
};

// ── PUT update ────────────────────────────────────────────
exports.update = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'Sin permisos para editar viáticos.' });

  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  const {
    numero_identidad, nombre_beneficiario, mision, lugar, dependencia, cargo,
    encargado_mision, periodo_desde, periodo_hasta, sabado,
    hora_salida, hora_regreso,
    monto_hospedaje, monto_combustible, monto_depreciacion, monto_imprevistos,
    otros_descripcion, monto_otros, dias_detalle, observaciones,
  } = req.body;

  const dni    = sanitize(numero_identidad).replace(/\D/g, '');
  const nombre = sanitize(nombre_beneficiario);
  const misText= sanitize(mision);
  const lugarT = sanitize(lugar);

  if (!dni || dni.length !== 13)
    return res.status(400).json({ message: 'El DNI debe tener exactamente 13 dígitos.' });
  if (!nombre || nombre.length < 2)
    return res.status(400).json({ message: 'El nombre del beneficiario es requerido.' });
  if (!misText || misText.length < 2)
    return res.status(400).json({ message: 'La misión es requerida.' });
  if (!lugarT || lugarT.length < 2)
    return res.status(400).json({ message: 'El lugar es requerido.' });
  if (!periodo_desde || !periodo_hasta)
    return res.status(400).json({ message: 'Las fechas del período son requeridas.' });
  if (periodo_hasta < periodo_desde)
    return res.status(400).json({ message: 'La fecha "hasta" no puede ser anterior a "desde".' });

  const hospedaje   = toDecimal(monto_hospedaje);
  const combustible = toDecimal(monto_combustible);
  const depreciacion= toDecimal(monto_depreciacion);
  const imprevistos = toDecimal(monto_imprevistos);
  const otros       = toDecimal(monto_otros);
  const granTotal   = hospedaje + combustible + depreciacion + imprevistos + otros;

  let diasJson = null;
  if (dias_detalle && Array.isArray(dias_detalle) && dias_detalle.length > 0) {
    diasJson = JSON.stringify(dias_detalle.map(d => ({
      fecha: sanitize(d.fecha),
      monto: toDecimal(d.monto),
    })));
  }

  db.query(
    `UPDATE viaticos_nacionales
     SET numero_identidad=?, nombre_beneficiario=?, mision=?, lugar=?, dependencia=?, cargo=?,
         encargado_mision=?, periodo_desde=?, periodo_hasta=?, sabado=?,
         hora_salida=?, hora_regreso=?,
         monto_hospedaje=?, monto_combustible=?, monto_depreciacion=?, monto_imprevistos=?,
         otros_descripcion=?, monto_otros=?, gran_total=?, dias_detalle=?, observaciones=?
     WHERE id=?`,
    [dni, nombre, misText, lugarT, sanitize(dependencia), sanitize(cargo),
     sanitize(encargado_mision)||null, periodo_desde, periodo_hasta, sabado ? 1 : 0,
     sanitize(hora_salida)||null, sanitize(hora_regreso)||null,
     hospedaje, combustible, depreciacion, imprevistos,
     sanitize(otros_descripcion)||null, otros, granTotal, diasJson, sanitize(observaciones)||null,
     id],
    (err, result) => {
      if (err) {
        console.error('[viaticos_nacionales] update:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      if (result.affectedRows === 0)
        return res.status(404).json({ message: 'Registro no encontrado.' });
      logEvent({
        usuario_id: req.user.id, usuario_nombre: req.user.nombre || null,
        accion: 'ACTUALIZAR', modulo: 'viaticos-nacionales',
        detalle: `Actualizó viático ID #${id} — ${nombre}`,
        ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO',
      });
      res.json({ message: 'Viático actualizado correctamente.' });
    }
  );
};

// ── DELETE ────────────────────────────────────────────────
exports.remove = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'Sin permisos para eliminar viáticos.' });

  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ message: 'ID inválido.' });

  db.query('DELETE FROM viaticos_nacionales WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('[viaticos_nacionales] delete:', err);
      return res.status(500).json({ message: 'Error interno del servidor.' });
    }
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Registro no encontrado.' });
    logEvent({
      usuario_id: req.user.id, usuario_nombre: req.user.nombre || null,
      accion: 'ELIMINAR', modulo: 'viaticos-nacionales',
      detalle: `Eliminó viático nacional ID #${id}`,
      ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO',
    });
    res.json({ message: 'Viático eliminado correctamente.' });
  });
};
