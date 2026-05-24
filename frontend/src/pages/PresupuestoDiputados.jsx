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
const YEARS            = [2026, 2027, 2028, 2029, 2030];
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

const EMPTY_PRES  = {
  monto_asignado:    '',
  observaciones:     '',
  tipo_distribucion: 'auto',
  cuota_mensual:     '',
  num_meses:         8,
  mes_inicio:        new Date().getMonth() + 1,
  meses: Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, monto_asignado: '' })),
};
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
  const canEdit = me?.rol === 'SUPER_ADMIN' || me?.rol === 'ADMIN' || me?.rol === 'ASISTENTE';

  /* ── deputies list ─────────────────────────────────────── */
  const [datos, setDatos]         = useState([]);
  const [loadingDips, setLoadingDips] = useState(true);

  /* ── search ────────────────────────────────────────────── */
  const [dipSearch, setDipSearch]     = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedDip, setSelectedDip] = useState(null);
  const searchRef    = useRef(null);
  const exportMenuRef = useRef(null);

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
  const [montoFocused, setMontoFocused] = useState(false);

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
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

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

  /* ── close dropdowns on outside click ──────────────────── */
  useEffect(() => {
    const handler = e => {
      if (searchRef.current && !searchRef.current.contains(e.target))
        setShowDropdown(false);
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target))
        setExportMenuOpen(false);
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

  /* ── monthly quota+execution chart data ─────────────────── */
  const monthlyChartData = useMemo(() => {
    if (!presupuesto?.meses?.length) return null;
    const mesInicio = presupuesto.mes_inicio || 1;
    return presupuesto.meses
      .map((m, i) => ({
        mes:      MESES_CORTOS[i],
        mesLargo: MESES_LARGOS[i],
        cuota:    m.monto_asignado,
        ejecutado: m.ejecutado,
        mesNum:   i + 1,
      }))
      .filter(d => d.cuota > 0 || d.ejecutado > 0);
  }, [presupuesto]);

  /* ── budget form handlers ───────────────────────────────── */
  const distribuirMeses = () => {
    const total = parseFloat(presForm.monto_asignado) || 0;
    if (!total) return;
    const mesInicio = presForm.mes_inicio || (new Date().getMonth() + 1);
    const numMeses  = Math.max(1, 13 - mesInicio);          // meses de mesInicio a Diciembre
    const base      = Math.floor((total / numMeses) * 100) / 100;
    const remainder = +(total - base * (numMeses - 1)).toFixed(2);
    setPresForm(f => ({
      ...f,
      meses: f.meses.map((m, i) => {
        const mesNum = i + 1;
        if (mesNum < mesInicio) return { ...m, monto_asignado: '0' };
        const isLast = mesNum === 12;                         // Dic siempre lleva el residuo
        return { ...m, monto_asignado: (isLast ? remainder : base).toString() };
      }),
    }));
  };

  const computeCuotaMeses = (cuota, numMeses, mesInicio) => {
    const arr = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, monto_asignado: '0' }));
    for (let i = 0; i < numMeses; i++) {
      const mesIdx = (mesInicio - 1 + i) % 12;
      arr[mesIdx].monto_asignado = cuota.toString();
    }
    return arr;
  };

  const handleDistribChange = tipo => {
    if (tipo === 'personalizada') {
      const total     = parseFloat(presForm.monto_asignado) || 0;
      const base      = total > 0 ? Math.floor((total / 12) * 100) / 100 : 0;
      const remainder = total > 0 ? +(total - base * 11).toFixed(2) : 0;
      setPresForm(f => ({
        ...f,
        tipo_distribucion: 'personalizada',
        meses: f.meses.map((m, i) => ({
          ...m,
          monto_asignado: total > 0 ? (i === 11 ? remainder : base).toString() : '',
        })),
      }));
    } else if (tipo === 'cuota') {
      setPresForm(f => ({ ...f, tipo_distribucion: 'cuota' }));
    } else {
      setPresForm(f => ({ ...f, tipo_distribucion: 'auto' }));
    }
  };

  const handleAsignarPres = async e => {
    e.preventDefault();
    setFormErr('');
    let montoFinal, tipoFinal, mesesFinal;
    if (presForm.tipo_distribucion === 'cuota') {
      const cuota = parseFloat(presForm.cuota_mensual);
      const nMes  = parseInt(presForm.num_meses);
      if (!cuota || cuota <= 0)        { setFormErr('La cuota mensual debe ser mayor a 0.'); return; }
      if (!nMes || nMes < 1 || nMes > 12) { setFormErr('El número de meses debe ser entre 1 y 12.'); return; }
      montoFinal = +(cuota * nMes).toFixed(2);
      tipoFinal  = 'personalizada';
      mesesFinal = computeCuotaMeses(cuota, nMes, presForm.mes_inicio);
    } else {
      const monto = parseFloat(presForm.monto_asignado);
      if (!monto || monto <= 0) { setFormErr('El monto debe ser mayor a 0.'); return; }
      montoFinal = monto;
      tipoFinal  = presForm.tipo_distribucion;
      if (presForm.tipo_distribucion === 'personalizada') {
        const suma = presForm.meses.reduce((s, m) => s + parseFloat(m.monto_asignado || 0), 0);
        if (Math.abs(suma - monto) > 0.02) {
          setFormErr(`La suma de los meses (${formatHNL(suma)}) debe ser igual al monto anual (${formatHNL(monto)}).`);
          return;
        }
        mesesFinal = presForm.meses;
      } else {
        // auto: calcular distribución usando mes_inicio
        const mesInicio = presForm.mes_inicio || (new Date().getMonth() + 1);
        const numMeses  = Math.max(1, 13 - mesInicio);
        const base      = Math.floor((monto / numMeses) * 100) / 100;
        const remainder = +(monto - base * (numMeses - 1)).toFixed(2);
        mesesFinal = Array.from({ length: 12 }, (_, i) => {
          const mesNum = i + 1;
          return { mes: mesNum, monto_asignado: mesNum < mesInicio ? '0' : (mesNum === 12 ? remainder.toString() : base.toString()) };
        });
      }
    }
    setSaving(true);
    try {
      await api.post('/presupuesto', {
        diputado_id:       selectedDip.id,
        anio,
        monto_asignado:    montoFinal,
        observaciones:     presForm.observaciones,
        tipo_distribucion: tipoFinal,
        meses:             mesesFinal,
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
    let montoFinal, tipoFinal, mesesFinal;
    if (presForm.tipo_distribucion === 'cuota') {
      const cuota = parseFloat(presForm.cuota_mensual);
      const nMes  = parseInt(presForm.num_meses);
      if (!cuota || cuota <= 0)           { setFormErr('La cuota mensual debe ser mayor a 0.'); return; }
      if (!nMes || nMes < 1 || nMes > 12) { setFormErr('El número de meses debe ser entre 1 y 12.'); return; }
      montoFinal = +(cuota * nMes).toFixed(2);
      tipoFinal  = 'personalizada';
      mesesFinal = computeCuotaMeses(cuota, nMes, presForm.mes_inicio);
    } else {
      const monto = parseFloat(presForm.monto_asignado);
      if (!monto || monto <= 0) { setFormErr('El monto debe ser mayor a 0.'); return; }
      montoFinal = monto;
      tipoFinal  = presForm.tipo_distribucion;
      if (presForm.tipo_distribucion === 'personalizada') {
        const suma = presForm.meses.reduce((s, m) => s + parseFloat(m.monto_asignado || 0), 0);
        if (Math.abs(suma - monto) > 0.02) {
          setFormErr(`La suma de los meses (${formatHNL(suma)}) debe ser igual al monto anual (${formatHNL(monto)}).`);
          return;
        }
        mesesFinal = presForm.meses;
      } else {
        // auto: calcular distribución usando mes_inicio
        const mesInicio = presForm.mes_inicio || (new Date().getMonth() + 1);
        const numMeses  = Math.max(1, 13 - mesInicio);
        const base      = Math.floor((monto / numMeses) * 100) / 100;
        const remainder = +(monto - base * (numMeses - 1)).toFixed(2);
        mesesFinal = Array.from({ length: 12 }, (_, i) => {
          const mesNum = i + 1;
          return { mes: mesNum, monto_asignado: mesNum < mesInicio ? '0' : (mesNum === 12 ? remainder.toString() : base.toString()) };
        });
      }
    }
    setSaving(true);
    try {
      await api.put(`/presupuesto/${presupuesto.id}`, {
        monto_asignado:    montoFinal,
        observaciones:     presForm.observaciones,
        tipo_distribucion: tipoFinal,
        meses:             mesesFinal,
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
      monto_asignado:    presupuesto.monto_asignado.toString(),
      observaciones:     presupuesto.observaciones || '',
      tipo_distribucion: presupuesto.tipo_distribucion || 'auto',
      mes_inicio:        presupuesto.mes_inicio || 1,
      cuota_mensual:     '',
      num_meses:         8,
      meses: presupuesto.meses?.length === 12
        ? presupuesto.meses.map(m => ({ mes: m.mes, monto_asignado: m.monto_asignado.toString() }))
        : EMPTY_PRES.meses,
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

  /* ─── shared PDF helpers ──────────────────────────────────
   *  Returns { doc, x0, CW, BM, P, fechaGen, horaGen, generadoPor }
   *  and draws the full header (logo + institution + info panel
   *  + title bar + diputado rows).
   *  Caller must pass `titleText` for the dark-blue title bar.
   * ─────────────────────────────────────────────────────── */
  const buildPDFBase = async (titleText) => {
    const C_AZUL_OSC = [22,  51, 110];
    const C_AZUL     = [39,  76, 141];
    const C_GRIS     = [235, 242, 255];
    const C_NEGRO    = [25,  25,  25];
    const C_BLANCO   = [255, 255, 255];

    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const W   = doc.internal.pageSize.getWidth();
    const BM  = 5;
    const P   = 5;
    const x0  = BM + P;
    const CW  = W - 2 * (BM + P);
    let   y   = BM + P;

    // Logo
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

    const LOGO_W = 50;
    const INFO_W = 62;
    const CENT_W = CW - LOGO_W - INFO_W;
    const HDR_H  = 42;

    doc.setFillColor(...C_BLANCO);
    doc.setDrawColor(...C_AZUL);
    doc.setLineWidth(0.5);
    doc.rect(x0, y, CW, HDR_H, 'FD');

    if (logoData) {
      const lSize = HDR_H - 6;
      doc.addImage(logoData, 'PNG', x0 + (LOGO_W - lSize) / 2, y + 3, lSize, lSize);
    }

    doc.setDrawColor(180, 200, 235); doc.setLineWidth(0.3);
    doc.line(x0 + LOGO_W, y + 4, x0 + LOGO_W, y + HDR_H - 4);

    const instCX = x0 + LOGO_W + CENT_W / 2;
    doc.setTextColor(...C_AZUL);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('REPÚBLICA DE HONDURAS', instCX, y + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('CONGRESO NACIONAL', instCX, y + 18, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('PAGADURÍA ESPECIAL', instCX, y + 28, { align: 'center' });

    doc.setDrawColor(180, 200, 235); doc.setLineWidth(0.3);
    doc.line(x0 + LOGO_W + CENT_W, y + 4, x0 + LOGO_W + CENT_W, y + HDR_H - 4);

    const infoX   = x0 + LOGO_W + CENT_W;
    const infoMid = infoX + INFO_W / 2;
    const fechaGen = new Date().toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaGen  = new Date().toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const generadoPor = (me?.nombre || 'Sistema').toUpperCase();

    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(100, 120, 160);
    doc.text('AÑO', infoMid, y + 7, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...C_AZUL);
    doc.text(String(anio), infoMid, y + 14, { align: 'center' });
    doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.2);
    doc.line(infoX + 3, y + 16, infoX + INFO_W - 3, y + 16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(100, 120, 160);
    doc.text('GENERADO', infoX + 5, y + 21);
    doc.text('HORA', infoX + INFO_W / 2 + 2, y + 21);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C_NEGRO);
    doc.text(fechaGen, infoX + 5, y + 26.5);
    doc.text(horaGen,  infoX + INFO_W / 2 + 2, y + 26.5);
    doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.2);
    doc.line(infoX + 3, y + 29, infoX + INFO_W - 3, y + 29);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(100, 120, 160);
    doc.text('GENERADO POR', infoMid, y + 33.5, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C_AZUL);
    doc.text(generadoPor, infoMid, y + 39, { align: 'center' });
    y += HDR_H;

    // Title bar
    const TITLE_H  = 9;
    const BADGE_W  = 24;
    doc.setFillColor(...C_AZUL);
    doc.rect(x0, y, CW, TITLE_H, 'F');
    doc.setTextColor(...C_BLANCO);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(titleText, x0 + 4, y + 6.2);
    doc.setFillColor(...C_BLANCO);
    doc.rect(x0 + CW - BADGE_W - 2, y + 1, BADGE_W, TITLE_H - 2, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...C_AZUL_OSC);
    doc.text('Año', x0 + CW - BADGE_W / 2 - 2, y + 3.8, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(String(anio), x0 + CW - BADGE_W / 2 - 2, y + 7.5, { align: 'center' });
    y += TITLE_H;

    // Diputado rows
    const LBL_W = 40;
    const ROW_H = 6.2;
    [
      ['DIPUTADO:',     selectedDip.nombre.toUpperCase()],
      ['DEPARTAMENTO:', selectedDip.departamento || '—'],
      ['TIPO:',         selectedDip.tipo === 'PROPIETARIO' ? 'PROPIETARIO' : 'SUPLENTE'],
      ['PARTIDO:',      (selectedDip.partido || '—').toUpperCase()],
      ['IDENTIDAD:',    selectedDip.identidad || '—'],
    ].forEach(([lbl, val]) => {
      doc.setFillColor(...C_GRIS);
      doc.rect(x0, y, LBL_W, ROW_H, 'F');
      doc.setDrawColor(...C_AZUL); doc.setLineWidth(0.3);
      doc.rect(x0, y, LBL_W, ROW_H);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C_AZUL);
      doc.text(lbl, x0 + 2.5, y + ROW_H * 0.7);
      doc.setDrawColor(...C_AZUL);
      doc.rect(x0 + LBL_W, y, CW - LBL_W, ROW_H);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C_NEGRO);
      const shown = doc.splitTextToSize(val, CW - LBL_W - 4)[0] || '';
      doc.text(shown, x0 + LBL_W + 3, y + ROW_H * 0.7);
      y += ROW_H;
    });
    y += 4;

    return { doc, x0, CW, BM, P, y, fechaGen, horaGen,
             C_AZUL_OSC, C_AZUL, C_GRIS, C_NEGRO, C_BLANCO };
  };

  /* ─── addPageFooters: draws border + footer on every page ─ */
  const addPageFooters = (doc, x0, CW, BM, fechaGen, horaGen, C_AZUL, C_BLANCO) => {
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      const PH = doc.internal.pageSize.getHeight();
      doc.setDrawColor(...C_AZUL); doc.setLineWidth(1.2);
      doc.rect(x0 - 4, 5, CW + 8, PH - 10, 'S');
      const FH = 9;
      const FY = PH - 5 - FH;
      doc.setFillColor(...C_AZUL);
      doc.rect(x0 - 4, FY, CW + 8, FH, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...C_BLANCO);
      doc.text('Congreso Nacional - Pagaduría Especial', x0 - 1, FY + 5.8);
      doc.text('Página ' + p + ' de ' + pageCount, x0 + CW / 2, FY + 5.8, { align: 'center' });
      doc.text('Generado: ' + fechaGen + '  ' + horaGen, x0 + CW + 1, FY + 5.8, { align: 'right' });
    }
  };

  /* ─── exportPDFMensual: monthly report ─────────────────── */
  const exportPDFMensual = async (mesNum) => {
    const mesDatos  = presupuesto.meses.find(m => m.mes === mesNum) || presupuesto.meses[mesNum - 1] || {};
    const cuotaMes  = +(mesDatos.monto_asignado || 0);
    const ejecMes   = +(mesDatos.ejecutado       || 0);
    const saldoMes  = cuotaMes - ejecMes;
    const pctMes    = cuotaMes > 0 ? Math.min(100, (ejecMes / cuotaMes) * 100) : 0;
    const mesNombre = MESES_LARGOS[mesNum - 1];
    const mesStr    = String(mesNum).padStart(2, '0');

    // Only ayudas whose fecha month matches
    const ayudasMes = sortedAyudas.filter(a => {
      const s = typeof a.fecha === 'string' ? a.fecha : String(a.fecha);
      return s.slice(5, 7) === mesStr;
    });

    const base = await buildPDFBase(
      `REPORTE DE EJECUCIÓN MENSUAL — ${mesNombre.toUpperCase()} ${anio}`
    );
    const { doc, x0, CW, BM, P, fechaGen, horaGen,
            C_AZUL_OSC, C_AZUL, C_GRIS, C_NEGRO, C_BLANCO } = base;
    let y = base.y;

    // ── 3-col monthly summary ─────────────────────────────
    const NC3   = 4;
    const CWC3  = CW / NC3;
    const SHH3  = 6.5;
    const SVH3  = 10;
    [
      ['CUOTA DEL MES',  formatHNL(cuotaMes)],
      ['EJECUTADO',      formatHNL(ejecMes)],
      ['SALDO',          formatHNL(saldoMes)],
      ['% AVANCE',       `${pctMes.toFixed(1)}%`],
    ].forEach(([lbl, val], i) => {
      const bx  = x0 + i * CWC3;
      const isSaldo = i === 2;
      const isPct   = i === 3;
      const accentFill = isSaldo && saldoMes < 0
        ? [185, 28, 28]
        : isPct && pctMes >= 100
          ? [185, 28, 28]
          : isPct && pctMes >= 80
            ? [161, 98, 7]
            : C_AZUL;
      doc.setFillColor(...accentFill);
      doc.rect(bx, y, CWC3, SHH3, 'F');
      doc.setTextColor(...C_BLANCO);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
      doc.text(lbl, bx + CWC3 / 2, y + 4.6, { align: 'center' });
      doc.setFillColor(...C_GRIS);
      doc.rect(bx, y + SHH3, CWC3, SVH3, 'F');
      doc.setDrawColor(...C_AZUL); doc.setLineWidth(0.3);
      doc.rect(bx, y, CWC3, SHH3 + SVH3);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C_AZUL_OSC);
      doc.text(val, bx + CWC3 / 2, y + SHH3 + SVH3 * 0.68, { align: 'center' });
    });
    y += SHH3 + SVH3 + 4;

    // ── Progress bar visual ───────────────────────────────
    if (cuotaMes > 0) {
      const PB_H     = 8;
      const PB_Y     = y;
      const fillPct  = pctMes / 100;
      const isOver   = ejecMes > cuotaMes;
      // track
      doc.setFillColor(230, 236, 250);
      doc.setDrawColor(...C_AZUL); doc.setLineWidth(0.3);
      doc.roundedRect(x0, PB_Y, CW, PB_H, 2, 2, 'FD');
      // fill
      const fillW = Math.min(CW, CW * fillPct);
      doc.setFillColor(isOver ? 185 : 39, isOver ? 28 : 76, isOver ? 28 : 141);
      doc.setDrawColor(0, 0, 0, 0);
      doc.roundedRect(x0, PB_Y, fillW, PB_H, 2, 2, 'F');
      // label inside bar
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...C_BLANCO);
      if (fillW > 12) {
        doc.text(`${pctMes.toFixed(0)}%`, x0 + fillW / 2, PB_Y + PB_H * 0.67, { align: 'center' });
      }
      y += PB_H + 8;
    }

    // ── Annual context: mini table 12 months ─────────────
    doc.setFillColor(...C_AZUL);
    doc.rect(x0, y, CW, 7, 'F');
    doc.setTextColor(...C_BLANCO);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('CONTEXTO ANUAL — DISTRIBUCIÓN MENSUAL', x0 + 4, y + 4.9);
    y += 7;

    const ctxActiveMeses = (presupuesto.meses || [])
      .map((m, i) => ({ ...m, idx: i, mesNum: i + 1 }))
      .filter(m => m.monto_asignado > 0 || m.ejecutado > 0);

    autoTable(doc, {
      startY: y,
      head: [['Mes', 'Cuota Asignada', 'Ejecutado', 'Saldo', '% Avance']],
      body: ctxActiveMeses.map(m => {
        const cuota = +(m.monto_asignado || 0);
        const ejec  = +(m.ejecutado       || 0);
        const sal   = cuota - ejec;
        const pctR  = cuota > 0 ? Math.min(100, (ejec / cuota) * 100) : 0;
        return [
          MESES_LARGOS[m.idx],
          cuota.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ejec.toLocaleString ('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          sal.toLocaleString  ('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          `${pctR.toFixed(1)}%`,
        ];
      }),
      margin: { left: x0, right: BM + P },
      tableWidth: CW,
      headStyles: {
        fillColor: C_AZUL, textColor: C_BLANCO,
        fontStyle: 'bold', halign: 'center', fontSize: 7.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
      },
      bodyStyles: {
        fontSize: 8, textColor: C_NEGRO,
        lineColor: [210, 220, 235], lineWidth: 0.2,
        cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 },
      },
      alternateRowStyles: { fillColor: [244, 247, 255] },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'center', fontStyle: 'bold' },
      },
      willDrawCell: ({ row, column, cell }) => {
        if (row.section === 'body' && column.index === 0) {
          const rowMesNum = ctxActiveMeses[row.index]?.mesNum;
          if (rowMesNum === mesNum) {
            cell.styles.fillColor  = [39, 76, 141];
            cell.styles.textColor  = [255, 255, 255];
          }
        }
      },
      didParseCell: ({ row, cell }) => {
        if (row.section !== 'body') return;
        const rowMesNum = ctxActiveMeses[row.index]?.mesNum;
        if (rowMesNum === mesNum) {
          cell.styles.fillColor  = [39, 76, 141];
          cell.styles.textColor  = [255, 255, 255];
          cell.styles.fontStyle  = 'bold';
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;

    // ── Ayudas del mes ────────────────────────────────────
    doc.setFillColor(...C_AZUL);
    doc.rect(x0, y, CW, 7, 'F');
    doc.setTextColor(...C_BLANCO);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text(`AYUDAS SOCIALES — ${mesNombre.toUpperCase()} ${anio}`, x0 + 4, y + 4.9);
    y += 7;

    if (ayudasMes.length === 0) {
      doc.setFillColor(248, 250, 255);
      doc.rect(x0, y, CW, 14, 'F');
      doc.setDrawColor(220, 228, 242); doc.setLineWidth(0.3);
      doc.rect(x0, y, CW, 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(120, 140, 180);
      doc.text(`No se registraron ayudas en ${mesNombre} ${anio}.`, x0 + CW / 2, y + 9, { align: 'center' });
      y += 14;
    } else {
      const fmtLiq2 = ts => {
        const d   = new Date(ts);
        const pad = n => n.toString().padStart(2, '0');
        return {
          fecha: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
          hora:  d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true }),
        };
      };
      const liqMap2 = new Map();
      const W0m = 6, W1m = 20, W3m = 28, W4m = 30, W5m = 25, W6m = 28;
      const W2m = CW - W0m - W1m - W3m - W4m - W5m - W6m;

      autoTable(doc, {
        startY: y,
        head: [['#', 'FECHA', 'CONCEPTO / OBSERVACIONES', 'BENEFICIARIO', 'ESTADO', 'REGISTRADO POR', 'MONTO (L)']],
        body: ayudasMes.map((a, idx) => {
          const est       = estadoLiquidacion(a);
          const estadoLbl = LIQUIDACION_META[est]?.label || '—';
          if (a.fecha_liquidacion && est === 'liquido') liqMap2.set(idx, fmtLiq2(a.fecha_liquidacion));
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
          fillColor: C_AZUL, textColor: C_BLANCO, fontStyle: 'bold',
          halign: 'center', fontSize: 7.5,
          cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
        },
        bodyStyles: {
          fontSize: 7.8, textColor: C_NEGRO,
          lineColor: [210, 220, 235], lineWidth: 0.2,
          cellPadding: { top: 2.8, bottom: 2.8, left: 2.5, right: 2.5 },
          minCellHeight: 16,
        },
        alternateRowStyles: { fillColor: [244, 247, 255] },
        columnStyles: {
          0: { cellWidth: W0m, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: W1m, halign: 'center' },
          2: { cellWidth: W2m },
          3: { cellWidth: W3m },
          4: { cellWidth: W4m, halign: 'center', fontStyle: 'bold' },
          5: { cellWidth: W5m, fontSize: 7 },
          6: { cellWidth: W6m, halign: 'right', fontStyle: 'bold', textColor: C_AZUL_OSC },
        },
        didParseCell: ({ row, cell, column }) => {
          if (row.section !== 'body') return;
          if (column.index === 4) {
            const label = cell.raw?.toString() || '';
            if      (label === 'Líquido')      cell.styles.textColor = [21, 128, 61];
            else if (label === 'En proceso')    cell.styles.textColor = [29,  78, 216];
            else if (label === 'Plazo vencido') cell.styles.textColor = [185, 28,  28];
            if (liqMap2.has(row.index)) cell.text = [];
          }
          if (column.index === 6) cell.text = ['L ' + cell.text[0]];
        },
        didDrawCell: ({ row, cell, column, doc: d }) => {
          if (row.section !== 'body' || column.index !== 4) return;
          const info = liqMap2.get(row.index);
          if (!info) return;
          const bg = row.index % 2 === 0 ? [244, 247, 255] : [255, 255, 255];
          d.setFillColor(...bg); d.rect(cell.x + 0.15, cell.y + 0.15, cell.width - 0.3, cell.height - 0.3, 'F');
          const cx  = cell.x + cell.width / 2;
          const mid = cell.y + cell.height / 2;
          d.setFontSize(7.8); d.setFont('helvetica', 'bold'); d.setTextColor(21, 128, 61);
          d.text('Líquido', cx, mid - 3.5, { align: 'center' });
          d.setFontSize(7.5); d.setFont('helvetica', 'normal'); d.setTextColor(...C_NEGRO);
          d.text(info.fecha, cx, mid + 0.8, { align: 'center' });
          d.text(info.hora,  cx, mid + 4.8, { align: 'center' });
        },
      });
      y = doc.lastAutoTable.finalY + 6;

      // Total row
      const totalMes     = ayudasMes.reduce((s, a) => s + +(a.monto || 0), 0);
      const TOTAL_ROW_H  = 12;
      if (y + TOTAL_ROW_H + 6 > doc.internal.pageSize.getHeight() - BM - P) {
        doc.addPage(); y = BM + P + 6;
      }
      const LBL_TOT_W = 50;
      const LPS_W     = 18;
      const VAL_TOT_W = CW - LBL_TOT_W;
      doc.setFillColor(...C_AZUL);
      doc.rect(x0, y, LBL_TOT_W, TOTAL_ROW_H, 'F');
      doc.setDrawColor(...C_AZUL); doc.setLineWidth(0.4);
      doc.rect(x0, y, LBL_TOT_W, TOTAL_ROW_H);
      doc.setTextColor(...C_BLANCO); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.text('TOTAL EJECUTADO MES:', x0 + LBL_TOT_W / 2, y + TOTAL_ROW_H * 0.67, { align: 'center' });
      doc.setFillColor(...C_AZUL);
      doc.rect(x0 + LBL_TOT_W, y, LPS_W, TOTAL_ROW_H, 'F');
      doc.rect(x0 + LBL_TOT_W, y, LPS_W, TOTAL_ROW_H);
      doc.setTextColor(...C_BLANCO); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('L', x0 + LBL_TOT_W + LPS_W / 2, y + TOTAL_ROW_H * 0.67, { align: 'center' });
      doc.setFillColor(252, 253, 255);
      doc.rect(x0 + LBL_TOT_W + LPS_W, y, VAL_TOT_W - LPS_W, TOTAL_ROW_H, 'F');
      doc.rect(x0 + LBL_TOT_W + LPS_W, y, VAL_TOT_W - LPS_W, TOTAL_ROW_H);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...C_AZUL_OSC);
      doc.text(
        totalMes.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        x0 + CW - 4, y + TOTAL_ROW_H * 0.67, { align: 'right' }
      );
    }

    addPageFooters(doc, x0, CW, BM, fechaGen, horaGen, C_AZUL, C_BLANCO);
    doc.save(`reporte_mensual_${mesNombre}_${anio}_${selectedDip.nombre.replace(/\s+/g, '_')}.pdf`);
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
      ['ANUAL',       formatHNL(presupuesto.monto_asignado)],
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

    // ── Distribución mensual — gráfico overlay profesional ──
    if (presupuesto.meses && presupuesto.meses.length === 12) {
      const CHART_TOTAL_H = 92;
      if (y + 7 + CHART_TOTAL_H + 10 > doc.internal.pageSize.getHeight() - BM - P - 14) {
        doc.addPage(); y = BM + P + 6;
      }

      // Título sección
      doc.setFillColor(...C_AZUL);
      doc.rect(x0, y, CW, 7, 'F');
      doc.setTextColor(...C_BLANCO);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.text('DISTRIBUCIÓN MENSUAL', x0 + 4, y + 4.9);
      y += 7;

      // Fondo
      doc.setFillColor(248, 250, 255);
      doc.setDrawColor(220, 228, 242); doc.setLineWidth(0.3);
      doc.rect(x0, y, CW, CHART_TOTAL_H, 'FD');

      const CPAD_L = 26, CPAD_R = 6, CPAD_T = 10, CPAD_B = 28;
      const chartX = x0 + CPAD_L;
      const chartY = y + CPAD_T;
      const chartW = CW - CPAD_L - CPAD_R;
      const chartH = CHART_TOTAL_H - CPAD_T - CPAD_B;

      // Escala
      const activeMeses = presupuesto.meses
        .map((m, i) => ({ ...m, idx: i }))
        .filter(m => m.monto_asignado > 0 || m.ejecutado > 0);
      const allVals = activeMeses.flatMap(m => [m.monto_asignado, m.ejecutado]);
      const maxVal  = Math.max(...allVals, 1);
      const mag     = Math.pow(10, Math.floor(Math.log10(maxVal)));
      const niceMax = Math.ceil(maxVal / mag) * mag;

      // Grid lines + Y labels
      for (let g = 0; g <= 4; g++) {
        const gY   = chartY + chartH - (g / 4) * chartH;
        const gVal = (g / 4) * niceMax;
        doc.setDrawColor(220, 228, 242); doc.setLineWidth(0.2);
        doc.line(chartX, gY, chartX + chartW, gY);
        const gLabel = gVal >= 1000000
          ? `L ${(gVal / 1000000).toFixed(1)}M`
          : gVal >= 1000
            ? `L ${(gVal / 1000).toFixed(0)}k`
            : `L ${gVal.toFixed(0)}`;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5);
        doc.setTextColor(140, 155, 185);
        doc.text(gLabel, chartX - 2, gY + 1.5, { align: 'right' });
      }
      // Eje X
      doc.setDrawColor(190, 205, 230); doc.setLineWidth(0.5);
      doc.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);

      // Barras overlay
      const activeSlot = chartW / Math.max(activeMeses.length, 1);
      const cuotaBarW  = activeSlot * 0.64;   // ancha, fondo
      const ejecBarW   = activeSlot * 0.44;   // angosta, superpuesta

      activeMeses.forEach((m, pos) => {
        const midX   = chartX + pos * activeSlot + activeSlot / 2;
        const cuotaH = niceMax > 0 ? (m.monto_asignado / niceMax) * chartH : 0;
        const ejecH  = niceMax > 0 ? (m.ejecutado      / niceMax) * chartH : 0;
        const pctM   = m.monto_asignado > 0
          ? Math.min(999, (m.ejecutado / m.monto_asignado) * 100) : 0;

        // ── Barra cuota (fondo, azul claro) ──
        if (cuotaH > 0.3) {
          // sombra sutil
          doc.setFillColor(190, 205, 232);
          doc.rect(midX - cuotaBarW / 2 + 0.8, chartY + chartH - cuotaH + 0.8, cuotaBarW, cuotaH, 'F');
          // barra principal
          doc.setFillColor(200, 218, 248);
          doc.rect(midX - cuotaBarW / 2, chartY + chartH - cuotaH, cuotaBarW, cuotaH, 'F');
          // borde top
          doc.setDrawColor(150, 175, 220); doc.setLineWidth(0.4);
          doc.line(midX - cuotaBarW / 2, chartY + chartH - cuotaH,
                   midX + cuotaBarW / 2, chartY + chartH - cuotaH);
          // label cuota encima
          const cuotaLbl = m.monto_asignado >= 1000000
            ? `L ${(m.monto_asignado / 1000000).toFixed(1)}M`
            : m.monto_asignado >= 1000
              ? `L ${(m.monto_asignado / 1000).toFixed(0)}k`
              : `L ${m.monto_asignado}`;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(4.8);
          doc.setTextColor(100, 130, 175);
          doc.text(cuotaLbl, midX, chartY + chartH - cuotaH - 1.5, { align: 'center' });
        }

        // ── Barra ejecutado (superpuesta, color dinámico) ──
        if (ejecH > 0.3) {
          const ejecColor = pctM >= 100 ? [185, 28, 28]   // rojo: sobrepasado
            : pctM >= 80  ? [21, 128, 61]                  // verde: bien ejecutado
            : [234, 88, 12];                               // naranja: en progreso
          doc.setFillColor(...ejecColor);
          doc.rect(midX - ejecBarW / 2, chartY + chartH - ejecH, ejecBarW, ejecH, 'F');
          // label monto dentro de la barra (si cabe)
          if (ejecH > 9) {
            const ejecLbl = m.ejecutado >= 1000000
              ? `${(m.ejecutado / 1000000).toFixed(1)}M`
              : m.ejecutado >= 1000
                ? `${(m.ejecutado / 1000).toFixed(0)}k`
                : `${m.ejecutado}`;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(4.8);
            doc.setTextColor(255, 255, 255);
            doc.text(ejecLbl, midX, chartY + chartH - ejecH / 2 + 1.5, { align: 'center' });
          }
        }

        // ── Mes + % debajo del eje ──
        const baseY = chartY + chartH;
        // Mes
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
        doc.setTextColor(55, 75, 115);
        doc.text(MESES_CORTOS[m.idx], midX, baseY + 5.5, { align: 'center' });
        // %
        const pctLabel = `${pctM.toFixed(0)}%`;
        const pctColor = pctM >= 100 ? [185, 28, 28]
          : pctM >= 80  ? [21, 128, 61]
          : pctM > 0    ? [180, 90, 20]
          : [170, 180, 200];
        doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5);
        doc.setTextColor(...pctColor);
        doc.text(pctLabel, midX, baseY + 11.5, { align: 'center' });
      });

      // ── Leyenda ──
      const legendY  = y + CHART_TOTAL_H - 7;
      const legendCX = x0 + CW / 2;
      // cuota
      doc.setFillColor(200, 218, 248);
      doc.setDrawColor(150, 175, 220); doc.setLineWidth(0.3);
      doc.rect(legendCX - 42, legendY - 3.5, 7, 3.5, 'FD');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
      doc.setTextColor(60, 80, 110);
      doc.text('Cuota asignada', legendCX - 33, legendY);
      // ejecutado (en progreso)
      doc.setFillColor(234, 88, 12);
      doc.setDrawColor(0, 0, 0, 0);
      doc.rect(legendCX - 2, legendY - 3.5, 7, 3.5, 'F');
      doc.text('Ejecutado', legendCX + 7, legendY);
      // bien ejecutado
      doc.setFillColor(21, 128, 61);
      doc.rect(legendCX + 32, legendY - 3.5, 7, 3.5, 'F');
      doc.text('>= 80%', legendCX + 41, legendY);
      // sobrepasado
      doc.setFillColor(185, 28, 28);
      doc.rect(legendCX + 58, legendY - 3.5, 7, 3.5, 'F');
      doc.text('Sobrepasado', legendCX + 67, legendY);

      y += CHART_TOTAL_H + 8;
    }

    // ── H: Estado de liquidación de ayudas (4 tarjetas) ──────
    const liqItems = [
      { key: 'sin_liquidar',  label: 'SIN LIQUIDAR',  color: [107, 114, 128], monto: 0, count: 0 },
      { key: 'en_proceso',    label: 'EN PROCESO',    color: [29,  78,  216], monto: 0, count: 0 },
      { key: 'plazo_vencido', label: 'PLAZO VENCIDO', color: [185, 28,  28],  monto: 0, count: 0 },
      { key: 'liquido',       label: 'LÍQUIDO',       color: [21,  128, 61],  monto: 0, count: 0 },
    ];
    sortedAyudas.forEach(a => {
      const est  = estadoLiquidacion(a);
      const item = liqItems.find(d => d.key === est);
      if (item) { item.monto += +(a.monto || 0); item.count++; }
    });

    if (y + 7 + 17 > doc.internal.pageSize.getHeight() - BM - P - 14) { doc.addPage(); y = BM + P + 6; }

    doc.setFillColor(...C_AZUL);
    doc.rect(x0, y, CW, 7, 'F');
    doc.setTextColor(...C_BLANCO);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('ESTADO DE LIQUIDACIÓN DE AYUDAS', x0 + 4, y + 4.9);
    y += 7;

    const NC_L = 4; const CWL = CW / NC_L;
    const SHH_L = 6.5; const SVH_L = 11;
    liqItems.forEach(({ label, color, monto, count }, i) => {
      const bx  = x0 + i * CWL;
      // Header coloreado
      doc.setFillColor(...color);
      doc.rect(bx, y, CWL, SHH_L, 'F');
      doc.setTextColor(...C_BLANCO);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
      doc.text(label, bx + CWL / 2, y + 4.6, { align: 'center' });
      // Cuerpo
      doc.setFillColor(248, 250, 255);
      doc.rect(bx, y + SHH_L, CWL, SVH_L, 'F');
      doc.setDrawColor(...color); doc.setLineWidth(0.3);
      doc.rect(bx, y, CWL, SHH_L + SVH_L);
      // Monto
      const amtStr = monto >= 1000000
        ? `L ${(monto / 1000000).toFixed(2)}M`
        : monto >= 1000
          ? `L ${(monto / 1000).toFixed(1)}k`
          : `L ${monto.toFixed(2)}`;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...color);
      doc.text(amtStr, bx + CWL / 2, y + SHH_L + 5.8, { align: 'center' });
      // Conteo
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(100, 120, 150);
      doc.text(
        `${count} ayuda${count !== 1 ? 's' : ''}`,
        bx + CWL / 2, y + SHH_L + SVH_L - 1.5, { align: 'center' }
      );
    });
    y += SHH_L + SVH_L + 6;

    // ── SALTO A PÁGINA 2 — Detalle de ayudas ──────────────
    doc.addPage();
    y = BM + P + 6;

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

    y += TOTAL_ROW_H + 8;

    // ── Borde exterior + footer azul en TODAS las páginas ────
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      const PH = doc.internal.pageSize.getHeight();
      // Borde exterior — mismo que PDF de Autorizaciones
      doc.setDrawColor(...C_AZUL);
      doc.setLineWidth(1.2);
      doc.rect(x0 - 4, 5, CW + 8, PH - 10, 'S');
      // Barra footer azul
      const FH = 9;
      const FY = PH - 5 - FH;
      doc.setFillColor(...C_AZUL);
      doc.rect(x0 - 4, FY, CW + 8, FH, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...C_BLANCO);
      doc.text('Congreso Nacional - Pagaduría Especial', x0 - 1, FY + 5.8);
      doc.text('Página ' + p + ' de ' + pageCount, x0 + CW / 2, FY + 5.8, { align: 'center' });
      doc.text('Generado: ' + fechaGen + '  ' + horaGen, x0 + CW + 1, FY + 5.8, { align: 'right' });
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
                    <span className="ps-bstat-lbl">Asignado anual</span>
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

            {/* ── Monthly distribution chart (horizontal progress bars) ── */}
            {presupuesto?.meses?.some(m => m.monto_asignado > 0) && monthlyChartData?.length > 0 && (
              <div className="ps-monthly-chart-card">
                <div className="ps-monthly-chart-header">
                  <span className="ps-monthly-chart-title">Distribución mensual {anio}</span>
                  <div className="ps-chart-legend">
                    <span className="ps-legend-item">
                      <span className="ps-legend-dot" style={{ background: '#274C8D' }} />
                      Cuota asignada
                    </span>
                    <span className="ps-legend-item">
                      <span className="ps-legend-dot" style={{ background: '#ea580c' }} />
                      Ejecutado
                    </span>
                  </div>
                </div>
                <div className="ps-progbars">
                  {monthlyChartData.map(d => {
                    const pct    = d.cuota > 0 ? Math.min(100, (d.ejecutado / d.cuota) * 100) : 0;
                    const isOver = d.ejecutado > d.cuota && d.cuota > 0;
                    return (
                      <div key={d.mes} className="ps-pb-row">
                        <span className="ps-pb-label">{d.mes}</span>
                        <div className="ps-pb-track">
                          <div
                            className={`ps-pb-fill${isOver ? ' ps-pb-fill--over' : ''}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="ps-pb-right">
                          <span className="ps-pb-cuota">{formatHNL(d.cuota)}</span>
                          {d.ejecutado > 0 && (
                            <span className={`ps-pb-exec${isOver ? ' over' : ''}`}>
                              {formatHNL(d.ejecutado)}
                            </span>
                          )}
                          {d.cuota > 0 && (
                            <span className={`ps-pb-pct${isOver ? ' over' : pct >= 80 ? ' warn' : ''}`}>
                              {pct.toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Aid records ── */}
            {presupuesto && (
              <>
                <div className="ps-section-header">
                  <h3 className="ps-section-title">Ayudas Sociales Registradas</h3>
                  <div className="ps-section-actions">
                    {ayudas.length > 0 && (
                      <div className="ps-export-wrap" ref={exportMenuRef}>
                        <button
                          className="ps-export-btn"
                          onClick={() => setExportMenuOpen(v => !v)}
                        >
                          <FiDownload size={14} /> Exportar PDF
                        </button>
                        {exportMenuOpen && (
                          <div className="ps-export-menu">
                            <button
                              className="ps-export-menu-item"
                              onClick={() => { exportPDF(); setExportMenuOpen(false); }}
                            >
                              📄 Reporte Anual
                            </button>
                            {monthlyChartData?.length > 0 && (
                              <>
                                <div className="ps-export-menu-sep">📅 Reporte por Mes</div>
                                {monthlyChartData.map(d => (
                                  <button
                                    key={d.mesNum}
                                    className="ps-export-menu-item ps-export-menu-item--mes"
                                    onClick={() => { exportPDFMensual(d.mesNum); setExportMenuOpen(false); }}
                                  >
                                    {d.mesLargo}
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </div>
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

                      {(monthlyChartData?.some(d => d.cuota > 0 || d.ejecutado > 0) ||
                        chartData.some(d => d.monto > 0)) ? (
                        <div className="ps-chart-wrap">
                          <p className="ps-chart-title">Cuota vs Ejecución mensual — {anio}</p>
                          <ResponsiveContainer width="100%" height={230}>
                            <BarChart
                              data={monthlyChartData || chartData.map(d => ({ ...d, cuota: 0, ejecutado: d.monto }))}
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
                                formatter={(v, name) => [formatHNL(v), name === 'cuota' ? 'Cuota asignada' : 'Ejecutado']}
                                labelFormatter={(_, payload) =>
                                  payload?.length ? `${payload[0].payload.mesLargo} ${anio}` : ''
                                }
                                contentStyle={{
                                  borderRadius: 10,
                                  border: '1px solid #e0e7ff',
                                  fontSize: 13,
                                }}
                              />
                              <Bar dataKey="cuota"     fill="#274C8D" radius={[4,4,0,0]} name="cuota" />
                              <Bar dataKey="ejecutado" fill="#ea580c" radius={[4,4,0,0]} name="ejecutado" />
                            </BarChart>
                          </ResponsiveContainer>
                          <div className="ps-chart-legend">
                            <span className="ps-legend-item"><span className="ps-legend-dot" style={{ background: '#274C8D' }} />Cuota asignada</span>
                            <span className="ps-legend-item"><span className="ps-legend-dot" style={{ background: '#ea580c' }} />Ejecutado</span>
                          </div>
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
          <div
            className={`ps-modal ${(presForm.tipo_distribucion === 'personalizada' || presForm.tipo_distribucion === 'cuota') ? 'ps-modal-lg' : ''}`}
            onClick={e => e.stopPropagation()}
          >
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
                {presForm.tipo_distribucion !== 'cuota' ? (
                  <div className="ps-form-group">
                    <label>Monto Anual (L) *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="ps-monto-grande"
                      placeholder="0.00"
                      value={
                        montoFocused
                          ? presForm.monto_asignado
                          : presForm.monto_asignado
                            ? Number(presForm.monto_asignado).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : ''
                      }
                      onFocus={() => setMontoFocused(true)}
                      onBlur={() => setMontoFocused(false)}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9.]/g, '');
                        setPresForm({ ...presForm, monto_asignado: raw });
                      }}
                      required
                      autoFocus
                    />
                  </div>
                ) : (
                  <div className="ps-form-group">
                    <label>Total calculado</label>
                    <div className="ps-form-readonly ps-form-total">
                      {presForm.cuota_mensual && presForm.num_meses
                        ? formatHNL(parseFloat(presForm.cuota_mensual || 0) * parseInt(presForm.num_meses || 0))
                        : '—'}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Modo cuota: campos cuota × meses × inicio ── */}
              {presForm.tipo_distribucion === 'cuota' && (
                <div className="ps-form-row ps-form-row-3">
                  <div className="ps-form-group">
                    <label>Cuota mensual (L) *</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      placeholder="0.00"
                      value={presForm.cuota_mensual}
                      onChange={e => setPresForm({ ...presForm, cuota_mensual: e.target.value })}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="ps-form-group">
                    <label>Número de meses *</label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      step="1"
                      value={presForm.num_meses}
                      onChange={e => setPresForm({ ...presForm, num_meses: Math.min(12, Math.max(1, parseInt(e.target.value) || 1)) })}
                    />
                  </div>
                  <div className="ps-form-group">
                    <label>Mes de inicio</label>
                    <select
                      value={presForm.mes_inicio}
                      onChange={e => setPresForm({ ...presForm, mes_inicio: parseInt(e.target.value) })}
                    >
                      {MESES_LARGOS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Preview de meses asignados (modo cuota) */}
              {presForm.tipo_distribucion === 'cuota' && presForm.cuota_mensual && parseInt(presForm.num_meses) > 0 && (
                <div className="ps-cuota-preview">
                  <span className="ps-cuota-preview-lbl">Meses financiados:</span>
                  {Array.from({ length: parseInt(presForm.num_meses) || 0 }, (_, i) => {
                    const mesIdx = (presForm.mes_inicio - 1 + i) % 12;
                    return (
                      <span key={i} className="ps-cuota-mes-chip">{MESES_CORTOS[mesIdx]}</span>
                    );
                  })}
                </div>
              )}

              {/* ── Distribución mensual ── */}
              <div className="ps-form-group">
                <label>Distribución mensual</label>
                <div className="ps-distrib-toggle">
                  <label className={`ps-distrib-opt${presForm.tipo_distribucion === 'auto' ? ' active' : ''}`}>
                    <input
                      type="radio"
                      name="tipo_distribucion"
                      value="auto"
                      checked={presForm.tipo_distribucion === 'auto'}
                      onChange={() => handleDistribChange('auto')}
                    />
                    <span>Automática</span>
                    <small>Anual ÷ 12</small>
                  </label>
                  <label className={`ps-distrib-opt${presForm.tipo_distribucion === 'cuota' ? ' active' : ''}`}>
                    <input
                      type="radio"
                      name="tipo_distribucion"
                      value="cuota"
                      checked={presForm.tipo_distribucion === 'cuota'}
                      onChange={() => handleDistribChange('cuota')}
                    />
                    <span>Por cuota</span>
                    <small>Cuota × meses</small>
                  </label>
                  <label className={`ps-distrib-opt${presForm.tipo_distribucion === 'personalizada' ? ' active' : ''}`}>
                    <input
                      type="radio"
                      name="tipo_distribucion"
                      value="personalizada"
                      checked={presForm.tipo_distribucion === 'personalizada'}
                      onChange={() => handleDistribChange('personalizada')}
                    />
                    <span>Personalizada</span>
                    <small>Por mes</small>
                  </label>
                </div>
                {presForm.tipo_distribucion === 'auto' && (
                  <div className="ps-distrib-info">
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="ps-form-group" style={{ flex: '0 0 auto', minWidth: '150px', marginBottom: 0 }}>
                        <label>Mes de inicio</label>
                        <select
                          value={presForm.mes_inicio}
                          onChange={e => setPresForm(f => ({ ...f, mes_inicio: parseInt(e.target.value) }))}
                        >
                          {MESES_LARGOS.map((n, i) => (
                            <option key={i + 1} value={i + 1}>{n}</option>
                          ))}
                        </select>
                      </div>
                      {presForm.monto_asignado && (
                        <div style={{ paddingBottom: '4px' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Cuota mensual: </span>
                          <strong>{formatHNL(parseFloat(presForm.monto_asignado) / Math.max(1, 13 - presForm.mes_inicio))}</strong>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            {' '}/ mes &nbsp;({Math.max(1, 13 - presForm.mes_inicio)} meses: {MESES_LARGOS[(presForm.mes_inicio || 1) - 1]} – Dic)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Mes a mes (personalizada) ── */}
              {presForm.tipo_distribucion === 'personalizada' && (() => {
                const total = parseFloat(presForm.monto_asignado) || 0;
                const suma  = presForm.meses.reduce((s, m) => s + parseFloat(m.monto_asignado || 0), 0);
                const diff  = +(suma - total).toFixed(2);
                const ok    = Math.abs(diff) <= 0.02;
                return (
                  <div className="ps-form-group">
                    <div className="ps-meses-header">
                      <label>Distribución por mes</label>
                      <button
                        type="button"
                        className="ps-btn-distrib"
                        onClick={distribuirMeses}
                        disabled={!presForm.monto_asignado}
                      >
                        Distribuir equitativamente
                      </button>
                    </div>
                    <div className="ps-meses-grid">
                      {presForm.meses.map((m, i) => (
                        <div key={m.mes} className="ps-mes-input-group">
                          <label>{MESES_LARGOS[i]}</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={m.monto_asignado}
                            onChange={e => {
                              const val = e.target.value;
                              setPresForm(f => ({
                                ...f,
                                meses: f.meses.map((mm, ii) => ii === i ? { ...mm, monto_asignado: val } : mm),
                              }));
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className={`ps-meses-sum${ok ? ' ok' : ' err'}`}>
                      <span>Total distribuido: <strong>{formatHNL(suma)}</strong></span>
                      {ok
                        ? <span className="ps-meses-check">✓ Correcto</span>
                        : <span className="ps-meses-diff">
                            {diff > 0 ? `+${formatHNL(diff)} de más` : `${formatHNL(Math.abs(diff))} faltante`}
                          </span>
                      }
                    </div>
                  </div>
                );
              })()}

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
