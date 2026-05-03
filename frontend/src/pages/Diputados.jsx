import { useEffect, useState, useContext, useCallback } from 'react';
import {
  FiPlus, FiSearch, FiEdit2, FiX,
  FiUserX, FiUserCheck, FiFilter,
  FiPhone, FiMail, FiChevronLeft, FiChevronRight, FiEye,
  FiMapPin, FiHash, FiUser, FiCreditCard, FiFlag,
} from 'react-icons/fi';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './Diputados.css';

const TIPO_META = {
  PROPIETARIO: { label: 'Propietario', color: '#2563eb', bg: '#eff6ff' },
  SUPLENTE:    { label: 'Suplente',    color: '#059669', bg: '#ecfdf5' },
};

const DEPARTAMENTOS_HN = [
  'Atlántida','Choluteca','Colón','Comayagua','Copán','Cortés',
  'El Paraíso','Francisco Morazán','Gracias a Dios','Intibucá',
  'Islas de la Bahía','La Paz','Lempira','Ocotepeque','Olancho',
  'Santa Bárbara','Valle','Yoro',
];

const EMPTY_FORM = {
  departamento: '', numero: '', tipo: 'PROPIETARIO',
  nombre: '', identidad: '', partido: '', telefono: '', correo: '',
};

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function clientValidate({ departamento, tipo, nombre, correo, identidad, telefono }) {
  if (!departamento.trim() || departamento.trim().length < 2)
    return 'El departamento es requerido.';
  if (!['PROPIETARIO', 'SUPLENTE'].includes(tipo))
    return 'Tipo inválido.';
  if (!nombre.trim() || nombre.trim().length < 2)
    return 'El nombre es requerido (mínimo 2 caracteres).';
  if (nombre.trim().length > 200)
    return 'El nombre no puede superar 200 caracteres.';
  if (correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim()))
    return 'El correo no tiene un formato válido.';
  if (identidad && identidad.trim().length > 30)
    return 'La identidad no puede superar 30 caracteres.';
  if (telefono && telefono.trim().length > 25)
    return 'El teléfono no puede superar 25 caracteres.';
  return null;
}

export default function Diputados() {
  const { user: me } = useContext(AuthContext);
  const canEdit = me?.rol === 'SUPER_ADMIN' || me?.rol === 'ADMIN' || me?.rol === 'ASISTENTE';

  const [datos, setDatos]             = useState([]);
  const [search, setSearch]           = useState('');
  const [filterTipo, setFilterTipo]   = useState('ALL');
  const [filterActivo, setFilterActivo] = useState('ALL');
  const [filterDept, setFilterDept]     = useState('ALL');
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState(null);  // null | 'create' | 'edit'
  const [selected, setSelected]       = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [formErr, setFormErr]         = useState('');
  const [saving, setSaving]           = useState(false);
  const [confirm, setConfirm]         = useState(null);
  const [detail, setDetail]           = useState(null);  // diputado to view
  const [page, setPage]               = useState(1);
  const [toast, setToast]             = useState(null);
  const PAGE_SIZE = 10;

  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/diputados', { headers: authHeaders() });
      setDatos(res.data);
    } catch {
      showToast('Error al cargar los datos. Intente de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const deptOptions = [...new Set(datos.map(d => d.departamento).filter(Boolean))].sort();

  const filtered = datos.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || d.nombre.toLowerCase().includes(q)
      || d.departamento.toLowerCase().includes(q)
      || (d.partido || '').toLowerCase().includes(q)
      || (d.identidad || '').toLowerCase().includes(q)
      || (d.telefono || '').toLowerCase().includes(q)
      || (d.correo || '').toLowerCase().includes(q);
    const matchTipo   = filterTipo === 'ALL'  || d.tipo === filterTipo;
    const matchActivo = filterActivo === 'ALL'
      || (filterActivo === 'activo' ? d.activo : !d.activo);
    const matchDept   = filterDept === 'ALL'  || d.departamento.toLowerCase() === filterDept.toLowerCase();
    return matchSearch && matchTipo && matchActivo && matchDept;
  });

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage    = Math.min(page, totalPages);
  const paginated   = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // reset to page 1 when filters/search change
  const resetPage = useCallback(() => setPage(1), []);

  const stats = {
    total:        datos.length,
    propietarios: datos.filter(d => d.tipo === 'PROPIETARIO' && d.activo).length,
    suplentes:    datos.filter(d => d.tipo === 'SUPLENTE' && d.activo).length,
    inactivos:    datos.filter(d => !d.activo).length,
  };

  // ── open modals ─────────────────────────────────────────
  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormErr('');
    setModal('create');
  };

  const openEdit = (d) => {
    setSelected(d);
    setForm({
      departamento: d.departamento || '',
      numero:       d.numero != null ? String(d.numero) : '',
      tipo:         d.tipo || 'PROPIETARIO',
      nombre:       d.nombre || '',
      identidad:    d.identidad || '',
      partido:      d.partido || '',
      telefono:     d.telefono || '',
      correo:       d.correo || '',
    });
    setFormErr('');
    setModal('edit');
  };

  const closeModal = () => { setModal(null); setSelected(null); };

  // ── save ─────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setFormErr('');
    const err = clientValidate(form);
    if (err) { setFormErr(err); return; }
    setSaving(true);
    try {
      if (modal === 'create') {
        await api.post('/diputados', form, { headers: authHeaders() });
        showToast('Diputado creado correctamente.', 'ok');
      } else {
        await api.put(`/diputados/${selected.id}`, form, { headers: authHeaders() });
        showToast('Diputado actualizado correctamente.', 'ok');
      }
      closeModal();
      fetchData();
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Error al guardar. Intente de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // ── toggle activo ─────────────────────────────────────────
  const handleToggle = async (d) => {
    try {
      await api.patch(
        `/diputados/${d.id}/toggle`,
        { activo: d.activo ? 0 : 1 },
        { headers: authHeaders() }
      );
      setConfirm(null);
      fetchData();
      showToast(
        d.activo ? `${d.nombre} desactivado.` : `${d.nombre} activado.`,
        d.activo ? 'warn' : 'ok'
      );
    } catch (err) {
      setConfirm(null);
      showToast(err.response?.data?.message || 'Error al cambiar estado.');
    }
  };

  // ── render ────────────────────────────────────────────────
  return (
    <div className="page-shell">
      <Navbar />
      {toast && (
        <div className={`dip-toast dip-toast--${toast.type}`} role="alert">
          <span className="dip-toast-msg">{toast.msg}</span>
          <button className="dip-toast-close" onClick={() => setToast(null)} aria-label="Cerrar">×</button>
        </div>
      )}
      <div className="page-content" style={{ maxWidth: 1300 }}>

        {/* ── Header ── */}
        <div className="dip-page-header">
          <div>
            <h1>Diputados</h1>
            <p>{datos.length} registro{datos.length !== 1 ? 's' : ''} en total</p>
          </div>
          {canEdit && (
            <button className="dip-btn-primary" onClick={openCreate}>
              <FiPlus size={16} /> Nuevo Diputado
            </button>
          )}
        </div>

        {/* ── Stats ── */}
        <div className="dip-stats">
          <div className="dip-stat-card">
            <span className="dip-stat-value">{stats.total}</span>
            <span className="dip-stat-label">Total</span>
          </div>
          <div className="dip-stat-card propietario">
            <span className="dip-stat-value">{stats.propietarios}</span>
            <span className="dip-stat-label">Propietarios activos</span>
          </div>
          <div className="dip-stat-card suplente">
            <span className="dip-stat-value">{stats.suplentes}</span>
            <span className="dip-stat-label">Suplentes activos</span>
          </div>
          <div className="dip-stat-card inactivo">
            <span className="dip-stat-value">{stats.inactivos}</span>
            <span className="dip-stat-label">Inactivos</span>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="dip-toolbar">
          <div className="dip-search-wrap">
            <FiSearch className="dip-search-icon" size={15} />
            <input
              className="dip-search"
              placeholder="Buscar por nombre, departamento, partido…"
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage(); }}
            />
            {search && (
              <button className="dip-search-clear" onClick={() => setSearch('')}>
                <FiX size={13} />
              </button>
            )}
          </div>

          <div className="dip-toolbar-divider" />

          <div className="dip-filters">
            <div className="dip-filter-group">
              <FiFilter size={13} className="dip-filter-icon" />
              {[
                { key: 'ALL',         label: 'Todos'         },
                { key: 'PROPIETARIO', label: 'Propietarios'  },
                { key: 'SUPLENTE',    label: 'Suplentes'     },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  className={`dip-filter-btn${filterTipo === key ? ' active' : ''}`}
                  onClick={() => { setFilterTipo(key); resetPage(); }}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              className="dip-filter-select"
              value={filterActivo}
              onChange={e => { setFilterActivo(e.target.value); resetPage(); }}
            >
              <option value="ALL">Todos los estados</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
            </select>

            <select
              className="dip-filter-select"
              value={filterDept}
              onChange={e => { setFilterDept(e.target.value); resetPage(); }}
            >
              <option value="ALL">Todos los departamentos</option>
              {deptOptions.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="dip-table-wrap" style={{ overflowX: 'auto' }}>
          {loading ? (
            <div className="dip-empty">Cargando diputados…</div>
          ) : filtered.length === 0 ? (
            <div className="dip-empty">No se encontraron diputados.</div>
          ) : (
            <table className="dip-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Departamento</th>
                  <th>N°</th>
                  <th>Tipo</th>
                  <th>Partido</th>
                  <th>Contacto</th>
                  <th>Estado</th>
                  {canEdit && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {paginated.map(d => {
                  const meta = TIPO_META[d.tipo] || TIPO_META.PROPIETARIO;
                  return (
                    <tr key={d.id} className={!d.activo ? 'dip-row-inactive' : ''}>
                      <td>
                        <div className="dip-name-cell">
                          <div
                            className="dip-avatar"
                            style={{ background: meta.bg, color: meta.color }}
                          >
                            {d.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="dip-nombre">{d.nombre}</div>
                            {d.identidad && (
                              <div className="dip-id-tag">ID: {d.identidad}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="dip-dept">{d.departamento}</td>
                      <td className="dip-num">{d.numero ?? '—'}</td>
                      <td>
                        <span
                          className="dip-tipo-badge"
                          style={{ color: meta.color, background: meta.bg }}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="dip-partido">{d.partido || '—'}</td>
                      <td>
                        {d.telefono && (
                          <div className="dip-contact">
                            <FiPhone size={12} /> {d.telefono}
                          </div>
                        )}
                        {d.correo && (
                          <div className="dip-contact dip-email">
                            <FiMail size={12} /> {d.correo}
                          </div>
                        )}
                        {!d.telefono && !d.correo && (
                          <span className="dip-none">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`dip-status ${d.activo ? 'active' : 'inactive'}`}>
                          {d.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      {canEdit && (
                        <td>
                          <div className="dip-actions">
                            <button
                              className="dip-action-btn view"
                              title="Ver detalles"
                              onClick={() => setDetail(d)}
                            >
                              <FiEye size={14} />
                            </button>
                            <button
                              className="dip-action-btn edit"
                              title="Editar"
                              onClick={() => openEdit(d)}
                            >
                              <FiEdit2 size={14} />
                            </button>
                            <button
                              className={`dip-action-btn ${d.activo ? 'deactivate' : 'activate'}`}
                              title={d.activo ? 'Desactivar' : 'Activar'}
                              onClick={() => setConfirm(d)}
                            >
                              {d.activo
                                ? <FiUserX size={14} />
                                : <FiUserCheck size={14} />}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ── */}
        {!loading && filtered.length > PAGE_SIZE && (
          <div className="std-pg">
            <span className="std-pg-info">
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de <strong>{filtered.length}</strong>
            </span>
            <div className="std-pg-controls">
              <button className="std-pg-btn" disabled={safePage === 1} onClick={() => setPage(1)}>«</button>
              <button className="std-pg-btn" disabled={safePage === 1} onClick={() => setPage(p => p - 1)}>‹</button>
              {(() => {
                const maxBtns = 7;
                let start = Math.max(1, safePage - Math.floor(maxBtns / 2));
                let end   = Math.min(totalPages, start + maxBtns - 1);
                if (end - start < maxBtns - 1) start = Math.max(1, end - maxBtns + 1);
                const nums = [];
                if (start > 1) {
                  nums.push(<button key={1} className="std-pg-btn std-pg-num" onClick={() => setPage(1)}>1</button>);
                  if (start > 2) nums.push(<span key="el" className="std-pg-ellipsis">…</span>);
                }
                for (let p = start; p <= end; p++) {
                  nums.push(<button key={p} className={`std-pg-btn std-pg-num${safePage === p ? ' std-pg-num--active' : ''}`} onClick={() => setPage(p)}>{p}</button>);
                }
                if (end < totalPages) {
                  if (end < totalPages - 1) nums.push(<span key="er" className="std-pg-ellipsis">…</span>);
                  nums.push(<button key={totalPages} className="std-pg-btn std-pg-num" onClick={() => setPage(totalPages)}>{totalPages}</button>);
                }
                return nums;
              })()}
              <button className="std-pg-btn" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
              <button className="std-pg-btn" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>»</button>
            </div>
            <span className="std-pg-total">Pág. <strong>{safePage}</strong> / {totalPages}</span>
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ── */}
      {modal && (
        <div className="dip-overlay" onClick={closeModal}>
          <div className="dip-modal dip-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="dip-modal-header">
              <h2>{modal === 'create' ? 'Nuevo Diputado' : 'Editar Diputado'}</h2>
              <button className="dip-modal-close" onClick={closeModal}>
                <FiX size={18} />
              </button>
            </div>

            <form className="dip-modal-form" onSubmit={handleSave}>
              <div className="dip-form-group">
                <label>Nombre completo *</label>
                <input
                  required
                  placeholder="Ej: Juan Carlos Pérez"
                  value={form.nombre}
                  onChange={e => setForm({ ...form, nombre: e.target.value })}
                />
              </div>

              <div className="dip-form-row">
                <div className="dip-form-group">
                  <label>Departamento *</label>
                  <input
                    required
                    list="dip-departamentos-list"
                    placeholder="Ej: Francisco Morazán"
                    value={form.departamento}
                    onChange={e => setForm({ ...form, departamento: e.target.value })}
                  />
                  <datalist id="dip-departamentos-list">
                    {DEPARTAMENTOS_HN.map(d => <option key={d} value={d} />)}
                  </datalist>
                </div>
                <div className="dip-form-group">
                  <label>Número</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Ej: 1"
                    value={form.numero}
                    onChange={e => setForm({ ...form, numero: e.target.value })}
                  />
                </div>
              </div>

              <div className="dip-form-row">
                <div className="dip-form-group">
                  <label>Tipo *</label>
                  <select
                    value={form.tipo}
                    onChange={e => setForm({ ...form, tipo: e.target.value })}
                  >
                    <option value="PROPIETARIO">Propietario</option>
                    <option value="SUPLENTE">Suplente</option>
                  </select>
                </div>
                <div className="dip-form-group">
                  <label>Número de Identidad</label>
                  <input
                    placeholder="Ej: 0801-1990-00000"
                    value={form.identidad}
                    onChange={e => setForm({ ...form, identidad: e.target.value })}
                  />
                </div>
              </div>

              <div className="dip-form-row">
                <div className="dip-form-group">
                  <label>Partido político</label>
                  <input
                    placeholder="Ej: Partido Nacional"
                    value={form.partido}
                    onChange={e => setForm({ ...form, partido: e.target.value })}
                  />
                </div>
                <div className="dip-form-group">
                  <label>Teléfono</label>
                  <input
                    placeholder="Ej: +504 9999-9999"
                    value={form.telefono}
                    onChange={e => setForm({ ...form, telefono: e.target.value })}
                  />
                </div>
              </div>

              <div className="dip-form-group">
                <label>Correo electrónico</label>
                <input
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={form.correo}
                  onChange={e => setForm({ ...form, correo: e.target.value })}
                />
              </div>

              {formErr && <div className="dip-form-error">{formErr}</div>}

              <div className="dip-modal-footer">
                <button type="button" className="dip-btn-secondary" onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="dip-btn-primary" disabled={saving}>
                  {saving
                    ? 'Guardando…'
                    : modal === 'create' ? 'Crear Diputado' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {detail && (() => {
        const meta = TIPO_META[detail.tipo] || TIPO_META.PROPIETARIO;
        return (
          <div className="dip-overlay" onClick={() => setDetail(null)}>
            <div className="dip-modal dip-modal-detail" onClick={e => e.stopPropagation()}>
              <div className="dip-modal-header">
                <h2>Detalle del Diputado</h2>
                <button className="dip-modal-close" onClick={() => setDetail(null)}>
                  <FiX size={18} />
                </button>
              </div>

              <div className="dip-detail-body">
                {/* Avatar + nombre + badges */}
                <div className="dip-detail-hero">
                  <div className="dip-detail-avatar">
                    <img src="/logo-congreso.png.png" alt="Congreso Nacional" />
                  </div>
                  <div className="dip-detail-hero-info">
                    <h3>{detail.nombre}</h3>
                    <div className="dip-detail-badges">
                      <span
                        className="dip-tipo-badge"
                        style={{ color: meta.color, background: meta.bg }}
                      >
                        {meta.label}
                      </span>
                      <span className={`dip-status ${detail.activo ? 'active' : 'inactive'}`}>
                        {detail.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Grid de datos */}
                <div className="dip-detail-grid">
                  <div className="dip-detail-item">
                    <span className="dip-detail-label"><FiMapPin size={11} /> Departamento</span>
                    <span className="dip-detail-value">{detail.departamento}</span>
                  </div>
                  <div className="dip-detail-item">
                    <span className="dip-detail-label"><FiHash size={11} /> Número</span>
                    <span className="dip-detail-value">{detail.numero ?? '—'}</span>
                  </div>
                  <div className="dip-detail-item">
                    <span className="dip-detail-label"><FiUser size={11} /> Tipo</span>
                    <span className="dip-detail-value">{meta.label}</span>
                  </div>
                  <div className="dip-detail-item">
                    <span className="dip-detail-label"><FiCreditCard size={11} /> Identidad</span>
                    <span className="dip-detail-value" style={{ fontFamily: 'monospace' }}>
                      {detail.identidad || '—'}
                    </span>
                  </div>
                  <div className="dip-detail-item">
                    <span className="dip-detail-label"><FiFlag size={11} /> Partido político</span>
                    <span className="dip-detail-value">{detail.partido || '—'}</span>
                  </div>
                  <div className="dip-detail-item">
                    <span className="dip-detail-label"><FiPhone size={11} /> Teléfono</span>
                    <span className="dip-detail-value">
                      {detail.telefono
                        ? <a href={`tel:${detail.telefono}`} className="dip-detail-link"><FiPhone size={13}/> {detail.telefono}</a>
                        : '—'}
                    </span>
                  </div>
                  <div className="dip-detail-item dip-detail-item-full">
                    <span className="dip-detail-label"><FiMail size={11} /> Correo electrónico</span>
                    <span className="dip-detail-value">
                      {detail.correo
                        ? <a href={`mailto:${detail.correo}`} className="dip-detail-link"><FiMail size={13}/> {detail.correo}</a>
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="dip-detail-footer">
                {canEdit && (
                  <button
                    className="dip-btn-primary"
                    onClick={() => { setDetail(null); openEdit(detail); }}
                  >
                    <FiEdit2 size={14} /> Editar
                  </button>
                )}
                <button className="dip-btn-secondary" onClick={() => setDetail(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Confirm Toggle ── */}
      {confirm && (
        <div className="dip-overlay" onClick={() => setConfirm(null)}>
          <div className="dip-modal dip-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="dip-modal-header">
              <h2>{confirm.activo ? 'Desactivar Diputado' : 'Activar Diputado'}</h2>
              <button className="dip-modal-close" onClick={() => setConfirm(null)}>
                <FiX size={18} />
              </button>
            </div>
            <div className="dip-modal-form">
              <p className="dip-confirm-text">
                ¿Confirma que desea {confirm.activo ? 'desactivar' : 'activar'} al
                diputado <strong>{confirm.nombre}</strong>?
              </p>
              <div className="dip-modal-footer">
                <button
                  type="button"
                  className="dip-btn-secondary"
                  onClick={() => setConfirm(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={confirm.activo ? 'dip-btn-danger' : 'dip-btn-success'}
                  onClick={() => handleToggle(confirm)}
                >
                  {confirm.activo
                    ? <><FiUserX size={14} /> Desactivar</>
                    : <><FiUserCheck size={14} /> Activar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
