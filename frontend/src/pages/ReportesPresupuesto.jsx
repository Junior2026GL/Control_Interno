import { useEffect, useState, useContext, useMemo, useRef, Fragment } from 'react';
import {
  FiBarChart2, FiList, FiSearch, FiX, FiDownload, FiChevronDown, FiAward,
} from 'react-icons/fi';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './ReportesPresupuesto.css';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS        = Array.from({ length: 8 }, (_, i) => 2030 - i);
const PAGE_SIZE    = 15;

function formatHNL(v) {
  return `L ${(+(v || 0)).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

// ── Shared PDF header ─────────────────────────────────────────
async function buildPDFHeader(doc, anio, me) {
  const C_AZUL  = [39, 76, 141];
  const C_BLANCO = [255, 255, 255];
  const W  = doc.internal.pageSize.getWidth();
  const BM = 5;
  const P  = 5;
  const x0 = BM + P;
  const CW = W - 2 * (BM + P);
  let   y  = BM + P;

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

  doc.setDrawColor(180, 200, 235);
  doc.setLineWidth(0.3);
  doc.line(x0 + LOGO_W, y + 4, x0 + LOGO_W, y + HDR_H - 4);

  const instCX = x0 + LOGO_W + CENT_W / 2;
  doc.setTextColor(...C_AZUL);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('REPÚBLICA DE HONDURAS', instCX, y + 11, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text('CONGRESO NACIONAL', instCX, y + 18, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('PAGADURÍA ESPECIAL', instCX, y + 28, { align: 'center' });

  doc.setDrawColor(180, 200, 235);
  doc.setLineWidth(0.3);
  doc.line(x0 + LOGO_W + CENT_W, y + 4, x0 + LOGO_W + CENT_W, y + HDR_H - 4);

  const infoX   = x0 + LOGO_W + CENT_W;
  const infoMid = infoX + INFO_W / 2;
  const fechaGen = new Date().toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const horaGen  = new Date().toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const generadoPor = (me?.nombre || 'Sistema').toUpperCase();

  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
  doc.setTextColor(100, 120, 160);
  doc.text('AÑO', infoMid, y + 7, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.setTextColor(...C_AZUL);
  doc.text(String(anio), infoMid, y + 14, { align: 'center' });

  doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.2);
  doc.line(infoX + 3, y + 16, infoX + INFO_W - 3, y + 16);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
  doc.setTextColor(100, 120, 160);
  doc.text('GENERADO', infoX + 5, y + 21);
  doc.text('HORA', infoX + INFO_W / 2 + 2, y + 21);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.setTextColor(25, 25, 25);
  doc.text(fechaGen, infoX + 5, y + 26.5);
  doc.text(horaGen,  infoX + INFO_W / 2 + 2, y + 26.5);

  doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.2);
  doc.line(infoX + 3, y + 29, infoX + INFO_W - 3, y + 29);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
  doc.setTextColor(100, 120, 160);
  doc.text('GENERADO POR', infoMid, y + 33.5, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.setTextColor(...C_AZUL);
  doc.text(generadoPor, infoMid, y + 39, { align: 'center' });

  y += HDR_H;
  return { x0, CW, y, BM };
}

function addPDFFooter(doc, x0, CW, BM) {
  const C_AZUL   = [39, 76, 141];
  const C_BLANCO = [255, 255, 255];
  const PH    = doc.internal.pageSize.getHeight();
  const FH    = 9;
  const total = doc.internal.getNumberOfPages();
  const bx    = x0 - 4;   // mismo que PresupuestoDiputados
  const bw    = CW + 8;   // mismo que PresupuestoDiputados
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    // Marco exterior — igual que PresupuestoDiputados
    doc.setDrawColor(...C_AZUL);
    doc.setLineWidth(1.2);
    doc.rect(bx, BM, bw, PH - 2 * BM, 'S');
    // Barra footer (cubre todo el ancho del marco)
    doc.setFillColor(...C_AZUL);
    doc.rect(bx, PH - BM - FH, bw, FH, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.setTextColor(...C_BLANCO);
    const mid = x0 + CW / 2;
    doc.text('CONGRESO NACIONAL — PAGADURÍA ESPECIAL', mid, PH - BM - FH / 2 + 1.5, { align: 'center' });
    doc.text(`Página ${p} de ${total}`, bx + bw - 3, PH - BM - FH / 2 + 1.5, { align: 'right' });
  }
}

// ── Component ─────────────────────────────────────────────────
export default function ReportesPresupuesto() {
  const { user: me } = useContext(AuthContext);

  const [tab,  setTab]  = useState('resumen'); // 'resumen' | 'ayudas' | 'top'
  const [anio, setAnio] = useState(CURRENT_YEAR);

  /* resumen tab */
  const [resumen,        setResumen]        = useState([]);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [rFiltro,        setRFiltro]        = useState('todos');
  const [rSearch,        setRSearch]        = useState('');
  const [rPage,          setRPage]          = useState(1);
  const [expandedRow,    setExpandedRow]    = useState(null);  // diputado id
  const [expandedData,   setExpandedData]   = useState({});    // {[id]: {ayudas, loading}}

  /* ayudas tab */
  const [ayudas,        setAyudas]        = useState([]);
  const [ayudasTotal,   setAyudasTotal]   = useState(0);
  const [loadingAyudas, setLoadingAyudas] = useState(false);
  const [aPage,         setAPage]         = useState(1);
  const [aDipId,        setADipId]        = useState('');
  const [selectedDip,   setSelectedDip]   = useState(null);
  const [dipSearch,     setDipSearch]     = useState('');
  const [showDipDrop,   setShowDipDrop]   = useState(false);
  const [todosDips,     setTodosDips]     = useState([]);
  const [aSearch,       setASearch]       = useState('');
  const [aSearchInput,  setASearchInput]  = useState('');
  const dipDropRef = useRef(null);
  const aSearchTimer = useRef(null);

  /* top tab */
  const [topAyudas,    setTopAyudas]    = useState([]);
  const [loadingTop,   setLoadingTop]   = useState(false);

  /* monthly chart */

  const [sortCol, setSortCol] = useState('nombre');
  const [sortDir, setSortDir] = useState('asc');
  const [aEstado, setAEstado] = useState('');

  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setRPage(1);
  };

  const ESTADO_LABEL = { sin_liquidar: 'Sin Liquidar', en_proceso: 'En Proceso', liquido: 'Liquidado' };
  const ESTADO_CLS   = { sin_liquidar: 'rp-badge--pending', en_proceso: 'rp-badge--process', liquido: 'rp-badge--done' };
  const estadoBadge  = e => (
    <span className={`rp-badge ${ESTADO_CLS[e] || 'rp-badge--pending'}`}>{ESTADO_LABEL[e] || e}</span>
  );

  /* close dropdown outside click */
  useEffect(() => {
    const h = e => { if (dipDropRef.current && !dipDropRef.current.contains(e.target)) setShowDipDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* load diputados once */
  useEffect(() => {
    api.get('/diputados', { headers: authHeaders() })
      .then(r => setTodosDips(r.data.filter(d => d.activo)))
      .catch(() => {});
  }, []);

  /* load resumen on year change */
  useEffect(() => {
    loadResumen();
    setRPage(1); setRFiltro('todos'); setRSearch('');
    setAPage(1); setExpandedRow(null); setExpandedData({});
  }, [anio]); // eslint-disable-line react-hooks/exhaustive-deps

  /* load ayudas when tab switches or filters change */
  useEffect(() => {
    if (tab === 'ayudas') loadAyudas();
    if (tab === 'top')    loadTop();
  }, [tab, anio, aDipId, aPage, aEstado, aSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadResumen = async () => {
    setLoadingResumen(true);
    try {
      const r = await api.get(`/presupuesto/resumen?anio=${anio}`, { headers: authHeaders() });
      setResumen(r.data);
    } catch {
      showToast('Error al cargar el resumen.');
    } finally {
      setLoadingResumen(false);
    }
  };

  const loadAyudas = async () => {
    setLoadingAyudas(true);
    try {
      const params = new URLSearchParams({ anio, page: aPage, limit: PAGE_SIZE });
      if (aDipId)   params.append('diputado_id', aDipId);
      if (aEstado)  params.append('estado', aEstado);
      if (aSearch)  params.append('q', aSearch);
      const r = await api.get(`/presupuesto/reportes/ayudas?${params}`, { headers: authHeaders() });
      setAyudas(r.data.data);
      setAyudasTotal(r.data.total);
    } catch {
      showToast('Error al cargar las ayudas.');
    } finally {
      setLoadingAyudas(false);
    }
  };

  const loadTop = async () => {
    setLoadingTop(true);
    try {
      const r = await api.get(`/presupuesto/reportes/top?anio=${anio}&limit=15`, { headers: authHeaders() });
      setTopAyudas(r.data);
    } catch {
      showToast('Error al cargar el top de ayudas.');
    } finally {
      setLoadingTop(false);
    }
  };

  const toggleExpand = async (row) => {
    if (expandedRow === row.id) { setExpandedRow(null); return; }
    setExpandedRow(row.id);
    if (expandedData[row.id]) return;
    setExpandedData(prev => ({ ...prev, [row.id]: { loading: true, ayudas: [] } }));
    try {
      const r = await api.get(`/presupuesto/diputado/${row.id}?anio=${anio}`, { headers: authHeaders() });
      setExpandedData(prev => ({ ...prev, [row.id]: { loading: false, ayudas: r.data.ayudas.slice(0, 5) } }));
    } catch {
      setExpandedData(prev => ({ ...prev, [row.id]: { loading: false, ayudas: [] } }));
    }
  };

  /* global stats */
  const stats = useMemo(() => {
    if (!resumen.length) return null;
    const con = resumen.filter(r => r.monto_asignado != null);
    const sin = resumen.filter(r => r.monto_asignado == null);
    return {
      totalAsignado:  con.reduce((s, r) => s + r.monto_asignado, 0),
      totalEjecutado: con.reduce((s, r) => s + r.ejecutado, 0),
      conPresupuesto: con.length,
      sinPresupuesto: sin.length,
      total: resumen.length,
    };
  }, [resumen]);

  /* chart data — only depts with assigned budget */
  const chartData = useMemo(() => {
    const map = {};
    resumen.forEach(r => {
      const d = r.departamento || 'Sin depto.';
      if (!map[d]) map[d] = { dept: d, asignado: 0, ejecutado: 0 };
      map[d].asignado  += r.monto_asignado || 0;
      map[d].ejecutado += r.ejecutado      || 0;
    });
    return Object.values(map)
      .filter(d => d.asignado > 0)
      .sort((a, b) => b.asignado - a.asignado)
      .slice(0, 10);
  }, [resumen]);

  /* donut data — global execution */
  const donutData = useMemo(() => {
    if (!stats) return [];
    const rem = Math.max(0, stats.totalAsignado - stats.totalEjecutado);
    return [
      { name: 'Ejecutado',  value: stats.totalEjecutado, fill: '#f59e0b' },
      { name: 'Disponible', value: rem,                  fill: '#e8ecf4' },
    ];
  }, [stats]);

  /* filtered + sorted resumen */
  const resumenFiltered = useMemo(() => {
    let arr = resumen;
    if (rFiltro === 'con') arr = arr.filter(r => r.monto_asignado != null);
    else if (rFiltro === 'sin') arr = arr.filter(r => r.monto_asignado == null);
    if (rSearch.trim()) {
      const q = rSearch.toLowerCase();
      arr = arr.filter(r =>
        r.nombre.toLowerCase().includes(q) ||
        (r.departamento || '').toLowerCase().includes(q)
      );
    }
    arr = [...arr].sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case 'departamento': va = a.departamento || ''; vb = b.departamento || ''; break;
        case 'tipo':         va = a.tipo || '';         vb = b.tipo || '';         break;
        case 'asignado':     va = a.monto_asignado ?? -1; vb = b.monto_asignado ?? -1; break;
        case 'ejecutado':    va = a.ejecutado;          vb = b.ejecutado;          break;
        case 'disponible':   va = a.disponible ?? -1;   vb = b.disponible ?? -1;   break;
        case 'pct':          va = a.monto_asignado ? (a.ejecutado / a.monto_asignado) : -1;
                             vb = b.monto_asignado ? (b.ejecutado / b.monto_asignado) : -1; break;
        default:             va = a.nombre || '';       vb = b.nombre || '';
      }
      const cmp = typeof va === 'string' ? va.localeCompare(vb, 'es') : (va - vb);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [resumen, rFiltro, rSearch, sortCol, sortDir]);

  const rPageCount = Math.ceil(resumenFiltered.length / PAGE_SIZE);
  const rSlice     = resumenFiltered.slice((rPage - 1) * PAGE_SIZE, rPage * PAGE_SIZE);
  const aTotalPages = Math.ceil(ayudasTotal / PAGE_SIZE);

  /* diputados dropdown for ayudas filter */
  const dipResults = useMemo(() => {
    if (!dipSearch.trim()) return todosDips.slice(0, 12);
    const q = dipSearch.toLowerCase();
    return todosDips.filter(d =>
      d.nombre.toLowerCase().includes(q) ||
      d.departamento.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [todosDips, dipSearch]);

  const formatFecha = str => {
    const s = typeof str === 'string' ? str.slice(0, 10) : str;
    const [y, m, d] = s.split('-');
    return new Date(+y, +m - 1, +d).toLocaleDateString('es-HN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  /* ── Export Resumen PDF ────────────────────────────────── */
  const exportResumenPDF = async () => {
    const C_AZUL    = [39,  76, 141];
    const C_AZUL_OSC = [22, 51, 110];
    const C_BLANCO  = [255, 255, 255];
    const C_GRIS    = [235, 242, 255];

    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const { x0, CW, y: startY, BM } = await buildPDFHeader(doc, anio, me);
    let y = startY;

    // Title bar
    const TITLE_H = 9;
    doc.setFillColor(...C_AZUL);
    doc.rect(x0, y, CW, TITLE_H, 'F');
    doc.setTextColor(...C_BLANCO);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('RESUMEN DE PRESUPUESTO SOCIAL POR DIPUTADO', x0 + CW / 2, y + 6, { align: 'center' });
    y += TITLE_H + 4;

    // Outer border (will be drawn last via autoTable)
    const rows = resumenFiltered.map((r, i) => {
      const p = r.monto_asignado != null
        ? Math.min(100, (r.ejecutado / r.monto_asignado) * 100).toFixed(1) + '%'
        : '—';
      return [
        i + 1,
        r.nombre,
        r.departamento,
        r.tipo === 'PROPIETARIO' ? 'Prop.' : 'Sup.',
        r.monto_asignado != null ? formatHNL(r.monto_asignado) : 'Sin asignar',
        formatHNL(r.ejecutado),
        r.disponible != null ? formatHNL(r.disponible) : '—',
        p,
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['#', 'Diputado', 'Departamento', 'Tipo', 'Asignado', 'Ejecutado', 'Disponible', '%']],
      body: rows,
      styles: { fontSize: 8, cellPadding: 2.5, font: 'helvetica' },
      headStyles: { fillColor: C_AZUL, textColor: C_BLANCO, fontStyle: 'bold', fontSize: 8.5 },
      alternateRowStyles: { fillColor: C_GRIS },
      tableWidth: 'auto',
      columnStyles: {
        0: { cellWidth: 7,  halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 30 },
        3: { cellWidth: 13, halign: 'center' },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 30, halign: 'right' },
        6: { cellWidth: 30, halign: 'right' },
        7: { cellWidth: 14, halign: 'right' },
      },
      margin: { left: x0, right: x0 },
      didParseCell: data => {
        if (data.section === 'body' && data.column.index === 4 &&
            data.cell.raw === 'Sin asignar') {
          data.cell.styles.textColor = [180, 60, 60];
          data.cell.styles.fontStyle = 'italic';
        }
      },
    });

    // Summary row
    if (stats) {
      const lastY = doc.lastAutoTable.finalY + 2;
      doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C_AZUL_OSC);
      doc.text(`Total asignado: ${formatHNL(stats.totalAsignado)}   |   Total ejecutado: ${formatHNL(stats.totalEjecutado)}   |   Con presupuesto: ${stats.conPresupuesto}/${stats.total}   |   Sin presupuesto: ${stats.sinPresupuesto}`,
        x0, lastY + 5);
    }

    addPDFFooter(doc, x0, CW, BM);

    doc.save(`Resumen_Presupuesto_${anio}.pdf`);
  };

  /* ── Export Ayudas PDF ─────────────────────────────────── */
  const exportAyudasPDF = async () => {
    const C_AZUL   = [39, 76, 141];
    const C_BLANCO = [255, 255, 255];
    const C_GRIS   = [235, 242, 255];

    // Fetch all ayudas for export (not just current page)
    let allAyudas = ayudas;
    if (ayudasTotal > PAGE_SIZE) {
      try {
        const params = new URLSearchParams({ anio, page: 1, limit: 500 });
        if (aDipId)   params.append('diputado_id', aDipId);
        if (aEstado)  params.append('estado', aEstado);
        if (aSearch)  params.append('q', aSearch);
        const r = await api.get(`/presupuesto/reportes/ayudas?${params}`, { headers: authHeaders() });
        allAyudas = r.data.data;
      } catch { /* use current page */ }
    }

    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const { x0, CW, y: startY, BM } = await buildPDFHeader(doc, anio, me);
    let y = startY;

    const TITLE_H = 9;
    doc.setFillColor(...C_AZUL);
    doc.rect(x0, y, CW, TITLE_H, 'F');
    doc.setTextColor(...C_BLANCO);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    const titleExtra = selectedDip ? ` — ${selectedDip.nombre.toUpperCase()}` : '';
    doc.text(`LISTADO DE AYUDAS SOCIALES${titleExtra}`, x0 + CW / 2, y + 6, { align: 'center' });
    y += TITLE_H + 4;

    const totalMonto = allAyudas.reduce((s, a) => s + a.monto, 0);
    const ELBL = { sin_liquidar: 'Sin Liquidar', en_proceso: 'En Proceso', liquido: 'Liquidado' };
    const rows = allAyudas.map((a, i) => [
      i + 1,
      formatFecha(a.fecha),
      a.diputado,
      a.departamento,
      a.concepto,
      a.beneficiario || '—',
      ELBL[a.estado_liquidacion] || a.estado_liquidacion,
      formatHNL(a.monto),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['#', 'Fecha', 'Diputado', 'Departamento', 'Concepto', 'Beneficiario', 'Estado', 'Monto']],
      body: rows,
      foot: [['', '', '', '', '', '', 'TOTAL', formatHNL(totalMonto)]],
      styles: { fontSize: 7.5, cellPadding: 2, font: 'helvetica' },
      headStyles: { fillColor: C_AZUL, textColor: C_BLANCO, fontStyle: 'bold', fontSize: 8 },
      footStyles: { fillColor: [22, 51, 110], textColor: C_BLANCO, fontStyle: 'bold', fontSize: 8.5 },
      alternateRowStyles: { fillColor: C_GRIS },
      columnStyles: {
        0: { cellWidth: 7,  halign: 'center' },
        1: { cellWidth: 18 },
        2: { cellWidth: 33 },
        3: { cellWidth: 23 },
        4: { cellWidth: 40 },
        5: { cellWidth: 25 },
        6: { cellWidth: 22 },
        7: { cellWidth: 27, halign: 'right' },
      },
      margin: { left: x0, right: x0 },
    });

    addPDFFooter(doc, x0, CW, BM);

    doc.save(`Ayudas_Sociales_${anio}${selectedDip ? '_' + selectedDip.nombre.replace(/\s+/g, '_') : ''}.pdf`);
  };

  /* ── Export Ayudas CSV ─────────────────────────────────── */
  const exportAyudasCSV = async () => {
    let allAyudas = ayudas;
    if (ayudasTotal > PAGE_SIZE) {
      try {
        const params = new URLSearchParams({ anio, page: 1, limit: 500 });
        if (aDipId)   params.append('diputado_id', aDipId);
        if (aEstado)  params.append('estado', aEstado);
        if (aSearch)  params.append('q', aSearch);
        const r = await api.get(`/presupuesto/reportes/ayudas?${params}`, { headers: authHeaders() });
        allAyudas = r.data.data;
      } catch { /* use current page */ }
    }
    const ELBL = { sin_liquidar: 'Sin Liquidar', en_proceso: 'En Proceso', liquido: 'Liquidado' };
    const header = ['#', 'Fecha', 'Diputado', 'Departamento', 'Concepto', 'Beneficiario', 'Estado', 'Monto'];
    const rows = allAyudas.map((a, i) => [
      i + 1,
      formatFecha(a.fecha),
      `"${(a.diputado || '').replace(/"/g, '""')}"`,
      a.departamento,
      `"${(a.concepto || '').replace(/"/g, '""')}"`,
      `"${(a.beneficiario || '').replace(/"/g, '""')}"`,
      ELBL[a.estado_liquidacion] || a.estado_liquidacion,
      a.monto.toFixed(2),
    ]);
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Ayudas_Sociales_${anio}${selectedDip ? '_' + selectedDip.nombre.replace(/\s+/g, '_') : ''}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="page-shell">
      <Navbar />

      {toast && (
        <div className={`rp-toast rp-toast--${toast.type}`} role="alert">
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)}>×</button>
        </div>
      )}

      <div className="page-content" style={{ maxWidth: 1150 }}>

        {/* ── Header ── */}
        <div className="rp-page-header">
          <div>
            <h1>Reportes de Presupuesto Social</h1>
            <p>Estadísticas, resúmenes y listados de ayudas sociales</p>
          </div>
          <div className="rp-year-wrap">
            <label htmlFor="rp-year">Año</label>
            <select id="rp-year" className="rp-year-select" value={anio}
              onChange={e => setAnio(+e.target.value)}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="rp-stats-grid">
          {loadingResumen ? (
            <div className="rp-stat rp-stat--loading">Cargando estadísticas…</div>
          ) : stats ? (
            <>
              <div className="rp-stat">
                <span className="rp-stat-lbl">Total Asignado</span>
                <span className="rp-stat-val rp-val--blue">{formatHNL(stats.totalAsignado)}</span>
              </div>
              <div className="rp-stat">
                <span className="rp-stat-lbl">Total Ejecutado</span>
                <span className="rp-stat-val rp-val--exec">{formatHNL(stats.totalEjecutado)}</span>
              </div>
              <div className="rp-stat">
                <span className="rp-stat-lbl">Con Presupuesto</span>
                <span className="rp-stat-val rp-val--green">
                  {stats.conPresupuesto} <small>de {stats.total}</small>
                </span>
              </div>
              <div className={`rp-stat ${stats.sinPresupuesto > 0 ? 'rp-stat--warn-card' : ''}`}>
                <span className="rp-stat-lbl">Sin Presupuesto</span>
                <span className={`rp-stat-val ${stats.sinPresupuesto > 0 ? 'rp-val--warn' : 'rp-val--green'}`}>
                  {stats.sinPresupuesto}
                </span>
              </div>
              {(() => {
                const pct = stats.totalAsignado > 0
                  ? Math.min(100, (stats.totalEjecutado / stats.totalAsignado) * 100)
                  : 0;
                const valCls = pct > 90 ? 'rp-val--warn' : pct > 70 ? 'rp-val--exec' : 'rp-val--green';
                const barBg  = pct > 90 ? '#dc2626' : pct > 70 ? '#d97706' : '#16a34a';
                return (
                  <div className="rp-stat">
                    <span className="rp-stat-lbl">% Ejecución Global</span>
                    <span className={`rp-stat-val ${valCls}`}>{pct.toFixed(1)}%</span>
                    <div className="rp-stat-bar-bg">
                      <div className="rp-stat-bar-fill" style={{ width: `${pct}%`, background: barBg }} />
                    </div>
                  </div>
                );
              })()}
            </>
          ) : null}
        </div>

        {/* ── Chart ── */}
        {!loadingResumen && (stats || chartData.length > 0) && (
          <div className="rp-chart-card">
            <p className="rp-chart-title">
              <FiBarChart2 size={14} /> Distribución de Presupuesto — {anio}
            </p>
            <div className="rp-chart-body">

              {/* Donut */}
              {stats && stats.totalAsignado > 0 && (() => {
                const pct = Math.min(100, (stats.totalEjecutado / stats.totalAsignado) * 100);
                const pctCls = pct > 90 ? '#dc2626' : pct > 70 ? '#f59e0b' : '#16a34a';
                return (
                  <div className="rp-donut-wrap">
                    <div className="rp-donut-svg">
                      <ResponsiveContainer width={190} height={190}>
                        <PieChart>
                          <Pie
                            data={donutData} cx="50%" cy="50%"
                            innerRadius={58} outerRadius={82}
                            startAngle={90} endAngle={-270}
                            dataKey="value" stroke="none"
                          >
                            {donutData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                          </Pie>
                          <Tooltip
                            formatter={(v, name) => [formatHNL(v), name]}
                            contentStyle={{
                              background: '#0f2744',
                              border: '1px solid #274C8D',
                              borderRadius: 10,
                              fontSize: 12,
                              color: '#fff',
                              boxShadow: '0 4px 16px rgba(0,0,0,.3)',
                            }}
                            itemStyle={{ color: '#e2e8f0' }}
                            labelStyle={{ color: '#93c5fd', fontWeight: 700 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="rp-donut-center">
                        <span className="rp-donut-pct" style={{ color: pctCls }}>{pct.toFixed(1)}%</span>
                        <span className="rp-donut-sub">Ejecutado</span>
                      </div>
                    </div>
                    <div className="rp-donut-legend">
                      {[
                        { color: '#274C8D', label: 'Asignado',  val: formatHNL(stats.totalAsignado),                                   cls: '' },
                        { color: '#f59e0b', label: 'Ejecutado', val: formatHNL(stats.totalEjecutado),                                  cls: '' },
                        { color: '#16a34a', label: 'Disponible',val: formatHNL(Math.max(0, stats.totalAsignado - stats.totalEjecutado)), cls: 'rp-donut-leg-avail' },
                      ].map(({ color, label, val, cls }) => (
                        <div key={label} className="rp-donut-leg-row">
                          <span className="rp-donut-dot" style={{ background: color }} />
                          <span className="rp-donut-leg-lbl">{label}</span>
                          <span className={`rp-donut-leg-val ${cls}`}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Horizontal bar ranking */}
              {chartData.length > 0 && (() => {
                const max = chartData[0].asignado;
                return (
                  <div className="rp-hbar-wrap">
                    <p className="rp-hbar-title">Ranking por Departamento</p>
                    {chartData.map(d => {
                      const widthPct = max > 0 ? (d.asignado / max) * 100 : 0;
                      const execPct  = d.asignado > 0 ? Math.min(100, (d.ejecutado / d.asignado) * 100) : 0;
                      const barColor = execPct > 90 ? '#dc2626' : execPct > 70 ? '#f59e0b' : '#16a34a';
                      const label    = d.dept.length > 16 ? d.dept.slice(0, 16) + '…' : d.dept;
                      const amount   = d.asignado >= 1000000
                        ? `L ${(d.asignado / 1000000).toFixed(1)}M`
                        : `L ${(d.asignado / 1000).toFixed(0)}k`;
                      return (
                        <div key={d.dept} className="rp-hbar-row">
                          <span className="rp-hbar-label" title={d.dept}>{label}</span>
                          <div className="rp-hbar-track">
                            <div className="rp-hbar-asig" style={{ width: `${widthPct}%` }}>
                              <div className="rp-hbar-exec" style={{ width: `${execPct}%`, background: barColor }} />
                            </div>
                          </div>
                          <span className="rp-hbar-amount">{amount}</span>
                          <span className="rp-hbar-pct" style={{ color: barColor }}>{execPct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="rp-tabs">
          <button
            className={`rp-tab ${tab === 'resumen' ? 'rp-tab--active' : ''}`}
            onClick={() => setTab('resumen')}
          >
            <FiBarChart2 size={14} /> Resumen de Diputados
          </button>
          <button
            className={`rp-tab ${tab === 'ayudas' ? 'rp-tab--active' : ''}`}
            onClick={() => setTab('ayudas')}
          >
            <FiList size={14} /> Ayudas Sociales
          </button>
          <button
            className={`rp-tab ${tab === 'top' ? 'rp-tab--active' : ''}`}
            onClick={() => setTab('top')}
          >
            <FiAward size={14} /> Top Ayudas
          </button>
        </div>

        {/* ── Tab: Resumen ── */}
        {tab === 'resumen' && (
          <div className="rp-card">
            <div className="rp-toolbar">
              <div className="rp-filters">
                {[['todos','Todos'],['con','Con Presupuesto'],['sin','Sin Presupuesto']].map(([k, l]) => (
                  <button
                    key={k}
                    className={`rp-fil-btn ${rFiltro === k ? 'rp-fil-btn--active' : ''}`}
                    onClick={() => { setRFiltro(k); setRPage(1); }}
                  >{l}</button>
                ))}
              </div>
              <div className="rp-search-wrap">
                <FiSearch size={13} className="rp-search-icon" />
                <input
                  className="rp-search"
                  placeholder="Buscar diputado o departamento…"
                  value={rSearch}
                  onChange={e => { setRSearch(e.target.value); setRPage(1); }}
                />
                {rSearch && (
                  <button className="rp-search-clear" onClick={() => { setRSearch(''); setRPage(1); }}>
                    <FiX size={11} />
                  </button>
                )}
              </div>
              <button className="rp-export-btn" onClick={exportResumenPDF}
                disabled={loadingResumen || !resumen.length}>
                <FiDownload size={13} /> Exportar PDF
              </button>
            </div>

            {loadingResumen ? (
              <div className="rp-skeleton-wrap">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rp-skeleton-row">
                    <div className="rp-skel rp-skel--xs" />
                    <div className="rp-skel rp-skel--lg" />
                    <div className="rp-skel rp-skel--md" />
                    <div className="rp-skel rp-skel--sm" />
                    <div className="rp-skel rp-skel--md" />
                    <div className="rp-skel rp-skel--md" />
                    <div className="rp-skel rp-skel--md" />
                    <div className="rp-skel rp-skel--sm" />
                  </div>
                ))}
              </div>
            ) : resumenFiltered.length === 0 ? (
              <div className="rp-empty">
                {rSearch || rFiltro !== 'todos'
                  ? 'No se encontraron resultados con ese criterio.'
                  : `Sin diputados registrados para ${anio}.`}
              </div>
            ) : (
              <>
                <div className="rp-table-wrap">
                  <table className="rp-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th className="rp-th-sort" onClick={() => toggleSort('nombre')}>
                          Diputado <span className="rp-sort-icon">{sortCol === 'nombre' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}</span>
                        </th>
                        <th className="rp-th-sort" onClick={() => toggleSort('departamento')}>
                          Departamento <span className="rp-sort-icon">{sortCol === 'departamento' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}</span>
                        </th>
                        <th className="rp-th-sort" onClick={() => toggleSort('tipo')}>
                          Tipo <span className="rp-sort-icon">{sortCol === 'tipo' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}</span>
                        </th>
                        <th className="rp-th-r rp-th-sort" onClick={() => toggleSort('asignado')}>
                          Asignado <span className="rp-sort-icon">{sortCol === 'asignado' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}</span>
                        </th>
                        <th className="rp-th-r rp-th-sort" onClick={() => toggleSort('ejecutado')}>
                          Ejecutado <span className="rp-sort-icon">{sortCol === 'ejecutado' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}</span>
                        </th>
                        <th className="rp-th-r rp-th-sort" onClick={() => toggleSort('disponible')}>
                          Disponible <span className="rp-sort-icon">{sortCol === 'disponible' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}</span>
                        </th>
                        <th className="rp-th-r rp-th-sort" onClick={() => toggleSort('pct')}>
                          % <span className="rp-sort-icon">{sortCol === 'pct' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rSlice.map((r, i) => {
                        const p   = r.monto_asignado != null
                          ? Math.min(100, (r.ejecutado / r.monto_asignado) * 100) : 0;
                        const cls = p > 90 ? 'danger' : p > 70 ? 'warn' : 'ok';
                        return (
                          <Fragment key={r.id}>
                            <tr
                              className={`${r.monto_asignado == null ? 'rp-row--sin' : ''} rp-row-expandable`}
                              onClick={() => r.monto_asignado != null && toggleExpand(r)}
                              style={{ cursor: r.monto_asignado != null ? 'pointer' : 'default' }}
                            >
                              <td className="rp-td-num">{(rPage - 1) * PAGE_SIZE + i + 1}</td>
                              <td className="rp-td-nombre">
                                {r.monto_asignado != null && (
                                  <span className={`rp-expand-icon ${expandedRow === r.id ? 'rp-expand-icon--open' : ''}`}>&#9654;</span>
                                )}
                                {r.nombre}
                              </td>
                              <td>{r.departamento}</td>
                              <td>
                                <span className={`rp-tipo ${r.tipo === 'PROPIETARIO' ? 'prop' : 'sup'}`}>
                                  {r.tipo === 'PROPIETARIO' ? 'Prop.' : 'Sup.'}
                                </span>
                              </td>
                              <td className="rp-td-r">
                                {r.monto_asignado != null
                                  ? formatHNL(r.monto_asignado)
                                  : <span className="rp-no-pres">Sin asignar</span>}
                              </td>
                              <td className="rp-td-r">{formatHNL(r.ejecutado)}</td>
                              <td className="rp-td-r">{r.disponible != null ? formatHNL(r.disponible) : '—'}</td>
                              <td className="rp-td-r">
                                {r.monto_asignado != null ? (
                                  <div className="rp-pct-bar-wrap">
                                    <span className={`rp-pct rp-pct--${cls}`}>{p.toFixed(1)}%</span>
                                    <div className="rp-pct-bar-bg">
                                      <div className="rp-pct-bar-fill" style={{ width: `${Math.min(100, p)}%`, background: p > 90 ? '#dc2626' : p > 70 ? '#d97706' : '#16a34a' }} />
                                    </div>
                                  </div>
                                ) : '—'}
                              </td>
                            </tr>
                            {expandedRow === r.id && (
                              <tr className="rp-expand-row">
                                <td colSpan={8} className="rp-expand-cell">
                                  {expandedData[r.id]?.loading ? (
                                    <div className="rp-expand-loading">Cargando…</div>
                                  ) : expandedData[r.id]?.ayudas.length === 0 ? (
                                    <div className="rp-expand-empty">Sin ayudas registradas en {anio}.</div>
                                  ) : (
                                    <div className="rp-expand-inner">
                                      <span className="rp-expand-title">Últimas 5 ayudas</span>
                                      <table className="rp-expand-table">
                                        <thead><tr><th>Fecha</th><th>Concepto</th><th>Beneficiario</th><th>Estado</th><th>Monto</th></tr></thead>
                                        <tbody>
                                          {expandedData[r.id].ayudas.map(a => (
                                            <tr key={a.id}>
                                              <td>{formatFecha(a.fecha)}</td>
                                              <td>{a.concepto}</td>
                                              <td>{a.beneficiario || '—'}</td>
                                              <td>{estadoBadge(a.estado_liquidacion)}</td>
                                              <td style={{ textAlign:'right', fontWeight:700, color:'#274C8D' }}>{formatHNL(a.monto)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="rp-tfoot-lbl">Totales (p\u00e1gina visible)</td>
                        <td className="rp-tfoot-total">{formatHNL(rSlice.reduce((s,r) => s + (r.monto_asignado||0), 0))}</td>
                        <td className="rp-tfoot-total">{formatHNL(rSlice.reduce((s,r) => s + r.ejecutado, 0))}</td>
                        <td className="rp-tfoot-total">{formatHNL(rSlice.reduce((s,r) => s + (r.disponible||0), 0))}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {rPageCount > 1 && (
                  <div className="rp-pagination">
                    <button className="rp-pag-btn" disabled={rPage === 1}
                      onClick={() => setRPage(p => p - 1)}>&#8249;</button>
                    <span className="rp-pag-info">
                      {(rPage - 1) * PAGE_SIZE + 1}–{Math.min(rPage * PAGE_SIZE, resumenFiltered.length)} de {resumenFiltered.length}
                    </span>
                    <button className="rp-pag-btn" disabled={rPage === rPageCount}
                      onClick={() => setRPage(p => p + 1)}>&#8250;</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tab: Ayudas ── */}
        {tab === 'ayudas' && (
          <div className="rp-card">
            <div className="rp-toolbar">
              {/* Diputado filter */}
              <div className="rp-dip-filter" ref={dipDropRef}>
                <span className="rp-dip-label">Diputado:</span>
                {selectedDip ? (
                  <div className="rp-dip-selected">
                    <span>{selectedDip.nombre}</span>
                    <button onClick={() => { setSelectedDip(null); setADipId(''); setAPage(1); }}>
                      <FiX size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="rp-dip-search-wrap">
                    <input
                      className="rp-dip-search"
                      placeholder="Todos…"
                      value={dipSearch}
                      onChange={e => { setDipSearch(e.target.value); setShowDipDrop(true); }}
                      onFocus={() => setShowDipDrop(true)}
                    />
                    <FiChevronDown size={13} className="rp-dip-chevron" />
                    {showDipDrop && (
                      <div className="rp-dip-dropdown">
                        {dipResults.map(d => (
                          <div key={d.id} className="rp-dip-opt"
                            onClick={() => { setSelectedDip(d); setADipId(d.id); setDipSearch(''); setShowDipDrop(false); setAPage(1); }}>
                            <span className="rp-dip-opt-nombre">{d.nombre}</span>
                            <span className="rp-dip-opt-dept">{d.departamento}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Estado filter */}
              <div className="rp-filters">
                {[['', 'Todos'], ['sin_liquidar', 'Sin Liquidar'], ['en_proceso', 'En Proceso'], ['liquido', 'Liquidado']].map(([k, l]) => (
                  <button key={k}
                    className={`rp-fil-btn ${aEstado === k ? 'rp-fil-btn--active' : ''}`}
                    onClick={() => { setAEstado(k); setAPage(1); }}
                  >{l}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
                {/* Busqueda concepto/beneficiario */}
                <div className="rp-search-wrap">
                  <FiSearch size={13} className="rp-search-icon" />
                  <input
                    className="rp-search"
                    placeholder="Concepto o beneficiario\u2026"
                    value={aSearchInput}
                    onChange={e => {
                      setASearchInput(e.target.value);
                      clearTimeout(aSearchTimer.current);
                      aSearchTimer.current = setTimeout(() => { setASearch(e.target.value); setAPage(1); }, 400);
                    }}
                  />
                  {aSearchInput && (
                    <button className="rp-search-clear" onClick={() => { setASearchInput(''); setASearch(''); setAPage(1); }}>
                      <FiX size={11} />
                    </button>
                  )}
                </div>
                <button className="rp-export-btn" onClick={exportAyudasPDF}
                  disabled={loadingAyudas || !ayudas.length}>
                  <FiDownload size={13} /> Exportar PDF
                </button>
              </div>
            </div>

            {loadingAyudas ? (
              <div className="rp-skeleton-wrap">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rp-skeleton-row">
                    <div className="rp-skel rp-skel--xs" />
                    <div className="rp-skel rp-skel--sm" />
                    <div className="rp-skel rp-skel--lg" />
                    <div className="rp-skel rp-skel--md" />
                    <div className="rp-skel rp-skel--xl" />
                    <div className="rp-skel rp-skel--md" />
                    <div className="rp-skel rp-skel--sm" />
                    <div className="rp-skel rp-skel--md" />
                  </div>
                ))}
              </div>
            ) : ayudas.length === 0 ? (
              <div className="rp-empty">
                No hay ayudas registradas{selectedDip ? ` para ${selectedDip.nombre}` : ''} en {anio}.
              </div>
            ) : (
              <>
                <div className="rp-table-wrap">
                  <table className="rp-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Fecha</th>
                        <th>Diputado</th>
                        <th>Departamento</th>
                        <th>Concepto</th>
                        <th>Beneficiario</th>
                        <th>Estado</th>
                        <th className="rp-th-r">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ayudas.map((a, i) => (
                        <tr key={a.id}>
                          <td className="rp-td-num">{(aPage - 1) * PAGE_SIZE + i + 1}</td>
                          <td className="rp-td-fecha">{formatFecha(a.fecha)}</td>
                          <td className="rp-td-nombre">{a.diputado}</td>
                          <td>{a.departamento}</td>
                          <td className="rp-td-concepto">{a.concepto}
                            {a.observaciones && <div className="rp-td-obs">{a.observaciones}</div>}
                          </td>
                          <td>{a.beneficiario || '—'}</td>                          <td>{estadoBadge(a.estado_liquidacion)}</td>                          <td className="rp-td-r rp-td-monto">{formatHNL(a.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={7} className="rp-tfoot-lbl">Total página</td>
                        <td className="rp-tfoot-total">
                          {formatHNL(ayudas.reduce((s, a) => s + a.monto, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="rp-pag-info-total">
                  {ayudasTotal.toLocaleString()} ayuda{ayudasTotal !== 1 ? 's' : ''} encontrada{ayudasTotal !== 1 ? 's' : ''} en {anio}
                </div>
                {aTotalPages > 1 && (
                  <div className="rp-pagination">
                    <button className="rp-pag-btn" disabled={aPage === 1}
                      onClick={() => setAPage(p => p - 1)}>&#8249;</button>
                    <span className="rp-pag-info">
                      {(aPage - 1) * PAGE_SIZE + 1}–{Math.min(aPage * PAGE_SIZE, ayudasTotal)} de {ayudasTotal}
                    </span>
                    <button className="rp-pag-btn" disabled={aPage === aTotalPages}
                      onClick={() => setAPage(p => p + 1)}>&#8250;</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tab: Top Ayudas ── */}
        {tab === 'top' && (
          <div className="rp-card">
            <div className="rp-toolbar">
              <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                Top 15 ayudas de mayor monto en {anio}
              </span>
            </div>
            {loadingTop ? (
              <div className="rp-skeleton-wrap">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="rp-skeleton-row">
                    <div className="rp-skel rp-skel--xs" />
                    <div className="rp-skel rp-skel--sm" />
                    <div className="rp-skel rp-skel--lg" />
                    <div className="rp-skel rp-skel--md" />
                    <div className="rp-skel rp-skel--xl" />
                    <div className="rp-skel rp-skel--sm" />
                    <div className="rp-skel rp-skel--md" />
                  </div>
                ))}
              </div>
            ) : topAyudas.length === 0 ? (
              <div className="rp-empty">Sin ayudas registradas en {anio}.</div>
            ) : (
              <div className="rp-table-wrap">
                <table className="rp-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Fecha</th>
                      <th>Diputado</th>
                      <th>Departamento</th>
                      <th>Concepto</th>
                      <th>Beneficiario</th>
                      <th>Estado</th>
                      <th className="rp-th-r">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topAyudas.map((a, i) => {
                      const rank = i + 1;
                      const medal = rank === 1 ? '\uD83E\uDD47' : rank === 2 ? '\uD83E\uDD48' : rank === 3 ? '\uD83E\uDD49' : null;
                      return (
                        <tr key={a.id}>
                          <td className="rp-td-num">
                            {medal ? <span style={{ fontSize: 16 }}>{medal}</span> : rank}
                          </td>
                          <td className="rp-td-fecha">{formatFecha(a.fecha)}</td>
                          <td className="rp-td-nombre">{a.diputado}</td>
                          <td>{a.departamento}</td>
                          <td className="rp-td-concepto">{a.concepto}</td>
                          <td>{a.beneficiario || '\u2014'}</td>
                          <td>{estadoBadge(a.estado_liquidacion)}</td>
                          <td className="rp-td-r rp-td-monto">{formatHNL(a.monto)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={7} className="rp-tfoot-lbl">Total top {topAyudas.length}</td>
                      <td className="rp-tfoot-total">{formatHNL(topAyudas.reduce((s,a) => s + a.monto, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
