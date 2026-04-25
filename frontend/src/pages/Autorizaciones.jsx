import { useEffect, useState, useCallback, useContext, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Sector,
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FiPlus, FiX, FiCheckCircle, FiXCircle, FiEye,
  FiAlertTriangle, FiFileText, FiLock, FiTrash2, FiDownload, FiEdit2,
  FiList, FiClock, FiCheckSquare, FiSlash,
  FiBarChart2, FiChevronUp, FiChevronDown, FiTrendingUp,
} from 'react-icons/fi';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './Autorizaciones.css';

// ─── helpers ────────────────────────────────────────────────────────────────

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function fmtFecha(str) {
  if (!str) return '—';
  const d = new Date(String(str).split('T')[0] + 'T12:00:00');
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtMonto(num) {
  return 'L ' + new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(num ?? 0);
}

// ── Number to Spanish words (Lempiras) ──────────────────────────────────────
const UNIDADES  = ['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE',
                   'DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE',
                   'DIECIOCHO','DIECINUEVE','VEINTE'];
const DECENAS   = ['','','VEINTI','TREINTA','CUARENTA','CINCUENTA',
                   'SESENTA','SETENTA','OCHENTA','NOVENTA'];
const CENTENAS  = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS',
                   'SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];

function centenasStr(n) {
  if (n === 100) return 'CIEN';
  const c = CENTENAS[Math.floor(n / 100)];
  const resto = n % 100;
  if (resto === 0) return c;
  return (c ? c + ' ' : '') + decenasStr(resto);
}
function decenasStr(n) {
  if (n <= 20) return UNIDADES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 2) return u === 0 ? 'VEINTE' : 'VEINTI' + UNIDADES[u];
  return DECENAS[d] + (u ? ' Y ' + UNIDADES[u] : '');
}
function grupoStr(n) {
  if (n >= 100) return centenasStr(n);
  return decenasStr(n);
}
function enteroALetras(n) {
  if (n === 0) return 'CERO';
  if (n === 1000000) return 'UN MILLÓN';
  if (n > 1000000) {
    const m = Math.floor(n / 1000000);
    const r = n % 1000000;
    return (m === 1 ? 'UN MILLÓN' : grupoStr(m) + ' MILLONES') +
           (r ? ' ' + enteroALetras(r) : '');
  }
  if (n >= 1000) {
    const miles = Math.floor(n / 1000);
    const r = n % 1000;
    return (miles === 1 ? 'MIL' : grupoStr(miles) + ' MIL') +
           (r ? ' ' + grupoStr(r) : '');
  }
  return grupoStr(n);
}
export function numeroALetras(num) {
  if (!num || isNaN(num)) return '';
  const entero    = Math.floor(Math.abs(num));
  const centavos  = Math.round((Math.abs(num) - entero) * 100);
  return enteroALetras(entero) +
         ' LEMPIRAS CON ' + String(centavos).padStart(2, '0') + '/100';
}

// ─── constantes ─────────────────────────────────────────────────────────────
const TIPO_LABELS = {
  CHEQUE:          'CHEQUE',
  CONTRA_ENTREGA:  'PAGO CONTRA-ENTREGA',
  TRANSFERENCIA:   'TRANSFERENCIA',
  PAGO_LINEA:      'PAGO EN LÍNEA',
};

const ESTADO_CFG = {
  PENDIENTE:   { label: 'Pendiente de Autorizar', cls: 'badge-pendiente' },
  AUTORIZADO:  { label: 'Autorizado',              cls: 'badge-autorizado' },
  RECHAZADO:   { label: 'Rechazado',               cls: 'badge-rechazado' },
};

const EMPTY_FORM = {
  tipo_pago: 'CHEQUE', beneficiario: '', monto: '', monto_letras: '',
  detalle: '', anio: new Date().getFullYear(), org: '', fondo: '',
};

const MONTO_MAX = 99_999_999;

// ─── validación ─────────────────────────────────────────────────────────────
function validate(form) {
  const errs = {};
  if (!['CHEQUE','CONTRA_ENTREGA','TRANSFERENCIA','PAGO_LINEA'].includes(form.tipo_pago))
    errs.tipo_pago = 'Seleccione un tipo de pago.';
  const benef = (form.beneficiario || '').trim();
  if (!benef) errs.beneficiario = 'El beneficiario es requerido.';
  else if (benef.length < 2) errs.beneficiario = 'Mínimo 2 caracteres.';
  const m = parseFloat(form.monto);
  if (form.monto === '' || isNaN(m)) errs.monto = 'El monto es requerido.';
  else if (m <= 0)        errs.monto = 'Debe ser mayor a cero.';
  else if (m > MONTO_MAX) errs.monto = 'Excede el límite permitido.';
  const letras = (form.monto_letras || '').trim();
  if (!letras || letras.length < 3) errs.monto_letras = 'El monto en letras es requerido.';
  const det = (form.detalle || '').trim();
  if (!det) errs.detalle = 'El detalle es requerido.';
  else if (det.length < 3) errs.detalle = 'Mínimo 3 caracteres.';
  const anioVal = parseInt(form.anio, 10);
  if (!form.anio || isNaN(anioVal) || anioVal < 2000 || anioVal > 2100)
    errs.anio = 'El año debe estar entre 2000 y 2100.';
  return errs;
}

// ─── componente principal ────────────────────────────────────────────────────
export default function Autorizaciones() {
  const { user } = useContext(AuthContext);
  const esAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(user?.rol);
  const esSuperAdmin = user?.rol === 'SUPER_ADMIN';
  const puedeEditar = (a) => ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'].includes(user?.rol) && (esAdmin || a.creado_por === user?.id);

  const [lista, setLista]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filtroEstado, setFiltro]   = useState('TODOS');
  const [busqueda, setBusqueda]     = useState('');

  // modal crear
  const [modalCrear, setModalCrear] = useState(false);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving]         = useState(false);

  // modal ver
  const [verItem, setVerItem]       = useState(null);

  // modal autorizar
  const [autItem, setAutItem]       = useState(null);
  const [password, setPassword]     = useState('');
  const [passErr, setPassErr]       = useState('');
  const [signing, setSigning]       = useState(false);

  // modal rechazar
  const [rechItem, setRechItem]     = useState(null);
  const [motivo, setMotivo]         = useState('');
  const [motivoErr, setMotivoErr]   = useState('');
  const [rejecting, setRejecting]   = useState(false);

  // modal confirmar eliminar
  const [delItem, setDelItem]       = useState(null);

  // modal editar
  const [editItem, setEditItem]     = useState(null);
  const [editForm, setEditForm]     = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [editing, setEditing]       = useState(false);

  // filtros de fecha
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');

  // paginación
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const PAGE_SIZE_OPTIONS       = [25, 50, 100];

  // gráficos
  const [showCharts, setShowCharts] = useState(false);
  const [chartAnio, setChartAnio]   = useState(new Date().getFullYear());
  const [chartMes, setChartMes]     = useState(-1); // -1 = todos los meses

  // notificaciones inline (reemplaza alert())
  const [toast, setToast]           = useState(null);
  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  // ── fetch ────────────────────────────────────────────────────────────────
  const fetchLista = useCallback(() => {
    setLoading(true);
    api.get('/autorizaciones', { headers: authHeaders() })
      .then(r => setLista(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchLista(); }, [fetchLista]);

  // ── filtro + búsqueda ────────────────────────────────────────────────────
  const pendingCount = lista.filter(a => a.estado === 'PENDIENTE').length;
  const listaMostrada = (() => {
    let l = filtroEstado === 'TODOS' ? lista : lista.filter(a => a.estado === filtroEstado);
    const q = busqueda.trim().toLowerCase();
    if (q) l = l.filter(a =>
      (a.beneficiario || '').toLowerCase().includes(q) ||
      String(a.numero).padStart(4, '0').includes(q) ||
      (a.creado_por_nombre || '').toLowerCase().includes(q) ||
      (a.tipo_pago || '').toLowerCase().includes(q) ||
      String(a.anio || '').includes(q)
    );
    if (filtroDesde) {
      const desde = new Date(filtroDesde + 'T00:00:00');
      l = l.filter(a => a.fecha_creacion && new Date(a.fecha_creacion) >= desde);
    }
    if (filtroHasta) {
      const hasta = new Date(filtroHasta + 'T23:59:59');
      l = l.filter(a => a.fecha_creacion && new Date(a.fecha_creacion) <= hasta);
    }
    return l;
  })();

  const totalFiltered = listaMostrada.length;
  const totalPages    = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const listaPaginada = listaMostrada.slice((page - 1) * pageSize, page * pageSize);

  // ── datos de gráficos ────────────────────────────────────────────────────
  const MESES_CORTOS  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const MESES_LARGOS  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const aniosDisponibles = useMemo(() => {
    const set = new Set(lista.map(a => {
      const d = new Date(String(a.fecha_creacion).split('T')[0] + 'T12:00:00');
      return d.getFullYear();
    }));
    const arr = [...set].filter(Boolean).sort((a, b) => b - a);
    if (!arr.length) arr.push(new Date().getFullYear());
    return arr;
  }, [lista]);

  const chartData = useMemo(() => {
    return MESES_CORTOS.map((mes, i) => {
      const del_mes = lista.filter(a => {
        const d = new Date(String(a.fecha_creacion).split('T')[0] + 'T12:00:00');
        return d.getFullYear() === chartAnio && d.getMonth() === i;
      });
      return {
        mes,
        mesLargo:   MESES_LARGOS[i],
        Pendiente:  del_mes.filter(a => a.estado === 'PENDIENTE').length,
        Autorizado: del_mes.filter(a => a.estado === 'AUTORIZADO').length,
        Rechazado:  del_mes.filter(a => a.estado === 'RECHAZADO').length,
        Total:      del_mes.length,
        Monto:      parseFloat(del_mes.reduce((s, a) => s + parseFloat(a.monto || 0), 0).toFixed(2)),
      };
    });
  }, [lista, chartAnio]);

  const pieData = useMemo(() => {
    const base = lista.filter(a => {
      const d = new Date(String(a.fecha_creacion).split('T')[0] + 'T12:00:00');
      if (d.getFullYear() !== chartAnio) return false;
      if (chartMes !== -1 && d.getMonth() !== chartMes) return false;
      return true;
    });
    const pendiente  = base.filter(a => a.estado === 'PENDIENTE').length;
    const autorizado = base.filter(a => a.estado === 'AUTORIZADO').length;
    const rechazado  = base.filter(a => a.estado === 'RECHAZADO').length;
    return [
      { name: 'Autorizado', value: autorizado, color: '#059669' },
      { name: 'Pendiente',  value: pendiente,  color: '#d97706' },
      { name: 'Rechazado',  value: rechazado,  color: '#e11d48' },
    ].filter(d => d.value > 0);
  }, [lista, chartAnio, chartMes]);

  const tipoPagoData = useMemo(() => {
    const COLORES = {
      CHEQUE:         '#274C8D',
      CONTRA_ENTREGA: '#7c3aed',
      TRANSFERENCIA:  '#0891b2',
      PAGO_LINEA:     '#059669',
    };
    const del_anio = lista.filter(a => {
      const d = new Date(String(a.fecha_creacion).split('T')[0] + 'T12:00:00');
      if (d.getFullYear() !== chartAnio) return false;
      if (chartMes !== -1 && d.getMonth() !== chartMes) return false;
      return true;
    });
    return Object.entries(TIPO_LABELS).map(([key, label]) => ({
      tipo: label,
      Total:      del_anio.filter(a => a.tipo_pago === key).length,
      Autorizado: del_anio.filter(a => a.tipo_pago === key && a.estado === 'AUTORIZADO').length,
      Monto:      parseFloat(del_anio.filter(a => a.tipo_pago === key && a.estado === 'AUTORIZADO')
                    .reduce((s, a) => s + parseFloat(a.monto || 0), 0).toFixed(2)),
      color: COLORES[key] || '#8a99aa',
    })).filter(d => d.Total > 0);
  }, [lista, chartAnio, chartMes]);

  // ── helpers de form ──────────────────────────────────────────────────────
  const setF = (key, val) =>
    setForm(p => ({ ...p, [key]: val }));
  const clearErr = (key) =>
    setFormErrors(p => ({ ...p, [key]: '' }));

  // Auto-calcular monto en letras
  const handleMontoChange = (val) => {
    setF('monto', val);
    clearErr('monto');
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) {
      setF('monto_letras', numeroALetras(n));
      clearErr('monto_letras');
    }
  };

  // ── editar ─────────────────────────────────────────────────────────────
  const openEditar = (a) => {
    setEditItem(a);
    setEditForm({
      tipo_pago:    a.tipo_pago,
      beneficiario: a.beneficiario,
      monto:        parseFloat(a.monto).toFixed(2),
      monto_letras: a.monto_letras || '',
      detalle:      a.detalle || '',
      anio:         a.anio || new Date().getFullYear(),
      org:          a.org || '',
      fondo:        a.fondo || '',
    });
    setEditErrors({});
  };

  const handleEditMontoChange = (val) => {
    setEditForm(p => ({ ...p, monto: val }));
    setEditErrors(p => ({ ...p, monto: '' }));
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) {
      setEditForm(p => ({ ...p, monto_letras: numeroALetras(n) }));
      setEditErrors(p => ({ ...p, monto_letras: '' }));
    }
  };

  const handleEditar = async (e) => {
    e.preventDefault();
    const errs = validate(editForm);
    if (Object.keys(errs).length) { setEditErrors(errs); return; }
    setEditing(true);
    try {
      await api.put(`/autorizaciones/${editItem.id}`, {
        ...editForm,
        beneficiario: editForm.beneficiario.trim(),
        monto:        parseFloat(parseFloat(editForm.monto).toFixed(2)),
        monto_letras: editForm.monto_letras.trim(),
        detalle:      editForm.detalle.trim(),
      }, { headers: authHeaders() });
      setEditItem(null);
      fetchLista();
      showToast('Autorización actualizada correctamente.', 'ok');
    } catch (err) {
      setEditErrors({ _server: err.response?.data?.message || 'Error al guardar.' });
    } finally {
      setEditing(false);
    }
  };

  // ── crear ────────────────────────────────────────────────────────────────
  const handleCrear = async (e) => {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setSaving(true);
    try {
      await api.post('/autorizaciones', {
        ...form,
        beneficiario:  form.beneficiario.trim(),
        monto:         parseFloat(parseFloat(form.monto).toFixed(2)),
        monto_letras:  form.monto_letras.trim(),
        detalle:       form.detalle.trim(),
      }, { headers: authHeaders() });
      setModalCrear(false);
      setForm({ ...EMPTY_FORM });
      setFormErrors({});
      fetchLista();
      showToast('Autorización creada correctamente.', 'ok');
    } catch (err) {
      setFormErrors({ _server: err.response?.data?.message || 'Error al guardar.' });
    } finally {
      setSaving(false);
    }
  };

  // ── autorizar ────────────────────────────────────────────────────────────
  const handleAutorizar = async (e) => {
    e.preventDefault();
    if (!password) { setPassErr('Ingrese su contraseña.'); return; }
    setSigning(true);
    setPassErr('');
    try {
      await api.put(`/autorizaciones/${autItem.id}/autorizar`, { password }, { headers: authHeaders() });
      setAutItem(null);
      setPassword('');
      fetchLista();
      showToast('Autorización firmada y aprobada.', 'ok');
    } catch (err) {
      setPassErr(err.response?.data?.message || 'Error al autorizar.');
    } finally {
      setSigning(false);
    }
  };

  // ── rechazar ─────────────────────────────────────────────────────────────
  const handleRechazar = async (e) => {
    e.preventDefault();
    if (!motivo.trim() || motivo.trim().length < 5) { setMotivoErr('Mínimo 5 caracteres.'); return; }
    setRejecting(true);
    setMotivoErr('');
    try {
      await api.put(`/autorizaciones/${rechItem.id}/rechazar`, { motivo: motivo.trim() }, { headers: authHeaders() });
      setRechItem(null);
      setMotivo('');
      fetchLista();
      showToast('Autorización rechazada.', 'warn');
    } catch (err) {
      setMotivoErr(err.response?.data?.message || 'Error al rechazar.');
    } finally {
      setRejecting(false);
    }
  };

  // ── eliminar ─────────────────────────────────────────────────────────────
  const handleEliminar = async () => {
    try {
      await api.delete(`/autorizaciones/${delItem.id}`, { headers: authHeaders() });
      setDelItem(null);
      fetchLista();
      showToast('Autorización eliminada.', 'ok');
    } catch (err) {
      setDelItem(null);
      showToast(err.response?.data?.message || 'Error al eliminar.');
    }
  };

  // ── PDF ──────────────────────────────────────────────────────────────────
  const generarPDF = async (item) => {
    const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const PW     = doc.internal.pageSize.getWidth();   // 215.9
    const PH     = doc.internal.pageSize.getHeight();  // 279.4
    const L      = 10;
    const R      = PW - 10;
    const CW     = R - L;                              // 196
    const AZUL   = [39, 76, 141];
    const NEGRO  = [20, 20, 20];
    const BLANCO = [255, 255, 255];
    const GBKG   = [237, 241, 250];   // gris-azulado para labels

    // ── strip tildes (jsPDF latin-1) ──────────────────────
    const sa = s => (s || '').replace(/[ÁÉÍÓÚÑáéíóúñ]/g,
      c => ({ Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U',Ñ:'N',
               á:'a',é:'e',í:'i',ó:'o',ú:'u',ñ:'n' }[c] || c));

    // ── cargar imagen → {data, w, h} ─────────────────────
    const loadImg = (url, white = false) => new Promise(async (resolve) => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) { resolve(null); return; }
        const blob   = await resp.blob();
        const burl   = URL.createObjectURL(blob);
        const img    = new Image();
        img.onload = () => {
          try {
            const scale  = Math.min(220 / img.naturalWidth, 220 / img.naturalHeight, 1);
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.naturalWidth  * scale);
            canvas.height = Math.round(img.naturalHeight * scale);
            const ctx = canvas.getContext('2d');
            if (white) { ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(burl);
            resolve({ data: canvas.toDataURL(white ? 'image/jpeg' : 'image/png', 0.95),
                      w: img.naturalWidth, h: img.naturalHeight });
          } catch { URL.revokeObjectURL(burl); resolve(null); }
        };
        img.onerror = () => { URL.revokeObjectURL(burl); resolve(null); };
        img.src = burl;
      } catch { resolve(null); }
    });

    const [logoRes, firmaRes] = await Promise.all([
      loadImg('/logo-congreso.png.png', true),
      item.estado === 'AUTORIZADO' ? loadImg('/firma.png', false) : Promise.resolve(null),
    ]);

    // ── borde exterior del formulario ─────────────────────
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(1.2);
    doc.rect(L - 4, 5, CW + 8, PH - 10, 'S');

    let y = 10;

    // ════════════════════════════════════════════════════
    //  ENCABEZADO — [LOGO | INSTITUCIÓN | INFO PANEL]
    // ════════════════════════════════════════════════════
    const LOGO_W = 50;
    const INFO_W = 62;
    const CENT_W = CW - LOGO_W - INFO_W;
    const HDR_H  = 42;

    // fondo blanco del header completo
    doc.setFillColor(...BLANCO);
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.5);
    doc.rect(L, y, CW, HDR_H, 'FD');

    // logo centrado en su celda
    if (logoRes) {
      const lSize = HDR_H - 6;
      doc.addImage(logoRes.data, 'JPEG', L + (LOGO_W - lSize) / 2, y + 3, lSize, lSize);
    }

    // Separador logo | institución
    doc.setDrawColor(180, 200, 235);
    doc.setLineWidth(0.3);
    doc.line(L + LOGO_W, y + 4, L + LOGO_W, y + HDR_H - 4);

    // texto institución — centrado en sección central
    const hdrCX = L + LOGO_W + CENT_W / 2;
    doc.setTextColor(...AZUL);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('REPÚBLICA DE HONDURAS', hdrCX, y + 11, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('CONGRESO NACIONAL', hdrCX, y + 18, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('PAGADURÍA ESPECIAL', hdrCX, y + 28, { align: 'center' });

    // Separador institución | panel info
    doc.setDrawColor(180, 200, 235);
    doc.setLineWidth(0.3);
    doc.line(L + LOGO_W + CENT_W, y + 4, L + LOGO_W + CENT_W, y + HDR_H - 4);

    // Panel derecho: No. + FECHA + GENERADO/HORA + GENERADO POR
    const infoX   = L + LOGO_W + CENT_W;
    const infoMid = infoX + INFO_W / 2;
    const now      = new Date();
    const fechaGen = now.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaGen  = now.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const genPor   = sa((user?.nombre || 'Sistema').toUpperCase());

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 120, 160);
    doc.text('No.', infoMid, y + 7, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...AZUL);
    doc.text(String(item.numero || 0).padStart(4, '0'), infoMid, y + 15, { align: 'center' });

    doc.setDrawColor(210, 220, 235);
    doc.setLineWidth(0.2);
    doc.line(infoX + 3, y + 17, infoX + INFO_W - 3, y + 17);

    const col1 = infoX + 4;
    const col2 = infoX + INFO_W / 2 + 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 120, 160);
    doc.text('GENERADO', col1, y + 22);
    doc.text('HORA',     col2, y + 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(20, 20, 20);
    doc.text(fechaGen, col1, y + 27.5);
    doc.text(horaGen,  col2, y + 27.5);

    doc.setDrawColor(210, 220, 235);
    doc.setLineWidth(0.2);
    doc.line(infoX + 3, y + 30, infoX + INFO_W - 3, y + 30);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 120, 160);
    doc.text('GENERADO POR', infoMid, y + 34.5, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...AZUL);
    doc.text(genPor, infoMid, y + 40, { align: 'center' });

    // ════════════════════════════════════════════════════
    //  BARRA DE TÍTULO (azul oscuro, ancho completo)
    // ════════════════════════════════════════════════════
    y += HDR_H;
    const TBAR_H = 11;
    const NO_BOX_W = 26;
    const TITLE_W  = CW - NO_BOX_W;

    // franja azul título (toda la anchura)
    doc.setFillColor(...AZUL);
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0);
    doc.rect(L, y, CW, TBAR_H, 'FD');

    // texto del título (centrado sólo en la parte izquierda, sin invadir el No.)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...BLANCO);
    doc.text('AUTORIZACIÓN PARA EMISIÓN DE PAGO',
      L + TITLE_W / 2, y + 7.5, { align: 'center' });

    // casilla No. — recuadro blanco incrustado en la barra azul
    const NB_X = L + TITLE_W + 1;
    const NB_Y = y + 1;
    const NB_W = NO_BOX_W - 2;
    const NB_H = TBAR_H - 2;
    doc.setFillColor(...BLANCO);
    doc.setDrawColor(200, 210, 230);
    doc.setLineWidth(0.3);
    doc.rect(NB_X, NB_Y, NB_W, NB_H, 'FD');

    // "No." label pequeño arriba
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 120, 160);
    doc.text('No.', NB_X + NB_W / 2, NB_Y + 3.2, { align: 'center' });

    // número grande centrado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...AZUL);
    doc.text(String(item.numero || 0).padStart(4, '0'),
      NB_X + NB_W / 2, NB_Y + NB_H - 1.5, { align: 'center' });

    // ════════════════════════════════════════════════════
    //  TIPO DE PAGO — filas limpias estilo formulario
    // ════════════════════════════════════════════════════
    y += TBAR_H + 3;
    const TIPOS_PDF = [
      { key: 'CHEQUE',         label: 'CHEQUE' },
      { key: 'CONTRA_ENTREGA', label: 'PAGO CONTRA-ENTREGA' },
      { key: 'TRANSFERENCIA',  label: 'TRANSFERENCIA' },
      { key: 'PAGO_LINEA',     label: 'PAGO EN LÍNEA' },
    ];
    const CB_ROW_H = 9;
    const CB_SIZE  = 6;          // tamaño del cuadro
    const CB_X     = L + 72;     // posición X del cuadro (fija para todas las filas)

    TIPOS_PDF.forEach((t, i) => {
      const ry  = y + i * CB_ROW_H;
      const mid = ry + CB_ROW_H / 2;
      const isSelected = item.tipo_pago === t.key;

      // fondo de la fila seleccionada
      if (isSelected) {
        doc.setFillColor(235, 242, 255);
        doc.rect(L, ry, CB_X - L + CB_SIZE + 8, CB_ROW_H, 'F');
      }

      // label del tipo de pago
      doc.setFont('helvetica', isSelected ? 'bold' : 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...NEGRO);
      doc.text(t.label + ':', L + 4, mid + 3.5);

      // cuadro del checkbox — centrado verticalmente en la fila
      const cbY = mid - CB_SIZE / 2;
      doc.setFillColor(...BLANCO);
      doc.setDrawColor(...NEGRO);
      doc.setLineWidth(0.45);
      doc.rect(CB_X, cbY, CB_SIZE, CB_SIZE, 'FD');

      if (isSelected) {
        // X centrada dentro del cuadro
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...NEGRO);
        doc.text('X', CB_X + CB_SIZE / 2, cbY + CB_SIZE - 1, { align: 'center' });
      }
    });

    const CB_TOTAL_H = CB_ROW_H * TIPOS_PDF.length;

    // ════════════════════════════════════════════════════
    //  BENEFICIARIO
    // ════════════════════════════════════════════════════
    y += CB_TOTAL_H + 7;
    const LBL_W = 36;
    const ROW_H  = 14;

    doc.setFillColor(...GBKG);
    doc.setDrawColor(...NEGRO);
    doc.setLineWidth(0.3);
    doc.rect(L, y, LBL_W, ROW_H, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...AZUL);
    doc.text('BENEFICIARIO', L + LBL_W / 2, y + 9, { align: 'center' });

    doc.setFillColor(...BLANCO);
    doc.rect(L + LBL_W, y, CW - LBL_W, ROW_H, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...NEGRO);
    doc.text(sa(item.beneficiario || '').toUpperCase(),
      L + LBL_W + 5, y + 9, { maxWidth: CW - LBL_W - 7 });

    // ════════════════════════════════════════════════════
    //  CANTIDAD (en letras)
    // ════════════════════════════════════════════════════
    y += ROW_H;
    doc.setFillColor(...GBKG);
    doc.setDrawColor(...NEGRO);
    doc.rect(L, y, LBL_W, ROW_H, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...AZUL);
    doc.text('CANTIDAD:', L + LBL_W / 2, y + 9, { align: 'center' });

    doc.setFillColor(...BLANCO);
    doc.rect(L + LBL_W, y, CW - LBL_W, ROW_H, 'FD');
    doc.setTextColor(...NEGRO);
    const letrasStr  = sa(item.monto_letras || '');
    const letrasFits = doc.splitTextToSize(letrasStr, CW - LBL_W - 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(letrasFits.length > 1 ? 8.5 : 10);
    doc.text(letrasFits[0] || letrasStr, L + LBL_W + 5, y + 9);

    // ════════════════════════════════════════════════════
    //  DETALLE F/N
    // ════════════════════════════════════════════════════
    y += ROW_H;
    const DET_H = 52;

    doc.setFillColor(...BLANCO);
    doc.setDrawColor(...NEGRO);
    doc.setLineWidth(0.3);
    doc.rect(L, y, CW, DET_H, 'FD');

    // celda label "DETALLE F/N:" (izquierda, altura completa)
    doc.setFillColor(...GBKG);
    doc.rect(L, y, LBL_W, DET_H, 'FD');
    doc.setFillColor(0, 0, 0, 0);
    doc.rect(L, y, CW, DET_H, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...AZUL);
    doc.text('DETALLE', L + LBL_W / 2, y + DET_H / 2 - 3, { align: 'center' });
    doc.text('F/N:',    L + LBL_W / 2, y + DET_H / 2 + 4, { align: 'center' });

    // texto del detalle
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...NEGRO);
    const detLines = doc.splitTextToSize(sa(item.detalle || ''), CW - LBL_W - 8);
    doc.text(detLines, L + LBL_W + 5, y + 11, { lineHeightFactor: 1.5 });

    // ════════════════════════════════════════════════════
    //  TABLA: AÑO / ORG / FONDO  +  TOTAL
    // ════════════════════════════════════════════════════
    y += DET_H + 10;
    const COL_W = 24;

    // encabezados (fondo azul)
    ['AÑO', 'ORG', 'FONDO'].forEach((h, i) => {
      doc.setFillColor(...AZUL);
      doc.setDrawColor(...NEGRO);
      doc.setLineWidth(0.3);
      doc.rect(L + i * COL_W, y, COL_W, 9, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...BLANCO);
      doc.text(h, L + i * COL_W + COL_W / 2, y + 6.3, { align: 'center' });
    });

    // valores
    [String(item.anio || ''), item.org || '', item.fondo || ''].forEach((v, i) => {
      doc.setFillColor(...BLANCO);
      doc.setDrawColor(...NEGRO);
      doc.rect(L + i * COL_W, y + 9, COL_W, 9, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...NEGRO);
      doc.text(v, L + i * COL_W + COL_W / 2, y + 15.3, { align: 'center' });
    });

    // TOTAL
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NEGRO);
    doc.text('TOTAL', R - 64, y + 15);

    const TB_X = R - 46;
    const TB_W = 46;
    doc.setDrawColor(...NEGRO);
    doc.setLineWidth(0.45);
    doc.rect(TB_X, y + 5.5, TB_W, 12, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('L', TB_X + 3, y + 14.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    const mStr = new Intl.NumberFormat('es-HN', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(item.monto ?? 0);
    doc.text(mStr, TB_X + TB_W - 2.5, y + 14.5, { align: 'right' });

    // ════════════════════════════════════════════════════
    //  SECCIÓN DE FIRMA
    // ════════════════════════════════════════════════════
    y += 22;
    const sigCX = PW / 2;

    // imagen de firma (solo si AUTORIZADO y existe)
    if (firmaRes) {
      const aspect = firmaRes.h / firmaRes.w;
      const fw     = 56;
      const fh     = Math.min(fw * aspect, 22);
      const fw2    = fh / aspect;
      doc.addImage(firmaRes.data, 'PNG', sigCX - fw2 / 2, y, fw2, fh);
      y += fh + 2;
    }

    // línea de firma más corta
    doc.setDrawColor(...NEGRO);
    doc.setLineWidth(0.5);
    doc.line(sigCX - 32, y, sigCX + 32, y);

    const firmaNombre = sa(
      (item.firma_nombre || '').toUpperCase()
    );
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NEGRO);
    doc.text(firmaNombre, sigCX, y + 6, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('PAGADOR ESPECIAL', sigCX, y + 12, { align: 'center' });

    // ════════════════════════════════════════════════════
    //  PIE DE PÁGINA (solo si AUTORIZADO o RECHAZADO)
    // ════════════════════════════════════════════════════
    if (item.estado === 'AUTORIZADO') {
      const fecAut = item.fecha_autorizacion
        ? new Date(item.fecha_autorizacion)
        : null;
      const fechaStr = fecAut
        ? fecAut.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '—';
      const horaStr = fecAut
        ? fecAut.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '';
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text('Autorizado por: ' + sa((item.autorizado_por_nombre || '').toUpperCase()),
        R, PH - 30, { align: 'right' });
      doc.text('Fecha: ' + fechaStr + '  Hora: ' + horaStr,
        R, PH - 24, { align: 'right' });
    } else if (item.estado === 'RECHAZADO') {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(160, 0, 0);
      doc.text('RECHAZADO', R, PH - 24, { align: 'right' });
    }

    // ── Footer azul en todas las páginas ─────────────────
    const pageCount = doc.internal.getNumberOfPages();
    const now2 = new Date();
    const fGen = now2.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hGen = now2.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true });
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      const FH = 9;
      const FY = PH - 5 - FH;
      doc.setFillColor(...AZUL);
      doc.rect(L - 4, FY, CW + 8, FH, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...BLANCO);
      doc.text('Congreso Nacional - Pagaduría Especial', L - 1, FY + 5.8);
      doc.text('Página ' + p + ' de ' + pageCount, L + CW / 2, FY + 5.8, { align: 'center' });
      doc.text('Generado: ' + fGen + ' ' + hGen, L + CW + 1, FY + 5.8, { align: 'right' });
    }

    doc.save(`autorizacion-${String(item.numero || 0).padStart(4, '0')}.pdf`);
  };

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="page-shell">
      <Navbar />

      {/* ── Toast notification ─────────────────────────── */}
      {toast && (
        <div className={`aut-toast aut-toast--${toast.type}`} role="alert">
          <span className="aut-toast-msg">{toast.msg}</span>
          <button className="aut-toast-close" onClick={() => setToast(null)} aria-label="Cerrar">×</button>
        </div>
      )}

      <div className="page-content">

        {/* Header */}
        <div className="usr-page-header">
          <div>
            <h1>Autorizaciones de Pago</h1>
            <p>Gestión de autorizaciones para emisión de pago — Pagaduría Especial</p>
          </div>
          {!esAdmin && (
            <button className="btn-primary" onClick={() => { setForm({ ...EMPTY_FORM }); setFormErrors({}); setModalCrear(true); }}>
              <FiPlus size={15} /> Nueva Autorización
            </button>
          )}
        </div>

        {/* Stats */}
        {(() => {
          const totalMonto    = lista.reduce((s, a) => s + parseFloat(a.monto || 0), 0);
          const montoPendiente = lista.filter(a => a.estado === 'PENDIENTE').reduce((s, a) => s + parseFloat(a.monto || 0), 0);
          const montoAutorizado = lista.filter(a => a.estado === 'AUTORIZADO').reduce((s, a) => s + parseFloat(a.monto || 0), 0);
          const countRechazado = lista.filter(a => a.estado === 'RECHAZADO').length;
          return (
            <div className="aut-stats">
              <div className="aut-stat-card">
                <div className="aut-stat-icon" style={{ background: '#f0f2ff' }}><FiList size={22} color="#667eea" /></div>
                <div>
                  <div className="aut-stat-label">Total Autorizaciones</div>
                  <div className="aut-stat-value">{lista.length}</div>
                  <div className="aut-stat-sub">{fmtMonto(totalMonto)}</div>
                </div>
              </div>
              <div className="aut-stat-card">
                <div className="aut-stat-icon" style={{ background: '#fffbeb' }}><FiClock size={22} color="#d97706" /></div>
                <div>
                  <div className="aut-stat-label">Pendientes</div>
                  <div className="aut-stat-value" style={{ color: '#d97706' }}>{pendingCount}</div>
                  <div className="aut-stat-sub">{fmtMonto(montoPendiente)}</div>
                </div>
              </div>
              <div className="aut-stat-card">
                <div className="aut-stat-icon" style={{ background: '#ecfdf5' }}><FiCheckSquare size={22} color="#059669" /></div>
                <div>
                  <div className="aut-stat-label">Autorizadas</div>
                  <div className="aut-stat-value" style={{ color: '#059669' }}>{lista.filter(a => a.estado === 'AUTORIZADO').length}</div>
                  <div className="aut-stat-sub">{fmtMonto(montoAutorizado)}</div>
                </div>
              </div>
              <div className="aut-stat-card">
                <div className="aut-stat-icon" style={{ background: '#fff1f2' }}><FiSlash size={22} color="#e11d48" /></div>
                <div>
                  <div className="aut-stat-label">Rechazadas</div>
                  <div className="aut-stat-value" style={{ color: '#e11d48' }}>{countRechazado}</div>
                  <div className="aut-stat-sub">&nbsp;</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Analytics (gráficos) — solo admins ─────────────────── */}
        {esAdmin && <div className="aut-analytics-card">
          <div className="aut-analytics-header" onClick={() => setShowCharts(v => !v)}>
            <div className="aut-analytics-title">
              <FiBarChart2 size={18} />
              <span>Análisis por Período</span>
            </div>
            <div className="aut-analytics-header-right">
              {showCharts && (
                <>
                  <select
                    className="aut-year-select"
                    value={chartAnio}
                    onClick={e => e.stopPropagation()}
                    onChange={e => { setChartAnio(parseInt(e.target.value)); setChartMes(-1); }}
                  >
                    {aniosDisponibles.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <select
                    className="aut-year-select"
                    value={chartMes}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setChartMes(parseInt(e.target.value))}
                  >
                    <option value={-1}>Todos los meses</option>
                    {MESES_LARGOS.map((m, i) => (
                      <option key={i} value={i}>{m}</option>
                    ))}
                  </select>
                </>
              )}
              <span className="aut-analytics-toggle">
                {showCharts ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
              </span>
            </div>
          </div>

          {showCharts && (
            <div className="aut-charts-body">

              {/* Gráfico 1 – Barras apiladas por mes (conteo) */}
              <div className="aut-chart-panel">
                <div className="aut-chart-panel-header">
                  <FiBarChart2 size={15} />
                  <span>Autorizaciones por mes — {chartAnio}</span>
                  <span className="aut-chart-click-hint">Clic en un mes para filtrar</span>
                </div>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    barSize={14}
                    style={{ cursor: 'pointer' }}
                    onClick={e => {
                      if (!e?.activeLabel) return;
                      const idx = MESES_CORTOS.indexOf(e.activeLabel);
                      if (idx === -1) return;
                      setChartMes(prev => prev === idx ? -1 : idx);
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f4fa" vertical={false} />
                    <XAxis
                      dataKey="mes"
                      tick={props => {
                        const idx = MESES_CORTOS.indexOf(props.payload.value);
                        const active = chartMes === idx;
                        return (
                          <text x={props.x} y={props.y + 10} textAnchor="middle"
                            fill={active ? '#274C8D' : '#8a99aa'}
                            fontWeight={active ? 800 : 400}
                            fontSize={active ? 12 : 11}>
                            {props.payload.value}
                          </text>
                        );
                      }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8a99aa' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: '10px', border: '1px solid #e8ecf4', fontSize: 12 }}
                      cursor={{ fill: 'rgba(39,76,141,0.04)' }}
                      labelFormatter={label => {
                        const item = chartData.find(d => d.mes === label);
                        return item ? `${item.mesLargo} ${chartAnio}` : label;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Bar dataKey="Autorizado" stackId="a" fill="#059669" radius={[0,0,0,0]} />
                    <Bar dataKey="Pendiente"  stackId="a" fill="#d97706" radius={[0,0,0,0]} />
                    <Bar dataKey="Rechazado"  stackId="a" fill="#e11d48" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfico 2 – Línea de montos por mes */}
              <div className="aut-chart-panel">
                <div className="aut-chart-panel-header">
                  <FiTrendingUp size={15} />
                  <span>Monto total por mes — {chartAnio}</span>
                  <span className="aut-chart-click-hint">Clic en un mes para filtrar</span>
                </div>
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    style={{ cursor: 'pointer' }}
                    onClick={e => {
                      if (!e?.activeLabel) return;
                      const idx = MESES_CORTOS.indexOf(e.activeLabel);
                      if (idx === -1) return;
                      setChartMes(prev => prev === idx ? -1 : idx);
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f4fa" vertical={false} />
                    <XAxis
                      dataKey="mes"
                      tick={props => {
                        const idx = MESES_CORTOS.indexOf(props.payload.value);
                        const active = chartMes === idx;
                        return (
                          <text x={props.x} y={props.y + 10} textAnchor="middle"
                            fill={active ? '#274C8D' : '#8a99aa'}
                            fontWeight={active ? 800 : 400}
                            fontSize={active ? 12 : 11}>
                            {props.payload.value}
                          </text>
                        );
                      }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#8a99aa' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '10px', border: '1px solid #e8ecf4', fontSize: 12 }}
                      cursor={{ stroke: '#274C8D', strokeWidth: 1, strokeDasharray: '4' }}
                      labelFormatter={label => {
                        const item = chartData.find(d => d.mes === label);
                        return item ? `${item.mesLargo} ${chartAnio}` : label;
                      }}
                      formatter={v => ['L ' + new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(v), 'Monto']}
                    />
                    <Line
                      type="monotone"
                      dataKey="Monto"
                      stroke="#274C8D"
                      strokeWidth={2.5}
                      dot={(props) => {
                        const idx = MESES_CORTOS.indexOf(props.payload.mes);
                        const active = chartMes === idx;
                        return <circle key={props.key} cx={props.cx} cy={props.cy} r={active ? 7 : 4}
                          fill={active ? '#274C8D' : '#274C8D'} stroke="white" strokeWidth={2} />;
                      }}
                      activeDot={{ r: 7, stroke: '#274C8D', strokeWidth: 2, fill: 'white' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfico 3 – Pie distribución de estados (total histórico) */}
              <div className="aut-chart-panel">
                <div className="aut-chart-panel-header">
                  <FiCheckSquare size={15} />
                  <span>Distribución de estados — {chartMes === -1 ? chartAnio : `${MESES_LARGOS[chartMes]} ${chartAnio}`}</span>
                </div>
                {pieData.length === 0 ? (
                  <div className="aut-chart-empty">Sin datos</div>
                ) : (
                  <div className="aut-pie-wrap">
                    <div className="aut-pie-donut-wrap">
                      <ResponsiveContainer width={200} height={200}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={62}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            label={false}
                            labelLine={false}
                          >
                            {pieData.map((entry, idx) => (
                              <Cell key={idx} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ borderRadius: '10px', border: '1px solid #e8ecf4', fontSize: 12 }}
                            formatter={(v, name) => [v + ' autorizaciones', name]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Número total en el centro */}
                      <div className="aut-pie-center">
                        <span className="aut-pie-center-num">{pieData.reduce((s,d) => s + d.value, 0)}</span>
                        <span className="aut-pie-center-lbl">Total</span>
                      </div>
                    </div>
                    <div className="aut-pie-legend">
                      {pieData.map((d, i) => {
                        const total = pieData.reduce((s, x) => s + x.value, 0);
                        const pct   = total > 0 ? ((d.value / total) * 100).toFixed(0) : 0;
                        return (
                          <div key={i} className="aut-pie-leg-item">
                            <span className="aut-pie-dot" style={{ background: d.color }} />
                            <span className="aut-pie-leg-label">{d.name}</span>
                            <strong className="aut-pie-leg-val">{d.value}</strong>
                            <span className="aut-pie-leg-pct">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Gráfico 4 – Tipo de pago (barras horizontales) */}
              <div className="aut-chart-panel">
                <div className="aut-chart-panel-header">
                  <FiList size={15} />
                  <span>Autorizaciones por tipo de pago — {chartMes === -1 ? chartAnio : `${MESES_LARGOS[chartMes]} ${chartAnio}`}</span>
                </div>
                {tipoPagoData.length === 0 ? (
                  <div className="aut-chart-empty">Sin datos</div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={tipoPagoData.length * 52 + 20}>
                      <BarChart
                        data={tipoPagoData}
                        layout="vertical"
                        margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                        barSize={14}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f4fa" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#8a99aa' }} axisLine={false} tickLine={false} />
                        <YAxis dataKey="tipo" type="category" width={148} tick={{ fontSize: 11, fill: '#2d3748', fontWeight: 600 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ borderRadius: '10px', border: '1px solid #e8ecf4', fontSize: 12 }}
                          cursor={{ fill: 'rgba(39,76,141,0.04)' }}
                          formatter={(v, name) => [v, name === 'Total' ? 'Total autorizaciones' : 'Autorizadas']}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                        <Bar dataKey="Total" fill="#e0e7ff" radius={[0,4,4,0]} />
                        <Bar dataKey="Autorizado" radius={[0,4,4,0]}>
                          {tipoPagoData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="aut-tipo-period-badge">
                      <FiClock size={12} />
                      <span>
                        Mostrando: <strong>{chartMes === -1 ? `Todo ${chartAnio}` : `${MESES_LARGOS[chartMes]} ${chartAnio}`}</strong>
                      </span>
                    </div>
                    <div className="aut-tipo-summary">
                      {tipoPagoData.length === 0 ? (
                        <div className="aut-chart-empty" style={{ height: 60 }}>
                          Sin autorizaciones en {chartMes === -1 ? chartAnio : `${MESES_LARGOS[chartMes]} ${chartAnio}`}
                        </div>
                      ) : tipoPagoData.map((d, i) => (
                        <div key={i} className="aut-tipo-row">
                          <span className="aut-tipo-dot" style={{ background: d.color }} />
                          <span className="aut-tipo-label">{d.tipo}</span>
                          <span className="aut-tipo-count">{d.Total} autorizaciones</span>
                          <span className="aut-tipo-monto">{fmtMonto(d.Monto)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

            </div>
          )}
        </div>}

        {/* Filtros + Búsqueda */}
        <div className="aut-topbar">
          <div className="aut-filters">
            {['TODOS','PENDIENTE','AUTORIZADO','RECHAZADO'].map(e => (
              <button
                key={e}
                className={`aut-filter-btn${filtroEstado === e ? ' active' : ''} ${e !== 'TODOS' ? 'f-' + e.toLowerCase() : ''}`}
                onClick={() => { setFiltro(e); setPage(1); }}
              >
                {e === 'TODOS' ? 'Todos' : ESTADO_CFG[e]?.label}
                {e === 'PENDIENTE' && pendingCount > 0 && (
                  <span className="aut-pending-badge">{pendingCount}</span>
                )}
              </button>
            ))}
          </div>
          <div className="caja-date-filters">
            <input
              type="date"
              className="caja-input caja-date-input"
              title="Desde"
              value={filtroDesde}
              onChange={e => {
                const val = e.target.value;
                if (filtroHasta && val && val > filtroHasta) {
                  showToast('La fecha de inicio no puede ser mayor a la fecha de fin.', 'warn');
                  return;
                }
                setFiltroDesde(val); setPage(1);
              }}
            />
            <span className="caja-date-sep">—</span>
            <input
              type="date"
              className="caja-input caja-date-input"
              title="Hasta"
              value={filtroHasta}
              onChange={e => {
                const val = e.target.value;
                if (filtroDesde && val && val < filtroDesde) {
                  showToast('La fecha de fin no puede ser menor a la fecha de inicio.', 'warn');
                  return;
                }
                setFiltroHasta(val); setPage(1);
              }}
            />
            {(filtroDesde || filtroHasta) && (
              <button
                className="caja-date-clear"
                title="Limpiar rango"
                onClick={() => { setFiltroDesde(''); setFiltroHasta(''); setPage(1); }}
              >
                <FiX size={13} />
              </button>
            )}
          </div>
          <input
            type="text"
            className="aut-search-input"
            placeholder="Buscar beneficiario, N°, tipo, año…"
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPage(1); }}
          />
        </div>

        {/* Tabla */}
        <div className="caja-table-wrap">
          {loading ? (
            <div className="caja-empty">Cargando…</div>
          ) : listaMostrada.length === 0 ? (
            <div className="caja-empty">No hay autorizaciones.</div>
          ) : (
            <table className="caja-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Tipo de Pago</th>
                  <th>Beneficiario</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th>Creado por</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listaPaginada.map(a => {
                  const cfg = ESTADO_CFG[a.estado] || {};
                  return (
                    <tr key={a.id}>
                      <td><strong>{String(a.numero).padStart(4,'0')}</strong></td>
                      <td>{TIPO_LABELS[a.tipo_pago] || a.tipo_pago}</td>
                      <td>{a.beneficiario}</td>
                      <td style={{ textAlign: 'right' }}><strong>{fmtMonto(a.monto)}</strong></td>
                      <td>{a.creado_por_nombre}</td>
                      <td>{fmtFecha(a.fecha_creacion)}</td>
                      <td>
                        <span className={`aut-badge ${cfg.cls}`}>{cfg.label}</span>
                        {a.estado === 'RECHAZADO' && a.motivo_rechazo && (
                          <div className="aut-motivo-inline" title={a.motivo_rechazo}>
                            {a.motivo_rechazo.length > 45 ? a.motivo_rechazo.substring(0, 45) + '…' : a.motivo_rechazo}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="aut-actions">
                          {/* Ver */}
                          <button className="action-btn" title="Ver detalle" onClick={() => setVerItem(a)}>
                            <FiEye size={14} />
                          </button>
                          {/* PDF */}
                          <button className="action-btn" title="Descargar PDF" onClick={() => generarPDF(a)}>
                            <FiDownload size={14} />
                          </button>
                          {/* Editar (ASISTENTE, ADMIN, SUPER_ADMIN — cualquier estado) */}
                          {puedeEditar(a) && (
                            <button className="action-btn edit" title="Editar" onClick={() => openEditar(a)}>
                              <FiEdit2 size={14} />
                            </button>
                          )}
                          {/* Autorizar / Rechazar (solo admin, solo PENDIENTE) */}
                          {esAdmin && a.estado === 'PENDIENTE' && (
                            <>
                              <button className="action-btn approve" title="Autorizar (firma digital)" onClick={() => { setAutItem(a); setPassword(''); setPassErr(''); }}>
                                <FiCheckCircle size={14} />
                              </button>
                              <button className="action-btn reject" title="Rechazar" onClick={() => { setRechItem(a); setMotivo(''); setMotivoErr(''); }}>
                                <FiXCircle size={14} />
                              </button>
                            </>
                          )}
                          {/* Eliminar (solo SUPER_ADMIN, solo PENDIENTE) */}
                          {esSuperAdmin && a.estado === 'PENDIENTE' && (
                            <button className="action-btn deactivate" title="Eliminar" onClick={() => setDelItem(a)}>
                              <FiTrash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginación */}
        {totalFiltered > 0 && (
          <div className="caja-pagination">
            <span className="caja-pagination-info">
              Mostrando {Math.min((page - 1) * pageSize + 1, totalFiltered)}–{Math.min(page * pageSize, totalFiltered)} de {totalFiltered} autorizaciones
            </span>
            <div className="caja-pagination-controls">
              <select
                className="caja-input caja-page-size-select"
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              >
                {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s} por pág.</option>)}
              </select>
              <button className="caja-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
              <span className="caja-page-num">{page} / {totalPages}</span>
              <button className="caja-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ MODAL EDITAR ══════════════════════════════════════════════════════ */}
      {editItem && (
        <div className="modal-overlay" onClick={() => setEditItem(null)}>
          <div className="aut-modal" onClick={e => e.stopPropagation()}>
            <div className="aut-modal-header" style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)' }}>
              <div className="aut-modal-icon"><FiEdit2 size={20} color="#d97706" /></div>
              <div>
                <h3>Editar Autorización</h3>
                <p>No. {String(editItem.numero).padStart(4,'0')} — solo PENDIENTES</p>
              </div>
              <button className="modal-close-btn" onClick={() => setEditItem(null)}><FiX size={18} /></button>
            </div>
            <form onSubmit={handleEditar} className="aut-form">
              <div className="aut-form-group">
                <label>Tipo de Pago</label>
                <div className="aut-radio-group">
                  {Object.entries(TIPO_LABELS).map(([k, v]) => (
                    <label key={k} className={`aut-radio-label${editForm.tipo_pago === k ? ' selected' : ''}`}>
                      <input type="radio" name="edit_tipo_pago" value={k}
                        checked={editForm.tipo_pago === k}
                        onChange={e => { setEditForm(p => ({ ...p, tipo_pago: e.target.value })); setEditErrors(p => ({ ...p, tipo_pago: '' })); }} />
                      {v}
                    </label>
                  ))}
                </div>
                {editErrors.tipo_pago && <span className="field-error">{editErrors.tipo_pago}</span>}
              </div>
              <div className="aut-form-group">
                <label>Beneficiario / Proveedor</label>
                <input className={`caja-input${editErrors.beneficiario ? ' input-error' : ''}`}
                  type="text" maxLength={200} placeholder="Nombre del beneficiario"
                  value={editForm.beneficiario}
                  onChange={e => { setEditForm(p => ({ ...p, beneficiario: e.target.value })); setEditErrors(p => ({ ...p, beneficiario: '' })); }} />
                {editErrors.beneficiario && <span className="field-error">{editErrors.beneficiario}</span>}
              </div>
              <div className="aut-form-row">
                <div className="aut-form-group">
                  <label>Monto (L)</label>
                  <input className={`caja-input${editErrors.monto ? ' input-error' : ''}`}
                    type="number" step="0.01" min="0.01" max={MONTO_MAX} placeholder="0.00"
                    value={editForm.monto}
                    onChange={e => handleEditMontoChange(e.target.value)} />
                  {editErrors.monto && <span className="field-error">{editErrors.monto}</span>}
                </div>
                <div className="aut-form-group">
                  <label>Año</label>
                  <input className={`caja-input${editErrors.anio ? ' input-error' : ''}`}
                    type="number" min="2000" max="2100"
                    value={editForm.anio}
                    onChange={e => { setEditForm(p => ({ ...p, anio: e.target.value })); setEditErrors(p => ({ ...p, anio: '' })); }} />
                  {editErrors.anio && <span className="field-error">{editErrors.anio}</span>}
                </div>
                <div className="aut-form-group">
                  <label>Org.</label>
                  <input className="caja-input" type="text" maxLength={20}
                    value={editForm.org} onChange={e => setEditForm(p => ({ ...p, org: e.target.value }))} />
                </div>
                <div className="aut-form-group">
                  <label>Fondo</label>
                  <input className="caja-input" type="text" maxLength={20}
                    value={editForm.fondo} onChange={e => setEditForm(p => ({ ...p, fondo: e.target.value }))} />
                </div>
              </div>
              <div className="aut-form-group">
                <label>Cantidad en Letras</label>
                <input className={`caja-input${editErrors.monto_letras ? ' input-error' : ''}`}
                  type="text" maxLength={600}
                  value={editForm.monto_letras}
                  onChange={e => { setEditForm(p => ({ ...p, monto_letras: e.target.value })); setEditErrors(p => ({ ...p, monto_letras: '' })); }} />
                {editErrors.monto_letras && <span className="field-error">{editErrors.monto_letras}</span>}
              </div>
              <div className="aut-form-group">
                <label>Detalle / Fundamento</label>
                <textarea className={`caja-input aut-textarea${editErrors.detalle ? ' input-error' : ''}`}
                  maxLength={1000} rows={4}
                  value={editForm.detalle}
                  onChange={e => { setEditForm(p => ({ ...p, detalle: e.target.value })); setEditErrors(p => ({ ...p, detalle: '' })); }} />
                {editErrors.detalle && <span className="field-error">{editErrors.detalle}</span>}
              </div>
              {editErrors._server && <div className="caja-form-error">{editErrors._server}</div>}
              <div className="caja-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setEditItem(null)}>Cancelar</button>
                <button type="submit" className="btn-warning" disabled={editing}>
                  {editing ? 'Guardando…' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ MODAL CREAR ══════════════════════════════════════════════════════ */}
      {modalCrear && (
        <div className="modal-overlay" onClick={() => setModalCrear(false)}>
          <div className="aut-modal" onClick={e => e.stopPropagation()}>
            <div className="aut-modal-header">
              <div className="aut-modal-icon"><FiFileText size={20} color="#274C8D" /></div>
              <div><h3>Nueva Autorización de Pago</h3><p>Pagaduría Especial — Congreso Nacional</p></div>
              <button className="modal-close-btn" onClick={() => setModalCrear(false)}><FiX size={18} /></button>
            </div>
            <form onSubmit={handleCrear} className="aut-form">

              {/* Tipo de pago */}
              <div className="aut-form-group">
                <label>Tipo de Pago</label>
                <div className="aut-radio-group">
                  {Object.entries(TIPO_LABELS).map(([k, v]) => (
                    <label key={k} className={`aut-radio-label${form.tipo_pago === k ? ' selected' : ''}`}>
                      <input type="radio" name="tipo_pago" value={k}
                        checked={form.tipo_pago === k}
                        onChange={e => { setF('tipo_pago', e.target.value); clearErr('tipo_pago'); }} />
                      {v}
                    </label>
                  ))}
                </div>
                {formErrors.tipo_pago && <span className="field-error">{formErrors.tipo_pago}</span>}
              </div>

              {/* Beneficiario */}
              <div className="aut-form-group">
                <label>Beneficiario / Proveedor</label>
                <input className={`caja-input${formErrors.beneficiario ? ' input-error' : ''}`}
                  type="text" maxLength={200} placeholder="Nombre del beneficiario"
                  value={form.beneficiario}
                  onChange={e => { setF('beneficiario', e.target.value); clearErr('beneficiario'); }} />
                {formErrors.beneficiario && <span className="field-error">{formErrors.beneficiario}</span>}
              </div>

              {/* Monto + Año + Org + Fondo */}
              <div className="aut-form-row">
                <div className="aut-form-group">
                  <label>Monto (L)</label>
                  <input className={`caja-input${formErrors.monto ? ' input-error' : ''}`}
                    type="number" step="0.01" min="0.01" max={MONTO_MAX} placeholder="0.00"
                    value={form.monto}
                    onChange={e => handleMontoChange(e.target.value)} />
                  {formErrors.monto && <span className="field-error">{formErrors.monto}</span>}
                </div>
                <div className="aut-form-group">
                  <label>Año</label>
                  <input className={`caja-input${formErrors.anio ? ' input-error' : ''}`}
                    type="number" min="2000" max="2100" placeholder="2026"
                    value={form.anio}
                    onChange={e => { setF('anio', e.target.value); clearErr('anio'); }} />
                  {formErrors.anio && <span className="field-error">{formErrors.anio}</span>}
                </div>
                <div className="aut-form-group">
                  <label>Org.</label>
                  <input className="caja-input" type="text" maxLength={20} placeholder="11111"
                    value={form.org} onChange={e => setF('org', e.target.value)} />
                </div>
                <div className="aut-form-group">
                  <label>Fondo</label>
                  <input className="caja-input" type="text" maxLength={20} placeholder="11"
                    value={form.fondo} onChange={e => setF('fondo', e.target.value)} />
                </div>
              </div>

              {/* Monto en letras */}
              <div className="aut-form-group">
                <label>Cantidad en Letras</label>
                <input className={`caja-input${formErrors.monto_letras ? ' input-error' : ''}`}
                  type="text" maxLength={600} placeholder="Se calcula automáticamente al ingresar el monto"
                  value={form.monto_letras}
                  onChange={e => { setF('monto_letras', e.target.value); clearErr('monto_letras'); }} />
                {formErrors.monto_letras && <span className="field-error">{formErrors.monto_letras}</span>}
              </div>

              {/* Detalle */}
              <div className="aut-form-group">
                <label>Detalle / Fundamento (Para lo que se necesita el dinero)</label>
                <textarea className={`caja-input aut-textarea${formErrors.detalle ? ' input-error' : ''}`}
                  maxLength={1000} rows={4} placeholder="Describa el motivo o fundamento del pago"
                  value={form.detalle}
                  onChange={e => { setF('detalle', e.target.value); clearErr('detalle'); }} />
                {formErrors.detalle && <span className="field-error">{formErrors.detalle}</span>}
              </div>

              {formErrors._server && <div className="caja-form-error">{formErrors._server}</div>}

              <div className="caja-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setModalCrear(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Crear Autorización'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ MODAL VER ════════════════════════════════════════════════════════ */}
      {verItem && (
        <div className="modal-overlay" onClick={() => setVerItem(null)}>
          <div className="aut-modal aut-modal-ver" onClick={e => e.stopPropagation()}>
            <div className="aut-modal-header">
              <div className="aut-modal-icon"><FiFileText size={20} color="#274C8D" /></div>
              <div>
                <h3>Autorización No. {String(verItem.numero).padStart(4,'0')}</h3>
                <p>{TIPO_LABELS[verItem.tipo_pago]}</p>
              </div>
              <button className="modal-close-btn" onClick={() => setVerItem(null)}><FiX size={18} /></button>
            </div>
            <div className="aut-ver-body">
              <div className="aut-ver-row">
                <span className="aut-ver-label">Estado</span>
                <span className={`aut-badge ${ESTADO_CFG[verItem.estado]?.cls}`}>{ESTADO_CFG[verItem.estado]?.label}</span>
              </div>
              <div className="aut-ver-row">
                <span className="aut-ver-label">Beneficiario</span>
                <span>{verItem.beneficiario}</span>
              </div>
              <div className="aut-ver-row">
                <span className="aut-ver-label">Monto</span>
                <span><strong>{fmtMonto(verItem.monto)}</strong></span>
              </div>
              <div className="aut-ver-row">
                <span className="aut-ver-label">Cantidad en letras</span>
                <span className="aut-letras">{verItem.monto_letras}</span>
              </div>
              <div className="aut-ver-row">
                <span className="aut-ver-label">Detalle</span>
                <span>{verItem.detalle}</span>
              </div>
              <div className="aut-ver-row">
                <span className="aut-ver-label">Año / Org. / Fondo</span>
                <span>{verItem.anio} / {verItem.org || '—'} / {verItem.fondo || '—'}</span>
              </div>
              <div className="aut-ver-row">
                <span className="aut-ver-label">Creado por</span>
                <span>{verItem.creado_por_nombre}</span>
              </div>
              <div className="aut-ver-row">
                <span className="aut-ver-label">Fecha creación</span>
                <span>{fmtFecha(verItem.fecha_creacion)}</span>
              </div>
              {verItem.estado !== 'PENDIENTE' && (
                <>
                  <div className="aut-ver-row">
                    <span className="aut-ver-label">{verItem.estado === 'AUTORIZADO' ? 'Autorizado por' : 'Rechazado por'}</span>
                    <span>{verItem.autorizado_por_nombre || '—'}</span>
                  </div>
                  <div className="aut-ver-row">
                    <span className="aut-ver-label">Fecha</span>
                    <span>{fmtFecha(verItem.fecha_autorizacion)}</span>
                  </div>
                  {verItem.motivo_rechazo && (
                    <div className="aut-ver-row">
                      <span className="aut-ver-label">Motivo rechazo</span>
                      <span className="aut-motivo-rechazo">{verItem.motivo_rechazo}</span>
                    </div>
                  )}
                </>
              )}
              <div className="caja-modal-actions" style={{ marginTop: '18px' }}>
                <button className="btn-secondary" onClick={() => setVerItem(null)}>Cerrar</button>
                <button className="btn-pdf" onClick={() => generarPDF(verItem)}>
                  <FiDownload size={14} /> Descargar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL AUTORIZAR (FIRMA DIGITAL) ══════════════════════════════════ */}
      {autItem && (
        <div className="modal-overlay" onClick={() => setAutItem(null)}>
          <div className="aut-modal aut-modal-firma" onClick={e => e.stopPropagation()}>
            <div className="aut-modal-header aut-header-firma">
              <div className="aut-modal-icon"><FiLock size={20} color="#059669" /></div>
              <div>
                <h3>Firma Digital</h3>
                <p>Autorización No. {String(autItem.numero).padStart(4,'0')} — {autItem.beneficiario}</p>
              </div>
              <button className="modal-close-btn" onClick={() => setAutItem(null)}><FiX size={18} /></button>
            </div>
            <form onSubmit={handleAutorizar} className="aut-form">
              <div className="aut-firma-info">
                <p>Para autorizar este documento debe ingresar su <strong>contraseña</strong>. Esta acción equivale a una firma digital y quedará registrada en el sistema.</p>
                <div className="aut-firma-resumen">
                  <span>Beneficiario: <strong>{autItem.beneficiario}</strong></span>
                  <span>Monto: <strong>{fmtMonto(autItem.monto)}</strong></span>
                </div>
              </div>
              <div className="aut-form-group">
                <label><FiLock size={12} /> Contraseña de autorización</label>
                <input
                  type="password"
                  className={`caja-input${passErr ? ' input-error' : ''}`}
                  placeholder="Ingrese su contraseña"
                  value={password}
                  autoFocus
                  onChange={e => { setPassword(e.target.value); setPassErr(''); }}
                />
                {passErr && <span className="field-error">{passErr}</span>}
              </div>
              <div className="caja-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setAutItem(null)}>Cancelar</button>
                <button type="submit" className="btn-success" disabled={signing}>
                  <FiCheckCircle size={14} /> {signing ? 'Firmando…' : 'Firmar y Autorizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ MODAL RECHAZAR ═══════════════════════════════════════════════════ */}
      {rechItem && (
        <div className="modal-overlay" onClick={() => setRechItem(null)}>
          <div className="aut-modal aut-modal-firma" onClick={e => e.stopPropagation()}>
            <div className="aut-modal-header" style={{ background: 'linear-gradient(135deg,#fff1f2,#ffe4e6)' }}>
              <div className="aut-modal-icon"><FiXCircle size={20} color="#e11d48" /></div>
              <div><h3>Rechazar Autorización</h3><p>No. {String(rechItem.numero).padStart(4,'0')} — {rechItem.beneficiario}</p></div>
              <button className="modal-close-btn" onClick={() => setRechItem(null)}><FiX size={18} /></button>
            </div>
            <form onSubmit={handleRechazar} className="aut-form">
              <div className="aut-form-group">
                <label>Motivo del rechazo</label>
                <textarea className={`caja-input aut-textarea${motivoErr ? ' input-error' : ''}`}
                  rows={4} maxLength={1000} placeholder="Explique el motivo del rechazo"
                  value={motivo}
                  autoFocus
                  onChange={e => { setMotivo(e.target.value); setMotivoErr(''); }} />
                {motivoErr && <span className="field-error">{motivoErr}</span>}
              </div>
              <div className="caja-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setRechItem(null)}>Cancelar</button>
                <button type="submit" className="btn-danger" disabled={rejecting}>
                  {rejecting ? 'Rechazando…' : 'Confirmar Rechazo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ MODAL CONFIRMAR ELIMINAR ═════════════════════════════════════════ */}
      {delItem && (
        <div className="modal-overlay" onClick={() => setDelItem(null)}>
          <div className="caja-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="caja-confirm-icon"><FiAlertTriangle size={28} color="#f59e0b" /></div>
            <h3>Eliminar Autorización</h3>
            <p>No. {String(delItem.numero).padStart(4,'0')} — {delItem.beneficiario}</p>
            <p style={{ color: '#e11d48', fontSize: '13px' }}>Esta acción no se puede deshacer.</p>
            <div className="caja-modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => setDelItem(null)}>Cancelar</button>
              <button className="btn-danger" onClick={handleEliminar}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
