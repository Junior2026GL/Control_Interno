import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { FiArrowLeft, FiRefreshCw, FiCalendar, FiUsers } from 'react-icons/fi';
import { LuChartColumn } from 'react-icons/lu';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import './Bodegas.css';
import './ViaticosSeguridad.css';

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
      .map(([lugar, total]) => ({ lugar: lugar.length > 22 ? lugar.slice(0, 21) + '…' : lugar, total: Math.round(total * 100) / 100 }))
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
      <div className="bod-page">
        <div className="bod-page-header">
          <div className="bod-page-header__left">
            <div className="bod-page-icon vs-page-icon"><LuChartColumn size={28} strokeWidth={1.8} /></div>
            <div>
              <h1 className="bod-page-title">Reportes de Viáticos</h1>
              <p className="bod-page-sub">Viáticos Nacionales Individual — monto pagado por mes</p>
            </div>
          </div>
          <div className="bod-page-header__right">
            <button className="bod-btn bod-btn--outline" onClick={() => navigate('/viaticos')}><FiArrowLeft size={15} /> Volver</button>
            <button className="bod-btn bod-btn--outline" onClick={cargar} title="Actualizar"><FiRefreshCw size={15} /></button>
          </div>
        </div>

        <div className="bod-filter-card">
          <div className="bod-filter-row">
            <div className="bod-filter-dates">
              <div className="bod-filter-date-group">
                <FiCalendar size={13} className="bod-filter-date-icon" />
                <span className="bod-filter-date-label">Año</span>
                <select className="bod-filter-date-input" value={anio} onChange={e => setAnio(e.target.value)} style={{ width: 80 }}>
                  <option value="">Todos</option>
                  {anios.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

        <div className="bod-stats">
          <div className="bod-stat">
            <div className="bod-stat__icon bod-stat__icon--green"><span className="vs-lps">Lps.</span></div>
            <div className="bod-stat__body"><span className="bod-stat__label">Total pagado {anio || 'todos los años'}</span><span className="bod-stat__value bod-stat__value--green">{fmt(totalAnio)}</span></div>
          </div>
          <div className="bod-stat">
            <div className="bod-stat__icon bod-stat__icon--blue"><FiUsers size={20} /></div>
            <div className="bod-stat__body"><span className="bod-stat__label">Recibos</span><span className="bod-stat__value">{delAnio.length}</span></div>
          </div>
          <div className="bod-stat">
            <div className="bod-stat__icon bod-stat__icon--amber"><FiCalendar size={20} /></div>
            <div className="bod-stat__body">
              <span className="bod-stat__label">Promedio mensual</span>
              <span className="bod-stat__value">{fmt(mesesConDatos ? totalAnio / mesesConDatos : 0)}</span>
            </div>
          </div>
        </div>

        <div className="bod-card" style={{ padding: '1.2rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 .2rem', color: '#0f2044' }}>Monto pagado por mes</h3>
          <p className="bod-page-sub" style={{ marginBottom: '1rem' }}>
            {loading ? 'Cargando…' : totalAnio > 0 ? `Mes con mayor gasto: ${mejorMes.nombre} (${fmt(mejorMes.total)})` : 'Sin registros para este período.'}
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={porMes} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={fmtCorto} tickLine={false} axisLine={false} width={55} />
              <Tooltip content={tip} cursor={{ fill: 'rgba(39,76,141,.06)' }} />
              <Bar dataKey="total" fill="#274C8D" radius={[6, 6, 0, 0]} maxBarSize={48}>
                <LabelList dataKey="total" position="top" formatter={v => (v > 0 ? fmtCorto(v) : '')} style={{ fontSize: 11, fill: '#475569' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bod-card" style={{ padding: '1.2rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem', color: '#0f2044' }}>Lugares con mayor monto pagado</h3>
          {porLugar.length === 0 ? <p className="bod-page-sub">Sin datos.</p> : (
            <ResponsiveContainer width="100%" height={Math.max(180, porLugar.length * 38)}>
              <BarChart data={porLugar} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                <XAxis type="number" tickFormatter={fmtCorto} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="lugar" width={150} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <Tooltip content={tip} cursor={{ fill: 'rgba(39,76,141,.06)' }} />
                <Bar dataKey="total" fill="#0d9488" radius={[0, 6, 6, 0]} maxBarSize={22}>
                  <LabelList dataKey="total" position="right" formatter={fmtCorto} style={{ fontSize: 11, fill: '#475569' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bod-card" style={{ overflowX: 'auto' }}>
          <table className="bod-table">
            <thead><tr><th>Mes</th><th style={{ textAlign: 'right' }}>Recibos</th><th style={{ textAlign: 'right' }}>Total pagado</th></tr></thead>
            <tbody>
              {porMes.map(m => (
                <tr key={m.mes}>
                  <td>{m.nombre}</td>
                  <td style={{ textAlign: 'right' }}>{m.cantidad}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(m.total)}</td>
                </tr>
              ))}
              <tr style={{ background: '#f4f6fb', fontWeight: 700 }}>
                <td>Total</td><td style={{ textAlign: 'right' }}>{delAnio.length}</td><td style={{ textAlign: 'right' }}>{fmt(totalAnio)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
