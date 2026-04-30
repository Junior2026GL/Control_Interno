import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import {
  LuDatabase, LuDownload, LuRefreshCw,
  LuCircleCheck, LuTriangleAlert, LuX,
  LuCloudDownload, LuCalendar, LuUser, LuGlobe,
  LuHistory, LuSettings, LuSave, LuClock, LuFolderOpen,
  LuToggleLeft, LuToggleRight,
} from 'react-icons/lu';
import './BaseDatos.css';

//  Toast
function Toast({ toasts, onRemove }) {
  return (
    <div className="db-toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`db-toast db-toast--${t.type}`}>
          <span className="db-toast-icon">
            {t.type === 'success' ? <LuCircleCheck size={15} /> : <LuTriangleAlert size={15} />}
          </span>
          <span className="db-toast-msg">{t.message}</span>
          <button className="db-toast-close" onClick={() => onRemove(t.id)}>
            <LuX size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* -- Helpers --------------------------------------------------- */
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-HN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function timeAgo(d) {
  if (!d) return 'Nunca';
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Ahora mismo';
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h}h`;
  return `Hace ${Math.floor(h / 24)} día(s)`;
}

const LOG_PAGE = 10;

const DAYS_OF_WEEK = [
  { v: 0, l: 'Domingo' }, { v: 1, l: 'Lunes' }, { v: 2, l: 'Martes' },
  { v: 3, l: 'Miércoles' }, { v: 4, l: 'Jueves' }, { v: 5, l: 'Viernes' }, { v: 6, l: 'Sábado' },
];

/* -- Component ------------------------------------------------- */
export default function BaseDatos() {
  const [exporting,    setExporting]    = useState(false);
  const [log,          setLog]          = useState([]);
  const [logTotal,     setLogTotal]     = useState(0);
  const [logLoading,   setLogLoading]   = useState(false);
  const [logPage,      setLogPage]      = useState(1);
  const [lastDownload, setLastDownload] = useState(null);
  const [toasts,       setToasts]       = useState([]);

  // Config backup automático
  const [cfg,        setCfg]        = useState(null);
  const [cfgLoading, setCfgLoading] = useState(true);
  const [cfgSaving,  setCfgSaving]  = useState(false);

  let toastCounter = 0;

  function addToast(message, type = 'success') {
    const id = ++toastCounter;
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
  }

  const loadConfig = useCallback(async () => {
    try {
      const { data } = await api.get('/database/config');
      setCfg(data);
    } catch {
      addToast('Error al cargar la configuración', 'error');
    } finally {
      setCfgLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveConfig() {
    setCfgSaving(true);
    try {
      await api.post('/database/config', cfg);
      addToast('Configuración guardada correctamente');
    } catch {
      addToast('Error al guardar la configuración', 'error');
    } finally {
      setCfgSaving(false);
    }
  }

  const loadLog = useCallback(async (page = 1) => {    setLogLoading(true);
    try {
      const offset = (page - 1) * LOG_PAGE;
      const { data } = await api.get(`/database/download-log?limit=${LOG_PAGE}&offset=${offset}`);
      setLog(data.log || []);
      setLogTotal(data.total || 0);
      if (data.log?.length > 0 && page === 1) {
        setLastDownload(data.log[0].creado_en);
      }
    } catch {
      addToast('Error al cargar el historial', 'error');
    } finally {
      setLogLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadLog(1); loadConfig(); }, [loadLog, loadConfig]);

  async function handleDownload() {
    setExporting(true);
    try {
      const r = await api.get('/database/export', { responseType: 'blob' });
      const cd   = r.headers['content-disposition'] || '';
      const name = (cd.match(/filename="([^"]+)"/) || [])[1] || 'backup.sql';
      const url  = URL.createObjectURL(r.data);
      Object.assign(document.createElement('a'), { href: url, download: name }).click();
      URL.revokeObjectURL(url);
      setLastDownload(new Date().toISOString());
      addToast(`Descarga completada: ${name}`);
      setTimeout(() => { loadLog(1); setLogPage(1); }, 800);
    } catch (err) {
      const text = err.response?.data instanceof Blob ? await err.response.data.text() : null;
      let msg = 'Error al descargar la base de datos';
      try { msg = JSON.parse(text)?.message || msg; } catch { /* ignore */ }
      addToast(msg, 'error');
    } finally {
      setExporting(false);
    }
  }

  const logPages = Math.max(1, Math.ceil(logTotal / LOG_PAGE));

  function changePage(p) {
    setLogPage(p);
    loadLog(p);
  }

  return (
    <div className="page-wrapper">
      <Navbar />
      <Toast toasts={toasts} onRemove={id => setToasts(p => p.filter(t => t.id !== id))} />

      <main className="page-content">

        {/* -- Banner -- */}
        <div className="db-banner">
          <div className="db-banner-icon"><LuDatabase size={28} /></div>
          <div>
            <h1 className="db-banner-title">Base de Datos</h1>
            <p className="db-banner-sub">Gestión y respaldo de la base de datos del sistema</p>
          </div>
        </div>

        {/* -- Descarga principal -- */}
        <div className="db-download-card">
          <div className="db-download-left">
            <div className="db-download-icon">
              <LuCloudDownload size={32} />
            </div>
            <div>
              <h2 className="db-download-title">Descargar Base de Datos</h2>
              <p className="db-download-desc">
                Genera un volcado SQL completo con todos los datos y la estructura actual.
                El archivo <code>.sql</code> se descargará directamente a tu equipo.
              </p>
              {lastDownload && (
                <p className="db-download-last">
                  <LuCalendar size={12} /> Última descarga: <strong>{timeAgo(lastDownload)}</strong>
                  <span className="db-download-last-date"> — {formatDate(lastDownload)}</span>
                </p>
              )}
            </div>
          </div>
          <button
            className="db-download-btn"
            onClick={handleDownload}
            disabled={exporting}
          >
            {exporting
              ? <><LuRefreshCw size={18} className="spin" /> Generando...</>
              : <><LuDownload size={18} /> Descargar SQL</>}
          </button>
        </div>

        {/* ── Configuración backup automático ── */}
        <div className="db-cfg-card">
          <div className="db-cfg-header">
            <div className="db-cfg-header-left">
              <div className="db-cfg-icon"><LuSettings size={18} /></div>
              <div>
                <h2 className="db-cfg-title">Backup Automático</h2>
                <p className="db-cfg-sub">Programa descargas automáticas de la base de datos</p>
              </div>
            </div>
            {cfg && (
              <button
                className={`db-cfg-toggle ${cfg.enabled ? 'db-cfg-toggle--on' : ''}`}
                onClick={() => setCfg(p => ({ ...p, enabled: !p.enabled }))}
              >
                {cfg.enabled
                  ? <><LuToggleRight size={17} /> Activado</>
                  : <><LuToggleLeft size={17} /> Desactivado</>}
              </button>
            )}
          </div>

          {cfgLoading ? (
            <div className="db-cfg-loading"><LuRefreshCw size={18} className="spin" /> Cargando...</div>
          ) : cfg && (
            <div className="db-cfg-body">

              <div className="db-cfg-row">
                {/* Frecuencia */}
                <div className="db-cfg-field">
                  <label className="db-cfg-label"><LuClock size={12} /> Frecuencia</label>
                  <select
                    className="db-cfg-select"
                    value={cfg.frequency}
                    onChange={e => setCfg(p => ({ ...p, frequency: e.target.value }))}
                    disabled={!cfg.enabled}
                  >
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensual</option>
                  </select>
                </div>

                {/* Hora */}
                <div className="db-cfg-field">
                  <label className="db-cfg-label"><LuClock size={12} /> Hora</label>
                  <input
                    type="time"
                    className="db-cfg-input"
                    value={cfg.time}
                    onChange={e => setCfg(p => ({ ...p, time: e.target.value }))}
                    disabled={!cfg.enabled}
                  />
                </div>

                {/* Día de semana (solo weekly) */}
                {cfg.frequency === 'weekly' && (
                  <div className="db-cfg-field">
                    <label className="db-cfg-label">Día de la semana</label>
                    <select
                      className="db-cfg-select"
                      value={cfg.dayOfWeek}
                      onChange={e => setCfg(p => ({ ...p, dayOfWeek: Number(e.target.value) }))}
                      disabled={!cfg.enabled}
                    >
                      {DAYS_OF_WEEK.map(d => (
                        <option key={d.v} value={d.v}>{d.l}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Día del mes (solo monthly) */}
                {cfg.frequency === 'monthly' && (
                  <div className="db-cfg-field">
                    <label className="db-cfg-label">Día del mes</label>
                    <input
                      type="number"
                      min="1" max="28"
                      className="db-cfg-input"
                      value={cfg.dayOfMonth}
                      onChange={e => setCfg(p => ({ ...p, dayOfMonth: Number(e.target.value) }))}
                      disabled={!cfg.enabled}
                    />
                  </div>
                )}
              </div>

              {/* Ruta de guardado */}
              <div className="db-cfg-field db-cfg-field--full">
                <label className="db-cfg-label"><LuFolderOpen size={12} /> Ruta de guardado</label>
                <input
                  type="text"
                  className="db-cfg-input"
                  placeholder="Ej: C:\Users\usuario\Desktop\Backups"
                  value={cfg.savePath || ''}
                  onChange={e => setCfg(p => ({ ...p, savePath: e.target.value }))}
                  disabled={!cfg.enabled}
                />
              </div>

              {cfg.lastBackup && (
                <p className="db-cfg-last">
                  <LuCalendar size={12} /> Último backup automático: <strong>{formatDate(cfg.lastBackup)}</strong>
                </p>
              )}

              <div className="db-cfg-actions">
                <button className="db-cfg-save-btn" onClick={saveConfig} disabled={cfgSaving}>
                  {cfgSaving
                    ? <><LuRefreshCw size={15} className="spin" /> Guardando...</>
                    : <><LuSave size={15} /> Guardar configuración</>}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Bitácora ── */}
        <div className="db-log-card">
          <div className="db-log-header">
            <div className="db-log-header-left">
              <LuHistory size={18} className="db-log-icon" />
              <div>
                <h2 className="db-log-title">Bitácora de Descargas</h2>
                <p className="db-log-sub">{logTotal} registro{logTotal !== 1 ? 's' : ''} en total</p>
              </div>
            </div>
            <button className="db-log-refresh" onClick={() => { setLogPage(1); loadLog(1); }} disabled={logLoading}>
              <LuRefreshCw size={14} className={logLoading ? 'spin' : ''} />
              Actualizar
            </button>
          </div>

          {logLoading ? (
            <div className="db-log-loading">
              <LuRefreshCw size={22} className="spin" />
              <span>Cargando historial...</span>
            </div>
          ) : log.length === 0 ? (
            <div className="db-log-empty">
              <LuHistory size={40} />
              <p>Sin descargas registradas</p>
              <span>Aquí aparecerá cada vez que se descargue la base de datos.</span>
            </div>
          ) : (
            <>
              <div className="db-log-table-wrap">
                <table className="db-log-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th><LuCalendar size={12} /> Fecha y hora</th>
                      <th><LuUser size={12} /> Usuario</th>
                      <th>Detalle</th>
                      <th><LuGlobe size={12} /> IP</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.map((entry, i) => (
                      <tr key={entry.id}>
                        <td className="db-log-num">{(logPage - 1) * LOG_PAGE + i + 1}</td>
                        <td className="db-log-date">{formatDate(entry.creado_en)}</td>
                        <td className="db-log-user">{entry.usuario_nombre || '—'}</td>
                        <td className="db-log-detail">{entry.detalle}</td>
                        <td className="db-log-ip">{entry.ip}</td>
                        <td>
                          <span className={`db-log-badge ${entry.resultado === 'EXITO' ? 'db-log-badge--ok' : 'db-log-badge--err'}`}>
                            {entry.resultado === 'EXITO'
                              ? <><LuCircleCheck size={11} /> Exitoso</>
                              : <><LuTriangleAlert size={11} /> Fallo</>}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {logPages > 1 && (
                <div className="db-log-pagination">
                  <button
                    className="db-pg-btn"
                    onClick={() => changePage(logPage - 1)}
                    disabled={logPage === 1}
                  >‹ Anterior</button>
                  <span className="db-pg-info">Página {logPage} de {logPages}</span>
                  <button
                    className="db-pg-btn"
                    onClick={() => changePage(logPage + 1)}
                    disabled={logPage === logPages}
                  >Siguiente ›</button>
                </div>
              )}
            </>
          )}
        </div>

      </main>
    </div>
  );
}
