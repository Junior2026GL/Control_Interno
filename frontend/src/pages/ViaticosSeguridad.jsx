import { useEffect, useState, useCallback, useContext, useMemo } from 'react';
import {
  FiPlus, FiTrash2, FiEdit2, FiX, FiSearch, FiPrinter,
  FiUsers, FiRefreshCw, FiEye, FiCalendar, FiArrowLeft,
  FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight,
} from 'react-icons/fi';
import { LuShieldCheck } from 'react-icons/lu';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import { generarReciboSeguridadPdf, limitesContenido } from '../utils/viaticoSeguridadPdf';
import './Bodegas.css';
import './ViaticosNacionales.css';
import './ViaticosSeguridad.css';

/* ── Utilidades ──────────────────────────────────────────── */
const today = () => new Date().toISOString().split('T')[0];
const num = v => parseFloat(v) || 0;

function fmtFecha(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}
function fmtMonto(v) {
  return 'L ' + num(v).toLocaleString('es-HN', { minimumFractionDigits: 2 });
}
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}
function dayShort(iso) {
  const [y, m, d] = String(iso).split('T')[0].split('-');
  return ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'][new Date(+y, +m - 1, +d).getDay()];
}
function getAllDates(desde, hasta) {
  if (!desde || !hasta || hasta < desde) return [];
  const dates = [];
  let cur = desde;
  while (cur <= hasta && dates.length < 62) {
    dates.push(cur);
    const d = new Date(cur + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    cur = d.toISOString().split('T')[0];
  }
  return dates;
}
/* Alinea los montos diarios de un renglón con las fechas del período */
const syncDias = (fechas, dias = []) =>
  fechas.map(fecha => ({ fecha, monto: dias.find(d => String(d.fecha).slice(0, 10) === fecha)?.monto ?? '' }));

const sumDias = dias => (dias || []).reduce((s, d) => s + num(d.monto), 0);
const totalAlim = r => sumDias(r.dias);
const totalHosp = r => (num(r.cantidad) || 1) * sumDias(r.dias);

function buildEmpty() {
  const f = today();
  const fechas = [f];
  return {
    numero_identidad: '', nombre_beneficiario: '', mision: '', lugar: '',
    dependencia: 'PRESIDENCIA', cargo: '', encargado_mision: '',
    periodo_desde: f, periodo_hasta: f, hora_salida: '', hora_regreso: '',
    alimentacion: [{ nombre: '', cargo: '', dias: syncDias(fechas) }],
    hospedaje:    [{ detalle: 'HABITACION SENCILLA', cantidad: '1', dias: syncDias(fechas) }],
    combustible:  [{ nombre: '', detalle: '', monto: '' }],
    monto_imprevistos: '', otros_descripcion: '', monto_otros: '',
    observaciones: '',
  };
}

function clientValidate(form) {
  const e = {};
  if ((form.numero_identidad || '').replace(/\D/g, '').length !== 13) e.numero_identidad = 'El DNI debe tener 13 digitos.';
  if (!(form.nombre_beneficiario || '').trim()) e.nombre_beneficiario = 'Busque el DNI para obtener el nombre.';
  if (!(form.mision || '').trim()) e.mision = 'La mision es requerida.';
  if (!(form.lugar || '').trim())  e.lugar  = 'El lugar es requerido.';
  if (!form.periodo_desde) e.periodo_desde = 'Fecha de inicio requerida.';
  if (!form.periodo_hasta) e.periodo_hasta = 'Fecha de fin requerida.';
  if (form.periodo_hasta && form.periodo_desde && form.periodo_hasta < form.periodo_desde)
    e.periodo_hasta = 'La fecha fin no puede ser anterior al inicio.';
  return e;
}

/* Carga el logo para el PDF (opcional) */
async function cargarLogo() {
  try {
    const resp = await fetch('/logo-congreso.png.png');
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    return await new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(blobUrl);
        // Recorta el margen blanco para que el sello llene el espacio del encabezado
        const b = limitesContenido(ctx, c.width, c.height);
        if (!b) { resolve(c.toDataURL('image/png')); return; }
        const r = document.createElement('canvas');
        r.width = b.ancho; r.height = b.alto;
        r.getContext('2d').drawImage(c, b.x, b.y, b.ancho, b.alto, 0, 0, b.ancho, b.alto);
        resolve(r.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null); };
      img.src = blobUrl;
    });
  } catch { return null; }
}

/* ══════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════════ */
export default function ViaticosSeguridad() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [registros, setRegistros]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(false);
  const [editing, setEditing]       = useState(null);
  const [viewing, setViewing]       = useState(null);
  const [form, setForm]             = useState(buildEmpty);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast]           = useState(null);
  const [busqueda, setBusqueda]     = useState('');
  const [filtroAnio, setFiltroAnio] = useState(String(new Date().getFullYear()));
  const [page, setPage]             = useState(1);
  const [dniLoading, setDniLoading] = useState(false);
  const [dniError, setDniError]     = useState('');
  const [printLoading, setPrintLoading] = useState(null);
  const [aplicarAlim, setAplicarAlim] = useState('');
  const [aplicarHosp, setAplicarHosp] = useState('');

  const PAGE_SIZE = 10;
  const canEdit   = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'].includes(user?.rol);

  const showToast = (msg, type = 'error') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4500); };

  const fetchRegistros = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/viaticos-seguridad', { headers: authHeaders() }); setRegistros(res.data); }
    catch { showToast('Error al cargar los registros.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRegistros(); }, [fetchRegistros]);
  useEffect(() => { setPage(1); }, [busqueda, filtroAnio]);

  const closeModal = () => { setModal(false); setEditing(null); setDniError(''); };

  useEffect(() => {
    const h = (e) => {
      if (e.key !== 'Escape') return;
      if (modal) { closeModal(); return; }
      if (viewing) { setViewing(null); return; }
      if (confirmDel) setConfirmDel(null);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [modal, viewing, confirmDel]);

  /* Fechas del período: una columna por día en alimentación y hospedaje */
  const fechas = useMemo(
    () => getAllDates(form.periodo_desde, form.periodo_hasta),
    [form.periodo_desde, form.periodo_hasta]
  );

  useEffect(() => {
    if (!fechas.length) return;
    setForm(f => ({
      ...f,
      alimentacion: f.alimentacion.map(r => ({ ...r, dias: syncDias(fechas, r.dias) })),
      hospedaje:    f.hospedaje.map(r => ({ ...r, dias: syncDias(fechas, r.dias) })),
    }));
  }, [fechas]);

  const handleDniSearch = async () => {
    const dni = (form.numero_identidad || '').replace(/\D/g, '');
    if (dni.length !== 13) { setDniError('Ingrese los 13 digitos del DNI.'); return; }
    setDniLoading(true); setDniError('');
    try {
      const res = await api.get(`/censo/${encodeURIComponent(dni)}`, { headers: authHeaders() });
      const nombre = res.data.nombreCompleto;
      setForm(f => ({
        ...f,
        nombre_beneficiario: nombre,
        // El encargado de la misión es, por defecto, quien recibe (se puede editar después)
        encargado_mision: !f.encargado_mision || f.encargado_mision === f.nombre_beneficiario
          ? nombre : f.encargado_mision,
        alimentacion: f.alimentacion.length === 1 && !f.alimentacion[0].nombre
          ? [{ ...f.alimentacion[0], nombre: nombre.toUpperCase() }]
          : f.alimentacion,
      }));
      setFormErrors(prev => ({ ...prev, nombre_beneficiario: undefined, numero_identidad: undefined }));
    } catch (err) { setDniError(err.response?.data?.message || 'Persona no encontrada en el censo.'); }
    finally { setDniLoading(false); }
  };

  /* Totales (mismo cálculo que el servidor) */
  const totales = useMemo(() => {
    const alimentacion = form.alimentacion.reduce((s, r) => s + totalAlim(r), 0);
    const hospedaje    = form.hospedaje.reduce((s, r) => s + totalHosp(r), 0);
    const combustible  = form.combustible.reduce((s, r) => s + num(r.monto), 0);
    const imprevistos  = num(form.monto_imprevistos);
    const otros        = num(form.monto_otros);
    return { alimentacion, hospedaje, combustible, imprevistos, otros,
      gran: alimentacion + hospedaje + combustible + imprevistos + otros };
  }, [form]);

  const availableYears = useMemo(() => {
    const s = new Set(registros.map(r => String(r.periodo_desde).slice(0, 4)));
    return [...s].sort((a, b) => b - a);
  }, [registros]);

  const filtered = useMemo(() => {
    let f = [...registros];
    if (filtroAnio) f = f.filter(r => String(r.periodo_desde).slice(0, 4) === filtroAnio);
    const q = busqueda.trim().toLowerCase();
    if (q) f = f.filter(r =>
      (r.nombre_beneficiario || '').toLowerCase().includes(q) ||
      (r.numero_identidad || '').includes(q) ||
      (r.lugar || '').toLowerCase().includes(q) ||
      (r.mision || '').toLowerCase().includes(q));
    return f;
  }, [registros, busqueda, filtroAnio]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openNew = () => {
    setEditing(null); setForm(buildEmpty()); setDniError(''); setFormErrors({});
    setAplicarAlim(''); setAplicarHosp(''); setModal(true);
  };

  const openEdit = async (id) => {
    try {
      const res = await api.get(`/viaticos-seguridad/${id}`, { headers: authHeaders() });
      const r = res.data;
      const desde = String(r.periodo_desde).split('T')[0];
      const hasta = String(r.periodo_hasta).split('T')[0];
      const fs = getAllDates(desde, hasta);
      setEditing(id);
      setForm({
        numero_identidad: r.numero_identidad || '', nombre_beneficiario: r.nombre_beneficiario || '',
        mision: r.mision || '', lugar: r.lugar || '', dependencia: r.dependencia || '',
        cargo: r.cargo || '', encargado_mision: r.encargado_mision || '',
        periodo_desde: desde, periodo_hasta: hasta,
        hora_salida: r.hora_salida || '', hora_regreso: r.hora_regreso || '',
        alimentacion: r.detalle_alimentacion.length
          ? r.detalle_alimentacion.map(x => ({ ...x, dias: syncDias(fs, x.dias) }))
          : [{ nombre: '', cargo: '', dias: syncDias(fs) }],
        hospedaje: r.detalle_hospedaje.length
          ? r.detalle_hospedaje.map(x => ({ ...x, cantidad: String(x.cantidad ?? 1), dias: syncDias(fs, x.dias) }))
          : [{ detalle: 'HABITACION SENCILLA', cantidad: '1', dias: syncDias(fs) }],
        combustible: r.detalle_combustible.length
          ? r.detalle_combustible.map(x => ({ ...x, monto: x.monto || '' }))
          : [{ nombre: '', detalle: '', monto: '' }],
        monto_imprevistos: r.monto_imprevistos > 0 ? r.monto_imprevistos : '',
        otros_descripcion: r.otros_descripcion || '',
        monto_otros: r.monto_otros > 0 ? r.monto_otros : '',
        observaciones: r.observaciones || '',
      });
      setAplicarAlim(''); setAplicarHosp('');
      setDniError(''); setFormErrors({}); setModal(true);
    } catch { showToast('Error al cargar el registro.'); }
  };

  const handleField = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setFormErrors(prev => ({ ...prev, [name]: undefined }));
  };

  /* Edición de renglones */
  const setRow = (key, idx, patch) =>
    setForm(f => ({ ...f, [key]: f[key].map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));
  const setRowDia = (key, idx, fecha, monto) =>
    setForm(f => ({
      ...f,
      [key]: f[key].map((r, i) => (i !== idx ? r
        : { ...r, dias: r.dias.map(d => (d.fecha === fecha ? { ...d, monto } : d)) })),
    }));
  const addRow = (key, row) => setForm(f => ({ ...f, [key]: [...f[key], row] }));
  const delRow = (key, idx) => setForm(f => ({ ...f, [key]: f[key].filter((_, i) => i !== idx) }));

  const aplicarMonto = (key, valor, soloNoches) => {
    if (valor === '') return;
    setForm(f => ({
      ...f,
      [key]: f[key].map(r => ({
        ...r,
        dias: r.dias.map((d, i) => ({ ...d, monto: soloNoches && r.dias.length > 1 && i === r.dias.length - 1 ? '' : valor })),
      })),
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const errors = clientValidate(form);
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setSaving(true);
    try {
      const up = s => (s || '').trim().toUpperCase();
      const payload = {
        numero_identidad: form.numero_identidad.replace(/\D/g, ''),
        nombre_beneficiario: up(form.nombre_beneficiario),
        mision: up(form.mision), lugar: up(form.lugar),
        dependencia: up(form.dependencia), cargo: up(form.cargo),
        encargado_mision: up(form.encargado_mision) || null,
        periodo_desde: form.periodo_desde, periodo_hasta: form.periodo_hasta,
        hora_salida: form.hora_salida, hora_regreso: form.hora_regreso,
        detalle_alimentacion: form.alimentacion.map(r => ({
          nombre: up(r.nombre), cargo: up(r.cargo), dias: r.dias.map(d => ({ fecha: d.fecha, monto: num(d.monto) })),
        })),
        detalle_hospedaje: form.hospedaje.map(r => ({
          detalle: up(r.detalle), cantidad: num(r.cantidad) || 1, dias: r.dias.map(d => ({ fecha: d.fecha, monto: num(d.monto) })),
        })),
        detalle_combustible: form.combustible.map(r => ({ nombre: up(r.nombre), detalle: up(r.detalle), monto: num(r.monto) })),
        monto_imprevistos: num(form.monto_imprevistos),
        otros_descripcion: up(form.otros_descripcion),
        monto_otros: num(form.monto_otros),
        observaciones: form.observaciones,
      };
      if (editing) { await api.put(`/viaticos-seguridad/${editing}`, payload, { headers: authHeaders() }); showToast('Registro actualizado correctamente.', 'ok'); }
      else         { await api.post('/viaticos-seguridad', payload, { headers: authHeaders() }); showToast('Viatico registrado correctamente.', 'ok'); }
      closeModal(); fetchRegistros();
    } catch (err) { showToast(err.response?.data?.message || 'Error al guardar.', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDel || deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/viaticos-seguridad/${confirmDel.id}`, { headers: authHeaders() });
      showToast('Registro eliminado.', 'ok'); setConfirmDel(null); fetchRegistros();
    } catch (err) { showToast(err.response?.data?.message || 'Error al eliminar.', 'error'); setConfirmDel(null); }
    finally { setDeleting(false); }
  };

  const handlePrint = async (id) => {
    setPrintLoading(id);
    try {
      const res = await api.get(`/viaticos-seguridad/${id}`, { headers: authHeaders() });
      await generarReciboSeguridadPdf(res.data, await cargarLogo());
      showToast('PDF generado correctamente.', 'ok');
    } catch { showToast('Error al generar el PDF.', 'error'); }
    finally { setPrintLoading(null); }
  };

  const verDetalle = async (id) => {
    try {
      const res = await api.get(`/viaticos-seguridad/${id}`, { headers: authHeaders() });
      setViewing(res.data);
    } catch { showToast('Error al cargar el registro.'); }
  };

  return (
    <div className="page-shell">
      <Navbar />
      <div className="bod-container">

        {toast && <div className={`bod-toast ${toast.type === 'ok' ? 'bod-toast--ok' : 'bod-toast--err'}`}>{toast.msg}</div>}

        <div className="bod-page-header">
          <div className="bod-page-header__left">
            <div className="bod-page-icon"><LuShieldCheck size={26} /></div>
            <div>
              <h1 className="bod-page-title">Viaticos Seguridad de Presidencia</h1>
              <p className="bod-page-sub">Recibos de viaticos — Pagaduria Especial</p>
            </div>
          </div>
          <div className="bod-page-header__right">
            <button className="bod-btn bod-btn--outline" onClick={() => navigate('/viaticos')}><FiArrowLeft size={15} /> Volver</button>
            <button className="bod-btn bod-btn--outline" onClick={fetchRegistros} title="Actualizar"><FiRefreshCw size={15} /></button>
            {canEdit && <button className="bod-btn bod-btn--primary" onClick={openNew}><FiPlus size={15} /> Nuevo Viático</button>}
          </div>
        </div>

        <div className="bod-stats">
          <div className="bod-stat">
            <div className="bod-stat__icon bod-stat__icon--blue"><FiUsers size={20} /></div>
            <div className="bod-stat__body"><span className="bod-stat__label">Total Registros</span><span className="bod-stat__value">{registros.length}</span></div>
          </div>
          <div className="bod-stat">
            <div className="bod-stat__icon bod-stat__icon--green"><span className="vs-lps">Lps.</span></div>
            <div className="bod-stat__body">
              <span className="bod-stat__label">Total Pagado</span>
              <span className="bod-stat__value bod-stat__value--green">{fmtMonto(registros.reduce((s, r) => s + num(r.gran_total), 0))}</span>
            </div>
          </div>
          <div className="bod-stat">
            <div className="bod-stat__icon bod-stat__icon--amber"><FiCalendar size={20} /></div>
            <div className="bod-stat__body"><span className="bod-stat__label">Registros {filtroAnio || 'todos'}</span><span className="bod-stat__value">{filtered.length}</span></div>
          </div>
        </div>

        <div className="bod-filter-card">
          <div className="bod-filter-row">
            <div className="bod-toolbar__search">
              <FiSearch className="bod-toolbar__search-icon" size={15} />
              <input className="bod-toolbar__input" placeholder="Buscar por nombre, DNI, lugar, mision…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            </div>
            <div className="bod-filter-dates">
              <div className="bod-filter-date-group">
                <FiCalendar size={13} className="bod-filter-date-icon" />
                <span className="bod-filter-date-label">Año</span>
                <select className="bod-filter-date-input" value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)} style={{ width: 80 }}>
                  <option value="">Todos</option>
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              {(busqueda || filtroAnio) && <button className="bod-btn bod-btn--ghost bod-btn--sm bod-btn--clear" onClick={() => { setBusqueda(''); setFiltroAnio(''); setPage(1); }}><FiX size={13} /> Limpiar</button>}
            </div>
          </div>
        </div>

        <div className="bod-card">
          <div className="bod-table-info">
            <span className="bod-table-info__range">
              {filtered.length === 0 ? <span>0 registros</span> : <><strong>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}</strong> de <strong>{filtered.length}</strong></>}
            </span>
            {filtered.length > 0 && <span className="bod-table-info__page">Pag. <strong>{page}</strong> / {totalPages}</span>}
          </div>
          <div className="bod-table-wrap">
            {loading ? <div className="bod-loading">Cargando registros…</div>
              : filtered.length === 0 ? <div className="bod-empty"><LuShieldCheck size={36} style={{ opacity: .3 }} /><p>No hay registros.</p></div>
              : (
                <table className="bod-table">
                  <thead><tr>
                    <th className="bod-th-num">N°</th>
                    <th>Identidad</th><th>Nombre de quien recibe</th>
                    <th>Mision / Lugar</th><th>Periodo</th>
                    <th className="bod-th-center">Gran Total</th>
                    <th className="bod-th-actions">Acciones</th>
                  </tr></thead>
                  <tbody>
                    {paginated.map((r, idx) => (
                      <tr key={r.id}>
                        <td className="bod-td-num">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td><span className="vn-dni">{r.numero_identidad}</span></td>
                        <td><span className="bod-name">{r.nombre_beneficiario}</span></td>
                        <td><div className="vn-mision">{r.mision}</div><span className="bod-depto-chip">{r.lugar}</span></td>
                        <td><span className="bod-fecha">{fmtFecha(r.periodo_desde)}</span><span className="vn-sep">→</span><span className="bod-fecha">{fmtFecha(r.periodo_hasta)}</span></td>
                        <td className="bod-td-center"><span className="vn-total">{fmtMonto(r.gran_total)}</span></td>
                        <td>
                          <div className="bod-actions">
                            <button className="bod-btn-action bod-btn-action--view" title="Ver" onClick={() => verDetalle(r.id)}><FiEye size={13} /></button>
                            <button className="bod-btn-action bod-btn-action--view" title="Imprimir recibo"
                              disabled={printLoading === r.id} onClick={() => handlePrint(r.id)} style={{ color: '#16a34a' }}>
                              {printLoading === r.id ? <span className="bod-btn-spinner" style={{ borderTopColor: '#16a34a' }} /> : <FiPrinter size={13} />}
                            </button>
                            {canEdit && <>
                              <button className="bod-btn-action bod-btn-action--edit" title="Editar" onClick={() => openEdit(r.id)}><FiEdit2 size={13} /></button>
                              <button className="bod-btn-action bod-btn-action--del" title="Eliminar" onClick={() => setConfirmDel(r)}><FiTrash2 size={13} /></button>
                            </>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
          {!loading && filtered.length > 0 && totalPages > 1 && (
            <div className="bod-pagination">
              <button className="bod-pgn-btn" disabled={page === 1} onClick={() => setPage(1)}><FiChevronsLeft size={14} /></button>
              <button className="bod-pgn-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}><FiChevronLeft size={14} /></button>
              <div className="bod-pgn-pages">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                  .reduce((acc, p, i, arr) => { if (i > 0 && p - arr[i - 1] > 1) acc.push('…'); acc.push(p); return acc; }, [])
                  .map((p, i) => typeof p === 'string'
                    ? <span key={i} className="bod-pgn-dots">…</span>
                    : <button key={p} className={`bod-pgn-btn bod-pgn-btn--num ${page === p ? 'bod-pgn-btn--active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                  )}
              </div>
              <button className="bod-pgn-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><FiChevronRight size={14} /></button>
              <button className="bod-pgn-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)}><FiChevronsRight size={14} /></button>
            </div>
          )}
        </div>

        {/* Modal Ver */}
        {viewing && (
          <div className="bod-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setViewing(null); }}>
            <div className="bod-modal bod-modal--view">
              <div className="bod-modal__header">
                <h2 className="bod-modal__title">Detalle del Recibo</h2>
                <button className="bod-btn bod-btn--ghost" onClick={() => setViewing(null)}><FiX size={18} /></button>
              </div>
              <div className="bod-view-body">
                <div className="bod-view-hero">
                  <div className="bod-view-hero__icon"><LuShieldCheck size={26} /></div>
                  <div>
                    <p className="bod-view-hero__name">{viewing.nombre_beneficiario}</p>
                    <p className="bod-view-hero__sub">DNI: {viewing.numero_identidad} · {viewing.cargo}</p>
                  </div>
                </div>
                <div className="bod-view-grid">
                  <div className="bod-view-field"><span className="bod-view-label">Mision</span><span className="bod-view-value">{viewing.mision}</span></div>
                  <div className="bod-view-field"><span className="bod-view-label">Lugar</span><span className="bod-view-value">{viewing.lugar}</span></div>
                  <div className="bod-view-field"><span className="bod-view-label">Periodo</span><span className="bod-view-value">{fmtFecha(viewing.periodo_desde)} → {fmtFecha(viewing.periodo_hasta)}</span></div>
                  <div className="bod-view-field"><span className="bod-view-label">Hospedaje</span><span className="bod-view-value">{fmtMonto(viewing.monto_hospedaje)}</span></div>
                  <div className="bod-view-field"><span className="bod-view-label">Alimentacion</span><span className="bod-view-value">{fmtMonto(viewing.monto_alimentacion)}</span></div>
                  <div className="bod-view-field"><span className="bod-view-label">Combustible</span><span className="bod-view-value">{fmtMonto(viewing.monto_combustible)}</span></div>
                  <div className="bod-view-field"><span className="bod-view-label">Imprevisto</span><span className="bod-view-value">{fmtMonto(viewing.monto_imprevistos)}</span></div>
                  <div className="bod-view-field"><span className="bod-view-label">Otros</span><span className="bod-view-value">{fmtMonto(viewing.monto_otros)}</span></div>
                  <div className="bod-view-field"><span className="bod-view-label">Gran Total</span><span className="bod-view-value bod-view-value--big">{fmtMonto(viewing.gran_total)}</span></div>
                </div>
                <div className="bod-view-footer">
                  <button className="bod-btn bod-btn--outline" onClick={() => handlePrint(viewing.id)}><FiPrinter size={14} /> Imprimir</button>
                  {canEdit && <button className="bod-btn bod-btn--outline" onClick={() => { const id = viewing.id; setViewing(null); openEdit(id); }}><FiEdit2 size={14} /> Editar</button>}
                  <button className="bod-btn bod-btn--primary" onClick={() => setViewing(null)}>Cerrar</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Crear/Editar */}
        {modal && (
          <div className="bod-modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
            <div className="bod-modal vn-modal vs-modal">
              <div className="bod-modal__header">
                <h2 className="bod-modal__title">{editing ? 'Editar Recibo de Viaticos' : 'Nuevo Recibo de Viaticos'}</h2>
                <button className="bod-btn bod-btn--ghost" onClick={closeModal}><FiX size={18} /></button>
              </div>
              <form className="bod-modal__body" onSubmit={handleSave} noValidate>

                {/* DNI */}
                <div className="vn-dni-section">
                  <div className="vn-dni-title">IDENTIFICACION DE QUIEN RECIBE</div>
                  <div className="vn-dni-row">
                    <div className="vn-dni-field">
                      <label className="bod-label">Numero de Identidad (DNI) *</label>
                      <div className="vn-dni-input-wrap">
                        <input className={`bod-input vn-dni-input ${formErrors.numero_identidad ? 'bod-input--error' : ''}`}
                          name="numero_identidad" value={form.numero_identidad}
                          onChange={e => { handleField(e); setDniError(''); }}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleDniSearch())}
                          placeholder="0000-0000-00000  (13 digitos)" maxLength={20} />
                        <button type="button" className="bod-btn bod-btn--primary vn-btn-buscar" onClick={handleDniSearch} disabled={dniLoading}>
                          {dniLoading ? <span className="bod-btn-spinner" /> : <FiSearch size={15} />}
                          {dniLoading ? ' Buscando…' : ' Buscar'}
                        </button>
                      </div>
                      {formErrors.numero_identidad && <span className="bod-error">{formErrors.numero_identidad}</span>}
                      {dniError && <span className="bod-error">{dniError}</span>}
                    </div>
                    <div className="vn-nombre-found">
                      <label className="bod-label">Nombre de quien recibe *</label>
                      <div className={`vn-nombre-display ${form.nombre_beneficiario ? 'vn-nombre-display--found' : ''}`}>
                        {form.nombre_beneficiario || 'Busque el DNI para auto-completar el nombre'}
                      </div>
                      {formErrors.nombre_beneficiario && <span className="bod-error">{formErrors.nombre_beneficiario}</span>}
                    </div>
                  </div>
                </div>

                <div className="vn-section-title">DATOS DEL VIAJE</div>
                <div className="bod-field bod-field--full">
                  <label className="bod-label">Mision *</label>
                  <textarea className={`bod-textarea ${formErrors.mision ? 'bod-input--error' : ''}`} name="mision" value={form.mision} onChange={handleField} rows={2} placeholder="Descripcion de la mision…" />
                  {formErrors.mision && <span className="bod-error">{formErrors.mision}</span>}
                </div>
                <div className="bod-field"><label className="bod-label">Lugar *</label>
                  <input className={`bod-input ${formErrors.lugar ? 'bod-input--error' : ''}`} name="lugar" value={form.lugar} onChange={handleField} placeholder="Ciudad / Departamento" />
                  {formErrors.lugar && <span className="bod-error">{formErrors.lugar}</span>}
                </div>
                <div className="bod-field"><label className="bod-label">Dependencia</label><input className="bod-input" name="dependencia" value={form.dependencia} onChange={handleField} /></div>
                <div className="bod-field"><label className="bod-label">Cargo</label><input className="bod-input" name="cargo" value={form.cargo} onChange={handleField} /></div>
                <div className="bod-field"><label className="bod-label">Encargado de la Mision</label><input className="bod-input" name="encargado_mision" value={form.encargado_mision} onChange={handleField} /></div>
                <div className="bod-field"><label className="bod-label">Periodo Desde *</label>
                  <input type="date" className={`bod-input ${formErrors.periodo_desde ? 'bod-input--error' : ''}`} name="periodo_desde" value={form.periodo_desde} onChange={handleField} />
                  {formErrors.periodo_desde && <span className="bod-error">{formErrors.periodo_desde}</span>}
                </div>
                <div className="bod-field"><label className="bod-label">Periodo Hasta *</label>
                  <input type="date" className={`bod-input ${formErrors.periodo_hasta ? 'bod-input--error' : ''}`} name="periodo_hasta" value={form.periodo_hasta} onChange={handleField} />
                  {formErrors.periodo_hasta && <span className="bod-error">{formErrors.periodo_hasta}</span>}
                </div>
                <div className="bod-field"><label className="bod-label">Hora de Salida</label><input type="time" className="bod-input" name="hora_salida" value={form.hora_salida} onChange={handleField} /></div>
                <div className="bod-field"><label className="bod-label">Hora de Regreso</label><input type="time" className="bod-input" name="hora_regreso" value={form.hora_regreso} onChange={handleField} /></div>

                {/* ── Alimentación ── */}
                <div className="bod-field--full vs-block">
                  <div className="vn-section-title">DETALLE DE ALIMENTACION</div>
                  <div className="vs-tools">
                    <label className="bod-label">Monto por dia (L)</label>
                    <input type="number" min="0" step="0.01" className="bod-input vs-tool-input" value={aplicarAlim} onChange={e => setAplicarAlim(e.target.value)} placeholder="Ej. 600" />
                    <button type="button" className="bod-btn bod-btn--outline bod-btn--sm" onClick={() => aplicarMonto('alimentacion', aplicarAlim, false)} disabled={aplicarAlim === ''}>Aplicar a todos los dias</button>
                  </div>
                  <div className="vs-scroll">
                    <table className="vs-tbl">
                      <thead><tr>
                        <th>#</th><th>Nombre</th><th>Cargo</th>
                        {fechas.map(f => <th key={f} className="vs-th-dia">{dayShort(f)}<br />{fmtFecha(f).slice(0, 5)}</th>)}
                        <th>Total</th><th />
                      </tr></thead>
                      <tbody>
                        {form.alimentacion.map((r, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td><input className="bod-input vs-in vs-in--name" value={r.nombre} onChange={e => setRow('alimentacion', i, { nombre: e.target.value })} placeholder="Nombre" /></td>
                            <td><input className="bod-input vs-in vs-in--cargo" value={r.cargo} onChange={e => setRow('alimentacion', i, { cargo: e.target.value })} placeholder="Cargo" /></td>
                            {r.dias.map(d => (
                              <td key={d.fecha}><input type="number" min="0" step="0.01" className="bod-input vs-in vs-in--monto" value={d.monto} onChange={e => setRowDia('alimentacion', i, d.fecha, e.target.value)} placeholder="0" /></td>
                            ))}
                            <td className="vs-td-total">{fmtMonto(totalAlim(r))}</td>
                            <td><button type="button" className="vs-del" title="Quitar" onClick={() => delRow('alimentacion', i)} disabled={form.alimentacion.length === 1}><FiX size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="bod-btn bod-btn--ghost bod-btn--sm vs-add" onClick={() => addRow('alimentacion', { nombre: '', cargo: '', dias: syncDias(fechas) })}><FiPlus size={13} /> Agregar persona</button>
                </div>

                {/* ── Hospedaje ── */}
                <div className="bod-field--full vs-block">
                  <div className="vn-section-title">DETALLE DE HOSPEDAJE</div>
                  <div className="vs-tools">
                    <label className="bod-label">Precio por noche (L)</label>
                    <input type="number" min="0" step="0.01" className="bod-input vs-tool-input" value={aplicarHosp} onChange={e => setAplicarHosp(e.target.value)} placeholder="Ej. 1500" />
                    <button type="button" className="bod-btn bod-btn--outline bod-btn--sm" onClick={() => aplicarMonto('hospedaje', aplicarHosp, true)} disabled={aplicarHosp === ''}>Aplicar a las noches</button>
                    <span className="vs-hint">El total de cada renglon es cantidad × suma de las noches. El ultimo dia no se cobra como noche.</span>
                  </div>
                  <div className="vs-scroll">
                    <table className="vs-tbl">
                      <thead><tr>
                        <th>#</th><th>Detalle</th><th>Cant.</th>
                        {fechas.map(f => <th key={f} className="vs-th-dia">{dayShort(f)}<br />{fmtFecha(f).slice(0, 5)}</th>)}
                        <th>Total</th><th />
                      </tr></thead>
                      <tbody>
                        {form.hospedaje.map((r, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td><input className="bod-input vs-in vs-in--name" value={r.detalle} onChange={e => setRow('hospedaje', i, { detalle: e.target.value })} placeholder="Ej. HABITACION SENCILLA" /></td>
                            <td><input type="number" min="1" step="1" className="bod-input vs-in vs-in--cant" value={r.cantidad} onChange={e => setRow('hospedaje', i, { cantidad: e.target.value })} /></td>
                            {r.dias.map(d => (
                              <td key={d.fecha}><input type="number" min="0" step="0.01" className="bod-input vs-in vs-in--monto" value={d.monto} onChange={e => setRowDia('hospedaje', i, d.fecha, e.target.value)} placeholder="0" /></td>
                            ))}
                            <td className="vs-td-total">{fmtMonto(totalHosp(r))}</td>
                            <td><button type="button" className="vs-del" title="Quitar" onClick={() => delRow('hospedaje', i)} disabled={form.hospedaje.length === 1}><FiX size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="bod-btn bod-btn--ghost bod-btn--sm vs-add" onClick={() => addRow('hospedaje', { detalle: '', cantidad: '1', dias: syncDias(fechas) })}><FiPlus size={13} /> Agregar renglon</button>
                </div>

                {/* ── Combustible ── */}
                <div className="bod-field--full vs-block">
                  <div className="vn-section-title">DETALLE DE COMBUSTIBLE</div>
                  <div className="vs-scroll">
                    <table className="vs-tbl">
                      <thead><tr><th>#</th><th>Nombre</th><th>Detalle / Vehiculos</th><th>Monto (L)</th><th /></tr></thead>
                      <tbody>
                        {form.combustible.map((r, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td><input className="bod-input vs-in vs-in--name" value={r.nombre} onChange={e => setRow('combustible', i, { nombre: e.target.value })} placeholder="Nombre" /></td>
                            <td><input className="bod-input vs-in vs-in--name" value={r.detalle} onChange={e => setRow('combustible', i, { detalle: e.target.value })} placeholder="Ej. VEHICULO 1" /></td>
                            <td><input type="number" min="0" step="0.01" className="bod-input vs-in vs-in--monto" value={r.monto} onChange={e => setRow('combustible', i, { monto: e.target.value })} placeholder="0.00" /></td>
                            <td><button type="button" className="vs-del" title="Quitar" onClick={() => delRow('combustible', i)} disabled={form.combustible.length === 1}><FiX size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="bod-btn bod-btn--ghost bod-btn--sm vs-add" onClick={() => addRow('combustible', { nombre: '', detalle: '', monto: '' })}><FiPlus size={13} /> Agregar renglon</button>
                </div>

                <div className="vn-section-title bod-field--full">OTROS GASTOS</div>
                <div className="bod-field"><label className="bod-label">Imprevisto — Monto</label><input type="number" min="0" step="0.01" className="bod-input" name="monto_imprevistos" value={form.monto_imprevistos} onChange={handleField} placeholder="0.00" /></div>
                <div className="bod-field" />
                <div className="bod-field"><label className="bod-label">Otros — Descripcion</label><input className="bod-input" name="otros_descripcion" value={form.otros_descripcion} onChange={handleField} placeholder="Ej. 4 PEAJES" /></div>
                <div className="bod-field"><label className="bod-label">Otros — Monto</label><input type="number" min="0" step="0.01" className="bod-input" name="monto_otros" value={form.monto_otros} onChange={handleField} placeholder="0.00" /></div>

                <div className="bod-field bod-field--full vs-resumen">
                  <div><span>Hospedaje</span><strong>{fmtMonto(totales.hospedaje)}</strong></div>
                  <div><span>Alimentacion</span><strong>{fmtMonto(totales.alimentacion)}</strong></div>
                  <div><span>Combustible</span><strong>{fmtMonto(totales.combustible)}</strong></div>
                  <div><span>Imprevisto</span><strong>{fmtMonto(totales.imprevistos)}</strong></div>
                  <div><span>Otros</span><strong>{fmtMonto(totales.otros)}</strong></div>
                </div>
                <div className="bod-field bod-field--full vn-gran-total">
                  <span className="vn-gran-total__label">GRAN TOTAL</span>
                  <span className="vn-gran-total__value">{fmtMonto(totales.gran)}</span>
                </div>

                <div className="bod-field bod-field--full">
                  <label className="bod-label">Observaciones</label>
                  <textarea className="bod-textarea" name="observaciones" value={form.observaciones} onChange={handleField} rows={2} maxLength={500} />
                </div>

                <div className="bod-modal__footer">
                  <button type="button" className="bod-btn bod-btn--outline" onClick={closeModal}>Cancelar</button>
                  <button type="submit" className="bod-btn bod-btn--primary" disabled={saving}>
                    {saving ? <><span className="bod-btn-spinner" /> Guardando…</> : editing ? 'Actualizar' : 'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Confirmar eliminar */}
        {confirmDel && (
          <div className="bod-modal-overlay">
            <div className="bod-confirm">
              <div className="bod-confirm__icon"><FiTrash2 size={26} /></div>
              <h3 className="bod-confirm__title">Eliminar recibo?</h3>
              <p className="bod-confirm__msg">Se eliminara el viatico de <strong>{confirmDel.nombre_beneficiario}</strong>. Esta accion no se puede deshacer.</p>
              <div className="bod-confirm__actions">
                <button className="bod-btn bod-btn--outline" disabled={deleting} onClick={() => setConfirmDel(null)}>Cancelar</button>
                <button className="bod-btn bod-btn--danger" disabled={deleting} onClick={handleDelete}>
                  {deleting ? <><span className="bod-btn-spinner" /> Eliminando…</> : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
