import { useEffect, useState, useCallback, useContext, useMemo } from 'react';
import {
  FiPlus, FiTrash2, FiEdit2, FiX, FiSearch, FiDownload,
  FiGift, FiCalendar, FiUsers, FiAlertTriangle, FiEye,
  FiFilter, FiRefreshCw, FiBarChart2, FiChevronUp, FiChevronDown, FiTrendingUp,
} from 'react-icons/fi';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './Ayudas.css';

const TIPOS_AYUDA = [
  'Económica',
  'Médica',
  'Alimentaria',
  'Educativa',
  'Material / Especie',
  'Social',
  'Otra',
];

const TIPO_COLOR = {
  'Económica':          { bg: '#dbeafe', color: '#1d4ed8' },
  'Médica':             { bg: '#fee2e2', color: '#991b1b' },
  'Alimentaria':        { bg: '#fef3c7', color: '#92400e' },
  'Educativa':          { bg: '#e0e7ff', color: '#3730a3' },
  'Material / Especie': { bg: '#d1fae5', color: '#065f46' },
  'Social':             { bg: '#ecfdf5', color: '#047857' },
  'Otra':               { bg: '#f3f4f6', color: '#374151' },
};

function today() {
  return new Date().toISOString().split('T')[0];
}

function fmtFecha(fechaStr) {
  const d = new Date(String(fechaStr).split('T')[0] + 'T12:00:00');
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCantidad(num) {
  return 'Lps. ' + new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num ?? 0);
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

const EMPTY_FORM = {
  nombre_completo: '',
  dni: '',
  rtn: '',
  fecha: today(),
  cantidad: '',
  tipo_ayuda: 'Económica',
  nombre_gestor: '',
  observaciones: '',
};

function clientValidate(form) {
  const errors = {};
  const nombre = (form.nombre_completo || '').trim();
  if (!nombre) errors.nombre_completo = 'El nombre completo es requerido.';
  else if (nombre.length < 3) errors.nombre_completo = 'Mínimo 3 caracteres.';
  else if (nombre.length > 200) errors.nombre_completo = 'Máximo 200 caracteres.';

  const dni = (form.dni || '').trim();
  if (!dni) errors.dni = 'El DNI es requerido.';
  else if (dni.length > 20) errors.dni = 'Máximo 20 caracteres.';

  const rtn = (form.rtn || '').trim();
  if (!rtn) errors.rtn = 'El RTN es requerido.';
  else if (rtn.length > 25) errors.rtn = 'Máximo 25 caracteres.';

  if (!form.fecha) {
    errors.fecha = 'La fecha es requerida.';
  } else {
    const d = new Date(form.fecha + 'T12:00:00');
    if (isNaN(d.getTime())) errors.fecha = 'Fecha inválida.';
    else {
      const now = new Date();
      const max = new Date(now); max.setFullYear(now.getFullYear() + 1);
      const min = new Date(now); min.setFullYear(now.getFullYear() - 10);
      if (d > max) errors.fecha = 'No puede estar más de un año en el futuro.';
      else if (d < min) errors.fecha = 'Fecha demasiado antigua (máx. 10 años).';
    }
  }

  const c = parseFloat(form.cantidad);
  if (form.cantidad === '' || form.cantidad === undefined || isNaN(c))
    errors.cantidad = 'La cantidad es requerida.';
  else if (c <= 0) errors.cantidad = 'Debe ser mayor a cero.';
  else if (c > 9_999_999) errors.cantidad = 'Supera el monto máximo.';

  if (!form.tipo_ayuda || !TIPOS_AYUDA.includes(form.tipo_ayuda))
    errors.tipo_ayuda = 'Seleccione un tipo de ayuda válido.';

  const gestor = (form.nombre_gestor || '').trim();
  if (gestor.length > 200) errors.nombre_gestor = 'Máximo 200 caracteres.';

  const obs = (form.observaciones || '').trim();
  if (obs.length > 500) errors.observaciones = 'Máximo 500 caracteres.';

  return errors;
}

function TipoBadge({ tipo }) {
  const c = TIPO_COLOR[tipo] || TIPO_COLOR['Otra'];
  return (
    <span className="badge-tipo" style={{ background: c.bg, color: c.color }}>
      {tipo}
    </span>
  );
}

export default function Ayudas() {
  const { user } = useContext(AuthContext);
  const [ayudas, setAyudas]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState(false);
  const [editing, setEditing]         = useState(null);
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  const [formErrors, setFormErrors]   = useState({});
  const [saving, setSaving]           = useState(false);
  const [confirmDel, setConfirmDel]   = useState(null);
  const [viewing, setViewing]         = useState(null);
  const [toast, setToast]             = useState(null);
  const [busqueda, setBusqueda]       = useState('');
  const [filtroTipo, setFiltroTipo]   = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [page, setPage]               = useState(1);
  const PAGE_SIZE = 25;

  // ── Charts ────────────────────────────────────────────────────────────────
  const [showCharts, setShowCharts]   = useState(false);
  const [chartAnio, setChartAnio]     = useState(new Date().getFullYear());
  const [chartMes, setChartMes]       = useState(null); // null = todos los meses

  const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const MESES_LARGOS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
                        'Septiembre','Octubre','Noviembre','Diciembre'];

  const aniosDisponibles = useMemo(() => {
    const set = new Set(ayudas.map(a => new Date(String(a.fecha).split('T')[0] + 'T12:00:00').getFullYear()));
    const arr = [...set].filter(Boolean).sort((a, b) => b - a);
    if (!arr.length) arr.push(new Date().getFullYear());
    return arr;
  }, [ayudas]);

  const chartData = useMemo(() => {
    if (chartMes === null) {
      return MESES_CORTOS.map((mes, i) => {
        const del_mes = ayudas.filter(a => {
          const d = new Date(String(a.fecha).split('T')[0] + 'T12:00:00');
          return d.getFullYear() === chartAnio && d.getMonth() === i;
        });
        return {
          mes,
          mesLargo: MESES_LARGOS[i],
          Registros: del_mes.length,
          Monto: parseFloat(del_mes.reduce((s, a) => s + parseFloat(a.cantidad || 0), 0).toFixed(2)),
        };
      });
    } else {
      const diasEnMes = new Date(chartAnio, chartMes + 1, 0).getDate();
      return Array.from({ length: diasEnMes }, (_, i) => {
        const dia = i + 1;
        const del_dia = ayudas.filter(a => {
          const d = new Date(String(a.fecha).split('T')[0] + 'T12:00:00');
          return d.getFullYear() === chartAnio && d.getMonth() === chartMes && d.getDate() === dia;
        });
        return {
          mes: String(dia).padStart(2, '0'),
          mesLargo: `${String(dia).padStart(2, '0')} de ${MESES_LARGOS[chartMes]}`,
          Registros: del_dia.length,
          Monto: parseFloat(del_dia.reduce((s, a) => s + parseFloat(a.cantidad || 0), 0).toFixed(2)),
        };
      });
    }
  }, [ayudas, chartAnio, chartMes]);

  const pieData = useMemo(() => {
    const del_anio = ayudas.filter(a => {
      const d = new Date(String(a.fecha).split('T')[0] + 'T12:00:00');
      if (d.getFullYear() !== chartAnio) return false;
      if (chartMes !== null && d.getMonth() !== chartMes) return false;
      return true;
    });
    const totals = {};
    del_anio.forEach(a => { totals[a.tipo_ayuda] = (totals[a.tipo_ayuda] || 0) + 1; });
    const COLORS = {
      'Económica': '#1d4ed8', 'Médica': '#dc2626', 'Alimentaria': '#ca8a04',
      'Educativa': '#4f46e5', 'Material / Especie': '#0891b2',
      'Social': '#16a34a', 'Otra': '#6b7280',
    };
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value, color: COLORS[name] || '#8a99aa' }))
      .sort((a, b) => b.value - a.value);
  }, [ayudas, chartAnio, chartMes]);

  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const fetchAyudas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/ayudas', { headers: authHeaders() });
      setAyudas(res.data);
    } catch {
      showToast('Error al cargar las ayudas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAyudas(); }, [fetchAyudas]);

  // Reset to page 1 whenever any filter changes
  useEffect(() => { setPage(1); }, [busqueda, filtroTipo, filtroDesde, filtroHasta]);

  const filtered = (() => {
    let f = [...ayudas];
    const q = busqueda.trim().toLowerCase();
    if (q) f = f.filter(a =>
      a.nombre_completo.toLowerCase().includes(q) ||
      a.dni.toLowerCase().includes(q) ||
      a.rtn.toLowerCase().includes(q) ||
      (a.tipo_ayuda || '').toLowerCase().includes(q) ||
      (a.nombre_gestor || '').toLowerCase().includes(q) ||
      (a.observaciones || '').toLowerCase().includes(q)
    );
    if (filtroTipo) f = f.filter(a => a.tipo_ayuda === filtroTipo);
    if (filtroDesde) {
      const desde = new Date(filtroDesde + 'T00:00:00');
      f = f.filter(a => new Date(String(a.fecha).split('T')[0] + 'T12:00:00') >= desde);
    }
    if (filtroHasta) {
      const hasta = new Date(filtroHasta + 'T23:59:59');
      f = f.filter(a => new Date(String(a.fecha).split('T')[0] + 'T12:00:00') <= hasta);
    }
    return f;
  })();

  const totalPages    = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated     = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const montoTotal    = ayudas.reduce((acc, a) => acc + parseFloat(a.cantidad || 0), 0);
  const montoFiltrado = filtered.reduce((acc, a) => acc + parseFloat(a.cantidad || 0), 0);
  const hayFiltros    = busqueda || filtroTipo || filtroDesde || filtroHasta;
  const limpiarFiltros = () => { setBusqueda(''); setFiltroTipo(''); setFiltroDesde(''); setFiltroHasta(''); setPage(1); };

  const openNew = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setFormErrors({}); setModal(true); };
  const openEdit = (a) => {
    setEditing(a.id);
    setForm({ nombre_completo: a.nombre_completo, dni: a.dni, rtn: a.rtn,
      fecha: String(a.fecha).split('T')[0], cantidad: String(a.cantidad),
      tipo_ayuda: a.tipo_ayuda, nombre_gestor: a.nombre_gestor || '',
      observaciones: a.observaciones || '' });
    setFormErrors({}); setModal(true);
  };
  const closeModal = () => { setModal(false); setEditing(null); };
  const handleField = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setFormErrors(prev => ({ ...prev, [name]: undefined }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const errors = clientValidate(form);
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setSaving(true);
    try {
      const payload = { nombre_completo: form.nombre_completo.trim(), dni: form.dni.trim(),
        rtn: form.rtn.trim(), fecha: form.fecha, cantidad: parseFloat(form.cantidad),
        tipo_ayuda: form.tipo_ayuda, nombre_gestor: form.nombre_gestor.trim() || null,
        observaciones: form.observaciones.trim() || null };
      if (editing) {
        await api.put(`/ayudas/${editing}`, payload, { headers: authHeaders() });
        showToast('Ayuda actualizada correctamente.', 'ok');
      } else {
        await api.post('/ayudas', payload, { headers: authHeaders() });
        showToast('Ayuda registrada correctamente.', 'ok');
      }
      closeModal(); fetchAyudas();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al guardar.', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      await api.delete(`/ayudas/${confirmDel.id}`, { headers: authHeaders() });
      showToast('Ayuda eliminada correctamente.', 'ok');
      setConfirmDel(null); fetchAyudas();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al eliminar.', 'error');
      setConfirmDel(null);
    }
  };

  const exportPDF = async () => {
    // ── Load logo (same as CajaChica / Autorizaciones) ──────────────────────
    let logoDataUrl = null;
    try {
      const resp = await fetch('/logo-congreso.png.png');
      if (resp.ok) {
        const blob    = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        logoDataUrl   = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            try {
              const MAX = 200;
              const w = img.naturalWidth || img.width;
              const h = img.naturalHeight || img.height;
              const scale  = Math.min(MAX / w, MAX / h, 1);
              const canvas = document.createElement('canvas');
              canvas.width  = Math.round(w * scale);
              canvas.height = Math.round(h * scale);
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(blobUrl);
              resolve(canvas.toDataURL('image/jpeg', 0.95));
            } catch { URL.revokeObjectURL(blobUrl); resolve(null); }
          };
          img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null); };
          img.src = blobUrl;
        });
      }
    } catch { /* sin logo */ }

    const sa = s => (s || '').replace(/[ÁÉÍÓÚÑáéíóúñ]/g,
      c => ({ Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U',Ñ:'N',
               á:'a',é:'e',í:'i',ó:'o',ú:'u',ñ:'n' }[c] || c));

    const fmtPDF = num => 'Lps. ' + new Intl.NumberFormat('es-HN', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(num ?? 0);

    const now      = new Date();
    const fechaGen = now.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaGen  = now.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const genPor   = sa((user?.nombre || 'Sistema').toUpperCase());

    const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const PW   = doc.internal.pageSize.getWidth();   // 279.4 mm
    const PH   = doc.internal.pageSize.getHeight();  // 215.9 mm
    const L    = 10;
    const CW   = PW - L - 10;
    const AZUL   = [39, 76, 141];
    const NEGRO  = [20, 20, 20];
    const BLANCO = [255, 255, 255];
    const GBKG   = [237, 241, 250];

    // ── Borde exterior ──────────────────────────────────────────────────────
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(1.2);
    doc.rect(L - 4, 5, CW + 8, PH - 10, 'S');

    let y = 10;

    // ════ ENCABEZADO  [LOGO | INSTITUCIÓN | INFO] ═══════════════════════════
    const LOGO_W = 50;
    const INFO_W = 62;
    const CENT_W = CW - LOGO_W - INFO_W;
    const HDR_H  = 42;

    doc.setFillColor(...BLANCO);
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.5);
    doc.rect(L, y, CW, HDR_H, 'FD');

    if (logoDataUrl) {
      const lSize = HDR_H - 6;
      doc.addImage(logoDataUrl, 'JPEG', L + (LOGO_W - lSize) / 2, y + 3, lSize, lSize);
    }

    doc.setDrawColor(180, 200, 235); doc.setLineWidth(0.3);
    doc.line(L + LOGO_W, y + 4, L + LOGO_W, y + HDR_H - 4);

    const instCX = L + LOGO_W + CENT_W / 2;
    doc.setTextColor(...AZUL);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('REPUBLICA DE HONDURAS', instCX, y + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('CONGRESO NACIONAL', instCX, y + 18, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('PAGADURIA ESPECIAL', instCX, y + 28, { align: 'center' });

    doc.setDrawColor(180, 200, 235); doc.setLineWidth(0.3);
    doc.line(L + LOGO_W + CENT_W, y + 4, L + LOGO_W + CENT_W, y + HDR_H - 4);

    // Panel derecho: nro. registros + fecha + generado por
    const infoX   = L + LOGO_W + CENT_W;
    const infoMid = infoX + INFO_W / 2;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
    doc.setTextColor(100, 120, 160);
    doc.text('REGISTROS', infoMid, y + 7, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.setTextColor(...AZUL);
    doc.text(String(filtered.length), infoMid, y + 15, { align: 'center' });

    doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.2);
    doc.line(infoX + 3, y + 17, infoX + INFO_W - 3, y + 17);

    const col1 = infoX + 4;
    const col2 = infoX + INFO_W / 2 + 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(100, 120, 160);
    doc.text('GENERADO', col1, y + 22);
    doc.text('HORA',     col2, y + 22);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NEGRO);
    doc.text(fechaGen, col1, y + 27.5);
    doc.text(horaGen,  col2, y + 27.5);

    doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.2);
    doc.line(infoX + 3, y + 30, infoX + INFO_W - 3, y + 30);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(100, 120, 160);
    doc.text('GENERADO POR', infoMid, y + 34.5, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...AZUL);
    doc.text(genPor, infoMid, y + 40, { align: 'center' });

    // ════ BARRA DE TÍTULO ═══════════════════════════════════════════════════
    y += HDR_H;
    const TBAR_H = 11;
    doc.setFillColor(...AZUL); doc.setDrawColor(...AZUL); doc.setLineWidth(0);
    doc.rect(L, y, CW, TBAR_H, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...BLANCO);
    doc.text('REGISTRO DE AYUDAS', L + CW / 2, y + 7.5, { align: 'center' });

    // ════ TARJETAS RESUMEN ═══════════════════════════════════════════════════
    y += TBAR_H + 5;
    const cardH = 18;
    const cardW = (CW - 8) / 3;
    const cardsData = [
      { label: 'TOTAL REGISTROS', value: String(filtered.length)       },
      { label: 'MONTO TOTAL',     value: fmtPDF(montoTotal)             },
      { label: 'MONTO FILTRADO',  value: fmtPDF(montoFiltrado)          },
    ];
    cardsData.forEach((card, i) => {
      const cx = L + i * (cardW + 4);
      doc.setFillColor(...GBKG); doc.setDrawColor(200, 210, 228); doc.setLineWidth(0.3);
      doc.rect(cx, y, cardW, cardH, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(100, 120, 160);
      doc.text(card.label, cx + cardW / 2, y + 6, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...AZUL);
      doc.text(card.value, cx + cardW / 2, y + 13.5, { align: 'center' });
    });

    // ════ TABLA ═════════════════════════════════════════════════════════════
    autoTable(doc, {
      startY: y + cardH + 4,
      head: [['#', 'Nombre del Beneficiario', 'DNI', 'RTN', 'Fecha', 'Cantidad', 'Tipo', 'Gestor', 'Observaciones']],
      body: filtered.map((a, i) => [
        i + 1,
        sa(a.nombre_completo),
        a.dni,
        a.rtn,
        fmtFecha(a.fecha),
        fmtPDF(a.cantidad),
        sa(a.tipo_ayuda),
        sa(a.nombre_gestor || ''),
        sa(a.observaciones || ''),
      ]),
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 },
        textColor: NEGRO,
        lineColor: [210, 220, 235],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: AZUL, textColor: BLANCO, fontStyle: 'bold', fontSize: 8,
        cellPadding: { top: 4, bottom: 4, left: 2.5, right: 2.5 },
        lineColor: AZUL, lineWidth: 0.2,
      },
      alternateRowStyles: { fillColor: GBKG },
      columnStyles: {
        0: { cellWidth: 10,    halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 26 },
        3: { cellWidth: 28 },
        4: { cellWidth: 20,    halign: 'center' },
        5: { cellWidth: 28,    halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 25 },
        7: { cellWidth: 30 },
        8: { cellWidth: 35 },
      },
      margin: { left: L, right: PW - L - CW },
    });

    // ════ PIE DE PÁGINA ══════════════════════════════════════════════════════
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      const FH = 9;
      const FY = PH - 5 - FH;
      doc.setFillColor(...AZUL);
      doc.rect(L - 4, FY, CW + 8, FH, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...BLANCO);
      doc.text('Congreso Nacional - Pagaduria Especial', L - 1, FY + 5.8);
      doc.text('Pagina ' + p + ' de ' + pageCount, L + CW / 2, FY + 5.8, { align: 'center' });
      doc.text('Generado: ' + fechaGen + ' ' + horaGen, L + CW + 1, FY + 5.8, { align: 'right' });
    }

    doc.save('ayudas.pdf');
  };

  return (
    <div className="page-shell">
      <Navbar />

      {toast && <div className={`ay-toast ay-toast--${toast.type}`}>{toast.msg}</div>}

      <div className="page-content">

        {/* Page header */}
        <div className="ay-page-header">
          <div className="ay-page-header__left">
            <div className="ay-page-icon"><FiGift size={22} /></div>
            <div>
              <h1 className="ay-page-title">Ayudas</h1>
              <p className="ay-page-sub">Registro y control de ayudas otorgadas</p>
            </div>
          </div>
          <div className="ay-page-header__right">
            <button className="ay-btn ay-btn--ghost" onClick={fetchAyudas} title="Actualizar">
              <FiRefreshCw size={15} />
            </button>
            <button className="ay-btn ay-btn--outline" onClick={exportPDF}>
              <FiDownload size={15} /> Exportar PDF
            </button>
            <button className="ay-btn ay-btn--primary" onClick={openNew}>
              <FiPlus size={16} /> Nueva Ayuda
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="ay-stats">
          <div className="ay-stat">
            <div className="ay-stat__icon ay-stat__icon--purple"><FiGift size={20} /></div>
            <div className="ay-stat__body">
              <span className="ay-stat__label">Total Registros</span>
              <span className="ay-stat__value">{ayudas.length}</span>
            </div>
          </div>
          <div className="ay-stat">
            <div className="ay-stat__icon ay-stat__icon--green"><span style={{ fontWeight: 800, fontSize: '.78rem', letterSpacing: '-.01em' }}>Lps.</span></div>
            <div className="ay-stat__body">
              <span className="ay-stat__label">Monto Total</span>
              <span className="ay-stat__value ay-stat__value--green">{fmtCantidad(montoTotal)}</span>
            </div>
          </div>
          <div className="ay-stat">
            <div className="ay-stat__icon ay-stat__icon--blue"><FiUsers size={20} /></div>
            <div className="ay-stat__body">
              <span className="ay-stat__label">Beneficiarios</span>
              <span className="ay-stat__value">{ayudas.length}</span>
            </div>
          </div>
          <div className="ay-stat">
            <div className="ay-stat__icon ay-stat__icon--amber"><FiCalendar size={20} /></div>
            <div className="ay-stat__body">
              <span className="ay-stat__label">Monto Filtrado</span>
              <span className="ay-stat__value ay-stat__value--amber">{fmtCantidad(montoFiltrado)}</span>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="ay-toolbar">
          <div className="ay-toolbar__search">
            <FiSearch size={14} className="ay-toolbar__search-icon" />
            <input type="text" className="ay-toolbar__input"
              placeholder="Buscar por nombre, DNI o RTN..."
              value={busqueda} onChange={e => { setBusqueda(e.target.value); setPage(1); }} />
          </div>
          <div className="ay-toolbar__filters">
            <div className="ay-filter-group">
              <FiFilter size={13} className="ay-filter-icon" />
              <select className="ay-toolbar__select" value={filtroTipo}
                onChange={e => { setFiltroTipo(e.target.value); setPage(1); }}>
                <option value="">Todos los tipos</option>
                {TIPOS_AYUDA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <label className="ay-date-label">Desde
              <input type="date" className="ay-toolbar__date" value={filtroDesde}
                onChange={e => { setFiltroDesde(e.target.value); setPage(1); }} />
            </label>
            <label className="ay-date-label">Hasta
              <input type="date" className="ay-toolbar__date" value={filtroHasta}
                onChange={e => { setFiltroHasta(e.target.value); setPage(1); }} />
            </label>
            {hayFiltros && (
              <button className="ay-btn ay-btn--ghost ay-btn--sm" onClick={limpiarFiltros}>
                <FiX size={13} /> Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="ay-card">
          {loading ? (
            <div className="ay-state">
              <div className="ay-spinner" />
              <p>Cargando registros...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="ay-state">
              <FiGift size={40} className="ay-state__icon" />
              <p className="ay-state__title">Sin resultados</p>
              <p className="ay-state__sub">{hayFiltros ? 'No hay registros que coincidan.' : 'Aún no hay ayudas registradas.'}</p>
              {hayFiltros && <button className="ay-btn ay-btn--outline ay-btn--sm" onClick={limpiarFiltros}>Limpiar filtros</button>}
            </div>
          ) : (
            <>
              <div className="ay-table-info">
                Mostrando <strong>{paginated.length}</strong> de <strong>{filtered.length}</strong> registros
              </div>
              <div className="ay-table-wrap">
                <table className="ay-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Nombre del Beneficiario</th>
                      <th>DNI</th>
                      <th>Fecha</th>
                      <th>Cantidad</th>
                      <th>Tipo</th>
                      <th>Observaciones</th>
                      <th style={{ width: 110 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((a, i) => (
                      <tr key={a.id}>
                        <td className="ay-td--num">{(page - 1) * PAGE_SIZE + i + 1}</td>
                        <td className="ay-td--name">{a.nombre_completo}</td>
                        <td className="ay-td--mono">{a.dni}</td>
                        <td className="ay-td--fecha">{fmtFecha(a.fecha)}</td>
                        <td className="ay-td--monto">{fmtCantidad(a.cantidad)}</td>
                        <td><TipoBadge tipo={a.tipo_ayuda} /></td>
                        <td className="ay-td--obs">
                          {a.observaciones
                            ? <span title={a.observaciones}>{a.observaciones.length > 50 ? a.observaciones.slice(0, 50) + '' : a.observaciones}</span>
                            : <span className="ay-td--empty"></span>}
                        </td>
                        <td>
                          <div className="ay-actions">
                            <button className="ay-action-btn ay-action-btn--view" onClick={() => setViewing(a)} title="Ver detalle"><FiEye size={14} /></button>
                            <button className="ay-action-btn ay-action-btn--edit" onClick={() => openEdit(a)} title="Editar"><FiEdit2 size={14} /></button>
                            <button className="ay-action-btn ay-action-btn--del" onClick={() => setConfirmDel(a)} title="Eliminar"><FiTrash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="ay-pagination">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}> Anterior</button>
            <div className="ay-pagination__pages">
              {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                const p = Math.min(Math.max(page - 2, 1) + idx, totalPages);
                return <button key={p} className={p === page ? 'active' : ''} onClick={() => setPage(p)}>{p}</button>;
              })}
            </div>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Siguiente </button>
          </div>
        )}

        {/* ── Estadísticas (solo ADMIN / SUPER_ADMIN) ──────────────────── */}
        {['ADMIN', 'SUPER_ADMIN'].includes(user?.rol) && <div className="ay-analytics-card">
          <div className="ay-analytics-header" onClick={() => setShowCharts(v => !v)}>
            <div className="ay-analytics-title">
              <FiBarChart2 size={18} />
              <span>Estadísticas por período</span>
            </div>
            <div className="ay-analytics-header-right">
              {showCharts && (
                <>
                  <select
                    className="ay-year-select"
                    value={chartAnio}
                    onClick={e => e.stopPropagation()}
                    onChange={e => { setChartAnio(parseInt(e.target.value)); setChartMes(null); }}
                  >
                    {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <select
                    className="ay-year-select"
                    value={chartMes === null ? '' : chartMes}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setChartMes(e.target.value === '' ? null : parseInt(e.target.value))}
                  >
                    <option value="">Todos los meses</option>
                    {MESES_LARGOS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                </>
              )}
              <span className="ay-analytics-toggle">
                {showCharts ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
              </span>
            </div>
          </div>

          {showCharts && (
            <div className="ay-charts-body">

              {/* Gráfico 1 — Barras: registros por mes */}
              <div className="ay-chart-panel">
                <div className="ay-chart-panel-header">
                  <FiBarChart2 size={14} />
                  <span>Ayudas otorgadas {chartMes === null ? `por mes — ${chartAnio}` : `por día — ${MESES_LARGOS[chartMes]} ${chartAnio}`}</span>
                </div>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }} barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f4fa" vertical={false} />
                    <XAxis dataKey="mes" axisLine={false} tickLine={false}
                      tick={{ fontSize: 11, fill: '#8a99aa' }} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false}
                      tick={{ fontSize: 11, fill: '#8a99aa' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '10px', border: '1px solid #e8ecf4', fontSize: 12 }}
                      cursor={{ fill: 'rgba(124,58,237,0.05)' }}
                      labelFormatter={label => {
                        const item = chartData.find(d => d.mes === label);
                        return item ? `${item.mesLargo} ${chartAnio}` : label;
                      }}
                      formatter={v => [v, 'Registros']}
                    />
                    <Bar dataKey="Registros" fill="#7c3aed" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfico 2 — Línea: monto por mes */}
              <div className="ay-chart-panel">
                <div className="ay-chart-panel-header">
                  <FiTrendingUp size={14} />
                  <span>Monto total entregado {chartMes === null ? `por mes — ${chartAnio}` : `por día — ${MESES_LARGOS[chartMes]} ${chartAnio}`}</span>
                </div>
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f4fa" vertical={false} />
                    <XAxis dataKey="mes" axisLine={false} tickLine={false}
                      tick={{ fontSize: 11, fill: '#8a99aa' }} />
                    <YAxis axisLine={false} tickLine={false}
                      tick={{ fontSize: 10, fill: '#8a99aa' }}
                      tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v} />
                    <Tooltip
                      contentStyle={{ borderRadius: '10px', border: '1px solid #e8ecf4', fontSize: 12 }}
                      cursor={{ stroke: '#7c3aed', strokeWidth: 1, strokeDasharray: '4' }}
                      labelFormatter={label => {
                        const item = chartData.find(d => d.mes === label);
                        return item ? `${item.mesLargo} ${chartAnio}` : label;
                      }}
                      formatter={v => ['Lps. ' + new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(v), 'Monto']}
                    />
                    <Line type="monotone" dataKey="Monto" stroke="#7c3aed" strokeWidth={2.5}
                      dot={{ r: 4, fill: '#7c3aed', stroke: 'white', strokeWidth: 2 }}
                      activeDot={{ r: 7, stroke: '#7c3aed', strokeWidth: 2, fill: 'white' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfico 3 — Pie: distribución por tipo */}
              <div className="ay-chart-panel ay-chart-panel--pie">
                <div className="ay-chart-panel-header">
                  <FiGift size={14} />
                  <span>Distribución por tipo — {chartMes === null ? chartAnio : `${MESES_LARGOS[chartMes]} ${chartAnio}`}</span>
                </div>
                {pieData.length === 0 ? (
                  <div className="ay-chart-empty">Sin datos para {chartMes === null ? chartAnio : `${MESES_LARGOS[chartMes]} ${chartAnio}`}</div>
                ) : (
                  <div className="ay-pie-wrap">
                    <div className="ay-pie-donut-wrap">
                      <ResponsiveContainer width={200} height={200}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%"
                            innerRadius={60} outerRadius={88}
                            paddingAngle={3} dataKey="value"
                            label={false} labelLine={false}>
                            {pieData.map((entry, idx) => (
                              <Cell key={idx} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ borderRadius: '10px', border: '1px solid #e8ecf4', fontSize: 12 }}
                            formatter={(v, name) => [v + ' registros', name]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="ay-pie-center">
                        <span className="ay-pie-center-num">{pieData.reduce((s, d) => s + d.value, 0)}</span>
                        <span className="ay-pie-center-lbl">Total</span>
                      </div>
                    </div>
                    <div className="ay-pie-legend">
                      {pieData.map((d, i) => {
                        const total = pieData.reduce((s, x) => s + x.value, 0);
                        const pct   = total > 0 ? ((d.value / total) * 100).toFixed(0) : 0;
                        return (
                          <div key={i} className="ay-pie-leg-item">
                            <span className="ay-pie-dot" style={{ background: d.color }} />
                            <span className="ay-pie-leg-label">{d.name}</span>
                            <strong className="ay-pie-leg-val">{d.value}</strong>
                            <span className="ay-pie-leg-pct">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>}
      </div>
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="ay-modal" onClick={e => e.stopPropagation()}>
            <div className="ay-modal__header">
              <div className="ay-modal__header-left">
                <div className="ay-modal__header-icon"><FiGift size={18} /></div>
                <div>
                  <h2 className="ay-modal__title">{editing ? 'Editar Ayuda' : 'Nueva Ayuda'}</h2>
                  <p className="ay-modal__sub">{editing ? 'Modifica los datos del registro' : 'Completa los datos del beneficiario'}</p>
                </div>
              </div>
              <button className="ay-modal__close" onClick={closeModal}><FiX size={20} /></button>
            </div>
            <form className="ay-modal__body" onSubmit={handleSave} noValidate>
              <div className="ay-form-section">
                <div className="ay-form-section__title">Datos del Beneficiario</div>
                <div className="ay-form-grid ay-form-grid--1">
                  <div className="ay-field">
                    <label className="ay-field__label">Nombre del Beneficiario <span className="req">*</span></label>
                    <input type="text" name="nombre_completo" value={form.nombre_completo} onChange={handleField}
                      placeholder="Ej. Juan Ramón Pérez López"
                      className={`ay-field__input${formErrors.nombre_completo ? ' ay-field__input--err' : ''}`} />
                    {formErrors.nombre_completo && <span className="ay-field__err">{formErrors.nombre_completo}</span>}
                  </div>
                </div>
                <div className="ay-form-grid ay-form-grid--2">
                  <div className="ay-field">
                    <label className="ay-field__label">DNI <span className="req">*</span></label>
                    <input type="text" name="dni" value={form.dni} onChange={handleField}
                      placeholder="Ej. 0801-1990-00012"
                      className={`ay-field__input${formErrors.dni ? ' ay-field__input--err' : ''}`} />
                    {formErrors.dni && <span className="ay-field__err">{formErrors.dni}</span>}
                  </div>
                  <div className="ay-field">
                    <label className="ay-field__label">RTN <span className="req">*</span></label>
                    <input type="text" name="rtn" value={form.rtn} onChange={handleField}
                      placeholder="Ej. 08011990000123"
                      className={`ay-field__input${formErrors.rtn ? ' ay-field__input--err' : ''}`} />
                    {formErrors.rtn && <span className="ay-field__err">{formErrors.rtn}</span>}
                  </div>
                </div>
              </div>
              <div className="ay-form-section">
                <div className="ay-form-section__title">Datos de la Ayuda</div>
                <div className="ay-form-grid ay-form-grid--2">
                  <div className="ay-field">
                    <label className="ay-field__label">Fecha <span className="req">*</span></label>
                    <input type="date" name="fecha" value={form.fecha} onChange={handleField}
                      className={`ay-field__input${formErrors.fecha ? ' ay-field__input--err' : ''}`} />
                    {formErrors.fecha && <span className="ay-field__err">{formErrors.fecha}</span>}
                  </div>
                  <div className="ay-field">
                    <label className="ay-field__label">Cantidad (Lps.) <span className="req">*</span></label>
                    <input type="number" name="cantidad" value={form.cantidad} onChange={handleField}
                      min="0.01" step="0.01" placeholder="0.00"
                      className={`ay-field__input${formErrors.cantidad ? ' ay-field__input--err' : ''}`} />
                    {formErrors.cantidad && <span className="ay-field__err">{formErrors.cantidad}</span>}
                  </div>
                </div>
                <div className="ay-form-grid ay-form-grid--1">
                  <div className="ay-field">
                    <label className="ay-field__label">Tipo de Ayuda <span className="req">*</span></label>
                    <select name="tipo_ayuda" value={form.tipo_ayuda} onChange={handleField}
                      className={`ay-field__input ay-field__select${formErrors.tipo_ayuda ? ' ay-field__input--err' : ''}`}>
                      {TIPOS_AYUDA.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {formErrors.tipo_ayuda && <span className="ay-field__err">{formErrors.tipo_ayuda}</span>}
                  </div>
                </div>
                <div className="ay-form-grid ay-form-grid--1">
                  <div className="ay-field">
                    <label className="ay-field__label">Nombre del Gestor de la Ayuda <span className="optional">(opcional)</span></label>
                    <input type="text" name="nombre_gestor" value={form.nombre_gestor} onChange={handleField}
                      placeholder="Ej. María López"
                      className={`ay-field__input${formErrors.nombre_gestor ? ' ay-field__input--err' : ''}`} />
                    {formErrors.nombre_gestor && <span className="ay-field__err">{formErrors.nombre_gestor}</span>}
                  </div>
                </div>
                <div className="ay-form-grid ay-form-grid--1">
                  <div className="ay-field">
                    <label className="ay-field__label">Observaciones <span className="optional">(opcional)</span></label>
                    <textarea name="observaciones" value={form.observaciones} onChange={handleField}
                      rows={3} maxLength={500} placeholder="Notas adicionales sobre esta ayuda..."
                      className="ay-field__input ay-field__textarea" />
                    <span className="ay-field__counter">{form.observaciones.length}/500</span>
                  </div>
                </div>
              </div>
              <div className="ay-modal__footer">
                <button type="button" className="ay-btn ay-btn--outline" onClick={closeModal} disabled={saving}>Cancelar</button>
                <button type="submit" className="ay-btn ay-btn--primary" disabled={saving}>
                  {saving ? <><div className="ay-btn-spinner" /> Guardando...</>
                    : editing ? <><FiEdit2 size={14} /> Actualizar</> : <><FiPlus size={14} /> Registrar</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Ver detalle */}
      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="ay-modal ay-modal--view" onClick={e => e.stopPropagation()}>
            <div className="ay-modal__header">
              <div className="ay-modal__header-left">
                <div className="ay-modal__header-icon ay-modal__header-icon--view"><FiEye size={18} /></div>
                <div>
                  <h2 className="ay-modal__title">Detalle de Ayuda</h2>
                  <p className="ay-modal__sub">Información completa del registro</p>
                </div>
              </div>
              <button className="ay-modal__close" onClick={() => setViewing(null)}><FiX size={20} /></button>
            </div>
            <div className="ay-view">
              <div className="ay-view__section">
                <div className="ay-view__section-title">Beneficiario</div>
                <div className="ay-view__grid ay-view__grid--1">
                  <div className="ay-view__item">
                    <span className="ay-view__label">Nombre del Beneficiario</span>
                    <span className="ay-view__value ay-view__value--lg">{viewing.nombre_completo}</span>
                  </div>
                </div>
                <div className="ay-view__grid ay-view__grid--2">
                  <div className="ay-view__item">
                    <span className="ay-view__label">DNI</span>
                    <span className="ay-view__value ay-view__value--mono">{viewing.dni}</span>
                  </div>
                  <div className="ay-view__item">
                    <span className="ay-view__label">RTN</span>
                    <span className="ay-view__value ay-view__value--mono">{viewing.rtn}</span>
                  </div>
                </div>
              </div>
              <div className="ay-view__section">
                <div className="ay-view__section-title">Ayuda Otorgada</div>
                <div className="ay-view__grid ay-view__grid--2">
                  <div className="ay-view__item">
                    <span className="ay-view__label">Fecha</span>
                    <span className="ay-view__value">{fmtFecha(viewing.fecha)}</span>
                  </div>
                  <div className="ay-view__item">
                    <span className="ay-view__label">Cantidad</span>
                    <span className="ay-view__value ay-view__value--monto">{fmtCantidad(viewing.cantidad)}</span>
                  </div>
                </div>
                <div className="ay-view__grid ay-view__grid--2">
                  <div className="ay-view__item">
                    <span className="ay-view__label">Tipo de Ayuda</span>
                    <TipoBadge tipo={viewing.tipo_ayuda} />
                  </div>
                  <div className="ay-view__item">
                    <span className="ay-view__label">Gestor de la Ayuda</span>
                    <span className="ay-view__value">{viewing.nombre_gestor || '—'}</span>
                  </div>
                </div>
                {viewing.registrado_por && (
                  <div className="ay-view__grid ay-view__grid--1">
                    <div className="ay-view__item">
                      <span className="ay-view__label">Registrado por</span>
                      <span className="ay-view__value">{viewing.registrado_por}</span>
                    </div>
                  </div>
                )}
                <div className="ay-view__grid ay-view__grid--1">
                  <div className="ay-view__item">
                    <span className="ay-view__label">Observaciones</span>
                    <span className="ay-view__value ay-view__value--obs">{viewing.observaciones || ''}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="ay-modal__footer">
              <button className="ay-btn ay-btn--outline" onClick={() => setViewing(null)}>Cerrar</button>
              <button className="ay-btn ay-btn--primary" onClick={() => { setViewing(null); openEdit(viewing); }}>
                <FiEdit2 size={14} /> Editar registro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar eliminar */}
      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="ay-confirm" onClick={e => e.stopPropagation()}>
            <div className="ay-confirm__icon"><FiAlertTriangle size={28} /></div>
            <h3 className="ay-confirm__title">¿Eliminar ayuda?</h3>
            <p className="ay-confirm__text">Se eliminará el registro de <strong>{confirmDel.nombre_completo}</strong>. Esta acción es permanente y no se puede deshacer.</p>
            <div className="ay-confirm__btns">
              <button className="ay-btn ay-btn--outline" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="ay-btn ay-btn--danger" onClick={handleDelete}><FiTrash2 size={14} /> Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
