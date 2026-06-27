'use strict';

const db                   = require('../db');
const { logEvent, getClientIP } = require('../middleware/audit');
const { montoALetras }     = require('../services/numero_letras.service');
const { generarOrdenPagoPDF } = require('../services/pdf_generator.service');

// ── Constantes de roles ───────────────────────────────────────────────────────
const ROLES_OPERACION  = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];
const ROLES_APROBACION = ['SUPER_ADMIN', 'ADMIN'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitize(str)  { return (str || '').toString().trim(); }
function toInt(v)       { const n = parseInt(v, 10);   return isNaN(n) ? null : n; }
function toFloat(v)     { const n = parseFloat(v);     return isNaN(n) ? null : n; }

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Asigna el siguiente número correlativo (atomic) para el año y sufijo dados.
 * Usa INSERT … ON DUPLICATE KEY UPDATE para evitar condiciones de carrera.
 * @param {object} conn - Conexión de BD en transacción
 * @param {string} sufijo - 'AS' | 'OP'
 * @param {number} anio   - Año (ej. 2026)
 * @returns {Promise<{numero: number, numero_orden: string}>}
 */
async function asignarNumeroOrden(conn, sufijo, anio) {
  await conn.query(
    `INSERT INTO ordenes_pago_secuencia (anio, sufijo, ultimo_numero)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE ultimo_numero = ultimo_numero + 1`,
    [anio, sufijo],
  );
  const [[seq]] = await conn.query(
    'SELECT ultimo_numero FROM ordenes_pago_secuencia WHERE anio = ? AND sufijo = ?',
    [anio, sufijo],
  );
  return {
    numero:        seq.ultimo_numero,
    numero_orden:  `${seq.ultimo_numero}/${sufijo}/${anio}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ordenes-pago
// Lista paginada con filtros: estado, tipo_origen, anio, q, page, limit
// ─────────────────────────────────────────────────────────────────────────────
exports.getAll = async (req, res) => {
  const {
    estado, tipo_origen, anio,
    q,
    page  = 1,
    limit = 20,
  } = req.query;

  const pageInt  = Math.max(1, parseInt(page,  10) || 1);
  const limitInt = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset   = (pageInt - 1) * limitInt;

  const conditions = [];
  const params     = [];

  if (estado)      { conditions.push('op.estado = ?');                params.push(estado); }
  if (tipo_origen) { conditions.push('op.tipo_origen = ?');           params.push(tipo_origen); }
  if (anio)        { conditions.push('YEAR(op.fecha) = ?');           params.push(parseInt(anio, 10)); }
  if (q && q.trim()) {
    conditions.push('(op.beneficiario LIKE ? OR op.numero_orden LIKE ? OR op.concepto LIKE ?)');
    const like = `%${q.trim()}%`;
    params.push(like, like, like);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const [[{ total }]] = await db.promise().query(
      `SELECT COUNT(*) AS total FROM ordenes_pago op ${where}`,
      params,
    );

    const [rows] = await db.promise().query(
      `SELECT
         op.id, op.numero_orden, op.tipo_origen, op.ayuda_social_id,
         op.beneficiario, op.codigo_beneficiario,
         op.monto, op.forma_pago, op.no_cheque_transferencia, op.tipo_cuenta,
         op.cargo_cuenta, op.concepto,
         op.fecha, op.estado,
         op.created_at, op.updated_at,
         uc.nombre AS creado_por_nombre,
         ua.nombre AS aprobado_por_nombre,
         op.fecha_aprobacion
       FROM ordenes_pago op
       LEFT JOIN usuarios uc ON uc.id = op.created_by
       LEFT JOIN usuarios ua ON ua.id = op.aprobado_por
       ${where}
       ORDER BY op.created_at DESC, op.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limitInt, offset],
    );

    res.json({
      data:  rows,
      total,
      page:  pageInt,
      limit: limitInt,
    });
  } catch (err) {
    console.error('[ordenes-pago] getAll:', err);
    res.status(500).json({ message: 'Error al obtener las órdenes de pago.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ordenes-pago/:id
// Detalle completo de una orden + historial de impresiones
// ─────────────────────────────────────────────────────────────────────────────
exports.getById = async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido.' });

  try {
    const [[orden]] = await db.promise().query(
      `SELECT
         op.*,
         uc.nombre  AS creado_por_nombre,
         ua.nombre  AS aprobado_por_nombre,
         un.nombre  AS anulado_por_nombre
       FROM ordenes_pago op
       LEFT JOIN usuarios uc ON uc.id = op.created_by
       LEFT JOIN usuarios ua ON ua.id = op.aprobado_por
       LEFT JOIN usuarios un ON un.id = op.anulado_por
       WHERE op.id = ?`,
      [id],
    );

    if (!orden) return res.status(404).json({ message: 'Orden de pago no encontrada.' });

    const [impresiones] = await db.promise().query(
      `SELECT opi.*, u.nombre AS impreso_por_nombre
       FROM ordenes_pago_impresiones opi
       JOIN usuarios u ON u.id = opi.impreso_por
       WHERE opi.orden_id = ?
       ORDER BY opi.fecha_impresion DESC`,
      [id],
    );

    res.json({ ...orden, impresiones });
  } catch (err) {
    console.error('[ordenes-pago] getById:', err);
    res.status(500).json({ message: 'Error al obtener la orden de pago.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ordenes-pago
// Crea una nueva orden en estado BORRADOR
// ─────────────────────────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  if (!ROLES_OPERACION.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para crear órdenes de pago.' });

  const {
    beneficiario: rawBeneficiario,
    codigo_beneficiario: rawCodigo,
    monto: rawMonto,
    forma_pago, no_cheque_transferencia: rawCheque,
    tipo_cuenta,
    cargo_anio, cargo_org, cargo_fondo, cargo_tipo_prog,
    cargo_sub_prog, cargo_act, cargo_cuenta: rawCuentaCargo,
    valor_adeuda_por: rawValorAdeuda,
    concepto: rawConcepto,
    descripcion_detallada: rawDescripcion,
    fecha: rawFecha,
    observaciones: rawObs,
  } = req.body;

  // ── Validaciones ──────────────────────────────────────────────────────────
  const beneficiario = sanitize(rawBeneficiario);
  if (!beneficiario || beneficiario.length < 2 || beneficiario.length > 250)
    return res.status(400).json({ message: 'El beneficiario es requerido (máx. 250 caracteres).' });

  const monto = toFloat(rawMonto);
  if (monto === null || monto <= 0 || monto > 999999999.99)
    return res.status(400).json({ message: 'El monto debe ser mayor a 0 y menor a 999,999,999.99.' });

  if (!['CHEQUE', 'TRANSFERENCIA'].includes(sanitize(forma_pago)))
    return res.status(400).json({ message: 'Forma de pago inválida.' });

  if (!['CORRIENTE', 'CAPITAL', 'D_PUB'].includes(sanitize(tipo_cuenta)))
    return res.status(400).json({ message: 'Tipo de cuenta inválido.' });

  const fecha = sanitize(rawFecha);
  if (!DATE_REGEX.test(fecha))
    return res.status(400).json({ message: 'La fecha del documento no es válida (YYYY-MM-DD).' });

  const concepto = sanitize(rawConcepto);
  if (!concepto || concepto.length < 3 || concepto.length > 500)
    return res.status(400).json({ message: 'El concepto es requerido (mín. 3, máx. 500 caracteres).' });

  const monto_letras = montoALetras(monto);

  try {
    const [result] = await db.promise().query(
      `INSERT INTO ordenes_pago
         (tipo_origen, sufijo_orden,
          beneficiario, codigo_beneficiario,
          monto, monto_letras,
          forma_pago, no_cheque_transferencia, tipo_cuenta,
          cargo_anio, cargo_org, cargo_fondo, cargo_tipo_prog,
          cargo_sub_prog, cargo_act, cargo_cuenta,
          valor_adeuda_por, concepto, descripcion_detallada,
          fecha, estado, observaciones, created_by)
       VALUES ('MANUAL','OP',  ?,?,  ?,?,  ?,?,?,  ?,?,?,?,?,?,?,  ?,?,?,  ?,?,?,?)`,
      [
        beneficiario, sanitize(rawCodigo) || null,
        monto, monto_letras,
        sanitize(forma_pago), sanitize(rawCheque) || null, sanitize(tipo_cuenta),
        toInt(cargo_anio), sanitize(cargo_org) || null, sanitize(cargo_fondo) || null,
        sanitize(cargo_tipo_prog) || null, sanitize(cargo_sub_prog) || null,
        sanitize(cargo_act) || null, sanitize(rawCuentaCargo) || null,
        sanitize(rawValorAdeuda) || null, concepto,
        sanitize(rawDescripcion) || null,
        fecha, 'BORRADOR', sanitize(rawObs) || null, req.user.id,
      ],
    );

    await logEvent({
      usuario_id:    req.user.id,
      usuario_nombre: req.user.nombre,
      accion:        'CREAR',
      modulo:        'ordenes-pago',
      detalle:       `Orden de pago creada #${result.insertId} | Beneficiario: ${beneficiario} | Monto: L.${monto}`,
      ip:            getClientIP(req),
      metodo:        req.method,
      ruta:          req.originalUrl,
      resultado:     'EXITO',
    });

    res.status(201).json({ message: 'Orden de pago creada.', id: result.insertId });
  } catch (err) {
    console.error('[ordenes-pago] create:', err);
    res.status(500).json({ message: 'Error al crear la orden de pago.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/ordenes-pago/:id
// Actualiza una orden en estado BORRADOR
// ─────────────────────────────────────────────────────────────────────────────
exports.update = async (req, res) => {
  if (!ROLES_OPERACION.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para editar órdenes de pago.' });

  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido.' });

  try {
    const [[orden]] = await db.promise().query(
      'SELECT id, estado FROM ordenes_pago WHERE id = ?', [id],
    );
    if (!orden)  return res.status(404).json({ message: 'Orden de pago no encontrada.' });
    if (orden.estado !== 'BORRADOR')
      return res.status(409).json({ message: 'Solo se pueden editar órdenes en estado BORRADOR.' });

    const {
      beneficiario: rawBeneficiario, codigo_beneficiario: rawCodigo,
      monto: rawMonto, forma_pago, no_cheque_transferencia: rawCheque,
      tipo_cuenta,
      cargo_anio, cargo_org, cargo_fondo, cargo_tipo_prog,
      cargo_sub_prog, cargo_act, cargo_cuenta: rawCuentaCargo,
      valor_adeuda_por: rawValorAdeuda,
      concepto: rawConcepto, descripcion_detallada: rawDescripcion,
      fecha: rawFecha, observaciones: rawObs,
    } = req.body;

    const beneficiario = sanitize(rawBeneficiario);
    if (!beneficiario || beneficiario.length < 2 || beneficiario.length > 250)
      return res.status(400).json({ message: 'El beneficiario es requerido (máx. 250 caracteres).' });

    const monto = toFloat(rawMonto);
    if (monto === null || monto <= 0 || monto > 999999999.99)
      return res.status(400).json({ message: 'El monto debe ser mayor a 0 y menor a 999,999,999.99.' });

    if (!['CHEQUE', 'TRANSFERENCIA'].includes(sanitize(forma_pago)))
      return res.status(400).json({ message: 'Forma de pago inválida.' });

    if (!['CORRIENTE', 'CAPITAL', 'D_PUB'].includes(sanitize(tipo_cuenta)))
      return res.status(400).json({ message: 'Tipo de cuenta inválido.' });

    const fecha = sanitize(rawFecha);
    if (!DATE_REGEX.test(fecha))
      return res.status(400).json({ message: 'La fecha del documento no es válida (YYYY-MM-DD).' });

    const concepto = sanitize(rawConcepto);
    if (!concepto || concepto.length < 3 || concepto.length > 500)
      return res.status(400).json({ message: 'El concepto es requerido (mín. 3, máx. 500 caracteres).' });

    const monto_letras = montoALetras(monto);

    await db.promise().query(
      `UPDATE ordenes_pago SET
         beneficiario = ?, codigo_beneficiario = ?,
         monto = ?, monto_letras = ?,
         forma_pago = ?, no_cheque_transferencia = ?, tipo_cuenta = ?,
         cargo_anio = ?, cargo_org = ?, cargo_fondo = ?, cargo_tipo_prog = ?,
         cargo_sub_prog = ?, cargo_act = ?, cargo_cuenta = ?,
         valor_adeuda_por = ?, concepto = ?, descripcion_detallada = ?,
         fecha = ?, observaciones = ?
       WHERE id = ? AND estado = 'BORRADOR'`,
      [
        beneficiario, sanitize(rawCodigo) || null,
        monto, monto_letras,
        sanitize(forma_pago), sanitize(rawCheque) || null, sanitize(tipo_cuenta),
        toInt(cargo_anio), sanitize(cargo_org) || null, sanitize(cargo_fondo) || null,
        sanitize(cargo_tipo_prog) || null, sanitize(cargo_sub_prog) || null,
        sanitize(cargo_act) || null, sanitize(rawCuentaCargo) || null,
        sanitize(rawValorAdeuda) || null, concepto,
        sanitize(rawDescripcion) || null,
        fecha, sanitize(rawObs) || null,
        id,
      ],
    );

    res.json({ message: 'Orden de pago actualizada.' });
  } catch (err) {
    console.error('[ordenes-pago] update:', err);
    res.status(500).json({ message: 'Error al actualizar la orden de pago.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/ordenes-pago/:id/aprobar
// BORRADOR → APROBADA  +  asigna numero_orden correlativo
// Solo ADMIN y SUPER_ADMIN
// ─────────────────────────────────────────────────────────────────────────────
exports.aprobar = async (req, res) => {
  if (!ROLES_APROBACION.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para aprobar órdenes de pago.' });

  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido.' });

  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();

    const [[orden]] = await conn.query(
      'SELECT id, estado, tipo_origen, ayuda_social_id, sufijo_orden, cargo_anio, beneficiario, monto FROM ordenes_pago WHERE id = ? FOR UPDATE',
      [id],
    );

    if (!orden)            { await conn.rollback(); return res.status(404).json({ message: 'Orden no encontrada.' }); }
    if (orden.estado !== 'BORRADOR') { await conn.rollback(); return res.status(409).json({ message: `Solo se pueden aprobar órdenes en estado BORRADOR. Estado actual: ${orden.estado}.` }); }

    // Determinar año para el correlativo
    const anio   = orden.cargo_anio || new Date().getFullYear();
    const sufijo = orden.sufijo_orden || 'OP';

    const { numero, numero_orden } = await asignarNumeroOrden(conn, sufijo, anio);

    // Actualizar la orden
    await conn.query(
      `UPDATE ordenes_pago
       SET estado = 'APROBADA', numero_orden = ?, numero_secuencial = ?,
           aprobado_por = ?, fecha_aprobacion = NOW()
       WHERE id = ?`,
      [numero_orden, numero, req.user.id, id],
    );

    // Si viene de ayuda social, escribir número de orden de vuelta
    if (orden.tipo_origen === 'AYUDA_DIPUTADO' && orden.ayuda_social_id) {
      await conn.query(
        'UPDATE ayudas_sociales SET numero_orden = ? WHERE id = ?',
        [numero_orden, orden.ayuda_social_id],
      );
    }

    await conn.commit();

    await logEvent({
      usuario_id:    req.user.id,
      usuario_nombre: req.user.nombre,
      accion:        'ACTUALIZAR',
      modulo:        'ordenes-pago',
      detalle:       `Orden aprobada: ${numero_orden} | Beneficiario: ${orden.beneficiario} | L.${orden.monto}`,
      ip:            getClientIP(req),
      metodo:        req.method,
      ruta:          req.originalUrl,
      resultado:     'EXITO',
    });

    res.json({ message: 'Orden de pago aprobada.', numero_orden });
  } catch (err) {
    await conn.rollback();
    console.error('[ordenes-pago] aprobar:', err);
    res.status(500).json({ message: 'Error al aprobar la orden de pago.' });
  } finally {
    conn.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ordenes-pago/:id/pdf
// Genera el PDF de la orden (solo APROBADA o IMPRESA)
// Registra la impresión. Marca como IMPRESA si es la primera vez.
// ─────────────────────────────────────────────────────────────────────────────
exports.generarPDF = async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido.' });

  const { motivo_reimpresion } = req.query;

  try {
    const [[orden]] = await db.promise().query(
      'SELECT * FROM ordenes_pago WHERE id = ?', [id],
    );

    if (!orden) return res.status(404).json({ message: 'Orden de pago no encontrada.' });
    if (!['APROBADA', 'IMPRESA', 'ENTREGADA'].includes(orden.estado))
      return res.status(409).json({ message: `No se puede imprimir una orden en estado ${orden.estado}.` });

    const esReimpresion = orden.estado === 'IMPRESA' || orden.estado === 'ENTREGADA';

    // Si es reimpresión se recomienda motivo
    if (esReimpresion && !sanitize(motivo_reimpresion))
      console.warn(`[ordenes-pago] Reimpresión de orden #${id} sin motivo.`);

    // Generar PDF
    const pdfBytes = await generarOrdenPagoPDF(orden);

    // Registrar impresión (fire and forget en paralelo con la respuesta)
    const ipCliente = getClientIP(req);
    db.promise().query(
      `INSERT INTO ordenes_pago_impresiones
         (orden_id, impreso_por, es_reimpresion, motivo_reimpresion, ip_cliente)
       VALUES (?,?,?,?,?)`,
      [id, req.user.id, esReimpresion ? 1 : 0, sanitize(motivo_reimpresion) || null, ipCliente],
    ).catch(e => console.error('[ordenes-pago] Error al registrar impresión:', e));

    // Marcar como IMPRESA si es la primera vez
    if (!esReimpresion) {
      db.promise().query(
        "UPDATE ordenes_pago SET estado = 'IMPRESA' WHERE id = ? AND estado = 'APROBADA'",
        [id],
      ).catch(e => console.error('[ordenes-pago] Error al marcar IMPRESA:', e));
    }

    await logEvent({
      usuario_id:    req.user.id,
      usuario_nombre: req.user.nombre,
      accion:        'IMPRIMIR',
      modulo:        'ordenes-pago',
      detalle:       `PDF ${esReimpresion ? 'reimpreso' : 'impreso'}: ${orden.numero_orden || '#'+id} | ${orden.beneficiario}`,
      ip:            ipCliente,
      metodo:        req.method,
      ruta:          req.originalUrl,
      resultado:     'EXITO',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="orden_pago_${orden.numero_orden || id}.pdf"`,
    );
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('[ordenes-pago] generarPDF:', err);
    res.status(500).json({ message: 'Error al generar el PDF de la orden de pago.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/ordenes-pago/:id/entregar
// IMPRESA → ENTREGADA
// ─────────────────────────────────────────────────────────────────────────────
exports.entregar = async (req, res) => {
  if (!ROLES_APROBACION.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para esta acción.' });

  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido.' });

  try {
    const [[orden]] = await db.promise().query(
      'SELECT id, estado, numero_orden FROM ordenes_pago WHERE id = ?', [id],
    );
    if (!orden) return res.status(404).json({ message: 'Orden no encontrada.' });
    if (orden.estado !== 'IMPRESA')
      return res.status(409).json({ message: 'Solo se pueden entregar órdenes en estado IMPRESA.' });

    await db.promise().query(
      "UPDATE ordenes_pago SET estado = 'ENTREGADA' WHERE id = ?", [id],
    );

    res.json({ message: 'Orden de pago marcada como entregada.' });
  } catch (err) {
    console.error('[ordenes-pago] entregar:', err);
    res.status(500).json({ message: 'Error al actualizar el estado.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/ordenes-pago/:id/anular
// Cualquier estado activo → ANULADA  (requiere motivo)
// Solo ADMIN y SUPER_ADMIN
// ─────────────────────────────────────────────────────────────────────────────
exports.anular = async (req, res) => {
  if (!ROLES_APROBACION.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para anular órdenes de pago.' });

  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido.' });

  const motivo = sanitize(req.body.motivo);
  if (!motivo || motivo.length < 5)
    return res.status(400).json({ message: 'Se requiere un motivo de anulación (mín. 5 caracteres).' });
  if (motivo.length > 500)
    return res.status(400).json({ message: 'El motivo no puede superar 500 caracteres.' });

  try {
    const [[orden]] = await db.promise().query(
      'SELECT id, estado, numero_orden, tipo_origen, ayuda_social_id FROM ordenes_pago WHERE id = ?',
      [id],
    );
    if (!orden)                    return res.status(404).json({ message: 'Orden no encontrada.' });
    if (orden.estado === 'ANULADA') return res.status(409).json({ message: 'La orden ya está anulada.' });

    await db.promise().query(
      `UPDATE ordenes_pago
       SET estado = 'ANULADA', anulado_por = ?, fecha_anulacion = NOW(), motivo_anulacion = ?
       WHERE id = ?`,
      [req.user.id, motivo, id],
    );

    // Si era de ayuda social y tenía número asignado, limpiar referencia
    if (orden.tipo_origen === 'AYUDA_DIPUTADO' && orden.ayuda_social_id && orden.numero_orden) {
      await db.promise().query(
        'UPDATE ayudas_sociales SET numero_orden = NULL WHERE id = ? AND numero_orden = ?',
        [orden.ayuda_social_id, orden.numero_orden],
      );
    }

    await logEvent({
      usuario_id:    req.user.id,
      usuario_nombre: req.user.nombre,
      accion:        'ELIMINAR',
      modulo:        'ordenes-pago',
      detalle:       `Orden anulada: ${orden.numero_orden || '#'+id} | Motivo: ${motivo}`,
      ip:            getClientIP(req),
      metodo:        req.method,
      ruta:          req.originalUrl,
      resultado:     'EXITO',
    });

    res.json({ message: 'Orden de pago anulada.' });
  } catch (err) {
    console.error('[ordenes-pago] anular:', err);
    res.status(500).json({ message: 'Error al anular la orden de pago.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ordenes-pago/:id/impresiones
// Historial de impresiones de una orden
// ─────────────────────────────────────────────────────────────────────────────
exports.getImpresiones = async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido.' });

  try {
    const [rows] = await db.promise().query(
      `SELECT opi.*, u.nombre AS impreso_por_nombre
       FROM ordenes_pago_impresiones opi
       JOIN usuarios u ON u.id = opi.impreso_por
       WHERE opi.orden_id = ?
       ORDER BY opi.fecha_impresion DESC`,
      [id],
    );
    res.json(rows);
  } catch (err) {
    console.error('[ordenes-pago] getImpresiones:', err);
    res.status(500).json({ message: 'Error al obtener el historial de impresiones.' });
  }
};
