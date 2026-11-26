const db = require('../db');
const { logEvent, getClientIP } = require('../middleware/audit');

function sanitize(str) { return (str || '').toString().trim(); }

// Gastos adicionales del resumen (otros, reembolso de boleto aéreo…), en dólares: [{ descripcion, monto }]
function normResumen(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 10)
    .map(r => ({
      descripcion: sanitize(r?.descripcion).toUpperCase().slice(0, 200) || 'OTROS',
      monto: Math.round((parseFloat(r?.monto) || 0) * 100) / 100,
    }))
    .filter(r => r.monto > 0);
}
function parseResumen(txt) {
  try { const a = JSON.parse(txt || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
// Antes de guardar se comprueba que existan las columnas, para no dejar un viático guardado a medias
function revisarColumnas(body, res, seguir) {
  const pruebas = [];
  if (normResumen(body.detalle_resumen).length) pruebas.push(['detalle_resumen', 'viaticos']);
  if (Array.isArray(body.detalle) && traeDiasPorRenglon(body.detalle)) pruebas.push(['dias', 'viaticos_detalle']);
  const probar = (i) => {
    if (i >= pruebas.length) return seguir();
    const [columna, tabla] = pruebas[i];
    db.query(`SELECT ${columna} FROM ${tabla} LIMIT 0`, (e) => {
      if (!e) return probar(i + 1);
      console.error(`[viaticos] columna ${tabla}.${columna}:`, e.message);
      res.status(500).json({ message: e.code === 'ER_BAD_FIELD_ERROR'
        ? `Falta crear la columna ${columna} en la tabla ${tabla}.` : 'Error al guardar el viático.' });
    });
  };
  probar(0);
}
// Solo se actualiza si el formulario envió el resumen (una pantalla antigua en caché no lo borra)
function guardarResumen(id, body, cb) {
  if (!Array.isArray(body.detalle_resumen)) return cb(null);
  const filas = normResumen(body.detalle_resumen);
  db.query('UPDATE viaticos SET detalle_resumen = ? WHERE id = ?', [filas.length ? JSON.stringify(filas) : null, id],
    (e) => cb(e && !(e.code === 'ER_BAD_FIELD_ERROR' && !filas.length) ? e : null));
}

// Montos por día de un renglón del detalle: [{ fecha, monto }]
function normDias(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 366)
    .map(d => ({ fecha: sanitize(d?.fecha).slice(0, 10), monto: Math.max(0, Math.round((parseFloat(d?.monto) || 0) * 100) / 100) }))
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.fecha));
}
const traeDiasPorRenglon = detalle => detalle.some(r => Array.isArray(r?.dias));
// Los días de viaje (de donde sale el total) son la suma de todos los renglones en cada fecha
function diasDeViaje(detalle, dias) {
  if (!traeDiasPorRenglon(detalle)) return dias;
  const suma = new Map();
  detalle.forEach(r => normDias(r.dias).forEach(d => suma.set(d.fecha, (suma.get(d.fecha) || 0) + d.monto)));
  return [...suma].sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, monto]) => ({ fecha, monto: Math.round(monto * 100) / 100, tipo: 'viaje' }));
}
// Inserta los renglones uno tras otro para conservar su orden
function insertarDetalle(viaticoId, detalle) {
  return detalle.slice(0, 30).reduce((cadena, row) => cadena.then(() => new Promise((resolve, reject) => {
    const conDias = Array.isArray(row.dias);
    const valores = [viaticoId, sanitize(row.nombre), sanitize(row.cargo), sanitize(row.detalle) || 'ALIMENTACION Y HOSPEDAJE'];
    if (conDias) valores.push(JSON.stringify(normDias(row.dias)));
    db.query(
      `INSERT INTO viaticos_detalle (viatico_id, nombre, cargo, detalle${conDias ? ', dias' : ''}) VALUES (?,?,?,?${conDias ? ',?' : ''})`,
      valores, (e) => e ? reject(e) : resolve()
    );
  })), Promise.resolve());
}

// Inserta un día con tipo si la columna ya existe; si no (migración pendiente),
// inserta sin tipo para no bloquear la app.
function insertDia(viatico_id, d, cb) {
  const monto = parseFloat(d.monto) || 0;
  const tipo  = d.tipo || 'viaje';
  db.query(
    'INSERT INTO viaticos_dias (viatico_id, fecha, monto, tipo) VALUES (?,?,?,?)',
    [viatico_id, d.fecha, monto, tipo],
    (e) => {
      if (!e) return cb(null);
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        // La columna tipo aún no existe → ejecutar migrate_viaticos_v2.sql
        db.query(
          'INSERT INTO viaticos_dias (viatico_id, fecha, monto) VALUES (?,?,?)',
          [viatico_id, d.fecha, monto],
          cb
        );
      } else {
        cb(e);
      }
    }
  );
}

// ── Tipo de cambio oficial (Banco Central de Honduras) ─────────────
// Lista pública del BCH con el tipo de cambio de referencia (valor de compra).
// El precio de venta es la referencia + 0.5 %, igual al que publican los bancos.
const BCH_TCR_URL =
  "https://www.bch.hn/_api/web/lists(guid'08a9876c-c6f1-4e73-8d13-0039b0442fab')/items" +
  '?$select=Fecha,Valor&$orderby=Fecha%20desc&$top=1';
const TC_CACHE_MS = 30 * 60 * 1000;
let tcCache = null; // { at, data }

// GET /api/viaticos/tipo-cambio — tipo de cambio USD/HNL del BCH
exports.getTipoCambio = async (req, res) => {
  if (tcCache && Date.now() - tcCache.at < TC_CACHE_MS) return res.json(tcCache.data);
  try {
    const r = await fetch(BCH_TCR_URL, {
      headers: { Accept: 'application/json;odata=nometadata', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`BCH respondió ${r.status}`);
    const item = (await r.json()).value?.[0];
    const compra = Number(item?.Valor);
    if (!compra) throw new Error('Respuesta del BCH sin valor.');
    const data = {
      fecha: String(item.Fecha).substring(0, 10),
      compra: Math.round(compra * 10000) / 10000,
      venta:  Math.round(compra * 1.005 * 10000) / 10000,
      fuente: 'Banco Central de Honduras',
    };
    tcCache = { at: Date.now(), data };
    res.json(data);
  } catch (err) {
    console.error('[viaticos] tipo de cambio BCH:', err.message);
    if (tcCache) return res.json(tcCache.data); // último valor conocido
    res.status(502).json({ message: 'No se pudo obtener el tipo de cambio del BCH.' });
  }
};

// GET /api/viaticos/diputado/:identidad — buscar diputado por DNI
exports.getByDNI = (req, res) => {
  const identidad = sanitize(req.params.identidad);
  if (!identidad) return res.status(400).json({ message: 'DNI requerido.' });

  db.query(
    `SELECT id, nombre, tipo, cargo_display, identidad, departamento, partido
     FROM (
       SELECT id, nombre, tipo,
         CONCAT('DIPUTADO ', tipo) AS cargo_display,
         identidad, departamento, partido
       FROM diputados
       WHERE identidad = ? AND activo = 1
     ) t LIMIT 1`,
    [identidad],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Error al buscar diputado.' });
      if (!rows.length) return res.status(404).json({ message: 'Diputado no encontrado.' });
      res.json(rows[0]);
    }
  );
};

// GET /api/viaticos — listar todos
exports.getAll = (req, res) => {
  db.query(
    `SELECT v.*, d.nombre AS diputado_nombre, d.tipo AS diputado_tipo,
            u.nombre AS elaborado_por_nombre
     FROM viaticos v
     JOIN diputados d ON v.diputado_id = d.id
     JOIN usuarios  u ON v.creado_por  = u.id
     ORDER BY v.creado_en DESC LIMIT 200`,
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Error al obtener viáticos.' });
      res.json(rows);
    }
  );
};

// GET /api/viaticos/:id — obtener uno completo (con detalle y días)
exports.getOne = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });

  db.query(
    `SELECT v.*, d.nombre AS diputado_nombre, d.tipo AS diputado_tipo,
            d.identidad, d.departamento, d.partido, d.telefono,
            u.nombre AS elaborado_por_nombre
     FROM viaticos v
     JOIN diputados d ON v.diputado_id = d.id
     JOIN usuarios  u ON v.creado_por  = u.id
     WHERE v.id = ?`,
    [id],
    (err, rows) => {
      if (err || !rows.length) return res.status(404).json({ message: 'Viático no encontrado.' });
      const viatico = rows[0];

      db.query('SELECT * FROM viaticos_detalle WHERE viatico_id = ? ORDER BY id', [id], (e2, detalle) => {
        if (e2) return res.status(500).json({ message: 'Error al obtener detalle.' });

        db.query('SELECT * FROM viaticos_dias WHERE viatico_id = ? ORDER BY tipo, fecha', [id], (e3, dias) => {
          if (e3) return res.status(500).json({ message: 'Error al obtener días.' });
          const dias_viaje   = dias.filter(d => d.tipo === 'viaje'   || !d.tipo);
          const dias_estadia = dias.filter(d => d.tipo === 'estadia');
          res.json({
            ...viatico,
            detalle: detalle.map(r => ({ ...r, dias: parseResumen(r.dias) })),
            dias_viaje, dias_estadia, detalle_resumen: parseResumen(viatico.detalle_resumen),
          });
        });
      });
    }
  );
};

// POST /api/viaticos — crear
exports.create = (req, res) => {
  const motivo_viaje  = sanitize(req.body.motivo_viaje);
  const lugar         = sanitize(req.body.lugar);
  const diputado_id   = parseInt(req.body.diputado_id, 10);
  const fecha_inicio  = sanitize(req.body.fecha_inicio);
  const fecha_fin     = sanitize(req.body.fecha_fin);
  const cargo         = sanitize(req.body.cargo);
  const tasa_cambio   = parseFloat(req.body.tasa_cambio) || 1;
  const nota1         = sanitize(req.body.nota1);
  const nota2         = sanitize(req.body.nota2);
  const obs_detalle   = sanitize(req.body.obs_detalle);
  const detalle       = Array.isArray(req.body.detalle) ? req.body.detalle : [];
  const dias          = Array.isArray(req.body.dias)    ? req.body.dias    : [];

  const periodo_dias = parseFloat(req.body.periodo_dias);

  if (!motivo_viaje || !lugar || isNaN(diputado_id) || !fecha_inicio || !fecha_fin || !cargo)
    return res.status(400).json({ message: 'Faltan campos requeridos.' });
  if (isNaN(periodo_dias) || periodo_dias <= 0)
    return res.status(400).json({ message: 'El período de tiempo es requerido.' });

  const afterInsert = (vId) => {
      const diasPromises = diasDeViaje(detalle, dias).map(d => new Promise((resolve, reject) =>
        insertDia(vId, d, (e) => e ? reject(e) : resolve())
      ));
      const resumenPromise = new Promise((resolve, reject) =>
        guardarResumen(vId, req.body, (e) => e ? reject(e) : resolve())
      );
      Promise.all([insertarDetalle(vId, detalle), ...diasPromises, resumenPromise])
        .then(() => {
          logEvent({ usuario_id: req.user.id, usuario_nombre: req.user.nombre || null, accion: 'CREAR', modulo: 'viaticos', detalle: `Creó viático — ${motivo_viaje}, ${lugar}`, ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO' });
          res.status(201).json({ message: 'Viático creado.', id: vId });
        })
        .catch((e) => { console.error('[viaticos] Error al guardar detalles al crear:', e); res.status(500).json({ message: e.message }); });
  };

  revisarColumnas(req.body, res, () => db.query(
    `INSERT INTO viaticos (motivo_viaje, lugar, diputado_id, periodo_dias, fecha_inicio, fecha_fin,
       cargo, tasa_cambio, nota1, nota2, obs_detalle, creado_por)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [motivo_viaje, lugar, diputado_id, periodo_dias, fecha_inicio, fecha_fin,
     cargo, tasa_cambio, nota1, nota2, obs_detalle, req.user.id],
    (err, result) => {
      if (err && err.code === 'ER_BAD_FIELD_ERROR') {
        // columna obs_detalle aún no existe en producción → reintentar sin ella
        db.query(
          `INSERT INTO viaticos (motivo_viaje, lugar, diputado_id, periodo_dias, fecha_inicio, fecha_fin,
             cargo, tasa_cambio, nota1, nota2, creado_por)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [motivo_viaje, lugar, diputado_id, periodo_dias, fecha_inicio, fecha_fin,
           cargo, tasa_cambio, nota1, nota2, req.user.id],
          (e2, r2) => { if (e2) return res.status(500).json({ message: e2.message }); afterInsert(r2.insertId); }
        );
        return;
      }
      if (err) return res.status(500).json({ message: err.message });
      afterInsert(result.insertId);
    }
  ));
};

// DELETE /api/viaticos/:id
exports.remove = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });
  db.query('DELETE FROM viaticos WHERE id = ?', [id], (err, r) => {
    if (err) return res.status(500).json({ message: 'Error al eliminar.' });
    if (!r.affectedRows) return res.status(404).json({ message: 'No encontrado.' });
    logEvent({ usuario_id: req.user.id, usuario_nombre: req.user.nombre || null, accion: 'ELIMINAR', modulo: 'viaticos', detalle: `Eliminó viático ID #${id}`, ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO' });
    res.json({ message: 'Viático eliminado.' });
  });
};

// PUT /api/viaticos/:id — editar
exports.update = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });

  const motivo_viaje = sanitize(req.body.motivo_viaje);
  const lugar        = sanitize(req.body.lugar);
  const diputado_id  = parseInt(req.body.diputado_id, 10);
  const fecha_inicio = sanitize(req.body.fecha_inicio);
  const fecha_fin    = sanitize(req.body.fecha_fin);
  const cargo        = sanitize(req.body.cargo);
  const tasa_cambio  = parseFloat(req.body.tasa_cambio) || 1;
  const nota1        = sanitize(req.body.nota1);
  const nota2        = sanitize(req.body.nota2);
  const obs_detalle  = sanitize(req.body.obs_detalle);
  const detalle      = Array.isArray(req.body.detalle) ? req.body.detalle : [];
  const dias         = Array.isArray(req.body.dias)    ? req.body.dias    : [];

  const periodo_dias = parseFloat(req.body.periodo_dias);

  if (!motivo_viaje || !lugar || isNaN(diputado_id) || !fecha_inicio || !fecha_fin || !cargo)
    return res.status(400).json({ message: 'Faltan campos requeridos.' });
  if (isNaN(periodo_dias) || periodo_dias <= 0)
    return res.status(400).json({ message: 'El período de tiempo es requerido.' });

  revisarColumnas(req.body, res, () => db.query(
    `UPDATE viaticos SET motivo_viaje=?, lugar=?, diputado_id=?, periodo_dias=?,
       fecha_inicio=?, fecha_fin=?, cargo=?, tasa_cambio=?, nota1=?, nota2=?, obs_detalle=?
     WHERE id=?`,
    [motivo_viaje, lugar, diputado_id, periodo_dias, fecha_inicio, fecha_fin,
     cargo, tasa_cambio, nota1, nota2, obs_detalle, id],
    (err, r) => {
      if (err && err.code === 'ER_BAD_FIELD_ERROR') {
        // columna obs_detalle aún no existe en producción → reintentar sin ella
        db.query(
          `UPDATE viaticos SET motivo_viaje=?, lugar=?, diputado_id=?, periodo_dias=?,
             fecha_inicio=?, fecha_fin=?, cargo=?, tasa_cambio=?, nota1=?, nota2=?
           WHERE id=?`,
          [motivo_viaje, lugar, diputado_id, periodo_dias, fecha_inicio, fecha_fin,
           cargo, tasa_cambio, nota1, nota2, id],
          (e2, r2) => { if (e2) return res.status(500).json({ message: e2.message }); continueUpdate(r2); }
        );
        return;
      }
      if (err) return res.status(500).json({ message: 'Error al actualizar viático.' });
      continueUpdate(r);
    }
  ));

  // El formulario ya no maneja estadía: se conservan los días de estadía guardados anteriormente
  function borrarDias(cb) {
    const todos = () => db.query('DELETE FROM viaticos_dias WHERE viatico_id = ?', [id], cb);
    if (dias.some(d => d.tipo === 'estadia')) return todos();
    db.query("DELETE FROM viaticos_dias WHERE viatico_id = ? AND (tipo IS NULL OR tipo <> 'estadia')", [id],
      (e) => (e && e.code === 'ER_BAD_FIELD_ERROR' ? todos() : cb(e)));
  }

  function continueUpdate(r) {
      if (!r.affectedRows) return res.status(404).json({ message: 'Viático no encontrado.' });

      // Reemplazar detalle y días
      db.query('DELETE FROM viaticos_detalle WHERE viatico_id = ?', [id], (e1) => {
        if (e1) return res.status(500).json({ message: 'Error al actualizar detalle.' });
        borrarDias((e2) => {
          if (e2) return res.status(500).json({ message: 'Error al actualizar días.' });

          const diasP = diasDeViaje(detalle, dias).map(d => new Promise((resolve, reject) =>
            insertDia(id, d, (e) => e ? reject(e) : resolve())
          ));

          const resumenP = new Promise((resolve, reject) =>
            guardarResumen(id, req.body, (e) => e ? reject(e) : resolve())
          );

          Promise.all([insertarDetalle(id, detalle), ...diasP, resumenP])
            .then(() => {
              logEvent({ usuario_id: req.user.id, usuario_nombre: req.user.nombre || null, accion: 'ACTUALIZAR', modulo: 'viaticos', detalle: `Actualizó viático ID #${id} — ${motivo_viaje}`, ip: getClientIP(req), metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO' });
              res.json({ message: 'Viático actualizado.' });
            })
            .catch((e) => { console.error('[viaticos] Error al guardar detalles al actualizar:', e); res.status(500).json({ message: 'Error al guardar detalles.' }); });
        });
      });
  }
};
