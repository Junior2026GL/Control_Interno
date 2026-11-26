import { useEffect, useState, useContext, useCallback } from 'react';
import {
  FiPlus, FiX, FiSearch, FiPrinter, FiTrash2, FiEye,
  FiUser, FiMapPin, FiDollarSign, FiEdit3,
  FiRefreshCw, FiArrowDown, FiArrowUp, FiArrowLeft, FiBriefcase, FiCheck,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { LuFileSpreadsheet, LuPlane } from 'react-icons/lu';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import Seccion from '../components/SeccionFormulario';
import DiasBadge from '../components/DiasBadge';
import { AuthContext } from '../context/AuthContext';
import { generarPdfViatico } from '../utils/viaticoPdf';
import './Bodegas.css';
import './ViaticosNacionales.css';
import './ViaticosSeguridad.css';
import './Viaticos.css';

const NOTA1_DEFAULT =
  'SE LE ASIGNA EL 30% DE LA ZONA 3, EN VISTA QUE EN LA INVITACIÓN OFICIAL SE LE PROVEERÁ ALOJAMIENTO Y ALIMENTACIÓN AL VIAJERO, EN CUMPLIMIENTO AL ESTABLECIDO AL ARTÍCULO 10 DEL REGLAMENTO DE VIÁTICOS.';
const NOTA2_DEFAULT =
  'TODO VIAJERO QUE SE LE HAYA OTORGADO ANTICIPO DE VIÁTICOS Y OTROS GASTOS DE VIAJE, DEBERÁ PRESENTAR ANTE LA PAGADURÍA ESPECIAL DENTRO DE LOS 5 DÍAS HÁBILES DE SU REGRESO, LA RESPECTIVA LIQUIDACIÓN SEGÚN EL REGLAMENTO DE VIÁTICOS.';

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const s = String(dateStr).substring(0, 10); // "2026-03-27"
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

// Todo en UTC: con la hora local, en zonas al este de UTC la fecha no avanzaba y la pantalla se quedaba pegada
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const MAX_DIAS = 366;
// Mientras se escribe el año, el campo entrega valores como 0002-12-04: solo se aceptan años 2000–2099
const fechaValida = s => /^20\d{2}-\d{2}-\d{2}$/.test(s || '');

function getAllDates(inicio, fin) {
  if (!fechaValida(inicio) || !fechaValida(fin)) return [];
  const dates = [];
  let cur = inicio;
  while (cur <= fin && dates.length <= MAX_DIAS) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates.length > MAX_DIAS ? [] : dates;
}

function errorRango(inicio, fin) {
  if (!inicio || !fin) return '';
  if (!fechaValida(inicio) || !fechaValida(fin)) return 'Revise el año de las fechas.';
  if (fin < inicio) return 'La fecha fin no puede ser anterior a la fecha de inicio.';
  if (!getAllDates(inicio, fin).length) return `El período no puede pasar de ${MAX_DIAS} días.`;
  return '';
}

const fmtUSD = v => '$ ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtLps = v => 'L ' + v.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const diaCorto = iso => ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'][new Date(iso + 'T00:00:00Z').getUTCDay()];

// Gastos adicionales que se pueden agregar al resumen (en dólares)
const SUGERENCIAS_RESUMEN = ['OTROS', 'REEMBOLSO BOLETO AÉREO'];
const sumaMontos = filas => (filas || []).reduce((s, r) => s + (parseFloat(r.monto) || 0), 0);

/* Qué cubre cada renglón (columna "Detalle") */
const DETALLES_VIATICO = ['ALIMENTACIÓN', 'HOSPEDAJE', 'ALIMENTACIÓN Y HOSPEDAJE'];
const EMPTY_DETALLE = { nombre: '', cargo: '', detalle: '', dias: [] };
const PRIMER_RENGLON = { ...EMPTY_DETALLE, detalle: 'ALIMENTACIÓN Y HOSPEDAJE' };
/* El último día (regreso) cuenta como medio día */
const diasPagados = n => (n > 1 ? n - 0.5 : n);
/* Alinea los montos diarios de un renglón con las fechas del período */
const syncDias = (fechas, dias = []) =>
  fechas.map(fecha => ({ fecha, monto: dias.find(d => String(d.fecha).slice(0, 10) === fecha)?.monto ?? '' }));
const totalFila = r => sumaMontos(r.dias);
/* Suma de todos los renglones en cada fecha (son los días de viaje que se guardan) */
const sumaPorFecha = filas => (filas[0]?.dias || []).map(({ fecha }) => ({
  fecha,
  monto: Math.round(filas.reduce((s, r) => s + (parseFloat(r.dias.find(d => d.fecha === fecha)?.monto) || 0), 0) * 100) / 100,
}));

function buildEmptyForm(userName) {
  return {
    motivo_viaje: '',
    lugar: '',
    dni: '',
    diputado_id: '',
    diputado_nombre: '',
    cargo: '',
    periodo_dias: '',         // se calcula con las fechas (último día medio) y se puede editar
    fecha_inicio: '',         // período del viaje: una columna por día
    fecha_fin: '',
    tasa_cambio: '',
    nota1: NOTA1_DEFAULT,
    nota2: NOTA2_DEFAULT,
    elaborado_por: userName || '',
    detalle: [{ ...PRIMER_RENGLON }],   // [{ nombre, cargo, detalle, dias: [{ fecha, monto }] }]
    resumen: [],       // gastos adicionales: [{ descripcion, monto }]
    montoDefault: '',
    obs_detalle:  '',
  };
}

export default function Viaticos() {
  const { user: me } = useContext(AuthContext);
  const navigate = useNavigate();

  const [lista, setLista]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [viewData, setViewData]  = useState(null);
  const [form, setForm]         = useState(() => buildEmptyForm(me?.nombre));
  const [dniLoading, setDniLoading] = useState(false);
  const [dniError, setDniError] = useState('');
  const [formErr, setFormErr]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [toast, setToast]       = useState(null);
  const [confirmCfg, setConfirmCfg] = useState(null);
  const [editingId, setEditingId]   = useState(null);
  const [tipoCambio, setTipoCambio] = useState(null);
  const [tcLoading, setTcLoading]   = useState(false);
  const [tcError,   setTcError]     = useState(false);
  const [tcUpdated, setTcUpdated]   = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const askConfirm = (msg, onOk) => setConfirmCfg({ msg, onOk });

  const fetchLista = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/viaticos', { headers: authHeaders() });
      setLista(res.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLista(); }, [fetchLista]);

  // ── Tipo de cambio ─────────────────────────────────────────────
  const fetchTipoCambio = useCallback(async () => {
    setTcLoading(true); setTcError(false);
    try {
      const res = await api.get('/viaticos/tipo-cambio', { headers: authHeaders() });
      const { compra, venta, fecha } = res.data;
      if (venta) {
        setTipoCambio({ compra, venta });
        const hora = new Date().toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
        setTcUpdated(`BCH ${formatDate(fecha)} · Actualizado ${hora}`);
      } else setTcError(true);
    } catch { setTcError(true); }
    finally { setTcLoading(false); }
  }, []);

  useEffect(() => {
    fetchTipoCambio();
    const interval = setInterval(fetchTipoCambio, 5 * 60 * 1000); // cada 5 minutos
    return () => clearInterval(interval);
  }, [fetchTipoCambio]);

  // ── DNI lookup ─────────────────────────────────────────────────
  const handleDniSearch = async () => {
    const dni = form.dni.trim();
    if (!dni) return;
    setDniLoading(true); setDniError('');
    try {
      const res = await api.get(`/viaticos/diputado/${encodeURIComponent(dni)}`, { headers: authHeaders() });
      const d = res.data;
      const cargoLabel = `DIPUTADO ${d.tipo}`;
      setForm(f => ({
        ...f,
        diputado_id:    d.id,
        diputado_nombre: d.nombre.toUpperCase(),
        cargo:          cargoLabel,
        detalle:        f.detalle.map((r, i) => (i !== 0 ? r
          : { ...r, nombre: d.nombre.toUpperCase(), cargo: cargoLabel, detalle: r.detalle || 'ALIMENTACIÓN Y HOSPEDAJE' })),
      }));
    } catch (err) {
      setDniError(err.response?.data?.message || 'Diputado no encontrado.');
    } finally { setDniLoading(false); }
  };

  // ── Una columna por día cuando cambian las fechas ──
  useEffect(() => {
    const fechas = getAllDates(form.fecha_inicio, form.fecha_fin);
    if (!fechas.length) return;   // fechas incompletas o rango inválido
    setForm(f => {
      // Si las columnas ya son esas (al abrir un viático guardado) no se toca el período
      const iguales = f.detalle.every(r => r.dias.length === fechas.length && r.dias.every((d, i) => d.fecha === fechas[i]));
      if (iguales) return f;
      return {
        ...f,
        periodo_dias: String(diasPagados(fechas.length)),
        detalle: f.detalle.map(r => ({ ...r, dias: syncDias(fechas, r.dias) })),
      };
    });
  }, [form.fecha_inicio, form.fecha_fin]);

  // Aplica el monto a todos los días; el último (regreso) lleva la mitad
  const applyDefaultMonto = () => {
    const valor = form.montoDefault;
    if (valor === '') return;
    const mitad = String(Math.round((parseFloat(valor) || 0) * 50) / 100);
    setForm(f => ({
      ...f,
      detalle: f.detalle.map(r => ({
        ...r,
        dias: r.dias.map((d, i) => ({ ...d, monto: r.dias.length > 1 && i === r.dias.length - 1 ? mitad : valor })),
      })),
    }));
  };

  /* Edición de campos, renglones del detalle y montos por día */
  const setCampo = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));
  const setDet = (idx, campo, valor) =>
    setForm(f => ({ ...f, detalle: f.detalle.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r)) }));
  const setMonto = (idx, fecha, monto) =>
    setForm(f => ({
      ...f,
      detalle: f.detalle.map((r, i) => (i !== idx ? r : { ...r, dias: r.dias.map(d => (d.fecha === fecha ? { ...d, monto } : d)) })),
    }));
  const agregarRenglon = () =>
    setForm(f => (f.detalle.length >= 30 ? f
      : { ...f, detalle: [...f.detalle, { ...EMPTY_DETALLE, dias: syncDias((f.detalle[0]?.dias || []).map(d => d.fecha)) }] }));

  const setGasto = (idx, campo, valor) =>
    setForm(f => ({ ...f, resumen: f.resumen.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r)) }));
  const agregarGasto = descripcion =>
    setForm(f => (f.resumen.length >= 10 ? f : { ...f, resumen: [...f.resumen, { descripcion, monto: '' }] }));

  // ── Guardar ──────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setFormErr('');
    if (!form.motivo_viaje.trim()) return setFormErr('El motivo de viaje es requerido.');
    if (!form.lugar.trim())        return setFormErr('El lugar es requerido.');
    if (!form.diputado_id)         return setFormErr('Busca al diputado por DNI primero.');
    if (!form.fecha_inicio || !form.fecha_fin) return setFormErr('Las fechas de viaje son requeridas.');
    const errFechas = errorRango(form.fecha_inicio, form.fecha_fin);
    if (errFechas)                 return setFormErr(errFechas);
    if (!form.periodo_dias)        return setFormErr('El período de tiempo es requerido.');
    if (!form.tasa_cambio)         return setFormErr('La tasa de cambio es requerida.');

    const payload = {
      motivo_viaje: form.motivo_viaje,
      lugar:        form.lugar,
      diputado_id:  form.diputado_id,
      fecha_inicio: form.fecha_inicio,
      fecha_fin:    form.fecha_fin,
      cargo:        form.cargo,
      tasa_cambio:  parseFloat(form.tasa_cambio),
      nota1:        form.nota1,
      nota2:        form.nota2,
      periodo_dias: parseFloat(form.periodo_dias) || 1,
      obs_detalle:  form.obs_detalle,
      detalle:      form.detalle.map(r => ({
        nombre: r.nombre, cargo: r.cargo, detalle: r.detalle,
        dias: r.dias.map(d => ({ fecha: d.fecha, monto: parseFloat(d.monto) || 0 })),
      })),
      detalle_resumen: form.resumen
        .map(r => ({ descripcion: r.descripcion.trim().toUpperCase(), monto: parseFloat(r.monto) || 0 }))
        .filter(r => r.monto > 0),
      dias: sumaPorFecha(form.detalle).map(d => ({ ...d, tipo: 'viaje' })),
    };
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/viaticos/${editingId}`, payload, { headers: authHeaders() });
        showToast('Viático actualizado correctamente.');
      } else {
        await api.post('/viaticos', payload, { headers: authHeaders() });
        showToast('Viático guardado correctamente.');
      }
      setModal(false);
      setEditingId(null);
      setForm(buildEmptyForm(me?.nombre));
      fetchLista();
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Error al guardar.');
      showToast(err.response?.data?.message || 'Error al guardar.', 'error');
    } finally { setSaving(false); }
  };

  // ── Ver detalle ──────────────────────────────────────────────────
  const handleView = async (id) => {
    try {
      const res = await api.get(`/viaticos/${id}`, { headers: authHeaders() });
      setViewData(res.data);
    } catch {
      showToast('Error al cargar el viático.', 'error');
    }
  };

  // ── Imprimir PDF ─────────────────────────────────────────────────
  const handlePrint = async (id) => {
    try {
      const res = await api.get(`/viaticos/${id}`, { headers: authHeaders() });
      await generarPdfViatico(res.data, me?.nombre);
      showToast('PDF generado correctamente.');
    } catch {
      showToast('Error al cargar el viático.', 'error');
    }
  };

  // ── Eliminar ─────────────────────────────────────────────────────
  const handleDelete = (id) => {
    askConfirm('¿Eliminar este viático? Esta acción no se puede deshacer.', async () => {
      try {
        await api.delete(`/viaticos/${id}`, { headers: authHeaders() });
        showToast('Viático eliminado correctamente.');
        fetchLista();
      } catch { showToast('Error al eliminar.', 'error'); }
    });
  };

  const filtrada = lista.filter(v =>
    (v.diputado_nombre || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.lugar || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.motivo_viaje || '').toLowerCase().includes(search.toLowerCase())
  );

  const columnas  = (form.detalle[0]?.dias || []).map(d => d.fecha);
  const totalUSD  = form.detalle.reduce((s, r) => s + totalFila(r), 0) + sumaMontos(form.resumen);   // renglones + gastos adicionales
  const totalLPS  = totalUSD * (parseFloat(form.tasa_cambio) || 0);

  const openModal = () => {
    setForm({ ...buildEmptyForm(me?.nombre), tasa_cambio: tipoCambio ? tipoCambio.venta.toFixed(4) : '' });
    setEditingId(null);
    setDniError(''); setFormErr('');
    setModal(true);
  };

  const handleEdit = async (id) => {
    try {
      const res = await api.get(`/viaticos/${id}`, { headers: authHeaders() });
      const v = res.data;
      const diasViaje = v.dias_viaje || (v.dias || []).filter(d => d.tipo === 'viaje' || !d.tipo);
      const fechas    = getAllDates((v.fecha_inicio || '').substring(0, 10), (v.fecha_fin || '').substring(0, 10));
      const guardados = v.detalle?.length ? v.detalle : [PRIMER_RENGLON];
      // Los viáticos anteriores no tienen montos por renglón: los días de viaje van en el primero
      const porRenglon = guardados.some(r => r.dias?.length);
      const filas = guardados.map((r, i) => ({
        nombre: r.nombre || '', cargo: r.cargo || '', detalle: r.detalle || '',
        dias: syncDias(fechas, porRenglon ? (r.dias || []) : (i === 0 ? diasViaje : [])),
      }));
      setForm({
        motivo_viaje:   v.motivo_viaje || '',
        lugar:          v.lugar || '',
        dni:            v.identidad || '',
        diputado_id:    v.diputado_id,
        diputado_nombre: v.diputado_nombre || '',
        cargo:          v.cargo || '',
        periodo_dias:   v.periodo_dias != null ? String(v.periodo_dias) : '',
        fecha_inicio:   (v.fecha_inicio || '').substring(0, 10),
        fecha_fin:      (v.fecha_fin || '').substring(0, 10),
        tasa_cambio:    v.tasa_cambio || '',
        nota1:          v.nota1 || '',
        nota2:          v.nota2 || '',
        elaborado_por:  me?.nombre || '',
        detalle:    filas,
        resumen:      (v.detalle_resumen || []).map(r => ({ descripcion: r.descripcion || '', monto: r.monto })),
        montoDefault: '',
        obs_detalle:  v.obs_detalle || '',
      });
      setEditingId(id);
      setDniError(''); setFormErr('');
      setModal(true);
    } catch {
      showToast('Error al cargar el viático.', 'error');
    }
  };

  return (
    <div className="page-shell">
      <Navbar />
      <div className="page-content vt-content">

        {/* ── Header ── */}
        <div className="vt-header">
          <div>
            <h1><LuFileSpreadsheet size={26} /> Cuadro de Viáticos Internacionales</h1>
            <p>Pagaduría Especial — Congreso Nacional</p>
            <button type="button" className="vt-btn-cancel" style={{ marginTop: 10 }} onClick={() => navigate('/viaticos')}>
              <FiArrowLeft size={14} /> Volver
            </button>
          </div>
          <button className="vt-btn-primary" onClick={openModal}>
            <FiPlus size={15} /> Nuevo Viático
          </button>
        </div>

        {/* ── Tipo de Cambio ── */}
        <div className="vt-tc-card">
          <div className="vt-tc-brand">
            <FiDollarSign size={18}/>
            <span>Tipo de Cambio <strong>USD / HNL</strong></span>
          </div>
          {tcLoading ? (
            <span className="vt-tc-loading">Consultando…</span>
          ) : tcError ? (
            <span className="vt-tc-err">No disponible</span>
          ) : tipoCambio ? (
            <div className="vt-tc-rates">
              <div className="vt-tc-item vt-tc-compra">
                <FiArrowDown size={13}/>
                <span className="vt-tc-label">Compra</span>
                <span className="vt-tc-val">L {tipoCambio.compra.toFixed(4)}</span>
              </div>
              <div className="vt-tc-sep"/>
              <div className="vt-tc-item vt-tc-venta">
                <FiArrowUp size={13}/>
                <span className="vt-tc-label">Venta</span>
                <span className="vt-tc-val">L {tipoCambio.venta.toFixed(4)}</span>
              </div>
            </div>
          ) : null}
          <button className="vt-tc-refresh" onClick={fetchTipoCambio} disabled={tcLoading} title="Actualizar">
            <FiRefreshCw size={13}/>
          </button>
          {tcUpdated && <span className="vt-tc-updated">{tcUpdated}</span>}
        </div>

        {/* ── Buscador ── */}
        <div className="vt-search-bar">
          <FiSearch size={15} />
          <input
            placeholder="Buscar por diputado, lugar o motivo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* ── Tabla ── */}
        <div className="vt-table-wrap">
          {loading ? (
            <div className="vt-empty">Cargando…</div>
          ) : filtrada.length === 0 ? (
            <div className="vt-empty">No hay registros.</div>
          ) : (
            <table className="vt-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Diputado</th>
                  <th>Lugar</th>
                  <th>Motivo</th>
                  <th>Período</th>
                  <th>Elaborado por</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrada.map((v, i) => (
                  <tr key={v.id}>
                    <td>{i + 1}</td>
                    <td>
                      <strong>{v.diputado_nombre}</strong>
                      <br /><span className="vt-tipo">{v.diputado_tipo}</span>
                    </td>
                    <td>{v.lugar}</td>
                    <td className="vt-motivo-cell">{v.motivo_viaje}</td>
                    <td>{formatDate(v.fecha_inicio)} – {formatDate(v.fecha_fin)}<br/><span className="vt-dias">{v.periodo_dias} días</span></td>
                    <td>{v.elaborado_por_nombre}</td>
                    <td>
                      <div className="vt-actions">
                        <button className="vt-icon-btn vt-view" title="Ver detalle" onClick={() => handleView(v.id)}>
                          <FiEye size={15} />
                        </button>
                        <button className="vt-icon-btn vt-print" title="Imprimir PDF" onClick={() => handlePrint(v.id)}>
                          <FiPrinter size={15} />
                        </button>
                        <button className="vt-icon-btn vt-edit" title="Editar" onClick={() => handleEdit(v.id)}>
                          <FiEdit3 size={15} />
                        </button>
                        <button className="vt-icon-btn vt-del" title="Eliminar" onClick={() => handleDelete(v.id)}>
                          <FiTrash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ══════════════ MODAL VER ══════════════ */}
      {viewData && (
        <div className="vt-overlay" onClick={() => setViewData(null)}>
          <div className="vt-modal vt-modal-view" onClick={e => e.stopPropagation()}>
            <div className="vt-modal-header">
              <h2>Detalle del Viático</h2>
              <button className="vt-modal-close" onClick={() => setViewData(null)}><FiX size={18} /></button>
            </div>
            <div className="vt-view-body">
              <div className="vt-view-grid">
                <div className="vt-view-row">
                  <span className="vt-view-lbl">Motivo del Viaje</span>
                  <span className="vt-view-val">{viewData.motivo_viaje}</span>
                </div>
                <div className="vt-view-row">
                  <span className="vt-view-lbl">Lugar</span>
                  <span className="vt-view-val">{viewData.lugar}</span>
                </div>
                <div className="vt-view-row">
                  <span className="vt-view-lbl">Diputado</span>
                  <span className="vt-view-val">{viewData.diputado_nombre} — {viewData.cargo}</span>
                </div>
                <div className="vt-view-row">
                  <span className="vt-view-lbl">DNI</span>
                  <span className="vt-view-val">{viewData.identidad}</span>
                </div>
                <div className="vt-view-row">
                  <span className="vt-view-lbl">Período</span>
                  <span className="vt-view-val">{formatDate(viewData.fecha_inicio)} – {formatDate(viewData.fecha_fin)} ({viewData.periodo_dias} días)</span>
                </div>
                <div className="vt-view-row">
                  <span className="vt-view-lbl">Tasa de Cambio</span>
                  <span className="vt-view-val">L {viewData.tasa_cambio} por $1</span>
                </div>
                <div className="vt-view-row">
                  <span className="vt-view-lbl">Total USD</span>
                  <span className="vt-view-val vt-view-total">${(sumaMontos(viewData.dias_viaje || viewData.dias) + sumaMontos(viewData.detalle_resumen)).toFixed(2)}</span>
                </div>
                {(viewData.detalle_resumen || []).map((r, i) => (
                  <div key={i} className="vt-view-row">
                    <span className="vt-view-lbl">Incluye: {r.descripcion}</span>
                    <span className="vt-view-val">${(parseFloat(r.monto) || 0).toFixed(2)}</span>
                  </div>
                ))}
                <div className="vt-view-row">
                  <span className="vt-view-lbl">Elaborado por</span>
                  <span className="vt-view-val">{viewData.elaborado_por_nombre}</span>
                </div>
              </div>

              {/* Días de viaje */}
              {(viewData.dias_viaje || viewData.dias || []).length > 0 && (
                <>
                  <div className="vt-view-subtitle">Días de Viaje</div>
                  <div className="vt-dias-grid">
                    {(viewData.dias_viaje || viewData.dias).map((d, i) => (
                      <div key={i} className="vt-dia-cell">
                        <span className="vt-dia-fecha">{formatDate(d.fecha)}</span>
                        <span className="vt-dia-monto">${parseFloat(d.monto || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Detalle personas */}
              {(viewData.detalle || []).length > 0 && (
                <>
                  <div className="vt-view-subtitle">Detalle de Personas</div>
                  <table className="vt-view-table">
                    <thead>
                      <tr><th>#</th><th>Nombre</th><th>Cargo</th><th>Detalle</th><th>Total</th></tr>
                    </thead>
                    <tbody>
                      {viewData.detalle.map((row, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{row.nombre}</td>
                          <td>{row.cargo}</td>
                          <td>{row.detalle}</td>
                          <td>{row.dias?.length ? `$${totalFila(row).toFixed(2)}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* Notas */}
              {(viewData.nota1 || viewData.nota2) && (
                <>
                  <div className="vt-view-subtitle">Notas</div>
                  {viewData.nota1 && <p className="vt-view-nota">{viewData.nota1}</p>}
                  {viewData.nota2 && <p className="vt-view-nota">{viewData.nota2}</p>}
                </>
              )}
            </div>
            <div className="vt-modal-footer">
              <button className="vt-btn-cancel" onClick={() => setViewData(null)}>Cerrar</button>
              <button className="vt-btn-primary" onClick={() => { setViewData(null); handlePrint(viewData.id); }}>
                <FiPrinter size={14} /> Imprimir PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL CREAR / EDITAR ══════════════ */}
      {modal && (
        <div className="bod-modal-overlay">
          <div className="bod-modal vs-modal">

            <div className="bod-modal__header">
              <div className="vs-modal-title">
                <span className="vs-modal-icon"><LuPlane size={20} /></span>
                <div>
                  <h2 className="bod-modal__title">{editingId ? 'Editar Cuadro de Viáticos' : 'Nuevo Cuadro de Viáticos'}</h2>
                  <p className="vs-modal-sub">Viáticos Internacionales — Pagaduría Especial</p>
                </div>
              </div>
              <button type="button" className="bod-btn bod-btn--ghost" title="Cerrar" onClick={() => setModal(false)}><FiX size={18} /></button>
            </div>

            <form className="vs-form" onSubmit={handleSave}>
              <div className="vs-form-body">

                {/* 1 · Diputado */}
                <Seccion n={1} titulo="Datos del diputado" desc="Busque por identidad a la persona que viaja">
                  <div className="vt-diputado">
                    <div className="vs-field">
                      <label className="vs-label">Número de Identidad (DNI) <span className="vs-req">*</span></label>
                      <div className="vs-dni-row">
                        <input className="vs-input vs-dni-input" value={form.dni} placeholder="0000-0000-00000"
                          onChange={e => setCampo('dni', e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleDniSearch())} />
                        <button type="button" className="vs-btn-buscar" onClick={handleDniSearch} disabled={dniLoading}>
                          {dniLoading ? <span className="bod-btn-spinner" /> : <FiSearch size={15} />}
                          {dniLoading ? ' ...' : ' Buscar'}
                        </button>
                      </div>
                      {dniError && <span className="vs-error">{dniError}</span>}
                    </div>
                    <div className="vs-field">
                      <label className="vs-label">Nombre completo</label>
                      <div className="vs-icon-field">
                        <FiUser size={14} className="vs-icon" />
                        <input readOnly className="vs-input vs-has-icon vt-ro" value={form.diputado_nombre} placeholder="Se llena al buscar el DNI" />
                      </div>
                    </div>
                    <div className="vs-field">
                      <label className="vs-label">Cargo</label>
                      <div className="vs-icon-field">
                        <FiBriefcase size={14} className="vs-icon" />
                        <input readOnly className="vs-input vs-has-icon vt-ro" value={form.cargo} placeholder="Diputado propietario / suplente" />
                      </div>
                    </div>
                  </div>
                </Seccion>

                {/* 2 · Datos del viaje */}
                <Seccion n={2} titulo="Datos del viaje" desc="Lugar, motivo, período y tasa de cambio">
                  <div className="vs-field">
                    <label className="vs-label">Lugar <span className="vs-req">*</span></label>
                    <div className="vs-icon-field">
                      <FiMapPin size={14} className="vs-icon" />
                      <input className="vs-input vs-has-icon" value={form.lugar} placeholder="Ej: ANDALUCÍA, ESPAÑA"
                        onChange={e => setCampo('lugar', e.target.value)} />
                    </div>
                  </div>
                  <div className="vs-field">
                    <label className="vs-label">Motivo del viaje <span className="vs-req">*</span></label>
                    <textarea className="vs-input vs-textarea" rows={2} value={form.motivo_viaje}
                      placeholder="Ej: DIPLOMADO INTERNACIONAL EN DIRECCIÓN DE EMPRESA…"
                      onChange={e => setCampo('motivo_viaje', e.target.value)} />
                  </div>
                  <div className="vs-row-4">
                    <div className="vs-field">
                      <label className="vs-label">Fecha inicio <span className="vs-req">*</span></label>
                      <input type="date" className="vs-input" min="2000-01-01" max="2099-12-31" value={form.fecha_inicio}
                        onChange={e => setCampo('fecha_inicio', e.target.value)} />
                    </div>
                    <div className="vs-field">
                      <label className="vs-label">Fecha fin <span className="vs-req">*</span></label>
                      <input type="date" className="vs-input" min="2000-01-01" max="2099-12-31" value={form.fecha_fin}
                        onChange={e => setCampo('fecha_fin', e.target.value)} />
                    </div>
                    <div className="vs-field">
                      <label className="vs-label">Período de tiempo (días) <span className="vs-req">*</span></label>
                      <input type="number" className="vs-input" step="0.5" min="0.5" value={form.periodo_dias}
                        onChange={e => setCampo('periodo_dias', e.target.value)} placeholder="Ej: 3.5" />
                    </div>
                    <div className="vs-field">
                      <label className="vs-label">Tasa de cambio (L por $1) <span className="vs-req">*</span></label>
                      <div className="vs-lps-field">
                        <span className="vs-lps-tag">Lps.</span>
                        <input type="number" className="vs-input vs-has-lps" step="0.0001" min="0" value={form.tasa_cambio}
                          onChange={e => setCampo('tasa_cambio', e.target.value)} placeholder="Ej: 26.6300" />
                      </div>
                    </div>
                  </div>
                  {errorRango(form.fecha_inicio, form.fecha_fin) && (
                    <div className="vt-form-err" role="alert">{errorRango(form.fecha_inicio, form.fecha_fin)}</div>
                  )}
                </Seccion>

                {/* 3 · Detalle: renglones con un monto por cada día */}
                <Seccion n={3} titulo="Detalle del viático" desc="Concepto y monto en dólares por cada día del período"
                  extra={columnas.length > 0 && <DiasBadge n={columnas.length} />}>
                  <div className="vs-aplicar">
                    <div className="vs-aplicar-field">
                      <label className="vs-label">Monto por día (USD)</label>
                      <div className="vs-lps-field">
                        <span className="vs-lps-tag">USD</span>
                        <input type="number" className="vs-input vs-has-lps vs-aplicar-input vt-aplicar-input" step="0.01" min="0" value={form.montoDefault}
                          onChange={e => setCampo('montoDefault', e.target.value)} placeholder="Ej. 120" />
                      </div>
                    </div>
                    <button type="button" className="vs-btn-aplicar" onClick={applyDefaultMonto}
                      disabled={form.montoDefault === '' || columnas.length === 0}>
                      <FiCheck size={15} /> Aplicar a todos los días
                    </button>
                    <p className="vs-aplicar-hint">{columnas.length
                      ? 'El último día (regreso) se llena con la mitad del monto.'
                      : 'Elija las fechas en el paso 2 para ver los días.'}</p>
                  </div>
                  <div className="vs-scroll">
                    <table className="vs-tbl">
                      <thead><tr>
                        <th>#</th><th>Detalle</th><th>Nombre</th><th>Cargo</th>
                        {columnas.map(f => <th key={f} className="vs-th-dia" title={formatDate(f)}>{diaCorto(f)}<br />{formatDate(f).slice(0, 5)}</th>)}
                        <th>Total</th><th />
                      </tr></thead>
                      <tbody>
                        {form.detalle.map((r, i) => (
                          <tr key={i}>
                            <td className="vt-col-num">{i + 1}</td>
                            <td>
                              <select className="vs-input vs-in vs-in--detalle" value={r.detalle} aria-label="Detalle" onChange={e => setDet(i, 'detalle', e.target.value)}>
                                <option value="">Seleccione…</option>
                                {r.detalle && !DETALLES_VIATICO.includes(r.detalle) && <option value={r.detalle}>{r.detalle}</option>}
                                {DETALLES_VIATICO.map(d => <option key={d} value={d}>{d}</option>)}
                              </select>
                            </td>
                            {/* Nombre y cargo en el primer renglón y en los que ya los tengan */}
                            {i === 0 || r.nombre || r.cargo ? (
                              <>
                                <td><input className="vs-input vs-in vs-in--name" value={r.nombre} placeholder="Nombre" onChange={e => setDet(i, 'nombre', e.target.value)} /></td>
                                <td><input className="vs-input vs-in vs-in--cargo" value={r.cargo} placeholder="Cargo" onChange={e => setDet(i, 'cargo', e.target.value)} /></td>
                              </>
                            ) : (
                              <><td /><td /></>
                            )}
                            {r.dias.map(d => (
                              <td key={d.fecha}><input type="number" min="0" step="0.01" className="vs-input vs-in vs-in--monto" value={d.monto} placeholder="0"
                                aria-label={'Monto del ' + formatDate(d.fecha)} onChange={e => setMonto(i, d.fecha, e.target.value)} /></td>
                            ))}
                            <td className="vs-td-total">{fmtUSD(totalFila(r))}</td>
                            <td>
                              <button type="button" className="vs-del" title="Quitar" disabled={form.detalle.length === 1}
                                onClick={() => setForm(f => ({ ...f, detalle: f.detalle.filter((_, k) => k !== i) }))}>
                                <FiX size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="vs-btn-soft vs-add" disabled={form.detalle.length >= 30} onClick={agregarRenglon}>
                    <FiPlus size={13} /> Agregar renglon
                  </button>
                </Seccion>

                {/* 4 · Resumen de gastos adicionales */}
                <Seccion n={4} titulo="Resumen de gastos" desc="Otros gastos o reembolso de boleto aéreo, en dólares">
                  <div className="vs-chips vt-chips">
                    <span className="vs-hint">Agregar:</span>
                    {SUGERENCIAS_RESUMEN.map(s => (
                      <button key={s} type="button" className="vs-chip" disabled={form.resumen.length >= 10} onClick={() => agregarGasto(s)}>+ {s}</button>
                    ))}
                  </div>
                  {form.resumen.length > 0 && (
                    <div className="vs-scroll vs-scroll--gastos">
                      <table className="vs-tbl">
                        <thead><tr><th>#</th><th>Descripción</th><th>Monto (USD)</th><th /></tr></thead>
                        <tbody>
                          {form.resumen.map((r, i) => (
                            <tr key={i}>
                              <td className="vt-col-num">{i + 1}</td>
                              <td><input className="vs-input vs-in vs-in--name" maxLength={200} value={r.descripcion} aria-label="Descripción del gasto"
                                onChange={e => setGasto(i, 'descripcion', e.target.value)} /></td>
                              <td><input type="number" min="0" step="0.01" className="vs-input vs-in vs-in--monto" value={r.monto} placeholder="0.00" aria-label="Monto del gasto"
                                onChange={e => setGasto(i, 'monto', e.target.value)} /></td>
                              <td className="vt-col-num">
                                <button type="button" className="vs-del" title="Quitar"
                                  onClick={() => setForm(f => ({ ...f, resumen: f.resumen.filter((_, k) => k !== i) }))}>
                                  <FiX size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <button type="button" className="vs-btn-soft vs-add" disabled={form.resumen.length >= 10} onClick={() => agregarGasto('')}>
                    <FiPlus size={13} /> Agregar renglon
                  </button>
                  <span className="vs-hint">Se suman al total del viaje y salen en el cuadro de resumen del PDF. Las filas sin monto no se guardan.</span>
                  <div className="vs-field">
                    <label className="vs-label">Observación (no se imprime en el PDF)</label>
                    <textarea className="vs-input vs-textarea" rows={2} value={form.obs_detalle} placeholder="Observación (opcional)"
                      onChange={e => setCampo('obs_detalle', e.target.value)} />
                  </div>
                </Seccion>

                {/* 5 · Notas */}
                <Seccion n={5} titulo="Notas del cuadro" desc="Textos que salen en el PDF; puede editarlos">
                  <div className="vs-row-2">
                    <div className="vs-field">
                      <label className="vs-label">Nota 1</label>
                      <textarea className="vs-input vs-textarea vt-nota" rows={5} value={form.nota1} onChange={e => setCampo('nota1', e.target.value)} />
                    </div>
                    <div className="vs-field">
                      <label className="vs-label">Nota 2</label>
                      <textarea className="vs-input vs-textarea vt-nota" rows={5} value={form.nota2} onChange={e => setCampo('nota2', e.target.value)} />
                    </div>
                  </div>
                </Seccion>

              </div>

              {formErr && <div className="vt-form-err vt-form-err--pie" role="alert">{formErr}</div>}

              <div className="vs-footer">
                <div className="vs-total-pill">
                  <span>TOTAL DEL VIAJE</span>
                  <strong>{fmtUSD(totalUSD)}{totalLPS > 0 && <small className="vt-total-lps"> = {fmtLps(totalLPS)}</small>}</strong>
                </div>
                <div className="vs-footer-btns">
                  <button type="button" className="bod-btn bod-btn--outline" onClick={() => setModal(false)}>Cancelar</button>
                  <button type="submit" className="bod-btn bod-btn--primary" disabled={saving}>
                    {saving ? <><span className="bod-btn-spinner" /> Guardando…</> : editingId ? 'Actualizar' : 'Guardar Viático'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Toast (igual que otros módulos) ── */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-msg">{toast.msg}</span>
          <button className="toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {/* ── Confirm modal ── */}
      {confirmCfg && (
        <div className="vt-confirm-overlay" onClick={() => setConfirmCfg(null)}>
          <div className="vt-confirm-box" onClick={e => e.stopPropagation()}>
            <h3>Confirmar acción</h3>
            <p>{confirmCfg.msg}</p>
            <div className="vt-confirm-btns">
              <button className="vt-cfm-cancel" onClick={() => setConfirmCfg(null)}>Cancelar</button>
              <button className="vt-cfm-ok" onClick={() => { confirmCfg.onOk(); setConfirmCfg(null); }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
