import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { FiUsers, FiSearch, FiRefreshCw, FiDownload, FiGift, FiCalendar, FiMapPin, FiPhone, FiX, FiPieChart, FiList, FiMap, FiAward, FiBarChart2, FiAlertCircle } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import { LuChartNoAxesCombined } from 'react-icons/lu';
import * as XLSX from 'xlsx';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import './BeneficiariosAyuda.css';

const PAGE_SIZE = 20;

const fmtMonto = (n) =>
  `L ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtMontoCorto = (n) =>
  `L ${Number(n || 0).toLocaleString('es-HN', { maximumFractionDigits: 0 })}`;

const iniciales = (nombre) =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

const waLink = (tel) => {
  const d = (tel || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  return `https://wa.me/${d.length === 8 ? '504' + d : d}`;
};

const fmtFecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');

// Rangos de edad del gráfico de distribución
const RANGOS_EDAD = [
  { key: 'menor18', label: 'Menos de 18', test: e => e < 18 },
  { key: '18-29',   label: '18 – 29',     test: e => e >= 18 && e <= 29 },
  { key: '30-44',   label: '30 – 44',     test: e => e >= 30 && e <= 44 },
  { key: '45-59',   label: '45 – 59',     test: e => e >= 45 && e <= 59 },
  { key: '60+',     label: '60 o más',    test: e => e >= 60 },
];

const NOMBRES_CORTOS = {
  'Francisco Morazán': 'F. Morazán',
  'Islas de la Bahía': 'Islas Bahía',
  'Santa Bárbara': 'Sta. Bárbara',
  'Gracias a Dios': 'Gracias a Dios',
};

const METRICAS = [
  { key: 'ayudas',        label: 'Ayudas' },
  { key: 'monto',         label: 'Monto' },
  { key: 'beneficiarios', label: 'Beneficiarios' },
];

export default function BeneficiariosAyuda() {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage]         = useState(1);
  const [tab, setTab]           = useState('resumen'); // 'resumen' | 'beneficiarios'
  const [metrica, setMetrica]   = useState('ayudas');
  const [filtroDepto, setFiltroDepto] = useState('');
  const [filtroEdad, setFiltroEdad]   = useState('');
  const [filtroSexo, setFiltroSexo]   = useState('');
  const [mapReady, setMapReady] = useState(false);
  const mapWrapRef = useRef(null);
  const [mapH, setMapH] = useState(700);

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

  // Mapa de Honduras (el mismo GeoJSON del módulo Mapa Alcaldías)
  useEffect(() => {
    fetch('/honduras-geo.json')
      .then(r => r.json())
      .then(geo => {
        echarts.registerMap('honduras', geo);
        setMapReady(true);
      })
      .catch(() => setMapReady(false));
  }, []);

  // La altura del mapa sigue al ancho disponible para que siempre rellene la tarjeta
  useEffect(() => {
    const el = mapWrapRef.current;
    if (!el) return undefined;
    const ajustar = () => setMapH(Math.round(Math.min(860, Math.max(420, el.clientWidth * 0.72))));
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab, loading, error, mapReady]);

  // ── Resumen por departamento ────────────────────────────────
  const deptos = useMemo(() => {
    const m = {};
    rows.forEach(r => {
      if (!r.departamento) return;
      const d = m[r.departamento] || (m[r.departamento] = {
        departamento: r.departamento, beneficiarios: 0, ayudas: 0, monto: 0, sumEdad: 0, conEdad: 0,
      });
      d.beneficiarios += 1;
      d.ayudas += Number(r.total_ayudas) || 0;
      d.monto += Number(r.monto_total) || 0;
      if (r.edad !== null && r.edad !== undefined) { d.sumEdad += r.edad; d.conEdad += 1; }
    });
    return m;
  }, [rows]);

  const topDeptos = useMemo(
    () => Object.values(deptos).sort((a, b) => b[metrica] - a[metrica]).slice(0, 5),
    [deptos, metrica]
  );
  const maxMetrica = topDeptos.length ? Math.max(topDeptos[0][metrica], 1) : 1;

  const fmtMetrica = (valor) =>
    metrica === 'monto' ? fmtMontoCorto(valor) : Number(valor).toLocaleString('es-HN');

  // ── Distribución por edad ───────────────────────────────────
  const edades = useMemo(() => {
    const out = RANGOS_EDAD.map(r => ({ ...r, total: 0 }));
    let sinDato = 0;
    rows.forEach(r => {
      if (r.edad === null || r.edad === undefined) { sinDato += 1; return; }
      const rango = out.find(x => x.test(r.edad));
      if (rango) rango.total += 1;
    });
    const lista = out.filter(r => r.key !== 'menor18' || r.total > 0);
    if (sinDato > 0) lista.push({ key: 'sin-dato', label: 'Sin fecha de nac.', total: sinDato });
    return lista;
  }, [rows]);
  const maxEdad = Math.max(...edades.map(e => e.total), 1);

  // ── Distribución por género ─────────────────────────────────
  const generos = useMemo(() => {
    const base = [
      { key: 'M', label: 'Hombres', total: 0, ayudas: 0, monto: 0 },
      { key: 'F', label: 'Mujeres', total: 0, ayudas: 0, monto: 0 },
      { key: 'sin-dato', label: 'Sin dato', total: 0, ayudas: 0, monto: 0 },
    ];
    rows.forEach(r => {
      const g = base.find(x => x.key === (r.sexo || 'sin-dato'));
      g.total += 1;
      g.ayudas += Number(r.total_ayudas) || 0;
      g.monto += Number(r.monto_total) || 0;
    });
    return base.filter(g => g.key !== 'sin-dato' || g.total > 0);
  }, [rows]);
  const totalGeneros = Math.max(rows.length, 1);

  // ── Mapa ────────────────────────────────────────────────────
  const maxMapa = Math.max(...Object.values(deptos).map(d => d[metrica]), 1);

  const mapOption = mapReady ? {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 13 },
      padding: [10, 14],
      formatter: p => {
        const d = deptos[p.name];
        if (!d) return `<b>${p.name}</b><br/><span style="color:#94a3b8">Sin beneficiarios</span>`;
        const prom = d.conEdad ? Math.round(d.sumEdad / d.conEdad) : null;
        return `<b style="font-size:14px">${p.name}</b><hr style="border-color:#334155;margin:6px 0"/>
          <span style="color:#94a3b8">Beneficiarios</span> <b>${d.beneficiarios}</b><br/>
          <span style="color:#94a3b8">Ayudas</span> <b>${d.ayudas}</b><br/>
          <span style="color:#94a3b8">Monto</span> <b style="color:#4ade80">${fmtMonto(d.monto)}</b>
          ${prom !== null ? `<br/><span style="color:#94a3b8">Edad promedio</span> <b>${prom} años</b>` : ''}
          <br/><span style="color:#64748b;font-size:11px">Clic para ver la lista</span>`;
      },
    },
    visualMap: {
      type: 'continuous',
      min: 0,
      max: maxMapa,
      text: ['Más', 'Menos'],
      textStyle: { color: '#64748b', fontSize: 11 },
      inRange: { color: ['#dbeafe', '#60a5fa', '#1d4ed8', '#1e3a8a'] },
      orient: 'vertical',
      right: 6,
      bottom: 20,
      itemWidth: 12,
      itemHeight: 90,
    },
    series: [{
      type: 'map',
      map: 'honduras',
      roam: false,
      layoutCenter: ['50%', '50%'],
      layoutSize: '128%',
      selectedMode: false,
      label: {
        show: true,
        color: '#334155',
        fontSize: 12,
        fontWeight: 600,
        formatter: p => {
          const d = deptos[p.name];
          const nombre = NOMBRES_CORTOS[p.name] || p.name;
          if (!d) return nombre;
          // Sobre azul oscuro el texto va en blanco; sobre tonos claros, oscuro
          const oscuro = d[metrica] / maxMapa >= 0.45;
          const valor = metrica === 'monto' ? fmtMontoCorto(d.monto) : d[metrica];
          return oscuro ? `{nl|${nombre}}
{vl|${valor}}` : `{n|${nombre}}
{v|${valor}}`;
        },
        rich: {
          n:  { color: '#0f172a', fontSize: 12, fontWeight: 700, lineHeight: 15 },
          v:  { color: '#fff', backgroundColor: '#1d4ed8', borderRadius: 8, padding: [2, 7], fontSize: 12, fontWeight: 700, align: 'center' },
          nl: { color: '#ffffff', fontSize: 12, fontWeight: 700, lineHeight: 15 },
          vl: { color: '#1e3a8a', backgroundColor: '#ffffff', borderRadius: 8, padding: [2, 7], fontSize: 12, fontWeight: 800, align: 'center' },
        },
      },
      itemStyle: { borderColor: '#ffffff', borderWidth: 1, areaColor: '#eef2f7' },
      emphasis: {
        label: { color: '#fff', fontWeight: 700 },
        itemStyle: { areaColor: '#f59e0b' },
      },
      data: Object.values(deptos).map(d => ({ name: d.departamento, value: d[metrica] })),
    }],
  } : {};

  // ── Navegación entre resumen y tabla ────────────────────────
  const irATabla = ({ depto = '', edad = '', sexo = '' }) => {
    setFiltroDepto(depto);
    setFiltroEdad(edad);
    setFiltroSexo(sexo);
    setBusqueda('');
    setPage(1);
    setTab('beneficiarios');
  };

  const limpiarFiltros = () => { setFiltroDepto(''); setFiltroEdad(''); setFiltroSexo(''); setPage(1); };

  // ── Tabla ───────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const rango = RANGOS_EDAD.find(r => r.key === filtroEdad);
    return rows.filter(r => {
      if (filtroDepto && r.departamento !== filtroDepto) return false;
      if (filtroSexo && (r.sexo || 'sin-dato') !== filtroSexo) return false;
      if (filtroEdad === 'sin-dato') { if (r.edad !== null && r.edad !== undefined) return false; }
      else if (rango && (r.edad === null || r.edad === undefined || !rango.test(r.edad))) return false;
      if (!q) return true;
      return (
        r.nombre.toLowerCase().includes(q) ||
        r.dni.includes(q) ||
        (r.departamento || '').toLowerCase().includes(q) ||
        (r.telefono || '').includes(q)
      );
    });
  }, [rows, busqueda, filtroDepto, filtroEdad, filtroSexo]);

  useEffect(() => { setPage(1); }, [busqueda]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const visibles   = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const proximos   = rows.filter(r => r.dias_para_cumple !== null && r.dias_para_cumple <= 30).length;
  const hayFiltros = Boolean(busqueda.trim() || filtroDepto || filtroEdad || filtroSexo);
  const etiquetaEdad = edades.find(e => e.key === filtroEdad)?.label;
  const etiquetaSexo = generos.find(g => g.key === filtroSexo)?.label;

  const exportar = () => {
    const data = filtrados.map(r => ({
      'DNI':                 r.dni,
      'Nombre':              r.nombre,
      'Teléfono':            r.telefono || '',
      'Departamento':        r.departamento || '',
      'Sexo':                r.sexo === 'M' ? 'Hombre' : r.sexo === 'F' ? 'Mujer' : '',
      'Fecha de nacimiento': fmtFecha(r.fecha_nacimiento),
      'Edad':                r.edad ?? '',
      'Cumpleaños':          r.cumple || '',
      'Ayudas recibidas':    r.total_ayudas,
      'Monto total (L)':     r.monto_total,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 20 }, { wch: 10 }, { wch: 18 }, { wch: 8 }, { wch: 18 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Beneficiarios');
    XLSX.writeFile(wb, 'Beneficiarios_Ayuda_Social.xlsx');
  };

  return (
    <div className="bn-page">
      <Navbar />
      <div className="bn-container">
        <div className="bn-header">
          <div className="bn-header-left">
            <div className="bn-header-icon"><LuChartNoAxesCombined size={26} /></div>
            <div>
              <h1>Estadísticas de Beneficiarios</h1>
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

        <div className="bn-tabs">
          <button className={`bn-tab${tab === 'resumen' ? ' bn-tab--active' : ''}`} onClick={() => setTab('resumen')}>
            <FiPieChart size={15} /> Resumen
          </button>
          <button className={`bn-tab${tab === 'beneficiarios' ? ' bn-tab--active' : ''}`} onClick={() => setTab('beneficiarios')}>
            <FiList size={15} /> Beneficiarios <span className="bn-tab-count">{rows.length}</span>
          </button>
        </div>

        {tab === 'beneficiarios' && (
          <div className="bn-stats">
            <div className="bn-stat">
              <span className="bn-stat-icon bn-stat-icon--blue"><FiUsers size={20} /></span>
              <div><span className="bn-stat-num">{rows.length}</span><span className="bn-stat-lbl">Beneficiarios</span></div>
            </div>
            <div className="bn-stat">
              <span className="bn-stat-icon bn-stat-icon--green"><FiCalendar size={20} /></span>
              <div><span className="bn-stat-num">{rows.filter(r => r.fecha_nacimiento).length}</span><span className="bn-stat-lbl">Con fecha de nacimiento</span></div>
            </div>
            <div className="bn-stat">
              <span className="bn-stat-icon bn-stat-icon--pink"><FiGift size={20} /></span>
              <div><span className="bn-stat-num bn-stat-num--pink">{proximos}</span><span className="bn-stat-lbl">Cumplen años en 30 días</span></div>
            </div>
          </div>

        )}

        {/* ── TAB: RESUMEN ─────────────────────────────────── */}
        {tab === 'resumen' && (
          loading ? (
            <div className="bn-card"><div className="bn-empty">Cargando…</div></div>
          ) : error ? (
            <div className="bn-card"><div className="bn-empty bn-empty--error">{error}</div></div>
          ) : (
            <div className="bn-resumen">
              <div className="bn-card bn-map-card">
                <div className="bn-panel-head">
                  <div className="bn-panel-title">
                    <span className="bn-panel-ico bn-panel-ico--blue"><FiMap size={16} /></span>
                    <div>
                    <h2>Mapa por Departamento</h2>
                    <p>Haga clic en un departamento para ver sus beneficiarios</p>
                  </div>
                  </div>
                  <div className="bn-seg">
                    {METRICAS.map(m => (
                      <button key={m.key} className={`bn-seg-btn${metrica === m.key ? ' bn-seg-btn--active' : ''}`} onClick={() => setMetrica(m.key)}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div ref={mapWrapRef}>
                {mapReady ? (
                  <ReactECharts
                    option={mapOption}
                    style={{ height: mapH }}
                    onEvents={{ click: p => { if (p.name && deptos[p.name]) irATabla({ depto: p.name }); } }}
                  />
                ) : (
                  <div className="bn-empty">Cargando mapa…</div>
                )}
                </div>
              </div>

              <div className="bn-side">
                <div className="bn-card bn-panel">
                  <div className="bn-panel-head">
                    <div className="bn-panel-title">
                      <span className="bn-panel-ico bn-panel-ico--amber"><FiAward size={16} /></span>
                      <div>
                      <h2>Departamentos con más {metrica === 'monto' ? 'Monto' : metrica === 'ayudas' ? 'Ayudas' : 'Beneficiarios'}</h2>
                      <p>Top 5 · clic para ver la lista</p>
                    </div>
                    </div>
                  </div>
                  {topDeptos.length === 0 ? (
                    <div className="bn-empty bn-empty--sm">Aún no hay departamentos registrados.</div>
                  ) : (
                    <ol className="bn-top">
                      {topDeptos.map((d, i) => (
                        <li key={d.departamento}>
                          <button className="bn-top-row" onClick={() => irATabla({ depto: d.departamento })}>
                            <span className="bn-top-pos">{i + 1}</span>
                            <span className="bn-top-body">
                              <span className="bn-top-line">
                                <span className="bn-top-name">{d.departamento}</span>
                                <span className="bn-top-val">{fmtMetrica(d[metrica])}</span>
                              </span>
                              <span className="bn-top-track"><span className="bn-top-fill" style={{ width: `${(d[metrica] / maxMetrica) * 100}%` }} /></span>
                              <span className="bn-top-sub">
                                {d.beneficiarios} benef. · {d.ayudas} ayudas · {fmtMontoCorto(d.monto)}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <div className="bn-card bn-panel">
                  <div className="bn-panel-head">
                    <div className="bn-panel-title">
                      <span className="bn-panel-ico bn-panel-ico--green"><FiBarChart2 size={16} /></span>
                      <div>
                      <h2>Distribución por Edad</h2>
                      <p>Clic en una barra para ver la lista</p>
                    </div>
                    </div>
                  </div>
                  <div className="bn-bars">
                    {edades.map(e => (
                      <button key={e.key} className="bn-bar-row" onClick={() => e.total > 0 && irATabla({ edad: e.key })} disabled={e.total === 0}>
                        <span className="bn-bar-label">{e.label}</span>
                        <span className="bn-bar-track"><span className="bn-bar-fill" style={{ width: `${(e.total / maxEdad) * 100}%` }} /></span>
                        <span className="bn-bar-val">{e.total}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bn-card bn-panel">
                  <div className="bn-panel-head">
                    <div className="bn-panel-title">
                      <span className="bn-panel-ico bn-panel-ico--pink"><FiUsers size={16} /></span>
                      <div>
                      <h2>Distribución por Género</h2>
                      <p>Clic para ver la lista</p>
                    </div>
                    </div>
                  </div>
                  <div className="bn-gen-bar">
                    {generos.map(g => g.total > 0 && (
                      <span key={g.key} className={`bn-gen-seg bn-gen-seg--${g.key}`} style={{ width: `${(g.total / totalGeneros) * 100}%` }} />
                    ))}
                  </div>
                  <div className="bn-gen-list">
                    {generos.map(g => (
                      <button key={g.key} className="bn-gen-row" onClick={() => g.total > 0 && irATabla({ sexo: g.key })} disabled={g.total === 0}>
                        <span className={`bn-gen-dot bn-gen-dot--${g.key}`} />
                        <span className="bn-gen-info">
                          <span className="bn-gen-name">{g.label}</span>
                          <span className="bn-gen-sub">{g.ayudas} ayudas · {fmtMontoCorto(g.monto)}</span>
                        </span>
                        <span className="bn-gen-num">{g.total}<small>{Math.round((g.total / totalGeneros) * 100)}%</small></span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {/* ── TAB: BENEFICIARIOS ───────────────────────────── */}
        {tab === 'beneficiarios' && (
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

          {(filtroDepto || filtroEdad || filtroSexo) && (
            <div className="bn-filters">
              <span className="bn-filters-lbl">Filtrando por:</span>
              {filtroDepto && (
                <button className="bn-filter-chip" onClick={() => { setFiltroDepto(''); setPage(1); }}>
                  <FiMapPin size={12} /> {filtroDepto} <FiX size={12} />
                </button>
              )}
              {filtroEdad && (
                <button className="bn-filter-chip" onClick={() => { setFiltroEdad(''); setPage(1); }}>
                  Edad: {etiquetaEdad} <FiX size={12} />
                </button>
              )}
              {filtroSexo && (
                <button className="bn-filter-chip" onClick={() => { setFiltroSexo(''); setPage(1); }}>
                  Género: {etiquetaSexo} <FiX size={12} />
                </button>
              )}
              <button className="bn-filters-clear" onClick={limpiarFiltros}>Quitar todos</button>
            </div>
          )}

          {loading ? (
            <div className="bn-skeleton" aria-label="Cargando beneficiarios">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="bn-skeleton-row">
                  <span className="bn-sk bn-sk--avatar" />
                  <span className="bn-sk bn-sk--name" />
                  <span className="bn-sk bn-sk--pill" />
                  <span className="bn-sk bn-sk--pill" />
                  <span className="bn-sk bn-sk--short" />
                  <span className="bn-sk bn-sk--short" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="bn-state">
              <span className="bn-state-ico bn-state-ico--error"><FiAlertCircle size={28} /></span>
              <h3>No se pudo cargar el listado</h3>
              <p>Hubo un problema al conectar con el servidor. Intente de nuevo en unos segundos.</p>
              <button className="bn-btn bn-btn--primary" onClick={fetchData}><FiRefreshCw size={15} /> Reintentar</button>
            </div>
          ) : visibles.length === 0 ? (
            hayFiltros ? (
              <div className="bn-state">
                <span className="bn-state-ico"><FiSearch size={28} /></span>
                <h3>Sin resultados</h3>
                <p>Ningún beneficiario coincide con la búsqueda o los filtros aplicados.</p>
                <button className="bn-btn" onClick={() => { limpiarFiltros(); setBusqueda(''); }}><FiX size={15} /> Quitar filtros</button>
              </div>
            ) : (
              <div className="bn-state">
                <span className="bn-state-ico"><FiUsers size={28} /></span>
                <h3>Aún no hay beneficiarios</h3>
                <p>Se agregan automáticamente al registrar una ayuda social con el DNI del beneficiario. Aquí verá su teléfono, edad, cumpleaños y departamento.</p>
              </div>
            )
          ) : (
            <div className="bn-table-wrap">
              <table className="bn-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Departamento</th>
                    <th>Fecha nac.</th>
                    <th>Sexo</th>
                    <th>Edad</th>
                    <th>Cumpleaños</th>
                    <th className="bn-num">Ayudas</th>
                    <th className="bn-num">Monto total</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(r => (
                    <tr key={r.id}>
                      <td>
                        <div className="bn-person">
                          <span className="bn-avatar">{iniciales(r.nombre)}</span>
                          <span className="bn-name">{r.nombre}</span>
                        </div>
                      </td>
                      <td>
                        {r.telefono ? (
                          waLink(r.telefono) ? (
                            <a className="bn-wa" href={waLink(r.telefono)} target="_blank" rel="noopener noreferrer" title="Abrir en WhatsApp">
                              <FaWhatsapp size={14} /> {r.telefono}
                            </a>
                          ) : <span className="bn-tel"><FiPhone size={13} /> {r.telefono}</span>
                        ) : <span className="bn-muted">—</span>}
                      </td>
                      <td>
                        {r.departamento
                          ? <span className="bn-chip"><FiMapPin size={12} /> {r.departamento}</span>
                          : <span className="bn-muted">—</span>}
                      </td>
                      <td>{fmtFecha(r.fecha_nacimiento)}</td>
                      <td>
                        {r.sexo
                          ? <span className={`bn-sexo bn-sexo--${r.sexo}`}>{r.sexo === 'M' ? 'Hombre' : 'Mujer'}</span>
                          : <span className="bn-muted">—</span>}
                      </td>
                      <td>{r.edad !== null ? <span className="bn-edad">{r.edad} años</span> : <span className="bn-muted">—</span>}</td>
                      <td>
                        {r.cumple ? (
                          <span className={`bn-cumple${r.dias_para_cumple <= 30 ? ' bn-cumple--soon' : ''}`}>
                            {r.dias_para_cumple === 0 && <FiGift size={12} />}
                            {r.dias_para_cumple === 0 ? 'Hoy' : r.cumple}
                          </span>
                        ) : <span className="bn-muted">—</span>}
                      </td>
                      <td className="bn-num"><span className="bn-badge">{r.total_ayudas}</span></td>
                      <td className="bn-num bn-monto">{fmtMonto(r.monto_total)}</td>
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
        )}
      </div>
    </div>
  );
}
