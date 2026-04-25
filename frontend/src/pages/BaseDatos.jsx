import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import {
  LuDatabase, LuClock, LuDownload, LuUpload, LuHardDrive,
  LuPlay, LuTrash2, LuSave, LuRefreshCw, LuFolder,
  LuCircleCheck, LuTriangleAlert, LuCalendar, LuFileText,
  LuToggleLeft, LuToggleRight, LuX, LuInfo, LuCloudUpload,
  LuZap, LuServer,
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

//  Confirm modal 
function ConfirmModal({ filename, onConfirm, onCancel, loading }) {
  return (
    <div className="db-modal-overlay" onClick={onCancel}>
      <div className="db-modal" onClick={e => e.stopPropagation()}>
        <div className="db-modal-icon"><LuTriangleAlert size={24} /></div>
        <h3 className="db-modal-title">Eliminar backup</h3>
        <p className="db-modal-body">
          ¿Deseas eliminar <strong>{filename}</strong>?
          Esta acción no se puede deshacer.
        </p>
        <div className="db-modal-actions">
          <button className="db-btn db-btn--ghost" onClick={onCancel} disabled={loading}>Cancelar</button>
          <button className="db-btn db-btn--danger" onClick={onConfirm} disabled={loading}>
            {loading ? <LuRefreshCw size={13} className="spin" /> : <LuTrash2 size={13} />}
            {loading ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}

//  Import confirm modal (requires typing CONFIRMAR) 
function ImportConfirmModal({ filename, onConfirm, onCancel, loading }) {
  const [text, setText] = useState('');
  const valid = text === 'CONFIRMAR';
  return (
    <div className="db-modal-overlay" onClick={onCancel}>
      <div className="db-modal" onClick={e => e.stopPropagation()} style={{maxWidth:460}}>
        <div className="db-modal-icon" style={{color:'#dc2626'}}><LuTriangleAlert size={24} /></div>
        <h3 className="db-modal-title">Confirmar importación</h3>
        <p className="db-modal-body">
          Esto reemplazará <strong>todos los datos actuales</strong> con el contenido de:<br/>
          <strong style={{color:'#1e293b'}}>{filename}</strong><br/>
          <span style={{color:'#dc2626',fontWeight:600}}>Esta acción no se puede deshacer.</span>
        </p>
        <p style={{fontSize:'13px',color:'#475569',margin:'0 0 8px',textAlign:'left'}}>
          Escribe <strong>CONFIRMAR</strong> para continuar:
        </p>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="CONFIRMAR"
          autoFocus
          style={{
            width:'100%', padding:'8px 12px', marginBottom:'16px', boxSizing:'border-box',
            border:`1.5px solid ${valid ? '#16a34a' : '#e2e8f0'}`, borderRadius:'6px',
            fontSize:'14px', outline:'none', background:'#fff', color:'#1e293b',
          }}
        />
        <div className="db-modal-actions">
          <button className="db-btn db-btn--ghost" onClick={onCancel} disabled={loading}>Cancelar</button>
          <button className="db-btn db-btn--danger" onClick={onConfirm} disabled={!valid || loading}>
            {loading ? <LuRefreshCw size={13} className="spin" /> : <LuUpload size={13} />}
            {loading ? 'Importando...' : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  );
}

//  Helpers 
function formatBytes(b) {
  if (!b) return '0 B';
  const k = 1024, sz = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${sz[i]}`;
}
function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
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
const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

//  Component 
export default function BaseDatos() {
  const [cfg, setCfg] = useState({ enabled:false, frequency:'daily', time:'02:00', dayOfWeek:1, dayOfMonth:1, savePath:'', retentionDays:30, lastBackup:null });
  const [cfgLoading, setCfgLoading] = useState(false);
  const [backups, setBackups]       = useState([]);
  const [totalSize, setTotalSize]   = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [exporting, setExporting]   = useState(false);
  const [importing, setImporting]   = useState(false);
  const [file, setFile]             = useState(null);
  const [dragOver, setDragOver]     = useState(false);
  const fileRef                     = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [toasts, setToasts]         = useState([]);
  const toastId                     = useRef(0);
  const [bkPage, setBkPage]         = useState(1);
  const BK_PAGE_SIZE = 10;

  function addToast(message, type = 'success') {
    const id = ++toastId.current;
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
  }

  const loadConfig = useCallback(async () => {
    try { const { data } = await api.get('/database/config'); setCfg(data); } catch {}
  }, []);

  const loadBackups = useCallback(async () => {
    setListLoading(true);
    try {
      const { data } = await api.get('/database/backups');
      setBackups(data.backups || []);
      setTotalSize(data.totalSize || 0);
      setTotalCount(data.totalCount || 0);
    } catch { addToast('Error al cargar backups', 'error'); }
    finally { setListLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadConfig(); loadBackups(); }, [loadConfig, loadBackups]);

  async function saveConfig() {
    setCfgLoading(true);
    try { await api.post('/database/config', cfg); addToast('Configuración guardada'); }
    catch { addToast('Error al guardar configuración', 'error'); }
    finally { setCfgLoading(false); }
  }

  async function runBackup() {
    setBackupRunning(true);
    try {
      const r = await api.post('/database/backup/run', {}, { responseType:'blob' });
      const cd = r.headers['content-disposition'] || '';
      const name = (cd.match(/filename="([^"]+)"/) || [])[1] || 'backup.sql';
      const url = URL.createObjectURL(r.data);
      Object.assign(document.createElement('a'), { href:url, download:name }).click();
      URL.revokeObjectURL(url);
      setCfg(p => ({ ...p, lastBackup: new Date().toISOString() }));
      await loadBackups();
      addToast('Backup creado y descargado');
    } catch (err) {
      const text = err.response?.data instanceof Blob ? await err.response.data.text() : null;
      let msg = 'Error al crear backup';
      try { msg = JSON.parse(text)?.message || msg; } catch {}
      addToast(msg, 'error');
    } finally { setBackupRunning(false); }
  }

  async function exportDB() {
    setExporting(true);
    try {
      const r = await api.get('/database/export', { responseType:'blob' });
      const cd = r.headers['content-disposition'] || '';
      const name = (cd.match(/filename="([^"]+)"/) || [])[1] || 'export.sql';
      const url = URL.createObjectURL(r.data);
      Object.assign(document.createElement('a'), { href:url, download:name }).click();
      URL.revokeObjectURL(url);
      addToast('Exportación completada');
    } catch { addToast('Error al exportar', 'error'); }
    finally { setExporting(false); }
  }

  async function importDB() {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('sqlFile', file);
      await api.post('/database/import', fd, { headers:{ 'Content-Type':'multipart/form-data' } });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      addToast('Base de datos importada exitosamente');
    } catch (err) { addToast(err.response?.data?.message || 'Error al importar', 'error'); }
    finally { setImporting(false); }
  }

  async function handleImportConfirm() {
    await importDB();
    setImportModalOpen(false);
  }

  async function downloadBackup(filename) {
    try {
      const r = await api.get(`/database/backups/${encodeURIComponent(filename)}`, { responseType:'blob' });
      const url = URL.createObjectURL(r.data);
      Object.assign(document.createElement('a'), { href:url, download:filename }).click();
      URL.revokeObjectURL(url);
    } catch { addToast('Error al descargar', 'error'); }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/database/backups/${encodeURIComponent(deleteTarget)}`);
      setDeleteTarget(null);
      await loadBackups();
      addToast('Backup eliminado');
    } catch { addToast('Error al eliminar', 'error'); }
    finally { setDeleteLoading(false); }
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.toLowerCase().endsWith('.sql')) setFile(f);
    else addToast('Solo se permiten archivos .sql', 'error');
  }

  return (
    <div className="page-wrapper">
      <Navbar />
      <Toast toasts={toasts} onRemove={id => setToasts(p => p.filter(t => t.id !== id))} />
      {deleteTarget && (
        <ConfirmModal
          filename={deleteTarget}
          onConfirm={doDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteLoading}
        />
      )}
      {importModalOpen && (
        <ImportConfirmModal
          filename={file?.name || ''}
          onConfirm={handleImportConfirm}
          onCancel={() => setImportModalOpen(false)}
          loading={importing}
        />
      )}

      <main className="page-content">

        {/* Header */}
        <div className="db-header">
          <div className="db-header-icon"><LuDatabase size={22} /></div>
          <div>
            <h1 className="db-title">Base de Datos</h1>
            <p className="db-subtitle">Gestión de backups, exportación e importación</p>
          </div>
        </div>

        {/* Stats */}
        <div className="db-stats">
          <div className="db-stat">
            <LuHardDrive size={17} className="db-stat-ico ico-blue" />
            <div><span className="db-stat-val">{totalCount}</span><span className="db-stat-lbl">Backups</span></div>
          </div>
          <div className="db-stat">
            <LuServer size={17} className="db-stat-ico ico-purple" />
            <div><span className="db-stat-val">{formatBytes(totalSize)}</span><span className="db-stat-lbl">Almacenado</span></div>
          </div>
          <div className="db-stat">
            <LuClock size={17} className="db-stat-ico ico-teal" />
            <div><span className="db-stat-val">{timeAgo(cfg.lastBackup)}</span><span className="db-stat-lbl">Último backup</span></div>
          </div>
          <div className="db-stat">
            <LuZap size={17} className={`db-stat-ico ${cfg.enabled ? 'ico-green' : 'ico-gray'}`} />
            <div><span className="db-stat-val">{cfg.enabled ? 'Activo' : 'Inactivo'}</span><span className="db-stat-lbl">Programador</span></div>
          </div>
        </div>

        {/* Grid */}
        <div className="db-grid">

          {/*  Backup automático  */}
          <div className="db-card">
            <div className="db-card-hd">
              <span className="db-card-hd-ico ico-blue"><LuClock size={15} /></span>
              <div>
                <h2 className="db-card-title">Backup Automático</h2>
                <p className="db-card-sub">Programa copias de seguridad periódicas</p>
              </div>
              <button className={`db-toggle ${cfg.enabled ? 'on' : ''}`}
                onClick={() => setCfg(p => ({ ...p, enabled: !p.enabled }))}>
                {cfg.enabled ? <LuToggleRight size={22} /> : <LuToggleLeft size={22} />}
                {cfg.enabled ? 'Habilitado' : 'Deshabilitado'}
              </button>
            </div>
            <div className="db-card-body">
              <div className="db-row">
                <div className="db-field">
                  <label className="db-label">Frecuencia</label>
                  <select className="db-select" value={cfg.frequency}
                    onChange={e => setCfg(p => ({ ...p, frequency: e.target.value }))}>
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensual</option>
                  </select>
                </div>
                <div className="db-field">
                  <label className="db-label">Hora</label>
                  <input type="time" className="db-input" value={cfg.time}
                    onChange={e => setCfg(p => ({ ...p, time: e.target.value }))} />
                </div>
                {cfg.frequency === 'weekly' && (
                  <div className="db-field">
                    <label className="db-label">Día</label>
                    <select className="db-select" value={cfg.dayOfWeek}
                      onChange={e => setCfg(p => ({ ...p, dayOfWeek: +e.target.value }))}>
                      {DAYS.map((d,i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                )}
                {cfg.frequency === 'monthly' && (
                  <div className="db-field">
                    <label className="db-label">Día del mes</label>
                    <input type="number" className="db-input" min={1} max={28} value={cfg.dayOfMonth}
                      onChange={e => setCfg(p => ({ ...p, dayOfMonth: +e.target.value }))} />
                  </div>
                )}
              </div>
              <div className="db-field" style={{marginBottom:14}}>
                <label className="db-label"><LuFolder size={11}/> Ruta de guardado</label>
                <input type="text" className="db-input" value={cfg.savePath} placeholder="/ruta/backups"
                  onChange={e => setCfg(p => ({ ...p, savePath: e.target.value }))} />
              </div>
              <div className="db-field" style={{marginBottom:14}}>
                <label className="db-label">Retención de backups (días)</label>
                <select className="db-select" value={cfg.retentionDays}
                  onChange={e => setCfg(p => ({ ...p, retentionDays: +e.target.value }))}>
                  <option value={7}>7 días</option>
                  <option value={14}>14 días</option>
                  <option value={30}>30 días (recomendado)</option>
                  <option value={60}>60 días</option>
                  <option value={90}>90 días</option>
                  <option value={0}>Sin límite</option>
                </select>
                <span style={{fontSize:'11px',color:'#8a99aa',marginTop:'4px',display:'block'}}>
                  Los backups más antiguos de {cfg.retentionDays > 0 ? `${cfg.retentionDays} días` : 'siempre'} se eliminan automáticamente.
                </span>
              </div>
              {cfg.enabled && (
                <div className="db-info">
                  <LuInfo size={13} />
                  <span>Programado: <strong>{{ daily:'Diario', weekly:'Semanal', monthly:'Mensual' }[cfg.frequency]}</strong> a las <strong>{cfg.time}</strong></span>
                </div>
              )}
              <div className="db-actions">
                <button className="db-btn primary" onClick={saveConfig} disabled={cfgLoading}>
                  {cfgLoading ? <LuRefreshCw size={13} className="spin"/> : <LuSave size={13}/>}
                  {cfgLoading ? 'Guardando...' : 'Guardar config'}
                </button>
                <button className="db-btn teal" onClick={runBackup} disabled={backupRunning}>
                  {backupRunning ? <LuRefreshCw size={13} className="spin"/> : <LuPlay size={13}/>}
                  {backupRunning ? 'Creando...' : 'Backup ahora'}
                </button>
              </div>
            </div>
          </div>

          {/*  Exportar  */}
          <div className="db-card">
            <div className="db-card-hd">
              <span className="db-card-hd-ico ico-green"><LuDownload size={15}/></span>
              <div>
                <h2 className="db-card-title">Exportar</h2>
                <p className="db-card-sub">Descarga un volcado SQL completo</p>
              </div>
            </div>
            <div className="db-card-body">
              <p className="db-desc">Genera un archivo <code>.sql</code> con la estructura y datos actuales de la base de datos.</p>
              <button className="db-btn green" onClick={exportDB} disabled={exporting}>
                {exporting ? <LuRefreshCw size={13} className="spin"/> : <LuDownload size={13}/>}
                {exporting ? 'Exportando...' : 'Exportar y descargar'}
              </button>
            </div>
          </div>

          {/*  Importar  */}
          <div className="db-card">
            <div className="db-card-hd">
              <span className="db-card-hd-ico ico-orange"><LuUpload size={15}/></span>
              <div>
                <h2 className="db-card-title">Importar</h2>
                <p className="db-card-sub">Restaura desde un archivo .sql</p>
              </div>
            </div>
            <div className="db-card-body">
              <div className="db-warning">
                <LuTriangleAlert size={14}/>
                <span>Esta acción reemplaza todos los datos actuales. Ten un backup vigente antes de continuar.</span>
              </div>
              <div
                className={`db-dropzone ${dragOver ? 'over' : ''} ${file ? 'has-file' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".sql" style={{display:'none'}}
                  onChange={e => setFile(e.target.files[0] || null)} />
                {file ? (
                  <><LuFileText size={28} style={{color:'#16a34a'}}/><span className="db-drop-name">{file.name}</span><span className="db-drop-size">{formatBytes(file.size)}</span></>
                ) : (
                  <><LuCloudUpload size={28}/><span className="db-drop-main">Arrastra tu .sql aquí</span><span className="db-drop-hint">o haz clic para seleccionar</span></>
                )}
              </div>
              <div className="db-actions" style={{marginTop:12}}>
                <button className="db-btn orange" onClick={() => file && setImportModalOpen(true)} disabled={!file || importing}>
                  {importing ? <LuRefreshCw size={13} className="spin"/> : <LuUpload size={13}/>}
                  {importing ? 'Importando...' : 'Importar base de datos'}
                </button>
              </div>
            </div>
          </div>

          {/*  Historial  */}
          <div className="db-card db-card--full">
            <div className="db-card-hd">
              <span className="db-card-hd-ico ico-purple"><LuHardDrive size={15}/></span>
              <div>
                <h2 className="db-card-title">Historial de Backups</h2>
                <p className="db-card-sub">{totalCount} archivo{totalCount !== 1 ? 's' : ''}  {formatBytes(totalSize)}</p>
              </div>
              <button className="db-btn ghost sm" onClick={loadBackups} disabled={listLoading} style={{marginLeft:'auto'}}>
                <LuRefreshCw size={13} className={listLoading ? 'spin' : ''}/> Actualizar
              </button>
            </div>
            <div className="db-card-body" style={{padding:0}}>
              {listLoading ? (
                <div className="db-loader"><LuRefreshCw size={20} className="spin"/><span>Cargando...</span></div>
              ) : backups.length === 0 ? (
                <div className="db-empty"><LuDatabase size={36}/><p>Sin backups guardados</p><span>Crea el primero con "Backup ahora"</span></div>
              ) : (
                <table className="db-table">
                  <thead><tr>
                    <th>Archivo</th>
                    <th>Fecha</th>
                    <th>Tamaño</th>
                    <th>Acciones</th>
                  </tr></thead>
                  <tbody>
                    {backups.slice((bkPage-1)*BK_PAGE_SIZE, bkPage*BK_PAGE_SIZE).map(b => (
                      <tr key={b.filename}>
                        <td><span className="db-filename"><LuFileText size={14}/>{b.filename}</span></td>
                        <td><span className="db-date"><LuCalendar size={12}/>{formatDate(b.createdAt)}</span></td>
                        <td>{formatBytes(b.size)}</td>
                        <td>
                          <div className="db-row-actions">
                            <button className="db-icon-btn dl" title="Descargar" onClick={() => downloadBackup(b.filename)}><LuDownload size={14}/></button>
                            <button className="db-icon-btn del" title="Eliminar" onClick={() => setDeleteTarget(b.filename)}><LuTrash2 size={14}/></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {backups.length > BK_PAGE_SIZE && (
                <div className="db-pagination">
                  <button className="db-page-btn" onClick={() => setBkPage(p => Math.max(1, p-1))} disabled={bkPage === 1}>‹ Anterior</button>
                  <span className="db-page-info">{bkPage} / {Math.ceil(backups.length / BK_PAGE_SIZE)}</span>
                  <button className="db-page-btn" onClick={() => setBkPage(p => Math.min(Math.ceil(backups.length / BK_PAGE_SIZE), p+1))} disabled={bkPage === Math.ceil(backups.length / BK_PAGE_SIZE)}>Siguiente ›</button>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
