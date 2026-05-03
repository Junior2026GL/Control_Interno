import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  FiPlus, FiRefreshCw, FiEdit3, FiTrash2, FiX,
  FiCheckCircle, FiAlertCircle, FiFilter, FiList,
  FiDollarSign, FiMapPin, FiSearch, FiDownload, FiChevronUp, FiChevronDown,
} from 'react-icons/fi';
import * as XLSX from 'xlsx';
import Navbar from '../components/Navbar';
import api from '../api/axios';
import './AyudasAlcaldias.css';

const PARTIDOS = ['PN', 'PL', 'LB', 'DC', 'PINU'];
const MESES    = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DEPARTAMENTOS = [
  'ATLÁNTIDA','CHOLUTECA','COLÓN','COMAYAGUA','COPÁN','CORTÉS',
  'EL PARAÍSO','FRANCISCO MORAZÁN','GRACIAS A DIOS','INTIBUCÁ',
  'ISLAS DE LA BAHÍA','LA PAZ','LEMPIRA','OCOTEPEQUE','OLANCHO',
  'SANTA BÁRBARA','VALLE','YORO',
];

const CURRENT_YEAR = new Date().getFullYear();
const ANIOS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

function buildEmpty() {
  return {
    no_cheque: '', cuenta: '', beneficiario: '', departamento: '',
    orden_pago: '', descripcion: '', total: '',
    estado_entrega: 'pendiente', fecha_entrega: '',
    debitado: false, liquidado: false, fecha_liquidacion: '',
    partido: '', mes: '', anio: String(CURRENT_YEAR),
  };
}

const PARTIDO_COLOR = {
  PN:   { bg: '#dbeafe', color: '#1e40af' },
  PL:   { bg: '#fee2e2', color: '#b91c1c' },
  LB:   { bg: '#d1fae5', color: '#065f46' },
  DC:   { bg: '#ede9fe', color: '#5b21b6' },
  PINU: { bg: '#fef9c3', color: '#854d0e' },
};

function fmtMonto(v) {
  return `Lps. ${parseFloat(v||0).toLocaleString('es-HN',{minimumFractionDigits:2})}`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function applySort(arr, { col, dir }) {
  if (!col) return arr;
  return [...arr].sort((a, b) => {
    let va = a[col], vb = b[col];
    if (va == null) va = '';
    if (vb == null) vb = '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

const PAGE_SIZE = 10;

export default function AyudasAlcaldias() {
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

  const [filtroDpto,      setFiltroDpto]      = useState('');
  const [filtroMes,       setFiltroMes]       = useState('');
  const [filtroAnio,      setFiltroAnio]      = useState('');
  const [filtroPartido,   setFiltroPartido]   = useState('');
  const [filtroEstado,    setFiltroEstado]    = useState('');
  const [filtroDebitado,  setFiltroDebitado]  = useState('');
  const [filtroLiquidado, setFiltroLiquidado] = useState('');
  const [busqueda,        setBusqueda]        = useState('');

  const [sortCfg, setSortCfg] = useState({ col: null, dir: 'asc' });
  const [page, setPage]       = useState(1);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: rows } = await api.get('/ayudas-alcaldias');
      setData(rows);
    } catch {
      setError('No se pudo cargar el listado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => { setPage(1); },
    [filtroDpto, filtroMes, filtroAnio, filtroPartido, filtroEstado, filtroDebitado, filtroLiquidado, busqueda, sortCfg]);

  const filtered = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = data.filter(r => {
      if (filtroDpto     && r.departamento !== filtroDpto)     return false;
      if (filtroMes      && r.mes !== filtroMes)               return false;
      if (filtroAnio     && String(r.anio) !== filtroAnio)     return false;
      if (filtroPartido  && r.partido !== filtroPartido)       return false;
      if (filtroEstado   && r.estado_entrega !== filtroEstado) return false;
      if (filtroDebitado === '1' && !r.debitado)               return false;
      if (filtroDebitado === '0' && r.debitado)                return false;
      if (filtroLiquidado === '1' && !r.liquidado)             return false;
      if (filtroLiquidado === '0' && r.liquidado)              return false;
      if (q) {
        const haystack = [r.beneficiario, r.no_cheque, r.orden_pago, r.descripcion]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return applySort(base, sortCfg);
  }, [data, filtroDpto, filtroMes, filtroAnio, filtroPartido, filtroEstado, filtroDebitado, filtroLiquidado, busqueda, sortCfg]);

  const totalGeneral   = useMemo(() => filtered.reduce((s, r) => s + parseFloat(r.total || 0), 0), [filtered]);
  const totalEntregado = useMemo(() => filtered.filter(r => r.estado_entrega === 'entregado').reduce((s, r) => s + parseFloat(r.total || 0), 0), [filtered]);
  const totalVencidos  = useMemo(() => filtered.filter(r => r.estado_vencimiento === 'VENCIDO').length, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (col) => {
    setSortCfg(prev => ({
      col,
      dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };
  const SortIcon = ({ col }) => {
    if (sortCfg.col !== col) return <FiChevronUp size={11} style={{ opacity: 0.3 }} />;
    return sortCfg.dir === 'asc'
      ? <FiChevronUp size={11} style={{ opacity: 1 }} />
      : <FiChevronDown size={11} style={{ opacity: 1 }} />;
  };

  const exportarExcel = () => {
    const rows = filtered.map(r => ({
      'No. Cheque':     r.no_cheque || '',
      'Cuenta':         r.cuenta || '',
      'Beneficiario':   r.beneficiario,
      'Departamento':   r.departamento,
      'O-P':            r.orden_pago || '',
      'Descripción':    r.descripcion,
      'Total (Lps.)':   parseFloat(r.total || 0),
      'Estado':         r.estado_entrega,
      'Fecha Entrega':  r.fecha_entrega ? r.fecha_entrega.split('T')[0] : '',
      'Días':           r.dias_transcurridos ?? '',
      'Vencimiento':    r.estado_vencimiento || '',
      'Año':            r.anio || '',
      'Mes':            r.mes || '',
      'Debitado':       r.debitado ? 'Sí' : 'No',
      'Liquidado':      r.liquidado ? 'Sí' : 'No',
      'F. Liquidación': r.fecha_liquidacion ? r.fecha_liquidacion.split('T')[0] : '',
      'Partido':        r.partido || '',
      'Registrado por': r.registrado_por || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ayudas Alcaldías');
    XLSX.writeFile(wb, `ayudas_alcaldias_${Date.now()}.xlsx`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.beneficiario.trim()) { showToast('El beneficiario es requerido.','error'); return; }
    if (!form.departamento.trim()) { showToast('El departamento es requerido.','error'); return; }
    if (!form.descripcion.trim())  { showToast('La descripción es requerida.','error'); return; }
    const tot = parseFloat(form.total);
    if (!form.total || isNaN(tot) || tot <= 0) { showToast('El monto debe ser mayor a cero.','error'); return; }

    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/ayudas-alcaldias/${editingId}`, form);
        showToast('Registro actualizado correctamente.');
      } else {
        await api.post('/ayudas-alcaldias', form);
        showToast('Registro creado correctamente.');
      }
      setForm(buildEmpty());
      setEditingId(null);
      setTab('listado');
      cargar();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Error al guardar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (row) => {
    setForm({
      no_cheque:         row.no_cheque || '',
      cuenta:            row.cuenta || '',
      beneficiario:      row.beneficiario || '',
      departamento:      row.departamento || '',
      orden_pago:        row.orden_pago || '',
      descripcion:       row.descripcion || '',
      total:             row.total || '',
      estado_entrega:    row.estado_entrega || 'pendiente',
      fecha_entrega:     row.fecha_entrega ? row.fecha_entrega.split('T')[0] : '',
      debitado:          !!row.debitado,
      liquidado:         !!row.liquidado,
      fecha_liquidacion: row.fecha_liquidacion ? row.fecha_liquidacion.split('T')[0] : '',
      partido:           row.partido || '',
      mes:               row.mes || '',
      anio:              row.anio ? String(row.anio) : String(CURRENT_YEAR),
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
          await api.delete(`/ayudas-alcaldias/${id}`);
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

  const limpiarFiltros = () => {
    setFiltroDpto(''); setFiltroMes(''); setFiltroAnio('');
    setFiltroPartido(''); setFiltroEstado('');
    setFiltroDebitado(''); setFiltroLiquidado(''); setBusqueda('');
  };

  const hayFiltros = filtroDpto || filtroMes || filtroAnio || filtroPartido ||
    filtroEstado || filtroDebitado || filtroLiquidado || busqueda;

  return (
    <div className="page-shell">
      <Navbar />
      <div className="aa-page">

        {/* ── HEADER ── */}
        <div className="aa-header">
          <div className="aa-header-brand">
            <div className="aa-header-icon"><FiMapPin size={24}/></div>
            <div>
              <h1 className="aa-banner-title">Alcaldías Beneficiadas · Ayuda Social</h1>
              <p className="aa-banner-sub">Control de cheques, estados de entrega y liquidaciones</p>
            </div>
          </div>
          <div className="aa-header-stats">
            <div className="aa-hstat">
              <span className="aa-hstat-val">{data.length}</span>
              <span className="aa-hstat-lbl">Registros</span>
            </div>
            <div className="aa-hstat-sep"/>
            <div className="aa-hstat">
              <span className="aa-hstat-val">{fmtMonto(data.reduce((s,r)=>s+parseFloat(r.total||0),0))}</span>
              <span className="aa-hstat-lbl">Total global</span>
            </div>
            <div className="aa-hstat-sep"/>
            <div className="aa-hstat">
              <span className="aa-hstat-val">{data.filter(r=>r.estado_vencimiento==='VENCIDO').length}</span>
              <span className="aa-hstat-lbl">Vencidos</span>
            </div>
          </div>
        </div>

        {/* ── CARDS KPI ── */}
        <div className="aa-cards">
          <div className="aa-card">
            <span className="aa-card-label">Registros {hayFiltros?'filtrados':'totales'}</span>
            <span className="aa-card-val">{filtered.length}</span>
          </div>
          <div className="aa-card aa-card--blue">
            <span className="aa-card-label">Total general</span>
            <span className="aa-card-val aa-card-val--sm">{fmtMonto(totalGeneral)}</span>
          </div>
          <div className="aa-card aa-card--green">
            <span className="aa-card-label">Total entregado</span>
            <span className="aa-card-val aa-card-val--sm">{fmtMonto(totalEntregado)}</span>
          </div>
          <div className="aa-card aa-card--red">
            <span className="aa-card-label">Registros vencidos</span>
            <span className="aa-card-val">{totalVencidos}</span>
          </div>
        </div>

        <div className="aa-tabs">
          <button className={`aa-tab ${tab==='listado'?'aa-tab--active':''}`} onClick={() => { setTab('listado'); cargar(); }}>
            <FiList size={14} /> Listado
          </button>
          <button className={`aa-tab ${tab==='nuevo'?'aa-tab--active':''}`} onClick={() => setTab('nuevo')}>
            <FiPlus size={14} /> {editingId ? 'Editando registro' : 'Nuevo registro'}
          </button>
        </div>

        {tab === 'listado' && (
        <div className="aa-listado">

          {/* ── TOOLBAR ── */}
          <div className="aa-toolbar">
            <div className="aa-toolbar-row1">
              <div className="aa-search-wrap">
                <FiSearch size={13} className="aa-search-icon"/>
                <input className="aa-search-input" type="text"
                  placeholder="Buscar beneficiario, cheque, O-P…"
                  value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
                {busqueda && <button className="aa-search-clear" onClick={()=>setBusqueda('')}><FiX size={12}/></button>}
              </div>
              <select className="aa-flt" value={filtroDpto} onChange={e=>setFiltroDpto(e.target.value)}>
                <option value="">Todos los departamentos</option>
                {DEPARTAMENTOS.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <select className="aa-flt" value={filtroAnio} onChange={e=>setFiltroAnio(e.target.value)}>
                <option value="">Todos los años</option>
                {ANIOS.map(a=><option key={a} value={String(a)}>{a}</option>)}
              </select>
              <select className="aa-flt" value={filtroMes} onChange={e=>setFiltroMes(e.target.value)}>
                <option value="">Todos los meses</option>
                {MESES.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="aa-toolbar-row2">
              <select className="aa-flt" value={filtroPartido} onChange={e=>setFiltroPartido(e.target.value)}>
                <option value="">Todos los partidos</option>
                {PARTIDOS.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <select className="aa-flt" value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}>
                <option value="">Todos los estados</option>
                <option value="entregado">Entregado</option>
                <option value="pendiente">Pendiente</option>
              </select>
              <select className="aa-flt" value={filtroDebitado} onChange={e=>setFiltroDebitado(e.target.value)}>
                <option value="">Debitado: todos</option>
                <option value="1">Sí debitado</option>
                <option value="0">No debitado</option>
              </select>
              <select className="aa-flt" value={filtroLiquidado} onChange={e=>setFiltroLiquidado(e.target.value)}>
                <option value="">Liquidado: todos</option>
                <option value="1">Sí liquidado</option>
                <option value="0">No liquidado</option>
              </select>
              <div className="aa-toolbar-actions">
                {hayFiltros && (
                  <>
                    <span className="aa-result-count"><strong>{filtered.length}</strong> resultado{filtered.length!==1?'s':''}</span>
                    <button className="aa-btn-clear-filters" onClick={limpiarFiltros}><FiX size={12}/> Limpiar</button>
                  </>
                )}
                <button className="aa-btn-refresh" onClick={cargar} disabled={loading} title="Actualizar"><FiRefreshCw size={14}/></button>
                {filtered.length>0 && (
                  <button className="aa-btn-export" onClick={exportarExcel}><FiDownload size={13}/> Excel</button>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="aa-error"><FiAlertCircle size={15}/> {error}</div>
          )}

          {loading && <div className="aa-loading">Cargando…</div>}

          {!loading && !error && filtered.length === 0 && (
            <div className="aa-empty">
              <FiDollarSign size={38}/>
              <p>No hay registros para los filtros seleccionados.</p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
          <>
          <div className="aa-table-wrap">
            <table className="aa-table">
              <thead>
                <tr>
                  <th><span className="aa-th-inner aa-th-sort" onClick={()=>handleSort('no_cheque')}>No. Cheq. <SortIcon col="no_cheque"/></span></th>
                  <th><span className="aa-th-inner">Cuenta</span></th>
                  <th><span className="aa-th-inner aa-th-sort" onClick={()=>handleSort('beneficiario')}>Beneficiario <SortIcon col="beneficiario"/></span></th>
                  <th><span className="aa-th-inner aa-th-sort" onClick={()=>handleSort('departamento')}>Departamento <SortIcon col="departamento"/></span></th>
                  <th><span className="aa-th-inner">O-P</span></th>
                  <th><span className="aa-th-inner">Descripción</span></th>
                  <th><span className="aa-th-inner aa-th-sort" onClick={()=>handleSort('total')}>Total <SortIcon col="total"/></span></th>
                  <th><span className="aa-th-inner aa-th-sort" onClick={()=>handleSort('estado_entrega')}>Estado <SortIcon col="estado_entrega"/></span></th>
                  <th><span className="aa-th-inner aa-th-sort" onClick={()=>handleSort('fecha_entrega')}>F. Entrega <SortIcon col="fecha_entrega"/></span></th>
                  <th><span className="aa-th-inner aa-th-sort" onClick={()=>handleSort('dias_transcurridos')}>Días <SortIcon col="dias_transcurridos"/></span></th>
                  <th><span className="aa-th-inner">Venc.</span></th>
                  <th><span className="aa-th-inner aa-th-sort" onClick={()=>handleSort('anio')}>Año/Mes <SortIcon col="anio"/></span></th>
                  <th><span className="aa-th-inner">Debitado</span></th>
                  <th><span className="aa-th-inner">Liquidado</span></th>
                  <th><span className="aa-th-inner">Partido</span></th>
                  <th><span className="aa-th-inner">F. Liquidación</span></th>
                  <th><span className="aa-th-inner">Registrado por</span></th>
                  <th><span className="aa-th-inner">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(r => (
                  <tr key={r.id} className={r.estado_vencimiento==='VENCIDO'?'aa-row--vencido':''}>
                    <td className="aa-td-cheque">{r.no_cheque||'—'}</td>
                    <td>{r.cuenta||'—'}</td>
                    <td className="aa-td-benef">{r.beneficiario}</td>
                    <td className="aa-td-dpto">{r.departamento}</td>
                    <td className="aa-td-op">{r.orden_pago||'—'}</td>
                    <td className="aa-td-desc" title={r.descripcion}>{r.descripcion}</td>
                    <td className="aa-td-monto">{fmtMonto(r.total)}</td>
                    <td>
                      <span className={`aa-badge ${r.estado_entrega==='entregado'?'aa-badge--ok':'aa-badge--pend'}`}>
                        {r.estado_entrega}
                      </span>
                    </td>
                    <td className="aa-td-fecha">{fmtDate(r.fecha_entrega)}</td>
                    <td className="aa-td-dias">{r.dias_transcurridos ?? '—'}</td>
                    <td>
                      {r.estado_vencimiento
                        ? <span className={`aa-badge ${r.estado_vencimiento==='VENCIDO'?'aa-badge--venc':'aa-badge--vig'}`}>
                            {r.estado_vencimiento}
                          </span>
                        : '—'}
                    </td>
                    <td className="aa-td-anio">{r.anio||'—'}{r.mes ? <span className="aa-td-mes"> · {r.mes}</span> : ''}</td>
                    <td className="aa-td-bool">
                      {r.debitado
                        ? <FiCheckCircle size={15} className="aa-icon--ok"/>
                        : <FiX size={15} className="aa-icon--no"/>}
                    </td>
                    <td className="aa-td-bool">
                      {r.liquidado
                        ? <FiCheckCircle size={15} className="aa-icon--ok"/>
                        : <FiX size={15} className="aa-icon--no"/>}
                    </td>
                    <td>
                      {r.partido
                        ? <span className="aa-partido" style={PARTIDO_COLOR[r.partido]||{}}>{r.partido}</span>
                        : '—'}
                    </td>
                    <td className="aa-td-fecha">{fmtDate(r.fecha_liquidacion)}</td>
                    <td className="aa-td-regby">{r.registrado_por||'—'}</td>
                    <td className="aa-td-actions">
                      <button className="aa-btn-icon aa-btn-icon--edit" title="Editar" onClick={()=>handleEdit(r)}>
                        <FiEdit3 size={14}/>
                      </button>
                      <button className="aa-btn-icon aa-btn-icon--del" title="Eliminar"
                        disabled={deletingId===r.id} onClick={()=>handleDelete(r.id)}>
                        <FiTrash2 size={14}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="aa-tfoot-row">
                  <td colSpan={6} className="aa-tfoot-label">
                    Total ({filtered.length} registros{filtered.length !== data.length ? ` de ${data.length}` : ''})
                  </td>
                  <td className="aa-tfoot-monto">{fmtMonto(totalGeneral)}</td>
                  <td colSpan={12}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="std-pg">
              <span className="std-pg-info">
                {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,filtered.length)} de <strong>{filtered.length}</strong>
              </span>
              <div className="std-pg-controls">
                <button className="std-pg-btn" disabled={page===1} onClick={()=>setPage(1)}>«</button>
                <button className="std-pg-btn" disabled={page===1} onClick={()=>setPage(p=>p-1)}>‹</button>
                {Array.from({length:totalPages},(_, i)=>i+1)
                  .filter(n=>n===1||n===totalPages||Math.abs(n-page)<=1)
                  .reduce((acc,n,i,arr)=>{
                    if(i>0&&n-arr[i-1]>1) acc.push('…');
                    acc.push(n); return acc;
                  },[])
                  .map((n,i)=> n==='…'
                    ? <span key={`e${i}`} className="std-pg-ellipsis">…</span>
                    : <button key={n} className={`std-pg-btn std-pg-num${page===n?' std-pg-num--active':''}`} onClick={()=>setPage(n)}>{n}</button>
                  )}
                <button className="std-pg-btn" disabled={page===totalPages} onClick={()=>setPage(p=>p+1)}>›</button>
                <button className="std-pg-btn" disabled={page===totalPages} onClick={()=>setPage(totalPages)}>»</button>
              </div>
              <span className="std-pg-total">Pág. {page} / {totalPages}</span>
            </div>
          )}
          </>
          )}
        </div>
        )}

        {tab === 'nuevo' && (
        <form className="aa-form" onSubmit={handleSubmit} noValidate>
          <div className="aa-form-grid">

            <div className="aa-section">
              <div className="aa-section-head">
                <span className="aa-step">1</span>
                <div>
                  <h2 className="aa-section-title">Identificación del cheque</h2>
                  <p className="aa-section-desc">No. cheque, cuenta y orden de pago</p>
                </div>
              </div>
              <div className="aa-fields">
                <div className="aa-row3">
                  <div className="aa-field">
                    <label className="aa-label">No. Cheque</label>
                    <input className="aa-input" type="text" placeholder="165121" value={form.no_cheque} onChange={e=>set('no_cheque',e.target.value)}/>
                  </div>
                  <div className="aa-field">
                    <label className="aa-label">Cuenta</label>
                    <input className="aa-input" type="text" placeholder="512-20" value={form.cuenta} onChange={e=>set('cuenta',e.target.value)}/>
                  </div>
                  <div className="aa-field">
                    <label className="aa-label">Orden de Pago (O-P)</label>
                    <input className="aa-input" type="text" placeholder="001/AS/2026" value={form.orden_pago} onChange={e=>set('orden_pago',e.target.value)}/>
                  </div>
                </div>
              </div>
            </div>

            <div className="aa-section">
              <div className="aa-section-head">
                <span className="aa-step">2</span>
                <div>
                  <h2 className="aa-section-title">Beneficiario</h2>
                  <p className="aa-section-desc">Alcaldía y departamento</p>
                </div>
              </div>
              <div className="aa-fields">
                <div className="aa-field-full">
                  <label className="aa-label">Beneficiario <span className="aa-req">*</span></label>
                  <input className="aa-input" type="text" placeholder="ALCALDÍA MUNICIPAL DE..."
                    value={form.beneficiario} onChange={e=>set('beneficiario',e.target.value.toUpperCase())} required/>
                </div>
                <div className="aa-row2">
                  <div className="aa-field">
                    <label className="aa-label">Departamento <span className="aa-req">*</span></label>
                    <select className="aa-input aa-select" value={form.departamento} onChange={e=>set('departamento',e.target.value)} required>
                      <option value="">Seleccione…</option>
                      {DEPARTAMENTOS.map(d=><option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="aa-field">
                    <label className="aa-label">Partido Político</label>
                    <select className="aa-input aa-select" value={form.partido} onChange={e=>set('partido',e.target.value)}>
                      <option value="">Sin partido</option>
                      {PARTIDOS.map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="aa-section">
              <div className="aa-section-head">
                <span className="aa-step">3</span>
                <div>
                  <h2 className="aa-section-title">Monto y descripción</h2>
                  <p className="aa-section-desc">Tipo de ayuda e importe</p>
                </div>
              </div>
              <div className="aa-fields">
                <div className="aa-row3">
                  <div className="aa-field">
                    <label className="aa-label">Total (Lps.) <span className="aa-req">*</span></label>
                    <div className="aa-icon-field">
                      <span className="aa-currency">Lps.</span>
                      <input className="aa-input aa-has-icon" type="number" placeholder="0.00" min="0.01" step="0.01"
                        value={form.total} onChange={e=>set('total',e.target.value)} required/>
                    </div>
                  </div>
                  <div className="aa-field">
                    <label className="aa-label">Año</label>
                    <select className="aa-input aa-select" value={form.anio} onChange={e=>set('anio',e.target.value)}>
                      <option value="">Sin año</option>
                      {ANIOS.map(a=><option key={a} value={String(a)}>{a}</option>)}
                    </select>
                  </div>
                  <div className="aa-field">
                    <label className="aa-label">Mes</label>
                    <select className="aa-input aa-select" value={form.mes} onChange={e=>set('mes',e.target.value)}>
                      <option value="">Seleccione…</option>
                      {MESES.map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div className="aa-field-full">
                  <label className="aa-label">Descripción <span className="aa-req">*</span></label>
                  <textarea className="aa-input aa-textarea" rows={3} placeholder="Ej: AYUDA ECONÓMICA PARA FERIA PATRONAL..."
                    value={form.descripcion} onChange={e=>set('descripcion',e.target.value)} required/>
                </div>
              </div>
            </div>

            <div className="aa-section">
              <div className="aa-section-head">
                <span className="aa-step">4</span>
                <div>
                  <h2 className="aa-section-title">Estado de entrega y liquidación</h2>
                  <p className="aa-section-desc">Seguimiento del cheque</p>
                </div>
              </div>
              <div className="aa-fields">
                <div className="aa-row2">
                  <div className="aa-field">
                    <label className="aa-label">Estado de entrega</label>
                    <select className="aa-input aa-select" value={form.estado_entrega} onChange={e=>set('estado_entrega',e.target.value)}>
                      <option value="pendiente">Pendiente</option>
                      <option value="entregado">Entregado</option>
                    </select>
                  </div>
                  <div className="aa-field">
                    <label className="aa-label">Fecha de entrega</label>
                    <input lang="es" className="aa-input" type="date" value={form.fecha_entrega} onChange={e=>set('fecha_entrega',e.target.value)}/>
                  </div>
                </div>
                <div className="aa-row3-checks">
                  <label className="aa-check-label">
                    <input type="checkbox" checked={form.debitado} onChange={e=>set('debitado',e.target.checked)}/>
                    <span>Debitado</span>
                  </label>
                  <label className="aa-check-label">
                    <input type="checkbox" checked={form.liquidado} onChange={e=>set('liquidado',e.target.checked)}/>
                    <span>Liquidado</span>
                  </label>
                </div>
                {form.liquidado && (
                  <div className="aa-field">
                    <label className="aa-label">Fecha de liquidación</label>
                    <input lang="es" className="aa-input" type="date" value={form.fecha_liquidacion} onChange={e=>set('fecha_liquidacion',e.target.value)}/>
                  </div>
                )}
              </div>
            </div>

          </div>

          <div className="aa-form-actions">
            <button type="button" className="aa-btn-cancel" onClick={cancelEdit}>
              <FiX size={14}/> Cancelar
            </button>
            <button type="submit" className="aa-btn-save" disabled={saving}>
              {saving ? <><span className="aa-spinner"/> Guardando…</> : <><FiCheckCircle size={15}/> {editingId?'Actualizar':'Guardar registro'}</>}
            </button>
          </div>
        </form>
        )}

      </div>

      {toast && (
        <div className={`aa-toast aa-toast--${toast.type}`} role="alert">
          <span>{toast.msg}</span>
          <button onClick={()=>setToast(null)}>✕</button>
        </div>
      )}

      {confirmCfg && (
        <div className="aa-confirm-overlay" onClick={()=>setConfirmCfg(null)}>
          <div className="aa-confirm-box" onClick={e=>e.stopPropagation()}>
            <p>{confirmCfg.msg}</p>
            <div className="aa-confirm-btns">
              <button className="aa-cfm-cancel" onClick={()=>setConfirmCfg(null)}>Cancelar</button>
              <button className="aa-cfm-ok" onClick={()=>{confirmCfg.onOk();setConfirmCfg(null);}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
