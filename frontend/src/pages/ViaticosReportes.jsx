import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import { FiArrowLeft, FiRefreshCw, FiCalendar, FiUsers, FiTrendingUp } from 'react-icons/fi';
import { LuChartColumn } from 'react-icons/lu';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import './Bodegas.css';
import './ViaticosSeguridad.css';
import './ViaticosReportes.css';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const num = v => parseFloat(v) || 0;
const fmt = v => 'L ' + num(v).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCorto = v => (v >= 1000 ? `${(v / 1000).toLocaleString('es-HN', { maximumFractionDigits: 1 })}k` : String(v));
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
// Año y mes del viaje según la fecha "desde" (sin convertir zona horaria)
const partes = s => { const [y, m] = String(s || '').split('T')[0].split('-'); return { y: +y, m: +m }; };

export default function ViaticosReportes() {
  const navigate = useNavigate();
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [anio, setAnio] = useState(String(new Date().getFullYear()));

  const cargar = async () => {
    setLoading(true); setError('');
    try { const res = await api.get('/viaticos-seguridad', { headers: authHeaders() }); setRegistros(res.data); }
    catch { setError('Error al cargar los registros.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, []);

  const anios = useMemo(() => {
    const set = new Set(registros.map(r => partes(r.periodo_desde).y).filter(Boolean));
    set.add(new Date().getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [registros]);

  const delAnio = useMemo(
    () => registros.filter(r => !anio || partes(r.periodo_desde).y === +anio),
    [registros, anio]
  );

  const porMes = useMemo(() => {
    const base = MESES.map((mes, i) => ({ mes, nombre: MESES_LARGO[i], total: 0, cantidad: 0 }));
    delAnio.forEach(r => {
      const { m } = partes(r.periodo_desde);
      if (m >= 1 && m <= 12) { base[m - 1].total += num(r.gran_total); base[m - 1].cantidad += 1; }
    });
    return base.map(b => ({ ...b, total: Math.round(b.total * 100) / 100 }));
  }, [delAnio]);

  const porLugar = useMemo(() => {
    const mapa = {};
    delAnio.forEach(r => {
      const k = (r.lugar || 'SIN LUGAR').trim().toUpperCase();
      mapa[k] = (mapa[k] || 0) + num(r.gran_total);
    });
    return Object.entries(mapa)
      .map(([lugar, total]) => ({ lugar: lugar.length > 30 ? lugar.slice(0, 29) + '…' : lugar, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total).slice(0, 8);
  }, [delAnio]);

  const totalAnio = delAnio.reduce((s, r) => s + num(r.gran_total), 0);
  const mesesConDatos = porMes.filter(m => m.cantidad > 0).length;
  const mejorMes = porMes.reduce((a, b) => (b.total > a.total ? b : a), porMes[0]);

  const tip = ({ active, payload }) => active && payload?.length ? (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
      <strong>{payload[0].payload.nombre || payload[0].payload.lugar}</strong><br />
      {fmt(payload[0].value)}
      {payload[0].payload.cantidad != null && <><br /><span style={{ color: '#6b7280' }}>{payload[0].payload.cantidad} recibo(s)</span></>}
    </div>
  ) : null;

  return (
    <div className="page-shell">
      <Navbar />
      <div className="bod-container vr-wrap">
        <div className="vr-hero">
          <div className="vr-hero__left">
            <div className="vr-hero__icon"><LuChartColumn size={28} strokeWidth={1.8} /></div>
            <div>
              <h1 className="vr-hero__title">Estadísticas de Viáticos</h1>
              <p className="vr-hero__sub">Viáticos Nacionales Individual — monto pagado por mes</p>
            </div>
          </div>
          <div className="vr-hero__right">
            <label className="vr-year">
              <FiCalendar size={14} />
              <span>Año</span>
              <select value={anio} onChange={e => setAnio(e.target.value)}>
                <option value="">Todos</option>
                {anios.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <button className="vr-btn" onClick={() => navigate('/viaticos')}><FiArrowLeft size={15} /> Volver</button>
            <button className="vr-btn vr-btn--icon" onClick={cargar} title="Actualizar"><FiRefreshCw size={15} /></button>
          </div>
        </div>

        {error && <p className="vr-error">{error}</p>}

        <div className="vr-kpis">
          <div className="vr-kpi vr-kpi--green">
            <div className="vr-kpi__icon"><span className="vs-lps">Lps.</span></div>
            <div><span className="vr-kpi__label">Total pagado {anio || '(todos)'}</span><strong className="vr-kpi__value">{fmt(totalAnio)}</strong></div>
          </div>
          <div className="vr-kpi vr-kpi--blue">
            <div className="vr-kpi__icon"><FiUsers size={20} /></div>
            <div><span className="vr-kpi__label">Recibos</span><strong className="vr-kpi__value">{delAnio.length}</strong></div>
          </div>
          <div className="vr-kpi vr-kpi--amber">
            <div className="vr-kpi__icon"><FiCalendar size={20} /></div>
            <div><span className="vr-kpi__label">Promedio mensual</span><strong className="vr-kpi__value">{fmt(mesesConDatos ? totalAnio / mesesConDatos : 0)}</strong></div>
          </div>
          <div className="vr-kpi vr-kpi--violet">
            <div className="vr-kpi__icon"><FiTrendingUp size={20} /></div>
            <div><span className="vr-kpi__label">Mes de mayor gasto</span><strong className="vr-kpi__value">{totalAnio > 0 ? mejorMes.nombre : '—'}</strong>{totalAnio > 0 && <small className="vr-kpi__hint">{fmt(mejorMes.total)}</small>}</div>
          </div>
        </div>

        <div className="vr-card">
          <div className="vr-card__head">
            <h3>Monto pagado por mes</h3>
            <span>{loading ? 'Cargando…' : totalAnio > 0 ? `${delAnio.length} recibos en ${mesesConDatos} mes(es)` : 'Sin registros para este período'}</span>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={porMes} margin={{ top: 24, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="vrBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4a7fd4" /><stop offset="100%" stopColor="#1b3a73" />
                </linearGradient>
                <linearGradient id="vrBest" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor="#0d9488" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e9f2" />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis tickFormatter={fmtCorto} tickLine={false} axisLine={false} width={50} tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip content={tip} cursor={{ fill: 'rgba(39,76,141,.07)' }} />
              <Bar dataKey="total" radius={[8, 8, 0, 0]} maxBarSize={56}>
                {porMes.map(m => <Cell key={m.mes} fill={totalAnio > 0 && m.mes === mejorMes.mes ? 'url(#vrBest)' : 'url(#vrBar)'} />)}
                <LabelList dataKey="total" position="top" formatter={v => (v > 0 ? fmtCorto(v) : '')} style={{ fontSize: 12, fontWeight: 600, fill: '#334155' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="vr-grid2">
          <div className="vr-card">
            <div className="vr-card__head"><h3>Giras por lugar</h3><span>Top 8</span></div>
            {porLugar.length === 0 ? <p className="vr-empty">Sin datos.</p> : (
              <ResponsiveContainer width="100%" height={Math.max(220, porLugar.length * 40)}>
                <BarChart data={porLugar} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e9f2" />
                  <XAxis type="number" tickFormatter={fmtCorto} tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis type="category" dataKey="lugar" width={200} tickLine={false} axisLine={false} tick={{ fill: '#334155', fontSize: 12 }} />
                  <Tooltip content={tip} cursor={{ fill: 'rgba(13,148,136,.07)' }} />
                  <Bar dataKey="total" fill="#0d9488" radius={[0, 8, 8, 0]} maxBarSize={24}>
                    <LabelList dataKey="total" position="right" formatter={fmtCorto} style={{ fontSize: 12, fontWeight: 600, fill: '#334155' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="vr-card">
            <div className="vr-card__head"><h3>Detalle por mes</h3><span>{anio || 'Todos los años'}</span></div>
            <table className="vr-table">
              <thead><tr><th>Mes</th><th>Recibos</th><th>Total pagado</th></tr></thead>
              <tbody>
                {porMes.map(m => (
                  <tr key={m.mes} className={m.cantidad === 0 ? 'is-empty' : ''}>
                    <td>{m.nombre}</td><td>{m.cantidad}</td><td>{fmt(m.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td>{delAnio.length}</td><td>{fmt(totalAnio)}</td></tr></tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
