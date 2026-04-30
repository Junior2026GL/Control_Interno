const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
let cron;
try { cron = require('node-cron'); } catch { cron = null; }
const { logEvent } = require('../middleware/audit');

const SPAWN_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — kills hung mysqldump/mysql

// Resolve mysql / mysqldump executables (handles Windows PATH issues)
function resolveBin(name) {
  const bin = process.env.MYSQL_BIN;
  if (bin) return path.join(bin, process.platform === 'win32' ? `${name}.exe` : name);
  return name;
}

// ── Config persistence ────────────────────────────────────────
const CONFIG_DIR  = path.join(__dirname, '../config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'backup-config.json');

function getDefaultConfig() {
  return {
    enabled:       false,
    frequency:     'daily',
    time:          '02:00',
    dayOfWeek:     1,
    dayOfMonth:    1,
    savePath:      path.join(__dirname, '../backups'),
    retentionDays: 30,
    lastBackup:    null,
  };
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch { /* fall through */ }
  return getDefaultConfig();
}

function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ── Retention: delete backups older than retentionDays ────────
function pruneOldBackups() {
  const cfg = loadConfig();
  const days = parseInt(cfg.retentionDays, 10);
  if (!days || days <= 0) return;
  const savePath = cfg.savePath;
  if (!fs.existsSync(savePath)) return;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  try {
    fs.readdirSync(savePath)
      .filter(f => f.toLowerCase().endsWith('.sql'))
      .forEach(f => {
        const fp = path.join(savePath, f);
        const mtime = fs.statSync(fp).mtime.getTime();
        if (mtime < cutoff) {
          fs.unlink(fp, err => {
            if (!err) console.log(`[DB-Retention] Deleted old backup: ${f}`);
          });
        }
      });
  } catch (err) {
    console.error('[DB-Retention] Error during pruning:', err.message);
  }
}

// ── Scheduler ────────────────────────────────────────────────
let cronJob = null;

function buildCronExpression(config) {
  const parts  = (config.time || '02:00').split(':');
  const hour   = parseInt(parts[0], 10)  || 0;
  const minute = parseInt(parts[1], 10)  || 0;
  switch (config.frequency) {
    case 'weekly':  return `${minute} ${hour} * * ${config.dayOfWeek  ?? 1}`;
    case 'monthly': return `${minute} ${hour} ${config.dayOfMonth ?? 1} * *`;
    default:        return `${minute} ${hour} * * *`;  // daily
  }
}

function startScheduler(config) {
  if (cronJob) { cronJob.stop(); cronJob = null; }
  if (!cron || !config.enabled) return;

  const expression = buildCronExpression(config);
  if (!cron.validate(expression)) {
    console.error('[DB-Scheduler] Invalid cron expression:', expression);
    return;
  }

  cronJob = cron.schedule(expression, async () => {
    console.log('[DB-Scheduler] Running scheduled backup…');
    try {
      const result = await performBackup();
      const cfg = loadConfig();
      saveConfig({ ...cfg, lastBackup: new Date().toISOString() });
      pruneOldBackups();
      console.log('[DB-Scheduler] Backup completed:', result.filename);

      // Notificación de éxito
      const alertEmail = process.env.ALERT_EMAIL;
      if (alertEmail) {
        try {
          const mailer = require('../config/mailer');
          const sizeBytes = fs.existsSync(result.filePath)
            ? fs.statSync(result.filePath).size
            : 0;
          await mailer.sendBackupSuccess(alertEmail, result.filename, sizeBytes);
        } catch (mailErr) {
          console.error('[DB-Scheduler] Failed to send success email:', mailErr.message);
        }
      }
    } catch (err) {
      console.error('[DB-Scheduler] Backup failed:', err.message);

      // Notificación de fallo
      const alertEmail = process.env.ALERT_EMAIL;
      if (alertEmail) {
        try {
          const mailer = require('../config/mailer');
          const cfg = loadConfig();
          await mailer.sendBackupFailure(alertEmail, err.message, cfg.lastBackup || null);
        } catch (mailErr) {
          console.error('[DB-Scheduler] Failed to send failure email:', mailErr.message);
        }
      }
    }
  });

  console.log(`[DB-Scheduler] Started (${expression})`);
}

// Boot-time init
startScheduler(loadConfig());

// ── Filename builder ─────────────────────────────────────────
// safeForFs = true  → 12-30  (colons not allowed on Windows filesystems)
// safeForFs = false → 12:30  (used in Content-Disposition for browser downloads)
function buildFilename(safeForFs) {
  const now  = new Date();
  const dd   = String(now.getDate()).padStart(2, '0');
  const mo   = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh   = String(now.getHours()).padStart(2, '0');
  const min  = String(now.getMinutes()).padStart(2, '0');
  const sep  = safeForFs ? '-' : ':';
  return `${process.env.DB_NAME} ${dd}_${mo}_${yyyy}_${hh}${sep}${min}.sql`;
}

// ── Core backup logic ─────────────────────────────────────────
function performBackup() {
  const cfg = loadConfig();
  const savePath = cfg.savePath;

  if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });

  const filename = buildFilename(true);   // safe chars for filesystem
  const filePath = path.join(savePath, filename);

  return new Promise((resolve, reject) => {
    const args = [
      `--host=${process.env.DB_HOST}`,
      `--user=${process.env.DB_USER}`,
      `--password=${process.env.DB_PASSWORD}`,
      '--databases',
      process.env.DB_NAME,
    ];

    const child = spawn(resolveBin('mysqldump'), args, { shell: false });
    const ws = fs.createWriteStream(filePath);
    child.stdout.pipe(ws);

    let exitCode = null;
    let wsFinished = false;
    let childClosed = false;
    let errMsg = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, SPAWN_TIMEOUT_MS);

    function tryResolve() {
      if (!wsFinished || !childClosed) return;
      clearTimeout(timer);
      if (timedOut) {
        fs.unlink(filePath, () => {});
        return reject(new Error('Timeout: mysqldump superó 5 minutos'));
      }
      if (exitCode !== 0) {
        fs.unlink(filePath, () => {});
        return reject(new Error(errMsg || `mysqldump exited with code ${exitCode}`));
      }
      resolve({ filename, filePath });
    }

    child.stderr.on('data', d => { errMsg += d.toString(); });
    ws.on('finish', () => { wsFinished = true; tryResolve(); });
    child.on('close', code => { exitCode = code; childClosed = true; tryResolve(); });
    child.on('error', err => { clearTimeout(timer); fs.unlink(filePath, () => {}); reject(err); });
  });
}

// ── Route handlers ────────────────────────────────────────────

exports.getConfig = (_req, res) => {
  res.json(loadConfig());
};

exports.saveConfig = (req, res) => {
  const { enabled, frequency, time, dayOfWeek, dayOfMonth, savePath, retentionDays } = req.body;
  const current = loadConfig();
  const updated = {
    ...current,
    enabled:       Boolean(enabled),
    frequency:     ['daily','weekly','monthly'].includes(frequency) ? frequency : current.frequency,
    time:          time       || current.time,
    dayOfWeek:     dayOfWeek  != null ? Number(dayOfWeek)  : current.dayOfWeek,
    dayOfMonth:    dayOfMonth != null ? Number(dayOfMonth) : current.dayOfMonth,
    savePath:      savePath   || current.savePath,
    retentionDays: retentionDays != null
      ? (parseInt(retentionDays, 10) === 0 ? 0 : Math.max(1, parseInt(retentionDays, 10) || 30))
      : (current.retentionDays ?? 30),
  };
  saveConfig(updated);
  startScheduler(updated);
  const usuario = req.user || {};
  logEvent({
    usuario_id: usuario.id || null,
    usuario_nombre: usuario.nombre || null,
    accion: 'ACTUALIZAR',
    modulo: 'BASE_DATOS',
    detalle: `Configuración guardada: ${updated.frequency} a las ${updated.time} (${updated.enabled ? 'habilitado' : 'deshabilitado'})`,
    ip: req.ip || '?',
    metodo: req.method,
    ruta: req.originalUrl,
    resultado: 'EXITO',
  });
  res.json({ message: 'Configuración guardada', config: updated });
};

exports.manualBackup = async (req, res) => {
  const usuario = req.user || {};
  const ip = req.ip || '?';
  try {
    const result = await performBackup();
    const cfg = loadConfig();
    saveConfig({ ...cfg, lastBackup: new Date().toISOString() });
    pruneOldBackups();
    logEvent({
      usuario_id: usuario.id || null,
      usuario_nombre: usuario.nombre || null,
      accion: 'CREAR',
      modulo: 'BASE_DATOS',
      detalle: `Backup manual creado: ${result.filename}`,
      ip,
      metodo: req.method,
      ruta: req.originalUrl,
      resultado: 'EXITO',
    });
    // Save to configured path AND stream back to browser for direct download
    const fileSize = fs.statSync(result.filePath).size;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', fileSize);
    const readStream = fs.createReadStream(result.filePath);
    readStream.pipe(res);
    readStream.on('error', err => {
      if (!res.headersSent) res.status(500).json({ message: 'Error al leer el backup', error: err.message });
    });
  } catch (err) {
    logEvent({
      usuario_id: usuario.id || null,
      usuario_nombre: usuario.nombre || null,
      accion: 'CREAR',
      modulo: 'BASE_DATOS',
      detalle: `Error en backup manual: ${err.message}`,
      ip,
      metodo: req.method,
      ruta: req.originalUrl,
      resultado: 'FALLO',
    });
    if (!res.headersSent) res.status(500).json({ message: 'Error al crear backup', error: err.message });
  }
};

exports.exportDB = (req, res) => {
  const dlFilename  = buildFilename(false);  // colons ok in Content-Disposition
  const tmpFilename = buildFilename(true);   // safe chars for filesystem
  const tmpPath     = path.join(require('os').tmpdir(), tmpFilename);
  const usuario     = req.user || {};
  const ip          = req.ip || '?';

  const args = [
    `--host=${process.env.DB_HOST}`,
    `--user=${process.env.DB_USER}`,
    `--password=${process.env.DB_PASSWORD}`,
    '--databases',
    process.env.DB_NAME,
  ];

  const child = spawn(resolveBin('mysqldump'), args, { shell: false });
  const ws    = fs.createWriteStream(tmpPath);
  child.stdout.pipe(ws);

  let exitCode = null;
  let wsFinished = false;
  let childClosed = false;
  let errMsg = '';
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
  }, SPAWN_TIMEOUT_MS);

  function finish() {
    if (!wsFinished || !childClosed) return;
    clearTimeout(timer);

    if (timedOut) {
      fs.unlink(tmpPath, () => {});
      if (!res.headersSent)
        return res.status(500).json({ message: 'Timeout: la exportación superó 5 minutos' });
      return;
    }

    const fileSize = (() => { try { return fs.statSync(tmpPath).size; } catch { return 0; } })();

    if (exitCode !== 0 || fileSize < 100) {
      fs.unlink(tmpPath, () => {});
      const detail = errMsg.trim() || `mysqldump terminó con código ${exitCode}`;
      logEvent({ usuario_id: usuario.id || null, usuario_nombre: usuario.nombre || null,
        accion: 'CREAR', modulo: 'BASE_DATOS', detalle: `Error en exportación: ${detail}`,
        ip, metodo: req.method, ruta: req.originalUrl, resultado: 'FALLO' });
      if (!res.headersSent)
        return res.status(500).json({ message: 'Error al exportar la base de datos. Verifique que mysqldump esté disponible y las credenciales en el .env sean correctas.', error: detail });
      return;
    }

    logEvent({ usuario_id: usuario.id || null, usuario_nombre: usuario.nombre || null,
      accion: 'CREAR', modulo: 'BASE_DATOS', detalle: `Exportación SQL: ${dlFilename}`,
      ip, metodo: req.method, ruta: req.originalUrl, resultado: 'EXITO' });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${dlFilename}"`);
    res.setHeader('Content-Length', fileSize);

    const rs = fs.createReadStream(tmpPath);
    rs.pipe(res);
    rs.on('close', () => fs.unlink(tmpPath, () => {}));
    rs.on('error', err2 => {
      fs.unlink(tmpPath, () => {});
      if (!res.headersSent) res.status(500).json({ message: 'Error al leer el archivo generado.', error: err2.message });
    });
  }

  child.stderr.on('data', d => { errMsg += d.toString(); });
  ws.on('finish', () => { wsFinished = true; finish(); });
  child.on('close', code => { exitCode = code; childClosed = true; finish(); });

  child.on('error', err => {
    clearTimeout(timer);
    fs.unlink(tmpPath, () => {});
    logEvent({ usuario_id: usuario.id || null, usuario_nombre: usuario.nombre || null,
      accion: 'CREAR', modulo: 'BASE_DATOS', detalle: `Error en exportación: ${err.message}`,
      ip, metodo: req.method, ruta: req.originalUrl, resultado: 'FALLO' });
    if (!res.headersSent) res.status(500).json({ message: `mysqldump no encontrado. Configure MYSQL_BIN en el .env o agregue MySQL al PATH del sistema.`, error: err.message });
  });
};

exports.importDB = (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo SQL' });

  const filePath = req.file.path;

  if (!req.file.originalname.toLowerCase().endsWith('.sql')) {
    fs.unlink(filePath, () => {});
    return res.status(400).json({ message: 'Solo se permiten archivos .sql' });
  }

  const args = [
    `--host=${process.env.DB_HOST}`,
    `--user=${process.env.DB_USER}`,
    `--password=${process.env.DB_PASSWORD}`,
    process.env.DB_NAME,
  ];

  const child = spawn(resolveBin('mysql'), args, { shell: false });
  const usuario = req.user || {};
  const ip = req.ip || '?';

  // Stream file directly to mysql stdin — avoids loading large dumps into RAM
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(child.stdin);
  fileStream.on('error', err => {
    child.kill('SIGTERM');
    fs.unlink(filePath, () => {});
    if (!res.headersSent)
      res.status(500).json({ message: 'Error al leer el archivo', error: err.message });
  });

  let errMsg = '';
  let timedOut = false;
  child.stderr.on('data', d => { errMsg += d.toString(); });

  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    fs.unlink(filePath, () => {});
    if (!res.headersSent)
      res.status(500).json({ message: 'Timeout: la importación superó 5 minutos', error: 'ETIMEOUT' });
  }, SPAWN_TIMEOUT_MS);

  child.on('close', code => {
    clearTimeout(timer);
    fs.unlink(filePath, () => {});
    if (timedOut) return;
    if (code !== 0) {
      logEvent({
        usuario_id: usuario.id || null,
        usuario_nombre: usuario.nombre || null,
        accion: 'ACTUALIZAR',
        modulo: 'BASE_DATOS',
        detalle: `Error al importar SQL: ${req.file?.originalname || 'desconocido'}`,
        ip,
        metodo: req.method,
        ruta: req.originalUrl,
        resultado: 'FALLO',
      });
      return res.status(500).json({ message: 'Error al importar', error: errMsg });
    }
    logEvent({
      usuario_id: usuario.id || null,
      usuario_nombre: usuario.nombre || null,
      accion: 'ACTUALIZAR',
      modulo: 'BASE_DATOS',
      detalle: `Base de datos importada desde: ${req.file?.originalname || 'desconocido'}`,
      ip,
      metodo: req.method,
      ruta: req.originalUrl,
      resultado: 'EXITO',
    });
    res.json({ message: 'Base de datos importada exitosamente' });
  });

  child.on('error', err => {
    clearTimeout(timer);
    fs.unlink(filePath, () => {});
    if (!res.headersSent) res.status(500).json({ message: 'Error al ejecutar mysql CLI', error: err.message });
  });
};

exports.listBackups = (_req, res) => {
  const cfg      = loadConfig();
  const savePath = cfg.savePath;

  if (!fs.existsSync(savePath)) return res.json({ backups: [], totalSize: 0, totalCount: 0 });

  try {
    const allStats = fs.readdirSync(savePath)
      .filter(f => f.toLowerCase().endsWith('.sql'))
      .map(f => {
        const stat = fs.statSync(path.join(savePath, f));
        return { filename: f, size: stat.size, createdAt: stat.mtime };
      });
    const totalSize  = allStats.reduce((sum, f) => sum + f.size, 0);
    const totalCount = allStats.length;
    const backups = allStats
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ backups, totalSize, totalCount });
  } catch (err) {
    res.status(500).json({ message: 'Error al listar backups', error: err.message });
  }
};

exports.downloadBackup = (req, res) => {
  const cfg      = loadConfig();
  const { filename } = req.params;

  // Prevent path traversal
  if (!/^[\w\-. ]+\.sql$/i.test(filename)) {
    return res.status(400).json({ message: 'Nombre de archivo inválido' });
  }

  const filePath = path.join(cfg.savePath, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Archivo no encontrado' });

  res.download(filePath, filename);
};

// ── Download log (bitácora) ───────────────────────────────────
exports.getDownloadLog = (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || 50, 10), 200);
  const offset = parseInt(req.query.offset || 0, 10);
  const db     = require('../db');

  db.query(
    `SELECT id, usuario_nombre, detalle, ip, resultado, fecha_hora
     FROM auditoria
     WHERE modulo = 'BASE_DATOS'
       AND accion = 'CREAR'
       AND (detalle LIKE 'Exportación%' OR detalle LIKE 'Exportacion%' OR detalle LIKE 'Backup manual%')
     ORDER BY fecha_hora DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Error al obtener historial', error: err.message });
      db.query(
        `SELECT COUNT(*) AS total FROM auditoria
         WHERE modulo = 'BASE_DATOS' AND accion = 'CREAR'
           AND (detalle LIKE 'Exportación%' OR detalle LIKE 'Exportacion%' OR detalle LIKE 'Backup manual%')`,
        (err2, cnt) => {
          res.json({ log: rows, total: err2 ? 0 : cnt[0].total });
        }
      );
    }
  );
};

exports.deleteBackup = (req, res) => {
  const cfg      = loadConfig();
  const { filename } = req.params;
  const usuario = req.user || {};
  const ip = req.ip || '?';

  // Prevent path traversal
  if (!/^[\w\-. ]+\.sql$/i.test(filename)) {
    return res.status(400).json({ message: 'Nombre de archivo inválido' });
  }

  const filePath = path.join(cfg.savePath, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Archivo no encontrado' });

  fs.unlink(filePath, err => {
    if (err) return res.status(500).json({ message: 'Error al eliminar', error: err.message });
    logEvent({
      usuario_id: usuario.id || null,
      usuario_nombre: usuario.nombre || null,
      accion: 'ELIMINAR',
      modulo: 'BASE_DATOS',
      detalle: `Backup eliminado: ${filename}`,
      ip,
      metodo: req.method,
      ruta: req.originalUrl,
      resultado: 'EXITO',
    });
    res.json({ message: 'Backup eliminado exitosamente' });
  });
};
