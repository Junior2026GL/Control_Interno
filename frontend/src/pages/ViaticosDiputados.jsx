import { useEffect, useState, useContext, useMemo, useRef } from 'react';
import {
  FiPlus, FiEdit2, FiTrash2, FiSearch, FiX, FiFilter,
  FiDollarSign, FiMapPin, FiCalendar, FiUser, FiAlertCircle,
  FiDownload, FiChevronDown, FiGlobe, FiHome, FiCoffee, FiTruck, FiMoreHorizontal,
} from 'react-icons/fi';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './ViaticosDiputados.css';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [2025, 2026, 2027, 2028, 2029, 2030];
const PAGE_SIZE = 15;

const TASA_REF = 25.00;

const ESTADOS = [
  { value: 'pendiente',  label: 'Pendiente',  cls: 'vd-badge--pendiente' },
  { value: 'aprobado',   label: 'Aprobado',   cls: 'vd-badge--aprobado'  },
  { value: 'liquidado',  label: 'Liquidado',  cls: 'vd-badge--liquidado' },
  { value: 'rechazado',  label: 'Rechazado',  cls: 'vd-badge--rechazado' },
];

function estadoBadge(estado) {
  const e = ESTADOS.find(x => x.value === estado) || ESTADOS[0];
  return <span className={`vd-badge ${e.cls}`}>{e.label}</span>;
}

function formatHNL(v) {
  return `L ${(+(v || 0)).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatUSD(v) {
  return `$ ${(+(v || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatMonto(v, moneda) {
  return moneda === 'USD' ? formatUSD(v) : formatHNL(v);
}
function formatFecha(str) {
  if (!str) return '—';
  const s = typeof str === 'string' ? str.slice(0, 10) : str.toISOString().slice(0, 10);
  const [y, m, d] = s.split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

const EMPTY_FORM = {
  diputado_id: '',
  motivo: '',
  lugar: '',
  destino_internacional: false,
  pais_destino: '',
  fecha_evento_inicio: '',
  fecha_evento_fin: '',
  fecha_salida: '',
  fecha_regreso: '',
  moneda: 'HNL',
  tasa_cambio: TASA_REF,
  hospedaje: '',
  alimentacion: '',
  transporte: '',
  otros: '',
  estado: 'pendiente',
  observaciones: '',
};

export default function ViaticosDiputados() {
  const { user: me } = useContext(AuthContext);
  const canEdit = me?.rol === 'SUPER_ADMIN' || me?.rol === 'ADMIN' || me?.rol === 'ASISTENTE';

  /* ── datos ─────────────────────────────────────────────────── */
  const [registros, setRegistros]   = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [resumen, setResumen]       = useState(null);
  const [diputados, setDiputados]   = useState([]);

  /* ── filtros ───────────────────────────────────────────────── */
  const [anio, setAnio]             = useState(CURRENT_YEAR);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroDip, setFiltroDip]   = useState('');
  const [searchQ, setSearchQ]       = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage]             = useState(1);
  const searchTimer                 = useRef(null);

  /* ── dropdown diputado ─────────────────────────────────────── */
  const [dipSearch, setDipSearch]   = useState('');
  const [showDipDrop, setShowDipDrop] = useState(false);
  const [selectedDip, setSelectedDip] = useState(null);
  const dipDropRef                  = useRef(null);

  /* ── modal form ────────────────────────────────────────────── */
  const [modal, setModal]           = useState(null); // null | 'nuevo' | 'editar'
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formDipSearch, setFormDipSearch] = useState('');
  const [showFormDrop, setShowFormDrop]   = useState(false);
  const [formDip, setFormDip]       = useState(null);
  const formDipRef                  = useRef(null);
  const [formErr, setFormErr]       = useState('');
  const [saving, setSaving]         = useState(false);

  /* ── confirmar delete ──────────────────────────────────────── */
  const [confirmDel, setConfirmDel] = useState(null);

  /* ── toast ─────────────────────────────────────────────────── */
  const [toast, setToast]           = useState(null);
  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  /* ── cargar diputados una vez ──────────────────────────────── */
  useEffect(() => {
    api.get('/diputados', { headers: authHeaders() })
      .then(r => setDiputados(r.data.filter(d => d.activo)))
      .catch(() => {});
  }, []);

  /* ── cerrar dropdowns fuera del clic ───────────────────────── */
  useEffect(() => {
    const h = e => {
      if (dipDropRef.current  && !dipDropRef.current.contains(e.target))  setShowDipDrop(false);
      if (formDipRef.current  && !formDipRef.current.contains(e.target))  setShowFormDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ── cargar registros ──────────────────────────────────────── */
  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ anio, page, limit: PAGE_SIZE });
      if (filtroEstado) params.append('estado', filtroEstado);
      if (filtroDip)    params.append('diputado_id', filtroDip);
      if (searchQ)      params.append('q', searchQ);
      const [r, res2] = await Promise.all([
        api.get(`/viaticos-diputados?${params}`, { headers: authHeaders() }),
        api.get(`/viaticos-diputados/resumen?anio=${anio}`, { headers: authHeaders() }),
      ]);
      setRegistros(r.data.data);
      setTotal(r.data.total);
      setResumen(res2.data);
    } catch {
      showToast('Error al cargar los viáticos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [anio, filtroEstado, filtroDip, searchQ, page]); // eslint-disable-line

  /* ── dropdown diputado (filtro tabla) ──────────────────────── */
  const dipResultsFilter = useMemo(() => {
    if (!dipSearch.trim()) return diputados.slice(0, 10);
    const q = dipSearch.toLowerCase();
    return diputados.filter(d =>
      d.nombre.toLowerCase().includes(q) || (d.departamento || '').toLowerCase().includes(q)
    ).slice(0, 12);
  }, [diputados, dipSearch]);

  /* ── dropdown diputado (modal form) ───────────────────────── */
  const dipResultsForm = useMemo(() => {
    if (!formDipSearch.trim()) return diputados.slice(0, 10);
    const q = formDipSearch.toLowerCase();
    return diputados.filter(d =>
      d.nombre.toLowerCase().includes(q) || (d.departamento || '').toLowerCase().includes(q)
    ).slice(0, 12);
  }, [diputados, formDipSearch]);

  /* ── totales del form ──────────────────────────────────────── */
  const totalForm = useMemo(() => {
    return (parseFloat(form.hospedaje) || 0)
      + (parseFloat(form.alimentacion) || 0)
      + (parseFloat(form.transporte) || 0)
      + (parseFloat(form.otros) || 0);
  }, [form.hospedaje, form.alimentacion, form.transporte, form.otros]);

  const totalHNLEquiv = useMemo(() => {
    if (form.moneda === 'USD') return totalForm * (parseFloat(form.tasa_cambio) || TASA_REF);
    return totalForm;
  }, [totalForm, form.moneda, form.tasa_cambio]);

  /* ── abrir modal nuevo ─────────────────────────────────────── */
  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormDip(null);
    setFormDipSearch('');
    setFormErr('');
    setModal('nuevo');
  };

  /* ── abrir modal editar ────────────────────────────────────── */
  const openEdit = r => {
    setEditing(r);
    const dip = diputados.find(d => d.id === r.diputado_id);
    setFormDip(dip || { id: r.diputado_id, nombre: r.diputado_nombre, tipo: r.diputado_tipo, partido: r.partido, departamento: r.departamento });
    setFormDipSearch('');
    setForm({
      diputado_id:          r.diputado_id,
      motivo:               r.motivo || '',
      lugar:                r.lugar || '',
      destino_internacional: !!r.destino_internacional,
      pais_destino:         r.pais_destino || '',
      fecha_evento_inicio:  r.fecha_evento_inicio?.slice(0, 10) || '',
      fecha_evento_fin:     r.fecha_evento_fin?.slice(0, 10) || '',
      fecha_salida:         r.fecha_salida?.slice(0, 10) || '',
      fecha_regreso:        r.fecha_regreso?.slice(0, 10) || '',
      moneda:               r.moneda || 'HNL',
      tasa_cambio:          r.tasa_cambio || TASA_REF,
      hospedaje:            r.hospedaje || '',
      alimentacion:         r.alimentacion || '',
      transporte:           r.transporte || '',
      otros:                r.otros || '',
      estado:               r.estado || 'pendiente',
      observaciones:        r.observaciones || '',
    });
    setFormErr('');
    setModal('editar');
  };

  /* ── guardar ───────────────────────────────────────────────── */
  const handleSave = async () => {
    if (!formDip)              return setFormErr('Seleccioná un diputado.');
    if (!form.motivo.trim())   return setFormErr('El motivo es requerido.');
    if (!form.lugar.trim())    return setFormErr('El lugar es requerido.');
    if (!form.fecha_evento_inicio) return setFormErr('La fecha del evento es requerida.');
    if (!form.fecha_salida)    return setFormErr('La fecha de salida es requerida.');
    if (!form.fecha_regreso)   return setFormErr('La fecha de regreso es requerida.');

    setSaving(true);
    setFormErr('');
    try {
      const payload = { ...form, diputado_id: formDip.id };
      if (modal === 'nuevo') {
        await api.post('/viaticos-diputados', payload, { headers: authHeaders() });
        showToast('Viático registrado correctamente.', 'ok');
      } else {
        await api.put(`/viaticos-diputados/${editing.id}`, payload, { headers: authHeaders() });
        showToast('Viático actualizado correctamente.', 'ok');
      }
      setModal(null);
      loadData();
    } catch (err) {
      setFormErr(err?.response?.data?.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  /* ── eliminar ──────────────────────────────────────────────── */
  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      await api.delete(`/viaticos-diputados/${confirmDel.id}`, { headers: authHeaders() });
      showToast('Viático eliminado.', 'ok');
      setConfirmDel(null);
      loadData();
    } catch {
      showToast('Error al eliminar.');
    }
  };

  /* ── export PDF ─────────────────────────────────────────────── */
  const exportPDF = () => {
    const C_AZUL   = [39, 76, 141];
    const C_BLANCO = [255, 255, 255];
    const C_GRIS   = [235, 242, 255];
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const W   = doc.internal.pageSize.getWidth();
    const BM  = 5; const x0 = BM + 5; const CW = W - 2 * (BM + 5);

    // Header
    doc.setFillColor(...C_AZUL);
    doc.rect(x0, BM + 5, CW, 10, 'F');
    doc.setTextColor(...C_BLANCO);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(`VIÁTICOS DE DIPUTADOS — ${anio}`, x0 + CW / 2, BM + 12, { align: 'center' });

    const rows = registros.map((r, i) => [
      i + 1,
      r.diputado_nombre,
      r.partido || '—',
      r.diputado_tipo === 'PROPIETARIO' ? 'Prop.' : 'Sup.',
      r.motivo.length > 40 ? r.motivo.slice(0, 40) + '…' : r.motivo,
      r.lugar,
      formatFecha(r.fecha_salida),
      formatFecha(r.fecha_regreso),
      r.moneda === 'USD' ? formatUSD(r.total_moneda) : formatHNL(r.total_moneda),
      r.estado.charAt(0).toUpperCase() + r.estado.slice(1),
    ]);

    autoTable(doc, {
      startY: BM + 18,
      head: [['#', 'Diputado', 'Partido', 'Tipo', 'Motivo', 'Lugar', 'Salida', 'Regreso', 'Total', 'Estado']],
      body: rows,
      styles: { fontSize: 7, cellPadding: 2, font: 'helvetica' },
      headStyles: { fillColor: C_AZUL, textColor: C_BLANCO, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: C_GRIS },
      margin: { left: x0, right: x0 },
    });

    // Footer
    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFillColor(...C_AZUL);
      doc.rect(x0 - 4, doc.internal.pageSize.getHeight() - BM - 9, CW + 8, 9, 'F');
      doc.setFontSize(8); doc.setTextColor(...C_BLANCO);
      doc.text(`Congreso Nacional — Pagaduría Especial`, x0, doc.internal.pageSize.getHeight() - BM - 3);
      doc.text(`Pág. ${p}/${pages}`, x0 + CW / 2, doc.internal.pageSize.getHeight() - BM - 3, { align: 'center' });
    }
    doc.save(`Viaticos_Diputados_${anio}.pdf`);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="page-shell">
      <Navbar />

      {toast && (
        <div className={`vd-toast vd-toast--${toast.type}`}>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)}>×</button>
        </div>
      )}

      <div className="page-content" style={{ maxWidth: 1200 }}>

        {/* ── Header ── */}
        <div className="vd-page-header">
          <div>
            <h1><FiDollarSign size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />Viáticos de Diputados</h1>
            <p>Registro y control de gastos de viaje: hospedaje, alimentación, transporte</p>
          </div>
          <div className="vd-header-actions">
            <select className="vd-year-select" value={anio} onChange={e => { setAnio(+e.target.value); setPage(1); }}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {canEdit && (
              <button className="vd-btn-primary" onClick={openNew}>
                <FiPlus size={15} /> Nuevo Viático
              </button>
            )}
          </div>
        </div>

        {/* ── Stat Cards ── */}
        {resumen && (
          <div className="vd-stats-grid">
            <div className="vd-stat vd-stat--total">
              <span className="vd-stat-lbl">Total Registros</span>
              <span className="vd-stat-val">{resumen.total_registros || 0}</span>
            </div>
            <div className="vd-stat vd-stat--monto">
              <span className="vd-stat-lbl">Total Gastado (equiv. HNL)</span>
              <span className="vd-stat-val">{formatHNL(resumen.total_hnl_equiv)}</span>
            </div>
            <div className="vd-stat vd-stat--hospedaje">
              <FiHome size={16} className="vd-stat-icon" />
              <span className="vd-stat-lbl">Hospedaje</span>
              <span className="vd-stat-val">{formatHNL(resumen.total_hospedaje)}</span>
            </div>
            <div className="vd-stat vd-stat--alimentacion">
              <FiCoffee size={16} className="vd-stat-icon" />
              <span className="vd-stat-lbl">Alimentación</span>
              <span className="vd-stat-val">{formatHNL(resumen.total_alimentacion)}</span>
            </div>
            <div className="vd-stat vd-stat--transporte">
              <FiTruck size={16} className="vd-stat-icon" />
              <span className="vd-stat-lbl">Transporte</span>
              <span className="vd-stat-val">{formatHNL(resumen.total_transporte)}</span>
            </div>
          </div>
        )}

        {/* ── Estado badges resumen ── */}
        {resumen && (
          <div className="vd-estado-row">
            {[
              { k: 'pendientes',  label: 'Pendientes',  cls: 'pendiente' },
              { k: 'aprobados',   label: 'Aprobados',   cls: 'aprobado'  },
              { k: 'liquidados',  label: 'Liquidados',  cls: 'liquidado' },
              { k: 'rechazados',  label: 'Rechazados',  cls: 'rechazado' },
            ].map(({ k, label, cls }) => (
              <div key={k} className={`vd-estado-chip vd-estado-chip--${cls}`}>
                <span className="vd-estado-num">{resumen[k] || 0}</span>
                <span className="vd-estado-lbl">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className="vd-toolbar">
          {/* Filtro diputado */}
          <div className="vd-dip-filter" ref={dipDropRef}>
            {selectedDip ? (
              <div className="vd-dip-selected">
                <FiUser size={12} />
                <span>{selectedDip.nombre}</span>
                <button onClick={() => { setSelectedDip(null); setFiltroDip(''); setPage(1); }}><FiX size={11} /></button>
              </div>
            ) : (
              <div className="vd-dip-search-wrap">
                <FiSearch size={12} className="vd-dip-icon" />
                <input
                  className="vd-dip-input"
                  placeholder="Filtrar diputado…"
                  value={dipSearch}
                  onChange={e => { setDipSearch(e.target.value); setShowDipDrop(true); }}
                  onFocus={() => setShowDipDrop(true)}
                />
                <FiChevronDown size={12} className="vd-dip-chevron" />
                {showDipDrop && (
                  <div className="vd-dip-dropdown">
                    {dipResultsFilter.map(d => (
                      <div key={d.id} className="vd-dip-opt"
                        onClick={() => { setSelectedDip(d); setFiltroDip(d.id); setDipSearch(''); setShowDipDrop(false); setPage(1); }}>
                        <span className="vd-dip-opt-nombre">{d.nombre}</span>
                        <span className="vd-dip-opt-meta">{d.departamento} · {d.tipo === 'PROPIETARIO' ? 'Prop.' : 'Sup.'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Filtro estado */}
          <div className="vd-filters">
            {[['', 'Todos'], ...ESTADOS.map(e => [e.value, e.label])].map(([k, l]) => (
              <button key={k}
                className={`vd-fil-btn ${filtroEstado === k ? 'vd-fil-btn--active' : ''}`}
                onClick={() => { setFiltroEstado(k); setPage(1); }}>
                {l}
              </button>
            ))}
          </div>

          {/* Búsqueda texto */}
          <div className="vd-search-wrap">
            <FiSearch size={13} className="vd-search-icon" />
            <input
              className="vd-search"
              placeholder="Motivo, lugar…"
              value={searchInput}
              onChange={e => {
                setSearchInput(e.target.value);
                clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => { setSearchQ(e.target.value); setPage(1); }, 400);
              }}
            />
            {searchInput && (
              <button className="vd-search-clear" onClick={() => { setSearchInput(''); setSearchQ(''); setPage(1); }}>
                <FiX size={11} />
              </button>
            )}
          </div>

          <button className="vd-btn-export" onClick={exportPDF} disabled={!registros.length}>
            <FiDownload size={13} /> PDF
          </button>
        </div>

        {/* ── Tabla ── */}
        <div className="vd-card">
          {loading ? (
            <div className="vd-loading">Cargando viáticos…</div>
          ) : registros.length === 0 ? (
            <div className="vd-empty">
              <FiAlertCircle size={32} />
              <p>No hay viáticos registrados para {anio}.</p>
              {canEdit && <button className="vd-btn-primary" onClick={openNew}><FiPlus size={14} /> Registrar primero</button>}
            </div>
          ) : (
            <div className="vd-table-wrap">
              <table className="vd-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Diputado</th>
                    <th>Partido</th>
                    <th>Tipo</th>
                    <th>Motivo</th>
                    <th>Lugar</th>
                    <th>Salida</th>
                    <th>Regreso</th>
                    <th className="vd-th-r">Hospedaje</th>
                    <th className="vd-th-r">Aliment.</th>
                    <th className="vd-th-r">Transporte</th>
                    <th className="vd-th-r">Total</th>
                    <th>Estado</th>
                    {canEdit && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r, i) => (
                    <tr key={r.id}>
                      <td className="vd-td-num">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="vd-td-nombre">
                        <span className="vd-dip-nombre">{r.diputado_nombre}</span>
                        <span className="vd-dip-dept">{r.departamento}</span>
                      </td>
                      <td>
                        <span className="vd-partido-tag">{r.partido || '—'}</span>
                      </td>
                      <td>
                        <span className={`vd-tipo-tag vd-tipo-tag--${r.diputado_tipo === 'PROPIETARIO' ? 'prop' : 'sup'}`}>
                          {r.diputado_tipo === 'PROPIETARIO' ? 'Prop.' : 'Sup.'}
                        </span>
                      </td>
                      <td className="vd-td-motivo" title={r.motivo}>{r.motivo}</td>
                      <td>
                        <span className="vd-lugar">
                          {r.destino_internacional ? <FiGlobe size={11} style={{ color: '#7c3aed', marginRight: 4 }} /> : <FiMapPin size={11} style={{ color: '#0891b2', marginRight: 4 }} />}
                          {r.lugar}
                          {r.pais_destino && <span className="vd-pais"> ({r.pais_destino})</span>}
                        </span>
                      </td>
                      <td className="vd-td-fecha">{formatFecha(r.fecha_salida)}</td>
                      <td className="vd-td-fecha">{formatFecha(r.fecha_regreso)}</td>
                      <td className="vd-td-r">{formatMonto(r.hospedaje, r.moneda)}</td>
                      <td className="vd-td-r">{formatMonto(r.alimentacion, r.moneda)}</td>
                      <td className="vd-td-r">{formatMonto(r.transporte, r.moneda)}</td>
                      <td className="vd-td-r vd-td-total">
                        <span className="vd-total-main">{formatMonto(r.total_moneda, r.moneda)}</span>
                        {r.moneda === 'USD' && (
                          <span className="vd-total-equiv">{formatHNL(r.total_moneda * r.tasa_cambio)}</span>
                        )}
                      </td>
                      <td>{estadoBadge(r.estado)}</td>
                      {canEdit && (
                        <td className="vd-td-actions">
                          <button className="vd-action-btn vd-action-btn--edit" title="Editar" onClick={() => openEdit(r)}><FiEdit2 size={13} /></button>
                          <button className="vd-action-btn vd-action-btn--del"  title="Eliminar" onClick={() => setConfirmDel(r)}><FiTrash2 size={13} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="vd-pagination">
              <button className="vd-pag-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
              <span className="vd-pag-info">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
              </span>
              <button className="vd-pag-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            </div>
          )}
        </div>

      </div>

      {/* ── Modal Nuevo/Editar ──────────────────────────────────── */}
      {modal && (
        <div className="vd-overlay">
          <div className="vd-modal" onClick={e => e.stopPropagation()}>
            <div className="vd-modal-header">
              <h3>{modal === 'nuevo' ? 'Registrar Viático' : 'Editar Viático'}</h3>
              <button className="vd-modal-close" onClick={() => setModal(null)}>×</button>
            </div>

            <div className="vd-modal-body">

              {/* Diputado */}
              <div className="vd-form-group vd-form-group--full" ref={formDipRef}>
                <label className="vd-label">Diputado <span className="vd-req">*</span></label>
                {formDip ? (
                  <div className="vd-formdip-selected">
                    <div className="vd-formdip-info">
                      <span className="vd-formdip-nombre">{formDip.nombre}</span>
                      <span className="vd-formdip-meta">{formDip.partido} · {formDip.departamento} · {formDip.tipo === 'PROPIETARIO' ? 'Propietario' : 'Suplente'}</span>
                    </div>
                    <button className="vd-formdip-clear" onClick={() => { setFormDip(null); setForm(f => ({ ...f, diputado_id: '' })); }}>
                      <FiX size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="vd-formdip-search-wrap">
                    <FiSearch size={13} className="vd-formdip-icon" />
                    <input
                      className="vd-formdip-input"
                      placeholder="Buscar diputado por nombre o departamento…"
                      value={formDipSearch}
                      onChange={e => { setFormDipSearch(e.target.value); setShowFormDrop(true); }}
                      onFocus={() => setShowFormDrop(true)}
                    />
                    {showFormDrop && dipResultsForm.length > 0 && (
                      <div className="vd-formdip-dropdown">
                        {dipResultsForm.map(d => (
                          <div key={d.id} className="vd-formdip-opt"
                            onClick={() => { setFormDip(d); setForm(f => ({ ...f, diputado_id: d.id })); setFormDipSearch(''); setShowFormDrop(false); }}>
                            <span className="vd-formdip-opt-nombre">{d.nombre}</span>
                            <span className="vd-formdip-opt-meta">
                              {d.partido} · {d.departamento} ·{' '}
                              <span className={d.tipo === 'PROPIETARIO' ? 'vd-tag-prop' : 'vd-tag-sup'}>
                                {d.tipo === 'PROPIETARIO' ? 'Propietario' : 'Suplente'}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Motivo */}
              <div className="vd-form-group vd-form-group--full">
                <label className="vd-label">Motivo / Descripción del viaje <span className="vd-req">*</span></label>
                <textarea
                  className="vd-textarea"
                  rows={2}
                  placeholder="Ej: Participación en Cumbre Legislativa Centroamericana"
                  value={form.motivo}
                  onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                />
              </div>

              {/* Lugar y destino internacional */}
              <div className="vd-form-group">
                <label className="vd-label">Lugar / Ciudad destino <span className="vd-req">*</span></label>
                <input className="vd-input" placeholder="Ej: Tegucigalpa" value={form.lugar}
                  onChange={e => setForm(f => ({ ...f, lugar: e.target.value }))} />
              </div>

              <div className="vd-form-group vd-form-group--check-wrap">
                <label className="vd-checkbox-label">
                  <input type="checkbox" checked={form.destino_internacional}
                    onChange={e => setForm(f => ({ ...f, destino_internacional: e.target.checked, pais_destino: '' }))} />
                  Destino internacional
                </label>
                {form.destino_internacional && (
                  <input className="vd-input" placeholder="País" value={form.pais_destino}
                    onChange={e => setForm(f => ({ ...f, pais_destino: e.target.value }))} />
                )}
              </div>

              {/* Fechas evento */}
              <div className="vd-form-group">
                <label className="vd-label">Fecha inicio evento <span className="vd-req">*</span></label>
                <input type="date" className="vd-input" value={form.fecha_evento_inicio}
                  onChange={e => setForm(f => ({ ...f, fecha_evento_inicio: e.target.value }))} />
              </div>
              <div className="vd-form-group">
                <label className="vd-label">Fecha fin evento</label>
                <input type="date" className="vd-input" value={form.fecha_evento_fin}
                  onChange={e => setForm(f => ({ ...f, fecha_evento_fin: e.target.value }))} />
              </div>

              {/* Fechas estadía */}
              <div className="vd-form-group">
                <label className="vd-label">Fecha de salida <span className="vd-req">*</span></label>
                <input type="date" className="vd-input" value={form.fecha_salida}
                  onChange={e => setForm(f => ({ ...f, fecha_salida: e.target.value }))} />
              </div>
              <div className="vd-form-group">
                <label className="vd-label">Fecha de regreso <span className="vd-req">*</span></label>
                <input type="date" className="vd-input" value={form.fecha_regreso}
                  onChange={e => setForm(f => ({ ...f, fecha_regreso: e.target.value }))} />
              </div>

              {/* Moneda */}
              <div className="vd-form-group">
                <label className="vd-label">Moneda <span className="vd-req">*</span></label>
                <select className="vd-select" value={form.moneda}
                  onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}>
                  <option value="HNL">Lempiras (HNL)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>

              {form.moneda === 'USD' && (
                <div className="vd-form-group">
                  <label className="vd-label">Tasa de cambio (HNL × 1 USD)</label>
                  <input type="number" className="vd-input" step="0.01" min="1"
                    value={form.tasa_cambio}
                    onChange={e => setForm(f => ({ ...f, tasa_cambio: e.target.value }))} />
                </div>
              )}

              {/* Desglose */}
              <div className="vd-form-group">
                <label className="vd-label"><FiHome size={12} style={{ marginRight: 4 }} />Hospedaje</label>
                <input type="number" className="vd-input" min="0" step="0.01" placeholder="0.00"
                  value={form.hospedaje}
                  onChange={e => setForm(f => ({ ...f, hospedaje: e.target.value }))} />
              </div>
              <div className="vd-form-group">
                <label className="vd-label"><FiCoffee size={12} style={{ marginRight: 4 }} />Alimentación</label>
                <input type="number" className="vd-input" min="0" step="0.01" placeholder="0.00"
                  value={form.alimentacion}
                  onChange={e => setForm(f => ({ ...f, alimentacion: e.target.value }))} />
              </div>
              <div className="vd-form-group">
                <label className="vd-label"><FiTruck size={12} style={{ marginRight: 4 }} />Transporte</label>
                <input type="number" className="vd-input" min="0" step="0.01" placeholder="0.00"
                  value={form.transporte}
                  onChange={e => setForm(f => ({ ...f, transporte: e.target.value }))} />
              </div>
              <div className="vd-form-group">
                <label className="vd-label"><FiMoreHorizontal size={12} style={{ marginRight: 4 }} />Otros gastos</label>
                <input type="number" className="vd-input" min="0" step="0.01" placeholder="0.00"
                  value={form.otros}
                  onChange={e => setForm(f => ({ ...f, otros: e.target.value }))} />
              </div>

              {/* Total calculado */}
              <div className="vd-form-group vd-form-group--full">
                <div className="vd-total-preview">
                  <div className="vd-total-preview-item">
                    <span className="vd-total-preview-lbl">Total en {form.moneda}</span>
                    <span className="vd-total-preview-val">{formatMonto(totalForm, form.moneda)}</span>
                  </div>
                  {form.moneda === 'USD' && (
                    <div className="vd-total-preview-item">
                      <span className="vd-total-preview-lbl">Equivalente HNL (tasa {form.tasa_cambio})</span>
                      <span className="vd-total-preview-val vd-total-preview-val--hnl">{formatHNL(totalHNLEquiv)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Estado */}
              <div className="vd-form-group">
                <label className="vd-label">Estado</label>
                <select className="vd-select" value={form.estado}
                  onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                  {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>

              {/* Observaciones */}
              <div className="vd-form-group vd-form-group--full">
                <label className="vd-label">Observaciones</label>
                <textarea className="vd-textarea" rows={2} placeholder="Notas adicionales…"
                  value={form.observaciones}
                  onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
              </div>

              {formErr && (
                <div className="vd-form-error">
                  <FiAlertCircle size={14} /> {formErr}
                </div>
              )}
            </div>

            <div className="vd-modal-footer">
              <button className="vd-btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="vd-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando…' : modal === 'nuevo' ? 'Registrar' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmar eliminación ─────────────────────────────── */}
      {confirmDel && (
        <div className="vd-overlay" onClick={() => setConfirmDel(null)}>
          <div className="vd-confirm" onClick={e => e.stopPropagation()}>
            <FiAlertCircle size={32} className="vd-confirm-icon" />
            <h4>¿Eliminar viático?</h4>
            <p>{confirmDel.diputado_nombre}</p>
            <p className="vd-confirm-sub">{confirmDel.motivo}</p>
            <div className="vd-confirm-actions">
              <button className="vd-btn-secondary" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="vd-btn-danger" onClick={handleDelete}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
