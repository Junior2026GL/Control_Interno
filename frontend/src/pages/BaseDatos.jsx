import { useState, useEffect, useCallback } from 'react';
import {
  FiDatabase, FiClock, FiDownload, FiUpload, FiList,
  FiSave, FiTrash2, FiPlay, FiToggleLeft, FiToggleRight,
  FiRefreshCw, FiCheckCircle, FiAlertCircle, FiFolder,
  FiChevronDown, FiChevronUp, FiHardDrive,
} from 'react-icons/fi';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import './BaseDatos.css';

const BASE_URL = 'http://localhost:4000/api';

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function Alert({ msg }) {
  if (!msg) return null;
  return (
    <div className={`db-alert db-alert--${msg.type}`}>
      {msg.type === 'success' ? <FiCheckCircle size={16} /> : <FiAlertCircle size={16} />}
      <span>{msg.text}</span>
    </div>
  );
}

const DAYS_WEEK   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DAYS_MONTH  = Array.from({ length: 31 }, (_, i) => i + 1);

export default function BaseDatos() {
  /* ── Config state ─────────────────────────────────── */
  const [config, setConfig] = useState({
    enabled: false, frequency: 'daily', time: '02:00',
    dayOfWeek: 1, dayOfMonth: 1, savePath: '', lastBackup: null,
  });
  const [configLoading, setConfigLoading] = useState(true);
  const [savingConfig,  setSavingConfig]  = useState(false);
  const [configMsg,     setConfigMsg]     = useState(null);

  /* ── Export state ─────────────────────────────────── */
  const [exporting,  setExporting]  = useState(false);
  const [exportMsg,  setExportMsg]  = useState(null);

  /* ── Import state ─────────────────────────────────── */
  const [importFile, setImportFile] = useState(null);
  const [importing,  setImporting]  = useState(false);
  const [importMsg,  setImportMsg]  = useState(null);

  /* ── Backups list ─────────────────────────────────── */
  const [backups,       setBackups]       = useState([]);
  const [backupsLoading,setBackupsLoading]= useState(true);
  const [runningBackup, setRunningBackup] = useState(false);
  const [backupMsg,     setBackupMsg]     = useState(null);

  /* ── Expanded section ─────────────────────────────── */
  const [openSection, setOpenSection] = useState(null);

  const toggleSection = s => setOpenSection(prev => prev === s ? null : s);

  /* ── Data fetching ───────────────────────────────── */
  const loadConfig = useCallback(async () => {
    try {
      setConfigLoading(true);
      const res = await api.get('/database/config', { headers: authHeaders() });
      setConfig(res.data);
    } catch { /* ignore */ }
    finally { setConfigLoading(false); }
  }, []);

  const loadBackups = useCallback(async () => {
    try {
      setBackupsLoading(true);
      const res = await api.get('/database/backups', { headers: authHeaders() });
      setBackups(res.data.backups || []);
    } catch { /* ignore */ }
    finally { setBackupsLoading(false); }
  }, []);

  useEffect(() => { loadConfig(); loadBackups(); }, [loadConfig, loadBackups]);

  /* ── Shared download trigger ─────────────────────────────────────────
     url    – full URL to fetch
     method – 'GET' (export) | 'POST' (backup/run – saves to disk + streams)
  ─────────────────────────────────────────────────────────────────────── */
  const doDownload = useCallback(async (url, method = 'GET') => {
    const opts = { method, headers: authHeaders() };
    if (method === 'POST') {
      opts.headers = { ...opts.headers, 'Content-Type': 'application/json' };
      opts.body = JSON.stringify({});
    }
    const response = await fetch(url, opts);
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      throw new Error(json.message || 'Error en el servidor');
    }
    const blob     = await response.blob();
    const disp     = response.headers.get('content-disposition') || '';
    const match    = disp.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : 'backup.sql';
    const blobUrl  = window.URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href = blobUrl; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(blobUrl);
    return filename;
  }, []);

  /* ── Auto-scheduler (checks every 30 s) ─────────────── */
  useEffect(() => {
    if (!config.enabled || !config.time) return;

    const checkSchedule = () => {
      const now  = new Date();
      const [hCfg, mCfg] = config.time.split(':').map(Number);
      if (now.getHours() !== hCfg || now.getMinutes() !== mCfg) return;
      if (config.frequency === 'weekly'  && now.getDay()  !== Number(config.dayOfWeek))  return;
      if (config.frequency === 'monthly' && now.getDate() !== Number(config.dayOfMonth)) return;

      // Dedup within the same minute using sessionStorage
      const stampKey = `auto_backup_${now.toISOString().slice(0, 16)}`;
      if (sessionStorage.getItem(stampKey)) return;
      sessionStorage.setItem(stampKey, '1');

      console.log('[AutoBackup] Guardando y descargando backup programado…');
      // Use /backup/run so the file is ALSO saved to the configured server path
      doDownload(`${BASE_URL}/database/backup/run`, 'POST')
        .then(f  => console.log('[AutoBackup] Descargado y guardado en ruta configurada:', f))
        .catch(e => console.error('[AutoBackup] Error:', e));
    };

    const iv = setInterval(checkSchedule, 30_000);
    return () => clearInterval(iv);
  }, [config, doDownload]);

  /* ── Handlers ────────────────────────────────────── */
  const handleSaveConfig = async () => {
    setSavingConfig(true); setConfigMsg(null);
    try {
      await api.post('/database/config', config, { headers: authHeaders() });
      setConfigMsg({ type: 'success', text: 'Configuración guardada exitosamente.' });
    } catch (err) {
      setConfigMsg({ type: 'error', text: err.response?.data?.message || 'Error al guardar configuración.' });
    } finally { setSavingConfig(false); }
  };

  const handleExport = async () => {
    setExporting(true); setExportMsg(null);
    try {
      const f = await doDownload(`${BASE_URL}/database/export`, 'GET');
      setExportMsg({ type: 'success', text: `Archivo "${f}" descargado correctamente.` });
    } catch {
      setExportMsg({ type: 'error', text: 'Error al exportar la base de datos. Verifique que mysqldump esté instalado.' });
    } finally { setExporting(false); }
  };

  const handleImport = async e => {
    e.preventDefault();
    if (!importFile) return;
    setImporting(true); setImportMsg(null);
    const formData = new FormData();
    formData.append('sqlFile', importFile);
    try {
      const res = await api.post('/database/import', formData, {
        headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
      });
      setImportMsg({ type: 'success', text: res.data.message });
      setImportFile(null);
      const el = document.getElementById('sql-file-input');
      if (el) el.value = '';
    } catch (err) {
      setImportMsg({ type: 'error', text: err.response?.data?.message || 'Error al importar el archivo.' });
    } finally { setImporting(false); }
  };

  const handleRunBackup = async () => {
    setRunningBackup(true); setBackupMsg(null);
    try {
      // POST /backup/run → saves to configured path on disk AND streams back for browser download
      const f = await doDownload(`${BASE_URL}/database/backup/run`, 'POST');
      setBackupMsg({ type: 'success', text: `Backup guardado en la ruta configurada y descargado: ${f}` });
      loadBackups();
    } catch (err) {
      setBackupMsg({ type: 'error', text: err.message || 'Error al generar el backup. Verifique que mysqldump esté instalado.' });
    } finally { setRunningBackup(false); }
  };

  const handleDownloadBackup = async filename => {
    const response = await fetch(
      `${BASE_URL}/database/backups/${encodeURIComponent(filename)}`,
      { headers: authHeaders() },
    );
    if (!response.ok) { alert('Error al descargar el backup'); return; }
    const blob = await response.blob();
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleDeleteBackup = async filename => {
    if (!window.confirm(`¿Eliminar el backup "${filename}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/database/backups/${encodeURIComponent(filename)}`, { headers: authHeaders() });
      loadBackups();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al eliminar el backup.');
    }
  };

  /* ── Render helpers ──────────────────────────────── */
  const SectionHeader = ({ id, icon: Icon, title, badge, color }) => (
    <button
      className={`db-section-toggle ${openSection === id ? 'open' : ''}`}
      onClick={() => toggleSection(id)}
    >
      <span className="db-section-toggle-icon" style={{ background: color }}>
        <Icon size={20} color="white" />
      </span>
      <span className="db-section-toggle-title">{title}</span>
      {badge && <span className="db-section-badge">{badge}</span>}
      <span className="db-section-chevron">
        {openSection === id ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
      </span>
    </button>
  );

  /* ── Main render ─────────────────────────────────── */
  return (
    <div className="app-shell">
      <Navbar />
      <main className="db-main">

        {/* ── Page header ── */}
        <div className="db-page-header">
          <div className="db-page-icon">
            <FiDatabase size={28} color="white" />
          </div>
          <div>
            <h1>Base de Datos</h1>
            <p>Backups automáticos, exportación e importación · Solo Super Administrador</p>
          </div>
        </div>

        {/* ── Summary strip ── */}
        <div className="db-summary-strip">
          <div className="db-summary-item">
            <FiHardDrive size={18} />
            <span><strong>{backups.length}</strong> backups guardados</span>
          </div>
          <div className="db-summary-item">
            <FiClock size={18} />
            <span>Último backup: <strong>{formatDate(config.lastBackup)}</strong></span>
          </div>
          <div className={`db-summary-item db-status ${config.enabled ? 'on' : 'off'}`}>
            {config.enabled ? <FiToggleRight size={18} /> : <FiToggleLeft size={18} />}
            <span>Programación: <strong>{config.enabled ? 'Activa' : 'Inactiva'}</strong></span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════
            SECTION 1 – Backup Automático
        ══════════════════════════════════════════════ */}
        <div className="db-section-wrap">
          <SectionHeader
            id="config"
            icon={FiClock}
            title="Backup Automático"
            badge={config.enabled ? 'Activo' : null}
            color="linear-gradient(135deg,#667eea,#764ba2)"
          />

          {openSection === 'config' && (
            <div className="db-panel">
              {configLoading ? (
                <div className="db-loading"><FiRefreshCw className="spin" size={22} /> Cargando…</div>
              ) : (
                <>
                  {/* Enable toggle */}
                  <div className="db-field db-field--toggle">
                    <label className="db-label">Estado del backup automático</label>
                    <button
                      className={`db-toggle-btn ${config.enabled ? 'enabled' : ''}`}
                      onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
                    >
                      {config.enabled
                        ? <><FiToggleRight size={22} /> Habilitado</>
                        : <><FiToggleLeft  size={22} /> Deshabilitado</>}
                    </button>
                  </div>

                  <div className="db-fields-row">
                    {/* Frequency */}
                    <div className="db-field">
                      <label className="db-label">Frecuencia</label>
                      <select
                        className="db-select"
                        value={config.frequency}
                        onChange={e => setConfig(c => ({ ...c, frequency: e.target.value }))}
                      >
                        <option value="daily">Diario</option>
                        <option value="weekly">Semanal</option>
                        <option value="monthly">Mensual</option>
                      </select>
                    </div>

                    {/* Time */}
                    <div className="db-field">
                      <label className="db-label">Hora de ejecución</label>
                      <input
                        type="time"
                        className="db-input"
                        value={config.time}
                        onChange={e => setConfig(c => ({ ...c, time: e.target.value }))}
                      />
                    </div>

                    {/* Day of week (weekly only) */}
                    {config.frequency === 'weekly' && (
                      <div className="db-field">
                        <label className="db-label">Día de la semana</label>
                        <select
                          className="db-select"
                          value={config.dayOfWeek}
                          onChange={e => setConfig(c => ({ ...c, dayOfWeek: Number(e.target.value) }))}
                        >
                          {DAYS_WEEK.map((d, i) => <option key={i} value={i}>{d}</option>)}
                        </select>
                      </div>
                    )}

                    {/* Day of month (monthly only) */}
                    {config.frequency === 'monthly' && (
                      <div className="db-field">
                        <label className="db-label">Día del mes</label>
                        <select
                          className="db-select"
                          value={config.dayOfMonth}
                          onChange={e => setConfig(c => ({ ...c, dayOfMonth: Number(e.target.value) }))}
                        >
                          {DAYS_MONTH.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Save path */}
                  <div className="db-field db-field--full">
                    <label className="db-label">
                      <FiFolder size={14} /> Ruta de guardado en servidor
                    </label>
                    <input
                      type="text"
                      className="db-input"
                      placeholder="Ej. C:\backups\control_interno o /var/backups"
                      value={config.savePath}
                      onChange={e => setConfig(c => ({ ...c, savePath: e.target.value }))}
                    />
                    <p className="db-hint">
                      Carpeta del servidor donde se almacenarán los archivos .sql automáticos.
                    </p>
                  </div>

                  <Alert msg={configMsg} />

                  <div className="db-panel-actions">
                    <button
                      className="db-btn db-btn--primary"
                      onClick={handleSaveConfig}
                      disabled={savingConfig}
                    >
                      {savingConfig
                        ? <><FiRefreshCw className="spin" size={15} /> Guardando…</>
                        : <><FiSave size={15} /> Guardar configuración</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════
            SECTION 2 – Exportar
        ══════════════════════════════════════════════ */}
        <div className="db-section-wrap">
          <SectionHeader
            id="export"
            icon={FiDownload}
            title="Exportar Base de Datos"
            color="linear-gradient(135deg,#4facfe,#00f2fe)"
          />

          {openSection === 'export' && (
            <div className="db-panel">
              <p className="db-desc">
                Genera un volcado completo de la base de datos en formato SQL y lo descarga
                directamente en tu navegador. El archivo incluye estructura y datos.
              </p>

              <Alert msg={exportMsg} />

              <div className="db-panel-actions">
                <button
                  className="db-btn db-btn--teal"
                  onClick={handleExport}
                  disabled={exporting}
                >
                  {exporting
                    ? <><FiRefreshCw className="spin" size={15} /> Generando exportación…</>
                    : <><FiDownload size={15} /> Descargar exportación (SQL)</>}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════
            SECTION 3 – Importar
        ══════════════════════════════════════════════ */}
        <div className="db-section-wrap">
          <SectionHeader
            id="import"
            icon={FiUpload}
            title="Importar Base de Datos"
            color="linear-gradient(135deg,#43e97b,#38f9d7)"
          />

          {openSection === 'import' && (
            <div className="db-panel">
              <div className="db-import-warning">
                <FiAlertCircle size={18} />
                <span>
                  <strong>Precaución:</strong> Importar un archivo SQL reemplazará los datos
                  existentes. Se recomienda realizar un backup antes de continuar.
                </span>
              </div>

              <form onSubmit={handleImport}>
                <div className="db-file-drop">
                  <input
                    id="sql-file-input"
                    type="file"
                    accept=".sql"
                    className="db-file-input"
                    onChange={e => setImportFile(e.target.files[0] || null)}
                  />
                  <label htmlFor="sql-file-input" className="db-file-label">
                    {importFile ? (
                      <>
                        <FiDatabase size={28} />
                        <span className="db-file-name">{importFile.name}</span>
                        <span className="db-file-size">{formatBytes(importFile.size)}</span>
                      </>
                    ) : (
                      <>
                        <FiUpload size={28} />
                        <span>Haz clic para seleccionar un archivo .sql</span>
                        <span className="db-file-hint">Tamaño máximo: 100 MB</span>
                      </>
                    )}
                  </label>
                </div>

                <Alert msg={importMsg} />

                <div className="db-panel-actions">
                  <button
                    className="db-btn db-btn--green"
                    type="submit"
                    disabled={!importFile || importing}
                  >
                    {importing
                      ? <><FiRefreshCw className="spin" size={15} /> Importando…</>
                      : <><FiUpload size={15} /> Importar base de datos</>}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════
            SECTION 4 – Historial de Backups
        ══════════════════════════════════════════════ */}
        <div className="db-section-wrap">
          <SectionHeader
            id="history"
            icon={FiList}
            title="Historial de Backups"
            badge={backups.length > 0 ? `${backups.length}` : null}
            color="linear-gradient(135deg,#fa709a,#fee140)"
          />

          {openSection === 'history' && (
            <div className="db-panel">
              <div className="db-backup-toolbar">
                <button
                  className="db-btn db-btn--purple"
                  onClick={handleRunBackup}
                  disabled={runningBackup}
                >
                  {runningBackup
                    ? <><FiRefreshCw className="spin" size={15} /> Creando backup…</>
                    : <><FiPlay size={15} /> Crear backup ahora</>}
                </button>
                <button className="db-btn db-btn--ghost" onClick={loadBackups}>
                  <FiRefreshCw size={15} /> Actualizar lista
                </button>
              </div>

              <Alert msg={backupMsg} />

              {backupsLoading ? (
                <div className="db-loading"><FiRefreshCw className="spin" size={22} /> Cargando…</div>
              ) : backups.length === 0 ? (
                <div className="db-empty">
                  <FiDatabase size={40} />
                  <p>No hay backups guardados todavía.</p>
                  <span>Crea uno manualmente o configura el backup automático.</span>
                </div>
              ) : (
                <table className="db-table">
                  <thead>
                    <tr>
                      <th>Archivo</th>
                      <th>Fecha</th>
                      <th>Tamaño</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map(b => (
                      <tr key={b.filename}>
                        <td className="db-td-file">
                          <FiDatabase size={14} />
                          <span>{b.filename}</span>
                        </td>
                        <td>{formatDate(b.createdAt)}</td>
                        <td>{formatBytes(b.size)}</td>
                        <td className="db-td-actions">
                          <button
                            className="db-icon-btn db-icon-btn--download"
                            title="Descargar"
                            onClick={() => handleDownloadBackup(b.filename)}
                          >
                            <FiDownload size={15} />
                          </button>
                          <button
                            className="db-icon-btn db-icon-btn--delete"
                            title="Eliminar"
                            onClick={() => handleDeleteBackup(b.filename)}
                          >
                            <FiTrash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
