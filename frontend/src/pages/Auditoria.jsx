import { useEffect, useState, useCallback, useRef } from 'react';
import {
  FiShield, FiAlertTriangle, FiXCircle,
  FiFilter, FiTrash2, FiRefreshCw, FiUser, FiWifi, FiDownload,
  FiActivity, FiClock, FiTag, FiFileText, FiX, FiPlay, FiPause,
} from 'react-icons/fi';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import './Auditoria.css';

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

const ACCION_LABELS = {
  LOGIN_OK:       { label: 'Login exitoso',    color: 'success' },
  LOGIN_FAIL:     { label: 'Login fallido',     color: 'danger'  },
  IP_BLOQUEADA:   { label: 'IP bloqueada',      color: 'blocked' },
  CREAR:          { label: 'Crear',             color: 'info'    },
  ACTUALIZAR:     { label: 'Actualizar',        color: 'warning' },
  ELIMINAR:       { label: 'Eliminar',          color: 'danger'  },
  ACCESO_DENEGADO:{ label: 'Acceso denegado',   color: 'blocked' },
};

const MODULOS = [
  'auth', 'BASE_DATOS', 'caja', 'diputados', 'alcaldes',
  'ayudas', 'ayudas_alcaldias', 'autorizaciones', 'constancias',
  'presupuesto', 'viaticos', 'auditoria', 'users', 'modulos', 'chat',
];

const RESULTADO_COLORS = { EXITO: 'success', FALLO: 'danger', BLOQUEADO: 'blocked' };

const EMPTY_FILTERS = { accion: '', modulo: '', resultado: '', ip: '', usuario: '', desde: '', hasta: '' };

export default function Auditoria() {
  const [logs,        setLogs]        = useState([]);
  const [stats,       setStats]       = useState(null);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [filters,     setFilters]     = useState(EMPTY_FILTERS);
  const [applied,     setApplied]     = useState(EMPTY_FILTERS);
  const [toast,       setToast]       = useState(null);
  const [purgeConf,   setPurgeConf]   = useState(false);
  const [purgeDias,   setPurgeDias]   = useState(90);
  const [exporting,   setExporting]   = useState(false);
  const [detailRow,   setDetailRow]   = useState(null);   // modal detalle
  const [autoRefresh, setAutoRefresh] = useState(false);  // auto-refresh
  const autoRefreshRef = useRef(null);

  const LIMIT = 10;

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const fetchStats = useCallback(async () => {
    try {
      const r = await api.get('/auditoria/stats', { headers: authHeaders() });
      setStats(r.data);
    } catch { /* silencioso */ }
  }, []);

  const fetchLogs = useCallback(async (pageNum = 1, f = applied) => {
    try {
      setLoading(true);
      const params = { page: pageNum, limit: LIMIT, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) };
      const r = await api.get('/auditoria', { headers: authHeaders(), params });
      setLogs(r.data.data);
      setTotal(r.data.total);
      setPage(pageNum);
    } catch {
      showToast('Error al cargar el registro de auditoría.', 'error');
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    fetchStats();
    fetchLogs(1, EMPTY_FILTERS);
    // Pre-cargar logo para que el PDF se genere sin operaciones async extra
    if (!window.__auditLogo) {
      fetch('/logo-congreso.png.png')
        .then(r => r.blob())
        .then(blob => {
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            try {
              const c = document.createElement('canvas');
              c.width  = img.naturalWidth;
              c.height = img.naturalHeight;
              const ctx = c.getContext('2d');
              ctx.fillStyle = '#fff';
              ctx.fillRect(0, 0, c.width, c.height);
              ctx.drawImage(img, 0, 0);
              window.__auditLogo = c.toDataURL('image/jpeg', 0.95);
            } catch (_) { /* continuar sin logo */ }
            URL.revokeObjectURL(url);
          };
          img.onerror = () => URL.revokeObjectURL(url);
          img.src = url;
        })
        .catch(() => { /* sin logo */ });
    }
  }, []);

  const handleApply = () => {
    setApplied({ ...filters });
    fetchLogs(1, filters);
    fetchStats();
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    fetchLogs(1, EMPTY_FILTERS);
    fetchStats();
  };

  // ── Auto-refresh ───────────────────────────────────────────
  const appliedRef = useRef(applied);
  const pageRef    = useRef(page);
  useEffect(() => { appliedRef.current = applied; }, [applied]);
  useEffect(() => { pageRef.current    = page;    }, [page]);

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => {
        fetchLogs(pageRef.current, appliedRef.current);
        fetchStats();
      }, 30000);
    } else {
      clearInterval(autoRefreshRef.current);
    }
    return () => clearInterval(autoRefreshRef.current);
  }, [autoRefresh, fetchLogs, fetchStats]);

  // ── CSV Export ─────────────────────────────────────────────
  const handleExportCSV = async () => {
    try {
      const params = Object.fromEntries(Object.entries(applied).filter(([, v]) => v));
      const r = await api.get('/auditoria/export', { headers: authHeaders(), params });
      const rows = r.data;
      const ACCION_MAP = {
        LOGIN_OK:'Login exitoso', LOGIN_FAIL:'Login fallido',
        IP_BLOQUEADA:'IP bloqueada', CREAR:'Crear',
        ACTUALIZAR:'Actualizar', ELIMINAR:'Eliminar',
        ACCESO_DENEGADO:'Acceso denegado',
      };
      const header = ['Fecha', 'Accion', 'Modulo', 'Usuario', 'IP', 'Metodo', 'Ruta', 'Detalle', 'Resultado'];
      const csvRows = rows.map(row => [
        formatFecha(row.creado_en),
        ACCION_MAP[row.accion] || row.accion || '',
        row.modulo || '',
        row.usuario_nombre || 'Anonimo',
        row.ip || '',
        row.metodo || '',
        row.ruta || '',
        (row.detalle || '').replace(/"/g, '""'),
        row.resultado || '',
      ].map(v => `"${v}"`).join(','));
      const csv = [header.join(','), ...csvRows].join('\r\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `auditoria-${new Date().toISOString().substring(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('CSV exportado correctamente.', 'success');
    } catch {
      showToast('Error al exportar CSV.', 'error');
    }
  };

  // ── purgar ─────────────────────────────────────────────────
  const handlePurge = async () => {
    try {
      const r = await api.delete(`/auditoria/purge?dias=${purgeDias}`, { headers: authHeaders() });
      showToast(r.data.message);
      setPurgeConf(false);
      fetchLogs(1, applied);
      fetchStats();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al eliminar registros.', 'error');
      setPurgeConf(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  function formatFecha(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'medium' });
  }

  // ── helpers ────────────────────────────────────────────
  const sa = s => (s || '').replace(/[ÁÉÍÓÚÑáéíóúñ]/g,
    c => ({ Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U',Ñ:'N',
             á:'a',é:'e',í:'i',ó:'o',ú:'u',ñ:'n' }[c] || c));

  // ── PDF Export ─────────────────────────────────────────
  const handleExportPDF = async () => {
    try {
      setExporting(true);
      const params = Object.fromEntries(Object.entries(applied).filter(([, v]) => v));
      const r = await api.get('/auditoria/export', { headers: authHeaders(), params });
      const rows = r.data;

      const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
      const PW   = doc.internal.pageSize.getWidth();
      const PH   = doc.internal.pageSize.getHeight();
      const L    = 12;
      const R    = PW - 12;
      const CW   = R - L;
      const AZUL   = [39,  76, 141];
      const BLANCO = [255, 255, 255];

      const drawPage = () => {
        // borde exterior
        doc.setDrawColor(...AZUL);
        doc.setLineWidth(1.2);
        doc.rect(L - 4, 7, CW + 8, PH - 14, 'S');

        // ── encabezado ──
        const LOGO_W = 44;
        const HDR_H  = 34;
        let y = 12;

        doc.setFillColor(...BLANCO);
        doc.setDrawColor(...AZUL);
        doc.setLineWidth(0.5);
        doc.rect(L, y, CW, HDR_H, 'FD');

        const logoImg = window.__auditLogo || null;
        if (logoImg) {
          const lSize = HDR_H - 6;
          doc.addImage(logoImg, 'JPEG', L + (LOGO_W - lSize) / 2, y + 3, lSize, lSize);
        }

        // separador logo / centro
        doc.setDrawColor(180, 200, 235);
        doc.setLineWidth(0.3);
        doc.line(L + LOGO_W, y + 4, L + LOGO_W, y + HDR_H - 4);

        const INFO_W = 58;
        const midEnd = R - INFO_W;
        const midCX  = L + LOGO_W + (midEnd - L - LOGO_W) / 2;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...AZUL);
        doc.text('REPUBLICA DE HONDURAS', midCX, y + 10, { align: 'center' });
        doc.setFontSize(11);
        doc.text('CONGRESO NACIONAL',     midCX, y + 20, { align: 'center' });
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 100, 140);
        doc.text('Control Interno',       midCX, y + 29, { align: 'center' });

        // panel derecho — fondo azul claro
        const INFO_X = R - INFO_W;
        doc.setFillColor(237, 241, 250);
        doc.setDrawColor(...AZUL);
        doc.setLineWidth(0.3);
        doc.rect(INFO_X, y, INFO_W, HDR_H, 'FD');

        const now = new Date();
        const fechaStr = now.toLocaleDateString('es-GT', { day:'2-digit', month:'2-digit', year:'numeric' });
        const horaStr  = now.toLocaleTimeString('es-GT', { hour:'2-digit', minute:'2-digit' });
        const LBL_X = INFO_X + 5;
        const VAL_X = INFO_X + 22;
        const ROW_H = 9;
        const startInfoY = y + (HDR_H - ROW_H * 3) / 2 + 5;

        [['FECHA:', fechaStr], ['HORA:', horaStr], ['TOTAL:', `${rows.length} registros`]].forEach(([lbl, val], i) => {
          const ry = startInfoY + i * ROW_H;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(...AZUL);
          doc.text(lbl, LBL_X, ry);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(20, 20, 20);
          doc.text(val, VAL_X, ry);
        });

        y += HDR_H;
        const TBAR_H = 9;
        doc.setFillColor(...AZUL);
        doc.setDrawColor(...AZUL);
        doc.setLineWidth(0);
        doc.rect(L, y, CW, TBAR_H, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...BLANCO);
        doc.text('REGISTRO DE AUDITORIA DEL SISTEMA', PW / 2, y + 6.2, { align: 'center' });

        return y + TBAR_H + 2;
      };

      // El logo ya fue pre-cargado en el useEffect de montaje
      const startY = drawPage();

      const ACCION_MAP = {
        LOGIN_OK:'Login exitoso', LOGIN_FAIL:'Login fallido',
        IP_BLOQUEADA:'IP bloqueada', CREAR:'Crear',
        ACTUALIZAR:'Actualizar', ELIMINAR:'Eliminar',
        ACCESO_DENEGADO:'Acceso denegado',
      };

      autoTable(doc, {
        startY,
        margin: { top: 57, left: L, right: 14 },
        head: [['Fecha', 'Accion', 'Modulo', 'Usuario', 'IP', 'Detalle', 'Resultado']],
        body: rows.map(row => [
          formatFecha(row.creado_en),
          sa(ACCION_MAP[row.accion] || row.accion || '—'),
          sa(row.modulo || '—'),
          sa(row.usuario_nombre || 'Anonimo'),
          row.ip || '—',
          sa((row.detalle || '—').substring(0, 70)),
          row.resultado || '—',
        ]),
        styles: { fontSize: 7.5, cellPadding: 3, font: 'helvetica', textColor: [20,20,20], overflow: 'ellipsize' },
        headStyles: { fillColor: AZUL, textColor: BLANCO, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 248, 255] },
        columnStyles: {
          0: { cellWidth: 32 },
          1: { cellWidth: 26 },
          2: { cellWidth: 22 },
          3: { cellWidth: 38 },
          4: { cellWidth: 22 },
          5: { cellWidth: 'auto' },
          6: { cellWidth: 20 },
        },
        willDrawPage: (data) => {
          if (data.pageNumber > 1) drawPage();
        },
        didDrawPage: (data) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(140, 150, 165);
          doc.text(`Pagina ${data.pageNumber}`, PW / 2, PH - 8, { align: 'center' });
        },
      });

      const fecha = new Date().toISOString().substring(0, 10);
      doc.save(`auditoria-${fecha}.pdf`);
      showToast('PDF generado correctamente.', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('Error al generar el PDF. Revise la consola para más detalles.', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page-wrapper">
      <Navbar />
      <main className="page-content">

        {/* ── Banner ── */}
        <div className="aud-banner">
          <div className="aud-banner-icon"><FiShield size={28} /></div>
          <div className="aud-banner-text">
            <h1 className="aud-banner-title">Auditoría del Sistema</h1>
            <p className="aud-banner-sub">Registro completo de accesos, acciones y eventos de seguridad</p>
          </div>
          <div className="aud-banner-actions">
            <button
              className={`btn-autorefresh ${autoRefresh ? 'on' : ''}`}
              onClick={() => setAutoRefresh(v => !v)}
              title={autoRefresh ? 'Detener auto-refresh' : 'Activar auto-refresh cada 30s'}
            >
              {autoRefresh ? <><FiPause size={13} /> En vivo</> : <><FiPlay size={13} /> Auto</>}
            </button>
            <button className="btn-csv" onClick={handleExportCSV}>
              <FiFileText size={14} /> CSV
            </button>
            <button className="btn-pdf" onClick={handleExportPDF} disabled={exporting}>
              <FiDownload size={14} /> {exporting ? 'Generando…' : 'PDF'}
            </button>
            <button className="btn-danger-outline" onClick={() => setPurgeConf(true)}>
              <FiTrash2 size={14} /> Eliminar
            </button>
          </div>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="aud-stats">
            <div className="aud-stat-card">
              <div className="aud-stat-ico aud-ico-blue"><FiActivity size={18} /></div>
              <span className="aud-stat-num">{stats.total ?? 0}</span>
              <span className="aud-stat-label">Total eventos</span>
            </div>
            <div className="aud-stat-card">
              <div className="aud-stat-ico aud-ico-teal"><FiClock size={18} /></div>
              <span className="aud-stat-num">{stats.hoy ?? 0}</span>
              <span className="aud-stat-label">Hoy</span>
            </div>
            <div className="aud-stat-card danger">
              <div className="aud-stat-ico aud-ico-red"><FiXCircle size={18} /></div>
              <span className="aud-stat-num">{stats.login_fallidos ?? 0}</span>
              <span className="aud-stat-label">Logins fallidos</span>
            </div>
            <div className="aud-stat-card blocked">
              <div className="aud-stat-ico aud-ico-orange"><FiWifi size={18} /></div>
              <span className="aud-stat-num">{stats.bloqueados ?? 0}</span>
              <span className="aud-stat-label">IPs bloqueadas</span>
            </div>
            <div className="aud-stat-card warning">
              <div className="aud-stat-ico aud-ico-yellow"><FiAlertTriangle size={18} /></div>
              <span className="aud-stat-num">{stats.errores ?? 0}</span>
              <span className="aud-stat-label">Errores</span>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="aud-filters">
          <p className="aud-filters-title"><FiFilter size={12} /> Filtrar registros</p>
          <div className="aud-filter-grid">
            <div className="aud-filter-field">
              <label>Acción</label>
              <select value={filters.accion} onChange={e => setFilters(f => ({ ...f, accion: e.target.value }))}>
                <option value="">Todas las acciones</option>
                {Object.entries(ACCION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            <div className="aud-filter-field">
              <label>Resultado</label>
              <select value={filters.resultado} onChange={e => setFilters(f => ({ ...f, resultado: e.target.value }))}>
                <option value="">Todos los resultados</option>
                <option value="EXITO">Éxito</option>
                <option value="FALLO">Fallo</option>
                <option value="BLOQUEADO">Bloqueado</option>
              </select>
            </div>

            <div className="aud-filter-field">
              <label>Módulo</label>
              <select value={filters.modulo} onChange={e => setFilters(f => ({ ...f, modulo: e.target.value }))}>
                <option value="">Todos los módulos</option>
                {MODULOS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="aud-filter-field">
              <label>IP</label>
              <input
                placeholder="ej. 192.168.1.1"
                value={filters.ip}
                onChange={e => setFilters(f => ({ ...f, ip: e.target.value }))}
              />
            </div>

            <div className="aud-filter-field">
              <label>Usuario</label>
              <input
                placeholder="Nombre de usuario"
                value={filters.usuario}
                onChange={e => setFilters(f => ({ ...f, usuario: e.target.value }))}
              />
            </div>

            <div className="aud-filter-field">
              <label>Desde</label>
              <input type="date" value={filters.desde} onChange={e => setFilters(f => ({ ...f, desde: e.target.value }))} />
            </div>

            <div className="aud-filter-field">
              <label>Hasta</label>
              <input type="date" value={filters.hasta} onChange={e => setFilters(f => ({ ...f, hasta: e.target.value }))} />
            </div>

            <div className="aud-filter-actions">
              <button className="btn-primary" onClick={handleApply}><FiFilter size={14} /> Filtrar</button>
              <button className="btn-secondary" onClick={handleReset}><FiRefreshCw size={14} /> Limpiar</button>
            </div>
          </div>
        </div>

        {/* Filtros activos */}
        {Object.values(applied).some(v => v) && (
          <div className="aud-active-filters">
            <span className="aud-active-label"><FiFilter size={12} /> Filtros activos:</span>
            {Object.entries(applied).filter(([, v]) => v).map(([k, v]) => (
              <span key={k} className="aud-active-tag">
                <FiTag size={10} /> {k}: <strong>{v}</strong>
                <button onClick={() => {
                  const nf = { ...filters, [k]: '' };
                  setFilters(nf);
                  setApplied(nf);
                  fetchLogs(1, nf);
                }}>×</button>
              </span>
            ))}
            <button className="aud-clear-all" onClick={handleReset}>Limpiar todos</button>
          </div>
        )}

        {/* Tabla */}
        <div className="aud-table-wrap">
          {loading ? (
            <table className="aud-table">
              <thead>
                <tr>
                  <th>Fecha</th><th>Acción</th><th>Módulo</th>
                  <th>Usuario</th><th>IP</th><th>Detalle</th><th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="aud-skeleton-row">
                    <td><span className="aud-skeleton" style={{ width: 90 }} /></td>
                    <td><span className="aud-skeleton" style={{ width: 70 }} /></td>
                    <td><span className="aud-skeleton" style={{ width: 55 }} /></td>
                    <td><span className="aud-skeleton" style={{ width: 110 }} /></td>
                    <td><span className="aud-skeleton" style={{ width: 80 }} /></td>
                    <td><span className="aud-skeleton" style={{ width: 180 }} /></td>
                    <td><span className="aud-skeleton" style={{ width: 55 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : logs.length === 0 ? (
            <div className="aud-empty">
              <FiShield size={38} style={{ color: '#cbd5e0', marginBottom: 10 }} />
              <p>No hay registros con los filtros aplicados.</p>
            </div>
          ) : (
            <table className="aud-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Acción</th>
                  <th>Módulo</th>
                  <th><FiUser size={11} /> Usuario</th>
                  <th><FiWifi size={11} /> IP</th>
                  <th>Detalle</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(row => {
                  const accionInfo = ACCION_LABELS[row.accion] || { label: row.accion, color: 'info' };
                  const resColor   = RESULTADO_COLORS[row.resultado] || 'info';
                  return (
                    <tr key={row.id} className="aud-row-clickable" onClick={() => setDetailRow(row)} title="Ver detalle">
                      <td className="aud-td-fecha">{formatFecha(row.creado_en)}</td>
                      <td><span className={`aud-badge ${accionInfo.color}`}>{accionInfo.label}</span></td>
                      <td><span className="aud-modulo-tag">{row.modulo || '—'}</span></td>
                      <td>{row.usuario_nombre || <span className="aud-anon">Anónimo</span>}</td>
                      <td className="aud-td-ip">{row.ip}</td>
                      <td className="aud-td-detalle" title={row.detalle}>{row.detalle ? row.detalle.substring(0, 70) + (row.detalle.length > 70 ? '…' : '') : '—'}</td>
                      <td><span className={`aud-badge ${resColor}`}>{row.resultado}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginación */}
        {!loading && (
          <div className="std-pg">
            <span className="std-pg-info">
              {Math.min((page - 1) * LIMIT + 1, total)}–{Math.min(page * LIMIT, total)} de <strong>{total}</strong> registros
            </span>
            <div className="std-pg-controls">
              <button className="std-pg-btn" disabled={page <= 1} onClick={() => fetchLogs(1)}>«</button>
              <button className="std-pg-btn" disabled={page <= 1} onClick={() => fetchLogs(page - 1)}>‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                .reduce((acc, n, i, arr) => {
                  if (i > 0 && n - arr[i - 1] > 1) acc.push('…');
                  acc.push(n); return acc;
                }, [])
                .map((n, i) => n === '…'
                  ? <span key={`e${i}`} className="std-pg-ellipsis">…</span>
                  : <button key={n} className={`std-pg-btn std-pg-num${page === n ? ' std-pg-num--active' : ''}`} onClick={() => fetchLogs(n)}>{n}</button>
                )}
              <button className="std-pg-btn" disabled={page >= totalPages} onClick={() => fetchLogs(page + 1)}>›</button>
              <button className="std-pg-btn" disabled={page >= totalPages} onClick={() => fetchLogs(totalPages)}>»</button>
            </div>
            <span className="std-pg-total">Pág. <strong>{page}</strong> / {totalPages}</span>
          </div>
        )}

        {/* Modal detalle fila */}
        {detailRow && (
          <div className="modal-overlay" onClick={() => setDetailRow(null)}>
            <div className="modal-box modal-detail" onClick={e => e.stopPropagation()}>
              <div className="modal-detail-header">
                <div className="modal-detail-title">
                  <FiShield size={18} />
                  <span>Detalle del evento</span>
                </div>
                <button className="modal-detail-close" onClick={() => setDetailRow(null)}><FiX size={18} /></button>
              </div>
              <div className="modal-detail-body">
                {[
                  ['Fecha / Hora', formatFecha(detailRow.creado_en)],
                  ['Acción', (ACCION_LABELS[detailRow.accion]?.label || detailRow.accion)],
                  ['Módulo', detailRow.modulo],
                  ['Usuario', detailRow.usuario_nombre || 'Anónimo'],
                  ['IP', detailRow.ip],
                  ['Método HTTP', detailRow.metodo],
                  ['Ruta', detailRow.ruta],
                  ['Resultado', detailRow.resultado],
                  ['Detalle', detailRow.detalle],
                ].map(([label, value]) => (
                  <div key={label} className="modal-detail-row">
                    <span className="modal-detail-label">{label}</span>
                    <span className="modal-detail-value">{value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal purgar */}
        {purgeConf && (
          <div className="modal-overlay" onClick={() => setPurgeConf(false)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <h3><FiAlertTriangle size={18} style={{ color: '#e53e3e', marginRight: 8 }} />Eliminar registros de auditoría</h3>
              <p>Se eliminarán todos los registros con más de <strong>{purgeDias} días</strong> de antigüedad. Esta acción no se puede deshacer.</p>
              <div className="modal-field">
                <label>Eliminar registros mayores a (días)</label>
                <input
                  type="number"
                  min={7}
                  value={purgeDias}
                  onChange={e => setPurgeDias(Math.max(7, parseInt(e.target.value) || 7))}
                />
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setPurgeConf(false)}>Cancelar</button>
                <button className="btn-danger" onClick={handlePurge}>Sí, eliminar</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`toast toast-${toast.type}`}>
            <span className="toast-msg">{toast.msg}</span>
            <button className="toast-close" onClick={() => setToast(null)}>×</button>
          </div>
        )}

      </main>
    </div>
  );
}
