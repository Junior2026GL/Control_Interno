import { useState, useEffect, useCallback } from 'react';
import { FiPrinter, FiClock, FiUser, FiRefreshCw } from 'react-icons/fi';
import printJS from 'print-js';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import './ImprimirFirma.css';

function fmtFecha(val) {
  if (!val) return '—';
  const d = new Date(val);
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function ImprimirFirma() {
  const [historial, setHistorial]   = useState([]);
  const [loading,   setLoading]     = useState(false);
  const [printing,  setPrinting]    = useState(false);
  const [toast,     setToast]       = useState(null);
  const [page,      setPage]        = useState(1);
  const [pageSize,  setPageSize]    = useState(20);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchHistorial = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/firma/historial');
      setHistorial(data);
    } catch {
      showToast('Error al cargar el historial.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistorial(); }, [fetchHistorial]);

  async function handleImprimir() {
    setPrinting(true);
    try {
      const res = await api.post('/firma/imprimir', {}, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        printJS({ printable: base64, type: 'pdf', base64: true });
      };
      reader.readAsDataURL(blob);

      fetchHistorial();
    } catch {
      showToast('Error al generar el PDF.', 'error');
    } finally {
      setPrinting(false);
    }
  }

  // Resumen: total impresiones por usuario
  const resumen = historial.reduce((acc, row) => {
    const key = row.usuario_nombre;
    if (!acc[key]) acc[key] = { nombre: key, total: 0 };
    acc[key].total++;
    return acc;
  }, {});
  const resumenList = Object.values(resumen).sort((a, b) => b.total - a.total);

  const totalPages  = Math.max(1, Math.ceil(historial.length / pageSize));
  const paginated   = historial.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <Navbar />
      <div className="if-container">
        {toast && <div className={`if-toast if-toast-${toast.type}`}>{toast.msg}</div>}

        <div className="if-header">
          <h1 className="if-title">
            <FiPrinter /> Imprimir Firma
          </h1>
          <p className="if-subtitle">Genera e imprime la firma directamente sobre el formulario.</p>
        </div>

        {/* Botón principal */}
        <div className="if-print-section">
          <button
            className="if-btn-print"
            onClick={handleImprimir}
            disabled={printing}
          >
            <FiPrinter size={22} />
            {printing ? 'Generando…' : 'Imprimir Orden Firma'}
          </button>
        </div>

        {/* Resumen por usuario */}
        {resumenList.length > 0 && (
          <div className="if-summary">
            <h2 className="if-section-title"><FiUser /> Impresiones por usuario</h2>
            <div className="if-summary-grid">
              {resumenList.map(u => (
                <div key={u.nombre} className="if-summary-card">
                  <span className="if-summary-name">{u.nombre}</span>
                  <span className="if-summary-count">{u.total}</span>
                  <span className="if-summary-label">{u.total === 1 ? 'impresión' : 'impresiones'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Historial detallado */}
        <div className="if-historial">
          <div className="if-historial-header">
            <h2 className="if-section-title"><FiClock /> Historial de impresiones</h2>
            <button className="if-btn-refresh" onClick={fetchHistorial} disabled={loading} title="Actualizar">
              <FiRefreshCw size={15} className={loading ? 'if-spin' : ''} />
            </button>
          </div>

          {historial.length === 0 && !loading ? (
            <p className="if-empty">Aún no hay impresiones registradas.</p>
          ) : (
            <div className="if-table-wrap">
              <table className="if-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Usuario</th>
                    <th>Fecha y hora</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((row, i) => (
                    <tr key={row.id}>
                      <td>{historial.length - ((page - 1) * pageSize) - i}</td>
                      <td>{row.usuario_nombre}</td>
                      <td>{fmtFecha(row.fecha_hora)}</td>
                      <td className="if-ip">{row.ip_cliente || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginación */}
          {historial.length > 0 && (
            <div className="std-pg">
              <span className="std-pg-info">
                {Math.min((page - 1) * pageSize + 1, historial.length)}–{Math.min(page * pageSize, historial.length)} de <strong>{historial.length}</strong> impresiones
              </span>
              <div className="std-pg-controls">
                <select className="std-pg-size-select" value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s} por pág.</option>)}
                </select>
                <button className="std-pg-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
                <button className="std-pg-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                {(() => {
                  const maxBtns = 7;
                  let start = Math.max(1, page - Math.floor(maxBtns / 2));
                  let end   = Math.min(totalPages, start + maxBtns - 1);
                  if (end - start < maxBtns - 1) start = Math.max(1, end - maxBtns + 1);
                  const nums = [];
                  if (start > 1) {
                    nums.push(<button key={1} className="std-pg-btn std-pg-num" onClick={() => setPage(1)}>1</button>);
                    if (start > 2) nums.push(<span key="el" className="std-pg-ellipsis">…</span>);
                  }
                  for (let p = start; p <= end; p++) {
                    nums.push(<button key={p} className={`std-pg-btn std-pg-num${page === p ? ' std-pg-num--active' : ''}`} onClick={() => setPage(p)}>{p}</button>);
                  }
                  if (end < totalPages) {
                    if (end < totalPages - 1) nums.push(<span key="er" className="std-pg-ellipsis">…</span>);
                    nums.push(<button key={totalPages} className="std-pg-btn std-pg-num" onClick={() => setPage(totalPages)}>{totalPages}</button>);
                  }
                  return nums;
                })()}
                <button className="std-pg-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                <button className="std-pg-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
              </div>
              <span className="std-pg-total">Pág. <strong>{page}</strong> / {totalPages}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
