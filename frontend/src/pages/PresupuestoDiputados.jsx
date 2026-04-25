import { useEffect, useState, useContext, useRef, useMemo } from 'react';
import {
  FiSearch, FiX, FiPlus, FiEdit2, FiTrash2,
  FiUser, FiAlertCircle, FiMapPin, FiCreditCard, FiFlag, FiUsers,
  FiChevronDown, FiChevronUp, FiBarChart2, FiDownload,
  FiArrowUp, FiArrowDown, FiCheckSquare,
} from 'react-icons/fi';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './PresupuestoDiputados.css';

const CURRENT_YEAR     = new Date().getFullYear();
const YEARS            = Array.from({ length: 8 }, (_, i) => 2030 - i);
const RESUMEN_PAGE_SIZE = 10;
const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES_LARGOS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
                      'Septiembre','Octubre','Noviembre','Diciembre'];

function formatHNL(v) {
  return `L ${(+(v || 0)).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

const EMPTY_PRES  = { monto_asignado: '', observaciones: '' };
const EMPTY_AYUDA = {
  fecha: new Date().toISOString().slice(0, 10),
  concepto: '', beneficiario: '', monto: '', observaciones: '',
  estado_liquidacion: 'sin_liquidar',
};

const LIQUIDACION_META = {
  sin_liquidar: { label: 'Sin liquidar',   cls: 'sinliq'  },
  en_proceso:   { label: 'En proceso',     cls: 'proceso' },
  liquido:      { label: 'Líquido',         cls: 'liquido' },
  plazo_vencido:{ label: 'Plazo vencido',  cls: 'vencido' },
};

function estadoLiquidacion(ayuda) {
  if (ayuda.estado_liquidacion === 'sin_liquidar') {
    const fecha = new Date(ayuda.fecha + 'T12:00:00');
    const limite = new Date(fecha);
    limite.setDate(limite.getDate() + 30);
    if (new Date() > limite) return 'plazo_vencido';
  }
  return ayuda.estado_liquidacion || 'sin_liquidar';
}

export default function PresupuestoDiputados() {
  const { user: me } = useContext(AuthContext);
  const canEdit = me?.rol === 'SUPER_ADMIN' || me?.rol === 'ADMIN';

  /* ── deputies list ─────────────────────────────────────── */
  const [datos, setDatos]         = useState([]);
  const [loadingDips, setLoadingDips] = useState(true);

  /* ── search ────────────────────────────────────────────── */
  const [dipSearch, setDipSearch]     = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedDip, setSelectedDip] = useState(null);
  const searchRef = useRef(null);

  /* ── year ──────────────────────────────────────────────── */
  const [anio, setAnio] = useState(CURRENT_YEAR);

  /* ── budget data ───────────────────────────────────────── */
  const [presupuesto, setPresupuesto] = useState(null);
  const [ayudas, setAyudas]           = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  /* ── modals ────────────────────────────────────────────── */
  const [modal, setModal]     = useState(null); // 'asignar'|'editPres'|'ayuda'|'editAyuda'
  const [presForm, setPresForm]   = useState(EMPTY_PRES);
  const [ayudaForm, setAyudaForm] = useState(EMPTY_AYUDA);
  const [editingAyuda, setEditingAyuda] = useState(null);
  const [formErr, setFormErr]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [confirm, setConfirm]     = useState(null); // ayuda to delete

  /* ── liquidar modal ─────────────────────────────────────── */
  const [liqModal,  setLiqModal]  = useState(null);
  const [liqForm,   setLiqForm]   = useState({ estado_liquidacion: 'sin_liquidar', fecha_liquidacion: '' });
  const [liqErr,    setLiqErr]    = useState('');
  const [liqSaving, setLiqSaving] = useState(false);

  /* ── table sort ─────────────────────────────────────────── */
  const [sortField, setSortField] = useState('fecha');
  const [sortDir,   setSortDir]   = useState('desc');

  /* ── resumen global ─────────────────────────────────────── */
  const [showResumen, setShowResumen] = useState(false);
  const [resumen, setResumen]         = useState([]);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [resumenPage, setResumenPage] = useState(1);

  /* ── ui ────────────────────────────────────────────────── */
  const [toast, setToast]             = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  /* ── load all deputies once ────────────────────────────── */
  useEffect(() => {
    api.get('/diputados', { headers: authHeaders() })
      .then(r => setDatos(r.data))
      .catch(() => {})
      .finally(() => setLoadingDips(false));
  }, []);

  /* ── close dropdown on outside click ───────────────────── */
  useEffect(() => {
    const handler = e => {
      if (searchRef.current && !searchRef.current.contains(e.target))
        setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── filtered dropdown ──────────────────────────────────── */
  const dipResults = useMemo(() => {
    if (!dipSearch.trim()) return [];
    const q = dipSearch.toLowerCase();
    return datos
      .filter(d => d.activo && (
        d.nombre.toLowerCase().includes(q) ||
        d.departamento.toLowerCase().includes(q) ||
        (d.partido || '').toLowerCase().includes(q)
      ))
      .slice(0, 12);
  }, [datos, dipSearch]);

  /* ── load budget when deputy/year changes ───────────────── */
  useEffect(() => {
    if (!selectedDip) return;
    loadBudget();
  }, [selectedDip, anio]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadBudget = async () => {
    setLoadingData(true);
    setPresupuesto(null);
    setAyudas([]);
    try {
      const r = await api.get(
        `/presupuesto/diputado/${selectedDip.id}?anio=${anio}`,
        { headers: authHeaders() }
      );
      setPresupuesto(r.data.presupuesto);
      setAyudas(r.data.ayudas);
    } catch {
      showToast('Error al cargar el presupuesto.');
    } finally {
      setLoadingData(false);
    }
  };

  const selectDip = d => {
    setSelectedDip(d);
    setDipSearch('');
    setShowDropdown(false);
    setShowAnalytics(false);
  };

  const clearSelection = () => {
    setSelectedDip(null);
    setPresupuesto(null);
    setAyudas([]);
    setShowAnalytics(false);
  };

  /* ── monthly chart data ─────────────────────────────────── */
  const chartData = useMemo(() =>
    MESES_CORTOS.map((mes, i) => {
      const monthItems = ayudas.filter(a => {
        const fechaStr = typeof a.fecha === 'string' ? a.fecha.slice(0, 10) : a.fecha;
        return parseInt(fechaStr.slice(5, 7), 10) - 1 === i;
      });
      return {
        mes,
        mesLargo: MESES_LARGOS[i],
        monto:    monthItems.reduce((s, a) => s + a.monto, 0),
        cantidad: monthItems.length,
      };
    }),
  [ayudas]);

  /* ── budget form handlers ───────────────────────────────── */
  const handleAsignarPres = async e => {
    e.preventDefault();
    setFormErr('');
    const monto = parseFloat(presForm.monto_asignado);
    if (!monto || monto <= 0) { setFormErr('El monto debe ser mayor a 0.'); return; }
    setSaving(true);
    try {
      await api.post('/presupuesto', {
        diputado_id:    selectedDip.id,
        anio,
        monto_asignado: monto,
        observaciones:  presForm.observaciones,
      }, { headers: authHeaders() });
      showToast('Presupuesto asignado correctamente.', 'ok');
      setModal(null);
      setPresForm(EMPTY_PRES);
      loadBudget();
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditPres = async e => {
    e.preventDefault();
    setFormErr('');
    const monto = parseFloat(presForm.monto_asignado);
    if (!monto || monto <= 0) { setFormErr('El monto debe ser mayor a 0.'); return; }
    setSaving(true);
    try {
      await api.put(`/presupuesto/${presupuesto.id}`, {
        monto_asignado: monto,
        observaciones:  presForm.observaciones,
      }, { headers: authHeaders() });
      showToast('Presupuesto actualizado correctamente.', 'ok');
      setModal(null);
      setPresForm(EMPTY_PRES);
      loadBudget();
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Error al actualizar.');
    } finally {
      setSaving(false);
    }
  };

  const openEditPres = () => {
    setPresForm({
      monto_asignado: presupuesto.monto_asignado.toString(),
      observaciones:  presupuesto.observaciones || '',
    });
    setFormErr('');
    setModal('editPres');
  };

  /* ── ayuda handlers ─────────────────────────────────────── */
  const handleAyuda = async e => {
    e.preventDefault();
    setFormErr('');
    const monto = parseFloat(ayudaForm.monto);
    if (!ayudaForm.fecha)          { setFormErr('La fecha es requerida.'); return; }
    if (!ayudaForm.concepto.trim()) { setFormErr('El concepto es requerido.'); return; }
    if (!monto || monto <= 0)      { setFormErr('El monto debe ser mayor a 0.'); return; }
    setSaving(true);
    try {
      await api.post(`/presupuesto/${presupuesto.id}/ayudas`, ayudaForm, { headers: authHeaders() });
      showToast('Ayuda social registrada correctamente.', 'ok');
      setModal(null);
      setAyudaForm(EMPTY_AYUDA);
      loadBudget();
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Error al registrar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAyuda = async ayuda => {
    try {
      await api.delete(`/presupuesto/${presupuesto.id}/ayudas/${ayuda.id}`, { headers: authHeaders() });
      setConfirm(null);
      showToast('Ayuda eliminada correctamente.', 'ok');
      loadBudget();
    } catch (err) {
      setConfirm(null);
      showToast(err.response?.data?.message || 'Error al eliminar.');
    }
  };

  /* ── derived ────────────────────────────────────────────── */
  const pct = presupuesto
    ? Math.min(100, (presupuesto.ejecutado / presupuesto.monto_asignado) * 100)
    : 0;
  const pctClass = pct > 90 ? 'danger' : pct > 70 ? 'warn' : '';

  /* ── sorted ayudas ──────────────────────────────────────── */
  const sortedAyudas = useMemo(() => {
    const arr = [...ayudas];
    arr.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (sortField === 'monto') { va = +va; vb = +vb; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [ayudas, sortField, sortDir]);

  const resumenTotalPages = Math.ceil(resumen.length / RESUMEN_PAGE_SIZE);
  const resumenSlice = resumen.slice(
    (resumenPage - 1) * RESUMEN_PAGE_SIZE,
    resumenPage * RESUMEN_PAGE_SIZE
  );

  const toggleSort = field => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  /* ── edit ayuda handler ─────────────────────────────────── */
  const openEditAyuda = a => {
    setEditingAyuda(a);
    setAyudaForm({
      fecha:         a.fecha.slice(0, 10),
      concepto:      a.concepto,
      beneficiario:  a.beneficiario || '',
      monto:         a.monto.toString(),
      observaciones: a.observaciones || '',
    });
    setFormErr('');
    setModal('editAyuda');
  };

  const handleEditAyuda = async e => {
    e.preventDefault();
    setFormErr('');
    const monto = parseFloat(ayudaForm.monto);
    if (!ayudaForm.fecha)           { setFormErr('La fecha es requerida.'); return; }
    if (!ayudaForm.concepto.trim()) { setFormErr('El concepto es requerido.'); return; }
    if (!monto || monto <= 0)       { setFormErr('El monto debe ser mayor a 0.'); return; }
    setSaving(true);
    try {
      await api.put(
        `/presupuesto/${presupuesto.id}/ayudas/${editingAyuda.id}`,
        ayudaForm,
        { headers: authHeaders() }
      );
      showToast('Ayuda actualizada correctamente.', 'ok');
      setModal(null);
      setEditingAyuda(null);
      setAyudaForm(EMPTY_AYUDA);
      loadBudget();
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Error al actualizar.');
    } finally {
      setSaving(false);
    }
  };

  /* ── liquidar handlers ──────────────────────────────────── */
  const openLiqModal = a => {
    setLiqModal(a);
    setLiqForm({
      estado_liquidacion: a.estado_liquidacion || 'sin_liquidar',
      fecha_liquidacion:  a.fecha_liquidacion
        ? new Date(a.fecha_liquidacion).toISOString().slice(0, 10)
        : '',
    });
    setLiqErr('');
  };

  const handleLiquidar = async e => {
    e.preventDefault();
    setLiqErr('');
    if (liqForm.estado_liquidacion === 'liquido' && !liqForm.fecha_liquidacion) {
      setLiqErr('La fecha de liquidación es requerida.');
      return;
    }
    setLiqSaving(true);
    try {
      // Combine selected date with current system time
      let fechaLiqDatetime = null;
      if (liqForm.estado_liquidacion === 'liquido' && liqForm.fecha_liquidacion) {
        const now = new Date();
        const [y, m, d] = liqForm.fecha_liquidacion.split('-').map(Number);
        const combined = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
        fechaLiqDatetime = combined.toISOString();
      }
      await api.patch(
        `/presupuesto/${presupuesto.id}/ayudas/${liqModal.id}/liquidacion`,
        { estado_liquidacion: liqForm.estado_liquidacion, fecha_liquidacion: fechaLiqDatetime },
        { headers: authHeaders() }
      );
      showToast('Estado de liquidación actualizado.', 'ok');
      setLiqModal(null);
      loadBudget();
    } catch (err) {
      setLiqErr(err.response?.data?.message || 'Error al actualizar.');
    } finally {
      setLiqSaving(false);
    }
  };

  /* ── PDF export ─────────────────────────────────────────── */
  const exportPDF = async () => {
    // ── Paleta estándar Congreso Nacional ─────────────────
    const C_AZUL_OSC = [22,  51, 110];
    const C_AZUL     = [39,  76, 141];
    const C_GRIS     = [235, 242, 255];
    const C_NEGRO    = [25,  25,  25];
    const C_BLANCO   = [255, 255, 255];

    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const W   = doc.internal.pageSize.getWidth();   // 215.9 mm
    const BM  = 5;   // margen del borde exterior
    const P   = 5;   // padding interior
    const x0  = BM + P;
    const CW  = W - 2 * (BM + P);
    let   y   = BM + P;

    // ── Logo ───────────────────────────────────────────────
    const logoData = await new Promise(resolve => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = '/logo-congreso.png.png';
    });

    // ── Encabezado estilo Caja Chica: logo | institución | info ──
    const LOGO_W = 50;
    const INFO_W = 62;
    const CENT_W = CW - LOGO_W - INFO_W;
    const HDR_H  = 42;

    doc.setFillColor(...C_BLANCO);
    doc.setDrawColor(...C_AZUL);
    doc.setLineWidth(0.5);
    doc.rect(x0, y, CW, HDR_H, 'FD');

    // Logo (área blanca delimitada)
    if (logoData) {
      const lSize = HDR_H - 6;
      doc.addImage(logoData, 'PNG', x0 + (LOGO_W - lSize) / 2, y + 3, lSize, lSize);
    }

    // Separador logo | institución
    doc.setDrawColor(180, 200, 235);
    doc.setLineWidth(0.3);
    doc.line(x0 + LOGO_W, y + 4, x0 + LOGO_W, y + HDR_H - 4);

    // Textos institución (centro) — jerarquía tipográfica
    const instCX = x0 + LOGO_W + CENT_W / 2;
    doc.setTextColor(...C_AZUL);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('REPÚBLICA DE HONDURAS', instCX, y + 11, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('CONGRESO NACIONAL', instCX, y + 18, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('PAGADURÍA ESPECIAL', instCX, y + 28, { align: 'center' });

    // Separador institución | panel info
    doc.setDrawColor(180, 200, 235);
    doc.setLineWidth(0.3);
    doc.line(x0 + LOGO_W + CENT_W, y + 4, x0 + LOGO_W + CENT_W, y + HDR_H - 4);

    // Panel derecho: AÑO + GENERADO/HORA + GENERADO POR
    const infoX   = x0 + LOGO_W + CENT_W;
    const infoMid = infoX + INFO_W / 2;
    const fechaGen = new Date().toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaGen  = new Date().toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const generadoPor = (me?.nombre || 'Sistema').toUpperCase();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 120, 160);
    doc.text('AÑO', infoMid, y + 7, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...C_AZUL);
    doc.text(String(anio), infoMid, y + 14, { align: 'center' });

    doc.setDrawColor(210, 220, 235);
    doc.setLineWidth(0.2);
    doc.line(infoX + 3, y + 16, infoX + INFO_W - 3, y + 16);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 120, 160);
    doc.text('GENERADO', infoX + 5, y + 21);
    doc.text('HORA', infoX + INFO_W / 2 + 2, y + 21);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(25, 25, 25);
    doc.text(fechaGen, infoX + 5,             y + 26.5);
    doc.text(horaGen,  infoX + INFO_W / 2 + 2, y + 26.5);

    doc.setDrawColor(210, 220, 235);
    doc.setLineWidth(0.2);
    doc.line(infoX + 3, y + 29, infoX + INFO_W - 3, y + 29);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 120, 160);
    doc.text('GENERADO POR', infoMid, y + 33.5, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_AZUL);
    doc.text(generadoPor, infoMid, y + 39, { align: 'center' });

    y += HDR_H;

    // ── Barra título + badge año ───────────────────────────
    const TITLE_H  = 9;
    const BADGE_W  = 24;
    doc.setFillColor(...C_AZUL);
    doc.rect(x0, y, CW, TITLE_H, 'F');
    doc.setTextColor(...C_BLANCO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('REPORTE DE PRESUPUESTO SOCIAL', x0 + 4, y + 6.2);

    // badge blanco "Año / XXXX"
    doc.setFillColor(...C_BLANCO);
    doc.rect(x0 + CW - BADGE_W - 2, y + 1, BADGE_W, TITLE_H - 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C_AZUL_OSC);
    doc.text('Año', x0 + CW - BADGE_W / 2 - 2, y + 3.8, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(anio), x0 + CW - BADGE_W / 2 - 2, y + 7.5, { align: 'center' });
    y += TITLE_H;

    // ── Filas datos del diputado ───────────────────────────
    const LBL_W = 40;
    const ROW_H = 6.2;
    [
      ['DIPUTADO:',    selectedDip.nombre.toUpperCase()],
      ['DEPARTAMENTO:', selectedDip.departamento || '—'],
      ['TIPO:',        selectedDip.tipo === 'PROPIETARIO' ? 'PROPIETARIO' : 'SUPLENTE'],
      ['PARTIDO:',     (selectedDip.partido || '—').toUpperCase()],
      ['IDENTIDAD:',   selectedDip.identidad || '—'],
    ].forEach(([lbl, val]) => {
      // celda etiqueta (fondo azul claro)
      doc.setFillColor(...C_GRIS);
      doc.rect(x0, y, LBL_W, ROW_H, 'F');
      doc.setDrawColor(...C_AZUL);
      doc.setLineWidth(0.3);
      doc.rect(x0, y, LBL_W, ROW_H);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...C_AZUL);
      doc.text(lbl, x0 + 2.5, y + ROW_H * 0.7);
      // celda valor
      doc.setDrawColor(...C_AZUL);
      doc.rect(x0 + LBL_W, y, CW - LBL_W, ROW_H);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...C_NEGRO);
      const shown = doc.splitTextToSize(val, CW - LBL_W - 4)[0] || '';
      doc.text(shown, x0 + LBL_W + 3, y + ROW_H * 0.7);
      y += ROW_H;
    });
    y += 4;

    // ── Resumen presupuesto (4 columnas tipo tabla) ────────
    const NC  = 4;
    const CWC = CW / NC;
    const SHH = 6.5;   // alto encabezado columna
    const SVH = 10;    // alto valor columna
    [
      ['ASIGNADO',    formatHNL(presupuesto.monto_asignado)],
      ['EJECUTADO',   formatHNL(presupuesto.ejecutado)],
      ['DISPONIBLE',  formatHNL(presupuesto.disponible)],
      ['% EJECUTADO', `${pct.toFixed(1)}%`],
    ].forEach(([lbl, val], i) => {
      const bx = x0 + i * CWC;
      doc.setFillColor(...C_AZUL);
      doc.rect(bx, y, CWC, SHH, 'F');
      doc.setTextColor(...C_BLANCO);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(lbl, bx + CWC / 2, y + 4.6, { align: 'center' });
      doc.setFillColor(...C_GRIS);
      doc.rect(bx, y + SHH, CWC, SVH, 'F');
      doc.setDrawColor(...C_AZUL);
      doc.setLineWidth(0.3);
      doc.rect(bx, y, CWC, SHH + SVH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C_AZUL_OSC);
      doc.text(val, bx + CWC / 2, y + SHH + SVH * 0.68, { align: 'center' });
    });
    y += SHH + SVH + 4;

    // ── Banner detalle ─────────────────────────────────────
    doc.setFillColor(...C_AZUL);
    doc.rect(x0, y, CW, 7, 'F');
    doc.setTextColor(...C_BLANCO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('DETALLE DE AYUDAS SOCIALES REGISTRADAS', x0 + 4, y + 4.9);
    y += 7;

    // ── Tabla ayudas ───────────────────────────────────────
    const W0 = 6;    // #
    const W1 = 20;   // Fecha ayuda
    const W3 = 28;   // Beneficiario
    const W4 = 30;   // Estado
    const W5 = 30;   // Registrado por
    const W6 = 28;   // Monto
    const W2 = CW - W0 - W1 - W3 - W4 - W5 - W6; // Concepto (resto)

    const fmtLiqPDF = ts => {
      const d = new Date(ts);
      const pad = n => n.toString().padStart(2, '0');
      return {
        fecha: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
        hora:  d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      };
    };

    // Map rowIndex -> fecha string (solo para filas con estado liquido + fecha)
    const liqFechasMap = new Map();

    autoTable(doc, {
      startY: y,
      head: [['#', 'FECHA', 'CONCEPTO / OBSERVACIONES', 'BENEFICIARIO', 'ESTADO', 'REGISTRADO POR', 'MONTO (L)']],
      body: sortedAyudas.map((a, idx) => {
        const est       = estadoLiquidacion(a);
        const estadoLbl = LIQUIDACION_META[est]?.label || '—';
        if (a.fecha_liquidacion && est === 'liquido') {
          liqFechasMap.set(idx, fmtLiqPDF(a.fecha_liquidacion));
        }
        return [
          String(idx + 1),
          formatFecha(a.fecha),
          a.concepto + (a.observaciones ? `\n${a.observaciones}` : ''),
          a.beneficiario || '—',
          estadoLbl,
          a.creado_por_nombre || '—',
          (+(a.monto || 0)).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ];
      }),
      margin: { left: x0, right: BM + P },
      tableWidth: CW,
      headStyles: {
        fillColor:   C_AZUL,
        textColor:   C_BLANCO,
        fontStyle:   'bold',
        halign:      'center',
        fontSize:    7.5,
        cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
      },
      bodyStyles: {
        fontSize:    7.8,
        textColor:   C_NEGRO,
        lineColor:   [210, 220, 235],
        lineWidth:   0.2,
        cellPadding: { top: 2.8, bottom: 2.8, left: 2.5, right: 2.5 },
        minCellHeight: 16,
      },
      alternateRowStyles: { fillColor: [244, 247, 255] },
      columnStyles: {
        0: { cellWidth: W0, halign: 'center', fontStyle: 'bold', textColor: C_NEGRO },
        1: { cellWidth: W1, halign: 'center' },
        2: { cellWidth: W2 },
        3: { cellWidth: W3 },
        4: { cellWidth: W4, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: W5, fontSize: 7, textColor: C_NEGRO },
        6: { cellWidth: W6, halign: 'right', fontStyle: 'bold', textColor: C_AZUL_OSC },
      },
      didParseCell: ({ row, cell, column }) => {
        if (row.section !== 'body') return;
        if (column.index === 4) {
          const label = cell.raw?.toString() || '';
          if      (label === 'Líquido')       { cell.styles.textColor = [21, 128, 61];  }
          else if (label === 'En proceso')     { cell.styles.textColor = [29,  78, 216]; }
          else if (label === 'Plazo vencido')  { cell.styles.textColor = [185, 28,  28]; }
          else { cell.styles.textColor = C_NEGRO; cell.styles.fontStyle = 'normal'; }
          if (liqFechasMap.has(row.index)) cell.text = [];
        }
        if (column.index === 6) {
          cell.text = ['L ' + cell.text[0]];
        }
      },
      didDrawCell: ({ row, cell, column, doc: d }) => {
        if (row.section !== 'body' || column.index !== 4) return;
        const info = liqFechasMap.get(row.index);
        if (!info) return;
        const bg = row.index % 2 === 0 ? [244, 247, 255] : [255, 255, 255];
        d.setFillColor(...bg);
        d.rect(cell.x + 0.15, cell.y + 0.15, cell.width - 0.3, cell.height - 0.3, 'F');
        const cx  = cell.x + cell.width / 2;
        const mid = cell.y + cell.height / 2;
        // Línea 1: Líquido
        d.setFontSize(7.8);
        d.setFont('helvetica', 'bold');
        d.setTextColor(21, 128, 61);
        d.text('Líquido', cx, mid - 3.5, { align: 'center' });
        // Línea 2: fecha
        d.setFontSize(7.5);
        d.setFont('helvetica', 'normal');
        d.setTextColor(...C_NEGRO);
        d.text(info.fecha, cx, mid + 0.8, { align: 'center' });
        // Línea 3: hora
        d.setFontSize(7.5);
        d.text(info.hora, cx, mid + 4.8, { align: 'center' });
      },
    });
    y = doc.lastAutoTable.finalY + 6;

    // ── Barra TOTAL ────────────────────────────────────────
    const TOTAL_ROW_H = 12;
    if (y + TOTAL_ROW_H + 6 > doc.internal.pageSize.getHeight() - BM - P) {
      doc.addPage(); y = BM + P + 6;
    }

    const LBL_TOT_W = 50;
    const VAL_TOT_W = CW - LBL_TOT_W;
    const LPS_W     = 18;

    // Celda "TOTAL EJECUTADO:"
    doc.setFillColor(...C_AZUL);
    doc.rect(x0, y, LBL_TOT_W, TOTAL_ROW_H, 'F');
    doc.setDrawColor(...C_AZUL);
    doc.setLineWidth(0.4);
    doc.rect(x0, y, LBL_TOT_W, TOTAL_ROW_H);
    doc.setTextColor(...C_BLANCO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('TOTAL EJECUTADO:', x0 + LBL_TOT_W / 2, y + TOTAL_ROW_H * 0.67, { align: 'center' });

    // Badge "L"
    doc.setFillColor(...C_AZUL);
    doc.rect(x0 + LBL_TOT_W, y, LPS_W, TOTAL_ROW_H, 'F');
    doc.setDrawColor(...C_AZUL);
    doc.setLineWidth(0.4);
    doc.rect(x0 + LBL_TOT_W, y, LPS_W, TOTAL_ROW_H);
    doc.setTextColor(...C_BLANCO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('L', x0 + LBL_TOT_W + LPS_W / 2, y + TOTAL_ROW_H * 0.67, { align: 'center' });

    // Celda valor
    doc.setFillColor(252, 253, 255);
    doc.rect(x0 + LBL_TOT_W + LPS_W, y, VAL_TOT_W - LPS_W, TOTAL_ROW_H, 'F');
    doc.setDrawColor(...C_AZUL);
    doc.setLineWidth(0.4);
    doc.rect(x0 + LBL_TOT_W + LPS_W, y, VAL_TOT_W - LPS_W, TOTAL_ROW_H);
    const totalStr = (+(presupuesto.ejecutado || 0))
      .toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...C_AZUL_OSC);
    doc.text(totalStr, x0 + CW - 4, y + TOTAL_ROW_H * 0.67, { align: 'right' });

    y += TOTAL_ROW_H + 14;

    // ── Borde exterior + footer azul en TODAS las páginas ────
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      const PH = doc.internal.pageSize.getHeight();
      // Borde exterior recto
      doc.setDrawColor(...C_AZUL);
      doc.setLineWidth(1.2);
      doc.rect(x0 - P, BM, CW + 2 * P, PH - 2 * BM, 'S');
      // Barra footer azul
      const FH = 9;
      const FY = PH - BM - FH;
      doc.setFillColor(...C_AZUL);
      doc.rect(x0 - P, FY, CW + 2 * P, FH, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...C_BLANCO);
      doc.text('Congreso Nacional - Pagaduría Especial', x0 - P + 3, FY + 5.8);
      doc.text('Página ' + p + ' de ' + pageCount, x0 - P + (CW + 2 * P) / 2, FY + 5.8, { align: 'center' });
      doc.text('Generado: ' + fechaGen + '  ' + horaGen, x0 - P + CW + 2 * P - 3, FY + 5.8, { align: 'right' });
    }

    doc.save(`presupuesto_social_${selectedDip.nombre.replace(/\s+/g, '_')}_${anio}.pdf`);
  };

  /* ── resumen global ─────────────────────────────────────── */
  const loadResumen = async () => {
    setLoadingResumen(true);
    setResumenPage(1);
    try {
      const r = await api.get(`/presupuesto/resumen?anio=${anio}`, { headers: authHeaders() });
      setResumen(r.data);
    } catch {
      showToast('Error al cargar el resumen.');
    } finally {
      setLoadingResumen(false);
    }
  };

  const handleToggleResumen = () => {
    setShowResumen(v => {
      if (!v) loadResumen(); // cargar datos la primera vez que se abre
      return !v;
    });
  };

  const formatFecha = str => {
    const s = typeof str === 'string' ? str.slice(0, 10) : str;
    const [y, m, d] = s.split('-');
    return new Date(+y, +m - 1, +d).toLocaleDateString('es-HN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const formatHora = str => {
    if (!str) return '';
    const d = typeof str === 'string' ? new Date(str) : str;
    return d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  /* ── render ─────────────────────────────────────────────── */
  return (
    <div className="page-shell">
      <Navbar />

      {toast && (
        <div className={`ps-toast ps-toast--${toast.type}`} role="alert">
          <span className="ps-toast-msg">{toast.msg}</span>
          <button className="ps-toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      <div className="page-content" style={{ maxWidth: 1100 }}>

        {/* ── Header ── */}
        <div className="ps-page-header">
          <div>
            <h1>Presupuesto Social</h1>
            <p>Asignación y control de ayudas sociales por diputado</p>
          </div>
          <div className="ps-header-controls">
            <div className="ps-header-year">
              <label htmlFor="ps-year-sel">Año</label>
              <select
                id="ps-year-sel"
                className="ps-year-select"
                value={anio}
                onChange={e => setAnio(+e.target.value)}
              >
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Resumen global ── */}
        {showResumen && (
          <div className="ps-resumen-card">
            <div className="ps-resumen-header">
              <span className="ps-resumen-title">
                <FiBarChart2 size={14} /> Resumen General — {anio}
              </span>
              <button className="ps-resumen-reload" onClick={loadResumen} title="Recargar">↺</button>
            </div>
            {loadingResumen ? (
              <div className="ps-resumen-loading">Cargando resumen…</div>
            ) : resumen.length === 0 ? (
              <div className="ps-resumen-empty">
                No hay diputados registrados en {anio}.
              </div>
            ) : (
              <>
                <div className="ps-resumen-table-wrap">
                  <table className="ps-resumen-table">
                    <thead>
                      <tr>
                        <th>Diputado</th>
                        <th>Departamento</th>
                        <th>Tipo</th>
                        <th className="ps-th-r">Asignado</th>
                        <th className="ps-th-r">Ejecutado</th>
                        <th className="ps-th-r">Disponible</th>
                        <th className="ps-th-r">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumenSlice.map(r => {
                        const p = r.monto_asignado != null
                          ? Math.min(100, (r.ejecutado / r.monto_asignado) * 100) : 0;
                        const cls = p > 90 ? 'danger' : p > 70 ? 'warn' : 'ok';
                        return (
                          <tr
                            key={r.id}
                            className="ps-resumen-row"
                            onClick={() => { selectDip(r); setShowResumen(false); }}
                            title="Ver detalle"
                          >
                            <td className="ps-resumen-nombre">{r.nombre}</td>
                            <td>{r.departamento}</td>
                            <td>
                              <span className={`ps-dip-chip ps-dip-chip--tipo ${r.tipo === 'PROPIETARIO' ? 'prop' : 'sup'}`} style={{ fontSize: 11, padding: '2px 8px' }}>
                                {r.tipo === 'PROPIETARIO' ? 'Prop.' : 'Sup.'}
                              </span>
                            </td>
                            <td className="ps-td-r">{r.monto_asignado != null ? formatHNL(r.monto_asignado) : <span className="ps-no-pres">Sin asignar</span>}</td>
                            <td className="ps-td-r">{formatHNL(r.ejecutado)}</td>
                            <td className="ps-td-r">{r.disponible != null ? formatHNL(r.disponible) : '—'}</td>
                            <td className="ps-td-r">
                              {r.monto_asignado != null ? (
                                <span className={`ps-pct-badge ps-pct--${cls}`}>{p.toFixed(1)}%</span>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {resumenTotalPages > 1 && (
                  <div className="ps-resumen-pagination">
                    <button
                      className="ps-rpag-btn"
                      disabled={resumenPage === 1}
                      onClick={() => setResumenPage(p => p - 1)}
                    >&#8249;</button>
                    <span className="ps-rpag-info">
                      {(resumenPage - 1) * RESUMEN_PAGE_SIZE + 1}–{Math.min(resumenPage * RESUMEN_PAGE_SIZE, resumen.length)} de {resumen.length}
                    </span>
                    <button
                      className="ps-rpag-btn"
                      disabled={resumenPage === resumenTotalPages}
                      onClick={() => setResumenPage(p => p + 1)}
                    >&#8250;</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Search ── */}
        {!selectedDip ? (
          <div className="ps-search-card">
            <div className="ps-search-card-title">
              <FiUser size={17} />
              <span>Seleccionar Diputado</span>
            </div>
            <div className="ps-search-wrap" ref={searchRef}>
              <FiSearch className="ps-search-icon" size={14} />
              <input
                className="ps-search-input"
                placeholder={loadingDips ? 'Cargando diputados…' : 'Buscar por nombre, departamento o partido…'}
                value={dipSearch}
                onChange={e => { setDipSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => dipSearch && setShowDropdown(true)}
                disabled={loadingDips}
              />
              {dipSearch && (
                <button className="ps-search-clear" onClick={() => { setDipSearch(''); setShowDropdown(false); }}>
                  <FiX size={13} />
                </button>
              )}
              {showDropdown && dipSearch && (
                <div className="ps-dropdown">
                  {dipResults.length > 0 ? dipResults.map(d => (
                    <div key={d.id} className="ps-dropdown-item" onClick={() => selectDip(d)}>
                      <div className="ps-dd-nombre">{d.nombre}</div>
                      <div className="ps-dd-meta">
                        {d.departamento}
                        {' · '}
                        {d.tipo === 'PROPIETARIO' ? 'Propietario' : 'Suplente'}
                        {d.partido ? ` · ${d.partido}` : ''}
                      </div>
                      {d.identidad && (
                        <div className="ps-dd-id">
                          <FiCreditCard size={11} /> {d.identidad}
                        </div>
                      )}
                    </div>
                  )) : (
                    <div className="ps-dd-empty">No se encontraron diputados activos.</div>
                  )}
                </div>
              )}
              {!dipSearch && (
                <div className="ps-search-hint">
                  <FiUser size={38} className="ps-search-hint-icon" />
                  <p>Busque un diputado por nombre, departamento o partido para ver su presupuesto</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* ── Selected deputy card ── */}
            <div className="ps-dip-card">
              <div className="ps-dip-info">
                <div className="ps-dip-avatar">
                  <img src="/logo-congreso.png.png" alt="" />
                </div>
                <div className="ps-dip-text">
                  <h2>{selectedDip.nombre}</h2>
                  <div className="ps-dip-chips">
                    <span className="ps-dip-chip">
                      <FiMapPin size={11} />
                      {selectedDip.departamento}
                    </span>
                    <span className={`ps-dip-chip ps-dip-chip--tipo ${selectedDip.tipo === 'PROPIETARIO' ? 'prop' : 'sup'}`}>
                      <FiUsers size={11} />
                      {selectedDip.tipo === 'PROPIETARIO' ? 'Propietario' : 'Suplente'}
                    </span>
                    {selectedDip.partido && (
                      <span className="ps-dip-chip">
                        <FiFlag size={11} />
                        {selectedDip.partido}
                      </span>
                    )}
                    {selectedDip.identidad && (
                      <span className="ps-dip-chip ps-dip-chip--id">
                        <FiCreditCard size={11} />
                        {selectedDip.identidad}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button className="ps-change-btn" onClick={clearSelection}>
                <FiX size={14} /> Cambiar
              </button>
            </div>

            {/* ── Budget panel ── */}
            {loadingData ? (
              <div className="ps-loading">Cargando presupuesto…</div>
            ) : presupuesto ? (
              <div className="ps-budget-card">
                <div className="ps-budget-header">
                  <div className="ps-budget-title">
                    <span className="ps-lps-icon">L.</span>
                    <span>Presupuesto {anio}</span>
                    {presupuesto.observaciones && (
                      <span className="ps-budget-obs">{presupuesto.observaciones}</span>
                    )}
                  </div>
                  {canEdit && (
                    <button className="ps-edit-pres-btn" onClick={openEditPres}>
                      <FiEdit2 size={13} /> Editar presupuesto
                    </button>
                  )}
                </div>

                <div className="ps-budget-stats">
                  <div className="ps-bstat">
                    <span className="ps-bstat-lbl">Asignado</span>
                    <span className="ps-bstat-val ps-bstat--total">
                      {formatHNL(presupuesto.monto_asignado)}
                    </span>
                  </div>
                  <div className="ps-bstat">
                    <span className="ps-bstat-lbl">Ejecutado</span>
                    <span className="ps-bstat-val ps-bstat--exec">
                      {formatHNL(presupuesto.ejecutado)}
                    </span>
                  </div>
                  <div className="ps-bstat">
                    <span className="ps-bstat-lbl">Disponible</span>
                    <span className={`ps-bstat-val ps-bstat--avail ${pctClass ? `ps-bstat--${pctClass}` : ''}`}>
                      {formatHNL(presupuesto.disponible)}
                    </span>
                  </div>
                  <div className="ps-bstat ps-bstat-pct-wrap">
                    <span className="ps-bstat-lbl">% Ejecutado</span>
                    <span className={`ps-bstat-val ps-bstat-pct ${pctClass ? `ps-bstat--${pctClass}` : ''}`}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="ps-progress-track">
                  <div
                    className={`ps-progress-fill ps-fill--${pctClass || 'ok'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="ps-no-budget">
                <FiAlertCircle size={34} className="ps-no-budget-icon" />
                <p>No hay presupuesto asignado para <strong>{anio}</strong>.</p>
                {canEdit && (
                  <button
                    className="ps-btn-primary"
                    onClick={() => { setPresForm(EMPTY_PRES); setFormErr(''); setModal('asignar'); }}
                  >
                    <FiPlus size={15} /> Asignar Presupuesto {anio}
                  </button>
                )}
              </div>
            )}
            {presupuesto && presupuesto.disponible <= 0 && (
              <div className="ps-exhausted-banner">
                <FiAlertCircle size={16} />
                Presupuesto agotado para {anio} — no es posible registrar nuevas ayudas.
              </div>
            )}

            {/* ── Aid records ── */}
            {presupuesto && (
              <>
                <div className="ps-section-header">
                  <h3 className="ps-section-title">Ayudas Sociales Registradas</h3>
                  <div className="ps-section-actions">
                    {ayudas.length > 0 && (
                      <button className="ps-export-btn" onClick={exportPDF}>
                        <FiDownload size={14} /> Exportar PDF
                      </button>
                    )}
                    {canEdit && (
                      <button
                        className="ps-btn-primary"
                        onClick={() => { setAyudaForm(EMPTY_AYUDA); setFormErr(''); setModal('ayuda'); }}
                        disabled={presupuesto.disponible <= 0}
                        title={presupuesto.disponible <= 0 ? 'Presupuesto agotado' : ''}
                      >
                        <FiPlus size={15} /> Registrar Ayuda
                      </button>
                    )}
                  </div>
                </div>

                {ayudas.length === 0 ? (
                  <div className="ps-empty">
                    <FiAlertCircle size={32} className="ps-empty-icon" />
                    <p>No hay ayudas registradas para <strong>{selectedDip.nombre}</strong> en {anio}.</p>
                    {canEdit && presupuesto.disponible > 0 && (
                      <button
                        className="ps-btn-primary"
                        onClick={() => { setAyudaForm(EMPTY_AYUDA); setFormErr(''); setModal('ayuda'); }}
                      >
                        <FiPlus size={14} /> Registrar primera ayuda
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="ps-table-wrap">
                    <table className="ps-table">
                      <thead>
                        <tr>
                          <th className="ps-th-sort" onClick={() => toggleSort('fecha')}>
                            Fecha {sortField === 'fecha' ? (sortDir === 'asc' ? <FiArrowUp size={12}/> : <FiArrowDown size={12}/>) : <span className="ps-sort-idle">↕</span>}
                          </th>
                          <th>Concepto</th>
                          <th>Beneficiario</th>
                          <th>Estado</th>
                          <th className="ps-th-monto ps-th-sort" onClick={() => toggleSort('monto')}>
                            Monto {sortField === 'monto' ? (sortDir === 'asc' ? <FiArrowUp size={12}/> : <FiArrowDown size={12}/>) : <span className="ps-sort-idle">↕</span>}
                          </th>
                          {canEdit && (
                            <th className="ps-th-actions">
                              <span title="Liquidar"><FiCheckSquare size={11}/></span>
                              <span title="Editar"><FiEdit2 size={11}/></span>
                              <span title="Eliminar"><FiTrash2 size={11}/></span>
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedAyudas.map(a => (
                          <tr key={a.id}>
                            <td className="ps-td-fecha">
                              {formatFecha(a.fecha)}
                              {a.created_at && (
                                <div className="ps-td-hora">{formatHora(a.created_at)}</div>
                              )}
                            </td>
                            <td>
                              <div className="ps-td-concepto">{a.concepto}</div>
                              {a.observaciones && (
                                <div className="ps-td-obs">{a.observaciones}</div>
                              )}
                              {a.creado_por_nombre && (
                                <div className="ps-td-registrado">Registrado por: {a.creado_por_nombre}</div>
                              )}
                            </td>
                            <td className="ps-td-benef">{a.beneficiario || '—'}</td>
                            <td>
                              {(() => {
                                const est = estadoLiquidacion(a);
                                const meta = LIQUIDACION_META[est];
                                return (
                                  <>
                                    <span className={`ps-liq-badge ps-liq--${meta.cls}`}>{meta.label}</span>
                                    {a.fecha_liquidacion && (
                                      <div className="ps-td-liq-fecha">
                                        {new Date(a.fecha_liquidacion).toLocaleString('es-HN', {
                                          day: '2-digit', month: 'short', year: 'numeric',
                                          hour: '2-digit', minute: '2-digit', hour12: true,
                                        })}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </td>
                            <td className="ps-td-monto">{formatHNL(a.monto)}</td>
                            {canEdit && (
                              <td className="ps-td-actions">
                                <div className="ps-td-actions-inner">
                                  <button
                                    className="ps-liq-btn"
                                    title="Estado de liquidación"
                                    onClick={() => openLiqModal(a)}
                                  >
                                    <FiCheckSquare size={13} />
                                  </button>
                                  <button
                                    className="ps-edit-btn"
                                    title="Editar"
                                    onClick={() => openEditAyuda(a)}
                                  >
                                    <FiEdit2 size={13} />
                                  </button>
                                  <button
                                    className="ps-del-btn"
                                    title="Eliminar"
                                    onClick={() => setConfirm(a)}
                                  >
                                    <FiTrash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4} className="ps-tfoot-lbl">Total ejecutado</td>
                          <td className="ps-tfoot-total">{formatHNL(presupuesto.ejecutado)}</td>
                          {canEdit && <td />}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* ── Analytics ── */}
                <div className="ps-analytics-card">
                  <button
                    className="ps-analytics-toggle"
                    onClick={() => setShowAnalytics(v => !v)}
                  >
                    <span className="ps-analytics-toggle-title">
                      <FiBarChart2 size={15} /> Análisis de Período {anio}
                    </span>
                    {showAnalytics ? <FiChevronUp size={17} /> : <FiChevronDown size={17} />}
                  </button>

                  {showAnalytics && (
                    <div className="ps-analytics-body">
                      <div className="ps-astats">
                        <div className="ps-astat">
                          <span className="ps-astat-val">{ayudas.length}</span>
                          <span className="ps-astat-lbl">Ayudas registradas</span>
                        </div>
                        <div className="ps-astat">
                          <span className="ps-astat-val">
                            {formatHNL(ayudas.length ? presupuesto.ejecutado / ayudas.length : 0)}
                          </span>
                          <span className="ps-astat-lbl">Monto promedio</span>
                        </div>
                        <div className="ps-astat">
                          <span className="ps-astat-val">
                            {formatHNL(ayudas.length ? Math.max(...ayudas.map(a => a.monto)) : 0)}
                          </span>
                          <span className="ps-astat-lbl">Mayor ayuda</span>
                        </div>
                        <div className="ps-astat">
                          <span className={`ps-astat-val ${pctClass ? `ps-astat--${pctClass}` : ''}`}>
                            {pct.toFixed(1)}%
                          </span>
                          <span className="ps-astat-lbl">Presupuesto ejecutado</span>
                        </div>
                      </div>

                      {chartData.some(d => d.monto > 0) ? (
                        <div className="ps-chart-wrap">
                          <p className="ps-chart-title">Ejecución mensual — {anio}</p>
                          <ResponsiveContainer width="100%" height={230}>
                            <BarChart
                              data={chartData}
                              margin={{ top: 10, right: 24, left: 10, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f4fa" vertical={false} />
                              <XAxis
                                dataKey="mes"
                                tick={{ fontSize: 12, fill: '#8a99aa' }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                tickFormatter={v => v >= 1000 ? `L ${(v / 1000).toFixed(0)}k` : `L ${v}`}
                                tick={{ fontSize: 11, fill: '#8a99aa' }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip
                                formatter={v => [formatHNL(v), 'Monto']}
                                labelFormatter={(_, payload) =>
                                  payload?.length ? `${payload[0].payload.mesLargo} ${anio}` : ''
                                }
                                contentStyle={{
                                  borderRadius: 10,
                                  border: '1px solid #e0e7ff',
                                  fontSize: 13,
                                }}
                              />
                              <Bar
                                dataKey="monto"
                                fill="#274C8D"
                                radius={[5, 5, 0, 0]}
                                name="Monto"
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="ps-chart-empty">
                          Sin movimientos registrados en {anio}.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Assign / Edit Budget Modal ── */}
      {(modal === 'asignar' || modal === 'editPres') && (
        <div className="ps-overlay" onClick={() => setModal(null)}>
          <div className="ps-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-modal-header">
              <h2>{modal === 'asignar' ? `Asignar Presupuesto ${anio}` : `Editar Presupuesto ${anio}`}</h2>
              <button className="ps-modal-close" onClick={() => setModal(null)}>
                <FiX size={18} />
              </button>
            </div>
            <form className="ps-modal-form" onSubmit={modal === 'asignar' ? handleAsignarPres : handleEditPres}>
              <div className="ps-form-group">
                <label>Diputado</label>
                <div className="ps-form-readonly">{selectedDip?.nombre}</div>
              </div>
              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>Año</label>
                  <div className="ps-form-readonly">{anio}</div>
                </div>
                <div className="ps-form-group">
                  <label>Monto Asignado (L) *</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="0.00"
                    value={presForm.monto_asignado}
                    onChange={e => setPresForm({ ...presForm, monto_asignado: e.target.value })}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <div className="ps-form-group">
                <label>Observaciones</label>
                <textarea
                  rows={3}
                  placeholder="Notas opcionales…"
                  value={presForm.observaciones}
                  onChange={e => setPresForm({ ...presForm, observaciones: e.target.value })}
                />
              </div>
              {formErr && <div className="ps-form-error">{formErr}</div>}
              <div className="ps-modal-footer">
                <button type="button" className="ps-btn-secondary" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="ps-btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : modal === 'asignar' ? 'Asignar Presupuesto' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Register Aid Modal ── */}
      {modal === 'ayuda' && (
        <div className="ps-overlay" onClick={() => setModal(null)}>
          <div className="ps-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-modal-header">
              <h2>Registrar Ayuda Social</h2>
              <button className="ps-modal-close" onClick={() => setModal(null)}>
                <FiX size={18} />
              </button>
            </div>
            <form className="ps-modal-form" onSubmit={handleAyuda}>
              {/* Available budget indicator */}
              <div className="ps-avail-badge">
                <span>Disponible:</span>
                <strong>{formatHNL(presupuesto?.disponible || 0)}</strong>
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>Fecha *</label>
                  <input
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={ayudaForm.fecha}
                    onChange={e => setAyudaForm({ ...ayudaForm, fecha: e.target.value })}
                    required
                  />
                </div>
                <div className="ps-form-group">
                  <label>Monto (L) *</label>
                  <input
                    type="number"
                    min="0.01"
                    max="999999999.99"
                    step="0.01"
                    placeholder="0.00"
                    value={ayudaForm.monto}
                    onChange={e => setAyudaForm({ ...ayudaForm, monto: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="ps-form-group">
                <label>Concepto *</label>
                <input
                  type="text"
                  maxLength={300}
                  placeholder="Ej: Materiales de construcción para vivienda"
                  value={ayudaForm.concepto}
                  onChange={e => setAyudaForm({ ...ayudaForm, concepto: e.target.value })}
                  required
                />
              </div>
              <div className="ps-form-group">
                <label>Beneficiario</label>
                <input
                  type="text"
                  maxLength={200}
                  placeholder="Nombre del beneficiario (opcional)"
                  value={ayudaForm.beneficiario}
                  onChange={e => setAyudaForm({ ...ayudaForm, beneficiario: e.target.value })}
                />
              </div>
              <div className="ps-form-group">
                <label>Observaciones</label>
                <textarea
                  rows={2}
                  maxLength={500}
                  placeholder="Notas opcionales…"
                  value={ayudaForm.observaciones}
                  onChange={e => setAyudaForm({ ...ayudaForm, observaciones: e.target.value })}
                />
              </div>
              {formErr && <div className="ps-form-error">{formErr}</div>}
              <div className="ps-modal-footer">
                <button type="button" className="ps-btn-secondary" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="ps-btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Registrar Ayuda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Aid Modal ── */}
      {modal === 'editAyuda' && editingAyuda && (
        <div className="ps-overlay" onClick={() => setModal(null)}>
          <div className="ps-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-modal-header">
              <h2>Editar Ayuda Social</h2>
              <button className="ps-modal-close" onClick={() => setModal(null)}>
                <FiX size={18} />
              </button>
            </div>
            <form className="ps-modal-form" onSubmit={handleEditAyuda}>
              <div className="ps-avail-badge">
                <span>Disponible (sin esta ayuda):</span>
                <strong>{formatHNL((presupuesto?.disponible || 0) + (+editingAyuda.monto || 0))}</strong>
              </div>
              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>Fecha *</label>
                  <input
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={ayudaForm.fecha}
                    onChange={e => setAyudaForm({ ...ayudaForm, fecha: e.target.value })}
                    required
                  />
                </div>
                <div className="ps-form-group">
                  <label>Monto (L) *</label>
                  <input
                    type="number"
                    min="0.01"
                    max="999999999.99"
                    step="0.01"
                    placeholder="0.00"
                    value={ayudaForm.monto}
                    onChange={e => setAyudaForm({ ...ayudaForm, monto: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="ps-form-group">
                <label>Concepto *</label>
                <input
                  type="text"
                  maxLength={300}
                  placeholder="Ej: Materiales de construcción para vivienda"
                  value={ayudaForm.concepto}
                  onChange={e => setAyudaForm({ ...ayudaForm, concepto: e.target.value })}
                  required
                />
              </div>
              <div className="ps-form-group">
                <label>Beneficiario</label>
                <input
                  type="text"
                  maxLength={200}
                  placeholder="Nombre del beneficiario (opcional)"
                  value={ayudaForm.beneficiario}
                  onChange={e => setAyudaForm({ ...ayudaForm, beneficiario: e.target.value })}
                />
              </div>
              <div className="ps-form-group">
                <label>Observaciones</label>
                <textarea
                  rows={2}
                  maxLength={500}
                  placeholder="Notas opcionales…"
                  value={ayudaForm.observaciones}
                  onChange={e => setAyudaForm({ ...ayudaForm, observaciones: e.target.value })}
                />
              </div>
              {formErr && <div className="ps-form-error">{formErr}</div>}
              <div className="ps-modal-footer">
                <button type="button" className="ps-btn-secondary" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="ps-btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Liquidar Modal ── */}
      {liqModal && (() => {
        const fechaMs = new Date(liqModal.fecha + 'T12:00:00').getTime();
        const dias    = Math.floor((Date.now() - fechaMs) / 86400000);
        const limite  = new Date(fechaMs);
        limite.setDate(limite.getDate() + 30);
        const vencido = liqModal.estado_liquidacion === 'sin_liquidar' && Date.now() > limite.getTime();
        return (
          <div className="ps-overlay" onClick={() => setLiqModal(null)}>
            <div className="ps-modal ps-modal-liq" onClick={e => e.stopPropagation()}>
              <div className="ps-modal-header">
                <div className="ps-liq-modal-title">
                  <h2>Gestionar Liquidación</h2>
                  <p className="ps-liq-subtitle">{liqModal.concepto}</p>
                </div>
                <button className="ps-modal-close" onClick={() => setLiqModal(null)}>
                  <FiX size={18} />
                </button>
              </div>

              <form className="ps-modal-form" onSubmit={handleLiquidar}>
                {/* ── Info cards ── */}
                <div className="ps-liq-cards">
                  <div className="ps-liq-card ps-liq-card--blue">
                    <span className="ps-liq-card-lbl">Monto</span>
                    <span className="ps-liq-card-val">{formatHNL(liqModal.monto)}</span>
                  </div>
                  <div className="ps-liq-card">
                    <span className="ps-liq-card-lbl">Beneficiario</span>
                    <span className="ps-liq-card-val">{liqModal.beneficiario || '—'}</span>
                  </div>
                  <div className="ps-liq-card">
                    <span className="ps-liq-card-lbl">Fecha de ayuda</span>
                    <span className="ps-liq-card-val">{formatFecha(liqModal.fecha)}</span>
                  </div>
                  <div className={`ps-liq-card${vencido ? ' ps-liq-card--red' : ''}`}>
                    <span className="ps-liq-card-lbl">Días transcurridos</span>
                    <span className="ps-liq-card-val">
                      {dias} {dias === 1 ? 'día' : 'días'}
                      {vencido && <span className="ps-liq-warn-tag">⚠ Plazo vencido</span>}
                    </span>
                  </div>
                  {liqModal.fecha_liquidacion && (
                    <div className="ps-liq-card ps-liq-card--full ps-liq-card--green">
                      <span className="ps-liq-card-lbl">Liquidado el</span>
                      <span className="ps-liq-card-val">
                        {new Date(liqModal.fecha_liquidacion).toLocaleString('es-HN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', hour12: true,
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {/* ── Estado toggle ── */}
                <div className="ps-form-group">
                  <label>Estado de liquidación</label>
                  <div className="ps-liq-toggle">
                    {[
                      { val: 'sin_liquidar', label: 'Sin liquidar', cls: 'sinliq'  },
                      { val: 'en_proceso',   label: 'En proceso',   cls: 'proceso' },
                      { val: 'liquido',      label: 'Líquido',      cls: 'liquido' },
                    ].map(opt => (
                      <button
                        key={opt.val}
                        type="button"
                        className={`ps-liq-toggle-btn ps-liq-toggle--${opt.cls}${liqForm.estado_liquidacion === opt.val ? ' ps-liq-toggle-active' : ''}`}
                        onClick={() => {
                          const today = new Date().toISOString().slice(0, 10);
                          setLiqForm({
                            ...liqForm,
                            estado_liquidacion: opt.val,
                            fecha_liquidacion: opt.val === 'liquido' ? today : '',
                          });
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Date picker (solo cuando Líquido) ── */}
                {liqForm.estado_liquidacion === 'liquido' && (
                  <div className="ps-form-group">
                    <label>Fecha de liquidación *</label>
                    <input
                      type="date"
                      required
                      max={new Date().toISOString().slice(0, 10)}
                      value={liqForm.fecha_liquidacion}
                      onChange={e => setLiqForm({ ...liqForm, fecha_liquidacion: e.target.value })}
                    />
                  </div>
                )}

                {liqErr && <div className="ps-form-error">{liqErr}</div>}
                <div className="ps-modal-footer">
                  <button type="button" className="ps-btn-secondary" onClick={() => setLiqModal(null)}>
                    Cancelar
                  </button>
                  <button type="submit" className="ps-btn-primary" disabled={liqSaving}>
                    {liqSaving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ── Confirm delete ── */}
      {confirm && (
        <div className="ps-overlay" onClick={() => setConfirm(null)}>
          <div className="ps-modal ps-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="ps-modal-header">
              <h2>Eliminar Ayuda</h2>
              <button className="ps-modal-close" onClick={() => setConfirm(null)}>
                <FiX size={18} />
              </button>
            </div>
            <div className="ps-modal-form">
              <p className="ps-confirm-text">
                ¿Confirma eliminar la ayuda <strong>"{confirm.concepto}"</strong> por{' '}
                <strong>{formatHNL(confirm.monto)}</strong>?
              </p>
              {confirm.estado_liquidacion === 'liquido' && (
                <p className="ps-confirm-note ps-confirm-note--danger">
                  <FiAlertCircle size={13} /> Esta ayuda ya fue <strong>liquidada</strong>. No puede eliminarse; cambie primero el estado de liquidación.
                </p>
              )}
              <p className="ps-confirm-note">
                <FiAlertCircle size={13} /> El monto de <strong>{formatHNL(confirm.monto)}</strong> se devolverá al presupuesto disponible.
              </p>
              <div className="ps-modal-footer">
                <button type="button" className="ps-btn-secondary" onClick={() => setConfirm(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="ps-btn-danger"
                  onClick={() => handleDeleteAyuda(confirm)}
                  disabled={confirm.estado_liquidacion === 'liquido'}
                >
                  <FiTrash2 size={14} /> Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
