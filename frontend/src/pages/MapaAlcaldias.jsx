import { useEffect, useState, useCallback, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
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
  PN: '#003f8a', PL: '#c8102e', LB: '#007932',
  DC: '#0077c8', PINU: '#f4a800', 'SIN PARTIDO': '#9ca3af',
};

const ANIOS = [2022, 2023, 2024, 2025, 2026];

function fmt(n) {
  return Number(n || 0).toLocaleString('es-HN', {
    style: 'currency', currency: 'HNL', maximumFractionDigits: 0,
  });
}

export default function MapaAlcaldias() {
  const [mapReady,   setMapReady]   = useState(false);
  const [geoNames,   setGeoNames]   = useState([]);
  const [resumen,    setResumen]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [filtroAnio, setFiltroAnio] = useState('');
  const [filtroMes,  setFiltroMes]  = useState('');
  const [selected,   setSelected]   = useState(null);
  const chartRef = useRef(null);

  // Cargar y registrar GeoJSON una sola vez
  useEffect(() => {
    fetch('/honduras-geo.json')
      .then(r => r.json())
      .then(geo => {
        echarts.registerMap('honduras', geo);
        setGeoNames(geo.features.map(f => f.properties.name));
        setMapReady(true);
      })
      .catch(e => console.error('[mapa] GeoJSON:', e));
  }, []);

  const cargarResumen = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtroAnio) params.anio = filtroAnio;
      if (filtroMes)  params.mes  = filtroMes;
      const { data } = await api.get('/ayudas-alcaldias/resumen-mapa', { params });
      setResumen(data);
    } catch (e) {
      console.error('[mapa] resumen:', e);
    } finally {
      setLoading(false);
    }
  }, [filtroAnio, filtroMes]);

  useEffect(() => { cargarResumen(); }, [cargarResumen]);

  // Lookup por nombre lowercase
  const dbByLower = {};
  (resumen?.departamentos || []).forEach(d => {
    dbByLower[d.departamento.toLowerCase()] = d;
  });

  const maxMonto = Math.max(
    ...(resumen?.departamentos || []).map(d => Number(d.total_monto)), 1
  );

  // Serie alineada a nombres del GeoJSON
  const seriesData = geoNames.map(nombre => {
    const d = dbByLower[nombre.toLowerCase()];
    return { name: nombre, value: d ? Number(d.total_monto) : 0, rawData: d || null };
  });

  const kpis = resumen?.kpis || {};
  const pctLiquidado = kpis.total_monto > 0
    ? ((kpis.monto_liquidado_total / kpis.total_monto) * 100).toFixed(1) : 0;

  const tendenciaOrdenada = [...(resumen?.tendencia || [])]
    .sort((a, b) => MESES_ORDEN.indexOf(a.mes) - MESES_ORDEN.indexOf(b.mes));

  const echartsOption = mapReady ? {
    backgroundColor: '#0f172a',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: '#e2e8f0', fontSize: 13 },
      formatter: (params) => {
        const d = params.data?.rawData;
        if (!d) return `<b style="color:#f1f5f9">${params.name}</b><br/><span style="color:#64748b">Sin registros</span>`;
        const alerta = d.atrasados > 0
          ? `<br/><span style="color:#ef4444;font-weight:600">⚠ ${d.atrasados} atrasados +30d</span>` : '';
        return `<b style="color:#f1f5f9;font-size:14px">${params.name}</b><br/>
          <span style="color:#94a3b8">Total</span> <b>${fmt(d.total_monto)}</b><br/>
          <span style="color:#94a3b8">Registros</span> <b>${d.cantidad}</b><br/>
          <span style="color:#94a3b8">Entregado</span> <b>${fmt(d.monto_entregado)}</b><br/>
          <span style="color:#94a3b8">Pendiente</span> <b style="color:#fbbf24">${fmt(d.monto_pendiente)}</b><br/>
          <span style="color:#94a3b8">Liquidado</span> <b style="color:#10b981">${fmt(d.monto_liquidado)}</b>${alerta}`;
      },
    },
    visualMap: {
      type: 'continuous',
      min: 0,
      max: maxMonto,
      text: ['Mayor', 'Menor'],
      textStyle: { color: '#94a3b8', fontSize: 11 },
      inRange: { color: ['#1e3a5f', '#1d4ed8', '#60a5fa', '#bfdbfe'] },
      orient: 'vertical',
      right: 16,
      bottom: 60,
      calculable: true,
      itemWidth: 14,
      itemHeight: 90,
    },
    series: [{
      type: 'map',
      map: 'honduras',
      roam: true,
      zoom: 1.1,
      center: [-86.25, 14.55],
      label: {
        show: true,
        color: '#94a3b8',
        fontSize: 9,
        formatter: p => p.name.split(' ')[0],
      },
      emphasis: {
        label: { show: true, color: '#fff', fontWeight: 700, fontSize: 11 },
        itemStyle: { areaColor: '#f59e0b', shadowBlur: 16, shadowColor: 'rgba(245,158,11,0.5)' },
      },
      select: {
        label: { show: true, color: '#fff', fontWeight: 700 },
        itemStyle: { areaColor: '#f59e0b' },
      },
      selectedMode: 'single',
      itemStyle: {
        borderColor: '#0f172a',
        borderWidth: 1,
        areaColor: '#1e3a5f',
      },
      data: seriesData,
    }],
  } : {};

  const onChartClick = (params) => {
    if (params.componentType !== 'series') return;
    const d = params.data?.rawData;
    setSelected({
      nombre: params.name,
      ...(d || { total_monto: 0, cantidad: 0, monto_entregado: 0, monto_pendiente: 0, monto_liquidado: 0, atrasados: 0 }),
    });
  };

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
            {(filtroAnio || filtroMes) && (
              <button className="btn-clear" onClick={() => { setFiltroAnio(''); setFiltroMes(''); }}>
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

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
            <span className="kpi-sub">{kpis.liquidados || 0} cerrados</span>
          </div>
        </div>

        <div className="mapa-body">

          {/* MAPA */}
          <div className="mapa-map-wrap">
            {(loading || !mapReady) && <div className="mapa-loading">Cargando mapa…</div>}
            {mapReady && (
              <ReactECharts
                ref={chartRef}
                option={echartsOption}
                style={{ height: '100%', width: '100%' }}
                onEvents={{ click: onChartClick }}
                notMerge
              />
            )}

            {selected && (
              <div className="mapa-popup">
                <button className="popup-close" onClick={() => setSelected(null)}>✕</button>
                <h3>{selected.nombre}</h3>
                <div className="popup-row"><span>Total distribuido</span><strong>{fmt(selected.total_monto)}</strong></div>
                <div className="popup-row"><span>Registros</span><strong>{selected.cantidad || 0}</strong></div>
                <div className="popup-row"><span>Entregado</span><strong>{fmt(selected.monto_entregado)}</strong></div>
                <div className="popup-row"><span>Pendiente</span><strong style={{color:'#fbbf24'}}>{fmt(selected.monto_pendiente)}</strong></div>
                <div className="popup-row"><span>Liquidado</span><strong style={{color:'#10b981'}}>{fmt(selected.monto_liquidado)}</strong></div>
                <div className="popup-row">
                  <span>Atrasados +30d</span>
                  <strong style={{color: selected.atrasados > 0 ? '#ef4444' : '#10b981'}}>
                    {selected.atrasados || 0}
                  </strong>
                </div>
              </div>
            )}

            <div className="mapa-hint">🖱 Clic para detalle · Scroll para zoom · Arrastra para mover</div>
          </div>

          {/* SIDEBAR */}
          <div className="mapa-sidebar">
            <div className="mapa-chart-card">
              <h3>Distribución por Partido</h3>
              {resumen?.partidos?.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={resumen.partidos} dataKey="total_monto" nameKey="partido"
                      cx="50%" cy="50%" outerRadius={75}
                      label={({ partido, percent }) => `${partido} ${(percent*100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {resumen.partidos.map(e => (
                        <Cell key={e.partido} fill={PARTIDO_COLORS[e.partido] || '#6b7280'} />
                      ))}
                    </Pie>
                    <RTooltip formatter={v => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="no-data">Sin datos</p>}
            </div>

            <div className="mapa-chart-card">
              <h3>Top Departamentos</h3>
              {resumen?.departamentos?.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={resumen.departamentos.slice(0, 6)} layout="vertical"
                    margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `L ${(v/1000).toFixed(0)}K`} />
                    <YAxis type="category" dataKey="departamento" tick={{ fontSize: 9 }} width={90} />
                    <RTooltip formatter={v => fmt(v)} />
                    <Bar dataKey="total_monto" name="Total" fill="#3b82f6" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="no-data">Sin datos</p>}
            </div>

            {tendenciaOrdenada.length > 0 && (
              <div className="mapa-chart-card">
                <h3>Tendencia Mensual</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={tendenciaOrdenada} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                    <RTooltip formatter={v => fmt(v)} />
                    <Bar dataKey="total_monto" name="Monto" fill="#10b981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {(resumen?.departamentos || []).some(d => d.atrasados > 0) && (
          <div className="mapa-alerts">
            <h3>⚠ Cheques Pendientes con Más de 30 Días</h3>
            <table className="alerts-table">
              <thead><tr><th>Departamento</th><th>Atrasados</th><th>Pendiente Total</th></tr></thead>
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
