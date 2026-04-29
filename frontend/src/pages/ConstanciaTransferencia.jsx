import { useState, useCallback } from 'react';
import {
  FiUser, FiFileText, FiCalendar,
  FiPhone, FiMail, FiMapPin, FiDownload,
  FiRefreshCw, FiList, FiFilePlus, FiTrash2,
  FiAlertCircle, FiEdit3, FiEye, FiX,
} from 'react-icons/fi';
import Navbar from '../components/Navbar';
import api from '../api/axios';
import { generarConstanciaPdf } from '../utils/constanciaPdf';
import './ConstanciaTransferencia.css';

function buildEmpty() {
  return {
    // Sección I
    nombre: '', dni: '', telefono: '', direccion: '', correo: '',
    // Sección II
    monto: '', bancoReceptor: '', tipoCuenta: '', numeroCuenta: '',
    fechaDia: '', fechaMes: '', fechaAnio: '',
    // Sección III
    concepto: '',
  };
}

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

export default function ConstanciaTransferencia() {
  const [tab, setTab]         = useState('nueva');   // 'nueva' | 'historial'
  const [form, setForm]       = useState(buildEmpty());
  const [loading, setLoading] = useState(false);
  const [toast, setToast]     = useState(null); // {type:'ok'|'error'|'warn'|'info', msg:''}
  const [editingId, setEditingId]   = useState(null);
  const [confirmCfg, setConfirmCfg] = useState(null); // {msg, onOk}

  // Historial
  const [historial, setHistorial]     = useState([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [histError, setHistError]     = useState('');
  const [deletingId, setDeletingId]   = useState(null);
  const [viewItem, setViewItem]         = useState(null);

  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const askConfirm = (msg, onOk) => setConfirmCfg({ msg, onOk });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const cargarHistorial = useCallback(async () => {
    setLoadingHist(true);
    setHistError('');
    try {
      const { data } = await api.get('/constancias');
      setHistorial(data);
    } catch {
      setHistError('No se pudo cargar el historial.');
    } finally {
      setLoadingHist(false);
    }
  }, []);

  const handleTabHistorial = () => {
    setTab('historial');
    cargarHistorial();
  };

  const validate = () => {
    if (!form.nombre.trim()) return 'El nombre del beneficiario es requerido.';
    if (!form.dni.trim())    return 'El número de identidad es requerido.';
    const m = parseFloat(form.monto);
    if (!form.monto || isNaN(m) || m <= 0) return 'El monto debe ser mayor a cero.';
    if (m > 99999999) return 'El monto excede el límite permitido.';
    if (!form.bancoReceptor.trim()) return 'El banco receptor es requerido.';
    if (!form.numeroCuenta.trim()) return 'El número de cuenta es requerido.';
    if (!form.fechaDia || !form.fechaMes || !form.fechaAnio) return 'La fecha de la transferencia es requerida.';
    if (!form.concepto.trim()) return 'El concepto del pago es requerido.';
    return null;
  };

  const handleGenerar = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { showToast(err, 'error'); return; }
    setLoading(true);
    try {
      await generarConstanciaPdf(form);
      try {
        if (editingId) {
          await api.put(`/constancias/${editingId}`, form);
          showToast('Constancia actualizada correctamente.', 'ok');
          setEditingId(null);
          cargarHistorial();
        } else {
          await api.post('/constancias', form);
          showToast('Constancia generada y guardada correctamente.', 'ok');
        }
        setForm(buildEmpty());
      } catch {
        showToast('PDF generado. No se pudo guardar en el historial.', 'warn');
      }
    } catch {
      showToast('Error al generar el PDF. Intente nuevamente.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (c) => {
    setForm({
      nombre:       c.nombre || '',
      dni:          c.dni || '',
      telefono:     c.telefono || '',
      direccion:    c.direccion || '',
      correo:       c.correo || '',
      monto:        c.monto || '',
      bancoReceptor: c.banco_receptor || '',
      tipoCuenta:   c.tipo_cuenta || '',
      numeroCuenta: c.numero_cuenta || '',
      fechaDia:     String(c.fecha_dia || ''),
      fechaMes:     c.fecha_mes || '',
      fechaAnio:    String(c.fecha_anio || ''),
      concepto:     c.concepto || '',
    });
    setEditingId(c.id);
    setTab('nueva');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Constancia cargada para edición.', 'info');
  };

  const handleDescargar = async (c) => {
    try {
      const data = {
        nombre: c.nombre, dni: c.dni, telefono: c.telefono,
        direccion: c.direccion, correo: c.correo,
        monto: c.monto,
        bancoReceptor: c.banco_receptor, tipoCuenta: c.tipo_cuenta,
        numeroCuenta: c.numero_cuenta,
        fechaDia: c.fecha_dia, fechaMes: c.fecha_mes, fechaAnio: c.fecha_anio,
        concepto: c.concepto,
      };
      await generarConstanciaPdf(data);
    } catch {
      showToast('Error al generar el PDF.', 'error');
    }
  };

  const handleVer = (c) => setViewItem(c);

  const handleEliminar = (id) => {
    askConfirm('¿Eliminar esta constancia del historial?', async () => {
      setDeletingId(id);
      try {
        await api.delete(`/constancias/${id}`);
        setHistorial(h => h.filter(c => c.id !== id));
        showToast('Constancia eliminada.', 'ok');
      } catch (err) {
        showToast(err?.response?.data?.message || 'No se pudo eliminar la constancia.', 'error');
      } finally {
        setDeletingId(null);
      }
    });
  };

  return (
    <div className="page-shell">
      <Navbar />
      <div className="ct-page">

        {/* ── Banner ──────────────────────────────────────── */}
        <div className="ct-banner">
          <div className="ct-banner-icon"><FiFileText size={26} /></div>
          <div>
            <h1 className="ct-banner-title">Constancia de Transferencia Electrónica</h1>
            <p className="ct-banner-sub">Complete los campos para generar la constancia oficial en PDF</p>
          </div>
        </div>

        {/* ── Tab nav ─────────────────────────────────────── */}
        <div className="ct-tabs">
          <button
            className={`ct-tab ${tab === 'nueva' ? 'ct-tab--active' : ''}`}
            onClick={() => setTab('nueva')}
          >
            <FiFilePlus size={15} /> Nueva Constancia
          </button>
          <button
            className={`ct-tab ${tab === 'historial' ? 'ct-tab--active' : ''}`}
            onClick={handleTabHistorial}
          >
            <FiList size={15} /> Historial
          </button>
        </div>

        {/* ── Vista: Nueva ────────────────────────────────── */}
        {tab === 'nueva' && (
        <div className="ct-body">
          {/* ── Form ────────────────────────────────────────── */}
          <form id="ct-form" className="ct-form-col" onSubmit={handleGenerar} noValidate>

            {/* ── I. Beneficiario ─────────────────────────────── */}
            <div className="ct-section">
              <div className="ct-section-head">
                <span className="ct-step-num">1</span>
                <div>
                  <h2 className="ct-section-title">Datos de quien recibe el pago</h2>
                  <p className="ct-section-desc">Información del beneficiario de la transferencia</p>
                </div>
              </div>
              <div className="ct-fields">
                <div className="ct-field-full">
                  <label className="ct-label">Nombre Completo <span className="req">*</span></label>
                  <input className="ct-input" type="text" placeholder="Nombre completo del beneficiario"
                    value={form.nombre} onChange={e => set('nombre', e.target.value.toUpperCase())} required />
                </div>
                <div className="ct-row-2">
                  <div className="ct-field">
                    <label className="ct-label">Número de Identidad (DNI) <span className="req">*</span></label>
                    <input className="ct-input" type="text" placeholder="0801-0000-00000"
                      value={form.dni} onChange={e => set('dni', e.target.value)} required />
                  </div>
                  <div className="ct-field">
                    <label className="ct-label">Teléfono</label>
                    <div className="ct-icon-field">
                      <FiPhone size={14} className="ct-icon" />
                      <input className="ct-input ct-has-icon" type="text" placeholder="+504 0000-0000"
                        value={form.telefono} onChange={e => set('telefono', e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="ct-row-2">
                  <div className="ct-field">
                    <label className="ct-label">Dirección</label>
                    <div className="ct-icon-field">
                      <FiMapPin size={14} className="ct-icon" />
                      <input className="ct-input ct-has-icon" type="text" placeholder="Dirección del beneficiario"
                        value={form.direccion} onChange={e => set('direccion', e.target.value)} />
                    </div>
                  </div>
                  <div className="ct-field">
                    <label className="ct-label">Correo Electrónico</label>
                    <div className="ct-icon-field">
                      <FiMail size={14} className="ct-icon" />
                      <input className="ct-input ct-has-icon" type="email" placeholder="correo@ejemplo.com"
                        value={form.correo} onChange={e => set('correo', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── II. Transferencia ──────────────────────────── */}
            <div className="ct-section">
              <div className="ct-section-head">
                <span className="ct-step-num">2</span>
                <div>
                  <h2 className="ct-section-title">Datos de la Transferencia Electrónica</h2>
                  <p className="ct-section-desc">Información bancaria y monto de la operación</p>
                </div>
              </div>
              <div className="ct-fields">
                <div className="ct-row-2">
                  <div className="ct-field">
                    <label className="ct-label">Monto Recibido (L.) <span className="req">*</span></label>
                    <div className="ct-icon-field">
                      <span className="ct-currency">Lps.</span>
                      <input className="ct-input ct-has-icon" type="number" placeholder="0.00" min="0.01" step="0.01"
                        value={form.monto} onChange={e => set('monto', e.target.value)} required />
                    </div>
                  </div>
                  <div className="ct-field">
                    <label className="ct-label">Fecha de la Transferencia <span className="req">*</span></label>
                    <div className="ct-fecha-row">
                      <input className="ct-input" type="number" placeholder="Día" min="1" max="31"
                        value={form.fechaDia} onChange={e => set('fechaDia', e.target.value)} required />
                      <select className="ct-input" value={form.fechaMes} onChange={e => set('fechaMes', e.target.value)} required>
                        <option value="">Mes</option>
                        {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <input className="ct-input" type="number" placeholder="Año" min="2020" max="2100"
                        value={form.fechaAnio} onChange={e => set('fechaAnio', e.target.value)} required />
                    </div>
                  </div>
                </div>
                <div className="ct-row-2">
                  <div className="ct-field">
                    <label className="ct-label">Banco Receptor <span className="req">*</span></label>
                    <input className="ct-input" type="text" placeholder="Banco que recibe la transferencia"
                      value={form.bancoReceptor} onChange={e => set('bancoReceptor', e.target.value)} required />
                  </div>
                  <div className="ct-field">
                    <label className="ct-label">Tipo de Cuenta</label>
                    <input className="ct-input" type="text" placeholder="Ej: Ahorro, Corriente"
                      value={form.tipoCuenta} onChange={e => set('tipoCuenta', e.target.value)} />
                  </div>
                </div>
                <div className="ct-field-full">
                  <label className="ct-label">Número de Cuenta Bancaria Receptora <span className="req">*</span></label>
                  <input className="ct-input" type="text" placeholder="Número de cuenta"
                    value={form.numeroCuenta} onChange={e => set('numeroCuenta', e.target.value)} required />
                </div>
              </div>
            </div>

            {/* ── III. Concepto ────────────────────────────────── */}
            <div className="ct-section">
              <div className="ct-section-head">
                <span className="ct-step-num">3</span>
                <div>
                  <h2 className="ct-section-title">Concepto de la Transferencia</h2>
                  <p className="ct-section-desc">Describa el motivo de la transferencia</p>
                </div>
              </div>
              <div className="ct-fields">
                <div className="ct-field-full">
                  <label className="ct-label">Detalle o Motivo <span className="req">*</span></label>
                  <textarea className="ct-input ct-textarea" rows={4}
                    placeholder="Describa el motivo o concepto del pago realizado…"
                    value={form.concepto} onChange={e => set('concepto', e.target.value)} required />
                </div>
              </div>
            </div>

            {/* Mobile actions */}
            <div className="ct-actions-mobile">
              <button type="button" className="ct-btn-reset" onClick={() => setForm(buildEmpty())}>
                <FiRefreshCw size={14} /> Limpiar
              </button>
              <button type="submit" className="ct-btn-pdf" disabled={loading}>
                {loading ? <><span className="ct-spinner" /> Generando…</> : <><FiDownload size={15} /> Generar PDF</>}
              </button>
            </div>

          </form>

          {/* ── Aside resumen ────────────────────────────────── */}
          <aside className="ct-aside">
            <div className="ct-aside-card">
              <div className="ct-aside-header">
                <FiFileText size={15} />
                <span>Resumen del documento</span>
              </div>

              <div className="ct-aside-monto">
                <span className="ct-aside-monto-label">Monto a transferir</span>
                <span className="ct-aside-monto-val">
                  {form.monto
                    ? `Lps. ${parseFloat(form.monto).toLocaleString('es-HN', { minimumFractionDigits: 2 })}`
                    : '—'}
                </span>
                {form.monto && (
                  <span className="ct-aside-letras">{montoPrev(form.monto)}</span>
                )}
              </div>

              <div className="ct-aside-divider" />

              <div className="ct-aside-rows">
                <div className="ct-aside-row">
                  <span className="ct-aside-key"><FiUser size={11} /> Beneficiario</span>
                  <span className="ct-aside-val">{form.nombre || '—'}</span>
                </div>
                <div className="ct-aside-row">
                  <span className="ct-aside-key">Banco receptor</span>
                  <span className="ct-aside-val">{form.bancoReceptor || '—'}</span>
                </div>
                <div className="ct-aside-row">
                  <span className="ct-aside-key"><FiCalendar size={11} /> Fecha</span>
                  <span className="ct-aside-val">
                    {form.fechaDia && form.fechaMes && form.fechaAnio
                      ? `${form.fechaDia} de ${form.fechaMes} de ${form.fechaAnio}`
                      : '—'}
                  </span>
                </div>
              </div>

              <div className="ct-aside-divider" />

              <div className="ct-aside-actions">
                <button type="button" className="ct-btn-reset" onClick={() => setForm(buildEmpty())}>
                  <FiRefreshCw size={14} /> Limpiar formulario
                </button>
                <button type="submit" form="ct-form" className="ct-btn-pdf" disabled={loading}>
                  {loading
                    ? <><span className="ct-spinner" /> {editingId ? 'Actualizando…' : 'Generando…'}</>
                    : <><FiDownload size={15} /> {editingId ? 'Actualizar Constancia' : 'Generar Constancia PDF'}</>}
                </button>
                {editingId && (
                  <button type="button" className="ct-btn-reset" onClick={() => { setEditingId(null); setForm(buildEmpty()); }}>
                    Cancelar edición
                  </button>
                )}
              </div>
            </div>
          </aside>

        </div>
        )} {/* end tab nueva */}

        {/* ── Vista: Historial ────────────────────────────── */}
        {tab === 'historial' && (
        <div className="ct-hist-wrap">
          <div className="ct-hist-toolbar">
            <button className="ct-btn-reset ct-btn-sm" onClick={cargarHistorial} disabled={loadingHist}>
              <FiRefreshCw size={13} /> Actualizar
            </button>
          </div>

          {histError && (
            <div className="ct-hist-error">
              <FiAlertCircle size={16} /> {histError}
            </div>
          )}

          {!loadingHist && !histError && historial.length === 0 && (
            <div className="ct-hist-empty">
              <FiFileText size={40} />
              <p>Aún no hay constancias guardadas.</p>
              <button className="ct-btn-pdf" style={{width:'auto',padding:'10px 22px'}} onClick={() => setTab('nueva')}>
                <FiFilePlus size={15} /> Crear primera constancia
              </button>
            </div>
          )}

          {historial.length > 0 && (
          <div className="ct-hist-table-wrap">
            <table className="ct-hist-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Beneficiario</th>
                  <th>DNI</th>
                  <th>Monto</th>
                  <th>Concepto</th>
                  <th>Creado por</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {historial.map(c => (
                  <tr key={c.id}>
                    <td className="ct-hist-fecha">{fmtDate(c.created_at)}</td>
                    <td className="ct-hist-nombre">{c.nombre}</td>
                    <td>{c.dni}</td>
                    <td className="ct-hist-monto">
                      Lps. {parseFloat(c.monto).toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="ct-hist-concepto" title={c.concepto}>{c.concepto}</td>
                    <td className="ct-hist-usuario">{c.usuario_nombre || '—'}</td>
                    <td className="ct-hist-actions">
                      <button
                        className="ct-hist-btn ct-hist-btn--view"
                        title="Ver detalle"
                        onClick={() => handleVer(c)}
                      >
                        <FiEye size={14} />
                      </button>
                      <button
                        className="ct-hist-btn ct-hist-btn--dl"
                        title="Descargar PDF"
                        onClick={() => handleDescargar(c)}
                      >
                        <FiDownload size={14} />
                      </button>
                      <button
                        className="ct-hist-btn ct-hist-btn--edit"
                        title="Editar"
                        onClick={() => handleEdit(c)}
                      >
                        <FiEdit3 size={14} />
                      </button>
                      <button
                        className="ct-hist-btn ct-hist-btn--del"
                        title="Eliminar"
                        disabled={deletingId === c.id}
                        onClick={() => handleEliminar(c.id)}
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
        )} {/* end tab historial */}

      </div>

      {/* ── Toast ───────────────────────────────────────────── */}
      {toast && (
        <div className={`ct-toast ct-toast--${toast.type}`} role="alert">
          <span className="ct-toast-msg">{toast.msg}</span>
          <button className="ct-toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* ── View modal ──────────────────────────────────────── */}
      {viewItem && (
        <div className="ct-view-overlay" onClick={() => setViewItem(null)}>
          <div className="ct-view-box" onClick={e => e.stopPropagation()}>
            <div className="ct-view-header">
              <span><FiFileText size={16} /> Detalle de Constancia</span>
              <button className="ct-view-close" onClick={() => setViewItem(null)}><FiX size={18} /></button>
            </div>
            <div className="ct-view-body">
              <div className="ct-view-group">
                <h4 className="ct-view-group-title">Beneficiario</h4>
                <div className="ct-view-row"><span className="ct-view-key">Nombre</span><span className="ct-view-val">{viewItem.nombre}</span></div>
                <div className="ct-view-row"><span className="ct-view-key">DNI</span><span className="ct-view-val">{viewItem.dni}</span></div>
                {viewItem.telefono && <div className="ct-view-row"><span className="ct-view-key">Teléfono</span><span className="ct-view-val">{viewItem.telefono}</span></div>}
                {viewItem.direccion && <div className="ct-view-row"><span className="ct-view-key">Dirección</span><span className="ct-view-val">{viewItem.direccion}</span></div>}
                {viewItem.correo && <div className="ct-view-row"><span className="ct-view-key">Correo</span><span className="ct-view-val">{viewItem.correo}</span></div>}
              </div>
              {(viewItem.funcionario || viewItem.cargo || viewItem.dependencia) && (
              <div className="ct-view-group">
                <h4 className="ct-view-group-title">Funcionario autorizante</h4>
                {viewItem.funcionario && <div className="ct-view-row"><span className="ct-view-key">Nombre</span><span className="ct-view-val">{viewItem.funcionario}</span></div>}
                {viewItem.cargo && <div className="ct-view-row"><span className="ct-view-key">Cargo</span><span className="ct-view-val">{viewItem.cargo}</span></div>}
                {viewItem.dependencia && <div className="ct-view-row"><span className="ct-view-key">Dependencia</span><span className="ct-view-val">{viewItem.dependencia}</span></div>}
              </div>
              )}
              <div className="ct-view-group">
                <h4 className="ct-view-group-title">Transferencia</h4>
                <div className="ct-view-row"><span className="ct-view-key">Monto</span><span className="ct-view-val ct-view-monto">Lps. {parseFloat(viewItem.monto).toLocaleString('es-HN', { minimumFractionDigits: 2 })}</span></div>
                <div className="ct-view-row"><span className="ct-view-key">Banco receptor</span><span className="ct-view-val">{viewItem.banco_receptor}</span></div>
                {viewItem.tipo_cuenta && <div className="ct-view-row"><span className="ct-view-key">Tipo de cuenta</span><span className="ct-view-val">{viewItem.tipo_cuenta}</span></div>}
                <div className="ct-view-row"><span className="ct-view-key">N° de cuenta</span><span className="ct-view-val">{viewItem.numero_cuenta}</span></div>
                <div className="ct-view-row"><span className="ct-view-key">Fecha</span><span className="ct-view-val">{viewItem.fecha_dia} de {viewItem.fecha_mes} de {viewItem.fecha_anio}</span></div>
              </div>
              <div className="ct-view-group">
                <h4 className="ct-view-group-title">Concepto</h4>
                <p className="ct-view-concepto">{viewItem.concepto}</p>
              </div>
              <div className="ct-view-group">
                <div className="ct-view-row"><span className="ct-view-key">Creado por</span><span className="ct-view-val">{viewItem.usuario_nombre || '—'}</span></div>
                <div className="ct-view-row"><span className="ct-view-key">Fecha de registro</span><span className="ct-view-val">{fmtDate(viewItem.created_at)}</span></div>
              </div>
            </div>
            <div className="ct-view-footer">
              <button className="ct-view-btn-close" onClick={() => setViewItem(null)}>Cerrar</button>
              <button className="ct-view-btn-dl" onClick={() => handleDescargar(viewItem)}>
                <FiDownload size={15} /> Descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm modal ───────────────────────────────────── */}
      {confirmCfg && (
        <div className="ct-confirm-overlay" onClick={() => setConfirmCfg(null)}>
          <div className="ct-confirm-box" onClick={e => e.stopPropagation()}>
            <p>{confirmCfg.msg}</p>
            <div className="ct-confirm-btns">
              <button className="ct-cfm-cancel" onClick={() => setConfirmCfg(null)}>Cancelar</button>
              <button className="ct-cfm-ok" onClick={() => { confirmCfg.onOk(); setConfirmCfg(null); }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* monto en letras */
function montoPrev(val) {
  const n = Math.floor(Math.abs(parseFloat(val) || 0));
  const dec = Math.round((Math.abs(parseFloat(val) || 0) - n) * 100);
  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  function grupo(x) {
    if (x === 0) return '';
    if (x === 100) return 'CIEN';
    let res = '';
    const c = Math.floor(x / 100); const resto = x % 100;
    if (c > 0) res += centenas[c] + (resto > 0 ? ' ' : '');
    if (resto < 20) res += unidades[resto];
    else { const d = Math.floor(resto / 10); const u = resto % 10; res += decenas[d] + (u > 0 ? ' Y ' + unidades[u] : ''); }
    return res.trim();
  }
  if (n === 0) return `CERO LEMPIRAS CON ${dec.toString().padStart(2, '0')}/100`;
  const millones = Math.floor(n / 1000000);
  const miles = Math.floor((n % 1000000) / 1000);
  const resto = n % 1000;
  let r = '';
  if (millones > 0) r += (millones === 1 ? 'UN MILLÓN' : grupo(millones) + ' MILLONES') + ' ';
  if (miles > 0)    r += (miles === 1 ? 'MIL' : grupo(miles) + ' MIL') + ' ';
  if (resto > 0)    r += grupo(resto);
  return r.trim() + ` LEMPIRAS CON ${dec.toString().padStart(2, '0')}/100`;
}

/* formatear fecha ISO a dd/mm/yyyy hh:mm */
function fmtDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}
