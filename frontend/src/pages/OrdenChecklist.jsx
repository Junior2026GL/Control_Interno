import { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { FiRefreshCw, FiPlusCircle, FiX, FiHash, FiCheckCircle, FiAlertCircle, FiList } from 'react-icons/fi';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './OrdenChecklist.css';

const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN'];
const CURRENT_YEAR = new Date().getFullYear();
const PAGE_SIZE = 100;

function pad(n) { return String(n).padStart(4, '0'); }

function estadoVisual(orden) {
  return orden.estado_visual || orden.estado;
}

export default function OrdenChecklist() {
  const { user } = useContext(AuthContext);
  const isAdmin  = ROLES_ADMIN.includes(user?.rol);

  const [anio,      setAnio]      = useState(CURRENT_YEAR);
  const [ordenes,   setOrdenes]   = useState([]);
  const [anios,     setAnios]     = useState([CURRENT_YEAR]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  // Modal generar
  const [showGenerar, setShowGenerar] = useState(false);
  const [genAnio,     setGenAnio]     = useState(CURRENT_YEAR);
  const [genCantidad, setGenCantidad] = useState(100);
  const [genDesde,    setGenDesde]    = useState('');
  const [genLoading,  setGenLoading]  = useState(false);
  const [genMsg,      setGenMsg]      = useState({ text: '', type: '' });

  // Tooltip hover
  const [tooltip, setTooltip] = useState(null);

  // Cerrar modal con Escape
  const modalRef = useRef(null);
  useEffect(() => {
    if (!showGenerar) return;
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showGenerar]);

  const closeModal = () => { setShowGenerar(false); setGenMsg({ text: '', type: '' }); setGenDesde(''); };
  const openModal  = () => { setShowGenerar(true);  setGenAnio(anio); setGenDesde(''); setGenMsg({ text: '', type: '' }); };

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

  useEffect(() => { fetchAnios(); }, [fetchAnios]);
  useEffect(() => { fetchOrdenes(anio); setPage(1); }, [anio, fetchOrdenes]);

  const [page, setPage] = useState(1);

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleGenerar = async () => {
    if (!genCantidad || genCantidad < 1 || genCantidad > 1000) {
      setGenMsg({ text: 'La cantidad debe ser entre 1 y 1000.', type: 'err' });
      return;
    }
    setGenLoading(true);
    setGenMsg({ text: '', type: '' });
    try {
      const payload = { anio: genAnio, cantidad: genCantidad };
      if (genDesde !== '' && +genDesde > 0) payload.desde = +genDesde;
      const { data } = await api.post('/orden-checklist/generar', payload);
      await fetchAnios();
      if (genAnio === anio) await fetchOrdenes(anio);
      else setAnio(genAnio);
      closeModal();
      showToast(data.message, 'ok');
    } catch (e) {
      setGenMsg({ text: e.response?.data?.message || 'Error al generar órdenes.', type: 'err' });
    } finally {
      setGenLoading(false);
    }
  };

  // Paginación
  const totalPages  = Math.max(1, Math.ceil(ordenes.length / PAGE_SIZE));
  const ordenesPag  = ordenes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Estadísticas
  const total      = ordenes.length;
  const usadas     = ordenes.filter(o => estadoVisual(o) === 'usado').length;
  const anuladas   = ordenes.filter(o => estadoVisual(o) === 'anulado').length;
  const libres     = ordenes.filter(o => estadoVisual(o) === 'libre').length;
  const reservadas = ordenes.filter(o => estadoVisual(o) === 'reservado').length;
  const pctUsadas  = total > 0 ? Math.round(((usadas + anuladas) / total) * 100) : 0;

  return (
    <>
      <Navbar />
      <div className="oc-page">

        {/* ── Hero Header ── */}
        <div className="oc-hero">
          <div className="oc-hero-left">
            <div className="oc-hero-icon"><FiList size={22} /></div>
            <div>
              <h1 className="oc-title">Órdenes de Checklist</h1>
              <p className="oc-subtitle">Control de correlativos por año fiscal</p>
            </div>
          </div>
          <div className="oc-hero-right">
            <select
              className="oc-year-select"
              value={anio}
              onChange={e => setAnio(+e.target.value)}
              aria-label="Seleccionar año"
            >
              {anios.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button className="oc-btn-refresh" onClick={() => fetchOrdenes(anio)} title="Actualizar lista" aria-label="Actualizar">
              <FiRefreshCw size={15} />
            </button>
            {isAdmin && (
              <button className="oc-btn-generar" onClick={openModal}>
                <FiPlusCircle size={15} /> Generar órdenes
              </button>
            )}
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="oc-stats">
          <div className="oc-stat">
            <FiHash className="oc-stat-icon" />
            <div className="oc-stat-body">
              <span className="oc-stat-val">{total}</span>
              <span className="oc-stat-lbl">Total</span>
            </div>
          </div>
          <div className="oc-stat oc-stat--libre">
            <FiList className="oc-stat-icon" />
            <div className="oc-stat-body">
              <span className="oc-stat-val">{libres}</span>
              <span className="oc-stat-lbl">Libres</span>
            </div>
          </div>
          <div className="oc-stat oc-stat--reservado">
            <FiAlertCircle className="oc-stat-icon" />
            <div className="oc-stat-body">
              <span className="oc-stat-val">{reservadas}</span>
              <span className="oc-stat-lbl">Reservadas</span>
            </div>
          </div>
          <div className="oc-stat oc-stat--usado">
            <FiCheckCircle className="oc-stat-icon" />
            <div className="oc-stat-body">
              <span className="oc-stat-val">{usadas}</span>
              <span className="oc-stat-lbl">Usadas</span>
            </div>
          </div>
          {anuladas > 0 && (
            <div className="oc-stat oc-stat--anulado">
              <FiAlertCircle className="oc-stat-icon" />
              <div className="oc-stat-body">
                <span className="oc-stat-val">{anuladas}</span>
                <span className="oc-stat-lbl">Anuladas</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Barra de uso ── */}
        {total > 0 && (
          <div className="oc-usage-bar-wrap">
            <div className="oc-usage-bar-labels">
              <span>Uso del correlativo {anio}</span>
              <span className="oc-usage-pct">{pctUsadas}% utilizado</span>
            </div>
            <div className="oc-usage-bar-bg">
              <div className="oc-usage-bar-fill" style={{ width: `${pctUsadas}%` }} />
            </div>
          </div>
        )}

        {/* ── Leyenda ── */}
        <div className="oc-leyenda">
          <span className="oc-ley-item"><span className="oc-ley-dot oc-ley-libre" />Libre</span>
          <span className="oc-ley-item"><span className="oc-ley-dot oc-ley-reservado" />Reservada</span>
          <span className="oc-ley-item"><span className="oc-ley-dot oc-ley-usado" />Usada</span>
          <span className="oc-ley-item"><span className="oc-ley-dot oc-ley-anulado" />Anulada</span>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="oc-error">
            <FiAlertCircle size={15} /> {error}
          </div>
        )}

        {/* ── Grid ── */}
        {loading ? (
          <div className="oc-loading">
            <div className="oc-spinner" />
            <span>Cargando órdenes...</span>
          </div>
        ) : ordenes.length === 0 ? (
          <div className="oc-empty">
            <FiList size={40} className="oc-empty-icon" />
            <p>No hay órdenes para el año <strong>{anio}</strong>.</p>
            {isAdmin && <p className="oc-empty-hint">Usa "Generar órdenes" para crear el correlativo.</p>}
          </div>
        ) : (
          <div className="oc-grid">
            {ordenesPag.map(o => {
              const visual = estadoVisual(o);
              const esAnulado = visual === 'anulado';
              return (
                <div
                  key={o.id}
                  className={`oc-cell ${esAnulado ? 'oc-cell--anulado' : `oc-cell--${visual}`}`}
                  onMouseEnter={e => {
                    if (visual !== 'libre') {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({ o, esAnulado, x: rect.left, y: rect.bottom + 8 });
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  title={visual !== 'libre' ? `${pad(o.numero)}-${anio}` : undefined}
                >
                  {pad(o.numero)}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Paginación ── */}
        {!loading && ordenes.length > PAGE_SIZE && (
          <div className="std-pg">
            <span className="std-pg-info">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, ordenes.length)} de <strong>{ordenes.length}</strong>
            </span>
            <div className="std-pg-controls">
              <button className="std-pg-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
              <button className="std-pg-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
              {(() => {
                const maxBtns = 7;
                let start = Math.max(1, page - Math.floor(maxBtns / 2));
                let end   = Math.min(totalPages, start + maxBtns - 1);
                if (end - start < maxBtns - 1) start = Math.max(1, end - maxBtns + 1);
                const pages = [];
                if (start > 1) {
                  pages.push(<button key={1} className="std-pg-btn std-pg-num" onClick={() => setPage(1)}>1</button>);
                  if (start > 2) pages.push(<span key="el" className="std-pg-ellipsis">…</span>);
                }
                for (let p = start; p <= end; p++) {
                  pages.push(<button key={p} className={`std-pg-btn std-pg-num${page === p ? ' std-pg-num--active' : ''}`} onClick={() => setPage(p)}>{p}</button>);
                }
                if (end < totalPages) {
                  if (end < totalPages - 1) pages.push(<span key="er" className="std-pg-ellipsis">…</span>);
                  pages.push(<button key={totalPages} className="std-pg-btn std-pg-num" onClick={() => setPage(totalPages)}>{totalPages}</button>);
                }
                return pages;
              })()}
              <button className="std-pg-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
              <button className="std-pg-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
            </div>
            <span className="std-pg-total">Pág. <strong>{page}</strong> / {totalPages}</span>
          </div>
        )}

        {/* ── Toast ── */}
        {toast && (
          <div className={`oc-toast oc-toast--${toast.type}`}>
            {toast.type === 'ok' ? <FiCheckCircle size={15} /> : <FiAlertCircle size={15} />}
            {toast.msg}
          </div>
        )}

        {/* ── Tooltip ── */}
        {tooltip && (
          <div
            className="oc-tooltip"
            style={{ top: tooltip.y + window.scrollY, left: tooltip.x }}
          >
            <span className="oc-tooltip-num">{pad(tooltip.o.numero)}-{anio}</span>
            {tooltip.esAnulado && <span className="oc-tooltip-anulado">⚠ ANULADO</span>}
            {tooltip.o.checklist_numero && (
              <span>Checklist: <strong>{tooltip.o.checklist_numero}-{anio}</strong></span>
            )}
            <span>👤 {tooltip.o.usuario_nombre || '—'}</span>
            {(tooltip.o.fecha_registro || tooltip.o.checklist_fecha_creacion) && (
              <span>🕐 {new Date(tooltip.o.fecha_registro || tooltip.o.checklist_fecha_creacion).toLocaleString('es-HN')}</span>
            )}
          </div>
        )}

        {/* ── Modal generar órdenes ── */}
        {showGenerar && (
          <div className="oc-modal-overlay" onClick={closeModal} role="dialog" aria-modal="true" aria-labelledby="oc-modal-heading">
            <div className="oc-modal" ref={modalRef} onClick={e => e.stopPropagation()}>

              {/* Cabecera modal */}
              <div className="oc-modal-header">
                <div className="oc-modal-header-left">
                  <div className="oc-modal-header-icon"><FiPlusCircle size={18} /></div>
                  <div>
                    <h2 className="oc-modal-title" id="oc-modal-heading">Generar Órdenes</h2>
                    <p className="oc-modal-subtitle">Se agregarán al final del correlativo</p>
                  </div>
                </div>
                <button className="oc-modal-close" onClick={closeModal} aria-label="Cerrar">
                  <FiX size={18} />
                </button>
              </div>

              <div className="oc-modal-body">
                <div className="oc-modal-row">
                  <label htmlFor="oc-gen-anio">Año</label>
                  <input
                    id="oc-gen-anio"
                    type="number"
                    className="oc-input"
                    value={genAnio}
                    min={2020}
                    max={2100}
                    onChange={e => setGenAnio(+e.target.value)}
                  />
                </div>
                <div className="oc-modal-row">
                  <label htmlFor="oc-gen-cant">Cantidad a agregar</label>
                  <input
                    id="oc-gen-cant"
                    type="number"
                    className="oc-input"
                    value={genCantidad}
                    min={1}
                    max={1000}
                    onChange={e => setGenCantidad(+e.target.value)}
                  />
                  <small>Rango permitido: 1 – 1 000 órdenes por operación.</small>
                </div>
                <div className="oc-modal-row">
                  <label htmlFor="oc-gen-desde">Iniciar desde N° <span style={{fontWeight:'normal',color:'#6b7280'}}>(opcional)</span></label>
                  <input
                    id="oc-gen-desde"
                    type="number"
                    className="oc-input"
                    value={genDesde}
                    min={1}
                    placeholder="Ej. 708 — déjalo vacío para continuar el correlativo"
                    onChange={e => setGenDesde(e.target.value)}
                  />
                  <small>Úsalo solo para sincronizar con un correlativo existente (ej. Excel).</small>
                </div>

                {genMsg.text && (
                  <div className={`oc-modal-msg oc-modal-msg--${genMsg.type}`}>
                    {genMsg.type === 'err' ? <FiAlertCircle size={14} /> : <FiCheckCircle size={14} />}
                    {genMsg.text}
                  </div>
                )}
              </div>

              <div className="oc-modal-footer">
                <button className="oc-btn-cancel" onClick={closeModal} disabled={genLoading}>
                  Cancelar
                </button>
                <button className="oc-btn-confirm" onClick={handleGenerar} disabled={genLoading}>
                  {genLoading
                    ? <><span className="oc-btn-spinner" /> Generando...</>
                    : <><FiPlusCircle size={14} /> Generar</>}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
