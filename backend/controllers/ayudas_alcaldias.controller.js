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
    debitado, liquidado, fecha_liquidacion, partido, mes,
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
      debitado, liquidado, fecha_liquidacion, partido, mes, usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
    debitado, liquidado, fecha_liquidacion, partido, mes,
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
       debitado=?, liquidado=?, fecha_liquidacion=?, partido=?, mes=?
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
