import { useState, useCallback, useEffect, useMemo, useContext } from 'react';
import {
  FiPlus, FiRefreshCw, FiEdit3, FiTrash2, FiX,
  FiCheckCircle, FiAlertCircle, FiFilter, FiList,
  FiHome, FiSearch, FiDownload, FiChevronUp, FiChevronDown,
  FiChevronLeft, FiChevronRight, FiEye, FiMapPin, FiFlag, FiAward, FiPieChart,
  FiMail, FiPhone, FiFileText,
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
  // Abreviaciones
  PN:    { backgroundColor: '#dbeafe', color: '#1e40af', borderColor: '#93c5fd' },
  PL:    { backgroundColor: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5' },
  LB:    { backgroundColor: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7' },
  DC:    { backgroundColor: '#ede9fe', color: '#5b21b6', borderColor: '#c4b5fd' },
  PINU:  { backgroundColor: '#fef9c3', color: '#854d0e', borderColor: '#fde68a' },
  LIBRE: { backgroundColor: '#fce7f3', color: '#9d174d', borderColor: '#f9a8d4' },
  PAC:   { backgroundColor: '#e0f2fe', color: '#0369a1', borderColor: '#7dd3fc' },
  OTRO:  { backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' },
  // Nombres completos (tal como se guardan en BD)
  Nacional:      { backgroundColor: '#dbeafe', color: '#1e40af', borderColor: '#93c5fd' },
  NACIONAL:      { backgroundColor: '#dbeafe', color: '#1e40af', borderColor: '#93c5fd' },
  Liberal:       { backgroundColor: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5' },
  LIBERAL:       { backgroundColor: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5' },
  Libre:         { backgroundColor: '#fce7f3', color: '#9d174d', borderColor: '#f9a8d4' },
  LIBRE2:        { backgroundColor: '#fce7f3', color: '#9d174d', borderColor: '#f9a8d4' },
  Demócrata:     { backgroundColor: '#ede9fe', color: '#5b21b6', borderColor: '#c4b5fd' },
  Democrata:     { backgroundColor: '#ede9fe', color: '#5b21b6', borderColor: '#c4b5fd' },
  Independiente: { backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' },
  INDEPENDIENTE: { backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' },
};

const PARTIDO_SOLID = {
  // Abreviaciones
  PN:    '#2563eb',
  PL:    '#dc2626',
  LB:    '#059669',
  DC:    '#7c3aed',
  PINU:  '#d97706',
  LIBRE: '#db2777',
  PAC:   '#0891b2',
  OTRO:  '#94a3b8',
  // Nombres completos (tal como se guardan en BD)
  Nacional:      '#2563eb',
  NACIONAL:      '#2563eb',
  Liberal:       '#dc2626',
  LIBERAL:       '#dc2626',
  Libre:         '#db2777',
  Demócrata:     '#7c3aed',
  Democrata:     '#7c3aed',
  Independiente: '#94a3b8',
  INDEPENDIENTE: '#94a3b8',
};

function buildEmpty() {
  return { departamento: '', municipio: '', alcalde: '', partido: '', correo: '', telefono: '', observaciones: '' };
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

// Normaliza: quita tildes, pasa a mayúsculas — para comparaciones seguras
function norm(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

const PAGE_SIZE = 10;

function DonutChart({ segments, total, hovered, onHover }) {
  const R = 72, CX = 110, CY = 110;
  const CIRC = 2 * Math.PI * R;
  let cum = 0;
  const segs = segments.map(([partido, count]) => {
    const len = total > 0 ? (count / total) * CIRC : 0;
    const offset = CIRC - cum;
    cum += len;
    return { partido, count, len, offset };
  });
  const hovSeg = hovered ? segs.find(s => s.partido === hovered) : null;
  return (
    <div className="alc-donut-wrap">
      <svg viewBox="0 0 220 220" className="alc-donut-svg">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#edf2ff" strokeWidth={32}/>
        {segs.map(({ partido, count, len, offset }) => {
          const color = PARTIDO_SOLID[partido] || '#94a3b8';
          const isH = hovered === partido;
          return (
            <circle key={partido}
              cx={CX} cy={CY} r={R} fill="none"
              stroke={color}
              strokeWidth={isH ? 38 : 30}
              strokeDasharray={`${len} ${CIRC - len}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${CX} ${CY})`}
              style={{ cursor: 'pointer', transition: 'stroke-width .2s', opacity: hovered && !isH ? 0.35 : 1 }}
              onMouseEnter={() => onHover(partido)}
              onMouseLeave={() => onHover(null)}
            />
          );
        })}
        {hovSeg ? (
          <>
            <text x={CX} y={CY - 10} textAnchor="middle" fontSize="11" fontWeight="700"
              fill={PARTIDO_SOLID[hovered] || '#0c1f40'} style={{ letterSpacing: '0.05em' }}>{hovered}</text>
            <text x={CX} y={CY + 12} textAnchor="middle" fontSize="28" fontWeight="800" fill="#0c1f40">{hovSeg.count}</text>
            <text x={CX} y={CY + 27} textAnchor="middle" fontSize="9" fontWeight="600" fill="#94a3b8">{((hovSeg.count / total) * 100).toFixed(1)}% del total</text>
          </>
        ) : (
          <>
            <text x={CX} y={CY - 6} textAnchor="middle" fontSize="30" fontWeight="800" fill="#0c1f40">{total}</text>
            <text x={CX} y={CY + 14} textAnchor="middle" fontSize="9" fontWeight="700" fill="#94a3b8" style={{ letterSpacing: '0.06em' }}>MUNICIPIOS</text>
          </>
        )}
      </svg>
    </div>
  );
}

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
  const [detail,     setDetail]     = useState(null);
  const [showAnalysis,  setShowAnalysis]  = useState(false);
  const [donutHovered,  setDonutHovered]  = useState(null);

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

  // Listas dinámicas desde los datos reales (evita desajustes de formato)
  const dptosList    = useMemo(() => [...new Set(data.map(r => r.departamento).filter(Boolean))].sort(), [data]);
  const partidosList = useMemo(() => [...new Set(data.map(r => r.partido).filter(Boolean))].sort(), [data]);

  // Filtrado + sort — comparación normalizada (ignora tildes y mayúsculas)
  const filtered = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const ndpto    = norm(filtroDpto);
    const npartido = norm(filtroPartido);
    const base = data.filter(r => {
      if (ndpto    && norm(r.departamento) !== ndpto)    return false;
      if (npartido && norm(r.partido)      !== npartido) return false;
      if (q) {
        const h = [r.alcalde, r.municipio, r.departamento, r.partido]
          .filter(Boolean).join(' ').toLowerCase();
        if (!h.includes(q)) return false;
      }
      return true;
    });
    return applySort(base, sortCfg);
  }, [data, filtroDpto, filtroPartido, busqueda, sortCfg]);

  // Stats contextuales: distribución de partidos en el filtro actual
  const partidosEnFiltro = useMemo(() => {
    const counts = {};
    filtered.forEach(r => { if (r.partido) counts[r.partido] = (counts[r.partido] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  // KPIs
  const totalMunicipios    = filtered.length;
  const totalDepartamentos = useMemo(() => new Set(filtered.map(r => r.departamento).filter(Boolean)).size, [filtered]);
  const totalPartidos      = useMemo(() => new Set(filtered.map(r => r.partido).filter(Boolean)).size, [filtered]);
  const sinPartido         = useMemo(() => filtered.filter(r => !r.partido).length, [filtered]);

  // Partido dominante por departamento (responde al filtro activo)
  const deptoDominance = useMemo(() => {
    const dptos = [...new Set(filtered.map(r => r.departamento).filter(Boolean))].sort();
    return dptos.map(d => {
      const rows = filtered.filter(r => norm(r.departamento) === norm(d));
      const counts = {};
      rows.forEach(r => { if (r.partido) counts[r.partido] = (counts[r.partido] || 0) + 1; });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const [topPartido, topCount] = sorted[0] || ['—', 0];
      return { depto: d, total: rows.length, topPartido, topCount };
    }).sort((a, b) => b.total - a.total);
  }, [filtered]);

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
      'Correo':       r.correo       || '',
      'Teléfono':     r.telefono     || '',
      'Observaciones':r.observaciones|| '',
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
      departamento:  row.departamento  || '',
      municipio:     row.municipio     || '',
      alcalde:       row.alcalde       || '',
      partido:       row.partido       || '',
      correo:        row.correo        || '',
      telefono:      row.telefono      || '',
      observaciones: row.observaciones || '',
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

  // Stats globales (sobre data total, no filtered)
  const totalDptos   = useMemo(() => new Set(data.map(r => r.departamento).filter(Boolean)).size, [data]);
  const totalPartidosGlobal = useMemo(() => new Set(data.map(r => r.partido).filter(Boolean)).size, [data]);

  return (
    <div className="page-shell">
      <Navbar />
      <div className="alc-page">

        {/* ── HEADER ── */}
        <div className="alc-header">
          <div className="alc-header-brand">
            <div className="alc-header-icon"><FiHome size={22}/></div>
            <div>
              <h1 className="alc-header-title">Alcaldes Municipales</h1>
              <p className="alc-header-sub">Directorio oficial · República de Honduras</p>
            </div>
          </div>
          <div className="alc-header-stats">
            <div className="alc-hstat">
              <span className="alc-hstat-val">{data.length}</span>
              <span className="alc-hstat-lbl">Municipios</span>
            </div>
            <div className="alc-hstat-sep"/>
            <div className="alc-hstat">
              <span className="alc-hstat-val">{totalDptos}</span>
              <span className="alc-hstat-lbl">Departamentos</span>
            </div>
            <div className="alc-hstat-sep"/>
            <div className="alc-hstat">
              <span className="alc-hstat-val">{totalPartidosGlobal}</span>
              <span className="alc-hstat-lbl">Partidos</span>
            </div>
          </div>
        </div>

        {/* ── TOOLBAR ── */}
        <div className="alc-toolbar">
          <div className="alc-toolbar-left">
            <div className="alc-search-wrap">
              <FiSearch size={14} className="alc-search-icon"/>
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

            <select className="alc-sel-flt" value={filtroDpto} onChange={e => setFiltroDpto(e.target.value)}>
              <option value="">Todos los departamentos ({data.length})</option>
              {dptosList.map(d => {
                const cnt = data.filter(r => norm(r.departamento) === norm(d)).length;
                return <option key={d} value={d}>{d} ({cnt})</option>;
              })}
            </select>

            <select className="alc-sel-flt" value={filtroPartido} onChange={e => setFiltroPartido(e.target.value)}>
              <option value="">Todos los partidos</option>
              {partidosList.map(p => {
                const cnt = (filtroDpto
                  ? data.filter(r => norm(r.departamento) === norm(filtroDpto))
                  : data).filter(r => norm(r.partido) === norm(p)).length;
                return <option key={p} value={p}>{p} ({cnt})</option>;
              })}
            </select>

            {hayFiltros && (
              <button className="alc-btn-clear-flt" onClick={limpiarFiltros}>
                <FiX size={12}/> Limpiar
              </button>
            )}
            {hayFiltros && (
              <span className="alc-result-count">
                <strong>{filtered.length}</strong> resultado{filtered.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="alc-toolbar-right">
            <button className="alc-tool-icon" onClick={cargar} disabled={loading} title="Actualizar">
              <FiRefreshCw size={15}/>
            </button>
            {filtered.length > 0 && (
              <button className="alc-tool-btn alc-tool-btn--export" onClick={exportarExcel}>
                <FiDownload size={13}/> Exportar
              </button>
            )}
            <button
              className={`alc-tool-btn ${showAnalysis ? 'alc-tool-btn--analysis-active' : 'alc-tool-btn--analysis'}`}
              onClick={() => setShowAnalysis(s => !s)}
              title="Panel de análisis político">
              <FiPieChart size={13}/> Análisis
            </button>
            {canEdit && (
              <button
                className={`alc-tool-btn ${tab === 'nuevo' ? 'alc-tool-btn--back' : 'alc-tool-btn--new'}`}
                onClick={() => { tab === 'nuevo' ? cancelEdit() : setTab('nuevo'); }}
              >
                {tab === 'nuevo'
                  ? <><FiList size={13}/> Ver listado</>
                  : <><FiPlus size={13}/> Nuevo registro</>}
              </button>
            )}
          </div>
        </div>

        {/* ── PANEL ANÁLISIS ── */}
        {showAnalysis && (
          <div className="alc-analysis-panel">
            <div className="alc-analysis-panel__head">
              <FiPieChart size={16} color="#274C8D"/>
              <span className="alc-analysis-panel__title">Análisis Político — Distribución de Partido Político por Municipalidad</span>
              <button className="alc-analysis-panel__close" onClick={() => setShowAnalysis(false)}><FiX size={16}/></button>
            </div>
            <div className="alc-analysis-body">
              {/* Donut + Ranking */}
              <div className="alc-analysis-top">
                <div>
                  <div className="alc-analysis-section-title">Distribución por Partido</div>
                  <DonutChart
                    segments={partidosEnFiltro}
                    total={totalMunicipios}
                    hovered={donutHovered}
                    onHover={setDonutHovered}
                  />
                </div>
                <div>
                  <div className="alc-analysis-section-title">Ranking — Alcaldías por Partido · haz clic para filtrar</div>
                  <div className="alc-analysis-ranking">
                    {partidosEnFiltro.length === 0 ? (
                      <p style={{ color: '#94a3b8', fontSize: '13px' }}>No hay datos para mostrar.</p>
                    ) : partidosEnFiltro.map(([partido, count], i) => {
                      const pct = totalMunicipios > 0 ? ((count / totalMunicipios) * 100).toFixed(1) : '0.0';
                      const barPct = Math.round((count / (partidosEnFiltro[0]?.[1] || 1)) * 100);
                      const color = PARTIDO_SOLID[partido] || '#94a3b8';
                      const isH = donutHovered === partido;
                      return (
                        <div key={partido}
                          className={`alc-rank-row${isH ? ' alc-rank-row--hovered' : ''}`}
                          onMouseEnter={() => setDonutHovered(partido)}
                          onMouseLeave={() => setDonutHovered(null)}
                          onClick={() => setFiltroPartido(partido === filtroPartido ? '' : partido)}
                          style={{ cursor: 'pointer' }}>
                          <span className="alc-rank-num">{i + 1}</span>
                          <span className="alc-rank-dot" style={{ background: color }}/>
                          <span className="alc-rank-name">{partido}</span>
                          <div className="alc-rank-bar-wrap">
                            <div className="alc-rank-bar" style={{ width: `${barPct}%`, background: color }}/>
                          </div>
                          <span className="alc-rank-count">{count}</span>
                          <span className="alc-rank-pct">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* Partido dominante por depto */}
              <div>
                <div className="alc-analysis-section-title">Partido Dominante por Departamento · haz clic para filtrar</div>
                <div className="alc-depto-grid">
                  {deptoDominance.map(({ depto, total: dtotal, topPartido, topCount }) => {
                    const badgeStyle = PARTIDO_COLOR[topPartido] || PARTIDO_COLOR.OTRO;
                    const isActive = norm(filtroDpto) === norm(depto);
                    return (
                      <div key={depto}
                        className={`alc-depto-card${isActive ? ' alc-depto-card--active' : ''}`}
                        onClick={() => setFiltroDpto(isActive ? '' : depto)}>
                        <div className="alc-depto-card__name">{depto}</div>
                        {topPartido !== '—' ? (
                          <span className="alc-badge" style={badgeStyle}>
                            <span className="alc-badge-dot"/>{topPartido}
                          </span>
                        ) : (
                          <span className="alc-depto-card__na">Sin datos</span>
                        )}
                        {topPartido !== '—' && (
                          <div className="alc-depto-card__count">{topCount} de {dtotal} mun.</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit indicator */}
        {editingId && tab === 'nuevo' && (
          <div className="alc-edit-banner">
            <FiEdit3 size={13}/>
            <span>Editando: <strong>{form.alcalde || 'registro'}</strong> — {form.municipio}</span>
            <button onClick={cancelEdit}><FiX size={13}/></button>
          </div>
        )}

        {/* ── LISTADO ── */}
        {tab === 'listado' && (
        <div className="alc-list-wrap">
          {error && <div className="alc-error"><FiAlertCircle size={15}/> {error}</div>}

          {loading ? (
            <div className="alc-loading">
              <div className="alc-spinner-lg"/>
              <span>Cargando directorio…</span>
            </div>
          ) : !error && filtered.length === 0 ? (
            <div className="alc-empty">
              <FiHome size={42}/>
              <h3>Sin resultados</h3>
              <p>{data.length === 0
                ? 'No hay registros cargados en el sistema.'
                : 'Ningún registro coincide con los filtros aplicados.'}</p>
              {hayFiltros && (
                <button className="alc-btn-clear-flt" onClick={limpiarFiltros}>
                  <FiX size={12}/> Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="alc-table-wrap">
                <table className="alc-table">
                  <thead>
                    <tr>
                      <th className="alc-th alc-th--num">#</th>
                      <th className="alc-th alc-th--sort" onClick={() => handleSort('departamento')}>
                        <span className="alc-th-inner">Departamento <SortIcon col="departamento"/></span>
                      </th>
                      <th className="alc-th alc-th--sort" onClick={() => handleSort('municipio')}>
                        <span className="alc-th-inner">Municipio <SortIcon col="municipio"/></span>
                      </th>
                      <th className="alc-th alc-th--sort" onClick={() => handleSort('alcalde')}>
                        <span className="alc-th-inner">Alcalde / Alcaldesa <SortIcon col="alcalde"/></span>
                      </th>
                      <th className="alc-th alc-th--sort alc-th--partido" onClick={() => handleSort('partido')}>
                        <span className="alc-th-inner">Partido <SortIcon col="partido"/></span>
                      </th>
                      <th className="alc-th alc-th--actions">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((r, idx) => (
                      <tr key={r.id} className={idx % 2 === 1 ? 'alc-tr--alt' : ''}>
                        <td className="alc-td-num">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="alc-td-dpto">
                          <span className="alc-dpto-chip">{r.departamento || '—'}</span>
                        </td>
                        <td className="alc-td-mun">{r.municipio || '—'}</td>
                        <td className="alc-td-alc">{r.alcalde || '—'}</td>
                        <td className="alc-td-partido">
                          {r.partido
                            ? (
                              <span className="alc-badge"
                                style={PARTIDO_COLOR[r.partido] || PARTIDO_COLOR.OTRO}>
                                <span className="alc-badge-dot"/>
                                {r.partido}
                              </span>
                            )
                            : <span className="alc-badge-none">—</span>}
                        </td>
                        <td className="alc-td-actions">
                            <button className="alc-act-btn alc-act-btn--view" title="Ver detalle"
                              onClick={() => setDetail(r)}>
                              <FiEye size={13}/>
                            </button>
                            {canEdit && (
                              <>
                                <button className="alc-act-btn alc-act-btn--edit" title="Editar"
                                  onClick={() => handleEdit(r)}>
                                  <FiEdit3 size={13}/>
                                </button>
                                <button className="alc-act-btn alc-act-btn--del" title="Eliminar"
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
                    <tr className="alc-tfoot-row">
                      <td colSpan={canEdit ? 6 : 5}>
                        Mostrando <strong>{paginated.length}</strong> de <strong>{filtered.length}</strong> registros
                        {filtered.length !== data.length && <> · {data.length} en total</>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

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
            </>
          )}
        </div>
        )}

        {/* ── FORMULARIO ── */}
        {tab === 'nuevo' && canEdit && (
        <form className="alc-form" onSubmit={handleSubmit} noValidate>
          <div className="alc-form-card">
            <div className="alc-form-card-head">
              <h2 className="alc-form-card-title">
                {editingId ? 'Editar alcalde' : 'Registrar nuevo alcalde'}
              </h2>
              <p className="alc-form-card-sub">
                Complete todos los campos obligatorios marcados con <span className="alc-req">*</span>
              </p>
            </div>
            <div className="alc-form-body">
              <div className="alc-row2">
                <div className="alc-field">
                  <label className="alc-label">Departamento <span className="alc-req">*</span></label>
                  <select className="alc-input alc-select" value={form.departamento}
                    onChange={e => set('departamento', e.target.value)} required>
                    <option value="">Seleccione un departamento…</option>
                    {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="alc-field">
                  <label className="alc-label">Municipio <span className="alc-req">*</span></label>
                  <input className="alc-input" type="text" placeholder="Ej. San Pedro Sula"
                    value={form.municipio} onChange={e => set('municipio', e.target.value.toUpperCase())} required/>
                </div>
              </div>
              <div className="alc-row2">
                <div className="alc-field">
                  <label className="alc-label">Nombre completo del alcalde / alcaldesa <span className="alc-req">*</span></label>
                  <input className="alc-input" type="text" placeholder="Nombre completo"
                    value={form.alcalde} onChange={e => set('alcalde', e.target.value.toUpperCase())} required/>
                </div>
                <div className="alc-field">
                  <label className="alc-label">Partido político</label>
                  <select className="alc-input alc-select" value={form.partido}
                    onChange={e => set('partido', e.target.value)}>
                    <option value="">Sin partido / Independiente</option>
                    {PARTIDOS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {form.partido && (
                    <span className="alc-badge alc-badge--preview"
                      style={PARTIDO_COLOR[form.partido] || PARTIDO_COLOR.OTRO}>
                      <span className="alc-badge-dot"/>
                      {form.partido}
                    </span>
                  )}
                </div>
              </div>
              <div className="alc-row2">
                <div className="alc-field">
                  <label className="alc-label">Correo electrónico</label>
                  <input className="alc-input" type="email" placeholder="correo@ejemplo.com"
                    value={form.correo} onChange={e => set('correo', e.target.value)}/>
                </div>
                <div className="alc-field">
                  <label className="alc-label">Teléfono</label>
                  <input className="alc-input" type="text" placeholder="Ej. 9999-9999"
                    value={form.telefono} onChange={e => set('telefono', e.target.value)}/>
                </div>
              </div>
              <div className="alc-field">
                <label className="alc-label">Observaciones</label>
                <textarea className="alc-input alc-textarea" rows={3}
                  placeholder="Notas adicionales (opcional)"
                  value={form.observaciones} onChange={e => set('observaciones', e.target.value)}/>
              </div>
            </div>
            <div className="alc-form-footer">
              <button type="button" className="alc-btn-cancel" onClick={cancelEdit}>
                <FiX size={14}/> Cancelar
              </button>
              <button type="submit" className="alc-btn-save" disabled={saving}>
                {saving
                  ? <><span className="alc-spinner"/> Guardando…</>
                  : <><FiCheckCircle size={15}/> {editingId ? 'Actualizar registro' : 'Guardar registro'}</>}
              </button>
            </div>
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

      {/* ── Modal detalle ── */}
      {detail && (
        <div className="alc-overlay" onClick={() => setDetail(null)}>
          <div className="alc-modal-detail" onClick={e => e.stopPropagation()}>

            <div className="alc-modal-header">
              <h2>Detalle del Alcalde</h2>
              <button className="alc-modal-close" onClick={() => setDetail(null)}><FiX size={18}/></button>
            </div>

            <div className="alc-detail-body">
              {/* Hero */}
              <div className="alc-detail-hero">
                <div className="alc-detail-avatar">
                  <FiHome size={32}/>
                </div>
                <div className="alc-detail-hero-info">
                  <h3>{detail.alcalde || '—'}</h3>
                  <div className="alc-detail-badges">
                    <span className="alc-detail-mun-badge">{detail.municipio}</span>
                    {detail.partido && (
                      <span className="alc-badge"
                        style={PARTIDO_COLOR[detail.partido] || PARTIDO_COLOR.OTRO}>
                        <span className="alc-badge-dot"/>{detail.partido}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Grid de datos */}
              <div className="alc-detail-grid">
                <div className="alc-detail-item">
                  <span className="alc-detail-label"><FiMapPin size={11}/> Departamento</span>
                  <span className="alc-detail-value">{detail.departamento || '—'}</span>
                </div>
                <div className="alc-detail-item">
                  <span className="alc-detail-label"><FiHome size={11}/> Municipio</span>
                  <span className="alc-detail-value">{detail.municipio || '—'}</span>
                </div>
                <div className="alc-detail-item">
                  <span className="alc-detail-label"><FiAward size={11}/> Alcalde / Alcaldesa</span>
                  <span className="alc-detail-value">{detail.alcalde || '—'}</span>
                </div>
                <div className="alc-detail-item">
                  <span className="alc-detail-label"><FiFlag size={11}/> Partido político</span>
                  <span className="alc-detail-value">
                    {detail.partido
                      ? <span className="alc-badge" style={PARTIDO_COLOR[detail.partido] || PARTIDO_COLOR.OTRO}>
                          <span className="alc-badge-dot"/>{detail.partido}
                        </span>
                      : '—'}
                  </span>
                </div>
                {detail.correo && (
                  <div className="alc-detail-item">
                    <span className="alc-detail-label"><FiMail size={11}/> Correo electrónico</span>
                    <span className="alc-detail-value">
                      <a href={`mailto:${detail.correo}`} className="alc-detail-link">{detail.correo}</a>
                    </span>
                  </div>
                )}
                {detail.telefono && (
                  <div className="alc-detail-item">
                    <span className="alc-detail-label"><FiPhone size={11}/> Teléfono</span>
                    <span className="alc-detail-value">{detail.telefono}</span>
                  </div>
                )}
                {detail.observaciones && (
                  <div className="alc-detail-item alc-detail-item--full">
                    <span className="alc-detail-label"><FiFileText size={11}/> Observaciones</span>
                    <span className="alc-detail-value alc-detail-obs">{detail.observaciones}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="alc-detail-footer">
              <button className="alc-btn-cancel" onClick={() => setDetail(null)}>Cerrar</button>
              {canEdit && (
                <button className="alc-btn-save" onClick={() => { setDetail(null); handleEdit(detail); }}>
                  <FiEdit3 size={14}/> Editar
                </button>
              )}
            </div>
          </div>
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
