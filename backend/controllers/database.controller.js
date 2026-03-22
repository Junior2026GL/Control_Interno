const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
let cron;
try { cron = require('node-cron'); } catch { cron = null; }

// ── Config persistence ────────────────────────────────────────
const CONFIG_DIR  = path.join(__dirname, '../config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'backup-config.json');

function getDefaultConfig() {
  return {
    enabled:    false,
    frequency:  'daily',   // 'daily' | 'weekly' | 'monthly'
    time:       '02:00',
    dayOfWeek:  1,         // 0-6 (for weekly)
    dayOfMonth: 1,         // 1-31 (for monthly)
    savePath:   path.join(__dirname, '../backups'),
    lastBackup: null,
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
      console.log('[DB-Scheduler] Backup completed:', result.filename);
    } catch (err) {
      console.error('[DB-Scheduler] Backup failed:', err.message);
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
      '--databases',
      process.env.DB_NAME,
    ];

    const child = spawn('mysqldump', args, {
      env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
      shell: true,
    });

    const ws = fs.createWriteStream(filePath);
    child.stdout.pipe(ws);

    let errMsg = '';
    child.stderr.on('data', d => { errMsg += d.toString(); });

    child.on('close', code => {
      if (code !== 0) {
        fs.unlink(filePath, () => {});
        return reject(new Error(errMsg || `mysqldump exited with code ${code}`));
      }
      resolve({ filename, filePath });
    });

    child.on('error', err => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
}

// ── Route handlers ────────────────────────────────────────────

exports.getConfig = (_req, res) => {
  res.json(loadConfig());
};

exports.saveConfig = (req, res) => {
  const { enabled, frequency, time, dayOfWeek, dayOfMonth, savePath } = req.body;
  const current = loadConfig();
  const updated = {
    ...current,
    enabled:    Boolean(enabled),
    frequency:  ['daily','weekly','monthly'].includes(frequency) ? frequency : current.frequency,
    time:       time       || current.time,
    dayOfWeek:  dayOfWeek  != null ? Number(dayOfWeek)  : current.dayOfWeek,
    dayOfMonth: dayOfMonth != null ? Number(dayOfMonth) : current.dayOfMonth,
    savePath:   savePath   || current.savePath,
  };
  saveConfig(updated);
  startScheduler(updated);
  res.json({ message: 'Configuración guardada', config: updated });
};

exports.manualBackup = async (_req, res) => {
  try {
    const result = await performBackup();
    const cfg = loadConfig();
    saveConfig({ ...cfg, lastBackup: new Date().toISOString() });
    // Save to configured path AND stream back to browser for direct download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    const readStream = fs.createReadStream(result.filePath);
    readStream.pipe(res);
    readStream.on('error', err => {
      if (!res.headersSent) res.status(500).json({ message: 'Error al leer el backup', error: err.message });
    });
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ message: 'Error al crear backup', error: err.message });
  }
};

exports.exportDB = (req, res) => {
  const filename = buildFilename(false);  // colons ok in Content-Disposition

  const args = [
    `--host=${process.env.DB_HOST}`,
    `--user=${process.env.DB_USER}`,
    '--databases',
    process.env.DB_NAME,
  ];

  const child = spawn('mysqldump', args, {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
    shell: true,
  });

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  child.stdout.pipe(res);

  child.stderr.on('data', d => console.error('[mysqldump]', d.toString()));

  child.on('error', err => {
    if (!res.headersSent) res.status(500).json({ message: 'Error al exportar', error: err.message });
  });
};

exports.importDB = (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo SQL' });

  const filePath = req.file.path;

  if (!req.file.originalname.toLowerCase().endsWith('.sql')) {
    fs.unlink(filePath, () => {});
    return res.status(400).json({ message: 'Solo se permiten archivos .sql' });
  }

  let sqlContent;
  try {
    sqlContent = fs.readFileSync(filePath);
  } catch (err) {
    return res.status(500).json({ message: 'Error al leer el archivo', error: err.message });
  }

  const args = [
    `--host=${process.env.DB_HOST}`,
    `--user=${process.env.DB_USER}`,
    process.env.DB_NAME,
  ];

  const child = spawn('mysql', args, {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
    shell: true,
  });

  child.stdin.write(sqlContent);
  child.stdin.end();

  let errMsg = '';
  child.stderr.on('data', d => { errMsg += d.toString(); });

  child.on('close', code => {
    fs.unlink(filePath, () => {});
    if (code !== 0) return res.status(500).json({ message: 'Error al importar', error: errMsg });
    res.json({ message: 'Base de datos importada exitosamente' });
  });

  child.on('error', err => {
    fs.unlink(filePath, () => {});
    if (!res.headersSent) res.status(500).json({ message: 'Error al ejecutar mysql CLI', error: err.message });
  });
};

exports.listBackups = (_req, res) => {
  const cfg      = loadConfig();
  const savePath = cfg.savePath;

  if (!fs.existsSync(savePath)) return res.json({ backups: [] });

  try {
    const files = fs.readdirSync(savePath)
      .filter(f => f.toLowerCase().endsWith('.sql'))
      .map(f => {
        const stat = fs.statSync(path.join(savePath, f));
        return { filename: f, size: stat.size, createdAt: stat.mtime };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 30);
    res.json({ backups: files });
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

exports.deleteBackup = (req, res) => {
  const cfg      = loadConfig();
  const { filename } = req.params;

  // Prevent path traversal
  if (!/^[\w\-. ]+\.sql$/i.test(filename)) {
    return res.status(400).json({ message: 'Nombre de archivo inválido' });
  }

  const filePath = path.join(cfg.savePath, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Archivo no encontrado' });

  fs.unlink(filePath, err => {
    if (err) return res.status(500).json({ message: 'Error al eliminar', error: err.message });
    res.json({ message: 'Backup eliminado exitosamente' });
  });
};
