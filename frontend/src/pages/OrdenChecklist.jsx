import { useState, useEffect, useCallback, useContext } from 'react';
import { FiRefreshCw, FiPlusCircle } from 'react-icons/fi';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './OrdenChecklist.css';

const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN'];
const CURRENT_YEAR = new Date().getFullYear();

function pad(n) { return String(n).padStart(4, '0'); }

export default function OrdenChecklist() {
  const { user } = useContext(AuthContext);
  const isAdmin  = ROLES_ADMIN.includes(user?.rol);

  const [anio,    setAnio]    = useState(CURRENT_YEAR);
  const [ordenes, setOrdenes] = useState([]);
  const [anios,   setAnios]   = useState([CURRENT_YEAR]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Modal generar
  const [showGenerar,   setShowGenerar]   = useState(false);
  const [genAnio,       setGenAnio]       = useState(CURRENT_YEAR);
  const [genCantidad,   setGenCantidad]   = useState(100);
  const [genLoading,    setGenLoading]    = useState(false);
  const [genMsg,        setGenMsg]        = useState('');

  // Tooltip hover
  const [tooltip, setTooltip] = useState(null); // { id, x, y }

  const fetchAnios = useCallback(async () => {
    try {
      const { data } = await api.get('/orden-checklist/anios');
      const lista = data.length ? data : [CURRENT_YEAR];
      setAnios(lista);
    } catch { /* silencioso */ }
  }, []);

  const fetchOrdenes = useCallback(async (a) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/orden-checklist?anio=${a}`);
      setOrdenes(data);
    } catch {
      setError('Error al cargar las órdenes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnios();
  }, [fetchAnios]);

  useEffect(() => {
    fetchOrdenes(anio);
  }, [anio, fetchOrdenes]);

  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Generar órdenes ────────────────────────────────────────────────────
  const handleGenerar = async () => {
    setGenLoading(true);
    setGenMsg('');
    try {
      const { data } = await api.post('/orden-checklist/generar', { anio: genAnio, cantidad: genCantidad });
      await fetchAnios();
      if (genAnio === anio) await fetchOrdenes(anio);
      else setAnio(genAnio);
      setShowGenerar(false);
      showToast(data.message, 'ok');
    } catch (e) {
      setGenMsg(e.response?.data?.message || 'Error al generar órdenes.');
    } finally {
      setGenLoading(false);
    }
  };

  // ── Estadísticas ───────────────────────────────────────────────────────
  const total    = ordenes.length;
  const usadas   = ordenes.filter(o => o.estado === 'usado').length;
  const libres   = ordenes.filter(o => o.estado === 'libre').length;
  const reservadas = ordenes.filter(o => o.estado === 'reservado').length;

  return (
    <>
      <Navbar />
      <div className="oc-page">

        {/* ── Header ── */}
        <div className="oc-header">
          <div className="oc-header-left">
            <h1 className="oc-title">Órdenes de Checklist</h1>
            <p className="oc-subtitle">Control de correlativos por año</p>
          </div>
          <div className="oc-header-right">
            <select
              className="oc-year-select"
              value={anio}
              onChange={e => setAnio(+e.target.value)}
            >
              {anios.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button className="oc-btn-refresh" onClick={() => fetchOrdenes(anio)} title="Actualizar">
              <FiRefreshCw />
            </button>
            {isAdmin && (
              <button className="oc-btn-generar" onClick={() => { setShowGenerar(true); setGenMsg(''); }}>
                <FiPlusCircle /> Generar órdenes
              </button>
            )}
          </div>
        </div>

        {/* ── Estadísticas ── */}
        <div className="oc-stats">
          <div className="oc-stat">
            <span className="oc-stat-val">{total}</span>
            <span className="oc-stat-lbl">Total</span>
          </div>
          <div className="oc-stat oc-stat--libre">
            <span className="oc-stat-val">{libres}</span>
            <span className="oc-stat-lbl">Libres</span>
          </div>
          <div className="oc-stat oc-stat--reservado">
            <span className="oc-stat-val">{reservadas}</span>
            <span className="oc-stat-lbl">Reservadas</span>
          </div>
          <div className="oc-stat oc-stat--usado">
            <span className="oc-stat-val">{usadas}</span>
            <span className="oc-stat-lbl">Usadas</span>
          </div>
        </div>

        {/* ── Leyenda ── */}
        <div className="oc-leyenda">
          <span className="oc-ley-item"><span className="oc-ley-box oc-ley-libre" />Libre</span>
          <span className="oc-ley-item"><span className="oc-ley-box oc-ley-reservado" />Reservada</span>
          <span className="oc-ley-item"><span className="oc-ley-box oc-ley-usado" />Usada</span>
        </div>

        {/* ── Error ── */}
        {error && <p className="oc-error">{error}</p>}

        {/* ── Grid de órdenes ── */}
        {loading ? (
          <div className="oc-loading">Cargando órdenes...</div>
        ) : ordenes.length === 0 ? (
          <div className="oc-empty">
            <p>No hay órdenes para el año {anio}.</p>
            {isAdmin && <p>Usa "Generar órdenes" para crear el correlativo.</p>}
          </div>
        ) : (
          <div className="oc-grid">
            {ordenes.map(o => (
              <div
                key={o.id}
                className={`oc-cell oc-cell--${o.estado}`}
                onMouseEnter={e => {
                  if (o.estado !== 'libre') {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltip({ o, x: rect.left, y: rect.bottom + 6 });
                  }
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                {pad(o.numero)}
              </div>
            ))}
          </div>
        )}

        {/* ── Toast ── */}
        {toast && (
          <div className={`oc-toast oc-toast--${toast.type}`}>{toast.msg}</div>
        )}

        {/* ── Tooltip ── */}
        {tooltip && (
          <div
            className="oc-tooltip"
            style={{ top: tooltip.y + window.scrollY, left: tooltip.x }}
          >
            <strong>{pad(tooltip.o.numero)}-{anio}</strong>
            {tooltip.o.checklist_numero && (
              <span>Checklist: {tooltip.o.checklist_numero}-{anio}</span>
            )}
            <span>👤 {tooltip.o.usuario_nombre || '—'}</span>
            {tooltip.o.fecha_registro && (
              <span>🕐 {new Date(tooltip.o.fecha_registro).toLocaleString('es-HN')}</span>
            )}
          </div>
        )}

        {/* ── Modal generar órdenes ── */}
        {showGenerar && (
          <div className="oc-modal-overlay" onClick={() => setShowGenerar(false)}>
            <div className="oc-modal" onClick={e => e.stopPropagation()}>
              <h2 className="oc-modal-title">Generar Órdenes</h2>

              <div className="oc-modal-row">
                <label>Año</label>
                <input
                  type="number"
                  className="oc-input"
                  value={genAnio}
                  min={2020} max={2100}
                  onChange={e => setGenAnio(+e.target.value)}
                />
              </div>
              <div className="oc-modal-row">
                <label>Cantidad a agregar</label>
                <input
                  type="number"
                  className="oc-input"
                  value={genCantidad}
                  min={1} max={1000}
                  onChange={e => setGenCantidad(+e.target.value)}
                />
                <small>Se agregarán después del último número existente para ese año.</small>
              </div>

              {genMsg && <p className={`oc-modal-msg ${genMsg.includes('Error') ? 'oc-modal-msg--err' : 'oc-modal-msg--ok'}`}>{genMsg}</p>}

              <div className="oc-modal-actions">
                <button className="oc-btn-cancel" onClick={() => setShowGenerar(false)}>Cancelar</button>
                <button className="oc-btn-confirm" onClick={handleGenerar} disabled={genLoading}>
                  {genLoading ? 'Generando...' : 'Generar'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
