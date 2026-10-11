import { useEffect, useState, useMemo, useCallback } from 'react';
import { FiUsers, FiSearch, FiRefreshCw, FiDownload, FiGift } from 'react-icons/fi';
import * as XLSX from 'xlsx';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import './BeneficiariosAyuda.css';

const fmtMonto = (n) =>
  `L ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtFecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');

export default function BeneficiariosAyuda() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage]       = useState(1);
  const PAGE_SIZE = 20;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/beneficiarios-ayuda');
      setRows(res.data);
    } catch {
      setError('No se pudo cargar el listado de beneficiarios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.nombre.toLowerCase().includes(q) ||
      r.dni.includes(q) ||
      (r.departamento || '').toLowerCase().includes(q) ||
      (r.telefono || '').includes(q)
    );
  }, [rows, busqueda]);

  useEffect(() => { setPage(1); }, [busqueda]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const visibles   = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const proximos   = rows.filter(r => r.dias_para_cumple !== null && r.dias_para_cumple <= 30).length;

  const exportar = () => {
    const data = filtrados.map(r => ({
      'DNI':                r.dni,
      'Nombre':             r.nombre,
      'Teléfono':           r.telefono || '',
      'Departamento':       r.departamento || '',
      'Fecha de nacimiento': fmtFecha(r.fecha_nacimiento),
      'Edad':               r.edad ?? '',
      'Cumpleaños':         r.cumple || '',
      'Ayudas recibidas':   r.total_ayudas,
      'Monto total (L)':    r.monto_total,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 8 }, { wch: 18 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Beneficiarios');
    XLSX.writeFile(wb, 'Beneficiarios_Ayuda_Social.xlsx');
  };

  return (
    <div className="bn-page">
      <Navbar />
      <div className="bn-container">
        <div className="bn-header">
          <div className="bn-header-left">
            <FiUsers className="bn-header-icon" />
            <div>
              <h1>Campaña Ayudas Whatsapp</h1>
              <p>Personas registradas al entregar una ayuda social, con datos del censo nacional</p>
            </div>
          </div>
          <div className="bn-header-actions">
            <button className="bn-btn" onClick={fetchData}><FiRefreshCw size={15} /> Actualizar</button>
            <button className="bn-btn bn-btn--primary" onClick={exportar} disabled={!filtrados.length}>
              <FiDownload size={15} /> Exportar Excel
            </button>
          </div>
        </div>

        <div className="bn-stats">
          <div className="bn-stat"><span className="bn-stat-num">{rows.length}</span><span className="bn-stat-lbl">Beneficiarios</span></div>
          <div className="bn-stat"><span className="bn-stat-num">{rows.filter(r => r.fecha_nacimiento).length}</span><span className="bn-stat-lbl">Con fecha de nacimiento</span></div>
          <div className="bn-stat"><span className="bn-stat-num bn-stat-num--pink">{proximos}</span><span className="bn-stat-lbl">Cumplen años en 30 días</span></div>
        </div>

        <div className="bn-card">
          <div className="bn-toolbar">
            <div className="bn-search">
              <FiSearch size={15} />
              <input
                type="text"
                placeholder="Buscar por nombre, DNI, teléfono o departamento…"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
              />
            </div>
            <span className="bn-count">{filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}</span>
          </div>

          {loading ? (
            <div className="bn-empty">Cargando…</div>
          ) : error ? (
            <div className="bn-empty bn-empty--error">{error}</div>
          ) : visibles.length === 0 ? (
            <div className="bn-empty">No hay beneficiarios registrados.</div>
          ) : (
            <div className="bn-table-wrap">
              <table className="bn-table">
                <thead>
                  <tr>
                    <th>DNI</th>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Departamento</th>
                    <th>Fecha nac.</th>
                    <th>Edad</th>
                    <th>Cumpleaños</th>
                    <th className="bn-num">Ayudas</th>
                    <th className="bn-num">Monto total</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(r => (
                    <tr key={r.id}>
                      <td className="bn-mono">{r.dni}</td>
                      <td className="bn-name">{r.nombre}</td>
                      <td>{r.telefono || '—'}</td>
                      <td>{r.departamento || '—'}</td>
                      <td>{fmtFecha(r.fecha_nacimiento)}</td>
                      <td>{r.edad !== null ? `${r.edad} años` : '—'}</td>
                      <td>
                        {r.cumple ? (
                          <span className={`bn-cumple${r.dias_para_cumple <= 30 ? ' bn-cumple--soon' : ''}`}>
                            {r.dias_para_cumple === 0 && <FiGift size={12} />}
                            {r.dias_para_cumple === 0 ? 'Hoy' : r.cumple}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="bn-num">{r.total_ayudas}</td>
                      <td className="bn-num">{fmtMonto(r.monto_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && filtrados.length > 0 && (
            <div className="std-pg">
              <span className="std-pg-info">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtrados.length)} de <strong>{filtrados.length}</strong>
              </span>
              <div className="std-pg-controls">
                <button className="std-pg-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
                <button className="std-pg-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                {(() => {
                  const maxBtns = 7;
                  let start = Math.max(1, page - Math.floor(maxBtns / 2));
                  let end   = Math.min(totalPages, start + maxBtns - 1);
                  if (end - start < maxBtns - 1) start = Math.max(1, end - maxBtns + 1);
                  const nums = [];
                  if (start > 1) {
                    nums.push(<button key={1} className="std-pg-btn std-pg-num" onClick={() => setPage(1)}>1</button>);
                    if (start > 2) nums.push(<span key="el" className="std-pg-ellipsis">…</span>);
                  }
                  for (let p = start; p <= end; p++) {
                    nums.push(<button key={p} className={`std-pg-btn std-pg-num${page === p ? ' std-pg-num--active' : ''}`} onClick={() => setPage(p)}>{p}</button>);
                  }
                  if (end < totalPages) {
                    if (end < totalPages - 1) nums.push(<span key="er" className="std-pg-ellipsis">…</span>);
                    nums.push(<button key={totalPages} className="std-pg-btn std-pg-num" onClick={() => setPage(totalPages)}>{totalPages}</button>);
                  }
                  return nums;
                })()}
                <button className="std-pg-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                <button className="std-pg-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
              </div>
              <span className="std-pg-total">Pág. <strong>{page}</strong> / {totalPages}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
