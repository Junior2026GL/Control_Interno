import { useState, useCallback, useEffect, useMemo, useContext } from 'react';
import {
  FiPlus, FiRefreshCw, FiEdit3, FiTrash2, FiX,
  FiCheckCircle, FiAlertCircle, FiFilter, FiList,
  FiUsers, FiSearch, FiDownload, FiChevronUp, FiChevronDown,
} from 'react-icons/fi';
import * as XLSX from 'xlsx';
import Navbar from '../components/Navbar';
import api from '../api/axios';
import { AuthContext } from '../context/AuthContext';
import './Alcaldes.css';

const DEPARTAMENTOS = [
  'ATLANTIDA','CHOLUTECA','COLON','COMAYAGUA','COPAN','CORTES',
  'EL PARAISO','FRANCISCO MORAZAN','GRACIAS A DIOS','INTIBUCA',
  'ISLAS DE LA BAHIA','LA PAZ','LEMPIRA','OCOTEPEQUE','OLANCHO',
  'SANTA BARBARA','VALLE','YORO',
];

const PARTIDOS = ['PN','PL','LB','DC','PINU','LIBRE','PAC','OTRO'];

const PARTIDO_COLOR = {
  PN:    { backgroundColor: '#dbeafe', color: '#1e40af', borderColor: '#93c5fd' },
  PL:    { backgroundColor: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5' },
  LB:    { backgroundColor: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7' },
  DC:    { backgroundColor: '#ede9fe', color: '#5b21b6', borderColor: '#c4b5fd' },
  PINU:  { backgroundColor: '#fef9c3', color: '#854d0e', borderColor: '#fde68a' },
  LIBRE: { backgroundColor: '#fce7f3', color: '#9d174d', borderColor: '#f9a8d4' },
  PAC:   { backgroundColor: '#e0f2fe', color: '#0369a1', borderColor: '#7dd3fc' },
  OTRO:  { backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' },
};

function buildEmpty() {
  return { departamento: '', municipio: '', alcalde: '', partido: '' };
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

const PAGE_SIZE = 50;

export default function Alcaldes() {
  const { user: me } = useContext(AuthContext);
  const canEdit = me?.rol === 'SUPER_ADMIN' || me?.rol === 'ADMIN';

  const [tab, setTab]             = useState('listado');
  const [data, setData]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [toast, setToast]         = useState(null);
  const [form, setForm]           = useState(buildEmpty());
  const [editingId, setEditingId] = useState(null);
  const [confirmCfg, setConfirmCfg] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Filtros
  const [filtroDpto,    setFiltroDpto]    = useState('');
  const [filtroPartido, setFiltroPartido] = useState('');
  const [busqueda,      setBusqueda]      = useState('');

  // Sort y página
  const [sortCfg, setSortCfg] = useState({ col: 'departamento', dir: 'asc' });
  const [page, setPage]       = useState(1);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const cargar = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: rows } = await api.get('/alcaldes');
      setData(rows);
    } catch {
      setError('No se pudo cargar el listado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setPage(1); }, [filtroDpto, filtroPartido, busqueda, sortCfg]);

  // Filtrado + sort
  const filtered = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = data.filter(r => {
      if (filtroDpto    && r.departamento !== filtroDpto)   return false;
      if (filtroPartido && r.partido !== filtroPartido)      return false;
      if (q) {
        const h = [r.alcalde, r.municipio, r.departamento, r.partido]
          .filter(Boolean).join(' ').toLowerCase();
        if (!h.includes(q)) return false;
      }
      return true;
    });
    return applySort(base, sortCfg);
  }, [data, filtroDpto, filtroPartido, busqueda, sortCfg]);

  // KPIs
  const totalMunicipios  = filtered.length;
  const totalDepartamentos = useMemo(() => new Set(filtered.map(r => r.departamento).filter(Boolean)).size, [filtered]);
  const totalPartidos    = useMemo(() => new Set(filtered.map(r => r.partido).filter(Boolean)).size, [filtered]);
  const sinPartido       = useMemo(() => filtered.filter(r => !r.partido).length, [filtered]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Sort handler
  const handleSort = (col) => {
    setSortCfg(prev => ({
      col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };
  const SortIcon = ({ col }) => {
    if (sortCfg.col !== col) return <FiChevronUp size={11} style={{ opacity: 0.3 }} />;
    return sortCfg.dir === 'asc'
      ? <FiChevronUp size={11} style={{ opacity: 1 }} />
      : <FiChevronDown size={11} style={{ opacity: 1 }} />;
  };

  // Export Excel
  const exportarExcel = () => {
    const rows = filtered.map(r => ({
      'Departamento': r.departamento || '',
      'Municipio':    r.municipio    || '',
      'Alcalde':      r.alcalde      || '',
      'Partido':      r.partido      || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Alcaldes');
    XLSX.writeFile(wb, `alcaldes_municipales_${Date.now()}.xlsx`);
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.departamento) { showToast('El departamento es requerido.', 'error'); return; }
    if (!form.municipio.trim()) { showToast('El municipio es requerido.', 'error'); return; }
    if (!form.alcalde.trim())   { showToast('El nombre del alcalde es requerido.', 'error'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/alcaldes/${editingId}`, form);
        showToast('Registro actualizado correctamente.');
      } else {
        await api.post('/alcaldes', form);
        showToast('Alcalde registrado correctamente.');
      }
      setForm(buildEmpty()); setEditingId(null); setTab('listado');
      cargar();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Error al guardar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (row) => {
    setForm({
      departamento: row.departamento || '',
      municipio:    row.municipio    || '',
      alcalde:      row.alcalde      || '',
      partido:      row.partido      || '',
    });
    setEditingId(row.id);
    setTab('nuevo');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id) => {
    setConfirmCfg({
      msg: '¿Eliminar este registro del listado?',
      onOk: async () => {
        setDeletingId(id);
        try {
          await api.delete(`/alcaldes/${id}`);
          setData(d => d.filter(r => r.id !== id));
          showToast('Registro eliminado.');
        } catch (err) {
          showToast(err?.response?.data?.message || 'No se pudo eliminar.', 'error');
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const cancelEdit = () => { setEditingId(null); setForm(buildEmpty()); setTab('listado'); };

  const limpiarFiltros = () => { setFiltroDpto(''); setFiltroPartido(''); setBusqueda(''); };
  const hayFiltros = filtroDpto || filtroPartido || busqueda;

  return (
    <div className="page-shell">
      <Navbar />
      <div className="alc-page">

        {/* Banner */}
        <div className="alc-banner">
          <div className="alc-banner-icon"><FiUsers size={26} /></div>
          <div>
            <h1 className="alc-banner-title">Alcaldes Municipales</h1>
            <p className="alc-banner-sub">Directorio de alcaldes por departamento y partido político</p>
          </div>
        </div>

        {/* KPIs */}
        <div className="alc-cards">
          <div className="alc-card">
            <span className="alc-card-label">Municipios {hayFiltros ? 'filtrados' : 'totales'}</span>
            <span className="alc-card-val">{totalMunicipios}</span>
          </div>
          <div className="alc-card alc-card--blue">
            <span className="alc-card-label">Departamentos</span>
            <span className="alc-card-val">{totalDepartamentos}</span>
          </div>
          <div className="alc-card alc-card--green">
            <span className="alc-card-label">Partidos distintos</span>
            <span className="alc-card-val">{totalPartidos}</span>
          </div>
          <div className="alc-card alc-card--amber">
            <span className="alc-card-label">Sin partido</span>
            <span className="alc-card-val">{sinPartido}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="alc-tabs">
          <button className={`alc-tab ${tab==='listado'?'alc-tab--active':''}`} onClick={() => { setTab('listado'); cargar(); }}>
            <FiList size={14} /> Listado
          </button>
          {canEdit && (
            <button className={`alc-tab ${tab==='nuevo'?'alc-tab--active':''}`} onClick={() => setTab('nuevo')}>
              <FiPlus size={14} /> {editingId ? 'Editando registro' : 'Nuevo registro'}
            </button>
          )}
        </div>

        {/* ── LISTADO ── */}
        {tab === 'listado' && (
        <div>
          {/* Filtros */}
          <div className="alc-filters">
            <div className="alc-filter-icon"><FiFilter size={14}/></div>

            <div className="alc-search-wrap">
              <FiSearch size={13} className="alc-search-icon" />
              <input
                className="alc-search-input"
                type="text"
                placeholder="Buscar alcalde, municipio…"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
              />
              {busqueda && (
                <button className="alc-search-clear" onClick={() => setBusqueda('')}><FiX size={12}/></button>
              )}
            </div>

            <select className="alc-flt" value={filtroDpto} onChange={e => setFiltroDpto(e.target.value)}>
              <option value="">Todos los departamentos</option>
              {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>

            <select className="alc-flt" value={filtroPartido} onChange={e => setFiltroPartido(e.target.value)}>
              <option value="">Todos los partidos</option>
              {PARTIDOS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            {hayFiltros && (
              <button className="alc-btn-clear" onClick={limpiarFiltros}>
                <FiX size={13}/> Limpiar
              </button>
            )}

            <button className="alc-btn-refresh" onClick={cargar} disabled={loading} title="Actualizar">
              <FiRefreshCw size={14} />
            </button>

            {filtered.length > 0 && (
              <button className="alc-btn-export" onClick={exportarExcel} title="Exportar a Excel">
                <FiDownload size={13}/> Excel
              </button>
            )}
          </div>

          {error && <div className="alc-error"><FiAlertCircle size={15}/> {error}</div>}
          {loading && <div className="alc-loading">Cargando…</div>}

          {!loading && !error && filtered.length === 0 && (
            <div className="alc-empty">
              <FiUsers size={38}/>
              <p>No hay registros para los filtros seleccionados.</p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
          <>
            <div className="alc-table-wrap">
              <table className="alc-table">
                <thead>
                  <tr>
                    <th className="alc-th alc-th--num">#</th>
                    <th className="alc-th alc-th--sort" onClick={() => handleSort('departamento')}><span className="alc-th-inner">Departamento <SortIcon col="departamento"/></span></th>
                    <th className="alc-th alc-th--sort" onClick={() => handleSort('municipio')}><span className="alc-th-inner">Municipio <SortIcon col="municipio"/></span></th>
                    <th className="alc-th alc-th--sort" onClick={() => handleSort('alcalde')}><span className="alc-th-inner">Alcalde <SortIcon col="alcalde"/></span></th>
                    <th className="alc-th alc-th--sort" onClick={() => handleSort('partido')}><span className="alc-th-inner">Partido <SortIcon col="partido"/></span></th>
                    {canEdit && <th className="alc-th">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((r, idx) => (
                    <tr key={r.id} className={idx % 2 === 1 ? 'alc-tr--even' : ''}>
                      <td className="alc-td-num">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="alc-td-dpto">{r.departamento || '—'}</td>
                      <td className="alc-td-mun">{r.municipio || '—'}</td>
                      <td className="alc-td-alc">{r.alcalde || '—'}</td>
                      <td>
                        {r.partido
                          ? <span className="alc-partido" style={PARTIDO_COLOR[r.partido] || { backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }}>{r.partido}</span>
                          : <span className="alc-partido-none">—</span>}
                      </td>
                      {canEdit && (
                        <td className="alc-td-actions">
                          <button className="alc-btn-icon alc-btn-icon--edit" title="Editar" onClick={() => handleEdit(r)}>
                            <FiEdit3 size={14}/>
                          </button>
                          <button className="alc-btn-icon alc-btn-icon--del" title="Eliminar"
                            disabled={deletingId === r.id} onClick={() => handleDelete(r.id)}>
                            <FiTrash2 size={14}/>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="alc-tfoot-row">
                    <td colSpan={canEdit ? 6 : 5} className="alc-tfoot-label">
                      {filtered.length} registro{filtered.length !== 1 ? 's' : ''}{filtered.length !== data.length ? ` de ${data.length}` : ''}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="alc-pagination">
                <button className="alc-page-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
                <button className="alc-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                <span className="alc-page-info">Página <strong>{page}</strong> de <strong>{totalPages}</strong></span>
                <button className="alc-page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                <button className="alc-page-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
              </div>
            )}
          </>
          )}
        </div>
        )}

        {/* ── FORMULARIO ── */}
        {tab === 'nuevo' && canEdit && (
        <form className="alc-form" onSubmit={handleSubmit} noValidate>

          <div className="alc-section">
            <div className="alc-section-head">
              <span className="alc-step">1</span>
              <div>
                <h2 className="alc-section-title">Datos del alcalde</h2>
                <p className="alc-section-desc">Departamento, municipio, alcalde y partido</p>
              </div>
            </div>
            <div className="alc-fields">
              <div className="alc-row2">
                <div className="alc-field">
                  <label className="alc-label">Departamento <span className="alc-req">*</span></label>
                  <select className="alc-input alc-select" value={form.departamento} onChange={e => set('departamento', e.target.value)} required>
                    <option value="">Seleccione…</option>
                    {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="alc-field">
                  <label className="alc-label">Municipio <span className="alc-req">*</span></label>
                  <input className="alc-input" type="text" placeholder="Nombre del municipio"
                    value={form.municipio} onChange={e => set('municipio', e.target.value.toUpperCase())} required/>
                </div>
              </div>
              <div className="alc-row2">
                <div className="alc-field">
                  <label className="alc-label">Nombre del alcalde <span className="alc-req">*</span></label>
                  <input className="alc-input" type="text" placeholder="Nombre completo"
                    value={form.alcalde} onChange={e => set('alcalde', e.target.value.toUpperCase())} required/>
                </div>
                <div className="alc-field">
                  <label className="alc-label">Partido político</label>
                  <select className="alc-input alc-select" value={form.partido} onChange={e => set('partido', e.target.value)}>
                    <option value="">Sin partido / Independiente</option>
                    {PARTIDOS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="alc-form-actions">
            <button type="button" className="alc-btn-cancel" onClick={cancelEdit}>
              <FiX size={14}/> Cancelar
            </button>
            <button type="submit" className="alc-btn-save" disabled={saving}>
              {saving
                ? <><span className="alc-spinner"/> Guardando…</>
                : <><FiCheckCircle size={15}/> {editingId ? 'Actualizar' : 'Guardar registro'}</>}
            </button>
          </div>
        </form>
        )}

      </div>

      {/* Toast */}
      {toast && (
        <div className={`alc-toast alc-toast--${toast.type}`} role="alert">
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Confirm */}
      {confirmCfg && (
        <div className="alc-confirm-overlay" onClick={() => setConfirmCfg(null)}>
          <div className="alc-confirm-box" onClick={e => e.stopPropagation()}>
            <p>{confirmCfg.msg}</p>
            <div className="alc-confirm-btns">
              <button className="alc-cfm-cancel" onClick={() => setConfirmCfg(null)}>Cancelar</button>
              <button className="alc-cfm-ok" onClick={() => { confirmCfg.onOk(); setConfirmCfg(null); }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
