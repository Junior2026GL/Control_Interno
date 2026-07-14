import { useState, useEffect, useCallback } from 'react';
import { FiPrinter, FiClock, FiUser, FiRefreshCw } from 'react-icons/fi';
import api from '../api';
import Layout from '../components/Layout';
import './ImprimirFirma.css';

function fmtFecha(val) {
  if (!val) return '—';
  const d = new Date(val);
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
}

export default function ImprimirFirma() {
  const [historial, setHistorial]   = useState([]);
  const [loading,   setLoading]     = useState(false);
  const [printing,  setPrinting]    = useState(false);
  const [toast,     setToast]       = useState(null);

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
      const blob    = new Blob([res.data], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      // Imprimir directo sin descargar — iframe oculto
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;';
      document.body.appendChild(iframe);
      iframe.src = blobUrl;
      iframe.onload = () => {
        try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (_) {}
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(blobUrl);
        }, 60000);
      };

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

  return (
    <Layout>
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
            {printing ? 'Generando…' : 'Imprimir Firma'}
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
                    <th>Total del usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((row, i) => (
                    <tr key={row.id}>
                      <td>{historial.length - i}</td>
                      <td>{row.usuario_nombre}</td>
                      <td>{fmtFecha(row.fecha_hora)}</td>
                      <td className="if-ip">{row.ip_cliente || '—'}</td>
                      <td className="if-total">{row.total_impresiones}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
