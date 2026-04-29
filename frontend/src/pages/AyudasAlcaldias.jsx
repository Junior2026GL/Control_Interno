import { useState, useCallback, useEffect } from 'react';
import {
  FiPlus, FiRefreshCw, FiEdit3, FiTrash2, FiX,
  FiCheckCircle, FiAlertCircle, FiFilter, FiList,
  FiDollarSign, FiMapPin,
} from 'react-icons/fi';
import Navbar from '../components/Navbar';
import api from '../api/axios';
import './AyudasAlcaldias.css';

const PARTIDOS = ['PN', 'PL', 'LB', 'DC', 'PINU'];
const MESES    = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DEPARTAMENTOS = [
  'ATLÁNTIDA','CHOLUTECA','COLÓN','COMAYAGUA','COPÁN','CORTÉS',
  'EL PARAÍSO','FRANCISCO MORAZÁN','GRACIAS A DIOS','INTIBUCÁ',
  'ISLAS DE LA BAHÍA','LA PAZ','LEMPIRA','OCOTEPEQUE','OLANCHO',
  'SANTA BÁRBARA','VALLE','YORO',
];

function buildEmpty() {
  return {
    no_cheque: '', cuenta: '', beneficiario: '', departamento: '',
    orden_pago: '', descripcion: '', total: '',
    estado_entrega: 'pendiente', fecha_entrega: '',
    debitado: false, liquidado: false, fecha_liquidacion: '',
    partido: '', mes: '',
  };
}

const PARTIDO_COLOR = {
  PN:   { bg: '#dbeafe', color: '#1e40af' },
  PL:   { bg: '#fee2e2', color: '#b91c1c' },
  LB:   { bg: '#d1fae5', color: '#065f46' },
  DC:   { bg: '#ede9fe', color: '#5b21b6' },
  PINU: { bg: '#fef9c3', color: '#854d0e' },
};

function fmtMonto(v) {
  return `Lps. ${parseFloat(v||0).toLocaleString('es-HN',{minimumFractionDigits:2})}`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

export default function AyudasAlcaldias() {
  const [tab, setTab]           = useState('listado');   // 'listado' | 'nuevo'
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [toast, setToast]       = useState(null);
  const [form, setForm]         = useState(buildEmpty());
  const [editingId, setEditingId] = useState(null);
  const [confirmCfg, setConfirmCfg] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Filtros
  const [filtroDpto,   setFiltroDpto]   = useState('');
  const [filtroMes,    setFiltroMes]    = useState('');
  const [filtroPartido,setFiltroPartido]= useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroDebitado, setFiltroDebitado] = useState('');

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: rows } = await api.get('/ayudas-alcaldias');
      setData(rows);
    } catch {
      setError('No se pudo cargar el listado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // ── totales resumen ──────────────────────────────────────────
  const totalGeneral  = data.reduce((s, r) => s + parseFloat(r.total || 0), 0);
  const totalEntregado = data.filter(r => r.estado_entrega === 'entregado')
                             .reduce((s, r) => s + parseFloat(r.total || 0), 0);
  const totalVencidos = data.filter(r => r.estado_vencimiento === 'VENCIDO').length;

  // ── filtrado ─────────────────────────────────────────────────
  const filtered = data.filter(r => {
    if (filtroDpto    && r.departamento !== filtroDpto) return false;
    if (filtroMes     && r.mes !== filtroMes)           return false;
    if (filtroPartido && r.partido !== filtroPartido)   return false;
    if (filtroEstado  && r.estado_entrega !== filtroEstado) return false;
    if (filtroDebitado === '1' && !r.debitado) return false;
    if (filtroDebitado === '0' && r.debitado)  return false;
    return true;
  });

  // ── submit ───────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.beneficiario.trim()) { showToast('El beneficiario es requerido.','error'); return; }
    if (!form.departamento.trim()) { showToast('El departamento es requerido.','error'); return; }
    if (!form.descripcion.trim())  { showToast('La descripción es requerida.','error'); return; }
    const tot = parseFloat(form.total);
    if (!form.total || isNaN(tot) || tot <= 0) { showToast('El monto debe ser mayor a cero.','error'); return; }

    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/ayudas-alcaldias/${editingId}`, form);
        showToast('Registro actualizado correctamente.');
      } else {
        await api.post('/ayudas-alcaldias', form);
        showToast('Registro creado correctamente.');
      }
      setForm(buildEmpty());
      setEditingId(null);
      setTab('listado');
      cargar();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Error al guardar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (row) => {
    setForm({
      no_cheque:        row.no_cheque || '',
      cuenta:           row.cuenta || '',
      beneficiario:     row.beneficiario || '',
      departamento:     row.departamento || '',
      orden_pago:       row.orden_pago || '',
      descripcion:      row.descripcion || '',
      total:            row.total || '',
      estado_entrega:   row.estado_entrega || 'pendiente',
      fecha_entrega:    row.fecha_entrega ? row.fecha_entrega.split('T')[0] : '',
      debitado:         !!row.debitado,
      liquidado:        !!row.liquidado,
      fecha_liquidacion: row.fecha_liquidacion ? row.fecha_liquidacion.split('T')[0] : '',
      partido:          row.partido || '',
      mes:              row.mes || '',
    });
    setEditingId(row.id);
    setTab('nuevo');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id) => {
    setConfirmCfg({
      msg: '¿Eliminar este registro del listado?',
      onOk: async () => {
        setDeletingId(id);
        try {
          await api.delete(`/ayudas-alcaldias/${id}`);
          setData(d => d.filter(r => r.id !== id));
          showToast('Registro eliminado.');
        } catch (err) {
          showToast(err?.response?.data?.message || 'No se pudo eliminar.', 'error');
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const cancelEdit = () => { setEditingId(null); setForm(buildEmpty()); setTab('listado'); };

  return (
    <div className="page-shell">
      <Navbar />
      <div className="aa-page">

        {/* ── Banner ── */}
        <div className="aa-banner">
          <div className="aa-banner-icon"><FiMapPin size={26} /></div>
          <div>
            <h1 className="aa-banner-title">Listado de Alcaldías Beneficiadas con Ayuda Social</h1>
            <p className="aa-banner-sub">Control de cheques, estados de entrega y liquidaciones</p>
          </div>
        </div>

        {/* ── Tarjetas resumen ── */}
        <div className="aa-cards">
          <div className="aa-card">
            <span className="aa-card-label">Total registros</span>
            <span className="aa-card-val">{data.length}</span>
          </div>
          <div className="aa-card aa-card--blue">
            <span className="aa-card-label">Total general</span>
            <span className="aa-card-val">{fmtMonto(totalGeneral)}</span>
          </div>
          <div className="aa-card aa-card--green">
            <span className="aa-card-label">Total entregado</span>
            <span className="aa-card-val">{fmtMonto(totalEntregado)}</span>
          </div>
          <div className="aa-card aa-card--red">
            <span className="aa-card-label">Registros vencidos</span>
            <span className="aa-card-val">{totalVencidos}</span>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="aa-tabs">
          <button className={`aa-tab ${tab==='listado'?'aa-tab--active':''}`} onClick={() => { setTab('listado'); cargar(); }}>
            <FiList size={14} /> Listado
          </button>
          <button className={`aa-tab ${tab==='nuevo'?'aa-tab--active':''}`} onClick={() => setTab('nuevo')}>
            <FiPlus size={14} /> {editingId ? 'Editando registro' : 'Nuevo registro'}
          </button>
        </div>

        {/* ════════════ TAB LISTADO ════════════ */}
        {tab === 'listado' && (
        <div className="aa-listado">

          {/* Filtros */}
          <div className="aa-filters">
            <div className="aa-filter-icon"><FiFilter size={14}/></div>
            <select className="aa-flt" value={filtroDpto} onChange={e=>setFiltroDpto(e.target.value)}>
              <option value="">Todos los departamentos</option>
              {DEPARTAMENTOS.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
            <select className="aa-flt" value={filtroMes} onChange={e=>setFiltroMes(e.target.value)}>
              <option value="">Todos los meses</option>
              {MESES.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            <select className="aa-flt" value={filtroPartido} onChange={e=>setFiltroPartido(e.target.value)}>
              <option value="">Todos los partidos</option>
              {PARTIDOS.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select className="aa-flt" value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="entregado">Entregado</option>
              <option value="pendiente">Pendiente</option>
            </select>
            <select className="aa-flt" value={filtroDebitado} onChange={e=>setFiltroDebitado(e.target.value)}>
              <option value="">Debitado: todos</option>
              <option value="1">Debitado: Sí</option>
              <option value="0">Debitado: No</option>
            </select>
            <button className="aa-btn-refresh" onClick={cargar} disabled={loading} title="Actualizar">
              <FiRefreshCw size={14} />
            </button>
          </div>

          {error && (
            <div className="aa-error"><FiAlertCircle size={15}/> {error}</div>
          )}

          {loading && <div className="aa-loading">Cargando…</div>}

          {!loading && !error && filtered.length === 0 && (
            <div className="aa-empty">
              <FiDollarSign size={38}/>
              <p>No hay registros para los filtros seleccionados.</p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
          <div className="aa-table-wrap">
            <table className="aa-table">
              <thead>
                <tr>
                  <th>No. Cheq.</th>
                  <th>Cuenta</th>
                  <th>Beneficiario</th>
                  <th>Dpto.</th>
                  <th>O-P</th>
                  <th>Descripción</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Fecha entrega</th>
                  <th>Días</th>
                  <th>Venc.</th>
                  <th>Mes</th>
                  <th>Debitado</th>
                  <th>Liquidado</th>
                  <th>Partido</th>
                  <th>F. Liquidación</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className={r.estado_vencimiento==='VENCIDO'?'aa-row--vencido':''}>
                    <td className="aa-td-cheque">{r.no_cheque||'—'}</td>
                    <td>{r.cuenta||'—'}</td>
                    <td className="aa-td-benef">{r.beneficiario}</td>
                    <td className="aa-td-dpto">{r.departamento}</td>
                    <td className="aa-td-op">{r.orden_pago||'—'}</td>
                    <td className="aa-td-desc" title={r.descripcion}>{r.descripcion}</td>
                    <td className="aa-td-monto">{fmtMonto(r.total)}</td>
                    <td>
                      <span className={`aa-badge ${r.estado_entrega==='entregado'?'aa-badge--ok':'aa-badge--pend'}`}>
                        {r.estado_entrega}
                      </span>
                    </td>
                    <td className="aa-td-fecha">{fmtDate(r.fecha_entrega)}</td>
                    <td className="aa-td-dias">{r.dias_transcurridos ?? '—'}</td>
                    <td>
                      {r.estado_vencimiento
                        ? <span className={`aa-badge ${r.estado_vencimiento==='VENCIDO'?'aa-badge--venc':'aa-badge--vig'}`}>
                            {r.estado_vencimiento}
                          </span>
                        : '—'}
                    </td>
                    <td>{r.mes||'—'}</td>
                    <td className="aa-td-bool">
                      {r.debitado
                        ? <FiCheckCircle size={15} className="aa-icon--ok"/>
                        : <FiX size={15} className="aa-icon--no"/>}
                    </td>
                    <td className="aa-td-bool">
                      {r.liquidado
                        ? <FiCheckCircle size={15} className="aa-icon--ok"/>
                        : <FiX size={15} className="aa-icon--no"/>}
                    </td>
                    <td>
                      {r.partido
                        ? <span className="aa-partido" style={PARTIDO_COLOR[r.partido]||{}}>{r.partido}</span>
                        : '—'}
                    </td>
                    <td className="aa-td-fecha">{fmtDate(r.fecha_liquidacion)}</td>
                    <td className="aa-td-actions">
                      <button className="aa-btn-icon aa-btn-icon--edit" title="Editar" onClick={()=>handleEdit(r)}>
                        <FiEdit3 size={14}/>
                      </button>
                      <button className="aa-btn-icon aa-btn-icon--del" title="Eliminar"
                        disabled={deletingId===r.id} onClick={()=>handleDelete(r.id)}>
                        <FiTrash2 size={14}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
        )}

        {/* ════════════ TAB NUEVO / EDITAR ════════════ */}
        {tab === 'nuevo' && (
        <form className="aa-form" onSubmit={handleSubmit} noValidate>

          <div className="aa-form-grid">

            {/* ── Sección 1: Identificación ── */}
            <div className="aa-section">
              <div className="aa-section-head">
                <span className="aa-step">1</span>
                <div>
                  <h2 className="aa-section-title">Identificación del cheque</h2>
                  <p className="aa-section-desc">No. cheque, cuenta y orden de pago</p>
                </div>
              </div>
              <div className="aa-fields">
                <div className="aa-row3">
                  <div className="aa-field">
                    <label className="aa-label">No. Cheque</label>
                    <input className="aa-input" type="text" placeholder="165121" value={form.no_cheque} onChange={e=>set('no_cheque',e.target.value)}/>
                  </div>
                  <div className="aa-field">
                    <label className="aa-label">Cuenta</label>
                    <input className="aa-input" type="text" placeholder="512-20" value={form.cuenta} onChange={e=>set('cuenta',e.target.value)}/>
                  </div>
                  <div className="aa-field">
                    <label className="aa-label">Orden de Pago (O-P)</label>
                    <input className="aa-input" type="text" placeholder="001/AS/2026" value={form.orden_pago} onChange={e=>set('orden_pago',e.target.value)}/>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Sección 2: Beneficiario ── */}
            <div className="aa-section">
              <div className="aa-section-head">
                <span className="aa-step">2</span>
                <div>
                  <h2 className="aa-section-title">Beneficiario</h2>
                  <p className="aa-section-desc">Alcaldía y departamento</p>
                </div>
              </div>
              <div className="aa-fields">
                <div className="aa-field-full">
                  <label className="aa-label">Beneficiario <span className="aa-req">*</span></label>
                  <input className="aa-input" type="text" placeholder="ALCALDÍA MUNICIPAL DE..."
                    value={form.beneficiario} onChange={e=>set('beneficiario',e.target.value.toUpperCase())} required/>
                </div>
                <div className="aa-row2">
                  <div className="aa-field">
                    <label className="aa-label">Departamento <span className="aa-req">*</span></label>
                    <select className="aa-input aa-select" value={form.departamento} onChange={e=>set('departamento',e.target.value)} required>
                      <option value="">Seleccione…</option>
                      {DEPARTAMENTOS.map(d=><option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="aa-field">
                    <label className="aa-label">Partido Político</label>
                    <select className="aa-input aa-select" value={form.partido} onChange={e=>set('partido',e.target.value)}>
                      <option value="">Sin partido</option>
                      {PARTIDOS.map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Sección 3: Monto y descripción ── */}
            <div className="aa-section">
              <div className="aa-section-head">
                <span className="aa-step">3</span>
                <div>
                  <h2 className="aa-section-title">Monto y descripción</h2>
                  <p className="aa-section-desc">Tipo de ayuda e importe</p>
                </div>
              </div>
              <div className="aa-fields">
                <div className="aa-row2">
                  <div className="aa-field">
                    <label className="aa-label">Total (Lps.) <span className="aa-req">*</span></label>
                    <div className="aa-icon-field">
                      <span className="aa-currency">Lps.</span>
                      <input className="aa-input aa-has-icon" type="number" placeholder="0.00" min="0.01" step="0.01"
                        value={form.total} onChange={e=>set('total',e.target.value)} required/>
                    </div>
                  </div>
                  <div className="aa-field">
                    <label className="aa-label">Mes</label>
                    <select className="aa-input aa-select" value={form.mes} onChange={e=>set('mes',e.target.value)}>
                      <option value="">Seleccione…</option>
                      {MESES.map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div className="aa-field-full">
                  <label className="aa-label">Descripción <span className="aa-req">*</span></label>
                  <textarea className="aa-input aa-textarea" rows={3} placeholder="Ej: AYUDA ECONÓMICA PARA FERIA PATRONAL..."
                    value={form.descripcion} onChange={e=>set('descripcion',e.target.value)} required/>
                </div>
              </div>
            </div>

            {/* ── Sección 4: Estado y fechas ── */}
            <div className="aa-section">
              <div className="aa-section-head">
                <span className="aa-step">4</span>
                <div>
                  <h2 className="aa-section-title">Estado de entrega y liquidación</h2>
                  <p className="aa-section-desc">Seguimiento del cheque</p>
                </div>
              </div>
              <div className="aa-fields">
                <div className="aa-row2">
                  <div className="aa-field">
                    <label className="aa-label">Estado de entrega</label>
                    <select className="aa-input aa-select" value={form.estado_entrega} onChange={e=>set('estado_entrega',e.target.value)}>
                      <option value="pendiente">Pendiente</option>
                      <option value="entregado">Entregado</option>
                    </select>
                  </div>
                  <div className="aa-field">
                    <label className="aa-label">Fecha de entrega</label>
                    <input lang="es" className="aa-input" type="date" value={form.fecha_entrega} onChange={e=>set('fecha_entrega',e.target.value)}/>
                  </div>
                </div>
                <div className="aa-row3-checks">
                  <label className="aa-check-label">
                    <input type="checkbox" checked={form.debitado} onChange={e=>set('debitado',e.target.checked)}/>
                    <span>Debitado</span>
                  </label>
                  <label className="aa-check-label">
                    <input type="checkbox" checked={form.liquidado} onChange={e=>set('liquidado',e.target.checked)}/>
                    <span>Liquidado</span>
                  </label>
                </div>
                {form.liquidado && (
                  <div className="aa-field">
                    <label className="aa-label">Fecha de liquidación</label>
                    <input lang="es" className="aa-input" type="date" value={form.fecha_liquidacion} onChange={e=>set('fecha_liquidacion',e.target.value)}/>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ── Botones ── */}
          <div className="aa-form-actions">
            <button type="button" className="aa-btn-cancel" onClick={cancelEdit}>
              <FiX size={14}/> Cancelar
            </button>
            <button type="submit" className="aa-btn-save" disabled={saving}>
              {saving ? <><span className="aa-spinner"/> Guardando…</> : <><FiCheckCircle size={15}/> {editingId?'Actualizar':'Guardar registro'}</>}
            </button>
          </div>

        </form>
        )}

      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`aa-toast aa-toast--${toast.type}`} role="alert">
          <span>{toast.msg}</span>
          <button onClick={()=>setToast(null)}>✕</button>
        </div>
      )}

      {/* ── Confirm modal ── */}
      {confirmCfg && (
        <div className="aa-confirm-overlay" onClick={()=>setConfirmCfg(null)}>
          <div className="aa-confirm-box" onClick={e=>e.stopPropagation()}>
            <p>{confirmCfg.msg}</p>
            <div className="aa-confirm-btns">
              <button className="aa-cfm-cancel" onClick={()=>setConfirmCfg(null)}>Cancelar</button>
              <button className="aa-cfm-ok" onClick={()=>{confirmCfg.onOk();setConfirmCfg(null);}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
