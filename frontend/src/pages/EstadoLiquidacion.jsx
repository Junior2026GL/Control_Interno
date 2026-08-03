import { useEffect, useState, useContext, useRef, useMemo } from 'react';
import {
  FiSearch, FiX, FiUser, FiCreditCard,
  FiClock, FiRefreshCw, FiAlertTriangle, FiCheckCircle,
} from 'react-icons/fi';
import {
  HiOutlineMapPin, HiOutlineCheckBadge, HiOutlineUsers,
} from 'react-icons/hi2';
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
                  <div className="el-dip-pills">
                    <span className="el-pill el-pill--depto">
                      <HiOutlineMapPin size={13} /> {selectedDip.departamento}
                    </span>
                    <span className={`el-pill ${selectedDip.tipo === 'PROPIETARIO' ? 'el-pill--prop' : 'el-pill--sup'}`}>
                      {selectedDip.tipo === 'PROPIETARIO'
                        ? <HiOutlineCheckBadge size={13} />
                        : <HiOutlineUsers size={13} />}
                      {selectedDip.tipo === 'PROPIETARIO' ? 'Propietario' : 'Suplente'}
                    </span>
                    {selectedDip.partido && (
                      <span className="el-pill el-pill--partido">{selectedDip.partido}</span>
                    )}
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
              <button className="ps-liq-detail-close" onClick={() => setDetailItem(null)}>
                <FiX size={16} />
              </button>
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