import { useState, useCallback, useEffect, useMemo, useContext } from 'react';
import {
  FiPlus, FiRefreshCw, FiEdit3, FiTrash2, FiX,
  FiCheckCircle, FiAlertCircle, FiList,
  FiSearch, FiDownload, FiChevronUp, FiChevronDown,
  FiChevronLeft, FiChevronRight, FiEye,
  FiPhone, FiMail, FiMapPin, FiStar, FiPackage,
  FiUser, FiCalendar,
} from 'react-icons/fi';
import * as XLSX from 'xlsx';
import Navbar from '../components/Navbar';
import api from '../api/axios';
import { AuthContext } from '../context/AuthContext';
import './Proveedores.css';

const CATEGORIAS = [
  'Suministros de oficina', 'Tecnología', 'Servicios generales',
  'Construcción', 'Alimentos y bebidas', 'Transporte y logística',
  'Consultoría', 'Salud', 'Seguridad', 'Otro',
];
const ESTADOS = ['ACTIVO', 'INACTIVO', 'SUSPENDIDO'];
const PAGE_SIZE = 10;

function buildEmpty() {
  return {
    nombre: '', rtn: '', rp: '', categoria: '', tipo_servicio: '',
    vendedor: '', telefono: '', correo: '', direccion: '', estado: 'ACTIVO',
    eval_calidad: '', eval_puntualidad: '', eval_precio: '', eval_servicio: '',
    observaciones: '',
  };
}

function applySort(arr, { col, dir }) {
  if (!col) return arr;
  return [...arr].sort((a, b) => {
    let va = a[col] ?? '', vb = b[col] ?? '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

const ESTADO_STYLE = {
  ACTIVO:     { backgroundColor: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7' },
  INACTIVO:   { backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' },
  SUSPENDIDO: { backgroundColor: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5' },
};

function StarRating({ value, onChange, readOnly = false }) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value || 0;
  return (
    <div className="pv-stars">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n} type="button"
          className={`pv-star ${display >= n ? 'pv-star--on' : ''}`}
          onClick={() => !readOnly && onChange && onChange(n === value ? '' : n)}
          onMouseEnter={() => !readOnly && setHovered(n)}
          onMouseLeave={() => !readOnly && setHovered(0)}
          style={{ cursor: readOnly ? 'default' : 'pointer' }}
        >
          <FiStar size={readOnly ? 14 : 16} />
        </button>
      ))}
      {!readOnly && value ? <span className="pv-star-val">{value}/5</span> : null}
    </div>
  );
}

function getScoreLabel(s) {
  if (!s) return null;
  if (s >= 4.5) return { label: 'Excelente', cls: 'pv-score--excellent' };
  if (s >= 3.5) return { label: 'Bueno',     cls: 'pv-score--good' };
  if (s >= 2.5) return { label: 'Regular',   cls: 'pv-score--regular' };
  return          { label: 'Deficiente', cls: 'pv-score--poor' };
}
function ScoreBadge({ score, hero = false }) {
  if (!score) return hero ? null : <span className="pv-score-none">Sin evaluar</span>;
  const { label, cls } = getScoreLabel(score);
  if (hero) return <span className="pv-score-hero">★ {score} · {label}</span>;
  return <span className={`pv-score-badge ${cls}`}>★ {score} · {label}</span>;
}

export default function Proveedores() {
  const { user: me } = useContext(AuthContext);
  const canEdit = me?.rol === 'SUPER_ADMIN' || me?.rol === 'ADMIN';

  const [tab, setTab]               = useState('listado');
  const [data, setData]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [toast, setToast]           = useState(null);
  const [form, setForm]             = useState(buildEmpty());
  const [editingId, setEditingId]   = useState(null);
  const [confirmCfg, setConfirmCfg] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [detail, setDetail]         = useState(null);

  const [busqueda,       setBusqueda]       = useState('');
  const [filtroCategoria,setFiltroCategoria]= useState('');
  const [filtroEstado,   setFiltroEstado]   = useState('');
  const [sortCfg, setSortCfg] = useState({ col: 'nombre', dir: 'asc' });
  const [page, setPage]       = useState(1);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const cargar = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: rows } = await api.get('/proveedores');
      setData(rows);
    } catch {
      setError('No se pudo cargar el listado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setPage(1); }, [busqueda, filtroCategoria, filtroEstado, sortCfg]);

  const filtered = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = data.filter(r => {
      if (filtroCategoria && r.categoria !== filtroCategoria) return false;
      if (filtroEstado    && r.estado    !== filtroEstado)    return false;
      if (q) {
        const h = [r.nombre, r.rtn, r.rp, r.vendedor, r.tipo_servicio, r.correo, r.telefono]
          .filter(Boolean).join(' ').toLowerCase();
        if (!h.includes(q)) return false;
      }
      return true;
    });
    return applySort(base, sortCfg);
  }, [data, busqueda, filtroCategoria, filtroEstado, sortCfg]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (col) => {
    setSortCfg(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }));
  };
  const SortIcon = ({ col }) => {
    if (sortCfg.col !== col) return <FiChevronUp size={11} style={{ opacity: 0.3 }} />;
    return sortCfg.dir === 'asc'
      ? <FiChevronUp size={11} />
      : <FiChevronDown size={11} />;
  };

  const exportarExcel = () => {
    const rows = filtered.map(r => ({
      'Nombre':         r.nombre,
      'RTN':            r.rtn || '',
      'RP':             r.rp || '',
      'Categoría':      r.categoria,
      'Tipo de servicio': r.tipo_servicio || '',
      'Vendedor':       r.vendedor || '',
      'Teléfono':       r.telefono || '',
      'Correo':         r.correo || '',
      'Dirección':      r.direccion || '',
      'Estado':         r.estado,
      'Calidad':        r.eval_calidad ?? '',
      'Puntualidad':    r.eval_puntualidad ?? '',
      'Precio':         r.eval_precio ?? '',
      'Servicio':       r.eval_servicio ?? '',
      'Puntuación':     r.puntuacion_global ?? '',
      'Observaciones':  r.observaciones || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Proveedores');
    XLSX.writeFile(wb, `proveedores_${Date.now()}.xlsx`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim())    { showToast('El nombre es requerido.', 'error'); return; }
    if (!form.categoria.trim()) { showToast('La categoría es requerida.', 'error'); return; }
    if (form.correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo.trim()))
      { showToast('Formato de correo electrónico inválido.', 'error'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/proveedores/${editingId}`, form);
        showToast('Proveedor actualizado correctamente.');
      } else {
        await api.post('/proveedores', form);
        showToast('Proveedor registrado correctamente.');
      }
      setForm(buildEmpty()); setEditingId(null); setTab('listado'); cargar();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Error al guardar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (row) => {
    setForm({
      nombre:          row.nombre || '',
      rtn:             row.rtn || '',
      rp:              row.rp || '',
      categoria:       row.categoria || '',
      tipo_servicio:   row.tipo_servicio || '',
      vendedor:        row.vendedor || '',
      telefono:        row.telefono || '',
      correo:          row.correo || '',
      direccion:       row.direccion || '',
      estado:          row.estado || 'ACTIVO',
      eval_calidad:    row.eval_calidad ?? '',
      eval_puntualidad:row.eval_puntualidad ?? '',
      eval_precio:     row.eval_precio ?? '',
      eval_servicio:   row.eval_servicio ?? '',
      observaciones:   row.observaciones || '',
    });
    setEditingId(row.id);
    setTab('nuevo');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id) => {
    setConfirmCfg({
      msg: '¿Eliminar este proveedor del listado?',
      onOk: async () => {
        setDeletingId(id);
        try {
          await api.delete(`/proveedores/${id}`);
          setData(d => d.filter(r => r.id !== id));
          showToast('Proveedor eliminado.');
        } catch (err) {
          showToast(err?.response?.data?.message || 'No se pudo eliminar.', 'error');
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const cancelEdit = () => { setEditingId(null); setForm(buildEmpty()); setTab('listado'); };
  const limpiarFiltros = () => { setBusqueda(''); setFiltroCategoria(''); setFiltroEstado(''); };
  const hayFiltros = busqueda || filtroCategoria || filtroEstado;

  // KPIs globales
  const totalActivos    = useMemo(() => data.filter(r => r.estado === 'ACTIVO').length, [data]);
  const totalCateg      = useMemo(() => new Set(data.map(r => r.categoria).filter(Boolean)).size, [data]);
  const conEval         = useMemo(() => data.filter(r => r.puntuacion_global).length, [data]);

  // Inicial del nombre para avatar
  const inicial = (nombre) => (nombre || '?').trim()[0].toUpperCase();

  return (
    <div className="page-shell">
      <Navbar />
      <div className="pv-page">

        {/* ── HEADER ── */}
        <div className="pv-header">
          <div className="pv-header-brand">
            <div className="pv-header-icon"><FiPackage size={22}/></div>
            <div>
              <h1 className="pv-header-title">Base de Datos de Proveedores</h1>
              <p className="pv-header-sub">Directorio y evaluación de proveedores</p>
            </div>
          </div>
          <div className="pv-header-stats">
            <div className="pv-hstat">
              <span className="pv-hstat-val">{data.length}</span>
              <span className="pv-hstat-lbl">Proveedores</span>
            </div>
            <div className="pv-hstat-sep"/>
            <div className="pv-hstat">
              <span className="pv-hstat-val">{totalActivos}</span>
              <span className="pv-hstat-lbl">Activos</span>
            </div>
            <div className="pv-hstat-sep"/>
            <div className="pv-hstat">
              <span className="pv-hstat-val">{totalCateg}</span>
              <span className="pv-hstat-lbl">Categorías</span>
            </div>
            <div className="pv-hstat-sep"/>
            <div className="pv-hstat">
              <span className="pv-hstat-val">{conEval}</span>
              <span className="pv-hstat-lbl">Evaluados</span>
            </div>
          </div>
        </div>

        {/* ── TOOLBAR ── */}
        <div className="pv-toolbar">
          <div className="pv-toolbar-left">
            <div className="pv-search-wrap">
              <FiSearch size={14} className="pv-search-icon"/>
              <input className="pv-search-input" type="text"
                placeholder="Buscar nombre, RTN, vendedor…"
                value={busqueda} onChange={e => setBusqueda(e.target.value)}/>
              {busqueda && <button className="pv-search-clear" onClick={() => setBusqueda('')}><FiX size={12}/></button>}
            </div>

            <select className="pv-sel-flt" value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
              <option value="">Todas las categorías</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select className="pv-sel-flt" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {hayFiltros && (
              <button className="pv-btn-clear-flt" onClick={limpiarFiltros}>
                <FiX size={12}/> Limpiar
              </button>
            )}
            {hayFiltros && (
              <span className="pv-result-count">
                <strong>{filtered.length}</strong> resultado{filtered.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="pv-toolbar-right">
            <button className="pv-tool-icon" onClick={cargar} disabled={loading} title="Actualizar">
              <FiRefreshCw size={15}/>
            </button>
            {filtered.length > 0 && (
              <button className="pv-tool-btn pv-tool-btn--export" onClick={exportarExcel}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.2 17l1.8-2.8L8.2 11.4h1.4L10.8 13l1.2-1.6h1.4l-1.8 2.8 1.9 2.8h-1.4L10.8 15l-1.2 1.7-1.4.3z"/></svg> Excel
              </button>
            )}
            {canEdit && (
              <button
                className={`pv-tool-btn ${tab === 'nuevo' ? 'pv-tool-btn--back' : 'pv-tool-btn--new'}`}
                onClick={() => tab === 'nuevo' ? cancelEdit() : setTab('nuevo')}
              >
                {tab === 'nuevo'
                  ? <><FiList size={13}/> Ver listado</>
                  : <><FiPlus size={13}/> Nuevo proveedor</>}
              </button>
            )}
          </div>
        </div>

        {/* Edit banner */}
        {editingId && tab === 'nuevo' && (
          <div className="pv-edit-banner">
            <FiEdit3 size={13}/>
            <span>Editando: <strong>{form.nombre || 'proveedor'}</strong></span>
            <button onClick={cancelEdit}><FiX size={13}/></button>
          </div>
        )}

        {/* ── LISTADO ── */}
        {tab === 'listado' && (
        <div className="pv-list-wrap">
          {error && <div className="pv-error"><FiAlertCircle size={15}/> {error}</div>}

          {loading ? (
            <div className="pv-loading">
              <div className="pv-spinner-lg"/>
              <span>Cargando proveedores…</span>
            </div>
          ) : !error && filtered.length === 0 ? (
            <div className="pv-empty">
              <FiPackage size={42}/>
              <h3>Sin resultados</h3>
              <p>{data.length === 0 ? 'No hay proveedores registrados.' : 'Ningún proveedor coincide con los filtros.'}</p>
              {hayFiltros && <button className="pv-btn-clear-flt" onClick={limpiarFiltros}><FiX size={12}/> Limpiar filtros</button>}
            </div>
          ) : (
            <>
              <div className="pv-table-wrap">
                <table className="pv-table">
                  <thead>
                    <tr>
                      <th><span className="pv-th-inner">#</span></th>
                      <th><span className="pv-th-inner pv-th-sort" onClick={() => handleSort('nombre')}>Proveedor <SortIcon col="nombre"/></span></th>
                      <th><span className="pv-th-inner pv-th-sort" onClick={() => handleSort('categoria')}>Categoría <SortIcon col="categoria"/></span></th>
                      <th><span className="pv-th-inner">Tipo de servicio</span></th>
                      <th><span className="pv-th-inner pv-th-sort" onClick={() => handleSort('vendedor')}>Vendedor <SortIcon col="vendedor"/></span></th>
                      <th><span className="pv-th-inner">Contacto</span></th>
                      <th><span className="pv-th-inner pv-th-sort" onClick={() => handleSort('estado')}>Estado <SortIcon col="estado"/></span></th>
                      <th><span className="pv-th-inner pv-th-sort" onClick={() => handleSort('puntuacion_global')}>Puntuación <SortIcon col="puntuacion_global"/></span></th>
                      <th><span className="pv-th-inner">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((r, idx) => (
                      <tr key={r.id} className={idx % 2 === 1 ? 'pv-tr--alt' : ''}>
                        <td className="pv-td-num">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="pv-td-nombre">
                          <div className="pv-nombre-wrap">
                            <div className="pv-avatar">{inicial(r.nombre)}</div>
                            <div>
                              <div className="pv-nombre">{r.nombre}</div>
                              {r.rtn && <div className="pv-rtn">RTN: {r.rtn}</div>}
                            </div>
                          </div>
                        </td>
                        <td><span className="pv-categ-chip">{r.categoria}</span></td>
                        <td className="pv-td-tipo">{r.tipo_servicio || '—'}</td>
                        <td className="pv-td-vendedor">{r.vendedor || '—'}</td>
                        <td className="pv-td-contacto">
                          {r.telefono && <div className="pv-contact-line"><FiPhone size={11}/> {r.telefono}</div>}
                          {r.correo && <div className="pv-contact-line"><FiMail size={11}/> {r.correo}</div>}
                          {!r.telefono && !r.correo && '—'}
                        </td>
                        <td>
                          <span className="pv-estado-badge" style={ESTADO_STYLE[r.estado] || ESTADO_STYLE.ACTIVO}>
                            {r.estado}
                          </span>
                        </td>
                        <td><ScoreBadge score={r.puntuacion_global}/></td>
                        <td className="pv-td-actions">
                          <button className="pv-act-btn pv-act-btn--view" title="Ver detalle" onClick={() => setDetail(r)}>
                            <FiEye size={13}/>
                          </button>
                          {canEdit && (
                            <>
                              <button className="pv-act-btn pv-act-btn--edit" title="Editar" onClick={() => handleEdit(r)}>
                                <FiEdit3 size={13}/>
                              </button>
                              <button className="pv-act-btn pv-act-btn--del" title="Eliminar"
                                disabled={deletingId === r.id} onClick={() => handleDelete(r.id)}>
                                <FiTrash2 size={13}/>
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="pv-tfoot-row">
                      <td colSpan={9}>
                        Mostrando <strong>{paginated.length}</strong> de <strong>{filtered.length}</strong> proveedores
                        {filtered.length !== data.length && <> · {data.length} en total</>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="std-pg">
                  <span className="std-pg-info">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de <strong>{filtered.length}</strong>
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
                        pages.push(
                          <button key={p}
                            className={`std-pg-btn std-pg-num${page === p ? ' std-pg-num--active' : ''}`}
                            onClick={() => setPage(p)}>{p}</button>
                        );
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
            </>
          )}
        </div>
        )}

        {/* ── FORMULARIO ── */}
        {tab === 'nuevo' && canEdit && (
        <form className="pv-form" onSubmit={handleSubmit} noValidate>

          {/* Sección 1: Datos del proveedor */}
          <div className="pv-section">
            <div className="pv-section-head">
              <span className="pv-step">1</span>
              <div>
                <h2 className="pv-section-title">Datos del proveedor</h2>
                <p className="pv-section-desc">Información de identificación y registro</p>
              </div>
            </div>
            <div className="pv-fields">
              <div className="pv-row3">
                <div className="pv-field">
                  <label className="pv-label">Nombre del proveedor <span className="pv-req">*</span></label>
                  <input className="pv-input" type="text" placeholder="Razón social o nombre comercial"
                    value={form.nombre} onChange={e => set('nombre', e.target.value)} maxLength={200} required/>
                </div>
                <div className="pv-field">
                  <label className="pv-label">RTN</label>
                  <input className="pv-input" type="text" placeholder="0000-0000-000000"
                    value={form.rtn} onChange={e => set('rtn', e.target.value)} maxLength={20}/>
                </div>
                <div className="pv-field">
                  <label className="pv-label">RP</label>
                  <input className="pv-input" type="text" placeholder="Registro de proveedor"
                    value={form.rp} onChange={e => set('rp', e.target.value)}/>
                </div>
              </div>
              <div className="pv-row3">
                <div className="pv-field">
                  <label className="pv-label">Categoría <span className="pv-req">*</span></label>
                  <select className="pv-input pv-select" value={form.categoria}
                    onChange={e => set('categoria', e.target.value)} required>
                    <option value="">Seleccione…</option>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="pv-field">
                  <label className="pv-label">Tipo de servicio</label>
                  <input className="pv-input" type="text" placeholder="Descripción del servicio"
                    value={form.tipo_servicio} onChange={e => set('tipo_servicio', e.target.value)}/>
                </div>
                <div className="pv-field">
                  <label className="pv-label">Estado</label>
                  <select className="pv-input pv-select" value={form.estado} onChange={e => set('estado', e.target.value)}>
                    {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Sección 2: Contacto */}
          <div className="pv-section">
            <div className="pv-section-head">
              <span className="pv-step">2</span>
              <div>
                <h2 className="pv-section-title">Contacto</h2>
                <p className="pv-section-desc">Vendedor y datos de comunicación</p>
              </div>
            </div>
            <div className="pv-fields">
              <div className="pv-row2">
                <div className="pv-field">
                  <label className="pv-label">Vendedor / Representante</label>
                  <input className="pv-input" type="text" placeholder="Nombre del contacto"
                    value={form.vendedor} onChange={e => set('vendedor', e.target.value)}/>
                </div>
                <div className="pv-field">
                  <label className="pv-label">Teléfono</label>
                  <input className="pv-input" type="tel" placeholder="0000-0000"
                    value={form.telefono} onChange={e => set('telefono', e.target.value)} maxLength={30}/>
                </div>
              </div>
              <div className="pv-row2">
                <div className="pv-field">
                  <label className="pv-label">Correo electrónico</label>
                  <input className="pv-input" type="email" placeholder="correo@empresa.com"
                    value={form.correo} onChange={e => set('correo', e.target.value)} maxLength={150}/>
                </div>
                <div className="pv-field">
                  <label className="pv-label">Dirección</label>
                  <input className="pv-input" type="text" placeholder="Ciudad, dirección"
                    value={form.direccion} onChange={e => set('direccion', e.target.value)}/>
                </div>
              </div>
            </div>
          </div>

          {/* Sección 3: Evaluación */}
          <div className="pv-section">
            <div className="pv-section-head">
              <span className="pv-step">3</span>
              <div>
                <h2 className="pv-section-title">Evaluación del proveedor</h2>
                <p className="pv-section-desc">Califica del 1 al 5 en cada criterio</p>
              </div>
            </div>
            <div className="pv-fields">
              <div className="pv-eval-grid">
                <div className="pv-eval-item">
                  <label className="pv-label">Calidad del producto/servicio</label>
                  <StarRating value={form.eval_calidad} onChange={v => set('eval_calidad', v)}/>
                </div>
                <div className="pv-eval-item">
                  <label className="pv-label">Puntualidad en entrega</label>
                  <StarRating value={form.eval_puntualidad} onChange={v => set('eval_puntualidad', v)}/>
                </div>
                <div className="pv-eval-item">
                  <label className="pv-label">Relación precio / calidad</label>
                  <StarRating value={form.eval_precio} onChange={v => set('eval_precio', v)}/>
                </div>
                <div className="pv-eval-item">
                  <label className="pv-label">Atención y servicio al cliente</label>
                  <StarRating value={form.eval_servicio} onChange={v => set('eval_servicio', v)}/>
                </div>
              </div>
              <div className="pv-field">
                <label className="pv-label">Observaciones</label>
                <textarea className="pv-input pv-textarea" rows={3}
                  placeholder="Comentarios adicionales sobre el proveedor…"
                  value={form.observaciones} onChange={e => set('observaciones', e.target.value)}/>
              </div>
            </div>
          </div>

          <div className="pv-form-footer">
            <button type="button" className="pv-btn-cancel" onClick={cancelEdit}>
              <FiX size={14}/> Cancelar
            </button>
            <button type="submit" className="pv-btn-save" disabled={saving}>
              {saving
                ? <><span className="pv-spinner"/> Guardando…</>
                : <><FiCheckCircle size={15}/> {editingId ? 'Actualizar' : 'Guardar proveedor'}</>}
            </button>
          </div>
        </form>
        )}

      </div>

      {/* ── MODAL DETALLE ── */}
      {detail && (
        <div className="pv-overlay" onClick={() => setDetail(null)}>
          <div className="pv-modal-detail" onClick={e => e.stopPropagation()}>

            {/* Hero con gradiente */}
            <div className="pv-modal-hero">
              <button className="pv-modal-close-hero" onClick={() => setDetail(null)}><FiX size={16}/></button>
              <div className="pv-modal-hero-avatar">{inicial(detail.nombre)}</div>
              <div className="pv-modal-hero-info">
                <h2>{detail.nombre}</h2>
                <div className="pv-modal-hero-badges">
                  <span className="pv-categ-chip pv-categ-chip--hero">{detail.categoria}</span>
                  <span className="pv-estado-badge pv-estado-badge--hero"
                    style={ESTADO_STYLE[detail.estado] || ESTADO_STYLE.ACTIVO}>
                    {detail.estado}
                  </span>
                </div>
                <ScoreBadge score={detail.puntuacion_global} hero/>
              </div>
            </div>

            <div className="pv-detail-body">

              {/* Datos */}
              <div className="pv-detail-grid">
                {detail.rtn && (
                  <div className="pv-detail-item">
                    <span className="pv-detail-label">RTN</span>
                    <span className="pv-detail-value" style={{ fontFamily: 'monospace' }}>{detail.rtn}</span>
                  </div>
                )}
                {detail.rp && (
                  <div className="pv-detail-item">
                    <span className="pv-detail-label">RP</span>
                    <span className="pv-detail-value">{detail.rp}</span>
                  </div>
                )}
                {detail.tipo_servicio && (
                  <div className="pv-detail-item">
                    <span className="pv-detail-label">Tipo de servicio</span>
                    <span className="pv-detail-value">{detail.tipo_servicio}</span>
                  </div>
                )}
                {detail.vendedor && (
                  <div className="pv-detail-item">
                    <span className="pv-detail-label">Vendedor</span>
                    <span className="pv-detail-value">{detail.vendedor}</span>
                  </div>
                )}
                {detail.telefono && (
                  <div className="pv-detail-item">
                    <span className="pv-detail-label"><FiPhone size={10}/> Teléfono</span>
                    <span className="pv-detail-value">
                      <a href={`tel:${detail.telefono}`} className="pv-detail-link"><FiPhone size={12}/> {detail.telefono}</a>
                    </span>
                  </div>
                )}
                {detail.correo && (
                  <div className="pv-detail-item">
                    <span className="pv-detail-label"><FiMail size={10}/> Correo</span>
                    <span className="pv-detail-value">
                      <a href={`mailto:${detail.correo}`} className="pv-detail-link"><FiMail size={12}/> {detail.correo}</a>
                    </span>
                  </div>
                )}
                {detail.direccion && (
                  <div className="pv-detail-item pv-detail-item-full">
                    <span className="pv-detail-label"><FiMapPin size={10}/> Dirección</span>
                    <span className="pv-detail-value">{detail.direccion}</span>
                  </div>
                )}
                {detail.registrado_por && (
                  <div className="pv-detail-item">
                    <span className="pv-detail-label"><FiUser size={10}/> Registrado por</span>
                    <span className="pv-detail-value">{detail.registrado_por}</span>
                  </div>
                )}
                {detail.created_at && (
                  <div className="pv-detail-item">
                    <span className="pv-detail-label"><FiCalendar size={10}/> Fecha de registro</span>
                    <span className="pv-detail-value">{new Date(detail.created_at).toLocaleString('es-HN')}</span>
                  </div>
                )}
                {detail.updated_at && (
                  <div className="pv-detail-item">
                    <span className="pv-detail-label"><FiCalendar size={10}/> Última actualización</span>
                    <span className="pv-detail-value">{new Date(detail.updated_at).toLocaleString('es-HN')}</span>
                  </div>
                )}
              </div>

              {/* Evaluación */}
              {(detail.eval_calidad || detail.eval_puntualidad || detail.eval_precio || detail.eval_servicio) && (
                <div className="pv-detail-eval">
                  <p className="pv-detail-eval-title">Evaluación</p>
                  <div className="pv-detail-eval-grid">
                    {[
                      ['Calidad',     detail.eval_calidad],
                      ['Puntualidad', detail.eval_puntualidad],
                      ['Precio',      detail.eval_precio],
                      ['Servicio',    detail.eval_servicio],
                    ].map(([lbl, val]) => val ? (
                      <div key={lbl} className="pv-detail-eval-item">
                        <span className="pv-detail-label">{lbl}</span>
                        <StarRating value={val} readOnly/>
                      </div>
                    ) : null)}
                  </div>
                </div>
              )}

              {detail.observaciones && (
                <div className="pv-detail-obs">
                  <p className="pv-detail-label">Observaciones</p>
                  <p className="pv-detail-obs-text">{detail.observaciones}</p>
                </div>
              )}
            </div>

            <div className="pv-detail-footer">
              <button className="pv-btn-cancel" onClick={() => setDetail(null)}>Cerrar</button>
              {canEdit && (
                <button className="pv-btn-save" onClick={() => { setDetail(null); handleEdit(detail); }}>
                  <FiEdit3 size={14}/> Editar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`pv-toast pv-toast--${toast.type}`} role="alert">
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Confirm */}
      {confirmCfg && (
        <div className="pv-confirm-overlay" onClick={() => setConfirmCfg(null)}>
          <div className="pv-confirm-box" onClick={e => e.stopPropagation()}>
            <p>{confirmCfg.msg}</p>
            <div className="pv-confirm-btns">
              <button className="pv-cfm-cancel" onClick={() => setConfirmCfg(null)}>Cancelar</button>
              <button className="pv-cfm-ok" onClick={() => { confirmCfg.onOk(); setConfirmCfg(null); }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
