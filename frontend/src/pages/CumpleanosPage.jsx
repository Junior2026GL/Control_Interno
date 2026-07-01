import { useEffect, useState, useCallback } from 'react';
import { FiChevronLeft, FiChevronRight, FiDownload, FiX, FiCalendar, FiRefreshCw, FiPhone } from 'react-icons/fi';
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

export default function CumpleanosPage() {
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1); // 1-12
  const [birthdays, setBirthdays] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [modal,     setModal]     = useState(null); // { day, list }
  const [toast,     setToast]     = useState(null);
  const [telStats,  setTelStats]  = useState({ con_telefono: null, sin_telefono: null });

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

  useEffect(() => { fetchData(); }, [fetchData]);

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
          <button className="cb-btn-refresh" onClick={fetchData} title="Recargar datos">
            <FiRefreshCw size={15} />
            Actualizar
          </button>
        </div>

        {/* Stats bar */}
        {!loading && !error && (
          <div className="cb-stats">
            <div className="cb-stat-item">
              <span className="cb-stat-num">{birthdays.length}</span>
              <span className="cb-stat-lbl">Diputados con fecha de nacimiento</span>
            </div>
            <div className="cb-stat-sep" />
            <div className="cb-stat-item">
              <span className="cb-stat-num">{totalMes}</span>
              <span className="cb-stat-lbl">Cumpleaños en {MESES[viewMonth - 1]}</span>
            </div>
            <div className="cb-stat-sep" />
            <div className="cb-stat-item">
              <span className="cb-stat-num cb-stat-num--green">{telStats.con_telefono ?? '—'}</span>
              <span className="cb-stat-lbl">Diputados con número de teléfono</span>
            </div>
            <div className="cb-stat-sep" />
            <div className="cb-stat-item">
              <span className="cb-stat-num cb-stat-num--red">{telStats.sin_telefono ?? '—'}</span>
              <span className="cb-stat-lbl">Sin teléfono</span>
            </div>
          </div>
        )}

        {/* Calendar card */}
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
    </div>
  );
}
