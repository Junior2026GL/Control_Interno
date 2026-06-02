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
      `SELECT a.id, a.fecha, a.concepto, a.beneficiario, a.numero_orden, a.monto, a.observaciones,
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

    // ── Cuotas mensuales + ejecución por mes ──────────────
    const [mesesRows] = await db.promise().query(
      'SELECT mes, monto_asignado FROM presupuesto_mensual WHERE presupuesto_id = ? ORDER BY mes',
      [pres.id]
    );
    const monthlyExecMap = {};
    ayudas.forEach(a => {
      const fechaStr = typeof a.fecha === 'string' ? a.fecha.slice(0, 10) : a.fecha.toISOString().slice(0, 10);
      const m = parseInt(fechaStr.slice(5, 7), 10);
      monthlyExecMap[m] = (monthlyExecMap[m] || 0) + parseFloat(a.monto);
    });
    const meses = Array.from({ length: 12 }, (_, i) => {
      const mesNum     = i + 1;
      const cuotaRow   = mesesRows.find(r => r.mes === mesNum);
      const cuotaMonto = cuotaRow ? parseFloat(cuotaRow.monto_asignado) : 0;
      const ejecutadoMes = monthlyExecMap[mesNum] || 0;
      return { mes: mesNum, monto_asignado: cuotaMonto, ejecutado: ejecutadoMes, saldo: cuotaMonto - ejecutadoMes };
    });

    const tipoDistrib = pres.tipo_distribucion || 'auto';
    const firstActive = mesesRows.find(r => parseFloat(r.monto_asignado) > 0);
    const mes_inicio  = firstActive ? firstActive.mes : 1;

    res.json({
      diputado: dipRows[0],
      presupuesto: {
        id:                pres.id,
        diputado_id:       pres.diputado_id,
        anio:              pres.anio,
        monto_asignado:    asignado,
        tipo_distribucion: tipoDistrib,
        observaciones:     pres.observaciones,
        created_at:        pres.created_at,
        mes_inicio,
        ejecutado,
        disponible,
        meses,
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
  const diputadoId    = parseInt(req.body.diputado_id, 10);
  const anio          = parseInt(req.body.anio, 10);
  const monto         = parseFloat(req.body.monto_asignado);
  const observaciones = sanitize(req.body.observaciones) || null;
  const tipoDist      = ['auto', 'personalizada'].includes(req.body.tipo_distribucion)
    ? req.body.tipo_distribucion : 'auto';
  const mesesInput    = Array.isArray(req.body.meses) ? req.body.meses : [];

  if (isNaN(diputadoId)) return res.status(400).json({ message: 'Diputado inválido.' });
  if (isNaN(anio) || anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido.' });
  if (isNaN(monto) || monto <= 0)
    return res.status(400).json({ message: 'El monto asignado debe ser mayor a 0.' });
  if (monto > 999999999.99)
    return res.status(400).json({ message: 'Monto excede el límite permitido.' });

  if (mesesInput.length === 12) {
    const sumaMeses = mesesInput.reduce((s, m) => s + parseFloat(m.monto_asignado || 0), 0);
    if (Math.abs(sumaMeses - monto) > 0.02)
      return res.status(400).json({
        message: `La suma de los meses (L ${sumaMeses.toFixed(2)}) debe ser igual al monto anual (L ${monto.toFixed(2)}).`,
      });
    for (const m of mesesInput) {
      const mes = parseInt(m.mes, 10);
      const montoM = parseFloat(m.monto_asignado);
      if (isNaN(mes) || mes < 1 || mes > 12) return res.status(400).json({ message: 'Número de mes inválido.' });
      if (isNaN(montoM) || montoM < 0) return res.status(400).json({ message: 'Monto mensual inválido.' });
    }
  } else if (tipoDist === 'personalizada') {
    return res.status(400).json({ message: 'Se requieren los 12 meses para distribución personalizada.' });
  }

  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO presupuesto_diputados
         (diputado_id, anio, monto_asignado, tipo_distribucion, observaciones, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [diputadoId, anio, monto, tipoDist, observaciones, req.user?.id || null]
    );
    const presId = result.insertId;

    // Generar filas mensuales
    let monthlyRows;
    if (mesesInput.length === 12) {
      monthlyRows = mesesInput.map(m => [presId, parseInt(m.mes, 10), parseFloat(m.monto_asignado)]);
    } else {
      // auto sin meses: distribuir desde el mes actual hasta diciembre
      const mesInicio = new Date().getMonth() + 1;
      const numMeses  = Math.max(1, 13 - mesInicio);
      const base      = Math.floor((monto / numMeses) * 100) / 100;
      const remainder = +(monto - base * (numMeses - 1)).toFixed(2);
      monthlyRows = Array.from({ length: 12 }, (_, i) => {
        const mesNum = i + 1;
        return [presId, mesNum, mesNum < mesInicio ? 0 : (mesNum === 12 ? remainder : base)];
      });
    }
    await conn.query(
      'INSERT INTO presupuesto_mensual (presupuesto_id, mes, monto_asignado) VALUES ?',
      [monthlyRows]
    );

    await conn.commit();
    res.status(201).json({ message: 'Presupuesto asignado correctamente.', id: presId });
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'Ya existe un presupuesto para ese diputado y año.' });
    console.error('[presupuesto] Error en createPresupuesto:', err);
    res.status(500).json({ message: 'Error al asignar presupuesto.' });
  } finally {
    conn.release();
  }
};

// ──────────────────────────────────────────────────────────────
// PUT /api/presupuesto/:id   — editar monto asignado
// ──────────────────────────────────────────────────────────────
exports.updatePresupuesto = async (req, res) => {
  const id            = parseInt(req.params.id, 10);
  const monto         = parseFloat(req.body.monto_asignado);
  const observaciones = sanitize(req.body.observaciones) || null;
  const tipoDist      = ['auto', 'personalizada'].includes(req.body.tipo_distribucion)
    ? req.body.tipo_distribucion : 'auto';
  const mesesInput    = Array.isArray(req.body.meses) ? req.body.meses : [];

  if (isNaN(id))             return res.status(400).json({ message: 'ID inválido.' });
  if (isNaN(monto) || monto <= 0)
    return res.status(400).json({ message: 'El monto asignado debe ser mayor a 0.' });
  if (monto > 999999999.99)
    return res.status(400).json({ message: 'Monto excede el límite permitido.' });

  if (tipoDist === 'personalizada') {
    if (mesesInput.length !== 12)
      return res.status(400).json({ message: 'Se requieren los 12 meses para distribución personalizada.' });
    const sumaMeses = mesesInput.reduce((s, m) => s + parseFloat(m.monto_asignado || 0), 0);
    if (Math.abs(sumaMeses - monto) > 0.02)
      return res.status(400).json({
        message: `La suma de los meses (L ${sumaMeses.toFixed(2)}) debe ser igual al monto anual (L ${monto.toFixed(2)}).`,
      });
    for (const m of mesesInput) {
      const mes = parseInt(m.mes, 10);
      const montoM = parseFloat(m.monto_asignado);
      if (isNaN(mes) || mes < 1 || mes > 12) return res.status(400).json({ message: 'Número de mes inválido.' });
      if (isNaN(montoM) || montoM < 0) return res.status(400).json({ message: 'Monto mensual inválido.' });
    }
  }

  const MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                         'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();

    // Verificar que el monto no sea menor al ya ejecutado
    const [[{ total }]] = await conn.query(
      'SELECT COALESCE(SUM(monto), 0) AS total FROM ayudas_sociales WHERE presupuesto_id = ?',
      [id]
    );
    const ejecutado = parseFloat(total);
    if (monto < ejecutado) {
      await conn.rollback();
      return res.status(400).json({
        message: `El monto no puede ser menor al ya ejecutado (L ${ejecutado.toLocaleString('es-HN', { minimumFractionDigits: 2 })}).`,
      });
    }

    // Si personalizada: validar que cada mes >= lo ejecutado en ese mes
    if (tipoDist === 'personalizada') {
      const [execMes] = await conn.query(
        `SELECT MONTH(fecha) AS mes, COALESCE(SUM(monto), 0) AS ejecutado
         FROM ayudas_sociales WHERE presupuesto_id = ?
         GROUP BY MONTH(fecha)`,
        [id]
      );
      for (const m of mesesInput) {
        const mesNum  = parseInt(m.mes, 10);
        const montoM  = parseFloat(m.monto_asignado);
        const execRow = execMes.find(r => r.mes === mesNum);
        if (execRow && montoM < parseFloat(execRow.ejecutado)) {
          await conn.rollback();
          return res.status(400).json({
            message: `El monto de ${MESES_NOMBRES[mesNum - 1]} no puede ser menor al ya ejecutado (L ${parseFloat(execRow.ejecutado).toLocaleString('es-HN', { minimumFractionDigits: 2 })}).`,
          });
        }
      }
    }

    const [result] = await conn.query(
      'UPDATE presupuesto_diputados SET monto_asignado = ?, tipo_distribucion = ?, observaciones = ? WHERE id = ?',
      [monto, tipoDist, observaciones, id]
    );
    if (!result.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ message: 'Presupuesto no encontrado.' });
    }

    // Regenerar filas mensuales
    let monthlyRows;
    if (mesesInput.length === 12) {
      monthlyRows = mesesInput.map(m => [id, parseInt(m.mes, 10), parseFloat(m.monto_asignado)]);
    } else {
      // auto sin meses: distribuir desde el mes actual hasta diciembre
      const mesInicio = new Date().getMonth() + 1;
      const numMeses  = Math.max(1, 13 - mesInicio);
      const base      = Math.floor((monto / numMeses) * 100) / 100;
      const remainder = +(monto - base * (numMeses - 1)).toFixed(2);
      monthlyRows = Array.from({ length: 12 }, (_, i) => {
        const mesNum = i + 1;
        return [id, mesNum, mesNum < mesInicio ? 0 : (mesNum === 12 ? remainder : base)];
      });
    }
    await conn.query('DELETE FROM presupuesto_mensual WHERE presupuesto_id = ?', [id]);
    await conn.query(
      'INSERT INTO presupuesto_mensual (presupuesto_id, mes, monto_asignado) VALUES ?',
      [monthlyRows]
    );

    await conn.commit();
    res.json({ message: 'Presupuesto actualizado correctamente.' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('[presupuesto] Error en updatePresupuesto:', err);
    res.status(500).json({ message: 'Error al actualizar presupuesto.' });
  } finally {
    conn.release();
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

    const numero_orden_ins = sanitize(req.body.numero_orden) || null;
    const [result] = await conn.query(
      `INSERT INTO ayudas_sociales
         (presupuesto_id, diputado_id, fecha, concepto, beneficiario, numero_orden, monto, observaciones, created_by, estado_liquidacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sin_liquidar')`,
      [presId, pres.diputado_id, fecha, concepto, beneficiario, numero_orden_ins, monto, observaciones, req.user?.id || null]
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

    const numero_orden_upd = sanitize(req.body.numero_orden) || null;
    await db.promise().query(
      'UPDATE ayudas_sociales SET fecha=?, concepto=?, beneficiario=?, numero_orden=?, monto=?, observaciones=? WHERE id=? AND presupuesto_id=?',
      [fecha, concepto, beneficiario, numero_orden_upd, monto, observaciones, aidId, presId]
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
// PATCH /api/presupuesto/:id/ayudas/:aid_id/orden
// Asignar / actualizar solo el número de orden
// ──────────────────────────────────────────────────────────────
exports.patchOrden = async (req, res) => {
  const presId = parseInt(req.params.id, 10);
  const aidId  = parseInt(req.params.aid_id, 10);
  if (isNaN(presId) || isNaN(aidId)) return res.status(400).json({ message: 'ID inválido.' });

  const numero_orden = sanitize(req.body.numero_orden) || null;
  if (numero_orden && numero_orden.length > 50)
    return res.status(400).json({ message: 'Número de orden demasiado largo (máx. 50 caracteres).' });

  try {
    const [rows] = await db.promise().query(
      'SELECT id FROM ayudas_sociales WHERE id = ? AND presupuesto_id = ?', [aidId, presId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Ayuda no encontrada.' });

    await db.promise().query(
      'UPDATE ayudas_sociales SET numero_orden = ? WHERE id = ? AND presupuesto_id = ?',
      [numero_orden, aidId, presId]
    );
    res.json({ message: 'Número de orden actualizado.', numero_orden });
  } catch (err) {
    console.error('[presupuesto] Error en patchOrden:', err);
    res.status(500).json({ message: 'Error al actualizar el número de orden.' });
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
         d.id, d.nombre, d.departamento, d.tipo, d.partido,
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
// GET /api/presupuesto/reportes/ayudas?anio=&diputado_id=&partido=&estado=&q=&numero_orden=&fecha_desde=&fecha_hasta=&page=&limit=&sort=
// ──────────────────────────────────────────────────────────────
exports.getReportesAyudas = async (req, res) => {
  const anio         = parseInt(req.query.anio || new Date().getFullYear(), 10);
  const diputadoId   = req.query.diputado_id ? parseInt(req.query.diputado_id, 10) : null;
  const partido      = req.query.partido ? req.query.partido.toString().trim().slice(0, 50) : null;
  const page         = Math.max(1, parseInt(req.query.page  || 1,  10));
  const limit        = Math.min(500, Math.max(1, parseInt(req.query.limit || 50, 10)));
  const offset       = (page - 1) * limit;
  const estado       = req.query.estado || null;
  const q            = req.query.q            ? req.query.q.toString().trim().slice(0, 100) : null;
  const numero_orden = req.query.numero_orden ? req.query.numero_orden.toString().trim().slice(0, 50) : null;
  const fecha_desde  = req.query.fecha_desde  ? req.query.fecha_desde.toString().slice(0, 10)  : null;
  const fecha_hasta  = req.query.fecha_hasta  ? req.query.fecha_hasta.toString().slice(0, 10)  : null;
  const sort         = req.query.sort === 'monto_desc' ? 'monto_desc' : 'fecha_desc';
  const anio_libre   = req.query.anio_libre === '1'; // si true, busca en todos los años

  if (!anio_libre && (isNaN(anio) || anio < 2000 || anio > 2100))
    return res.status(400).json({ message: 'Año inválido.' });

  const ESTADOS_VALIDOS = ['sin_liquidar', 'en_proceso', 'liquido'];
  if (estado && !ESTADOS_VALIDOS.includes(estado))
    return res.status(400).json({ message: 'Estado de liquidación inválido.' });

  // validar fechas
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (fecha_desde && !ISO_RE.test(fecha_desde))
    return res.status(400).json({ message: 'fecha_desde inválida.' });
  if (fecha_hasta && !ISO_RE.test(fecha_hasta))
    return res.status(400).json({ message: 'fecha_hasta inválida.' });

  try {
    const baseParams = [];
    const anioFilter    = anio_libre ? '' : 'AND p.anio = ?';
    if (!anio_libre) baseParams.push(anio);

    const dipFilter     = diputadoId   ? 'AND d.id = ?'                     : '';
    const partidoFilter = partido      ? 'AND d.partido = ?'                 : '';
    const estadoFilter  = estado       ? 'AND a.estado_liquidacion = ?'      : '';
    const ordenFilter   = numero_orden ? 'AND a.numero_orden = ?'            : '';
    const desdeFilter   = fecha_desde  ? 'AND a.fecha >= ?'                  : '';
    const hastaFilter   = fecha_hasta  ? 'AND a.fecha <= ?'                  : '';
    const searchFilter  = q ? 'AND (a.concepto LIKE ? OR a.beneficiario LIKE ? OR a.numero_orden LIKE ?)' : '';

    if (diputadoId)   baseParams.push(diputadoId);
    if (partido)      baseParams.push(partido);
    if (estado)       baseParams.push(estado);
    if (numero_orden) baseParams.push(numero_orden);
    if (fecha_desde)  baseParams.push(fecha_desde);
    if (fecha_hasta)  baseParams.push(fecha_hasta);
    if (q)            baseParams.push(`%${q}%`, `%${q}%`, `%${q}%`);

    const orderBy = sort === 'monto_desc' ? 'a.monto DESC, a.id DESC' : 'a.fecha DESC, a.id DESC';

    const [rows] = await db.promise().query(
      `SELECT
         a.id, a.fecha, a.concepto, a.beneficiario, a.numero_orden, a.monto, a.observaciones,
         a.estado_liquidacion, a.created_at, p.anio,
         d.id AS diputado_id, d.nombre AS diputado, d.departamento, d.tipo, d.partido
       FROM ayudas_sociales a
       JOIN presupuesto_diputados p ON p.id = a.presupuesto_id
       JOIN diputados d ON d.id = p.diputado_id
       WHERE 1=1 ${anioFilter} ${dipFilter} ${partidoFilter} ${estadoFilter} ${ordenFilter} ${desdeFilter} ${hastaFilter} ${searchFilter}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...baseParams, limit, offset]
    );

    const [[{ total }]] = await db.promise().query(
      `SELECT COUNT(*) AS total
       FROM ayudas_sociales a
       JOIN presupuesto_diputados p ON p.id = a.presupuesto_id
       JOIN diputados d ON d.id = p.diputado_id
       WHERE 1=1 ${anioFilter} ${dipFilter} ${partidoFilter} ${estadoFilter} ${ordenFilter} ${desdeFilter} ${hastaFilter} ${searchFilter}`,
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

// ──────────────────────────────────────────────────────────────
// GET /api/presupuesto/reportes/mensual-detalle?anio=YYYY&mes=MM
// Detalle de ayudas del mes, agrupadas por diputado
// ──────────────────────────────────────────────────────────────
exports.getReporteMensualDetalle = async (req, res) => {
  const anio = parseInt(req.query.anio || new Date().getFullYear(), 10);
  const mes  = parseInt(req.query.mes  || new Date().getMonth() + 1, 10);

  if (isNaN(anio) || anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido.' });
  if (isNaN(mes) || mes < 1 || mes > 12)
    return res.status(400).json({ message: 'Mes inválido.' });

  try {
    // Traer todas las ayudas del mes con datos de diputado
    const [rows] = await db.promise().query(
      `SELECT
         a.id, a.fecha, a.concepto, a.beneficiario, a.numero_orden,
         a.monto, a.observaciones, a.estado_liquidacion, a.fecha_liquidacion,
         d.id AS diputado_id, d.nombre AS diputado_nombre,
         d.departamento, d.tipo, d.partido
       FROM ayudas_sociales a
       JOIN presupuesto_diputados p ON p.id = a.presupuesto_id AND p.anio = ?
       JOIN diputados d ON d.id = p.diputado_id
       WHERE MONTH(a.fecha) = ?
       ORDER BY d.nombre ASC, a.fecha ASC`,
      [anio, mes]
    );

    // Agrupar por diputado en JS
    const mapaDisp = {};
    for (const r of rows) {
      if (!mapaDisp[r.diputado_id]) {
        mapaDisp[r.diputado_id] = {
          diputado_id:    r.diputado_id,
          diputado_nombre: r.diputado_nombre,
          departamento:   r.departamento,
          tipo:           r.tipo,
          partido:        r.partido,
          cantidad:       0,
          total:          0,
          ayudas:         [],
        };
      }
      const dip = mapaDisp[r.diputado_id];
      const monto = parseFloat(r.monto);
      dip.cantidad++;
      dip.total += monto;
      dip.ayudas.push({
        id:               r.id,
        fecha:            typeof r.fecha === 'string' ? r.fecha.slice(0, 10) : r.fecha.toISOString().slice(0, 10),
        concepto:         r.concepto,
        beneficiario:     r.beneficiario,
        numero_orden:     r.numero_orden,
        monto,
        observaciones:    r.observaciones,
        estado_liquidacion: r.estado_liquidacion,
        fecha_liquidacion: r.fecha_liquidacion,
      });
    }

    const diputados = Object.values(mapaDisp).map(d => ({
      ...d,
      total: parseFloat(d.total.toFixed(2)),
    }));

    const gran_total = diputados.reduce((s, d) => s + d.total, 0);
    const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    res.json({
      anio,
      mes,
      mes_nombre: MESES_ES[mes - 1],
      diputados,
      gran_total: parseFloat(gran_total.toFixed(2)),
      total_ayudas: rows.length,
    });
  } catch (err) {
    console.error('[presupuesto] Error en getReporteMensualDetalle:', err);
    res.status(500).json({ message: 'Error al generar el reporte mensual.' });
  }
};
