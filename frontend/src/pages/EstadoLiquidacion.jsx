import { useEffect, useState, useContext, useRef, useMemo } from 'react';
import {
  FiSearch, FiX, FiUser, FiCreditCard,
  FiClock, FiRefreshCw, FiAlertTriangle, FiCheckCircle, FiPrinter,
} from 'react-icons/fi';
import {
  HiOutlineMapPin, HiOutlineCheckBadge, HiOutlineUsers,
} from 'react-icons/hi2';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './PresupuestoDiputados.css';
import './EstadoLiquidacion.css';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [2026, 2027, 2028, 2029, 2030];
const PARTIDO_LOGO = {
  NACIONAL: '/nacional.JPG',
  LIBERAL:  '/liberal.JPG',
  LIBRE:    '/libre.JPG',
  PINU:     '/pinu.JPG',
  DC:       '/dc.JPG',
};

function formatHNL(v) {
  return `L ${(+(v || 0)).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatFecha(str) {
  if (!str) return '-';
  const s = str.slice(0, 10);
  const [y, m, d] = s.split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function computeEstado(ayuda) {
  if (ayuda.estado_liquidacion === 'sin_liquidar') {
    const limite = new Date(ayuda.fecha + 'T12:00:00');
    limite.setDate(limite.getDate() + 30);
    if (new Date() > limite) return 'plazo_vencido';
  }
  return ayuda.estado_liquidacion || 'sin_liquidar';
}

const LIQ_ICONS = {
  sin_liquidar:  <FiClock size={20} />,
  en_proceso:    <FiRefreshCw size={20} />,
  plazo_vencido: <FiAlertTriangle size={20} />,
  liquido:       <FiCheckCircle size={20} />,
};

const LIQ_META = [
  { key: 'sin_liquidar',  label: 'Sin Liquidar',  cls: 'sinliq'  },
  { key: 'en_proceso',    label: 'En Proceso',    cls: 'proceso' },
  { key: 'plazo_vencido', label: 'Plazo Vencido', cls: 'vencido' },
  { key: 'liquido',       label: 'Liquido',        cls: 'liquido' },
];

export default function EstadoLiquidacion() {
  const { user: me } = useContext(AuthContext);

  const [datos, setDatos]             = useState([]);
  const [loadingDips, setLoadingDips] = useState(true);
  const [dipSearch, setDipSearch]     = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedDip, setSelectedDip] = useState(null);
  const searchRef = useRef(null);
  const [anio, setAnio]     = useState(CURRENT_YEAR);
  const [ayudas, setAyudas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noData, setNoData]   = useState(false);
  const [detailItem, setDetailItem] = useState(null);

  useEffect(() => {
    api.get('/diputados', { headers: authHeaders() })
      .then(r => setDatos(r.data))
      .catch(() => {})
      .finally(() => setLoadingDips(false));
  }, []);

  useEffect(() => {
    const handler = e => {
      if (searchRef.current && !searchRef.current.contains(e.target))
        setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  useEffect(() => {
    if (!selectedDip) return;
    loadData();
  }, [selectedDip, anio]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setLoading(true);
    setAyudas([]);
    setNoData(false);
    try {
      const r = await api.get(
        `/presupuesto/diputado/${selectedDip.id}?anio=${anio}`,
        { headers: authHeaders() }
      );
      if (!r.data.presupuesto) {
        setNoData(true);
      } else {
        setAyudas(r.data.ayudas || []);
      }
    } catch {
      setNoData(true);
    } finally {
      setLoading(false);
    }
  };

  const selectDip = d => {
    setSelectedDip(d);
    setDipSearch('');
    setShowDropdown(false);
    setNoData(false);
  };

  const clearSelection = () => {
    setSelectedDip(null);
    setAyudas([]);
    setNoData(false);
  };

  const liqStats = useMemo(() => {
    return LIQ_META.map(meta => {
      let monto = 0, count = 0;
      ayudas.forEach(a => {
        if (computeEstado(a) === meta.key) {
          monto += +(a.monto || 0);
          count++;
        }
      });
      return { ...meta, monto, count };
    });
  }, [ayudas]);

  const detailAyudas = useMemo(() => {
    if (!detailItem) return [];
    return ayudas.filter(a => computeEstado(a) === detailItem.key);
  }, [detailItem, ayudas]);

  const handlePrintPDF = async () => {
    const C_AZUL_OSC = [22,  51, 110];
    const C_AZUL     = [39,  76, 141];
    const C_GRIS     = [235, 242, 255];
    const C_ROJO     = [185, 28,  28];
    const C_ROJO_OSC = [127, 11,  11];
    const C_BLANCO   = [255, 255, 255];
    const C_NEGRO    = [30,  30,  30];

    const isVencido = detailItem?.cls === 'vencido';
    const C_HEADER  = isVencido ? C_ROJO : C_AZUL;
    const C_HDR_OSC = isVencido ? C_ROJO_OSC : C_AZUL_OSC;

    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const W   = doc.internal.pageSize.getWidth();
    const BM  = 5;
    const P   = 5;
    const x0  = BM + P;
    const CW  = W - 2 * (BM + P);
    let   y   = BM + P;

    // Logo institucional
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

    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(100, 120, 160);
    doc.text('AÑO', infoMid, y + 7, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...C_AZUL);
    doc.text(String(anio), infoMid, y + 14, { align: 'center' });
    doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.2);
    doc.line(infoX + 3, y + 16, infoX + INFO_W - 3, y + 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(100, 120, 160);
    doc.text('Generado:', infoMid, y + 21, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C_AZUL_OSC);
    doc.text(fechaGen, infoMid, y + 26, { align: 'center' });
    doc.text(horaGen,  infoMid, y + 31, { align: 'center' });

    y += HDR_H + 6;

    // Banda de estado (color según tipo)
    doc.setFillColor(...C_HEADER);
    doc.roundedRect(x0, y, CW, 11, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...C_BLANCO);
    doc.text(`ESTADO: ${detailItem?.label?.toUpperCase()}`, x0 + CW / 2, y + 7.5, { align: 'center' });
    y += 15;

    // Datos del diputado
    doc.setFillColor(...C_GRIS);
    doc.setDrawColor(...C_AZUL); doc.setLineWidth(0.3);
    doc.rect(x0, y, CW, 16, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(100, 120, 160);
    doc.text('DIPUTADO', x0 + 4, y + 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...C_AZUL_OSC);
    doc.text(selectedDip?.nombre?.toUpperCase() || '', x0 + 4, y + 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C_AZUL);
    doc.text(`${selectedDip?.departamento || ''} · Año ${anio}`, x0 + CW - 4, y + 13, { align: 'right' });
    y += 22;

    // Tabla de ayudas
    const total = detailAyudas.reduce((s, a) => s + +(a.monto || 0), 0);
    const rows  = detailAyudas.map((a, i) => [
      i + 1,
      formatFecha(a.fecha),
      a.concepto || '',
      a.beneficiario || '-',
      formatHNL(a.monto),
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: x0, right: BM + P },
      head: [['#', 'Fecha', 'Concepto', 'Beneficiario', 'Monto']],
      body: rows,
      foot: [['', '', '', 'TOTAL', formatHNL(total)]],
      theme: 'grid',
      styles:     { fontSize: 8, cellPadding: 2.5, textColor: C_NEGRO, lineColor: [200, 210, 230] },
      headStyles: { fillColor: C_HEADER, textColor: C_BLANCO, fontStyle: 'bold', fontSize: 8.5 },
      footStyles: { fillColor: C_HDR_OSC, textColor: C_BLANCO, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: C_GRIS },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 30 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 50 },
        4: { cellWidth: 32, halign: 'right', fontStyle: 'bold', textColor: C_HDR_OSC },
      },
    });

    // Footer de página
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      const pH = doc.internal.pageSize.getHeight();
      doc.setDrawColor(...C_AZUL); doc.setLineWidth(1.2);
      doc.line(x0, pH - BM - 8, x0 + CW, pH - BM - 8);
      doc.setFillColor(...C_AZUL);
      doc.rect(x0, pH - BM - 8, CW, 8, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...C_BLANCO);
      doc.text('CONGRESO NACIONAL · PAGADURÍA ESPECIAL · DOCUMENTO GENERADO AUTOMÁTICAMENTE', x0 + CW / 2, pH - BM - 3.5, { align: 'center' });
    }

    const safeName = (selectedDip?.nombre || 'diputado').replace(/\s+/g, '_');
    doc.save(`plazo_vencido_${safeName}_${anio}.pdf`);
  };

  return (
    <div className="page-shell">
      <Navbar />

      <div className="page-content el-page">

        {/* Page header */}
        <div className="el-header">
          <div className="el-header-left">
            <span className="el-header-badge">Pagaduria Especial</span>
            <h1 className="el-header-title">Estado de Liquidacion</h1>
            <p className="el-header-sub">Consulta y seguimiento por diputado</p>
          </div>
          <div className="el-header-year-wrap">
            <span className="el-year-label">Año fiscal</span>
            <select
              className="el-year-select"
              value={anio}
              onChange={e => setAnio(+e.target.value)}
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Search / Deputy */}
        {!selectedDip ? (
          <div className="el-search-card" ref={searchRef}>
            <div className="el-search-card-top">
              <div className="el-search-icon-wrap"><FiUser size={20} /></div>
              <div>
                <div className="el-search-card-title">Seleccionar Diputado</div>
                <div className="el-search-card-sub">Busca por nombre, departamento o partido</div>
              </div>
            </div>
            <div className="el-search-input-wrap">
              <FiSearch className="el-search-ico" size={16} />
              <input
                className="el-search-input"
                placeholder={loadingDips ? 'Cargando diputados...' : 'Nombre, departamento o partido...'}
                value={dipSearch}
                onChange={e => { setDipSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => dipSearch && setShowDropdown(true)}
                disabled={loadingDips}
                autoComplete="off"
              />
              {dipSearch && (
                <button className="el-search-clear" onClick={() => { setDipSearch(''); setShowDropdown(false); }}>
                  <FiX size={14} />
                </button>
              )}
            </div>
            {showDropdown && dipSearch && (
              <div className="el-dropdown">
                {dipResults.length > 0 ? dipResults.map(d => (
                  <div key={d.id} className="el-dd-item" onClick={() => selectDip(d)}>
                    <div className="el-dd-avatar"><FiUser size={14} /></div>
                    <div className="el-dd-info">
                      <div className="el-dd-nombre">{d.nombre}</div>
                      <div className="el-dd-meta">
                        {d.departamento} &middot; {d.tipo === 'PROPIETARIO' ? 'Propietario' : 'Suplente'}
                        {d.partido ? ` · ${d.partido}` : ''}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="el-dd-empty">No se encontraron diputados activos.</div>
                )}
              </div>
            )}
            {!dipSearch && (
              <div className="el-search-hint-wrap">
                <FiSearch size={28} className="el-search-hint-icon" />
                <p>Escribe para buscar un diputado</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Deputy banner */}
            <div className="el-dip-banner">
              <div className="el-dip-banner-left">
                <div className="el-dip-logo">
                  <img src="/logo-congreso.png.png" alt="" />
                </div>
                {selectedDip.partido && PARTIDO_LOGO[selectedDip.partido] && (
                  <div className="el-dip-flag">
                    <img
                      src={PARTIDO_LOGO[selectedDip.partido]}
                      alt={selectedDip.partido}
                      onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="el-dip-info">
                  <h2 className="el-dip-name">{selectedDip.nombre}</h2>
                  <div className="ps-dip-chips">
                    <span className="ps-dip-chip ps-dip-chip--depto">
                      <span className="ps-dip-chip-icon"><HiOutlineMapPin size={18} /></span>
                      <span className="ps-dip-chip-body">
                        <span className="ps-dip-chip-label">Departamento</span>
                        <span className="ps-dip-chip-value">{selectedDip.departamento}</span>
                      </span>
                    </span>
                    <span className={`ps-dip-chip ps-dip-chip--tipo ${selectedDip.tipo === 'PROPIETARIO' ? 'prop' : 'sup'}`}>
                      <span className="ps-dip-chip-icon">
                        {selectedDip.tipo === 'PROPIETARIO'
                          ? <HiOutlineCheckBadge size={18} />
                          : <HiOutlineUsers size={18} />}
                      </span>
                      <span className="ps-dip-chip-body">
                        <span className="ps-dip-chip-label">Tipo</span>
                        <span className="ps-dip-chip-value">{selectedDip.tipo === 'PROPIETARIO' ? 'Propietario' : 'Suplente'}</span>
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              <button className="el-change-btn" onClick={clearSelection}>
                <FiX size={13} /> Cambiar
              </button>
            </div>

            {/* Liquidation stats */}
            {loading ? (
              <div className="el-state-msg">
                <span className="el-spinner" /> Cargando datos...
              </div>
            ) : noData ? (
              <div className="el-state-msg el-state-msg--empty">
                Sin presupuesto registrado para <strong>{selectedDip.nombre}</strong> en {anio}.
              </div>
            ) : (
              <>
                <div className="el-section-label">
                  <span className="el-section-dot" />
                  Estado de Liquidacion de Ayudas &middot; {anio}
                </div>
                <div className="el-liq-grid">
                  {liqStats.map(item => (
                    <div
                      key={item.key}
                      className={`el-liq-card el-liq-card--${item.cls}`}
                      onClick={() => setDetailItem(item)}
                    >
                      <div className="el-liq-card-header">
                        <span className="el-liq-card-icon">{LIQ_ICONS[item.key]}</span>
                        <span className="el-liq-card-label">{item.label}</span>
                      </div>
                      <div className="el-liq-card-body">
                        <span className="el-liq-card-count">{item.count}</span>
                        <span className="el-liq-card-unit">ayuda{item.count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="el-liq-card-footer">Ver detalle</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Detail modal */}
      {detailItem && (
        <div className="ps-overlay" onClick={() => setDetailItem(null)}>
          <div className="ps-liq-detail-modal" onClick={e => e.stopPropagation()}>
            <div
              className="ps-liq-detail-header"
              style={{
                background: detailItem.cls === 'sinliq'  ? '#6b7280'
                          : detailItem.cls === 'proceso' ? 'linear-gradient(135deg,#1d4ed8,#2563eb)'
                          : detailItem.cls === 'vencido' ? 'linear-gradient(135deg,#b91c1c,#dc2626)'
                          : 'linear-gradient(135deg,#15803d,#16a34a)',
              }}
            >
              <div className="ps-liq-detail-header-left">
                <span className="ps-liq-detail-icon">{LIQ_ICONS[detailItem.key]}</span>
                <div>
                  <div className="ps-liq-detail-title">{detailItem.label}</div>
                  <div className="ps-liq-detail-sub">{selectedDip?.nombre} &middot; {anio}</div>
                </div>
              </div>
              <div className="ps-liq-detail-header-actions">
                {detailAyudas.length > 0 && (
                  <button className="ps-liq-detail-print" onClick={handlePrintPDF} title="Imprimir / Exportar PDF">
                    <FiPrinter size={15} />
                    <span>Imprimir</span>
                  </button>
                )}
                <button className="ps-liq-detail-close" onClick={() => setDetailItem(null)}>
                  <FiX size={16} />
                </button>
              </div>
            </div>
            <div className="ps-liq-detail-body">
              {detailAyudas.length === 0 ? (
                <div className="ps-liq-detail-empty">No hay ayudas en este estado.</div>
              ) : (
                <table className="ps-liq-detail-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Fecha</th>
                      <th>Concepto</th>
                      <th>Beneficiario</th>
                      <th className="ps-liq-th-r">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailAyudas.map((a, i) => (
                      <tr key={a.id}>
                        <td className="ps-liq-td-num">{i + 1}</td>
                        <td className="ps-liq-td-fecha">{formatFecha(a.fecha)}</td>
                        <td className="ps-liq-td-concepto">{a.concepto}</td>
                        <td>{a.beneficiario || '-'}</td>
                        <td className="ps-liq-td-monto">{formatHNL(a.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="ps-liq-tfoot-lbl">Total</td>
                      <td className="ps-liq-tfoot-total">
                        {formatHNL(detailAyudas.reduce((s, a) => s + +(a.monto || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}