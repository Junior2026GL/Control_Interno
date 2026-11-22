import { useEffect, useState, useCallback, useContext, useMemo, useRef } from 'react';
import {
  FiPlus, FiTrash2, FiEdit2, FiX, FiSearch, FiPrinter,
  FiUsers, FiRefreshCw, FiEye, FiCalendar, FiArrowLeft,
  FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight,
  FiMapPin, FiBriefcase, FiUser, FiCheck, FiClock, FiRepeat,
} from 'react-icons/fi';
import { LuShieldCheck } from 'react-icons/lu';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import { generarReciboSeguridadPdf, limitesContenido } from '../utils/viaticoSeguridadPdf';
import { resumenDeRegistro, SUGERENCIAS } from '../utils/viaticoSeguridadResumen';
import './Bodegas.css';
import './ViaticosNacionales.css';
import './ViaticosSeguridad.css';

/* ── Utilidades ──────────────────────────────────────────── */
const today = () => new Date().toISOString().split('T')[0];
/* Qué cubre el viático de cada persona (columna "Detalle") */
const DETALLES_VIATICO = ['ALIMENTACION', 'HOSPEDAJE', 'ALIMENTACION Y HOSPEDAJE'];
const esAutoGrupo = a => typeof a === 'string' && a.startsWith('g:');
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
const cantHosp = c => (c === '' || c == null || isNaN(parseFloat(c)) ? 1 : parseFloat(c));
const totalHosp = r => cantHosp(r.cantidad) * sumDias(r.dias);

function buildEmpty() {
  const f = today();
  const fechas = [f];
  return {
    numero_identidad: '', nombre_beneficiario: '', mision: '', lugar: '',
    dependencia: '', cargo: '', encargado_mision: '',
    periodo_desde: f, periodo_hasta: f, hora_salida: '', hora_regreso: '',
    alimentacion: [{ detalle: '', nombre: '', cargo: '', dias: syncDias(fechas) }],
    hospedaje:    [{ detalle: 'HABITACION SENCILLA', cantidad: '1', dias: syncDias(fechas) }],
    resumen: [],   // los gastos adicionales se agregan con las sugerencias o con "Agregar renglon"
    observaciones: '',
  };
}

function clientValidate(form) {
  const e = {};
  { const n = (form.numero_identidad || '').replace(/\D/g, '').length; if (n < 13 || n > 17) e.numero_identidad = 'El DNI debe tener entre 13 y 17 digitos.'; }
  if (!(form.nombre_beneficiario || '').trim()) e.nombre_beneficiario = 'Busque el DNI o escriba el nombre.';
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

/* Cuadro con los días de viático: el último día (regreso) cuenta como medio día */
function DiasBadge({ n }) {
  const pagados = n > 1 ? n - 0.5 : n;
  return (
    <div className="vs-dias-badge" title="Dias de viatico: el ultimo dia (regreso) cuenta como medio dia">
      <FiCalendar size={17} />
      <strong>{pagados}</strong>
      <span>{pagados === 1 ? 'dia' : 'dias'}</span>
      {n > 1 && <small>{n} de calendario · ultimo dia medio</small>}
    </div>
  );
}

/* Datos del viaje que se repiten en el siguiente recibo (se recuerdan en este navegador) */
const CLAVE_VIAJE = 'vs_viaje_repetido', CLAVE_REPETIR = 'vs_repetir_viaje';
const leerLS = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const escribirLS = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
const datosViaje = f => ({
  lugar: f.lugar, mision: f.mision, periodo_desde: f.periodo_desde, periodo_hasta: f.periodo_hasta,
  hora_salida: f.hora_salida, hora_regreso: f.hora_regreso,
});

/* Horas exactas (sin minutos): de 5:00 AM a 11:00 PM y después 12:00 AM a 4:00 AM */
const HORAS_EXACTAS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4]
  .map(h => String(h).padStart(2, '0') + ':00');
const horaTxt = hhmm => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return String(h % 12 || 12).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
};

/* Selector de hora exacta: una lista de horas y botones con las más usadas (se guarda como HH:MM, igual que antes) */
function HoraExacta({ valor, onCambio, rapidas }) {
  const antigua = valor && !HORAS_EXACTAS.includes(valor) ? valor : null;   // recibos viejos con minutos
  return (
    <div className="vs-hora">
      <div className="vs-icon-field">
        <FiClock size={15} className="vs-icon" />
        <select className="vs-input vs-has-icon vs-hora-select" value={valor || ''} onChange={e => onCambio(e.target.value)}>
          <option value="">Sin hora</option>
          {antigua && <option value={antigua}>{horaTxt(antigua)}</option>}
          {HORAS_EXACTAS.map(h => <option key={h} value={h}>{horaTxt(h)}</option>)}
        </select>
      </div>
      <div className="vs-hora-chips">
        {rapidas.map(h => (
          <button key={h} type="button" className={'vs-chip' + (valor === h ? ' vs-chip--on' : '')} onClick={() => onCambio(valor === h ? '' : h)}>
            {horaTxt(h)}
          </button>
        ))}
      </div>
    </div>
  );
}

/* Tarjeta numerada del formulario */
function Seccion({ n, titulo, desc, extra, children }) {
  return (
    <section className="vs-sec">
      <div className="vs-sec-head">
        <span className="vs-step">{n}</span>
        <div>
          <h3 className="vs-sec-title">{titulo}</h3>
          <p className="vs-sec-desc">{desc}</p>
        </div>
        {extra && <div className="vs-sec-extra">{extra}</div>}
      </div>
      <div className="vs-sec-body">{children}</div>
    </section>
  );
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
  const [dniInfo, setDniInfo]       = useState('');
  const dniEditado = useRef(false);   // true solo cuando el usuario escribe el DNI (no al abrir un recibo)
  const dniRef     = useRef('');
  const autoRef    = useRef(null);    // nombre cargado por la última búsqueda automática
  const [repetirViaje, setRepetirViaje] = useState(() => !!leerLS(CLAVE_REPETIR));   // repetir los datos del viaje en el siguiente recibo
  const [verHosp, setVerHosp] = useState(false);  // la sección de hospedaje solo se ve al editar recibos antiguos que la usan
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

  const closeModal = () => { setModal(false); setEditing(null); setDniError(''); setDniInfo(''); dniEditado.current = false; autoRef.current = null; };
  dniRef.current = (form.numero_identidad || '').replace(/\D/g, '');

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

  /* Busca por DNI: 1) en los recibos guardados (nombre, cargo, dependencia);
     2) si no está, en el censo (solo el nombre). Sin argumento usa el DNI del formulario. */
  const handleDniSearch = async (dniArg) => {
    const dni = (typeof dniArg === 'string' ? dniArg : form.numero_identidad || '').replace(/\D/g, '');
    if (dni.length < 13 || dni.length > 17) { setDniError('Ingrese el DNI completo (13 a 17 digitos).'); return; }
    setDniLoading(true); setDniError(''); setDniInfo('');

    let nombre = '', cargo = '', dependencia = '', origen = '', censoErr = '';
    try {
      const g = await api.get(`/viaticos-seguridad/persona/${encodeURIComponent(dni)}`, { headers: authHeaders() });
      nombre = (g.data.nombre_beneficiario || '').trim();
      cargo = (g.data.cargo || '').trim();
      dependencia = (g.data.dependencia || '').trim();
      origen = 'recibo';
    } catch { /* sin recibos anteriores: se prueba con el censo */ }

    if (!nombre && dni.length === 13) {
      try {
        const c = await api.get(`/censo/${encodeURIComponent(dni)}`, { headers: authHeaders() });
        nombre = (c.data.nombreCompleto || '').trim();
        origen = 'censo';
      } catch (err) { censoErr = err.response?.data?.message || 'Persona no encontrada en el censo.'; }
    }

    // Si el usuario siguió escribiendo y el DNI ya es otro, se descarta este resultado
    if (dniRef.current !== dni) { setDniLoading(false); return; }

    if (!nombre) {
      // Si lo que había en pantalla lo cargó una búsqueda anterior (otra persona), se limpia
      const previo = autoRef.current;
      autoRef.current = null;
      if (previo) {
        setForm(f => (f.nombre_beneficiario !== previo ? f : {
          ...f,
          nombre_beneficiario: '', cargo: '', dependencia: '',
          encargado_mision: f.encargado_mision === f.nombre_beneficiario ? '' : f.encargado_mision,
          alimentacion: f.alimentacion.length === 1 && f.alimentacion[0].nombre.trim().toUpperCase() === previo.trim().toUpperCase()
            ? [{ ...f.alimentacion[0], nombre: '', cargo: '' }]
            : f.alimentacion,
        }));
      }
      setDniError(censoErr || 'No hay recibos anteriores con ese DNI. Escriba el nombre manualmente.');
      setDniLoading(false);
      return;
    }
    autoRef.current = nombre;
    // Cada búsqueda reemplaza cargo y dependencia: nunca se arrastran los de otra persona
    setForm(f => ({
      ...f,
      nombre_beneficiario: nombre,
      cargo,
      dependencia,
      // El encargado de la misión es, por defecto, quien recibe (se puede editar después)
      encargado_mision: !f.encargado_mision || f.encargado_mision === f.nombre_beneficiario
        ? nombre : f.encargado_mision,
      // Primera fila de alimentación: la misma persona, con su cargo
      alimentacion: f.alimentacion.length === 1
        && (!f.alimentacion[0].nombre.trim() || f.alimentacion[0].nombre.trim().toUpperCase() === (f.nombre_beneficiario || '').trim().toUpperCase())
        ? [{ ...f.alimentacion[0], nombre: nombre.toUpperCase(), cargo: cargo.toUpperCase() }]
        : f.alimentacion,
    }));
    setDniInfo(origen === 'recibo' ? 'Datos cargados de un recibo anterior de esta persona.' : 'Nombre cargado del censo.');
    setFormErrors(prev => ({ ...prev, nombre_beneficiario: undefined, numero_identidad: undefined }));
    setDniLoading(false);
  };

  /* Búsqueda automática: cuando el usuario deja de escribir un DNI completo */
  useEffect(() => {
    if (!modal || !dniEditado.current) return undefined;
    const dni = (form.numero_identidad || '').replace(/\D/g, '');
    if (dni.length < 13 || dni.length > 17) return undefined;
    const t = setTimeout(() => handleDniSearch(dni), 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.numero_identidad, modal]);

  /* Totales (mismo cálculo que el servidor) */
  const totales = useMemo(() => {
    const alimentacion = form.alimentacion.reduce((s, r) => s + totalAlim(r), 0);
    const hospedaje    = form.hospedaje.reduce((s, r) => s + totalHosp(r), 0);
    const autoValor = { ah: alimentacion + hospedaje, a: alimentacion, h: hospedaje };
    const valorFila = r => (r.auto ? (autoValor[r.auto] || 0) : num(r.monto));
    // Recibos con orígenes anteriores (ah/a/h): todo sale de las filas del resumen, como antes.
    // Recibos nuevos: lo de la columna Detalle se suma solo y las filas del resumen son gastos escritos a mano.
    const hayAnteriores = form.resumen.some(r => ['ah', 'a', 'h'].includes(r.auto));
    const porDetalle = hayAnteriores ? 0 : form.alimentacion.reduce((t, r) => t + totalAlim(r), 0);
    return { alimentacion, hospedaje, autoValor, valorFila, porDetalle, hayAnteriores,
      gran: porDetalle + form.resumen.reduce((s, r) => s + valorFila(r), 0) };
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

  const alternarRepetir = () => {
    const nuevo = !repetirViaje;
    setRepetirViaje(nuevo);
    escribirLS(CLAVE_REPETIR, nuevo ? true : null);
    if (!nuevo) escribirLS(CLAVE_VIAJE, null);       // al apagarlo se olvidan los datos guardados
  };

  const openNew = () => {
    const guardado = repetirViaje ? leerLS(CLAVE_VIAJE) : null;
    setEditing(null); setForm(guardado ? { ...buildEmpty(), ...guardado } : buildEmpty()); setDniError(''); setFormErrors({});
    if (guardado) showToast('Datos del viaje cargados del recibo anterior.', 'ok');
    setVerHosp(false); setAplicarAlim(''); setAplicarHosp(''); setModal(true);
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
          : [{ detalle: '', nombre: '', cargo: '', dias: syncDias(fs) }],
        hospedaje: r.detalle_hospedaje.length
          ? r.detalle_hospedaje.map(x => ({ ...x, cantidad: String(x.cantidad ?? 1), dias: syncDias(fs, x.dias) }))
          : [{ detalle: 'HABITACION SENCILLA', cantidad: '1', dias: syncDias(fs) }],
        resumen: (() => {
          const filas = resumenDeRegistro(r).filter(x => !esAutoGrupo(x.auto)).map(x => ({
            descripcion: x.descripcion, auto: x.auto, monto: x.auto ? '' : (x.monto > 0 ? x.monto : ''),
          }));
          return filas;
        })(),
        observaciones: r.observaciones || '',
      });
      setVerHosp((r.detalle_hospedaje || []).some(x => (x.dias || []).some(d => num(d.monto) > 0)));
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
  const agregarSugerencia = (sug) => setForm(f => {
    if (f.resumen.length >= 15 && !f.resumen.some(r => !r.descripcion && !r.monto && !r.auto)) return f;
    const nueva = { descripcion: sug.texto, monto: '', auto: null };   // las sugerencias se llenan a mano
    const vacia = f.resumen.findIndex(r => !r.descripcion && !r.monto && !r.auto);
    return { ...f, resumen: vacia >= 0 ? f.resumen.map((r, i) => (i === vacia ? nueva : r)) : [...f.resumen, nueva] };
  });
  const cambiarOrigen = (idx, origen) => setForm(f => ({
    ...f,
    resumen: f.resumen.map((r, i) => {
      if (i !== idx) return r;
      if (origen) return { ...r, auto: origen, monto: '' };
      const actual = totales.valorFila(r);
      return { ...r, auto: null, monto: actual > 0 ? actual.toFixed(2) : '' };
    }),
  }));

  const delRow = (key, idx) => setForm(f => ({ ...f, [key]: f[key].filter((_, i) => i !== idx) }));

  // soloNoches: el último día queda vacío (hospedaje). ultimoMedio: el último día (regreso) lleva la mitad del monto.
  const aplicarMonto = (key, valor, soloNoches, ultimoMedio = false) => {
    if (valor === '') return;
    setForm(f => ({
      ...f,
      [key]: f[key].map(r => ({
        ...r,
        dias: r.dias.map((d, i) => {
          const esUltimo = r.dias.length > 1 && i === r.dias.length - 1;
          if (soloNoches && esUltimo) return { ...d, monto: '' };
          if (ultimoMedio && esUltimo) return { ...d, monto: String(Math.round(num(valor) * 50) / 100) };
          return { ...d, monto: valor };
        }),
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
          detalle: up(r.detalle), nombre: up(r.nombre), cargo: up(r.cargo), dias: r.dias.map(d => ({ fecha: d.fecha, monto: num(d.monto) })),
        })),
        detalle_hospedaje: !verHosp ? [] : form.hospedaje.map(r => ({
          detalle: up(r.detalle), cantidad: cantHosp(r.cantidad), dias: r.dias.map(d => ({ fecha: d.fecha, monto: num(d.monto) })),
        })),
        detalle_resumen: form.resumen
          .map(r => ({ descripcion: up(r.descripcion), monto: r.auto ? 0 : num(r.monto), auto: r.auto || null }))
          .filter(r => r.descripcion || r.monto > 0 || r.auto),
        observaciones: form.observaciones,
      };
      if (editing) { await api.put(`/viaticos-seguridad/${editing}`, payload, { headers: authHeaders() }); showToast('Registro actualizado correctamente.', 'ok'); }
      else         {
        await api.post('/viaticos-seguridad', payload, { headers: authHeaders() });
        if (repetirViaje) escribirLS(CLAVE_VIAJE, datosViaje(form));
        showToast('Viatico registrado correctamente.', 'ok');
      }
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
                  {resumenDeRegistro(viewing).map((r, i) => (
                    <div key={i} className="bod-view-field"><span className="bod-view-label">{r.descripcion || 'Sin descripcion'}</span><span className="bod-view-value">{fmtMonto(r.monto)}</span></div>
                  ))}
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
          <div className="bod-modal-overlay">
            <div className="bod-modal vs-modal">
              <div className="bod-modal__header">
                <div className="vs-modal-title">
                  <span className="vs-modal-icon"><LuShieldCheck size={20} /></span>
                  <div>
                    <h2 className="bod-modal__title">{editing ? 'Editar Recibo de Viaticos' : 'Nuevo Recibo de Viaticos'}</h2>
                    <p className="vs-modal-sub">Seguridad de Presidencia — Pagaduria Especial</p>
                  </div>
                </div>
                <button className="bod-btn bod-btn--ghost" onClick={closeModal}><FiX size={18} /></button>
              </div>

              <form className="vs-form" onSubmit={handleSave} noValidate>
                <div className="vs-form-body">

                  {/* 1 · Quien recibe */}
                  <Seccion n={1} titulo="Datos de quien recibe" desc="Identificacion de la persona que recibe el viatico">
                    <div className="vs-quien">
                      <div className="vs-field">
                        <label className="vs-label">Numero de Identidad (DNI) <span className="vs-req">*</span></label>
                        <div className="vs-dni-row">
                          <input className={'vs-input vs-dni-input' + (formErrors.numero_identidad ? ' vs-input--error' : '')}
                            name="numero_identidad" value={form.numero_identidad}
                            onChange={e => { dniEditado.current = true; handleField(e); setDniError(''); setDniInfo(''); }}
                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleDniSearch())}
                            placeholder="0000-0000-00000" maxLength={20} />
                          <button type="button" className="vs-btn-buscar" onClick={() => handleDniSearch()} disabled={dniLoading}>
                            {dniLoading ? <span className="bod-btn-spinner" /> : <FiSearch size={15} />}
                            {dniLoading ? ' ...' : ' Buscar'}
                          </button>
                        </div>
                        {formErrors.numero_identidad && <span className="vs-error">{formErrors.numero_identidad}</span>}
                        {dniError && <span className="vs-error">{dniError}</span>}
                        {dniInfo && <span className="vs-ok">{dniInfo}</span>}
                      </div>
                      <div className="vs-field">
                        <label className="vs-label">Nombre de quien recibe <span className="vs-req">*</span></label>
                        <input className={'vs-input' + (formErrors.nombre_beneficiario ? ' vs-input--error' : '')}
                          name="nombre_beneficiario" value={form.nombre_beneficiario}
                          onChange={e => {
                            const v = e.target.value;
                            setForm(f => ({
                              ...f,
                              nombre_beneficiario: v,
                              encargado_mision: !f.encargado_mision || f.encargado_mision === f.nombre_beneficiario
                                ? v : f.encargado_mision,
                            }));
                            setFormErrors(prev => ({ ...prev, nombre_beneficiario: undefined }));
                          }}
                          placeholder="Busque el DNI o escriba el nombre" />
                        {formErrors.nombre_beneficiario && <span className="vs-error">{formErrors.nombre_beneficiario}</span>}
                      </div>
                      <div className="vs-field">
                        <label className="vs-label">Encargado de la Mision</label>
                        <div className="vs-icon-field">
                          <FiUser size={14} className="vs-icon" />
                          <input className="vs-input vs-has-icon" name="encargado_mision" value={form.encargado_mision} onChange={handleField} placeholder="Se llena con quien recibe" />
                        </div>
                      </div>
                      <div className="vs-field">
                        <label className="vs-label">Dependencia</label>
                        <div className="vs-icon-field">
                          <FiBriefcase size={14} className="vs-icon" />
                          <input className="vs-input vs-has-icon" name="dependencia" value={form.dependencia} onChange={handleField} placeholder="Dependencia" />
                        </div>
                      </div>
                      <div className="vs-field vs-quien-cargo">
                        <label className="vs-label">Cargo</label>
                        <div className="vs-icon-field">
                          <FiBriefcase size={14} className="vs-icon" />
                          <input className="vs-input vs-has-icon" name="cargo" value={form.cargo} onChange={handleField} placeholder="Cargo de quien recibe" />
                        </div>
                      </div>
                    </div>
                  </Seccion>

                  {/* 2 · Datos del viaje */}
                  <Seccion n={2} titulo="Datos del viaje" desc="Lugar, mision y periodo de la comision"
                    extra={!editing && (
                      <button type="button" className={'vs-repetir' + (repetirViaje ? ' vs-repetir--on' : '')} onClick={alternarRepetir}
                        title={repetirViaje ? 'Al guardar, el siguiente recibo nuevo traera estos datos. Pulse para desactivar.' : 'Pulse para que, al guardar, el siguiente recibo nuevo traiga estos datos del viaje.'}>
                        {repetirViaje ? <FiCheck size={15} /> : <FiRepeat size={15} />}
                        {repetirViaje ? 'Se repetira en el siguiente' : 'Repetir en el siguiente recibo'}
                      </button>
                    )}>
                    <div className="vs-field">
                      <label className="vs-label">Lugar <span className="vs-req">*</span></label>
                      <div className="vs-icon-field">
                        <FiMapPin size={14} className="vs-icon" />
                        <input className={`vs-input vs-has-icon ${formErrors.lugar ? 'vs-input--error' : ''}`} name="lugar" value={form.lugar} onChange={handleField} placeholder="Ciudad / Departamento" />
                      </div>
                      {formErrors.lugar && <span className="vs-error">{formErrors.lugar}</span>}
                    </div>
                    <div className="vs-field">
                      <label className="vs-label">Mision <span className="vs-req">*</span></label>
                      <textarea className={`vs-input vs-textarea ${formErrors.mision ? 'vs-input--error' : ''}`} name="mision" value={form.mision} onChange={handleField} rows={2} placeholder="Descripcion de la mision…" />
                      {formErrors.mision && <span className="vs-error">{formErrors.mision}</span>}
                    </div>
                    <div className="vs-row-4">
                      <div className="vs-field">
                        <label className="vs-label">Periodo Desde <span className="vs-req">*</span></label>
                        <input type="date" className={`vs-input ${formErrors.periodo_desde ? 'vs-input--error' : ''}`} name="periodo_desde" value={form.periodo_desde} onChange={handleField} />
                        {formErrors.periodo_desde && <span className="vs-error">{formErrors.periodo_desde}</span>}
                      </div>
                      <div className="vs-field">
                        <label className="vs-label">Periodo Hasta <span className="vs-req">*</span></label>
                        <input type="date" className={`vs-input ${formErrors.periodo_hasta ? 'vs-input--error' : ''}`} name="periodo_hasta" value={form.periodo_hasta} onChange={handleField} />
                        {formErrors.periodo_hasta && <span className="vs-error">{formErrors.periodo_hasta}</span>}
                      </div>
                      <div className="vs-field">
                        <label className="vs-label">Hora de Salida</label>
                        <HoraExacta valor={form.hora_salida} rapidas={['06:00', '07:00', '08:00', '09:00']}
                          onCambio={v => setForm(prev => ({ ...prev, hora_salida: v }))} />
                      </div>
                      <div className="vs-field">
                        <label className="vs-label">Hora de Regreso</label>
                        <HoraExacta valor={form.hora_regreso} rapidas={['12:00', '15:00', '17:00', '20:00']}
                          onCambio={v => setForm(prev => ({ ...prev, hora_regreso: v }))} />
                      </div>
                    </div>
                  </Seccion>

                  {/* 3 · Alimentación */}
                  <Seccion n={3} titulo="Detalle de alimentacion" desc="Personas y monto por cada dia del periodo" extra={<DiasBadge n={fechas.length} />}>
                    <div className="vs-aplicar">
                      <div className="vs-aplicar-field">
                        <label className="vs-label">Monto por dia</label>
                        <div className="vs-lps-field">
                          <span className="vs-lps-tag">Lps.</span>
                          <input type="number" min="0" step="0.01" className="vs-input vs-has-lps vs-aplicar-input" value={aplicarAlim} onChange={e => setAplicarAlim(e.target.value)} placeholder="Ej. 1400" />
                        </div>
                      </div>
                      <button type="button" className="vs-btn-aplicar" onClick={() => aplicarMonto('alimentacion', aplicarAlim, false, true)} disabled={aplicarAlim === ''}>
                        <FiCheck size={15} /> Aplicar a todos los dias
                      </button>
                      <p className="vs-aplicar-hint">El ultimo dia (regreso) se llena con la mitad del monto.</p>
                    </div>
                    <div className="vs-scroll">
                      <table className="vs-tbl">
                        <thead><tr>
                          <th>#</th><th>Detalle</th><th>Nombre</th><th>Cargo</th>
                          {fechas.map(f => <th key={f} className="vs-th-dia">{dayShort(f)}<br />{fmtFecha(f).slice(0, 5)}</th>)}
                          <th>Total</th><th />
                        </tr></thead>
                        <tbody>
                          {form.alimentacion.map((r, i) => (
                            <tr key={i}>
                              <td>{i + 1}</td>
                              <td>
                                <select className="vs-input vs-in vs-in--detalle" value={r.detalle || ''} onChange={e => setRow('alimentacion', i, { detalle: e.target.value })}>
                                  <option value="">Seleccione…</option>
                                  {DETALLES_VIATICO.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </td>
                              {/* Nombre y cargo solo en la primera fila (o en filas antiguas que ya los tengan) */}
                              {i === 0 || r.nombre || r.cargo ? (
                                <>
                                  <td><input className="vs-input vs-in vs-in--name" value={r.nombre} onChange={e => setRow('alimentacion', i, { nombre: e.target.value })} placeholder="Nombre" /></td>
                                  <td><input className="vs-input vs-in vs-in--cargo" value={r.cargo} onChange={e => setRow('alimentacion', i, { cargo: e.target.value })} placeholder="Cargo" /></td>
                                </>
                              ) : (
                                <><td /><td /></>
                              )}
                              {r.dias.map(d => (
                                <td key={d.fecha}><input type="number" min="0" step="0.01" className="vs-input vs-in vs-in--monto" value={d.monto} onChange={e => setRowDia('alimentacion', i, d.fecha, e.target.value)} placeholder="0" /></td>
                              ))}
                              <td className="vs-td-total">{fmtMonto(totalAlim(r))}</td>
                              <td><button type="button" className="vs-del" title="Quitar" onClick={() => delRow('alimentacion', i)} disabled={form.alimentacion.length === 1}><FiX size={14} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button type="button" className="vs-btn-soft vs-add" onClick={() => addRow('alimentacion', { detalle: '', nombre: '', cargo: '', dias: syncDias(fechas) })}><FiPlus size={13} /> Agregar renglon</button>
                  </Seccion>

                  {/* 4 · Hospedaje (solo al editar recibos antiguos que lo tengan) */}
                  {verHosp && (
                  <Seccion n={4} titulo="Detalle de hospedaje" desc="Habitaciones y precio por noche">
                    <div className="vs-tools">
                      <label className="vs-label">Precio por noche (L)</label>
                      <input type="number" min="0" step="0.01" className="vs-input vs-tool-input" value={aplicarHosp} onChange={e => setAplicarHosp(e.target.value)} placeholder="Ej. 1500" />
                      <button type="button" className="vs-btn-soft" onClick={() => aplicarMonto('hospedaje', aplicarHosp, true)} disabled={aplicarHosp === ''}>Aplicar a las noches</button>
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
                              <td><input className="vs-input vs-in vs-in--name" value={r.detalle} onChange={e => setRow('hospedaje', i, { detalle: e.target.value })} placeholder="Ej. HABITACION SENCILLA" /></td>
                              <td className="vs-td-cant"><input type="text" inputMode="numeric" maxLength={3} className="vs-input vs-in vs-in--cant" value={r.cantidad} onFocus={e => e.target.select()} onChange={e => setRow('hospedaje', i, { cantidad: e.target.value.replace(/\D/g, '') })} /></td>
                              {r.dias.map(d => (
                                <td key={d.fecha}><input type="number" min="0" step="0.01" className="vs-input vs-in vs-in--monto" value={d.monto} onChange={e => setRowDia('hospedaje', i, d.fecha, e.target.value)} placeholder="0" /></td>
                              ))}
                              <td className="vs-td-total">{fmtMonto(totalHosp(r))}</td>
                              <td><button type="button" className="vs-del" title="Quitar" onClick={() => delRow('hospedaje', i)} disabled={form.hospedaje.length === 1}><FiX size={14} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button type="button" className="vs-btn-soft vs-add" onClick={() => addRow('hospedaje', { detalle: '', cantidad: '1', dias: syncDias(fechas) })}><FiPlus size={13} /> Agregar renglon</button>
                  </Seccion>
                  )}

                  {/* 5 · Resumen de gastos */}
                  <Seccion n={verHosp ? 5 : 4} titulo="Resumen de gastos" desc="Combustible, kilometraje, peajes, imprevistos u otros gastos">
                    <div className="vs-chips">
                      <span className="vs-hint">Agregar:</span>
                      {SUGERENCIAS.map(s => (
                        <button key={s.texto} type="button" className="vs-chip" onClick={() => agregarSugerencia(s)}>+ {s.texto}</button>
                      ))}
                    </div>
                    <datalist id="vs-sug">
                      {SUGERENCIAS.map(s => <option key={s.texto} value={s.texto} />)}
                    </datalist>
                    {form.resumen.length > 0 && (
                    <div className="vs-scroll vs-scroll--gastos">
                      <table className="vs-tbl">
                        <thead><tr><th>#</th><th>Descripcion</th>{totales.hayAnteriores && <th>Origen del monto</th>}<th>Monto (L)</th><th /></tr></thead>
                        <tbody>
                          {form.resumen.map((r, i) => (
                            <tr key={i}>
                              <td>{i + 1}</td>
                              <td><input className="vs-input vs-in vs-in--name" list="vs-sug" value={r.descripcion} onChange={e => setRow('resumen', i, { descripcion: e.target.value })} placeholder="Ej. COMBUSTIBLE" /></td>
                              {totales.hayAnteriores && (
                                <td>
                                  <select className="vs-input vs-in vs-select" value={r.auto || ''} onChange={e => cambiarOrigen(i, e.target.value)}>
                                    <option value="">Manual</option>
                                    {(verHosp || r.auto === 'ah') && <option value="ah">Hospedaje + alimentacion</option>}
                                    {(verHosp || r.auto === 'a') && <option value="a">Solo alimentacion</option>}
                                    {(verHosp || r.auto === 'h') && <option value="h">Solo hospedaje</option>}
                                  </select>
                                </td>
                              )}
                              <td>
                                <input type="number" min="0" step="0.01" className={'vs-input vs-in vs-in--monto' + (r.auto ? ' vs-in--auto' : '')}
                                  value={r.auto ? totales.valorFila(r).toFixed(2) : r.monto}
                                  onChange={e => setRow('resumen', i, { auto: null, monto: e.target.value })} placeholder="0.00" />
                              </td>
                              <td><button type="button" className="vs-del" title="Quitar" onClick={() => delRow('resumen', i)}><FiX size={14} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )}
                    <button type="button" className="vs-btn-soft vs-add" disabled={form.resumen.length >= 15} onClick={() => addRow('resumen', { descripcion: '', monto: '', auto: null })}><FiPlus size={13} /> Agregar renglon</button>
                    <span className="vs-hint">{totales.hayAnteriores
                      ? 'Con origen automatico el monto se toma de las tablas de alimentacion y hospedaje; si lo escribe a mano pasa a Manual.'
                      : 'Lo que elija en la columna Detalle de cada persona (seccion 3) se suma solo al total y sale en el cuadro de resumen del PDF.'}</span>
                    <div className="vs-field" style={{ marginTop: 14 }}>
                      <label className="vs-label">Observaciones</label>
                      <textarea className="vs-input vs-textarea" name="observaciones" value={form.observaciones} onChange={handleField} rows={2} maxLength={500} placeholder="Observaciones (opcional)" />
                    </div>
                  </Seccion>

                </div>

                <div className="vs-footer">
                  <div className="vs-total-pill">
                    <span>GRAN TOTAL</span>
                    <strong>{fmtMonto(totales.gran)}</strong>
                  </div>
                  <div className="vs-footer-btns">
                    <button type="button" className="bod-btn bod-btn--outline" onClick={closeModal}>Cancelar</button>
                    <button type="submit" className="bod-btn bod-btn--primary" disabled={saving}>
                      {saving ? <><span className="bod-btn-spinner" /> Guardando…</> : editing ? 'Actualizar' : 'Guardar'}
                    </button>
                  </div>
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
