import { useEffect, useState, useCallback } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts';
import Navbar from '../components/Navbar';
import api from '../api/axios';
import './MapaAlcaldias.css';

const MESES_ORDEN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const PARTIDO_COLORS = {
  PN: '#003f8a',
  PL: '#c8102e',
  LB: '#007932',
  DC: '#0077c8',
  PINU: '#f4a800',
  'SIN PARTIDO': '#9ca3af',
};

const ANIOS = [2022, 2023, 2024, 2025, 2026];

function fmt(n) {
  return Number(n || 0).toLocaleString('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 0 });
}

function getColor(monto, max) {
  if (!monto || !max) return '#e5e7eb';
  const ratio = monto / max;
  if (ratio > 0.8) return '#1e3a8a';
  if (ratio > 0.6) return '#1d4ed8';
  if (ratio > 0.4) return '#3b82f6';
  if (ratio > 0.2) return '#93c5fd';
  return '#dbeafe';
}

export default function MapaAlcaldias() {
  const [resumen, setResumen]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [filtroAnio, setFiltroAnio] = useState('');
  const [filtroMes,  setFiltroMes]  = useState('');
  const [selected, setSelected] = useState(null);

  const cargarResumen = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtroAnio) params.anio = filtroAnio;
      if (filtroMes)  params.mes  = filtroMes;
      const { data } = await api.get('/ayudas-alcaldias/resumen-mapa', { params });
      setResumen(data);
    } catch (e) {
      console.error('[mapa] cargar resumen:', e);
    } finally {
      setLoading(false);
    }
  }, [filtroAnio, filtroMes]);

  useEffect(() => { cargarResumen(); }, [cargarResumen]);

  const deptoMapLC = {};
  (resumen?.departamentos || []).forEach(d => { deptoMapLC[d.departamento.toLowerCase()] = d; });

  const maxMonto = Math.max(...(resumen?.departamentos || []).map(d => Number(d.total_monto)), 1);

  const kpis = resumen?.kpis || {};
  const pctLiquidado = kpis.total_monto > 0
    ? ((kpis.monto_liquidado_total / kpis.total_monto) * 100).toFixed(1)
    : 0;

  const tendenciaOrdenada = [...(resumen?.tendencia || [])]
    .sort((a, b) => MESES_ORDEN.indexOf(a.mes) - MESES_ORDEN.indexOf(b.mes));

  return (
    <div className="app-shell">
      <Navbar />
      <main className="mapa-main">
        <div className="mapa-header">
          <h1 className="mapa-title">Mapa de Ayudas a Alcaldías</h1>
          <div className="mapa-filters">
            <select value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)}>
              <option value="">Todos los años</option>
              {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
              <option value="">Todos los meses</option>
              {MESES_ORDEN.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* KPIs */}
        <div className="mapa-kpis">
          <div className="kpi-card kpi-blue">
            <span className="kpi-label">Total Distribuido</span>
            <span className="kpi-value">{fmt(kpis.total_monto)}</span>
            <span className="kpi-sub">{kpis.total_registros || 0} registros</span>
          </div>
          <div className="kpi-card kpi-yellow">
            <span className="kpi-label">Pendientes de Entrega</span>
            <span className="kpi-value">{kpis.total_pendientes || 0}</span>
            <span className="kpi-sub">cheques sin entregar</span>
          </div>
          <div className="kpi-card kpi-red">
            <span className="kpi-label">Atrasados +30 días</span>
            <span className="kpi-value">{kpis.atrasados_30 || 0}</span>
            <span className="kpi-sub">requieren atención</span>
          </div>
          <div className="kpi-card kpi-green">
            <span className="kpi-label">% Liquidado</span>
            <span className="kpi-value">{pctLiquidado}%</span>
            <span className="kpi-sub">{kpis.liquidados || 0} registros cerrados</span>
          </div>
        </div>

        {/* Cuerpo principal */}
        <div className="mapa-body">
          {/* Mapa */}
          <div className="mapa-map-wrap">
            {loading && <div className="mapa-loading">Cargando datos...</div>}

            <ComposableMap
              projection="geoMercator"
              projectionConfig={{ center: [-86.25, 14.55], scale: 6000 }}
              style={{ width: '100%', height: '100%', background: '#0f172a' }}
            >
              <ZoomableGroup center={[-86.25, 14.55]} zoom={1} minZoom={0.8} maxZoom={8}>
                <Geographies geography="/honduras-geo.json">
                  {({ geographies }) =>
                    geographies.map(geo => {
                      const nombre = geo.properties.name;
                      const d = deptoMapLC[nombre?.toLowerCase()];
                      const monto = d ? Number(d.total_monto) : 0;
                      const isSelected = selected?.nombre === nombre;
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={isSelected ? '#f59e0b' : getColor(monto, maxMonto)}
                          stroke="#0f172a"
                          strokeWidth={0.8}
                          onClick={() => setSelected(
                            d ? { nombre, ...d } : { nombre, total_monto: 0, cantidad: 0, monto_entregado: 0, monto_pendiente: 0, monto_liquidado: 0, atrasados: 0 }
                          )}
                          style={{
                            default:  { outline: 'none' },
                            hover:    { fill: '#f59e0b', outline: 'none', cursor: 'pointer', opacity: 0.9 },
                            pressed:  { outline: 'none' },
                          }}
                        />
                      );
                    })
                  }
                </Geographies>
              </ZoomableGroup>
            </ComposableMap>

            {/* Popup de departamento seleccionado */}
            {selected && (
              <div className="mapa-popup">
                <button className="popup-close" onClick={() => setSelected(null)}>✕</button>
                <h3>{selected.nombre}</h3>
                <div className="popup-row"><span>Total distribuido</span><strong>{fmt(selected.total_monto)}</strong></div>
                <div className="popup-row"><span>Cantidad registros</span><strong>{selected.cantidad || 0}</strong></div>
                <div className="popup-row"><span>Entregado</span><strong>{fmt(selected.monto_entregado)}</strong></div>
                <div className="popup-row"><span>Pendiente</span><strong style={{color:'#ef4444'}}>{fmt(selected.monto_pendiente)}</strong></div>
                <div className="popup-row"><span>Liquidado</span><strong style={{color:'#10b981'}}>{fmt(selected.monto_liquidado)}</strong></div>
                <div className="popup-row"><span>Atrasados +30d</span><strong style={{color: selected.atrasados > 0 ? '#ef4444' : '#10b981'}}>{selected.atrasados || 0}</strong></div>
              </div>
            )}

            {/* Leyenda */}
            <div className="mapa-leyenda">
              <p>Monto total distribuido</p>
              <div className="leyenda-items">
                {['#dbeafe','#93c5fd','#3b82f6','#1d4ed8','#1e3a8a'].map((c, i) => (
                  <span key={c} className="leyenda-item">
                    <span style={{ background: c }} className="leyenda-color"></span>
                    <span className="leyenda-text">{['Sin datos','Bajo','Medio','Alto','Muy alto'][i]}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="mapa-hint">🖱 Clic para ver detalle · Scroll para zoom</div>
          </div>

          {/* Panel lateral */}
          <div className="mapa-sidebar">
            {/* Torta por partido */}
            <div className="mapa-chart-card">
              <h3>Distribución por Partido</h3>
              {resumen?.partidos?.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={resumen.partidos}
                      dataKey="total_monto"
                      nameKey="partido"
                      cx="50%" cy="50%"
                      outerRadius={75}
                      label={({ partido, percent }) => `${partido} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {resumen.partidos.map((entry) => (
                        <Cell key={entry.partido} fill={PARTIDO_COLORS[entry.partido] || '#6b7280'} />
                      ))}
                    </Pie>
                    <RTooltip formatter={(v) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="no-data">Sin datos</p>}
            </div>

            {/* Top departamentos */}
            <div className="mapa-chart-card">
              <h3>Top Departamentos</h3>
              {resumen?.departamentos?.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={resumen.departamentos.slice(0, 6)}
                    layout="vertical"
                    margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `L ${(v/1000).toFixed(0)}K`} />
                    <YAxis type="category" dataKey="departamento" tick={{ fontSize: 9 }} width={90} />
                    <RTooltip formatter={(v) => fmt(v)} />
                    <Bar dataKey="total_monto" name="Total" fill="#3b82f6" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="no-data">Sin datos</p>}
            </div>

            {/* Tendencia mensual */}
            {tendenciaOrdenada.length > 0 && (
              <div className="mapa-chart-card">
                <h3>Tendencia Mensual</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={tendenciaOrdenada} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                    <RTooltip formatter={(v) => fmt(v)} />
                    <Bar dataKey="total_monto" name="Monto" fill="#10b981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Tabla alertas */}
        {(resumen?.departamentos || []).some(d => d.atrasados > 0) && (
          <div className="mapa-alerts">
            <h3>⚠ Cheques Pendientes con Más de 30 Días</h3>
            <table className="alerts-table">
              <thead>
                <tr><th>Departamento</th><th>Atrasados</th><th>Pendiente Total</th></tr>
              </thead>
              <tbody>
                {resumen.departamentos
                  .filter(d => d.atrasados > 0)
                  .sort((a, b) => b.atrasados - a.atrasados)
                  .map(d => (
                    <tr key={d.departamento}>
                      <td>{d.departamento}</td>
                      <td><span className="badge-red">{d.atrasados}</span></td>
                      <td>{fmt(d.monto_pendiente)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
