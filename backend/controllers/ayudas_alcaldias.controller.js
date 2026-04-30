const db = require('../db');

const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN'];
const PARTIDOS    = ['PN', 'PL', 'LB', 'DC', 'PINU'];
const MESES       = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DATE_REGEX  = /^\d{4}-\d{2}-\d{2}$/;

// días transcurridos desde fecha_entrega → estado vencimiento (>= 30 = VENCIDO)
function calcEstado(row) {
  if (!row.fecha_entrega) return null;
  const diff = Math.floor((Date.now() - new Date(row.fecha_entrega).getTime()) / 86400000);
  return { dias: diff, vencido: diff >= 30 };
}

// ── GET all ───────────────────────────────────────────────────
exports.getAll = (req, res) => {
  db.query(
    `SELECT a.*, u.nombre AS registrado_por
     FROM ayudas_alcaldias a
     LEFT JOIN usuarios u ON u.id = a.usuario_id
     ORDER BY a.created_at DESC
     LIMIT 3000`,
    (err, rows) => {
      if (err) {
        console.error('[ayudas_alcaldias] getAll:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      const result = rows.map(r => {
        const est = calcEstado(r);
        return {
          ...r,
          dias_transcurridos: est ? est.dias : null,
          estado_vencimiento: est ? (est.vencido ? 'VENCIDO' : 'VIGENTE') : null,
        };
      });
      res.json(result);
    }
  );
};

// ── POST create ───────────────────────────────────────────────
exports.create = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para registrar.' });

  const {
    no_cheque, cuenta, beneficiario, departamento, orden_pago,
    descripcion, total, estado_entrega, fecha_entrega,
    debitado, liquidado, fecha_liquidacion, partido, mes, anio,
  } = req.body;

  // validaciones
  if (!(beneficiario || '').toString().trim())
    return res.status(400).json({ message: 'El beneficiario es requerido.' });
  if (!(departamento || '').toString().trim())
    return res.status(400).json({ message: 'El departamento es requerido.' });
  if (!(descripcion || '').toString().trim())
    return res.status(400).json({ message: 'La descripción es requerida.' });

  const tot = parseFloat(total);
  if (isNaN(tot) || tot <= 0)
    return res.status(400).json({ message: 'El monto debe ser mayor a cero.' });
  if (tot > 99999999)
    return res.status(400).json({ message: 'El monto excede el límite permitido.' });

  if (fecha_entrega && !DATE_REGEX.test(fecha_entrega))
    return res.status(400).json({ message: 'Formato de fecha de entrega inválido.' });
  if (fecha_liquidacion && !DATE_REGEX.test(fecha_liquidacion))
    return res.status(400).json({ message: 'Formato de fecha de liquidación inválido.' });
  if (partido && !PARTIDOS.includes(partido))
    return res.status(400).json({ message: 'Partido político no válido.' });

  db.query(
    `INSERT INTO ayudas_alcaldias
     (no_cheque, cuenta, beneficiario, departamento, orden_pago,
      descripcion, total, estado_entrega, fecha_entrega,
      debitado, liquidado, fecha_liquidacion, partido, mes, anio, usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      (no_cheque || '').trim() || null,
      (cuenta || '').trim() || null,
      beneficiario.toString().trim().toUpperCase(),
      departamento.toString().trim().toUpperCase(),
      (orden_pago || '').trim() || null,
      descripcion.toString().trim(),
      tot,
      estado_entrega === 'entregado' ? 'entregado' : 'pendiente',
      fecha_entrega || null,
      debitado ? 1 : 0,
      liquidado ? 1 : 0,
      fecha_liquidacion || null,
      partido || null,
      mes || null,
      anio ? parseInt(anio, 10) : null,
      req.user.id,
    ],
    (err, result) => {
      if (err) {
        console.error('[ayudas_alcaldias] create:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      res.status(201).json({ id: result.insertId, message: 'Registro creado correctamente.' });
    }
  );
};

// ── PUT update ────────────────────────────────────────────────
exports.update = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para editar.' });

  const { id } = req.params;
  const {
    no_cheque, cuenta, beneficiario, departamento, orden_pago,
    descripcion, total, estado_entrega, fecha_entrega,
    debitado, liquidado, fecha_liquidacion, partido, mes, anio,
  } = req.body;

  if (!(beneficiario || '').toString().trim())
    return res.status(400).json({ message: 'El beneficiario es requerido.' });
  if (!(departamento || '').toString().trim())
    return res.status(400).json({ message: 'El departamento es requerido.' });

  const tot = parseFloat(total);
  if (isNaN(tot) || tot <= 0)
    return res.status(400).json({ message: 'El monto debe ser mayor a cero.' });

  if (fecha_entrega && !DATE_REGEX.test(fecha_entrega))
    return res.status(400).json({ message: 'Formato de fecha de entrega inválido.' });
  if (fecha_liquidacion && !DATE_REGEX.test(fecha_liquidacion))
    return res.status(400).json({ message: 'Formato de fecha de liquidación inválido.' });
  if (partido && !PARTIDOS.includes(partido))
    return res.status(400).json({ message: 'Partido político no válido.' });

  db.query(
    `UPDATE ayudas_alcaldias SET
       no_cheque=?, cuenta=?, beneficiario=?, departamento=?, orden_pago=?,
       descripcion=?, total=?, estado_entrega=?, fecha_entrega=?,
       debitado=?, liquidado=?, fecha_liquidacion=?, partido=?, mes=?, anio=?
     WHERE id=?`,
    [
      (no_cheque || '').trim() || null,
      (cuenta || '').trim() || null,
      beneficiario.toString().trim().toUpperCase(),
      departamento.toString().trim().toUpperCase(),
      (orden_pago || '').trim() || null,
      (descripcion || '').toString().trim(),
      tot,
      estado_entrega === 'entregado' ? 'entregado' : 'pendiente',
      fecha_entrega || null,
      debitado ? 1 : 0,
      liquidado ? 1 : 0,
      fecha_liquidacion || null,
      partido || null,
      mes || null,
      anio ? parseInt(anio, 10) : null,
      id,
    ],
    (err) => {
      if (err) {
        console.error('[ayudas_alcaldias] update:', err);
        return res.status(500).json({ message: 'Error interno del servidor.' });
      }
      res.json({ message: 'Registro actualizado correctamente.' });
    }
  );
};

// ── GET resumen mapa ──────────────────────────────────────────
exports.resumenMapa = (req, res) => {
  const anio      = req.query.anio       ? parseInt(req.query.anio, 10)       : null;
  const mes       = req.query.mes        || null;
  const anioComp  = req.query.anio_comp  ? parseInt(req.query.anio_comp, 10)  : null;

  const params = [];
  const wheres = [];
  if (anio) { wheres.push('YEAR(a.created_at) = ?'); params.push(anio); }
  if (mes)  { wheres.push('a.mes = ?');               params.push(mes);  }
  const whereSQL = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';

  const sqlDepartamentos = `
    SELECT
      a.departamento,
      COUNT(*)                                                    AS cantidad,
      COALESCE(SUM(a.total), 0)                                   AS total_monto,
      COALESCE(SUM(CASE WHEN a.estado_entrega='entregado' THEN a.total ELSE 0 END), 0) AS monto_entregado,
      COALESCE(SUM(CASE WHEN a.estado_entrega='pendiente' THEN a.total ELSE 0 END), 0) AS monto_pendiente,
      COALESCE(SUM(CASE WHEN a.liquidado=1 THEN a.total ELSE 0 END), 0)               AS monto_liquidado,
      COALESCE(SUM(CASE WHEN a.debitado=1  THEN a.total ELSE 0 END), 0)               AS monto_debitado,
      COUNT(CASE WHEN a.estado_entrega='pendiente' AND DATEDIFF(NOW(), a.created_at) > 30 THEN 1 END) AS atrasados
    FROM ayudas_alcaldias a
    ${whereSQL}
    GROUP BY a.departamento
    ORDER BY total_monto DESC`;

  const sqlPartidos = `
    SELECT
      COALESCE(a.partido, 'SIN PARTIDO') AS partido,
      COUNT(*)                           AS cantidad,
      COALESCE(SUM(a.total), 0)          AS total_monto
    FROM ayudas_alcaldias a
    ${whereSQL}
    GROUP BY a.partido
    ORDER BY total_monto DESC`;

  const sqlKpis = `
    SELECT
      COUNT(*)                                                                              AS total_registros,
      COALESCE(SUM(a.total), 0)                                                             AS total_monto,
      SUM(CASE WHEN a.estado_entrega='pendiente' THEN 1 ELSE 0 END)                        AS total_pendientes,
      SUM(CASE WHEN a.estado_entrega='pendiente' AND DATEDIFF(NOW(), a.created_at) > 30 THEN 1 ELSE 0 END) AS atrasados_30,
      SUM(CASE WHEN a.liquidado=1 THEN 1 ELSE 0 END)                                       AS liquidados,
      COALESCE(SUM(CASE WHEN a.liquidado=1 THEN a.total ELSE 0 END), 0)                    AS monto_liquidado_total
    FROM ayudas_alcaldias a
    ${whereSQL}`;

  const sqlTendencia = `
    SELECT
      a.mes,
      COUNT(*)                  AS cantidad,
      COALESCE(SUM(a.total), 0) AS total_monto
    FROM ayudas_alcaldias a
    ${whereSQL}
    GROUP BY a.mes`;

  // Top alcaldías (beneficiarios) por monto
  const sqlAlcaldias = `
    SELECT
      a.beneficiario                                                                        AS alcaldia,
      a.departamento,
      COUNT(*)                                                                              AS cantidad,
      COALESCE(SUM(a.total), 0)                                                             AS total_monto,
      COUNT(CASE WHEN a.estado_entrega='pendiente' AND DATEDIFF(NOW(), a.created_at) > 30 THEN 1 END) AS atrasados
    FROM ayudas_alcaldias a
    ${whereSQL}
    GROUP BY a.beneficiario, a.departamento
    ORDER BY total_monto DESC
    LIMIT 50`;

  // Comparativa año anterior o año seleccionado
  const compParams = [];
  const compWheres = [];
  if (anioComp) {
    compWheres.push('YEAR(a.created_at) = ?'); compParams.push(anioComp);
  } else if (anio) {
    compWheres.push('YEAR(a.created_at) = ?'); compParams.push(anio - 1);
  }
  if (mes) { compWheres.push('a.mes = ?'); compParams.push(mes); }
  const compWhereSQL = compWheres.length ? 'WHERE ' + compWheres.join(' AND ') : '';

  const sqlComparativa = `
    SELECT
      a.mes,
      COUNT(*)                  AS cantidad,
      COALESCE(SUM(a.total), 0) AS total_monto
    FROM ayudas_alcaldias a
    ${compWhereSQL}
    GROUP BY a.mes`;

  db.query(sqlDepartamentos, params, (err, deptos) => {
    if (err) { console.error('[mapa] deptos:', err); return res.status(500).json({ message: 'Error interno.' }); }
    db.query(sqlPartidos, params, (err2, partidos) => {
      if (err2) { console.error('[mapa] partidos:', err2); return res.status(500).json({ message: 'Error interno.' }); }
      db.query(sqlKpis, params, (err3, kpisRows) => {
        if (err3) { console.error('[mapa] kpis:', err3); return res.status(500).json({ message: 'Error interno.' }); }
        db.query(sqlTendencia, params, (err4, tendencia) => {
          if (err4) { console.error('[mapa] tendencia:', err4); return res.status(500).json({ message: 'Error interno.' }); }
          db.query(sqlAlcaldias, params, (err5, alcaldias) => {
            if (err5) { console.error('[mapa] alcaldias:', err5); return res.status(500).json({ message: 'Error interno.' }); }
            db.query(sqlComparativa, compParams, (err6, comparativa) => {
              if (err6) { console.error('[mapa] comparativa:', err6); return res.status(500).json({ message: 'Error interno.' }); }
              res.json({
                departamentos: deptos,
                partidos,
                kpis: kpisRows[0] || {},
                tendencia,
                alcaldias,
                comparativa,
                anioComp: anioComp || (anio ? anio - 1 : null),
              });
            });
          });
        });
      });
    });
  });
};

// ── DELETE ────────────────────────────────────────────────────
exports.remove = (req, res) => {
  if (!ROLES_ADMIN.includes(req.user.rol))
    return res.status(403).json({ message: 'No tiene permisos para eliminar.' });

  db.query('DELETE FROM ayudas_alcaldias WHERE id=?', [req.params.id], (err) => {
    if (err) {
      console.error('[ayudas_alcaldias] remove:', err);
      return res.status(500).json({ message: 'Error interno del servidor.' });
    }
    res.json({ message: 'Registro eliminado correctamente.' });
  });
};
