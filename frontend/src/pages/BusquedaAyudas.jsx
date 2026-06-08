import { useState, useContext, useRef, useMemo, useEffect } from 'react';
import {
  FiSearch, FiX, FiDownload, FiChevronDown, FiChevronUp,
  FiUser, FiHash, FiAlertCircle, FiFileText, FiBarChart2, FiEye,
  FiCalendar, FiTag, FiMapPin, FiDollarSign, FiInfo,
} from 'react-icons/fi';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './BusquedaAyudas.css';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const PAGE_SIZE = 20;
const C_AZUL = [39, 76, 141];
const C_BLANCO = [255, 255, 255];
const C_GRIS = [235, 242, 255];

function formatHNL(v) {
  return `L ${(+(v || 0)).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatFecha(str) {
  if (!str) return '—';
  const s = str.slice(0, 10);
  const [y, m, d] = s.split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

const ESTADOS_LIQ = {
  sin_liquidar: { label: 'Sin liquidar', cls: 'ba-badge--sinliq'  },
  en_proceso:   { label: 'En proceso',   cls: 'ba-badge--proceso' },
  liquido:      { label: 'Líquido',      cls: 'ba-badge--liquido' },
};
function estadoBadge(e) {
  const m = ESTADOS_LIQ[e] || ESTADOS_LIQ.sin_liquidar;
  return <span className={`ba-badge ${m.cls}`}>{m.label}</span>;
}

/* ══════════════════════════════════════════════════════════════ */
export default function BusquedaAyudas() {
  const { user: me } = useContext(AuthContext);
  const [tab, setTab] = useState('busqueda'); // 'busqueda' | 'mensual'

  /* ── Tab Búsqueda ─────────────────────────────── */
  const [diputados, setDiputados] = useState([]);
  const [results,   setResults]   = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // filtros (solo 3)
  const [q,           setQ]           = useState('');
  const [qInput,      setQInput]      = useState('');
  const [numeroOrden, setNumeroOrden] = useState('');
  const [noInput,     setNoInput]     = useState('');
  const [selDip,      setSelDip]      = useState(null);
  const [dipSearch,   setDipSearch]   = useState('');
  const [showDipDrop, setShowDipDrop] = useState(false);
  const dipRef  = useRef(null);
  const qTimer  = useRef(null);
  const noTimer = useRef(null);

  // modal detalle
  const [detalle, setDetalle] = useState(null);

  /* ── Tab Mensual ─────────────────────────────── */
  const [mesAnio,    setMesAnio]    = useState(CURRENT_YEAR);
  const [mes,        setMes]        = useState(new Date().getMonth() + 1);
  const [mensual,    setMensual]    = useState(null);
  const [loadingMes, setLoadingMes] = useState(false);
  const [expanded,   setExpanded]   = useState({});

  /* ── Cargar diputados ────────────────────────── */
  useEffect(() => {
    api.get('/diputados', { headers: authHeaders() })
      .then(r => setDiputados(r.data.filter(d => d.activo)))
      .catch(() => {});
  }, []);

  /* ── Cerrar dropdown ─────────────────────────── */
  useEffect(() => {
    const h = e => { if (dipRef.current && !dipRef.current.contains(e.target)) setShowDipDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ── Dropdown diputados filtrado ─────────────── */
  const dipResults = useMemo(() => {
    if (!dipSearch.trim()) return diputados.slice(0, 10);
    const q2 = dipSearch.toLowerCase();
    return diputados.filter(d =>
      d.nombre.toLowerCase().includes(q2) || (d.departamento || '').toLowerCase().includes(q2)
    ).slice(0, 12);
  }, [diputados, dipSearch]);

  /* ── Partidos únicos ─────────────────────────── */
  const partidos = useMemo(() => {
    const set = new Set(diputados.map(d => d.partido).filter(Boolean));
    return [...set].sort();
  }, [diputados]);

  /* ── Buscar — siempre en todos los años ─────── */
  const [filterError, setFilterError] = useState('');

  const buscar = async (pg = 1) => {
    // Requiere al menos un filtro activo
    if (!q.trim() && !numeroOrden.trim() && !selDip) {
      setFilterError('Ingrese al menos un filtro para realizar la búsqueda.');
      setResults([]); setTotal(0); setHasSearched(false);
      return;
    }
    setFilterError('');
    setLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams({ page: pg, limit: PAGE_SIZE, anio_libre: '1' });
      if (q)           params.append('q', q);
      if (numeroOrden) params.append('numero_orden', numeroOrden);
      if (selDip)      params.append('diputado_id', selDip.id);
      const r = await api.get(`/presupuesto/reportes/ayudas?${params}`, { headers: authHeaders() });
      setResults(r.data.data);
      setTotal(r.data.total);
      setPage(pg);
    } catch { setResults([]); setTotal(0); }
    finally { setLoading(false); }
  };

  const limpiar = () => {
    setQ(''); setQInput(''); setNumeroOrden(''); setNoInput('');
    setSelDip(null); setDipSearch('');
    setFilterError('');
    setResults([]); setTotal(0); setHasSearched(false);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  /* ── Generar reporte mensual ─────────────────── */
  const generarMensual = async () => {
    setLoadingMes(true);
    setMensual(null);
    setExpanded({});
    try {
      const r = await api.get(
        `/presupuesto/reportes/mensual-detalle?anio=${mesAnio}&mes=${mes}`,
        { headers: authHeaders() }
      );
      setMensual(r.data);
    } catch { setMensual(null); }
    finally { setLoadingMes(false); }
  };

  const toggleDip = id => setExpanded(e => ({ ...e, [id]: !e[id] }));
  const expandAll   = () => {
    if (!mensual) return;
    const all = {};
    mensual.diputados.forEach(d => all[d.diputado_id] = true);
    setExpanded(all);
  };
  const collapseAll = () => setExpanded({});

  /* ── PDF Búsqueda ────────────────────────────── */
  const exportBusquedaPDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();
    const BM = 5; const x0 = BM + 5; const CW = W - 2 * (BM + 5);

    doc.setFillColor(...C_AZUL);
    doc.rect(x0, BM + 3, CW, 11, 'F');
    doc.setTextColor(...C_BLANCO);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('CONSULTA DE AYUDAS SOCIALES', x0 + CW / 2, BM + 10, { align: 'center' });

    const rows = results.map((r, i) => [
      i + 1,
      formatFecha(r.fecha),
      r.diputado,
      r.partido || '—',
      r.tipo === 'PROPIETARIO' ? 'Prop.' : 'Sup.',
      r.concepto.length > 45 ? r.concepto.slice(0, 45) + '…' : r.concepto,
      r.beneficiario || '—',
      r.numero_orden || '—',
      formatHNL(r.monto),
      ESTADOS_LIQ[r.estado_liquidacion]?.label || r.estado_liquidacion,
    ]);

    autoTable(doc, {
      startY: BM + 17,
      head: [['#', 'Fecha', 'Diputado', 'Partido', 'Tipo', 'Concepto', 'Beneficiario', 'N° Orden', 'Monto', 'Estado']],
      body: rows,
      styles: { fontSize: 6.5, cellPadding: 2 },
      headStyles: { fillColor: C_AZUL, textColor: C_BLANCO, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: C_GRIS },
      margin: { left: x0, right: x0 },
    });

    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFillColor(...C_AZUL);
      doc.rect(x0 - 4, doc.internal.pageSize.getHeight() - BM - 9, CW + 8, 9, 'F');
      doc.setFontSize(8); doc.setTextColor(...C_BLANCO);
      doc.text(`Total: ${total} registro(s) — ${formatHNL(results.reduce((s, r) => s + r.monto, 0))}`,
        x0, doc.internal.pageSize.getHeight() - BM - 3);
      doc.text(`Pág. ${p}/${pages}`, x0 + CW / 2, doc.internal.pageSize.getHeight() - BM - 3, { align: 'center' });
    }
    doc.save(`Consulta_Ayudas.pdf`);
  };

  /* ── PDF Reporte Mensual (tipo acta) ─────────── */
  const exportMensualPDF = () => {
    if (!mensual) return;
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const BM = 10; const x0 = BM + 5; const CW = W - 2 * (BM + 5);

    const addPage = () => {
      doc.addPage();
      // header repetido
      doc.setFillColor(...C_AZUL);
      doc.rect(x0 - 4, BM, CW + 8, 14, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...C_BLANCO);
      doc.text('REPORTE MENSUAL DE AYUDAS SOCIALES', x0 + CW / 2, BM + 6, { align: 'center' });
      doc.setFontSize(8);
      doc.text(`${mensual.mes_nombre.toUpperCase()} ${mensual.anio}`, x0 + CW / 2, BM + 11, { align: 'center' });
      return BM + 18;
    };

    // Portada
    doc.setFillColor(...C_AZUL);
    doc.rect(x0 - 4, BM, CW + 8, 20, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...C_BLANCO);
    doc.text('REPORTE MENSUAL DE AYUDAS SOCIALES', x0 + CW / 2, BM + 9, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`${mensual.mes_nombre.toUpperCase()} ${mensual.anio}`, x0 + CW / 2, BM + 16, { align: 'center' });

    // Resumen general
    let y = BM + 26;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 50, 50);
    doc.setFillColor(235, 242, 255);
    doc.rect(x0 - 4, y - 3, CW + 8, 16, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C_AZUL);
    doc.text(`Total de ayudas registradas: ${mensual.total_ayudas}`, x0, y + 3);
    doc.text(`Diputados con ayudas: ${mensual.diputados.length}`, x0 + CW / 2 - 10, y + 3);
    doc.text(`Gran Total: ${formatHNL(mensual.gran_total)}`, x0 + CW - 60, y + 3, { align: 'left' });
    y += 18;

    // Por cada diputado
    for (const dip of mensual.diputados) {
      if (y > H - 60) { y = addPage(); }

      // Header diputado
      doc.setFillColor(39, 76, 141);
      doc.rect(x0 - 4, y, CW + 8, 8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...C_BLANCO);
      doc.text(`${dip.diputado_nombre}`, x0, y + 5.5);
      doc.text(`${dip.partido || ''}  |  ${dip.departamento}  |  ${dip.tipo === 'PROPIETARIO' ? 'Propietario' : 'Suplente'}`, x0 + 80, y + 5.5);
      doc.text(`${dip.cantidad} ayuda(s)  |  ${formatHNL(dip.total)}`, x0 + CW - 2, y + 5.5, { align: 'right' });
      y += 10;

      // Tabla de ayudas del diputado
      const rows = dip.ayudas.map((a, i) => [
        i + 1,
        formatFecha(a.fecha),
        a.concepto.length > 50 ? a.concepto.slice(0, 50) + '…' : a.concepto,
        a.beneficiario || '—',
        a.numero_orden || '—',
        formatHNL(a.monto),
        ESTADOS_LIQ[a.estado_liquidacion]?.label || '—',
      ]);

      autoTable(doc, {
        startY: y,
        head: [['#', 'Fecha', 'Concepto', 'Beneficiario', 'N° Orden', 'Monto', 'Estado']],
        body: rows,
        styles: { fontSize: 7, cellPadding: 1.8 },
        headStyles: { fillColor: [100, 130, 190], textColor: C_BLANCO, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 249, 255] },
        margin: { left: x0 - 4, right: x0 - 4 },
        didDrawPage: () => {},
      });

      y = doc.lastAutoTable.finalY + 6;
    }

    // Firma
    if (y > H - 50) { y = addPage(); }
    y += 10;
    doc.setDrawColor(180, 180, 180);
    doc.line(x0, y, x0 + 70, y);
    doc.line(x0 + CW - 70, y, x0 + CW, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text('Pagador/a Especial', x0 + 35, y + 5, { align: 'center' });
    doc.text('Autorizado por', x0 + CW - 35, y + 5, { align: 'center' });

    // Footer páginas
    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFillColor(...C_AZUL);
      doc.rect(x0 - 4, H - BM - 7, CW + 8, 7, 'F');
      doc.setFontSize(7.5); doc.setTextColor(...C_BLANCO); doc.setFont('helvetica', 'normal');
      doc.text('Congreso Nacional — Pagaduría Especial', x0, H - BM - 2.5);
      doc.text(`Pág. ${p}/${pages}`, x0 + CW / 2, H - BM - 2.5, { align: 'center' });
      doc.text(new Date().toLocaleDateString('es-HN'), x0 + CW, H - BM - 2.5, { align: 'right' });
    }

    doc.save(`Reporte_Mensual_${mensual.mes_nombre}_${mensual.anio}.pdf`);
  };

  /* ══════════════════════════════════════════════ RENDER */
  return (
    <div className="page-shell">
      <Navbar />

      <div className="page-content" style={{ maxWidth: 1260 }}>

        {/* ── Header ── */}
        <div className="ba-page-header">
          <div>
            <h1><FiFileText size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />Consulta de Ayudas Sociales</h1>
            <p>Búsqueda global y reporte mensual de ayudas registradas</p>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="ba-tabs">
          <button className={`ba-tab ${tab === 'busqueda' ? 'ba-tab--active' : ''}`} onClick={() => setTab('busqueda')}>
            <FiSearch size={14} /> Búsqueda Global
          </button>
          <button className={`ba-tab ${tab === 'mensual' ? 'ba-tab--active' : ''}`} onClick={() => setTab('mensual')}>
            <FiBarChart2 size={14} /> Reporte Mensual
          </button>
        </div>

        {/* ══════════════════ TAB: BÚSQUEDA ══════════════════ */}
        {tab === 'busqueda' && (
          <div className="ba-search-panel">

            {/* 3 filtros en fila */}
            <div className="ba-filters-row">
              {/* Texto libre */}
              <div className="ba-fg ba-fg--flex2">
                <label className="ba-label"><FiSearch size={11} /> Buscar (beneficiario, concepto, N° orden)</label>
                <div className="ba-input-wrap">
                  <input
                    className="ba-input"
                    placeholder="Escriba para buscar…"
                    value={qInput}
                    onChange={e => {
                      setQInput(e.target.value);
                      clearTimeout(qTimer.current);
                      qTimer.current = setTimeout(() => setQ(e.target.value), 400);
                    }}
                    onKeyDown={e => e.key === 'Enter' && buscar(1)}
                  />
                  {qInput && <button className="ba-input-clear" onClick={() => { setQInput(''); setQ(''); }}><FiX size={11} /></button>}
                </div>
              </div>

              {/* N° Orden */}
              <div className="ba-fg">
                <label className="ba-label"><FiHash size={11} /> Número de Orden exacto</label>
                <div className="ba-input-wrap">
                  <input
                    className="ba-input"
                    placeholder="Ej: AS202610"
                    value={noInput}
                    onChange={e => {
                      setNoInput(e.target.value);
                      clearTimeout(noTimer.current);
                      noTimer.current = setTimeout(() => setNumeroOrden(e.target.value), 400);
                    }}
                    onKeyDown={e => e.key === 'Enter' && buscar(1)}
                  />
                  {noInput && <button className="ba-input-clear" onClick={() => { setNoInput(''); setNumeroOrden(''); }}><FiX size={11} /></button>}
                </div>
              </div>

              {/* Diputado */}
              <div className="ba-fg" ref={dipRef}>
                <label className="ba-label"><FiUser size={11} /> Diputado</label>
                {selDip ? (
                  <div className="ba-sel-chip">
                    <span>{selDip.nombre}</span>
                    <button onClick={() => { setSelDip(null); setDipSearch(''); }}><FiX size={11} /></button>
                  </div>
                ) : (
                  <div className="ba-input-wrap" style={{ position: 'relative' }}>
                    <input
                      className="ba-input"
                      placeholder="Buscar diputado…"
                      value={dipSearch}
                      onChange={e => { setDipSearch(e.target.value); setShowDipDrop(true); }}
                      onFocus={() => setShowDipDrop(true)}
                    />
                    {showDipDrop && dipResults.length > 0 && (
                      <div className="ba-dip-drop">
                        {dipResults.map(d => (
                          <div key={d.id} className="ba-dip-opt"
                            onClick={() => { setSelDip(d); setDipSearch(''); setShowDipDrop(false); }}>
                            <span className="ba-dip-nombre">{d.nombre}</span>
                            <span className="ba-dip-meta">{d.partido} · {d.departamento}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Error de validación */}
            {filterError && (
              <div className="ba-filter-error">
                <FiAlertCircle size={14} /> {filterError}
              </div>
            )}

            {/* Botones */}
            <div className="ba-filter-actions">
              <button className="ba-btn-secondary" onClick={limpiar}>
                <FiX size={13} /> Limpiar
              </button>
              <button className="ba-btn-primary" onClick={() => buscar(1)} disabled={loading}>
                <FiSearch size={13} /> {loading ? 'Buscando…' : 'Buscar'}
              </button>
              {results.length > 0 && (
                <button className="ba-btn-export" onClick={exportBusquedaPDF}>
                  <FiDownload size={13} /> Exportar PDF
                </button>
              )}
            </div>

            {/* Resultados */}
            {hasSearched && !loading && results.length > 0 && (() => {
              const from  = (page - 1) * PAGE_SIZE + 1;
              const to    = Math.min(page * PAGE_SIZE, total);
              const pageNums = [];
              if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pageNums.push(i);
              } else {
                pageNums.push(1);
                if (page > 3) pageNums.push('...');
                for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pageNums.push(i);
                if (page < totalPages - 2) pageNums.push('...');
                pageNums.push(totalPages);
              }
              const PagBar = () => (
                <div className="ba-pagination">
                  <span className="ba-pag-range">{from}–{to} de {total}</span>
                  <div className="ba-pag-btns">
                    <button className="ba-pag-nav" disabled={page === 1} onClick={() => buscar(1)} title="Primera">«</button>
                    <button className="ba-pag-nav" disabled={page === 1} onClick={() => buscar(page - 1)} title="Anterior">‹</button>
                    {pageNums.map((p, i) =>
                      p === '...' ? (
                        <span key={`e${i}`} className="ba-pag-ellipsis">…</span>
                      ) : (
                        <button
                          key={p}
                          className={`ba-pag-num${p === page ? ' ba-pag-num--active' : ''}`}
                          onClick={() => p !== page && buscar(p)}
                        >{p}</button>
                      )
                    )}
                    <button className="ba-pag-nav" disabled={page === totalPages} onClick={() => buscar(page + 1)} title="Siguiente">›</button>
                    <button className="ba-pag-nav" disabled={page === totalPages} onClick={() => buscar(totalPages)} title="Última">»</button>
                  </div>
                  <span className="ba-pag-label">Pág. {page} / {totalPages}</span>
                </div>
              );
              return (
                <>
                  {totalPages > 1 && <PagBar />}
                  <div className="ba-results-card">
                    <div className="ba-results-header">
                      <span className="ba-results-count">
                        {total} resultado{total !== 1 ? 's' : ''}
                        {totalPages > 1 && <span className="ba-results-pag"> — pág. {page} de {totalPages}</span>}
                      </span>
                      <span className="ba-results-total">
                        {formatHNL(results.reduce((s, r) => s + r.monto, 0))}
                      </span>
                    </div>
                    <div className="ba-table-wrap">
                      <table className="ba-table">
                        <thead>
                          <tr>
                            <th style={{ width: 36 }}>#</th>
                            <th>Fecha</th>
                            <th>Diputado</th>
                            <th>N° Orden</th>
                            <th>Estado</th>
                            <th className="ba-th-r" style={{ whiteSpace: 'nowrap', width: 130 }}>Monto</th>
                            <th style={{ width: 50, textAlign: 'center' }}>Detalle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((r, i) => (
                            <tr key={r.id}>
                              <td className="ba-td-num">{(page - 1) * PAGE_SIZE + i + 1}</td>
                              <td className="ba-td-fecha">{formatFecha(r.fecha)}</td>
                              <td>
                                <div className="ba-td-dip">
                                  <span className="ba-dip-nombre-t">{r.diputado}</span>
                                  <span className="ba-dip-dept">{r.departamento}</span>
                                </div>
                              </td>
                              <td>
                                {r.numero_orden
                                  ? <span className="ba-orden-badge">{r.numero_orden}</span>
                                  : <span className="ba-vacio">—</span>}
                              </td>
                              <td>{estadoBadge(r.estado_liquidacion)}</td>
                              <td className="ba-td-monto">{formatHNL(r.monto)}</td>
                              <td style={{ textAlign: 'center' }}>
                                <button className="ba-btn-detalle" title="Ver detalle" onClick={() => setDetalle(r)}>
                                  <FiEye size={15} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {totalPages > 1 && <PagBar />}
                </>
              );
            })()}

            {hasSearched && !loading && results.length === 0 && (
              <div className="ba-results-card">
                <div className="ba-empty">
                  <FiAlertCircle size={28} />
                  <p>No se encontraron ayudas con los filtros aplicados.</p>
                </div>
              </div>
            )}

            {hasSearched && loading && (
              <div className="ba-results-card">
                <div className="ba-empty">Buscando…</div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ TAB: MENSUAL ══════════════════ */}
        {tab === 'mensual' && (
          <div className="ba-mensual-panel">
            {/* Selectores */}
            <div className="ba-mensual-controls">
              <div className="ba-fg">
                <label className="ba-label">Año</label>
                <select className="ba-select" value={mesAnio} onChange={e => setMesAnio(+e.target.value)}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="ba-fg">
                <label className="ba-label">Mes</label>
                <select className="ba-select" value={mes} onChange={e => setMes(+e.target.value)}>
                  {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div className="ba-mensual-btn-wrap">
                <button className="ba-btn-primary" onClick={generarMensual} disabled={loadingMes}>
                  <FiBarChart2 size={13} /> {loadingMes ? 'Generando…' : 'Generar Reporte'}
                </button>
                {mensual && (
                  <button className="ba-btn-export" onClick={exportMensualPDF}>
                    <FiDownload size={13} /> PDF Acta
                  </button>
                )}
              </div>
            </div>

            {/* Resultado mensual */}
            {loadingMes && <div className="ba-empty">Generando reporte…</div>}

            {mensual && !loadingMes && (
              <>
                {/* Stat cards */}
                <div className="ba-mes-stats">
                  <div className="ba-mes-stat ba-mes-stat--azul">
                    <span className="ba-mes-stat-lbl">{mensual.mes_nombre} {mensual.anio}</span>
                    <span className="ba-mes-stat-val">{mensual.total_ayudas} ayudas</span>
                  </div>
                  <div className="ba-mes-stat ba-mes-stat--verde">
                    <span className="ba-mes-stat-lbl">Gran Total</span>
                    <span className="ba-mes-stat-val">{formatHNL(mensual.gran_total)}</span>
                  </div>
                  <div className="ba-mes-stat ba-mes-stat--gris">
                    <span className="ba-mes-stat-lbl">Diputados con ayudas</span>
                    <span className="ba-mes-stat-val">{mensual.diputados.length}</span>
                  </div>
                </div>

                {mensual.diputados.length === 0 ? (
                  <div className="ba-empty">
                    <FiAlertCircle size={28} />
                    <p>No hay ayudas registradas en {mensual.mes_nombre} {mensual.anio}.</p>
                  </div>
                ) : (
                  <>
                    <div className="ba-expand-bar">
                      <span className="ba-expand-hint">{mensual.diputados.length} diputado(s) con registros</span>
                      <div>
                        <button className="ba-btn-text" onClick={expandAll}>Expandir todo</button>
                        <button className="ba-btn-text" onClick={collapseAll}>Colapsar todo</button>
                      </div>
                    </div>

                    <div className="ba-accordion">
                      {mensual.diputados.map(dip => (
                        <div key={dip.diputado_id} className="ba-acc-item">
                          <button className="ba-acc-header" onClick={() => toggleDip(dip.diputado_id)}>
                            <div className="ba-acc-info">
                              <span className="ba-acc-nombre">{dip.diputado_nombre}</span>
                              <div className="ba-acc-tags">
                                <span className="ba-partido-tag">{dip.partido || '—'}</span>
                                <span className="ba-tag-dept">{dip.departamento}</span>
                                <span className={`ba-tipo-tag ba-tipo-tag--${dip.tipo === 'PROPIETARIO' ? 'prop' : 'sup'}`}>
                                  {dip.tipo === 'PROPIETARIO' ? 'Propietario' : 'Suplente'}
                                </span>
                              </div>
                            </div>
                            <div className="ba-acc-right">
                              <span className="ba-acc-count">{dip.cantidad} ayuda{dip.cantidad !== 1 ? 's' : ''}</span>
                              <span className="ba-acc-total">{formatHNL(dip.total)}</span>
                              {expanded[dip.diputado_id] ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                            </div>
                          </button>

                          {expanded[dip.diputado_id] && (
                            <div className="ba-acc-body">
                              <table className="ba-table ba-table--inner">
                                <thead>
                                  <tr>
                                    <th>#</th>
                                    <th>Fecha</th>
                                    <th>Concepto</th>
                                    <th>Beneficiario</th>
                                    <th>N° Orden</th>
                                    <th className="ba-th-r">Monto</th>
                                    <th>Estado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dip.ayudas.map((a, i) => (
                                    <tr key={a.id}>
                                      <td className="ba-td-num">{i + 1}</td>
                                      <td className="ba-td-fecha">{formatFecha(a.fecha)}</td>
                                      <td className="ba-td-concepto" title={a.concepto}>{a.concepto}</td>
                                      <td className="ba-td-benef">{a.beneficiario || <span className="ba-vacio">—</span>}</td>
                                      <td>
                                        {a.numero_orden
                                          ? <span className="ba-orden-badge">{a.numero_orden}</span>
                                          : <span className="ba-vacio">—</span>}
                                      </td>
                                      <td className="ba-td-monto">{formatHNL(a.monto)}</td>
                                      <td>{estadoBadge(a.estado_liquidacion)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="ba-tfoot-row">
                                    <td colSpan={5} className="ba-tfoot-lbl">Subtotal {dip.diputado_nombre}</td>
                                    <td className="ba-td-monto ba-tfoot-val">{formatHNL(dip.total)}</td>
                                    <td />
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Gran total */}
                    <div className="ba-gran-total">
                      <span>Gran Total {mensual.mes_nombre} {mensual.anio}</span>
                      <span>{formatHNL(mensual.gran_total)}</span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

      </div>

      {/* ══════════════════ MODAL DETALLE ══════════════════ */}
      {detalle && (
        <div className="ba-modal-overlay">
          <div className="ba-modal-box">

            {/* Header con banda azul */}
            <div className="ba-modal-header-pro">
              <div className="ba-modal-header-left">
                <div className="ba-modal-icon-wrap"><FiFileText size={18} /></div>
                <div>
                  <p className="ba-modal-header-supra">Ayuda Social</p>
                  <h2 className="ba-modal-header-title">Detalle del Registro</h2>
                </div>
              </div>
              <button className="ba-modal-close-pro" onClick={() => setDetalle(null)}><FiX size={17} /></button>
            </div>

            {/* Tarjeta diputado destacada */}
            <div className="ba-modal-dip-card">
              <div className="ba-modal-dip-avatar"><FiUser size={20} /></div>
              <div className="ba-modal-dip-info">
                <span className="ba-modal-dip-nombre">{detalle.diputado}</span>
                <span className="ba-modal-dip-sub">
                  <FiMapPin size={11} /> {detalle.departamento}
                </span>
              </div>
              <div className="ba-modal-dip-badges">
                <span className="ba-partido-tag">{detalle.partido || '—'}</span>
                <span className={`ba-tipo-tag ba-tipo-tag--${detalle.tipo === 'PROPIETARIO' ? 'prop' : 'sup'}`}>
                  {detalle.tipo === 'PROPIETARIO' ? 'Propietario' : 'Suplente'}
                </span>
              </div>
            </div>

            <div className="ba-modal-body">

              {/* Fila: Monto destacado + Estado + N° Orden */}
              <div className="ba-modal-kpis">
                <div className="ba-modal-kpi ba-modal-kpi--monto">
                  <span className="ba-modal-kpi-lbl">Monto</span>
                  <span className="ba-modal-kpi-val">{formatHNL(detalle.monto)}</span>
                </div>
                <div className="ba-modal-kpi">
                  <span className="ba-modal-kpi-lbl">Estado liquidación</span>
                  <span className="ba-modal-kpi-val">{estadoBadge(detalle.estado_liquidacion)}</span>
                </div>
                <div className="ba-modal-kpi">
                  <span className="ba-modal-kpi-lbl">N° de Orden</span>
                  <span className="ba-modal-kpi-val">
                    {detalle.numero_orden
                      ? <span className="ba-orden-badge">{detalle.numero_orden}</span>
                      : <span className="ba-vacio-sm">Sin asignar</span>}
                  </span>
                </div>
              </div>

              {/* Información de la ayuda */}
              <div className="ba-detail-section">
                <h3 className="ba-detail-section-title"><FiFileText size={12} /> Información de la Ayuda</h3>
                <div className="ba-detail-grid">
                  <div className="ba-detail-field">
                    <span className="ba-detail-label">Fecha</span>
                    <span className="ba-detail-val">{formatFecha(detalle.fecha)}</span>
                  </div>
                  <div className="ba-detail-field">
                    <span className="ba-detail-label">Año presupuesto</span>
                    <span className="ba-detail-val">{detalle.anio}</span>
                  </div>
                  <div className="ba-detail-field ba-detail-field--wide">
                    <span className="ba-detail-label">Concepto</span>
                    <span className="ba-detail-val">{detalle.concepto}</span>
                  </div>
                  <div className="ba-detail-field ba-detail-field--wide">
                    <span className="ba-detail-label">Beneficiario</span>
                    <span className="ba-detail-val ba-detail-val--bold">{detalle.beneficiario || '—'}</span>
                  </div>
                  <div className="ba-detail-field">
                    <span className="ba-detail-label">Registrado</span>
                    <span className="ba-detail-val">{formatFecha(detalle.created_at)}</span>
                  </div>
                  <div className="ba-detail-field">
                    <span className="ba-detail-label">Registrado por</span>
                    <span className="ba-detail-val ba-detail-val--bold">{detalle.creado_por_nombre || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Observaciones */}
              {detalle.observaciones && (
                <div className="ba-detail-section">
                  <h3 className="ba-detail-section-title"><FiInfo size={12} /> Observaciones</h3>
                  <p className="ba-detail-obs-text">{detalle.observaciones}</p>
                </div>
              )}

            </div>

            <div className="ba-modal-footer">
              <button className="ba-btn-secondary" onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
