const db = require('../db');

function sanitize(str) { return (str || '').toString().trim(); }

// ──────────────────────────────────────────────────────────────
// GET /api/presupuesto/diputado/:diputado_id?anio=YYYY
// ──────────────────────────────────────────────────────────────
exports.getByDiputado = async (req, res) => {
  const diputadoId = parseInt(req.params.diputado_id, 10);
  const anio       = parseInt(req.query.anio || new Date().getFullYear(), 10);

  if (isNaN(diputadoId)) return res.status(400).json({ message: 'ID de diputado inválido.' });
  if (isNaN(anio) || anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido.' });

  try {
    const [dipRows] = await db.promise().query(
      'SELECT id, nombre, departamento, tipo, partido, identidad, activo FROM diputados WHERE id = ?',
      [diputadoId]
    );
    if (!dipRows.length) return res.status(404).json({ message: 'Diputado no encontrado.' });

    const [presRows] = await db.promise().query(
      'SELECT * FROM presupuesto_diputados WHERE diputado_id = ? AND anio = ?',
      [diputadoId, anio]
    );

    if (!presRows.length) {
      return res.json({ diputado: dipRows[0], presupuesto: null, ayudas: [] });
    }

    const pres = presRows[0];
    const [ayudas] = await db.promise().query(
      `SELECT a.id, a.fecha, a.concepto, a.beneficiario, a.monto, a.observaciones,
              a.estado_liquidacion, a.fecha_liquidacion, a.created_at, a.created_by,
              u.nombre AS creado_por_nombre
       FROM ayudas_sociales a
       LEFT JOIN usuarios u ON u.id = a.created_by
       WHERE a.presupuesto_id = ?
       ORDER BY a.fecha DESC, a.id DESC`,
      [pres.id]
    );

    const ejecutado  = ayudas.reduce((s, a) => s + parseFloat(a.monto), 0);
    const asignado   = parseFloat(pres.monto_asignado);
    const disponible = asignado - ejecutado;

    res.json({
      diputado: dipRows[0],
      presupuesto: {
        id:             pres.id,
        diputado_id:    pres.diputado_id,
        anio:           pres.anio,
        monto_asignado: asignado,
        observaciones:  pres.observaciones,
        created_at:     pres.created_at,
        ejecutado,
        disponible,
      },
      ayudas: ayudas.map(a => ({
        ...a,
        monto:            parseFloat(a.monto),
        fecha:            typeof a.fecha === 'string' ? a.fecha.slice(0, 10)
                                                     : a.fecha.toISOString().slice(0, 10),
        fecha_liquidacion: a.fecha_liquidacion
          ? (typeof a.fecha_liquidacion === 'string'
              ? a.fecha_liquidacion
              : a.fecha_liquidacion.toISOString())
          : null,
      })),
    });
  } catch (err) {
    console.error('[presupuesto] Error en getByDiputado:', err);
    res.status(500).json({ message: 'Error al obtener datos del presupuesto.' });
  }
};

// ──────────────────────────────────────────────────────────────
// POST /api/presupuesto   — crear presupuesto anual
// ──────────────────────────────────────────────────────────────
exports.createPresupuesto = async (req, res) => {
  const diputadoId   = parseInt(req.body.diputado_id, 10);
  const anio         = parseInt(req.body.anio, 10);
  const monto        = parseFloat(req.body.monto_asignado);
  const observaciones = sanitize(req.body.observaciones) || null;

  if (isNaN(diputadoId)) return res.status(400).json({ message: 'Diputado inválido.' });
  if (isNaN(anio) || anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido.' });
  if (isNaN(monto) || monto <= 0)
    return res.status(400).json({ message: 'El monto asignado debe ser mayor a 0.' });
  if (monto > 999999999.99)
    return res.status(400).json({ message: 'Monto excede el límite permitido.' });

  try {
    const [result] = await db.promise().query(
      `INSERT INTO presupuesto_diputados
         (diputado_id, anio, monto_asignado, observaciones, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [diputadoId, anio, monto, observaciones, req.user?.id || null]
    );
    res.status(201).json({ message: 'Presupuesto asignado correctamente.', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'Ya existe un presupuesto para ese diputado y año.' });
    console.error('[presupuesto] Error en createPresupuesto:', err);
    res.status(500).json({ message: 'Error al asignar presupuesto.' });
  }
};

// ──────────────────────────────────────────────────────────────
// PUT /api/presupuesto/:id   — editar monto asignado
// ──────────────────────────────────────────────────────────────
exports.updatePresupuesto = async (req, res) => {
  const id            = parseInt(req.params.id, 10);
  const monto         = parseFloat(req.body.monto_asignado);
  const observaciones = sanitize(req.body.observaciones) || null;

  if (isNaN(id))             return res.status(400).json({ message: 'ID inválido.' });
  if (isNaN(monto) || monto <= 0)
    return res.status(400).json({ message: 'El monto asignado debe ser mayor a 0.' });
  if (monto > 999999999.99)
    return res.status(400).json({ message: 'Monto excede el límite permitido.' });

  try {
    // Verify monto is not less than already executed
    const [sumRows] = await db.promise().query(
      'SELECT COALESCE(SUM(monto), 0) AS total FROM ayudas_sociales WHERE presupuesto_id = ?',
      [id]
    );
    const ejecutado = parseFloat(sumRows[0].total);
    if (monto < ejecutado)
      return res.status(400).json({
        message: `El monto no puede ser menor al ya ejecutado (L ${ejecutado.toLocaleString('es-HN', { minimumFractionDigits: 2 })}).`,
      });

    const [result] = await db.promise().query(
      'UPDATE presupuesto_diputados SET monto_asignado = ?, observaciones = ? WHERE id = ?',
      [monto, observaciones, id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Presupuesto no encontrado.' });
    res.json({ message: 'Presupuesto actualizado correctamente.' });
  } catch (err) {
    console.error('[presupuesto] Error en updatePresupuesto:', err);
    res.status(500).json({ message: 'Error al actualizar presupuesto.' });
  }
};

// ──────────────────────────────────────────────────────────────
// POST /api/presupuesto/:id/ayudas   — registrar ayuda social
// ──────────────────────────────────────────────────────────────
exports.createAyuda = async (req, res) => {
  const presId = parseInt(req.params.id, 10);
  if (isNaN(presId)) return res.status(400).json({ message: 'ID inválido.' });

  const fecha         = sanitize(req.body.fecha);
  const concepto      = sanitize(req.body.concepto);
  const beneficiario  = sanitize(req.body.beneficiario) || null;
  const monto         = parseFloat(req.body.monto);
  const observaciones = sanitize(req.body.observaciones) || null;

  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha))
    return res.status(400).json({ message: 'Fecha inválida (formato YYYY-MM-DD).' });
  const hoy = new Date(); hoy.setHours(23, 59, 59, 999);
  if (new Date(fecha + 'T12:00:00') > hoy)
    return res.status(400).json({ message: 'No se puede registrar una ayuda con fecha futura.' });
  if (!concepto || concepto.length < 2)
    return res.status(400).json({ message: 'El concepto es requerido.' });
  if (concepto.length > 300)
    return res.status(400).json({ message: 'Concepto demasiado largo (máx. 300 caracteres).' });
  if (beneficiario && beneficiario.length > 200)
    return res.status(400).json({ message: 'Beneficiario demasiado largo (máx. 200 caracteres).' });
  if (observaciones && observaciones.length > 500)
    return res.status(400).json({ message: 'Observaciones demasiado largas (máx. 500 caracteres).' });
  if (isNaN(monto) || monto <= 0)
    return res.status(400).json({ message: 'El monto debe ser mayor a 0.' });
  if (monto > 999999999.99)
    return res.status(400).json({ message: 'Monto excede el límite permitido.' });

  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();

    // SELECT ... FOR UPDATE evita race conditions: dos requests simultáneos
    // no pueden pasar el check de presupuesto al mismo tiempo
    const [[pres]] = await conn.query(
      'SELECT * FROM presupuesto_diputados WHERE id = ? FOR UPDATE', [presId]
    );
    if (!pres) {
      await conn.rollback();
      return res.status(404).json({ message: 'Presupuesto no encontrado.' });
    }

    // Check remaining budget
    const [[{ total }]] = await conn.query(
      'SELECT COALESCE(SUM(monto), 0) AS total FROM ayudas_sociales WHERE presupuesto_id = ?',
      [presId]
    );
    const ejecutado  = parseFloat(total);
    const disponible = parseFloat(pres.monto_asignado) - ejecutado;
    if (monto > disponible) {
      await conn.rollback();
      return res.status(400).json({
        message: `El monto excede el presupuesto disponible. Disponible: L ${disponible.toLocaleString('es-HN', { minimumFractionDigits: 2 })}.`,
      });
    }

    const [result] = await conn.query(
      `INSERT INTO ayudas_sociales
         (presupuesto_id, diputado_id, fecha, concepto, beneficiario, monto, observaciones, created_by, estado_liquidacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sin_liquidar')`,
      [presId, pres.diputado_id, fecha, concepto, beneficiario, monto, observaciones, req.user?.id || null]
    );
    await conn.commit();
    res.status(201).json({ message: 'Ayuda social registrada correctamente.', id: result.insertId });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('[presupuesto] Error en createAyuda:', err);
    res.status(500).json({ message: 'Error al registrar la ayuda social.' });
  } finally {
    conn.release();
  }
};

// ──────────────────────────────────────────────────────────────
// PUT /api/presupuesto/:id/ayudas/:aid_id   — editar ayuda
// ──────────────────────────────────────────────────────────────
exports.updateAyuda = async (req, res) => {
  const presId = parseInt(req.params.id, 10);
  const aidId  = parseInt(req.params.aid_id, 10);
  if (isNaN(presId) || isNaN(aidId)) return res.status(400).json({ message: 'ID inválido.' });

  const fecha         = sanitize(req.body.fecha);
  const concepto      = sanitize(req.body.concepto);
  const beneficiario  = sanitize(req.body.beneficiario) || null;
  const monto         = parseFloat(req.body.monto);
  const observaciones = sanitize(req.body.observaciones) || null;

  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha))
    return res.status(400).json({ message: 'Fecha inválida (formato YYYY-MM-DD).' });
  const hoy2 = new Date(); hoy2.setHours(23, 59, 59, 999);
  if (new Date(fecha + 'T12:00:00') > hoy2)
    return res.status(400).json({ message: 'No se puede registrar una ayuda con fecha futura.' });
  if (!concepto || concepto.length < 2)
    return res.status(400).json({ message: 'El concepto es requerido.' });
  if (concepto.length > 300)
    return res.status(400).json({ message: 'Concepto demasiado largo (máx. 300 caracteres).' });
  if (beneficiario && beneficiario.length > 200)
    return res.status(400).json({ message: 'Beneficiario demasiado largo (máx. 200 caracteres).' });
  if (observaciones && observaciones.length > 500)
    return res.status(400).json({ message: 'Observaciones demasiado largas (máx. 500 caracteres).' });
  if (isNaN(monto) || monto <= 0)
    return res.status(400).json({ message: 'El monto debe ser mayor a 0.' });
  if (monto > 999999999.99)
    return res.status(400).json({ message: 'Monto excede el límite permitido.' });

  try {
    // Get the ayuda and verify it belongs to this presupuesto (Anti-IDOR)
    const [aidRows] = await db.promise().query(
      'SELECT * FROM ayudas_sociales WHERE id = ? AND presupuesto_id = ?', [aidId, presId]
    );
    if (!aidRows.length) return res.status(404).json({ message: 'Ayuda no encontrada.' });

    const aid = aidRows[0];

    // Si ya está liquidada, la nueva fecha no puede ser posterior a la fecha de liquidación
    if (aid.estado_liquidacion === 'liquido' && aid.fecha_liquidacion) {
      const fechaLiqDate = new Date(aid.fecha_liquidacion);
      if (new Date(fecha + 'T12:00:00') > fechaLiqDate)
        return res.status(400).json({
          message: 'La fecha de la ayuda no puede ser posterior a su fecha de liquidación registrada.',
        });
    }

    // Check budget: sum of all OTHER ayudas + new monto <= asignado
    const [presRows] = await db.promise().query(
      'SELECT monto_asignado FROM presupuesto_diputados WHERE id = ?', [aid.presupuesto_id]
    );
    if (!presRows.length) return res.status(404).json({ message: 'Presupuesto no encontrado.' });
    const [sumRows] = await db.promise().query(
      'SELECT COALESCE(SUM(monto), 0) AS total FROM ayudas_sociales WHERE presupuesto_id = ? AND id != ?',
      [aid.presupuesto_id, aidId]
    );
    const disponible = parseFloat(presRows[0].monto_asignado) - parseFloat(sumRows[0].total);
    if (monto > disponible)
      return res.status(400).json({
        message: `El monto excede el presupuesto disponible. Disponible: L ${disponible.toLocaleString('es-HN', { minimumFractionDigits: 2 })}.`,
      });

    await db.promise().query(
      'UPDATE ayudas_sociales SET fecha=?, concepto=?, beneficiario=?, monto=?, observaciones=? WHERE id=? AND presupuesto_id=?',
      [fecha, concepto, beneficiario, monto, observaciones, aidId, presId]
    );
    res.json({ message: 'Ayuda actualizada correctamente.' });
  } catch (err) {
    console.error('[presupuesto] Error en updateAyuda:', err);
    res.status(500).json({ message: 'Error al actualizar la ayuda.' });
  }
};

// ──────────────────────────────────────────────────────────────
// PATCH /api/presupuesto/:id/ayudas/:aid_id/liquidacion
// ──────────────────────────────────────────────────────────────
exports.patchLiquidacion = async (req, res) => {
  const presId = parseInt(req.params.id, 10);
  const aidId  = parseInt(req.params.aid_id, 10);
  if (isNaN(presId) || isNaN(aidId)) return res.status(400).json({ message: 'ID inválido.' });

  const ESTADOS_VALIDOS = ['sin_liquidar', 'en_proceso', 'liquido'];
  const estado = req.body.estado_liquidacion;
  if (!ESTADOS_VALIDOS.includes(estado))
    return res.status(400).json({ message: 'Estado de liquidación inválido.' });

  let fechaLiq = null;
  if (estado === 'liquido') {
    if (!req.body.fecha_liquidacion)
      return res.status(400).json({ message: 'La fecha y hora de liquidación es requerida.' });
    fechaLiq = new Date(req.body.fecha_liquidacion);
    if (isNaN(fechaLiq.getTime()))
      return res.status(400).json({ message: 'Fecha de liquidación inválida.' });
    if (fechaLiq > new Date())
      return res.status(400).json({ message: 'La fecha de liquidación no puede ser en el futuro.' });
  }

  try {
    const [aidRows] = await db.promise().query(
      'SELECT fecha FROM ayudas_sociales WHERE id = ? AND presupuesto_id = ?', [aidId, presId]
    );
    if (!aidRows.length) return res.status(404).json({ message: 'Ayuda no encontrada.' });

    if (fechaLiq) {
      const ayudaFecha = new Date(aidRows[0].fecha + 'T00:00:00');
      if (fechaLiq < ayudaFecha)
        return res.status(400).json({
          message: 'La fecha de liquidación no puede ser anterior a la fecha de la ayuda.',
        });
    }

    // If changing away from liquido, clear fecha_liquidacion
    const nuevoFechaLiq = estado === 'liquido' ? fechaLiq : null;

    await db.promise().query(
      'UPDATE ayudas_sociales SET estado_liquidacion=?, fecha_liquidacion=? WHERE id=?',
      [estado, nuevoFechaLiq, aidId]
    );
    res.json({ message: 'Estado de liquidación actualizado correctamente.' });
  } catch (err) {
    console.error('[presupuesto] Error en patchLiquidacion:', err);
    res.status(500).json({ message: 'Error al actualizar el estado de liquidación.' });
  }
};

// ──────────────────────────────────────────────────────────────
// DELETE /api/presupuesto/:id/ayudas/:aid_id
// ──────────────────────────────────────────────────────────────
exports.deleteAyuda = async (req, res) => {
  const presId = parseInt(req.params.id, 10);
  const aidId  = parseInt(req.params.aid_id, 10);
  if (isNaN(presId) || isNaN(aidId)) return res.status(400).json({ message: 'ID inválido.' });

  try {
    // Verificar que la ayuda pertenece a este presupuesto (Anti-IDOR)
    const [aidRows] = await db.promise().query(
      'SELECT estado_liquidacion FROM ayudas_sociales WHERE id = ? AND presupuesto_id = ?',
      [aidId, presId]
    );
    if (!aidRows.length) return res.status(404).json({ message: 'Registro no encontrado.' });

    // No permitir eliminar ayudas ya liquidadas
    if (aidRows[0].estado_liquidacion === 'liquido')
      return res.status(409).json({
        message: 'No se puede eliminar una ayuda ya liquidada. Cambie el estado de liquidación primero.',
      });

    await db.promise().query(
      'DELETE FROM ayudas_sociales WHERE id = ? AND presupuesto_id = ?', [aidId, presId]
    );
    res.json({ message: 'Ayuda eliminada correctamente.' });
  } catch (err) {
    console.error('[presupuesto] Error en deleteAyuda:', err);
    res.status(500).json({ message: 'Error al eliminar la ayuda.' });
  }
};

// ──────────────────────────────────────────────────────────────
// GET /api/presupuesto/resumen?anio=YYYY
// Resumen de todos los diputados con presupuesto para el año
// ──────────────────────────────────────────────────────────────
exports.getResumen = async (req, res) => {
  const anio = parseInt(req.query.anio || new Date().getFullYear(), 10);
  if (isNaN(anio) || anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido.' });

  try {
    const [rows] = await db.promise().query(
      `SELECT
         d.id, d.nombre, d.departamento, d.tipo,
         p.id           AS presupuesto_id,
         p.monto_asignado,
         COALESCE(SUM(a.monto), 0) AS ejecutado
       FROM diputados d
       LEFT JOIN presupuesto_diputados p ON p.diputado_id = d.id AND p.anio = ?
       LEFT JOIN ayudas_sociales a ON a.presupuesto_id = p.id
       WHERE d.activo = 1
       GROUP BY d.id, p.id
       ORDER BY d.departamento ASC, d.nombre ASC`,
      [anio]
    );

    res.json(rows.map(r => ({
      ...r,
      monto_asignado: r.monto_asignado != null ? parseFloat(r.monto_asignado) : null,
      ejecutado:      parseFloat(r.ejecutado),
      disponible:     r.monto_asignado != null
        ? parseFloat(r.monto_asignado) - parseFloat(r.ejecutado)
        : null,
    })));
  } catch (err) {
    console.error('[presupuesto] Error en getResumen:', err);
    res.status(500).json({ message: 'Error al obtener el resumen.' });
  }
};

// ──────────────────────────────────────────────────────────────
// GET /api/presupuesto/reportes/ayudas?anio=&diputado_id=&page=&limit=
// ──────────────────────────────────────────────────────────────
exports.getReportesAyudas = async (req, res) => {
  const anio       = parseInt(req.query.anio || new Date().getFullYear(), 10);
  const diputadoId = req.query.diputado_id ? parseInt(req.query.diputado_id, 10) : null;
  const page       = Math.max(1, parseInt(req.query.page  || 1,  10));
  const limit      = Math.min(500, Math.max(1, parseInt(req.query.limit || 50, 10)));
  const offset     = (page - 1) * limit;
  const estado     = req.query.estado || null;
  const q          = req.query.q ? req.query.q.toString().trim().slice(0, 100) : null;
  const sort       = req.query.sort === 'monto_desc' ? 'monto_desc' : 'fecha_desc';

  if (isNaN(anio) || anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido.' });

  const ESTADOS_VALIDOS = ['sin_liquidar', 'en_proceso', 'liquido'];
  if (estado && !ESTADOS_VALIDOS.includes(estado))
    return res.status(400).json({ message: 'Estado de liquidación inválido.' });

  try {
    const baseParams = [anio];
    const dipFilter    = diputadoId ? 'AND d.id = ?' : '';
    const estadoFilter = estado     ? 'AND a.estado_liquidacion = ?' : '';
    const searchFilter = q          ? 'AND (a.concepto LIKE ? OR a.beneficiario LIKE ?)' : '';
    if (diputadoId) baseParams.push(diputadoId);
    if (estado)     baseParams.push(estado);
    if (q)          baseParams.push(`%${q}%`, `%${q}%`);

    const orderBy = sort === 'monto_desc' ? 'a.monto DESC, a.id DESC' : 'a.fecha DESC, a.id DESC';

    const [rows] = await db.promise().query(
      `SELECT
         a.id, a.fecha, a.concepto, a.beneficiario, a.monto, a.observaciones,
         a.estado_liquidacion, a.created_at,
         d.nombre AS diputado, d.departamento
       FROM ayudas_sociales a
       JOIN presupuesto_diputados p ON p.id = a.presupuesto_id AND p.anio = ?
       JOIN diputados d ON d.id = p.diputado_id
       WHERE 1=1 ${dipFilter} ${estadoFilter} ${searchFilter}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...baseParams, limit, offset]
    );

    const [[{ total }]] = await db.promise().query(
      `SELECT COUNT(*) AS total
       FROM ayudas_sociales a
       JOIN presupuesto_diputados p ON p.id = a.presupuesto_id AND p.anio = ?
       JOIN diputados d ON d.id = p.diputado_id
       WHERE 1=1 ${dipFilter} ${estadoFilter} ${searchFilter}`,
      baseParams
    );

    res.json({
      data: rows.map(r => ({
        ...r,
        monto: parseFloat(r.monto),
        fecha: typeof r.fecha === 'string'
          ? r.fecha.slice(0, 10)
          : r.fecha.toISOString().slice(0, 10),
      })),
      total,
      page,
      limit,
    });
  } catch (err) {
    console.error('[presupuesto] Error en getReportesAyudas:', err);
    res.status(500).json({ message: 'Error al obtener las ayudas.' });
  }
};

// ──────────────────────────────────────────────────────────────
// GET /api/presupuesto/reportes/mensual?anio=YYYY
// Ejecutado mensual agregado para el año
// ──────────────────────────────────────────────────────────────
exports.getReportesMensual = async (req, res) => {
  const anio = parseInt(req.query.anio || new Date().getFullYear(), 10);
  if (isNaN(anio) || anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido.' });

  try {
    const [rows] = await db.promise().query(
      `SELECT
         MONTH(a.fecha)    AS mes,
         SUM(a.monto)      AS ejecutado,
         COUNT(*)          AS cantidad
       FROM ayudas_sociales a
       JOIN presupuesto_diputados p ON p.id = a.presupuesto_id AND p.anio = ?
       GROUP BY MONTH(a.fecha)
       ORDER BY MONTH(a.fecha)`,
      [anio]
    );

    const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const resultado = Array.from({ length: 12 }, (_, i) => {
      const found = rows.find(r => r.mes === i + 1);
      return {
        mes:       MESES[i],
        ejecutado: found ? parseFloat(found.ejecutado) : 0,
        cantidad:  found ? found.cantidad : 0,
      };
    });

    res.json(resultado);
  } catch (err) {
    console.error('[presupuesto] Error en getReportesMensual:', err);
    res.status(500).json({ message: 'Error al obtener datos mensuales.' });
  }
};

// ──────────────────────────────────────────────────────────────
// GET /api/presupuesto/reportes/top?anio=YYYY&limit=10
// Top ayudas por monto mayor
// ──────────────────────────────────────────────────────────────
exports.getReportesTop = async (req, res) => {
  const anio  = parseInt(req.query.anio  || new Date().getFullYear(), 10);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || 10, 10)));

  if (isNaN(anio) || anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido.' });

  try {
    const [rows] = await db.promise().query(
      `SELECT
         a.id, a.fecha, a.concepto, a.beneficiario, a.monto, a.estado_liquidacion,
         d.nombre AS diputado, d.departamento
       FROM ayudas_sociales a
       JOIN presupuesto_diputados p ON p.id = a.presupuesto_id AND p.anio = ?
       JOIN diputados d ON d.id = p.diputado_id
       ORDER BY a.monto DESC
       LIMIT ?`,
      [anio, limit]
    );

    res.json(rows.map(r => ({
      ...r,
      monto: parseFloat(r.monto),
      fecha: typeof r.fecha === 'string' ? r.fecha.slice(0, 10) : r.fecha.toISOString().slice(0, 10),
    })));
  } catch (err) {
    console.error('[presupuesto] Error en getReportesTop:', err);
    res.status(500).json({ message: 'Error al obtener el top de ayudas.' });
  }
};
