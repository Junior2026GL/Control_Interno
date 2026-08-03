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
  if (!str) return '—';
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
  { key: 'liquido',       label: 'Líquido',       cls: 'liquido' },
];

export default function EstadoLiquidacion() {
  const { user: me } = useContext(AuthContext);

  /* ── diputados list ─────────────────────────────────────── */
  const [datos, setDatos]           = useState([]);
  const [loadingDips, setLoadingDips] = useState(true);

  /* ── search ─────────────────────────────────────────────── */
  const [dipSearch, setDipSearch]       = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedDip, setSelectedDip]   = useState(null);
  const searchRef = useRef(null);

  /* ── year ───────────────────────────────────────────────── */
  const [anio, setAnio] = useState(CURRENT_YEAR);

  /* ── data ───────────────────────────────────────────────── */
  const [ayudas, setAyudas]         = useState([]);
  const [loading, setLoading]       = useState(false);
  const [noData, setNoData]         = useState(false);

  /* ── detail modal ───────────────────────────────────────── */
  const [detailItem, setDetailItem] = useState(null);

  /* ── load all deputies ──────────────────────────────────── */
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

  /* ── load data when deputy/year changes ─────────────────── */
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

  /* ── liquidation stats ──────────────────────────────────── */
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

  /* ── ayudas for detail modal ────────────────────────────── */
  const detailAyudas = useMemo(() => {
    if (!detailItem) return [];
    return ayudas.filter(a => computeEstado(a) === detailItem.key);
  }, [detailItem, ayudas]);

  return (
    <div className="page-shell">
      <Navbar />

      <div className="page-content" style={{ maxWidth: 1100 }}>

        {/* ── Page header ── */}
        <div className="ps-page-header">
          <div>
            <h1 className="el-page-title">Estado de Liquidación</h1>
            <p>Consulta el estado de liquidación de ayudas sociales por diputado</p>
          </div>
          <div className="ps-header-controls">
            <div className="ps-header-year">
              <label htmlFor="el-year-sel">Año</label>
              <select
                id="el-year-sel"
                className="ps-year-select"
                value={anio}
                onChange={e => setAnio(+e.target.value)}
              >
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Search / Deputy card ── */}
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
                        <div className="ps-dd-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
                <div className="el-search-hint">
                  <FiUser size={38} className="el-search-hint-icon" />
                  <p>Busque un diputado por nombre, departamento o partido para ver su estado de liquidación</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* ── Deputy info card ── */}
            <div className="ps-dip-card">
              <div className="ps-dip-info">
                <div className="ps-dip-avatars">
                  <div className="ps-dip-avatar">
                    <img src="/logo-congreso.png.png" alt="" />
                  </div>
                  {selectedDip.partido && PARTIDO_LOGO[selectedDip.partido] && (
                    <div className="ps-dip-flag">
                      <img
                        src={PARTIDO_LOGO[selectedDip.partido]}
                        alt={selectedDip.partido}
                        onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
                      />
                    </div>
                  )}
                </div>
                <div className="ps-dip-text">
                  <h2>{selectedDip.nombre}</h2>
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
              <button className="ps-change-btn" onClick={clearSelection}>
                <FiX size={14} /> Cambiar
              </button>
            </div>

            {/* ── Estado de Liquidación ── */}
            {loading ? (
              <div className="el-loading">Cargando datos…</div>
            ) : noData ? (
              <div className="el-no-data">
                No hay presupuesto registrado para <strong>{selectedDip.nombre}</strong> en {anio}.
              </div>
            ) : (
              <div className="ps-liq-estado-card">
                <div className="ps-liq-estado-header">Estado de Liquidación de Ayudas</div>
                <div className="ps-liq-estado-grid">
                  {liqStats.map(item => (
                    <div
                      key={item.key}
                      className={`ps-liq-item ps-liq-item--${item.cls} ps-liq-item--clickable`}
                      onClick={() => setDetailItem(item)}
                      title={`Ver detalle — ${item.label}`}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="ps-liq-item-label">
                        <span className="ps-liq-item-icon">{LIQ_ICONS[item.key]}</span>
                        {item.label}
                      </div>
                      <div className="ps-liq-item-body">
                          <span className="el-liq-count">{item.count}</span>
                          <span className="el-liq-label">ayuda{item.count !== 1 ? 's' : ''}</span>
                        <span className="ps-liq-ver-btn">Ver detalle ›</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Detail modal ── */}
      {detailItem && (
        <div className="ps-overlay" onClick={() => setDetailItem(null)}>
          <div
            className="ps-liq-detail-modal"
            onClick={e => e.stopPropagation()}
          >
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
                  <div className="ps-liq-detail-sub">
                    {selectedDip?.nombre} · {anio}
                  </div>
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
                        <td>{a.beneficiario || '—'}</td>
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
