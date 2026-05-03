import { useEffect, useState, useContext, useCallback } from 'react';
import {
  FiPlus, FiX, FiSearch, FiPrinter, FiTrash2, FiEye,
  FiUser, FiCalendar, FiMapPin, FiDollarSign, FiEdit3,
  FiRefreshCw, FiArrowDown, FiArrowUp,
} from 'react-icons/fi';
import { LuFileSpreadsheet } from 'react-icons/lu';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import { generarPdfViatico } from '../utils/viaticoPdf';
import './Viaticos.css';

const NOTA1_DEFAULT =
  'SE LE ASIGNA EL 30% DE LA ZONA 3, EN VISTA QUE EN LA INVITACIÓN OFICIAL SE LE PROVEERÁ ALOJAMIENTO Y ALIMENTACIÓN AL VIAJERO, EN CUMPLIMIENTO AL ESTABLECIDO AL ARTÍCULO 10 DEL REGLAMENTO DE VIÁTICOS.';
const NOTA2_DEFAULT =
  'TODO VIAJERO QUE SE LE HAYA OTORGADO ANTICIPO DE VIÁTICOS Y OTROS GASTOS DE VIAJE, DEBERÁ PRESENTAR ANTE LA PAGADURÍA ESPECIAL DENTRO DE LOS 5 DÍAS HÁBILES DE SU REGRESO, LA RESPECTIVA LIQUIDACIÓN SEGÚN EL REGLAMENTO DE VIÁTICOS.';

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const s = String(dateStr).substring(0, 10); // "2026-03-27"
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function getAllDates(inicio, fin) {
  if (!inicio || !fin) return [];
  const dates = [];
  let cur = inicio;
  while (cur <= fin) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

const EMPTY_DETALLE = { nombre: '', cargo: '', detalle: 'ALIMENTACIÓN Y HOSPEDAJE' };

function buildEmptyForm(userName) {
  return {
    motivo_viaje: '',
    lugar: '',
    dni: '',
    diputado_id: '',
    diputado_nombre: '',
    cargo: '',
    fecha_inicio: '',
    fecha_fin: '',
    tasa_cambio: '',
    nota1: NOTA1_DEFAULT,
    nota2: NOTA2_DEFAULT,
    elaborado_por: userName || '',
    detalle: [{ ...EMPTY_DETALLE }],
    dias: [],        // [{ fecha, monto }]
    montoDefault: '', // monto aplicado automático por día
  };
}

export default function Viaticos() {
  const { user: me } = useContext(AuthContext);

  const [lista, setLista]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [viewData, setViewData]  = useState(null);
  const [form, setForm]         = useState(() => buildEmptyForm(me?.nombre));
  const [dniLoading, setDniLoading] = useState(false);
  const [dniError, setDniError] = useState('');
  const [formErr, setFormErr]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [toast, setToast]       = useState(null);
  const [confirmCfg, setConfirmCfg] = useState(null);
  const [editingId, setEditingId]   = useState(null);
  const [tipoCambio, setTipoCambio] = useState(null);
  const [tcLoading, setTcLoading]   = useState(false);
  const [tcError,   setTcError]     = useState(false);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const askConfirm = (msg, onOk) => setConfirmCfg({ msg, onOk });

  const fetchLista = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/viaticos', { headers: authHeaders() });
      setLista(res.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLista(); }, [fetchLista]);

  // ── Tipo de cambio ─────────────────────────────────────────────
  const fetchTipoCambio = useCallback(async () => {
    setTcLoading(true); setTcError(false);
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      const json = await res.json();
      const hnl = json?.rates?.HNL;
      if (hnl) setTipoCambio(hnl);
      else setTcError(true);
    } catch { setTcError(true); }
    finally { setTcLoading(false); }
  }, []);

  useEffect(() => { fetchTipoCambio(); }, [fetchTipoCambio]);

  // ── DNI lookup ─────────────────────────────────────────────────
  const handleDniSearch = async () => {
    const dni = form.dni.trim();
    if (!dni) return;
    setDniLoading(true); setDniError('');
    try {
      const res = await api.get(`/viaticos/diputado/${encodeURIComponent(dni)}`, { headers: authHeaders() });
      const d = res.data;
      const cargoLabel = `DIPUTADO ${d.tipo}`;
      setForm(f => ({
        ...f,
        diputado_id:    d.id,
        diputado_nombre: d.nombre.toUpperCase(),
        cargo:          cargoLabel,
        detalle:        [{ nombre: d.nombre.toUpperCase(), cargo: cargoLabel, detalle: 'ALIMENTACIÓN Y HOSPEDAJE' }],
      }));
    } catch (err) {
      setDniError(err.response?.data?.message || 'Diputado no encontrado.');
    } finally { setDniLoading(false); }
  };

  // ── Auto-generar días cuando cambia fecha inicio/fin ────────────
  useEffect(() => {
    if (!form.fecha_inicio || !form.fecha_fin) return;
    if (form.fecha_fin < form.fecha_inicio) return;
    const fechas = getAllDates(form.fecha_inicio, form.fecha_fin);
    const monto = parseFloat(form.montoDefault) || 0;
    setForm(f => ({
      ...f,
      dias: fechas.map((fecha, idx) => {
        const existing = f.dias.find(d => d.fecha === fecha);
        // primer y último día pueden tener monto 0 (como el Excel muestra)
        const defaultMonto = (idx === 0) ? 0 : monto;
        return existing || { fecha, monto: defaultMonto };
      }),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.fecha_inicio, form.fecha_fin]);

  // Aplicar monto default a todos los días (excepto primero y último)
  const applyDefaultMonto = () => {
    const monto = parseFloat(form.montoDefault) || 0;
    setForm(f => ({
      ...f,
      dias: f.dias.map((d, idx) => ({
        ...d,
        monto: (idx === 0 || idx === f.dias.length - 1) ? 0 : monto,
      })),
    }));
  };

  // ── Guardar ──────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setFormErr('');
    if (!form.motivo_viaje.trim()) return setFormErr('El motivo de viaje es requerido.');
    if (!form.lugar.trim())        return setFormErr('El lugar es requerido.');
    if (!form.diputado_id)         return setFormErr('Busca al diputado por DNI primero.');
    if (!form.fecha_inicio || !form.fecha_fin) return setFormErr('Las fechas son requeridas.');
    if (!form.tasa_cambio)         return setFormErr('La tasa de cambio es requerida.');

    const payload = {
      motivo_viaje: form.motivo_viaje,
      lugar:        form.lugar,
      diputado_id:  form.diputado_id,
      fecha_inicio: form.fecha_inicio,
      fecha_fin:    form.fecha_fin,
      cargo:        form.cargo,
      tasa_cambio:  parseFloat(form.tasa_cambio),
      nota1:        form.nota1,
      nota2:        form.nota2,
      detalle:      form.detalle,
      dias:         form.dias,
    };
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/viaticos/${editingId}`, payload, { headers: authHeaders() });
        showToast('Viático actualizado correctamente.');
      } else {
        await api.post('/viaticos', payload, { headers: authHeaders() });
        showToast('Viático guardado correctamente.');
      }
      setModal(false);
      setEditingId(null);
      setForm(buildEmptyForm(me?.nombre));
      fetchLista();
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Error al guardar.');
      showToast(err.response?.data?.message || 'Error al guardar.', 'error');
    } finally { setSaving(false); }
  };

  // ── Ver detalle ──────────────────────────────────────────────────
  const handleView = async (id) => {
    try {
      const res = await api.get(`/viaticos/${id}`, { headers: authHeaders() });
      setViewData(res.data);
    } catch {
      showToast('Error al cargar el viático.', 'error');
    }
  };

  // ── Imprimir PDF ─────────────────────────────────────────────────
  const handlePrint = async (id) => {
    try {
      const res = await api.get(`/viaticos/${id}`, { headers: authHeaders() });
      await generarPdfViatico(res.data, me?.nombre);
      showToast('PDF generado correctamente.');
    } catch {
      showToast('Error al cargar el viático.', 'error');
    }
  };

  // ── Eliminar ─────────────────────────────────────────────────────
  const handleDelete = (id) => {
    askConfirm('¿Eliminar este viático? Esta acción no se puede deshacer.', async () => {
      try {
        await api.delete(`/viaticos/${id}`, { headers: authHeaders() });
        showToast('Viático eliminado correctamente.');
        fetchLista();
      } catch { showToast('Error al eliminar.', 'error'); }
    });
  };

  const filtrada = lista.filter(v =>
    (v.diputado_nombre || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.lugar || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.motivo_viaje || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalDias = form.dias.length;
  const totalUSD  = form.dias.reduce((s, d) => s + (parseFloat(d.monto) || 0), 0);
  const totalLPS  = totalUSD * (parseFloat(form.tasa_cambio) || 0);

  const openModal = () => {
    setForm(buildEmptyForm(me?.nombre));
    setEditingId(null);
    setDniError(''); setFormErr('');
    setModal(true);
  };

  const handleEdit = async (id) => {
    try {
      const res = await api.get(`/viaticos/${id}`, { headers: authHeaders() });
      const v = res.data;
      setForm({
        motivo_viaje:   v.motivo_viaje || '',
        lugar:          v.lugar || '',
        dni:            v.identidad || '',
        diputado_id:    v.diputado_id,
        diputado_nombre: v.diputado_nombre || '',
        cargo:          v.cargo || '',
        fecha_inicio:   (v.fecha_inicio || '').substring(0, 10),
        fecha_fin:      (v.fecha_fin || '').substring(0, 10),
        tasa_cambio:    v.tasa_cambio || '',
        nota1:          v.nota1 || '',
        nota2:          v.nota2 || '',
        elaborado_por:  me?.nombre || '',
        detalle: v.detalle?.length ? v.detalle : [{ nombre: '', cargo: '', detalle: '' }],
        dias:    (v.dias || []).map(d => ({ fecha: (d.fecha || '').substring(0, 10), monto: d.monto })),
        montoDefault: '',
      });
      setEditingId(id);
      setDniError(''); setFormErr('');
      setModal(true);
    } catch {
      showToast('Error al cargar el viático.', 'error');
    }
  };

  return (
    <div className="page-shell">
      <Navbar />
      <div className="page-content vt-content">

        {/* ── Header ── */}
        <div className="vt-header">
          <div>
            <h1><LuFileSpreadsheet size={26} /> Cuadro de Viáticos</h1>
            <p>Pagaduría Especial — Congreso Nacional</p>
          </div>
          <button className="vt-btn-primary" onClick={openModal}>
            <FiPlus size={15} /> Nuevo Viático
          </button>
        </div>

        {/* ── Tipo de Cambio ── */}
        <div className="vt-tc-card">
          <div className="vt-tc-brand">
            <FiDollarSign size={18}/>
            <span>Tipo de Cambio <strong>USD / HNL</strong></span>
          </div>
          {tcLoading ? (
            <span className="vt-tc-loading">Consultando…</span>
          ) : tcError ? (
            <span className="vt-tc-err">No disponible</span>
          ) : tipoCambio ? (
            <div className="vt-tc-rates">
              <div className="vt-tc-item vt-tc-compra">
                <FiArrowDown size={13}/>
                <span className="vt-tc-label">Compra</span>
                <span className="vt-tc-val">L {(tipoCambio * 0.997).toFixed(4)}</span>
              </div>
              <div className="vt-tc-sep"/>
              <div className="vt-tc-item vt-tc-venta">
                <FiArrowUp size={13}/>
                <span className="vt-tc-label">Venta</span>
                <span className="vt-tc-val">L {(tipoCambio * 1.003).toFixed(4)}</span>
              </div>
            </div>
          ) : null}
          <button className="vt-tc-refresh" onClick={fetchTipoCambio} disabled={tcLoading} title="Actualizar">
            <FiRefreshCw size={13}/>
          </button>
        </div>

        {/* ── Buscador ── */}
        <div className="vt-search-bar">
          <FiSearch size={15} />
          <input
            placeholder="Buscar por diputado, lugar o motivo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* ── Tabla ── */}
        <div className="vt-table-wrap">
          {loading ? (
            <div className="vt-empty">Cargando…</div>
          ) : filtrada.length === 0 ? (
            <div className="vt-empty">No hay registros.</div>
          ) : (
            <table className="vt-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Diputado</th>
                  <th>Lugar</th>
                  <th>Motivo</th>
                  <th>Período</th>
                  <th>Elaborado por</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrada.map((v, i) => (
                  <tr key={v.id}>
                    <td>{i + 1}</td>
                    <td>
                      <strong>{v.diputado_nombre}</strong>
                      <br /><span className="vt-tipo">{v.diputado_tipo}</span>
                    </td>
                    <td>{v.lugar}</td>
                    <td className="vt-motivo-cell">{v.motivo_viaje}</td>
                    <td>{formatDate(v.fecha_inicio)} – {formatDate(v.fecha_fin)}<br/><span className="vt-dias">{v.periodo_dias} días</span></td>
                    <td>{v.elaborado_por_nombre}</td>
                    <td>
                      <div className="vt-actions">
                        <button className="vt-icon-btn vt-view" title="Ver detalle" onClick={() => handleView(v.id)}>
                          <FiEye size={15} />
                        </button>
                        <button className="vt-icon-btn vt-print" title="Imprimir PDF" onClick={() => handlePrint(v.id)}>
                          <FiPrinter size={15} />
                        </button>
                        <button className="vt-icon-btn vt-edit" title="Editar" onClick={() => handleEdit(v.id)}>
                          <FiEdit3 size={15} />
                        </button>
                        <button className="vt-icon-btn vt-del" title="Eliminar" onClick={() => handleDelete(v.id)}>
                          <FiTrash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ══════════════ MODAL VER ══════════════ */}
      {viewData && (
        <div className="vt-overlay" onClick={() => setViewData(null)}>
          <div className="vt-modal vt-modal-view" onClick={e => e.stopPropagation()}>
            <div className="vt-modal-header">
              <h2>Detalle del Viático</h2>
              <button className="vt-modal-close" onClick={() => setViewData(null)}><FiX size={18} /></button>
            </div>
            <div className="vt-view-body">
              <div className="vt-view-grid">
                <div className="vt-view-row">
                  <span className="vt-view-lbl">Motivo del Viaje</span>
                  <span className="vt-view-val">{viewData.motivo_viaje}</span>
                </div>
                <div className="vt-view-row">
                  <span className="vt-view-lbl">Lugar</span>
                  <span className="vt-view-val">{viewData.lugar}</span>
                </div>
                <div className="vt-view-row">
                  <span className="vt-view-lbl">Diputado</span>
                  <span className="vt-view-val">{viewData.diputado_nombre} — {viewData.cargo}</span>
                </div>
                <div className="vt-view-row">
                  <span className="vt-view-lbl">DNI</span>
                  <span className="vt-view-val">{viewData.identidad}</span>
                </div>
                <div className="vt-view-row">
                  <span className="vt-view-lbl">Período</span>
                  <span className="vt-view-val">{formatDate(viewData.fecha_inicio)} – {formatDate(viewData.fecha_fin)} ({viewData.periodo_dias} días)</span>
                </div>
                <div className="vt-view-row">
                  <span className="vt-view-lbl">Tasa de Cambio</span>
                  <span className="vt-view-val">L {viewData.tasa_cambio} por $1</span>
                </div>
                <div className="vt-view-row">
                  <span className="vt-view-lbl">Total USD</span>
                  <span className="vt-view-val vt-view-total">${(viewData.dias || []).reduce((s, d) => s + (parseFloat(d.monto) || 0), 0).toFixed(2)}</span>
                </div>
                <div className="vt-view-row">
                  <span className="vt-view-lbl">Elaborado por</span>
                  <span className="vt-view-val">{viewData.elaborado_por_nombre}</span>
                </div>
              </div>

              {/* Días */}
              {(viewData.dias || []).length > 0 && (
                <>
                  <div className="vt-view-subtitle">Días y Montos</div>
                  <div className="vt-dias-grid">
                    {viewData.dias.map((d, i) => (
                      <div key={i} className="vt-dia-cell">
                        <span className="vt-dia-fecha">{formatDate(d.fecha)}</span>
                        <span className="vt-dia-monto">${parseFloat(d.monto || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Detalle personas */}
              {(viewData.detalle || []).length > 0 && (
                <>
                  <div className="vt-view-subtitle">Detalle de Personas</div>
                  <table className="vt-view-table">
                    <thead>
                      <tr><th>#</th><th>Nombre</th><th>Cargo</th><th>Detalle</th></tr>
                    </thead>
                    <tbody>
                      {viewData.detalle.map((row, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{row.nombre}</td>
                          <td>{row.cargo}</td>
                          <td>{row.detalle}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* Notas */}
              {(viewData.nota1 || viewData.nota2) && (
                <>
                  <div className="vt-view-subtitle">Notas</div>
                  {viewData.nota1 && <p className="vt-view-nota">{viewData.nota1}</p>}
                  {viewData.nota2 && <p className="vt-view-nota">{viewData.nota2}</p>}
                </>
              )}
            </div>
            <div className="vt-modal-footer">
              <button className="vt-btn-cancel" onClick={() => setViewData(null)}>Cerrar</button>
              <button className="vt-btn-primary" onClick={() => { setViewData(null); handlePrint(viewData.id); }}>
                <FiPrinter size={14} /> Imprimir PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL CREAR ══════════════ */}
      {modal && (
        <div className="vt-overlay" onClick={() => setModal(false)}>
          <div className="vt-modal" onClick={e => e.stopPropagation()}>

            <div className="vt-modal-header">
              <h2>{editingId ? 'Editar Cuadro de Viáticos' : 'Nuevo Cuadro de Viáticos'}</h2>
              <button className="vt-modal-close" onClick={() => setModal(false)}><FiX size={18} /></button>
            </div>

            <form className="vt-form" onSubmit={handleSave}>

              {/* ── Sección 1: Info del viaje ── */}
              <div className="vt-section-title"><FiMapPin size={13} /> Información del Viaje</div>
              <div className="vt-grid-2">
                <div className="vt-field vt-col-2">
                  <label>MOTIVO DEL VIAJE *</label>
                  <input value={form.motivo_viaje} onChange={e => setForm({...form, motivo_viaje: e.target.value})}
                    placeholder="Ej: DIPLOMADO INTERNACIONAL EN DIRECCIÓN DE EMPRESA…" />
                </div>
                <div className="vt-field">
                  <label>LUGAR *</label>
                  <input value={form.lugar} onChange={e => setForm({...form, lugar: e.target.value})}
                    placeholder="Ej: ANDALUCÍA, ESPAÑA" />
                </div>
                <div className="vt-field">
                  <label>TASA DE CAMBIO (L por $1) *</label>
                  <div className="vt-input-icon">
                    <FiDollarSign size={13} />
                    <input type="number" step="0.01" min="0" value={form.tasa_cambio}
                      onChange={e => setForm({...form, tasa_cambio: e.target.value})}
                      placeholder="Ej: 26.63" />
                  </div>
                </div>
              </div>

              {/* ── Sección 2: Diputado ── */}
              <div className="vt-section-title"><FiUser size={13} /> Datos del Diputado</div>
              <div className="vt-grid-2">
                <div className="vt-field">
                  <label>DNI / IDENTIDAD</label>
                  <div className="vt-dni-row">
                    <input value={form.dni} onChange={e => setForm({...form, dni: e.target.value})}
                      placeholder="Número de identidad…"
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleDniSearch())} />
                    <button type="button" className="vt-btn-search" onClick={handleDniSearch} disabled={dniLoading}>
                      {dniLoading ? '…' : <FiSearch size={14} />}
                    </button>
                  </div>
                  {dniError && <span className="vt-field-err">{dniError}</span>}
                </div>
                <div className="vt-field">
                  <label>NOMBRE COMPLETO</label>
                  <input readOnly value={form.diputado_nombre} className="vt-readonly"
                    placeholder="Se llena automáticamente al buscar DNI" />
                </div>
                <div className="vt-field">
                  <label>CARGO</label>
                  <input readOnly value={form.cargo} className="vt-readonly"
                    placeholder="DIPUTADO PROPIETARIO / SUPLENTE" />
                </div>
              </div>

              {/* ── Sección 3: Fechas y días ── */}
              <div className="vt-section-title"><FiCalendar size={13} /> Período y Montos</div>
              <div className="vt-grid-2">
                <div className="vt-field">
                  <label>FECHA INICIO *</label>
                  <input type="date" value={form.fecha_inicio}
                    onChange={e => setForm({...form, fecha_inicio: e.target.value})} />
                </div>
                <div className="vt-field">
                  <label>FECHA FIN *</label>
                  <input type="date" value={form.fecha_fin}
                    onChange={e => setForm({...form, fecha_fin: e.target.value})} />
                </div>
                <div className="vt-field">
                  <label>MONTO POR DÍA (USD)</label>
                  <div className="vt-input-icon">
                    <FiDollarSign size={13} />
                    <input type="number" step="0.01" min="0" value={form.montoDefault}
                      onChange={e => setForm({...form, montoDefault: e.target.value})}
                      placeholder="Ej: 120.00" />
                  </div>
                </div>
                <div className="vt-field vt-field-center">
                  <label>&nbsp;</label>
                  <button type="button" className="vt-btn-apply" onClick={applyDefaultMonto}
                    disabled={!form.montoDefault || form.dias.length === 0}>
                    Aplicar a todos los días
                  </button>
                </div>
              </div>

              {/* Tabla de días */}
              {form.dias.length > 0 && (
                <div className="vt-dias-wrap">
                  <div className="vt-dias-header">
                    <span>Días del período ({totalDias} días)</span>
                    <span className="vt-dias-total">
                      Total: <strong>${totalUSD.toFixed(2)}</strong>
                      {form.tasa_cambio ? <> = <strong>L {totalLPS.toLocaleString('es-HN', {minimumFractionDigits:2})}</strong></> : null}
                    </span>
                  </div>
                  <div className="vt-dias-grid">
                    {form.dias.map((d, idx) => (
                      <div key={d.fecha} className="vt-dia-cell">
                        <span className="vt-dia-fecha">{formatDate(d.fecha)}</span>
                        <div className="vt-input-icon small">
                          <span>$</span>
                          <input
                            type="number" step="0.01" min="0"
                            value={d.monto}
                            onChange={e => {
                              const newDias = [...form.dias];
                              newDias[idx] = { ...d, monto: e.target.value };
                              setForm(f => ({...f, dias: newDias}));
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Sección 4: Detalle de personas ── */}
              <div className="vt-section-title">
                <FiEdit3 size={13} /> Detalle (Resumen de Viáticos)
                <button type="button" className="vt-add-row" onClick={() =>
                  setForm(f => ({...f, detalle: [...f.detalle, { ...EMPTY_DETALLE }]}))}>
                  <FiPlus size={12} /> Agregar fila
                </button>
              </div>
              <div className="vt-detalle-table">
                <div className="vt-det-head">
                  <span>#</span><span>Nombre</span><span>Cargo</span><span>Detalle</span><span></span>
                </div>
                {form.detalle.map((row, idx) => (
                  <div key={idx} className="vt-det-row">
                    <span className="vt-det-num">{idx + 1}</span>
                    <input value={row.nombre} placeholder="Nombre completo"
                      onChange={e => {
                        const d = [...form.detalle]; d[idx] = {...d[idx], nombre: e.target.value};
                        setForm(f => ({...f, detalle: d}));
                      }} />
                    <input value={row.cargo} placeholder="Cargo"
                      onChange={e => {
                        const d = [...form.detalle]; d[idx] = {...d[idx], cargo: e.target.value};
                        setForm(f => ({...f, detalle: d}));
                      }} />
                    <input value={row.detalle} placeholder="Detalle"
                      onChange={e => {
                        const d = [...form.detalle]; d[idx] = {...d[idx], detalle: e.target.value};
                        setForm(f => ({...f, detalle: d}));
                      }} />
                    <button type="button" className="vt-del-row" onClick={() =>
                      setForm(f => ({...f, detalle: f.detalle.filter((_, i) => i !== idx)}))}>
                      <FiX size={13} />
                    </button>
                  </div>
                ))}
              </div>

              {/* ── Sección 5: Notas ── */}
              <div className="vt-section-title"><FiEdit3 size={13} /> Notas (editables)</div>
              <div className="vt-field">
                <textarea rows={3} value={form.nota1}
                  onChange={e => setForm({...form, nota1: e.target.value})} />
              </div>
              <div className="vt-field">
                <textarea rows={3} value={form.nota2}
                  onChange={e => setForm({...form, nota2: e.target.value})} />
              </div>

              {formErr && <div className="vt-form-err">{formErr}</div>}

              <div className="vt-modal-footer">
                <button type="button" className="vt-btn-cancel" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="vt-btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar Viático'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Toast (igual que otros módulos) ── */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-msg">{toast.msg}</span>
          <button className="toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {/* ── Confirm modal ── */}
      {confirmCfg && (
        <div className="vt-confirm-overlay" onClick={() => setConfirmCfg(null)}>
          <div className="vt-confirm-box" onClick={e => e.stopPropagation()}>
            <h3>Confirmar acción</h3>
            <p>{confirmCfg.msg}</p>
            <div className="vt-confirm-btns">
              <button className="vt-cfm-cancel" onClick={() => setConfirmCfg(null)}>Cancelar</button>
              <button className="vt-cfm-ok" onClick={() => { confirmCfg.onOk(); setConfirmCfg(null); }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
