import { useEffect, useState, useCallback } from 'react';
import { FiChevronLeft, FiChevronRight, FiDownload, FiX, FiCalendar, FiRefreshCw, FiPhone, FiGift, FiList, FiEdit2, FiTrash2, FiPlus, FiSearch } from 'react-icons/fi';
import * as XLSX from 'xlsx';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import './CumpleanosPage.css';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const TIPO_META = {
  PROPIETARIO: { label: 'Propietario', color: '#2563eb', bg: '#eff6ff' },
  SUPLENTE:    { label: 'Suplente',    color: '#059669', bg: '#ecfdf5' },
};

function buildCalendar(year, month) {
  // month: 1-12
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Dom
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function groupByDay(birthdays, month) {
  const map = {};
  birthdays
    .filter(b => b.mes === month)
    .forEach(b => {
      if (!map[b.dia]) map[b.dia] = [];
      map[b.dia].push(b);
    });
  return map;
}

function exportToExcel(list, day, month, year) {
  const rows = list.map(b => ({
    'Nombre':           b.nombre,
    'Partido':          b.partido,
    'Tipo':             b.tipo === 'PROPIETARIO' ? 'Propietario' : 'Suplente',
    'Departamento':     b.departamento,
    'Teléfono':         b.telefono || '',
    'Fecha Nacimiento': b.fecha_nacimiento,
    'Estado':           b.activo ? 'Activo' : 'Inactivo',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  // Column widths
  ws['!cols'] = [{ wch: 40 }, { wch: 25 }, { wch: 15 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Cumpleaños');
  XLSX.writeFile(wb, `Cumpleanos_${String(day).padStart(2,'0')}_${MESES[month-1]}_${year}.xlsx`);
}

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export default function CumpleanosPage() {
  const today = new Date();
  const [tab,       setTab]       = useState('calendario'); // 'calendario' | 'gestion'
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1); // 1-12
  const [birthdays, setBirthdays] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [modal,     setModal]     = useState(null); // { day, list }
  const [toast,     setToast]     = useState(null);
  const [telStats,  setTelStats]  = useState({ con_telefono: null, sin_telefono: null });

  // Gestión (tab listado)
  const [listado,      setListado]      = useState([]);
  const [loadingList,  setLoadingList]  = useState(false);
  const [filtroList,   setFiltroList]   = useState('todos'); // 'todos' | 'con' | 'sin'
  const [busqueda,     setBusqueda]     = useState('');
  const [editModal,    setEditModal]    = useState(null); // { diputado } null=cerrado
  const [editFecha,    setEditFecha]    = useState('');
  const [savingEdit,   setSavingEdit]   = useState(false);
  const [confirmDel,   setConfirmDel]   = useState(null); // diputado a eliminar

  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [resBday, resStats] = await Promise.all([
        api.get('/cumpleanos-diputados'),
        api.get('/cumpleanos-diputados/stats'),
      ]);
      setBirthdays(resBday.data);
      setTelStats(resStats.data);
    } catch {
      setError('No se pudo cargar la información. Verifique que los diputados tienen número de identidad registrado.');
      showToast('Error al cargar los cumpleaños.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchListado = useCallback(async () => {
    try {
      setLoadingList(true);
      const res = await api.get('/cumpleanos-diputados/listado');
      setListado(res.data);
    } catch {
      showToast('Error al cargar el listado.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (tab === 'gestion') fetchListado(); }, [tab, fetchListado]);

  const openEdit = (diputado) => {
    setEditFecha(diputado.fecha_nacimiento || '');
    setEditModal(diputado);
  };

  const handleSaveEdit = async () => {
    if (!editFecha) return showToast('Seleccione una fecha.');
    try {
      setSavingEdit(true);
      await api.post('/cumpleanos-diputados', {
        diputado_id:      editModal.id,
        fecha_nacimiento: editFecha,
      });
      showToast('Fecha guardada correctamente.', 'ok');
      setEditModal(null);
      fetchListado();
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.message || 'Error al guardar.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (diputado) => {
    try {
      await api.delete(`/cumpleanos-diputados/${diputado.id}`);
      showToast('Fecha eliminada.', 'ok');
      setConfirmDel(null);
      fetchListado();
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.message || 'Error al eliminar.');
    }
  };

  const prevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth() + 1);
  };

  const cells      = buildCalendar(viewYear, viewMonth);
  const byDay      = groupByDay(birthdays, viewMonth);
  const todayDay   = today.getDate();
  const isThisMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1;

  // Count for current month
  const totalMes = Object.values(byDay).flat().length;

  const openModal = (day) => {
    const list = byDay[day] || [];
    if (list.length === 0) return;
    setModal({ day, list });
  };

  return (
    <div className="cb-page">
      <Navbar />

      {/* Toast */}
      {toast && (
        <div className={`cb-toast cb-toast--${toast.type === 'error' ? 'error' : 'ok'}`}>
          <span className="cb-toast-msg">{toast.msg}</span>
          <button className="cb-toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      <div className="cb-container">
        {/* Header */}
        <div className="cb-header">
          <div className="cb-header-left">
            <FiCalendar className="cb-header-icon" />
            <div>
              <h1>Cumpleaños de Diputados</h1>
              <p>Fechas de nacimiento registradas en el censo nacional</p>
            </div>
          </div>
          <button
            className="cb-btn-refresh"
            onClick={() => { fetchData(); if (tab === 'gestion') fetchListado(); }}
            title="Recargar datos"
          >
            <FiRefreshCw size={15} />
            Actualizar
          </button>
        </div>

        {/* Tabs */}
        <div className="cb-tabs">
          <button
            className={`cb-tab${tab === 'calendario' ? ' cb-tab--active' : ''}`}
            onClick={() => setTab('calendario')}
          >
            <FiCalendar size={15} /> Calendario
          </button>
          <button
            className={`cb-tab${tab === 'gestion' ? ' cb-tab--active' : ''}`}
            onClick={() => setTab('gestion')}
          >
            <FiList size={15} /> Gestión
          </button>
        </div>

        {/* Stats bar — solo en calendario */}
        {tab === 'calendario' && !loading && !error && (
          <div className="cb-stats">
            {/* Destacado: cumpleaños del mes */}
            <div className="cb-stat-featured">
              <FiGift className="cb-stat-featured-icon" size={28} />
              <div>
                <span className="cb-stat-featured-num">{totalMes}</span>
                <span className="cb-stat-featured-lbl">Cumpleaños en {MESES[viewMonth - 1]}</span>
              </div>
            </div>

            <div className="cb-stat-sep" />

            <div className="cb-stat-item">
              <span className="cb-stat-num">{birthdays.length}</span>
              <span className="cb-stat-lbl">Con fecha de nacimiento</span>
            </div>
            <div className="cb-stat-sep" />
            <div className="cb-stat-item">
              <span className="cb-stat-num cb-stat-num--green">{telStats.con_telefono ?? '—'}</span>
              <span className="cb-stat-lbl">Con teléfono</span>
            </div>
            <div className="cb-stat-sep" />
            <div className="cb-stat-item">
              <span className="cb-stat-num cb-stat-num--red">{telStats.sin_telefono ?? '—'}</span>
              <span className="cb-stat-lbl">Sin teléfono</span>
            </div>
          </div>
        )}

        {/* ── TAB: CALENDARIO ───────────────────────────────── */}
        {tab === 'calendario' && (
        <div className="cb-card">
          {/* Month navigation */}
          <div className="cb-nav">
            <button className="cb-nav-btn" onClick={prevMonth} title="Mes anterior">
              <FiChevronLeft size={20} />
            </button>
            <div className="cb-nav-center">
              <span className="cb-nav-month">{MESES[viewMonth - 1]}</span>
              <span className="cb-nav-year">{viewYear}</span>
              {!isThisMonth && (
                <button className="cb-today-btn" onClick={goToday}>Hoy</button>
              )}
            </div>
            <button className="cb-nav-btn" onClick={nextMonth} title="Mes siguiente">
              <FiChevronRight size={20} />
            </button>
          </div>

          {loading ? (
            <div className="cb-loading">
              <div className="cb-spinner" />
              <p>Consultando censo nacional…</p>
            </div>
          ) : error ? (
            <div className="cb-error">
              <p>{error}</p>
              <button className="cb-btn-refresh" onClick={fetchData}>Reintentar</button>
            </div>
          ) : (
            <>
              {/* Day headers */}
              <div className="cb-grid">
                {DIAS_SEMANA.map(d => (
                  <div key={d} className="cb-day-header">{d}</div>
                ))}

                {/* Day cells */}
                {cells.map((day, i) => {
                  if (!day) return <div key={`e-${i}`} className="cb-cell cb-cell--empty" />;
                  const list    = byDay[day] || [];
                  const hasBday = list.length > 0;
                  const isToday = isThisMonth && day === todayDay;

                  return (
                    <div
                      key={day}
                      className={[
                        'cb-cell',
                        hasBday   ? 'cb-cell--bday'  : '',
                        isToday   ? 'cb-cell--today' : '',
                        hasBday   ? 'cb-cell--clickable' : '',
                      ].join(' ')}
                      onClick={() => openModal(day)}
                      title={hasBday ? `${list.length} cumpleaño${list.length > 1 ? 's' : ''}` : ''}
                    >
                      <span className="cb-day-num">{day}</span>
                      {hasBday && (
                        <div className="cb-bday-indicators">
                          {list.slice(0, 3).map((b, idx) => (
                            <span
                              key={idx}
                              className="cb-dot"
                              style={{ background: b.tipo === 'PROPIETARIO' ? '#2563eb' : '#059669' }}
                            />
                          ))}
                          {list.length > 3 && (
                            <span className="cb-dot-more">+{list.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="cb-legend">
                <span className="cb-legend-item">
                  <span className="cb-dot" style={{ background: '#2563eb' }} />
                  Propietario
                </span>
                <span className="cb-legend-item">
                  <span className="cb-dot" style={{ background: '#059669' }} />
                  Suplente
                </span>
                <span className="cb-legend-item">
                  <span className="cb-today-sample" />
                  Hoy
                </span>
              </div>
            </>
          )}
        </div>
        )} {/* fin tab calendario */}

        {/* ── TAB: GESTIÓN ───────────────────────────────── */}
        {tab === 'gestion' && (() => {
          const sinFecha   = listado.filter(d => !d.fecha_nacimiento).length;
          const filtrados  = listado
            .filter(d => {
              if (filtroList === 'con')  return !!d.fecha_nacimiento;
              if (filtroList === 'sin')  return !d.fecha_nacimiento;
              return true;
            })
            .filter(d => !busqueda || d.nombre.toLowerCase().includes(busqueda.toLowerCase()));

          return (
            <div className="cb-gestion-card">
              {/* Barra de herramientas */}
              <div className="cb-gestion-toolbar">
                <div className="cb-gestion-filters">
                  {[['todos','Todos'],['con','Con fecha'],['sin','Sin fecha']].map(([v, lbl]) => (
                    <button
                      key={v}
                      className={`cb-filter-btn${filtroList === v ? ' cb-filter-btn--active' : ''}`}
                      onClick={() => setFiltroList(v)}
                    >
                      {lbl}
                      {v === 'sin' && sinFecha > 0 && (
                        <span className="cb-filter-badge">{sinFecha}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="cb-gestion-search">
                  <FiSearch size={14} className="cb-search-icon" />
                  <input
                    type="text"
                    placeholder="Buscar diputado..."
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    className="cb-search-input"
                  />
                </div>
              </div>

              {/* Tabla */}
              {loadingList ? (
                <div className="cb-loading"><div className="cb-spinner" /><p>Cargando listado…</p></div>
              ) : (
                <div className="cb-table-wrap">
                  <table className="cb-table">
                    <thead>
                      <tr>
                        <th>Diputado</th>
                        <th>Tipo</th>
                        <th>Departamento</th>
                        <th>Fecha Nacimiento</th>
                        <th>Fuente</th>
                        <th style={{textAlign:'center'}}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.length === 0 && (
                        <tr><td colSpan={6} className="cb-table-empty">Sin resultados.</td></tr>
                      )}
                      {filtrados.map(d => {
                        const meta = TIPO_META[d.tipo] || TIPO_META.PROPIETARIO;
                        const [yr, mo, dy] = d.fecha_nacimiento ? d.fecha_nacimiento.split('-') : [];
                        const fechaDisplay = d.fecha_nacimiento
                          ? `${dy}/${mo}/${yr} — ${MESES_CORTOS[parseInt(mo,10)-1]}`
                          : null;
                        return (
                          <tr key={d.id} className={!d.activo ? 'cb-row--inactivo' : ''}>
                            <td>
                              <div className="cb-table-nombre">{d.nombre}</div>
                              {!d.activo && <span className="cb-inactivo-badge">Inactivo</span>}
                            </td>
                            <td>
                              <span className="cb-badge" style={{ color: meta.color, background: meta.bg, borderColor: meta.color + '33' }}>
                                {meta.label}
                              </span>
                            </td>
                            <td className="cb-table-dept">{d.departamento}</td>
                            <td>
                              {fechaDisplay
                                ? <span className="cb-fecha-ok">{fechaDisplay}</span>
                                : <span className="cb-fecha-missing">Sin fecha</span>
                              }
                            </td>
                            <td>
                              {d.fuente && (
                                <span className={`cb-fuente-badge cb-fuente-badge--${d.fuente}`}>
                                  {d.fuente === 'censo' ? 'Censo' : 'Manual'}
                                </span>
                              )}
                            </td>
                            <td className="cb-table-actions">
                              <button
                                className="cb-action-btn cb-action-btn--edit"
                                title={d.fecha_nacimiento ? 'Editar fecha' : 'Agregar fecha'}
                                onClick={() => openEdit(d)}
                              >
                                {d.fecha_nacimiento ? <FiEdit2 size={14} /> : <FiPlus size={14} />}
                              </button>
                              {d.fecha_nacimiento && (
                                <button
                                  className="cb-action-btn cb-action-btn--del"
                                  title="Eliminar fecha"
                                  onClick={() => setConfirmDel(d)}
                                >
                                  <FiTrash2 size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Modal */}
      {modal && (
        <div className="cb-modal-backdrop" onClick={() => setModal(null)}>
          <div className="cb-modal" onClick={e => e.stopPropagation()}>
            <div className="cb-modal-header">
              <div className="cb-modal-title">
                <FiCalendar size={18} />
                <span>
                  Cumpleaños — {String(modal.day).padStart(2, '0')} de {MESES[viewMonth - 1]}
                </span>
              </div>
              <div className="cb-modal-actions">
                <button
                  className="cb-btn-excel"
                  onClick={() => exportToExcel(modal.list, modal.day, viewMonth, viewYear)}
                  title="Descargar en Excel"
                >
                  <FiDownload size={15} />
                  Excel
                </button>
                <button className="cb-modal-close" onClick={() => setModal(null)}>
                  <FiX size={18} />
                </button>
              </div>
            </div>

            <div className="cb-modal-body">
              {modal.list.map((b, idx) => {
                const meta = TIPO_META[b.tipo] || TIPO_META.PROPIETARIO;
                return (
                  <div key={idx} className={`cb-person-card${!b.activo ? ' cb-person-card--inactivo' : ''}`}>
                    <div className="cb-person-avatar" style={{ background: meta.bg, color: meta.color }}>
                      {b.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="cb-person-info">
                      <div className="cb-person-name">
                        {b.nombre}
                        {!b.activo && <span className="cb-inactivo-badge">Inactivo</span>}
                      </div>
                      <div className="cb-person-meta">
                        <span className="cb-person-dept">{b.departamento}</span>
                        {b.partido && b.partido !== '—' && (
                          <>
                            <span className="cb-meta-sep">·</span>
                            <span>{b.partido}</span>
                          </>
                        )}
                      </div>
                      {b.telefono && (
                        <div className="cb-person-tel">
                          <FiPhone size={11} />
                          <span>{b.telefono}</span>
                        </div>
                      )}
                    </div>
                    <div className="cb-person-right">
                      <span
                        className="cb-badge"
                        style={{ color: meta.color, background: meta.bg, borderColor: meta.color + '33' }}
                      >
                        {meta.label}
                      </span>
                      <span className="cb-person-fecha">
                        Nació: {b.fecha_nacimiento}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Editar / Agregar fecha ────────────────── */}
      {editModal && (
        <div className="cb-modal-backdrop" onClick={() => setEditModal(null)}>
          <div className="cb-modal cb-modal--sm" onClick={e => e.stopPropagation()}>
            <div className="cb-modal-header">
              <div className="cb-modal-title">
                <FiCalendar size={18} />
                <span>{editModal.fecha_nacimiento ? 'Editar' : 'Agregar'} fecha — {editModal.nombre}</span>
              </div>
              <button className="cb-modal-close" onClick={() => setEditModal(null)}>
                <FiX size={18} />
              </button>
            </div>
            <div className="cb-modal-body cb-modal-body--form">
              <label className="cb-form-label">Fecha de nacimiento</label>
              <input
                type="date"
                className="cb-form-input"
                value={editFecha}
                onChange={e => setEditFecha(e.target.value)}
                max={new Date().toISOString().slice(0,10)}
              />
              <div className="cb-form-hint">Formato: día/mes/año. Se guardará con fuente <strong>manual</strong>.</div>
              <div className="cb-form-actions">
                <button className="cb-btn-cancel" onClick={() => setEditModal(null)}>Cancelar</button>
                <button className="cb-btn-save" onClick={handleSaveEdit} disabled={savingEdit}>
                  {savingEdit ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Confirmar Eliminar ─────────────────────── */}
      {confirmDel && (
        <div className="cb-modal-backdrop" onClick={() => setConfirmDel(null)}>
          <div className="cb-modal cb-modal--sm" onClick={e => e.stopPropagation()}>
            <div className="cb-modal-header">
              <div className="cb-modal-title">
                <FiTrash2 size={18} style={{ color: '#dc2626' }} />
                <span>Eliminar fecha de nacimiento</span>
              </div>
              <button className="cb-modal-close" onClick={() => setConfirmDel(null)}>
                <FiX size={18} />
              </button>
            </div>
            <div className="cb-modal-body cb-modal-body--form">
              <p className="cb-confirm-text">
                ¿Eliminar la fecha de nacimiento de <strong>{confirmDel.nombre}</strong>?
                Esta acción no se puede deshacer.
              </p>
              <div className="cb-form-actions">
                <button className="cb-btn-cancel" onClick={() => setConfirmDel(null)}>Cancelar</button>
                <button className="cb-btn-del" onClick={() => handleDelete(confirmDel)}>Eliminar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
