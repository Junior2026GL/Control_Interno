import { useState, useCallback, useEffect, useContext } from 'react';
import { FiPlus, FiX, FiEye, FiEdit2, FiSearch, FiRefreshCw, FiFileText, FiSlash, FiPrinter, FiDownload } from 'react-icons/fi';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import { generarSapPdf } from '../utils/sapTransferenciaPdf';
import './CheckList.css';

const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];
const UNIDAD_DEFECTO = 'PAGADURIA ESPECIAL';
const PAGE_SIZE = 10;

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const buildEmpty = () => ({ fecha_solicitud: hoy(), unidad_solicitante: UNIDAD_DEFECTO, monto_cotizacion: '' });
const pad = n => String(n).padStart(4, '0');
const fmtFecha = str => {
  if (!str) return '—';
  return new Date(String(str).split('T')[0] + 'T12:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const fmtMonto = v => 'L ' + (parseFloat(v) || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Definido fuera del componente para que no se vuelva a montar en cada render
function FormFields({ values, onChange }) {
  return (
    <>
      <div className="cl-form-row">
        <div className="cl-form-group">
          <label>Fecha de solicitud</label>
          <input type="date" className="cl-input" value={values.fecha_solicitud}
            onChange={e => onChange('fecha_solicitud', e.target.value)} required />
        </div>
        <div className="cl-form-group">
          <label>Monto según cotización (L)</label>
          <input type="number" className="cl-input" value={values.monto_cotizacion} min="0.01" step="0.01"
            onChange={e => onChange('monto_cotizacion', e.target.value)} placeholder="Ej. 23113.31" required />
        </div>
      </div>
      <div className="cl-form-group">
        <label>Unidad / Departamento solicitante</label>
        <input className="cl-input" value={values.unidad_solicitante} maxLength={200}
          onChange={e => onChange('unidad_solicitante', e.target.value.toUpperCase())} placeholder={UNIDAD_DEFECTO} required />
      </div>
    </>
  );
}

export default function SapTransferencia() {
  const { user } = useContext(AuthContext);
  const esAdmin = ROLES_ADMIN.includes(user?.rol);

  const [lista, setLista]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage]         = useState(1);
  const [tabFiltro, setTabFiltro] = useState('activos');

  const [modalCrear, setModalCrear] = useState(false);
  const [abriendo, setAbriendo]     = useState(false);
  const [form, setForm]             = useState(buildEmpty());
  const [formErr, setFormErr]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [ordenReservada, setOrdenReservada] = useState(null);

  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState(buildEmpty());
  const [editErr, setEditErr]   = useState('');
  const [editing, setEditing]   = useState(false);

  const [verItem, setVerItem] = useState(null);

  const [anularItem, setAnularItem] = useState(null);
  const [motivo, setMotivo]         = useState('');
  const [anularErr, setAnularErr]   = useState('');
  const [anulando, setAnulando]     = useState(false);

  const showToast = (msg, type = 'error') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

  const fetchLista = useCallback(() => {
    setLoading(true);
    api.get('/sap-transferencia', { headers: authHeaders() })
      .then(r => setLista(r.data))
      .catch(() => showToast('Error al cargar los SAP.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { fetchLista(); }, [fetchLista]);

  const cntActivos = lista.filter(s => s.estado !== 'anulado').length;

  const listaMostrada = (() => {
    const q = busqueda.trim().toLowerCase();
    const base = tabFiltro === 'todos' ? lista : lista.filter(s => s.estado !== 'anulado');
    if (!q) return base;
    return base.filter(s =>
      s.numero_texto.includes(q) || String(s.anio).includes(q) ||
      (s.unidad_solicitante || '').toLowerCase().includes(q) ||
      (s.creado_por_nombre || '').toLowerCase().includes(q) ||
      String(s.monto_cotizacion).includes(q)
    );
  })();
  const totalPages    = Math.max(1, Math.ceil(listaMostrada.length / PAGE_SIZE));
  const listaPaginada = listaMostrada.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── PDF ──
  const generarPDF = async (s, imprimir) => {
    try { await generarSapPdf(s, user?.nombre, imprimir); }
    catch (err) { console.error('[generarSapPdf]', err); showToast('Error al generar el PDF: ' + (err?.message || 'Error desconocido')); }
  };

  // ── Crear: reserva la próxima orden libre al abrir; la libera si se cancela ──
  const openCrear = async () => {
    if (abriendo) return;
    setAbriendo(true);
    try {
      const { data } = await api.post('/orden-sap-transferencia/reservar', { anio: new Date().getFullYear() }, { headers: authHeaders() });
      setOrdenReservada(data);
      setForm(buildEmpty());
      setFormErr('');
      setModalCrear(true);
    } catch (err) {
      showToast(err.response?.data?.message || 'No se pudo reservar una orden. Pida que generen órdenes en "Órdenes de SAP Transferencia".');
    } finally {
      setAbriendo(false);
    }
  };

  const cancelCrear = useCallback(async () => {
    if (ordenReservada) {
      try { await api.post('/orden-sap-transferencia/liberar', { id: ordenReservada.id }, { headers: authHeaders() }); } catch { /* silencioso */ }
      setOrdenReservada(null);
    }
    setModalCrear(false);
    setForm(buildEmpty());
  }, [ordenReservada]);

  useEffect(() => {
    if (!modalCrear) return;
    const onKey = e => { if (e.key === 'Escape') cancelCrear(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalCrear, cancelCrear]);

  const handleCrear = async (e) => {
    e.preventDefault();
    setFormErr('');
    if (!ordenReservada?.id) { setFormErr('Debe reservar una orden válida antes de crear el SAP.'); return; }
    setSaving(true);
    try {
      await api.post('/sap-transferencia', {
        ...form,
        numero_orden: ordenReservada.numero,
        numero_orden_id: ordenReservada.id,
        numero_orden_anio: ordenReservada.anio,
      }, { headers: authHeaders() });
      setOrdenReservada(null);
      setModalCrear(false);
      setForm(buildEmpty());
      fetchLista();
      showToast('SAP creado correctamente.', 'ok');
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  // ── Editar ──
  const openEditar = (s) => {
    setEditItem(s);
    setEditForm({
      fecha_solicitud: String(s.fecha_solicitud).split('T')[0],
      unidad_solicitante: s.unidad_solicitante || UNIDAD_DEFECTO,
      monto_cotizacion: String(s.monto_cotizacion),
    });
    setEditErr('');
  };
  const handleEditar = async (e) => {
    e.preventDefault();
    setEditErr('');
    setEditing(true);
    try {
      await api.put(`/sap-transferencia/${editItem.id}`, editForm, { headers: authHeaders() });
      setEditItem(null);
      fetchLista();
      showToast('SAP actualizado correctamente.', 'ok');
    } catch (err) {
      setEditErr(err.response?.data?.message || 'Error al guardar.');
    } finally {
      setEditing(false);
    }
  };

  // ── Anular ──
  const handleAnular = async (e) => {
    e.preventDefault();
    setAnularErr('');
    if (!motivo.trim()) { setAnularErr('Debe indicar el motivo de anulación.'); return; }
    setAnulando(true);
    try {
      await api.post(`/sap-transferencia/${anularItem.id}/anular`, { motivo }, { headers: authHeaders() });
      setAnularItem(null); setMotivo('');
      fetchLista();
      showToast('SAP anulado correctamente.', 'ok');
    } catch (err) {
      setAnularErr(err.response?.data?.message || 'Error al anular.');
    } finally {
      setAnulando(false);
    }
  };

  return (
    <div className="cl-page">
      <Navbar />
      <div className="cl-content">

        <div className="cl-header">
          <div className="cl-header-brand">
            <div className="cl-header-icon"><FiFileText size={22} /></div>
            <div>
              <h1 className="cl-header-title">SAP Transferencia</h1>
              <p className="cl-header-sub">Solicitud de Asignación Presupuestaria — Pagaduría Especial</p>
            </div>
          </div>
          <div className="cl-header-stats">
            <div className="cl-hstat">
              <span className="cl-hstat-val">{cntActivos}</span>
              <span className="cl-hstat-lbl">Activos</span>
            </div>
          </div>
        </div>

        <div className="cl-toolbar">
          <div className="cl-toolbar-left">
            <div className="cl-search-wrap">
              <FiSearch size={14} className="cl-search-icon" />
              <input className="cl-search-input" placeholder="Buscar por N°, unidad, monto, responsable..."
                value={busqueda} onChange={e => { setBusqueda(e.target.value); setPage(1); }} />
            </div>
            <div className="cl-tabs">
              <button className={`cl-tab ${tabFiltro === 'activos' ? 'cl-tab--active' : ''}`}
                onClick={() => { setTabFiltro('activos'); setPage(1); }}>Activos <span className="cl-tab-cnt">{cntActivos}</span></button>
              <button className={`cl-tab ${tabFiltro === 'todos' ? 'cl-tab--active' : ''}`}
                onClick={() => { setTabFiltro('todos'); setPage(1); }}>Todos <span className="cl-tab-cnt">{lista.length}</span></button>
            </div>
          </div>
          <div className="cl-toolbar-right">
            <button className="cl-tool-icon" onClick={fetchLista} title="Actualizar"><FiRefreshCw size={15} /></button>
            <button className="cl-tool-btn-new" onClick={openCrear} disabled={abriendo}>
              <FiPlus size={13} /> {abriendo ? 'Cargando…' : 'Nuevo SAP'}
            </button>
          </div>
        </div>

        <div className="cl-table-wrap">
          {loading ? (
            <div className="cl-empty"><FiFileText size={40} /><p>Cargando…</p></div>
          ) : listaMostrada.length === 0 ? (
            <div className="cl-empty"><FiFileText size={40} /><p>No hay SAP registrados.</p></div>
          ) : (
            <table className="cl-table">
              <thead>
                <tr>
                  <th><span className="cl-th-inner cl-th-center">#</span></th>
                  <th><span className="cl-th-inner">N° SAP</span></th>
                  <th><span className="cl-th-inner">Fecha de solicitud</span></th>
                  <th><span className="cl-th-inner">Unidad solicitante</span></th>
                  <th><span className="cl-th-inner">Monto según cotización</span></th>
                  <th><span className="cl-th-inner">Creado por</span></th>
                  <th><span className="cl-th-inner cl-th-center">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {listaPaginada.map((s, idx) => (
                  <tr key={s.id} className={`${idx % 2 === 1 ? 'cl-tr-alt' : ''} ${s.estado === 'anulado' ? 'cl-tr-anulado' : ''}`}>
                    <td className="cl-td-num">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td>
                      <div className="cl-exp-wrap">
                        <div className="cl-avatar">{s.numero_texto}</div>
                        <div>
                          <div className="cl-exp-num">{s.numero_texto}-{s.anio}</div>
                          {s.estado === 'anulado' && <span className="cl-badge-anulado">ANULADO</span>}
                        </div>
                      </div>
                    </td>
                    <td className="cl-td-fecha">{fmtFecha(s.fecha_solicitud)}</td>
                    <td>{s.unidad_solicitante}</td>
                    <td className="cl-folios">{fmtMonto(s.monto_cotizacion)}</td>
                    <td className="cl-td-creado">{s.creado_por_nombre || '—'}</td>
                    <td>
                      <div className="cl-actions">
                        <button className="cl-act-btn cl-act-btn--view" title="Ver detalle" onClick={() => setVerItem(s)}><FiEye size={13} /></button>
                        <button className="cl-act-btn cl-act-btn--print" title="Imprimir PDF" onClick={() => generarPDF(s, true)}><FiPrinter size={13} /></button>
                        <button className="cl-act-btn cl-act-btn--dl" title="Descargar PDF" onClick={() => generarPDF(s, false)}><FiDownload size={13} /></button>
                        {s.estado !== 'anulado' && (
                          <button className="cl-act-btn cl-act-btn--edit" title="Editar" onClick={() => openEditar(s)}><FiEdit2 size={13} /></button>
                        )}
                        {s.estado !== 'anulado' && esAdmin && (
                          <button className="cl-act-btn" title="Anular" style={{ color: '#e11d48' }}
                            onClick={() => { setAnularItem(s); setMotivo(''); setAnularErr(''); }}><FiSlash size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && listaMostrada.length > PAGE_SIZE && (
          <div className="std-pg">
            <span className="std-pg-info">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, listaMostrada.length)} de <strong>{listaMostrada.length}</strong>
            </span>
            <div className="std-pg-controls">
              <button className="std-pg-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
              <button className="std-pg-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
              <span className="std-pg-total">Pág. <strong>{page}</strong> / {totalPages}</span>
              <button className="std-pg-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
              <button className="std-pg-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal crear ── */}
      {modalCrear && (
        <div className="cl-backdrop">
          <div className="cl-modal">
            <div className="cl-modal-header">
              <div className="cl-modal-icon"><FiFileText size={20} color="#274C8D" /></div>
              <div>
                <h3>Nuevo SAP Transferencia{ordenReservada ? ` — N° ${pad(ordenReservada.numero)}` : ''}</h3>
                <p>Complete los datos de la solicitud</p>
              </div>
              <button className="cl-modal-close" onClick={cancelCrear}><FiX size={18} /></button>
            </div>
            <form onSubmit={handleCrear}>
              <div className="cl-form">
                <FormFields values={form} onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))} />
                {formErr && <div className="cl-server-err">{formErr}</div>}
              </div>
              <div className="cl-modal-footer">
                <button type="button" className="btn-secondary" onClick={cancelCrear}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Crear SAP'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal editar ── */}
      {editItem && (
        <div className="cl-backdrop" onClick={e => e.target === e.currentTarget && setEditItem(null)}>
          <div className="cl-modal">
            <div className="cl-modal-header">
              <div className="cl-modal-icon"><FiEdit2 size={20} color="#274C8D" /></div>
              <div>
                <h3>Editar SAP N° {editItem.numero_texto}-{editItem.anio}</h3>
                <p>El número no se puede cambiar</p>
              </div>
              <button className="cl-modal-close" onClick={() => setEditItem(null)}><FiX size={18} /></button>
            </div>
            <form onSubmit={handleEditar}>
              <div className="cl-form">
                <FormFields values={editForm} onChange={(k, v) => setEditForm(p => ({ ...p, [k]: v }))} />
                {editErr && <div className="cl-server-err">{editErr}</div>}
              </div>
              <div className="cl-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditItem(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={editing}>{editing ? 'Guardando…' : 'Guardar Cambios'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal ver detalle ── */}
      {verItem && (
        <div className="cl-backdrop" onClick={e => e.target === e.currentTarget && setVerItem(null)}>
          <div className="cl-modal">
            <div className="cl-ver-header">
              <div>
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>N° SAP Transferencia</div>
                <div className="cl-ver-num">{verItem.numero_texto}</div>
              </div>
              <div className="cl-ver-meta" style={{ flex: 1 }}>
                <span className="cl-ver-meta-fecha">Año {verItem.anio}</span>
                <span className="cl-ver-meta-user">{verItem.creado_por_nombre || '—'}</span>
              </div>
              <button className="cl-modal-close" style={{ color: 'rgba(255,255,255,0.7)' }} onClick={() => setVerItem(null)}><FiX size={18} /></button>
            </div>
            <div className="cl-ver-body">
              <div className="cl-ver-fields">
                <div className="cl-ver-field"><div className="cl-ver-field-label">Fecha de solicitud</div><div className="cl-ver-field-value">{fmtFecha(verItem.fecha_solicitud)}</div></div>
                <div className="cl-ver-field"><div className="cl-ver-field-label">Monto según cotización</div><div className="cl-ver-field-value">{fmtMonto(verItem.monto_cotizacion)}</div></div>
              </div>
              <div className="cl-ver-fields">
                <div className="cl-ver-field"><div className="cl-ver-field-label">Unidad / Departamento solicitante</div><div className="cl-ver-field-value">{verItem.unidad_solicitante}</div></div>
                <div className="cl-ver-field"><div className="cl-ver-field-label">Registrado</div><div className="cl-ver-field-value">{fmtFecha(verItem.creado_en)}</div></div>
              </div>
              {verItem.estado === 'anulado' && (
                <>
                  <div className="cl-ver-section-title">Anulado</div>
                  <div className="cl-ver-obs">{verItem.motivo_anulacion || '—'}</div>
                </>
              )}
              <div className="cl-modal-footer" style={{ paddingLeft: 0, paddingRight: 0 }}>
                <button className="btn-secondary" onClick={() => generarPDF(verItem, false)}><FiDownload size={14} /> Descargar PDF</button>
                <button className="btn-primary" onClick={() => generarPDF(verItem, true)}><FiPrinter size={14} /> Imprimir</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal anular ── */}
      {anularItem && (
        <div className="cl-backdrop" onClick={e => e.target === e.currentTarget && setAnularItem(null)}>
          <div className="cl-modal">
            <div className="cl-modal-header">
              <div className="cl-modal-icon"><FiSlash size={20} color="#e11d48" /></div>
              <div>
                <h3>Anular SAP N° {anularItem.numero_texto}-{anularItem.anio}</h3>
                <p>El número quedará como anulado y no se vuelve a usar</p>
              </div>
              <button className="cl-modal-close" onClick={() => setAnularItem(null)}><FiX size={18} /></button>
            </div>
            <form onSubmit={handleAnular}>
              <div className="cl-form">
                <div className="cl-form-group">
                  <label>Motivo de anulación</label>
                  <textarea className="cl-textarea" value={motivo} maxLength={500} onChange={e => setMotivo(e.target.value)} placeholder="Escriba el motivo..." required />
                </div>
                {anularErr && <div className="cl-server-err">{anularErr}</div>}
              </div>
              <div className="cl-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setAnularItem(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={anulando}>{anulando ? 'Anulando…' : 'Anular SAP'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className={`cl-toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
