import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import * as XLSX from 'xlsx';
import Navbar from '../components/Navbar';
import api from '../api/axios';
import './MapaAlcaldias.css';

const MESES_ORDEN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const PARTIDO_COLORS = {
  PN:'#003f8a', PL:'#c8102e', LB:'#007932',
  DC:'#0077c8', PINU:'#f4a800', 'SIN PARTIDO':'#9ca3af',
};

const ANIOS = [2022, 2023, 2024, 2025, 2026];

const METRICAS = [
  { key:'total_monto',    label:'Monto',      color:['#1e3a5f','#1d4ed8','#60a5fa','#bfdbfe'] },
  { key:'cantidad',       label:'Registros',  color:['#14532d','#15803d','#4ade80','#bbf7d0'] },
  { key:'atrasados',      label:'Atrasados',  color:['#450a0a','#b91c1c','#f87171','#fecaca'] },
  { key:'pct_liquidado',  label:'% Liquidado',color:['#1c1917','#854d0e','#facc15','#fef9c3'] },
];

function fmt(n) {
  return Number(n||0).toLocaleString('es-HN',{style:'currency',currency:'HNL',maximumFractionDigits:0});
}
function fmtN(n) {
  return Number(n||0).toLocaleString('es-HN');
}

function ProgressBar({ value, max, color='#3b82f6' }) {
  const pct = max > 0 ? Math.min((value/max)*100, 100) : 0;
  return (
    <div className="prog-wrap">
      <div className="prog-bar" style={{ width:`${pct}%`, background: color }} />
    </div>
  );
}

export default function MapaAlcaldias() {
  const [mapReady,   setMapReady]   = useState(false);
  const [geoNames,   setGeoNames]   = useState([]);
  const [resumen,    setResumen]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [filtroAnio, setFiltroAnio] = useState('');
  const [filtroMes,  setFiltroMes]  = useState('');
  const [metrica,    setMetrica]    = useState('total_monto');
  const [selected,   setSelected]   = useState(null);
  const [sortCol,    setSortCol]    = useState('total_monto');
  const [sortDir,    setSortDir]    = useState('desc');
  const [tabDetalle, setTabDetalle] = useState('resumen'); // resumen | alcaldias
  const chartRef = useRef(null);

  // Cargar GeoJSON
  useEffect(() => {
    fetch('/honduras-geo.json')
      .then(r => r.json())
      .then(geo => {
        echarts.registerMap('honduras', geo);
        setGeoNames(geo.features.map(f => f.properties.name));
        setMapReady(true);
      });
  }, []);

  const cargarResumen = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtroAnio) params.anio = filtroAnio;
      if (filtroMes)  params.mes  = filtroMes;
      const { data } = await api.get('/ayudas-alcaldias/resumen-mapa', { params });
      setResumen(data);
    } catch(e) { console.error('[mapa]', e); }
    finally { setLoading(false); }
  }, [filtroAnio, filtroMes]);

  useEffect(() => { cargarResumen(); }, [cargarResumen]);

  // Lookup departamento
  const dbByLower = useMemo(() => {
    const m = {};
    (resumen?.departamentos || []).forEach(d => { m[d.departamento.toLowerCase()] = d; });
    return m;
  }, [resumen]);

  // Calcular % liquidado por departamento
  const deptoEnriquecidos = useMemo(() => {
    return (resumen?.departamentos || []).map(d => ({
      ...d,
      pct_liquidado: d.total_monto > 0
        ? Number(((d.monto_liquidado / d.total_monto) * 100).toFixed(1))
        : 0,
    }));
  }, [resumen]);

  const maxValor = useMemo(() => {
    if (!deptoEnriquecidos.length) return 1;
    return Math.max(...deptoEnriquecidos.map(d => Number(d[metrica]) || 0), 1);
  }, [deptoEnriquecidos, metrica]);

  const kpis = resumen?.kpis || {};
  const pctLiquidado = kpis.total_monto > 0
    ? ((kpis.monto_liquidado_total / kpis.total_monto) * 100).toFixed(1) : 0;

  // Tendencia con comparativa
  const tendenciaMerged = useMemo(() => {
    const base = {};
    MESES_ORDEN.forEach(m => { base[m] = { mes: m, actual: 0, anterior: 0 }; });
    (resumen?.tendencia   || []).forEach(t => { if (base[t.mes]) base[t.mes].actual   = Number(t.total_monto); });
    (resumen?.comparativa || []).forEach(t => { if (base[t.mes]) base[t.mes].anterior = Number(t.total_monto); });
    return MESES_ORDEN.map(m => base[m]).filter(r => r.actual > 0 || r.anterior > 0);
  }, [resumen]);

  // Serie ECharts
  const metricaCfg = METRICAS.find(m => m.key === metrica);
  const seriesData = geoNames.map(nombre => {
    const d = dbByLower[nombre.toLowerCase()];
    const raw = d ? (metrica === 'pct_liquidado'
      ? (d.total_monto > 0 ? Number(((d.monto_liquidado/d.total_monto)*100).toFixed(1)) : 0)
      : Number(d[metrica]) || 0)
      : 0;
    return { name: nombre, value: raw, rawData: d || null };
  });

  const echartsOption = mapReady ? {
    backgroundColor: '#0f172a',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderWidth: 1,
      padding: [12, 16],
      textStyle: { color: '#e2e8f0', fontSize: 13 },
      formatter: params => {
        const d = params.data?.rawData;
        if (!d) return `<b style="color:#f1f5f9">${params.name}</b><br/><span style="color:#64748b">Sin registros</span>`;
        const pct = d.total_monto > 0 ? ((d.monto_liquidado/d.total_monto)*100).toFixed(1) : 0;
        const alerta = d.atrasados > 0
          ? `<br/><span style="color:#ef4444;font-weight:700">⚠ ${d.atrasados} atrasados +30d</span>` : '';
        return `<b style="color:#f1f5f9;font-size:14px">${params.name}</b><hr style="border-color:#334155;margin:6px 0"/>
          <span style="color:#94a3b8">Total</span> <b>${fmt(d.total_monto)}</b><br/>
          <span style="color:#94a3b8">Registros</span> <b>${d.cantidad}</b><br/>
          <span style="color:#94a3b8">Entregado</span> <b style="color:#4ade80">${fmt(d.monto_entregado)}</b><br/>
          <span style="color:#94a3b8">Pendiente</span> <b style="color:#fbbf24">${fmt(d.monto_pendiente)}</b><br/>
          <span style="color:#94a3b8">Liquidado</span> <b style="color:#10b981">${fmt(d.monto_liquidado)}</b><br/>
          <span style="color:#94a3b8">% Liquidado</span> <b>${pct}%</b>${alerta}`;
      },
    },
    visualMap: {
      type: 'continuous',
      min: 0,
      max: maxValor,
      text: ['Mayor','Menor'],
      textStyle: { color: '#94a3b8', fontSize: 11 },
      inRange: { color: metricaCfg.color },
      orient: 'vertical',
      right: 12,
      bottom: 50,
      calculable: true,
      itemWidth: 14,
      itemHeight: 80,
    },
    series: [{
      type: 'map',
      map: 'honduras',
      roam: true,
      zoom: 1.1,
      center: [-86.25, 14.55],
      label: {
        show: true,
        color: '#cbd5e1',
        fontSize: 9.5,
        fontWeight: '500',
        formatter: p => {
          const d = dbByLower[p.name?.toLowerCase()];
          if (!d) return p.name.split(' ')[0];
          return d.atrasados > 0 ? `⚠ ${p.name.split(' ')[0]}` : p.name.split(' ')[0];
        },
      },
      emphasis: {
        label: { show: true, color: '#fff', fontWeight: 700, fontSize: 11 },
        itemStyle: { areaColor: '#f59e0b', shadowBlur: 20, shadowColor: 'rgba(245,158,11,0.5)' },
      },
      select: {
        label: { show: true, color: '#fff', fontWeight: 700 },
        itemStyle: { areaColor: '#f59e0b' },
      },
      selectedMode: 'single',
      itemStyle: { borderColor: '#0f172a', borderWidth: 1, areaColor: '#1e3a5f' },
      // Departamentos con atrasados tienen borde rojo
      data: seriesData.map(s => ({
        ...s,
        itemStyle: s.rawData?.atrasados > 0 ? {
          borderColor: '#ef4444',
          borderWidth: 2,
        } : undefined,
      })),
    }],
  } : {};

  const onChartClick = params => {
    if (params.componentType !== 'series') return;
    const d = params.data?.rawData;
    setSelected({
      nombre: params.name,
      ...(d || { total_monto:0, cantidad:0, monto_entregado:0, monto_pendiente:0, monto_liquidado:0, atrasados:0 }),
    });
    setTabDetalle('resumen');
  };

  // Tabla ordenable
  const tablaOrdenada = useMemo(() => {
    return [...deptoEnriquecidos].sort((a, b) => {
      const av = Number(a[sortCol]) || 0;
      const bv = Number(b[sortCol]) || 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [deptoEnriquecidos, sortCol, sortDir]);

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  // Top alcaldías del departamento seleccionado
  const alcaldiasDept = useMemo(() => {
    if (!selected) return [];
    return (resumen?.alcaldias || [])
      .filter(a => a.departamento?.toLowerCase() === selected.nombre?.toLowerCase())
      .slice(0, 8);
  }, [selected, resumen]);

  // Exportar Excel
  const exportarExcel = () => {
    const rows = tablaOrdenada.map(d => ({
      Departamento: d.departamento,
      Registros: d.cantidad,
      'Total Distribuido': Number(d.total_monto),
      Entregado: Number(d.monto_entregado),
      Pendiente: Number(d.monto_pendiente),
      Liquidado: Number(d.monto_liquidado),
      '% Liquidado': d.pct_liquidado,
      'Atrasados +30d': d.atrasados,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resumen Departamentos');

    // Hoja alcaldías
    if (resumen?.alcaldias?.length) {
      const wsA = XLSX.utils.json_to_sheet(resumen.alcaldias.map(a => ({
        Alcaldía: a.alcaldia,
        Departamento: a.departamento,
        Registros: a.cantidad,
        'Total Monto': Number(a.total_monto),
        'Atrasados +30d': a.atrasados,
      })));
      XLSX.utils.book_append_sheet(wb, wsA, 'Top Alcaldías');
    }

    const fecha = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `mapa_alcaldias_${fecha}.xlsx`);
  };

  const thSort = col => (
    <th
      className={`sortable ${sortCol === col ? 'active' : ''}`}
      onClick={() => toggleSort(col)}
    >
      {col === 'total_monto' ? 'Total' :
       col === 'cantidad'    ? 'Registros' :
       col === 'monto_pendiente' ? 'Pendiente' :
       col === 'pct_liquidado'   ? '% Liq.' :
       col === 'atrasados'       ? 'Atrasados' : col}
      <span className="sort-icon">{sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span>
    </th>
  );

  return (
    <div className="app-shell">
      <Navbar />
      <main className="mapa-main">

        {/* HEADER */}
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
                Limpiar
              </button>
            )}
            <button className="btn-export" onClick={exportarExcel} title="Exportar Excel">
              ⬇ Excel
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mapa-kpis">
          <div className="kpi-card kpi-blue">
            <span className="kpi-label">Total Distribuido</span>
            <span className="kpi-value">{fmt(kpis.total_monto)}</span>
            <span className="kpi-sub">{fmtN(kpis.total_registros)} registros</span>
          </div>
          <div className="kpi-card kpi-yellow">
            <span className="kpi-label">Pendientes de Entrega</span>
            <span className="kpi-value">{fmtN(kpis.total_pendientes)}</span>
            <span className="kpi-sub">cheques sin entregar</span>
          </div>
          <div className="kpi-card kpi-red">
            <span className="kpi-label">Atrasados +30 días</span>
            <span className="kpi-value">{fmtN(kpis.atrasados_30)}</span>
            <span className="kpi-sub">requieren atención</span>
          </div>
          <div className="kpi-card kpi-green">
            <span className="kpi-label">% Liquidado</span>
            <span className="kpi-value">{pctLiquidado}%</span>
            <span className="kpi-sub">{fmtN(kpis.liquidados)} cerrados</span>
          </div>
        </div>

        {/* SELECTOR MÉTRICA */}
        <div className="metrica-tabs">
          {METRICAS.map(m => (
            <button
              key={m.key}
              className={`metrica-btn ${metrica === m.key ? 'active' : ''}`}
              onClick={() => setMetrica(m.key)}
            >
              {m.label}
            </button>
          ))}
          <span className="metrica-hint">Métrica del mapa →</span>
        </div>

        {/* CUERPO */}
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

            {/* Panel detalle dept */}
            {selected && (
              <div className="mapa-popup">
                <button className="popup-close" onClick={() => setSelected(null)}>✕</button>
                <h3>{selected.nombre}</h3>
                <div className="popup-tabs">
                  <button className={tabDetalle === 'resumen' ? 'active' : ''} onClick={() => setTabDetalle('resumen')}>Resumen</button>
                  <button className={tabDetalle === 'alcaldias' ? 'active' : ''} onClick={() => setTabDetalle('alcaldias')}>Alcaldías</button>
                </div>

                {tabDetalle === 'resumen' && (
                  <div className="popup-content">
                    <div className="popup-row"><span>Total distribuido</span><strong>{fmt(selected.total_monto)}</strong></div>
                    <div className="popup-row"><span>Registros</span><strong>{selected.cantidad || 0}</strong></div>
                    <div className="popup-row"><span>Entregado</span><strong style={{color:'#4ade80'}}>{fmt(selected.monto_entregado)}</strong></div>
                    <ProgressBar value={selected.monto_entregado} max={selected.total_monto} color="#4ade80" />
                    <div className="popup-row"><span>Pendiente</span><strong style={{color:'#fbbf24'}}>{fmt(selected.monto_pendiente)}</strong></div>
                    <ProgressBar value={selected.monto_pendiente} max={selected.total_monto} color="#fbbf24" />
                    <div className="popup-row"><span>Liquidado</span><strong style={{color:'#10b981'}}>{fmt(selected.monto_liquidado)}</strong></div>
                    <ProgressBar value={selected.monto_liquidado} max={selected.total_monto} color="#10b981" />
                    <div className="popup-row">
                      <span>% Liquidado</span>
                      <strong style={{color:'#10b981'}}>
                        {selected.total_monto > 0
                          ? ((selected.monto_liquidado/selected.total_monto)*100).toFixed(1)
                          : 0}%
                      </strong>
                    </div>
                    {selected.atrasados > 0 && (
                      <div className="popup-alerta">⚠ {selected.atrasados} cheques atrasados más de 30 días</div>
                    )}
                  </div>
                )}

                {tabDetalle === 'alcaldias' && (
                  <div className="popup-content">
                    {alcaldiasDept.length === 0
                      ? <p className="no-data">Sin datos de alcaldías</p>
                      : alcaldiasDept.map((a, i) => (
                        <div key={i} className="alcaldia-row">
                          <div className="alcaldia-name">{a.alcaldia}</div>
                          <div className="alcaldia-monto">{fmt(a.total_monto)}</div>
                          {a.atrasados > 0 && <span className="badge-red-sm">⚠{a.atrasados}</span>}
                          <ProgressBar value={Number(a.total_monto)} max={Number(alcaldiasDept[0]?.total_monto)||1} color="#3b82f6" />
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>
            )}

            <div className="mapa-hint">🖱 Clic para detalle · Scroll para zoom · Arrastra para mover · Borde rojo = atrasados</div>
          </div>

          {/* SIDEBAR */}
          <div className="mapa-sidebar">

            <div className="mapa-chart-card">
              <h3>Distribución por Partido</h3>
              {resumen?.partidos?.length > 0 ? (
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie data={resumen.partidos} dataKey="total_monto" nameKey="partido"
                      cx="50%" cy="50%" outerRadius={70} innerRadius={30}
                      label={({ partido, percent }) => `${partido} ${(percent*100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {resumen.partidos.map(e => (
                        <Cell key={e.partido} fill={PARTIDO_COLORS[e.partido] || '#6b7280'} />
                      ))}
                    </Pie>
                    <RTooltip formatter={v => fmt(v)} contentStyle={{background:'#1e293b',border:'1px solid #334155',color:'#e2e8f0'}} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="no-data">Sin datos</p>}
            </div>

            <div className="mapa-chart-card">
              <h3>Top Departamentos</h3>
              {deptoEnriquecidos.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={deptoEnriquecidos.slice(0,6)} layout="vertical"
                    margin={{left:8,right:20,top:4,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1e293b" />
                    <XAxis type="number" tick={{fontSize:9,fill:'#64748b'}} tickFormatter={v=>`${(v/1000).toFixed(0)}K`} />
                    <YAxis type="category" dataKey="departamento" tick={{fontSize:9,fill:'#94a3b8'}} width={85} />
                    <RTooltip formatter={v=>fmt(v)} contentStyle={{background:'#1e293b',border:'1px solid #334155',color:'#e2e8f0'}} />
                    <Bar dataKey="total_monto" name="Total" fill="#3b82f6" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="no-data">Sin datos</p>}
            </div>

            {tendenciaMerged.length > 0 && (
              <div className="mapa-chart-card">
                <h3>
                  Tendencia Mensual
                  {resumen?.anioComp && filtroAnio &&
                    <span className="chart-sub"> ({filtroAnio} vs {resumen.anioComp})</span>}
                </h3>
                <ResponsiveContainer width="100%" height={190}>
                  <LineChart data={tendenciaMerged} margin={{left:0,right:10,top:5,bottom:22}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="mes" tick={{fontSize:8,fill:'#64748b'}} angle={-40} textAnchor="end" />
                    <YAxis tick={{fontSize:8,fill:'#64748b'}} tickFormatter={v=>`${(v/1000).toFixed(0)}K`} />
                    <RTooltip formatter={v=>fmt(v)} contentStyle={{background:'#1e293b',border:'1px solid #334155',color:'#e2e8f0'}} />
                    <Legend wrapperStyle={{fontSize:'10px',color:'#94a3b8'}} />
                    <Line type="monotone" dataKey="actual"   name={filtroAnio||'Actual'}   stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="anterior" name={resumen?.anioComp ? String(resumen.anioComp) : 'Anterior'} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

          </div>
        </div>

        {/* TABLA RESUMEN */}
        <div className="mapa-tabla-wrap">
          <div className="mapa-tabla-header">
            <h3>Resumen por Departamento</h3>
            <span className="tabla-hint">{tablaOrdenada.length} departamentos · Clic en columna para ordenar</span>
          </div>
          <div className="tabla-scroll">
            <table className="resumen-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Departamento</th>
                  {thSort('cantidad')}
                  {thSort('total_monto')}
                  {thSort('monto_pendiente')}
                  {thSort('pct_liquidado')}
                  {thSort('atrasados')}
                </tr>
              </thead>
              <tbody>
                {tablaOrdenada.map((d, i) => (
                  <tr
                    key={d.departamento}
                    className={`${d.atrasados > 0 ? 'row-alert' : ''} ${selected?.nombre?.toLowerCase() === d.departamento?.toLowerCase() ? 'row-selected' : ''}`}
                    onClick={() => { setSelected({ nombre: d.departamento, ...d }); setTabDetalle('resumen'); }}
                  >
                    <td className="td-num">{i+1}</td>
                    <td className="td-dept">
                      {d.atrasados > 0 && <span className="dot-red" title="Atrasados +30d" />}
                      {d.departamento}
                    </td>
                    <td>{fmtN(d.cantidad)}</td>
                    <td><b>{fmt(d.total_monto)}</b></td>
                    <td style={{color: d.monto_pendiente > 0 ? '#fbbf24' : '#64748b'}}>{fmt(d.monto_pendiente)}</td>
                    <td>
                      <div className="pct-cell">
                        <span>{d.pct_liquidado}%</span>
                        <ProgressBar value={d.pct_liquidado} max={100} color="#10b981" />
                      </div>
                    </td>
                    <td>
                      {d.atrasados > 0
                        ? <span className="badge-red">{d.atrasados}</span>
                        : <span className="badge-ok">0</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}
