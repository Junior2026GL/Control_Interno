const db = require('../db');

function sanitize(str) { return (str || '').toString().trim(); }

const TASA_DEFAULT = 25.00; // Referencia informativa, el usuario la edita

// ──────────────────────────────────────────────────────────────
// GET /api/viaticos-diputados
// Listar todos con filtros opcionales: diputado_id, estado, anio, page, limit
// ──────────────────────────────────────────────────────────────
exports.getAll = async (req, res) => {
  const { diputado_id, estado, anio, q, page = 1, limit = 20 } = req.query;
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));

  const conditions = [];
  const params     = [];

  if (diputado_id) { conditions.push('vd.diputado_id = ?'); params.push(parseInt(diputado_id)); }
  if (estado)      { conditions.push('vd.estado = ?');      params.push(estado); }
  if (anio)        { conditions.push('YEAR(vd.fecha_salida) = ?'); params.push(parseInt(anio)); }
  if (q && q.trim()) {
    conditions.push('(d.nombre LIKE ? OR vd.motivo LIKE ? OR vd.lugar LIKE ?)');
    const like = `%${q.trim()}%`;
    params.push(like, like, like);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const [[{ total }]] = await db.promise().query(
      `SELECT COUNT(*) AS total
       FROM viaticos_diputados vd
       JOIN diputados d ON d.id = vd.diputado_id
       ${where}`,
      params
    );

    const [rows] = await db.promise().query(
      `SELECT
         vd.id, vd.diputado_id,
         d.nombre AS diputado_nombre, d.tipo AS diputado_tipo,
         d.partido, d.departamento,
         vd.motivo, vd.lugar, vd.destino_internacional, vd.pais_destino,
         vd.fecha_evento_inicio, vd.fecha_evento_fin,
         vd.fecha_salida, vd.fecha_regreso,
         vd.moneda, vd.tasa_cambio,
         vd.hospedaje, vd.alimentacion, vd.transporte, vd.otros,
         (vd.hospedaje + vd.alimentacion + vd.transporte + vd.otros) AS total_moneda,
         vd.estado, vd.observaciones,
         vd.created_at, vd.updated_at,
         uc.nombre AS creado_por_nombre
       FROM viaticos_diputados vd
       JOIN diputados d ON d.id = vd.diputado_id
       LEFT JOIN usuarios uc ON uc.id = vd.created_by
       ${where}
       ORDER BY vd.fecha_salida DESC, vd.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[viaticos-diputados] getAll:', err);
    res.status(500).json({ message: 'Error al obtener los viáticos.' });
  }
};

// ──────────────────────────────────────────────────────────────
// GET /api/viaticos-diputados/:id
// ──────────────────────────────────────────────────────────────
exports.getOne = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });

  try {
    const [rows] = await db.promise().query(
      `SELECT
         vd.*,
         (vd.hospedaje + vd.alimentacion + vd.transporte + vd.otros) AS total_moneda,
         d.nombre AS diputado_nombre, d.tipo AS diputado_tipo,
         d.partido, d.departamento, d.identidad,
         uc.nombre AS creado_por_nombre
       FROM viaticos_diputados vd
       JOIN diputados d ON d.id = vd.diputado_id
       LEFT JOIN usuarios uc ON uc.id = vd.created_by
       WHERE vd.id = ?`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Viático no encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[viaticos-diputados] getOne:', err);
    res.status(500).json({ message: 'Error al obtener el viático.' });
  }
};

// ──────────────────────────────────────────────────────────────
// POST /api/viaticos-diputados
// ──────────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  const {
    diputado_id, motivo, lugar, destino_internacional = 0, pais_destino,
    fecha_evento_inicio, fecha_evento_fin,
    fecha_salida, fecha_regreso,
    moneda = 'HNL', tasa_cambio = TASA_DEFAULT,
    hospedaje = 0, alimentacion = 0, transporte = 0, otros = 0,
    estado = 'pendiente', observaciones,
  } = req.body;

  if (!diputado_id)         return res.status(400).json({ message: 'El diputado es requerido.' });
  if (!motivo?.trim())      return res.status(400).json({ message: 'El motivo es requerido.' });
  if (!lugar?.trim())       return res.status(400).json({ message: 'El lugar es requerido.' });
  if (!fecha_evento_inicio) return res.status(400).json({ message: 'La fecha del evento es requerida.' });
  if (!fecha_salida)        return res.status(400).json({ message: 'La fecha de salida es requerida.' });
  if (!fecha_regreso)       return res.status(400).json({ message: 'La fecha de regreso es requerida.' });

  try {
    const [result] = await db.promise().query(
      `INSERT INTO viaticos_diputados
         (diputado_id, motivo, lugar, destino_internacional, pais_destino,
          fecha_evento_inicio, fecha_evento_fin, fecha_salida, fecha_regreso,
          moneda, tasa_cambio, hospedaje, alimentacion, transporte, otros,
          estado, observaciones, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        parseInt(diputado_id),
        sanitize(motivo), sanitize(lugar),
        destino_internacional ? 1 : 0,
        pais_destino ? sanitize(pais_destino) : null,
        fecha_evento_inicio,
        fecha_evento_fin || null,
        fecha_salida, fecha_regreso,
        moneda === 'USD' ? 'USD' : 'HNL',
        parseFloat(tasa_cambio) || TASA_DEFAULT,
        parseFloat(hospedaje)    || 0,
        parseFloat(alimentacion) || 0,
        parseFloat(transporte)   || 0,
        parseFloat(otros)        || 0,
        ['pendiente','aprobado','liquidado','rechazado'].includes(estado) ? estado : 'pendiente',
        observaciones ? sanitize(observaciones) : null,
        req.user?.id || null,
      ]
    );
    const [newRow] = await db.promise().query(
      `SELECT vd.*, (vd.hospedaje+vd.alimentacion+vd.transporte+vd.otros) AS total_moneda,
              d.nombre AS diputado_nombre, d.tipo AS diputado_tipo, d.partido, d.departamento
       FROM viaticos_diputados vd JOIN diputados d ON d.id=vd.diputado_id
       WHERE vd.id = ?`, [result.insertId]
    );
    res.status(201).json(newRow[0]);
  } catch (err) {
    console.error('[viaticos-diputados] create:', err);
    res.status(500).json({ message: 'Error al crear el viático.' });
  }
};

// ──────────────────────────────────────────────────────────────
// PUT /api/viaticos-diputados/:id
// ──────────────────────────────────────────────────────────────
exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });

  const {
    diputado_id, motivo, lugar, destino_internacional, pais_destino,
    fecha_evento_inicio, fecha_evento_fin,
    fecha_salida, fecha_regreso,
    moneda, tasa_cambio,
    hospedaje, alimentacion, transporte, otros,
    estado, observaciones,
  } = req.body;

  try {
    const [exist] = await db.promise().query(
      'SELECT id FROM viaticos_diputados WHERE id = ?', [id]
    );
    if (!exist.length) return res.status(404).json({ message: 'Viático no encontrado.' });

    await db.promise().query(
      `UPDATE viaticos_diputados SET
         diputado_id = ?, motivo = ?, lugar = ?,
         destino_internacional = ?, pais_destino = ?,
         fecha_evento_inicio = ?, fecha_evento_fin = ?,
         fecha_salida = ?, fecha_regreso = ?,
         moneda = ?, tasa_cambio = ?,
         hospedaje = ?, alimentacion = ?, transporte = ?, otros = ?,
         estado = ?, observaciones = ?, updated_by = ?
       WHERE id = ?`,
      [
        parseInt(diputado_id),
        sanitize(motivo), sanitize(lugar),
        destino_internacional ? 1 : 0,
        pais_destino ? sanitize(pais_destino) : null,
        fecha_evento_inicio, fecha_evento_fin || null,
        fecha_salida, fecha_regreso,
        moneda === 'USD' ? 'USD' : 'HNL',
        parseFloat(tasa_cambio) || TASA_DEFAULT,
        parseFloat(hospedaje) || 0,
        parseFloat(alimentacion) || 0,
        parseFloat(transporte) || 0,
        parseFloat(otros) || 0,
        ['pendiente','aprobado','liquidado','rechazado'].includes(estado) ? estado : 'pendiente',
        observaciones ? sanitize(observaciones) : null,
        req.user?.id || null,
        id,
      ]
    );
    const [updated] = await db.promise().query(
      `SELECT vd.*, (vd.hospedaje+vd.alimentacion+vd.transporte+vd.otros) AS total_moneda,
              d.nombre AS diputado_nombre, d.tipo AS diputado_tipo, d.partido, d.departamento
       FROM viaticos_diputados vd JOIN diputados d ON d.id=vd.diputado_id
       WHERE vd.id = ?`, [id]
    );
    res.json(updated[0]);
  } catch (err) {
    console.error('[viaticos-diputados] update:', err);
    res.status(500).json({ message: 'Error al actualizar el viático.' });
  }
};

// ──────────────────────────────────────────────────────────────
// DELETE /api/viaticos-diputados/:id
// ──────────────────────────────────────────────────────────────
exports.remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });

  try {
    const [exist] = await db.promise().query(
      'SELECT id FROM viaticos_diputados WHERE id = ?', [id]
    );
    if (!exist.length) return res.status(404).json({ message: 'Viático no encontrado.' });

    await db.promise().query('DELETE FROM viaticos_diputados WHERE id = ?', [id]);
    res.json({ message: 'Viático eliminado correctamente.' });
  } catch (err) {
    console.error('[viaticos-diputados] remove:', err);
    res.status(500).json({ message: 'Error al eliminar el viático.' });
  }
};

// ──────────────────────────────────────────────────────────────
// GET /api/viaticos-diputados/resumen?anio=YYYY
// Estadísticas generales del año
// ──────────────────────────────────────────────────────────────
exports.getResumen = async (req, res) => {
  const anio = parseInt(req.query.anio || new Date().getFullYear(), 10);
  try {
    const [[stats]] = await db.promise().query(
      `SELECT
         COUNT(*)                                                  AS total_registros,
         SUM(hospedaje + alimentacion + transporte + otros)        AS total_hnl,
         SUM(CASE WHEN moneda='USD'
             THEN (hospedaje+alimentacion+transporte+otros)*tasa_cambio
             ELSE (hospedaje+alimentacion+transporte+otros) END)   AS total_hnl_equiv,
         SUM(hospedaje)    AS total_hospedaje,
         SUM(alimentacion) AS total_alimentacion,
         SUM(transporte)   AS total_transporte,
         SUM(otros)        AS total_otros,
         COUNT(CASE WHEN estado='pendiente'  THEN 1 END)          AS pendientes,
         COUNT(CASE WHEN estado='aprobado'   THEN 1 END)          AS aprobados,
         COUNT(CASE WHEN estado='liquidado'  THEN 1 END)          AS liquidados,
         COUNT(CASE WHEN estado='rechazado'  THEN 1 END)          AS rechazados
       FROM viaticos_diputados
       WHERE YEAR(fecha_salida) = ?`, [anio]
    );
    res.json(stats);
  } catch (err) {
    console.error('[viaticos-diputados] getResumen:', err);
    res.status(500).json({ message: 'Error al obtener el resumen.' });
  }
};
