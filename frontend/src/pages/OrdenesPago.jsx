import { useEffect, useState, useCallback, useContext } from 'react';
import {
  FiPlus, FiEdit2, FiX, FiSearch, FiPrinter, FiCheck,
  FiEye, FiRefreshCw, FiFileText, FiSend, FiAlertTriangle,
  FiXCircle,
} from 'react-icons/fi';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './OrdenesPago.css';

const ROLES_OPERACION  = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];
const ROLES_APROBACION = ['SUPER_ADMIN', 'ADMIN'];

const ESTADO_COLORS = {
  BORRADOR:  { bg: '#f3f4f6', color: '#374151', label: 'Borrador'  },
  APROBADA:  { bg: '#d1fae5', color: '#065f46', label: 'Aprobada'  },
  IMPRESA:   { bg: '#dbeafe', color: '#1d4ed8', label: 'Impresa'   },
  ENTREGADA: { bg: '#e0e7ff', color: '#3730a3', label: 'Entregada' },
  ANULADA:   { bg: '#fee2e2', color: '#991b1b', label: 'Anulada'   },
};

const EMPTY_FORM = {
  beneficiario:            '',
  codigo_beneficiario:     '',
  monto:                   '',
  forma_pago:              'TRANSFERENCIA',
  no_cheque_transferencia: '',
  tipo_cuenta:             'CORRIENTE',
  cargo_anio:              new Date().getFullYear(),
  cargo_org:               '',
  cargo_fondo:             '',
  cargo_tipo_prog:         '',
  cargo_sub_prog:          '',
  cargo_act:               '',
  cargo_cuenta:            '',
  valor_adeuda_por:        '',
  concepto:                '',
  descripcion_detallada:   '',
  fecha:                   new Date().toISOString().split('T')[0],
  observaciones:           '',
};

function fmtFecha(str) {
  if (!str) return '—';
  const d = new Date(String(str).split('T')[0] + 'T12:00:00');
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMonto(n) {
  return 'L. ' + new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n ?? 0);
}

function EstadoBadge({ estado }) {
  const c = ESTADO_COLORS[estado] || ESTADO_COLORS.BORRADOR;
  return (
    <span className="op-badge" style={{ background: c.bg, color: c.color }}>
      {c.label}
    </span>
  );
}

function validate(f) {
  const e = {};
  const ben = (f.beneficiario || '').trim();
  if (!ben)                e.beneficiario = 'El beneficiario es requerido.';
  else if (ben.length < 2) e.beneficiario = 'Mínimo 2 caracteres.';
  else if (ben.length > 250) e.beneficiario = 'Máximo 250 caracteres.';

  const m = parseFloat(f.monto);
  if (f.monto === '' || isNaN(m) || m <= 0)
    e.monto = 'El monto debe ser mayor a 0.';
  else if (m > 999999999.99)
    e.monto = 'Monto demasiado alto.';

  if (!f.fecha) e.fecha = 'La fecha es requerida.';

  const con = (f.concepto || '').trim();
  if (!con || con.length < 3) e.concepto = 'El concepto es requerido (mín. 3 caracteres).';
  else if (con.length > 500)  e.concepto = 'Máximo 500 caracteres.';

  if (!['CHEQUE', 'TRANSFERENCIA'].includes(f.forma_pago))
    e.forma_pago = 'Seleccione una forma de pago.';

  if (!['CORRIENTE', 'CAPITAL', 'D_PUB'].includes(f.tipo_cuenta))
    e.tipo_cuenta = 'Seleccione el tipo de cuenta.';

  return e;
}

export default function OrdenesPago() {
  const { user } = useContext(AuthContext);
  const canOperar  = ROLES_OPERACION.includes(user?.rol);
  const canAprobar = ROLES_APROBACION.includes(user?.rol);

  // ── Estado de la lista ────────────────────────────────────────────────────
  const [ordenes, setOrdenes]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const PAGE_SIZE = 20;

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroAnio,   setFiltroAnio]   = useState('');
  const [busqueda,     setBusqueda]     = useState('');

  // ── Modal crear/editar ────────────────────────────────────────────────────
  const [modal,      setModal]      = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [form,       setForm]       = useState({ ...EMPTY_FORM });
  const [formErrors, setFormErrors] = useState({});
  const [saving,     setSaving]     = useState(false);

  // ── Modal ver detalle ─────────────────────────────────────────────────────
  const [viewModal, setViewModal] = useState(null);

  // ── Modal anular ──────────────────────────────────────────────────────────
  const [anularModal,   setAnularModal]   = useState(null);
  const [motivoAnular,  setMotivoAnular]  = useState('');
  const [anulando,      setAnulando]      = useState(false);

  // ── Acciones en curso ─────────────────────────────────────────────────────
  const [aprobando,  setAprobando]  = useState(null);
  const [entregando, setEntregando] = useState(null);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Cargar lista ──────────────────────────────────────────────────────────
  const fetchOrdenes = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = { page: pg, limit: PAGE_SIZE };
      if (filtroEstado)    params.estado = filtroEstado;
      if (filtroAnio)      params.anio   = filtroAnio;
      if (busqueda.trim()) params.q      = busqueda.trim();

      const res = await api.get('/ordenes-pago', { params });
      setOrdenes(res.data.data);
      setTotal(res.data.total);
      setPage(pg);
    } catch {
      showToast('Error al cargar las órdenes de pago.', 'error');
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, filtroAnio, busqueda]);

  useEffect(() => { fetchOrdenes(1); }, [fetchOrdenes]);

  // ── Abrir modal creación ──────────────────────────────────────────────────
  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFormErrors({});
    setModal(true);
  }

  // ── Abrir modal edición ───────────────────────────────────────────────────
  function openEdit(orden) {
    setEditing(orden.id);
    setForm({
      beneficiario:            orden.beneficiario            || '',
      codigo_beneficiario:     orden.codigo_beneficiario     || '',
      monto:                   orden.monto                   || '',
      forma_pago:              orden.forma_pago              || 'TRANSFERENCIA',
      no_cheque_transferencia: orden.no_cheque_transferencia || '',
      tipo_cuenta:             orden.tipo_cuenta             || 'CORRIENTE',
      cargo_anio:              orden.cargo_anio              || new Date().getFullYear(),
      cargo_org:               orden.cargo_org               || '',
      cargo_fondo:             orden.cargo_fondo             || '',
      cargo_tipo_prog:         orden.cargo_tipo_prog         || '',
      cargo_sub_prog:          orden.cargo_sub_prog          || '',
      cargo_act:               orden.cargo_act               || '',
      cargo_cuenta:            orden.cargo_cuenta            || '',
      valor_adeuda_por:        orden.valor_adeuda_por        || '',
      concepto:                orden.concepto                || '',
      descripcion_detallada:   orden.descripcion_detallada   || '',
      fecha:                   (orden.fecha || '').slice(0, 10),
      observaciones:           orden.observaciones           || '',
    });
    setFormErrors({});
    setModal(true);
  }

  // ── Guardar (crear o editar) ──────────────────────────────────────────────
  async function handleSave() {
    const errors = validate(form);
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      const payload = {
        ...form,
        tipo_origen: 'MANUAL',
        monto:       parseFloat(form.monto),
        cargo_anio:  form.cargo_anio ? parseInt(form.cargo_anio, 10) : null,
      };

      if (editing) {
        await api.put(`/ordenes-pago/${editing}`, payload);
        showToast('Orden de pago actualizada.');
      } else {
        await api.post('/ordenes-pago', payload);
        showToast('Orden de pago creada.');
      }
      setModal(false);
      fetchOrdenes(page);
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al guardar la orden.', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Aprobar ───────────────────────────────────────────────────────────────
  async function handleAprobar(id) {
    if (!window.confirm('¿Confirma aprobar esta orden de pago?')) return;
    setAprobando(id);
    try {
      const res = await api.patch(`/ordenes-pago/${id}/aprobar`);
      showToast(`Orden aprobada: ${res.data.numero_orden}`);
      fetchOrdenes(page);
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al aprobar.', 'error');
    } finally {
      setAprobando(null);
    }
  }

  // ── Imprimir PDF ──────────────────────────────────────────────────────────
  async function handleImprimirPDF(orden) {
    const esReimpresion = ['IMPRESA', 'ENTREGADA'].includes(orden.estado);
    let motivo = '';
    if (esReimpresion) {
      const m = window.prompt('Motivo de reimpresión (opcional):');
      if (m === null) return; // cancelado
      motivo = m;
    }

    try {
      const params = {};
      if (motivo) params.motivo_reimpresion = motivo;

      const res = await api.get(`/ordenes-pago/${orden.id}/pdf`, {
        params,
        responseType: 'blob',
      });
      const blob    = new Blob([res.data], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      fetchOrdenes(page);
    } catch (err) {
      const msg = err.response?.data?.message
        || err.response?.data?.toString?.()
        || 'Error al generar el PDF.';
      showToast(msg, 'error');
    }
  }

  // ── Entregar ──────────────────────────────────────────────────────────────
  async function handleEntregar(id) {
    if (!window.confirm('¿Marcar esta orden como entregada al beneficiario?')) return;
    setEntregando(id);
    try {
      await api.patch(`/ordenes-pago/${id}/entregar`);
      showToast('Orden marcada como entregada.');
      fetchOrdenes(page);
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al entregar.', 'error');
    } finally {
      setEntregando(null);
    }
  }

  // ── Anular ────────────────────────────────────────────────────────────────
  async function handleAnular() {
    const motivo = motivoAnular.trim();
    if (motivo.length < 5) {
      showToast('El motivo debe tener al menos 5 caracteres.', 'error');
      return;
    }
    setAnulando(true);
    try {
      await api.patch(`/ordenes-pago/${anularModal.id}/anular`, { motivo });
      showToast('Orden de pago anulada.');
      setAnularModal(null);
      setMotivoAnular('');
      fetchOrdenes(page);
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al anular.', 'error');
    } finally {
      setAnulando(false);
    }
  }

  // ── Ver detalle ───────────────────────────────────────────────────────────
  async function openView(id) {
    try {
      const res = await api.get(`/ordenes-pago/${id}`);
      setViewModal(res.data);
    } catch {
      showToast('Error al cargar el detalle.', 'error');
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="op-page">
      <Navbar />
      <div className="op-container">

        {/* ── Encabezado ─────────────────────────────────────────────────── */}
        <div className="op-header">
          <div className="op-header-left">
            <FiFileText className="op-header-icon" />
            <div>
              <h1>Órdenes de Pago</h1>
              <p>{total} registro{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {canOperar && (
            <button className="op-btn-primary" onClick={openCreate}>
              <FiPlus /> Nueva Orden
            </button>
          )}
        </div>

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div className="op-filters">
          <div className="op-search-wrap">
            <FiSearch className="op-search-icon" />
            <input
              type="text"
              placeholder="Buscar beneficiario, N° orden, concepto…"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="op-input-search"
            />
          </div>

          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            className="op-select"
          >
            <option value="">Todos los estados</option>
            <option value="BORRADOR">Borrador</option>
            <option value="APROBADA">Aprobada</option>
            <option value="IMPRESA">Impresa</option>
            <option value="ENTREGADA">Entregada</option>
            <option value="ANULADA">Anulada</option>
          </select>

          <input
            type="number"
            placeholder="Año"
            value={filtroAnio}
            onChange={e => setFiltroAnio(e.target.value)}
            className="op-input-anio"
            min="2020"
            max="2099"
          />

          <button className="op-btn-icon" onClick={() => fetchOrdenes(1)} title="Actualizar">
            <FiRefreshCw />
          </button>
        </div>

        {/* ── Tabla ───────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="op-loading">Cargando…</div>
        ) : ordenes.length === 0 ? (
          <div className="op-empty">No se encontraron órdenes de pago.</div>
        ) : (
          <div className="op-table-wrap">
            <table className="op-table">
              <thead>
                <tr>
                  <th>N° Orden</th>
                  <th>Beneficiario</th>
                  <th>Monto</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Creado por</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ordenes.map(o => (
                  <tr key={o.id} className={o.estado === 'ANULADA' ? 'op-row-anulada' : ''}>
                    <td className="op-td-numero">
                      {o.numero_orden
                        ? <strong>{o.numero_orden}</strong>
                        : <span className="op-sin-numero">Borrador #{o.id}</span>}
                    </td>
                    <td className="op-td-beneficiario" title={o.beneficiario}>
                      {o.beneficiario}
                    </td>
                    <td className="op-td-monto">{fmtMonto(o.monto)}</td>
                    <td>{fmtFecha(o.fecha)}</td>
                    <td><EstadoBadge estado={o.estado} /></td>
                    <td>{o.creado_por_nombre || '—'}</td>
                    <td>
                      <div className="op-actions">
                        {/* Ver detalle */}
                        <button
                          className="op-action-btn op-action-view"
                          title="Ver detalle"
                          onClick={() => openView(o.id)}
                        >
                          <FiEye />
                        </button>

                        {/* Editar (solo BORRADOR) */}
                        {canOperar && o.estado === 'BORRADOR' && (
                          <button
                            className="op-action-btn op-action-edit"
                            title="Editar"
                            onClick={() => openEdit(o)}
                          >
                            <FiEdit2 />
                          </button>
                        )}

                        {/* Aprobar (solo BORRADOR) */}
                        {canAprobar && o.estado === 'BORRADOR' && (
                          <button
                            className="op-action-btn op-action-approve"
                            title="Aprobar"
                            onClick={() => handleAprobar(o.id)}
                            disabled={aprobando === o.id}
                          >
                            <FiCheck />
                          </button>
                        )}

                        {/* Imprimir PDF */}
                        {['APROBADA', 'IMPRESA', 'ENTREGADA'].includes(o.estado) && (
                          <button
                            className="op-action-btn op-action-print"
                            title="Imprimir PDF"
                            onClick={() => handleImprimirPDF(o)}
                          >
                            <FiPrinter />
                          </button>
                        )}

                        {/* Entregar (solo IMPRESA) */}
                        {canAprobar && o.estado === 'IMPRESA' && (
                          <button
                            className="op-action-btn op-action-deliver"
                            title="Marcar como entregada"
                            onClick={() => handleEntregar(o.id)}
                            disabled={entregando === o.id}
                          >
                            <FiSend />
                          </button>
                        )}

                        {/* Anular */}
                        {canAprobar && o.estado !== 'ANULADA' && (
                          <button
                            className="op-action-btn op-action-cancel"
                            title="Anular"
                            onClick={() => { setAnularModal(o); setMotivoAnular(''); }}
                          >
                            <FiXCircle />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Paginación ──────────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="op-pagination">
            <button onClick={() => fetchOrdenes(page - 1)} disabled={page <= 1}>
              ‹ Anterior
            </button>
            <span>Página {page} de {totalPages}</span>
            <button onClick={() => fetchOrdenes(page + 1)} disabled={page >= totalPages}>
              Siguiente ›
            </button>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL CREAR / EDITAR
      ════════════════════════════════════════════════════════════════════ */}
      {modal && (
        <div className="op-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="op-modal op-modal-form">
            <div className="op-modal-header">
              <h2>{editing ? 'Editar Orden de Pago' : 'Nueva Orden de Pago'}</h2>
              <button className="op-modal-close" onClick={() => setModal(false)}>
                <FiX />
              </button>
            </div>

            <div className="op-modal-body">


              {/* Beneficiario + Código */}
              <div className="op-form-row op-form-row-2">
                <div className="op-form-group">
                  <label>Beneficiario *</label>
                  <input
                    type="text"
                    className={`op-input${formErrors.beneficiario ? ' op-input-error' : ''}`}
                    value={form.beneficiario}
                    onChange={e => setForm(f => ({ ...f, beneficiario: e.target.value }))}
                    maxLength={250}
                    placeholder="Nombre completo o razón social"
                  />
                  {formErrors.beneficiario && (
                    <span className="op-field-error">{formErrors.beneficiario}</span>
                  )}
                </div>
                <div className="op-form-group">
                  <label>Cédula / RTN</label>
                  <input
                    type="text"
                    className="op-input"
                    value={form.codigo_beneficiario}
                    onChange={e => setForm(f => ({ ...f, codigo_beneficiario: e.target.value }))}
                    maxLength={60}
                    placeholder="DNI, RTN o identidad"
                  />
                </div>
              </div>

              {/* Monto, forma de pago, fecha */}
              <div className="op-form-row op-form-row-3">
                <div className="op-form-group">
                  <label>Monto (L.) *</label>
                  <input
                    type="number"
                    className={`op-input${formErrors.monto ? ' op-input-error' : ''}`}
                    value={form.monto}
                    onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                  />
                  {formErrors.monto && (
                    <span className="op-field-error">{formErrors.monto}</span>
                  )}
                </div>
                <div className="op-form-group">
                  <label>Forma de Pago *</label>
                  <select
                    className="op-input"
                    value={form.forma_pago}
                    onChange={e => setForm(f => ({ ...f, forma_pago: e.target.value }))}
                  >
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
                <div className="op-form-group">
                  <label>Fecha del Documento *</label>
                  <input
                    type="date"
                    className={`op-input${formErrors.fecha ? ' op-input-error' : ''}`}
                    value={form.fecha}
                    onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                  />
                  {formErrors.fecha && (
                    <span className="op-field-error">{formErrors.fecha}</span>
                  )}
                </div>
              </div>

              {/* No. cheque / transferencia + Tipo cuenta */}
              <div className="op-form-row op-form-row-2">
                <div className="op-form-group">
                  <label>N° Cheque / Transferencia</label>
                  <input
                    type="text"
                    className="op-input"
                    value={form.no_cheque_transferencia}
                    onChange={e => setForm(f => ({ ...f, no_cheque_transferencia: e.target.value }))}
                    maxLength={60}
                    placeholder="Número del documento de pago"
                  />
                </div>
                <div className="op-form-group">
                  <label>Tipo de Cuenta *</label>
                  <select
                    className="op-input"
                    value={form.tipo_cuenta}
                    onChange={e => setForm(f => ({ ...f, tipo_cuenta: e.target.value }))}
                  >
                    <option value="CORRIENTE">Corriente</option>
                    <option value="CAPITAL">Capital</option>
                    <option value="D_PUB">Deuda Pública</option>
                  </select>
                </div>
              </div>

              {/* Código contable */}
              <div className="op-form-section-title">Código Contable (CARGOS)</div>
              <div className="op-form-row op-form-row-4">
                <div className="op-form-group">
                  <label>Año</label>
                  <input
                    type="number"
                    className="op-input"
                    value={form.cargo_anio}
                    onChange={e => setForm(f => ({ ...f, cargo_anio: e.target.value }))}
                    min="2020"
                    max="2099"
                  />
                </div>
                <div className="op-form-group">
                  <label>Org.</label>
                  <input
                    type="text"
                    className="op-input"
                    value={form.cargo_org}
                    onChange={e => setForm(f => ({ ...f, cargo_org: e.target.value }))}
                    maxLength={10}
                    placeholder="Ej: 0101"
                  />
                </div>
                <div className="op-form-group">
                  <label>Fondo</label>
                  <input
                    type="text"
                    className="op-input"
                    value={form.cargo_fondo}
                    onChange={e => setForm(f => ({ ...f, cargo_fondo: e.target.value }))}
                    maxLength={10}
                    placeholder="Ej: 0001"
                  />
                </div>
                <div className="op-form-group">
                  <label>Tipo Prog.</label>
                  <input
                    type="text"
                    className="op-input"
                    value={form.cargo_tipo_prog}
                    onChange={e => setForm(f => ({ ...f, cargo_tipo_prog: e.target.value }))}
                    maxLength={10}
                    placeholder="Ej: 11"
                  />
                </div>
              </div>
              <div className="op-form-row op-form-row-4">
                <div className="op-form-group">
                  <label>Sub Prog.</label>
                  <input
                    type="text"
                    className="op-input"
                    value={form.cargo_sub_prog}
                    onChange={e => setForm(f => ({ ...f, cargo_sub_prog: e.target.value }))}
                    maxLength={10}
                  />
                </div>
                <div className="op-form-group">
                  <label>Act.</label>
                  <input
                    type="text"
                    className="op-input"
                    value={form.cargo_act}
                    onChange={e => setForm(f => ({ ...f, cargo_act: e.target.value }))}
                    maxLength={10}
                  />
                </div>
                <div className="op-form-group op-form-group-span2">
                  <label>Cuenta</label>
                  <input
                    type="text"
                    className="op-input"
                    value={form.cargo_cuenta}
                    onChange={e => setForm(f => ({ ...f, cargo_cuenta: e.target.value }))}
                    maxLength={20}
                    placeholder="Ej: 513-00"
                  />
                </div>
              </div>

              {/* Descripción */}
              <div className="op-form-section-title">Descripción del Documento</div>
              <div className="op-form-group">
                <label>Valor que se adeuda por</label>
                <input
                  type="text"
                  className="op-input"
                  value={form.valor_adeuda_por}
                  onChange={e => setForm(f => ({ ...f, valor_adeuda_por: e.target.value }))}
                  maxLength={300}
                />
              </div>
              <div className="op-form-group">
                <label>Concepto *</label>
                <input
                  type="text"
                  className={`op-input${formErrors.concepto ? ' op-input-error' : ''}`}
                  value={form.concepto}
                  onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
                  maxLength={500}
                />
                {formErrors.concepto && (
                  <span className="op-field-error">{formErrors.concepto}</span>
                )}
              </div>
              <div className="op-form-group">
                <label>Descripción Detallada</label>
                <textarea
                  className="op-input op-textarea"
                  value={form.descripcion_detallada}
                  onChange={e => setForm(f => ({ ...f, descripcion_detallada: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="op-form-group">
                <label>Observaciones Internas</label>
                <input
                  type="text"
                  className="op-input"
                  value={form.observaciones}
                  onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                  maxLength={500}
                />
              </div>
            </div>

            <div className="op-modal-footer">
              <button className="op-btn-secondary" onClick={() => setModal(false)}>
                Cancelar
              </button>
              <button className="op-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando…' : (editing ? 'Actualizar' : 'Crear Orden')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL VER DETALLE
      ════════════════════════════════════════════════════════════════════ */}
      {viewModal && (
        <div className="op-overlay" onClick={e => e.target === e.currentTarget && setViewModal(null)}>
          <div className="op-modal op-modal-view">
            <div className="op-modal-header">
              <h2>
                {viewModal.numero_orden
                  ? `Orden ${viewModal.numero_orden}`
                  : `Borrador #${viewModal.id}`}
              </h2>
              <button className="op-modal-close" onClick={() => setViewModal(null)}>
                <FiX />
              </button>
            </div>

            <div className="op-modal-body">
              <div className="op-detail-grid">
                <div className="op-detail-row">
                  <span className="op-detail-label">Estado</span>
                  <EstadoBadge estado={viewModal.estado} />
                </div>
                <div className="op-detail-row">
                  <span className="op-detail-label">Beneficiario</span>
                  <span>{viewModal.beneficiario}</span>
                </div>
                <div className="op-detail-row">
                  <span className="op-detail-label">Cédula / RTN</span>
                  <span>{viewModal.codigo_beneficiario || '—'}</span>
                </div>
                <div className="op-detail-row">
                  <span className="op-detail-label">Monto</span>
                  <span className="op-detail-monto">{fmtMonto(viewModal.monto)}</span>
                </div>
                <div className="op-detail-row">
                  <span className="op-detail-label">En letras</span>
                  <span>{viewModal.monto_letras}</span>
                </div>
                <div className="op-detail-row">
                  <span className="op-detail-label">Forma de Pago</span>
                  <span>
                    {viewModal.forma_pago}
                    {viewModal.no_cheque_transferencia ? ` — ${viewModal.no_cheque_transferencia}` : ''}
                  </span>
                </div>
                <div className="op-detail-row">
                  <span className="op-detail-label">Tipo de Cuenta</span>
                  <span>{viewModal.tipo_cuenta}</span>
                </div>
                <div className="op-detail-row">
                  <span className="op-detail-label">Fecha</span>
                  <span>{fmtFecha(viewModal.fecha)}</span>
                </div>
                <div className="op-detail-row">
                  <span className="op-detail-label">Concepto</span>
                  <span>{viewModal.concepto}</span>
                </div>
                {viewModal.descripcion_detallada && (
                  <div className="op-detail-row">
                    <span className="op-detail-label">Descripción</span>
                    <span>{viewModal.descripcion_detallada}</span>
                  </div>
                )}
                {viewModal.valor_adeuda_por && (
                  <div className="op-detail-row">
                    <span className="op-detail-label">Valor adeuda por</span>
                    <span>{viewModal.valor_adeuda_por}</span>
                  </div>
                )}
                <div className="op-detail-row">
                  <span className="op-detail-label">Código Contable</span>
                  <code className="op-code">
                    {[
                      viewModal.cargo_anio, viewModal.cargo_org, viewModal.cargo_fondo,
                      viewModal.cargo_tipo_prog, viewModal.cargo_sub_prog,
                      viewModal.cargo_act, viewModal.cargo_cuenta,
                    ].filter(Boolean).join(' / ') || '—'}
                  </code>
                </div>
                <div className="op-detail-row">
                  <span className="op-detail-label">Creado por</span>
                  <span>{viewModal.creado_por_nombre || '—'}</span>
                </div>
                {viewModal.aprobado_por_nombre && (
                  <div className="op-detail-row">
                    <span className="op-detail-label">Aprobado por</span>
                    <span>
                      {viewModal.aprobado_por_nombre} — {fmtFecha(viewModal.fecha_aprobacion)}
                    </span>
                  </div>
                )}
                {viewModal.anulado_por_nombre && (
                  <>
                    <div className="op-detail-row">
                      <span className="op-detail-label">Anulado por</span>
                      <span>
                        {viewModal.anulado_por_nombre} — {fmtFecha(viewModal.fecha_anulacion)}
                      </span>
                    </div>
                    <div className="op-detail-row">
                      <span className="op-detail-label">Motivo</span>
                      <span className="op-detail-motivo">{viewModal.motivo_anulacion}</span>
                    </div>
                  </>
                )}
                {viewModal.observaciones && (
                  <div className="op-detail-row">
                    <span className="op-detail-label">Observaciones</span>
                    <span>{viewModal.observaciones}</span>
                  </div>
                )}
              </div>

              {/* Historial de impresiones */}
              {viewModal.impresiones?.length > 0 && (
                <div className="op-impresiones">
                  <h3>Historial de Impresiones</h3>
                  <table className="op-table-mini">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Usuario</th>
                        <th>Tipo</th>
                        <th>Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewModal.impresiones.map(imp => (
                        <tr key={imp.id}>
                          <td>{fmtFecha(imp.fecha_impresion)}</td>
                          <td>{imp.impreso_por_nombre}</td>
                          <td>{imp.es_reimpresion ? 'Reimpresión' : 'Primera'}</td>
                          <td>{imp.motivo_reimpresion || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="op-modal-footer">
              <button className="op-btn-secondary" onClick={() => setViewModal(null)}>
                Cerrar
              </button>
              {['APROBADA', 'IMPRESA', 'ENTREGADA'].includes(viewModal.estado) && (
                <button className="op-btn-print" onClick={() => handleImprimirPDF(viewModal)}>
                  <FiPrinter /> Imprimir PDF
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL ANULAR
      ════════════════════════════════════════════════════════════════════ */}
      {anularModal && (
        <div className="op-overlay" onClick={e => e.target === e.currentTarget && setAnularModal(null)}>
          <div className="op-modal op-modal-small">
            <div className="op-modal-header">
              <h2>Anular Orden de Pago</h2>
              <button className="op-modal-close" onClick={() => setAnularModal(null)}>
                <FiX />
              </button>
            </div>
            <div className="op-modal-body">
              <p className="op-anular-info">
                <FiAlertTriangle className="op-anular-icon" />
                Está a punto de anular la orden{' '}
                <strong>{anularModal.numero_orden || `#${anularModal.id}`}</strong>{' '}
                de <strong>{anularModal.beneficiario}</strong> por{' '}
                <strong>{fmtMonto(anularModal.monto)}</strong>.
                Esta acción no se puede deshacer.
              </p>
              <div className="op-form-group">
                <label>Motivo de Anulación *</label>
                <textarea
                  className="op-input op-textarea"
                  value={motivoAnular}
                  onChange={e => setMotivoAnular(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Mínimo 5 caracteres…"
                  autoFocus
                />
              </div>
            </div>
            <div className="op-modal-footer">
              <button className="op-btn-secondary" onClick={() => setAnularModal(null)}>
                Cancelar
              </button>
              <button className="op-btn-danger" onClick={handleAnular} disabled={anulando}>
                {anulando ? 'Anulando…' : 'Confirmar Anulación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`op-toast op-toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
