import { useEffect, useMemo, useState } from 'react';
import {
  FiSearch, FiX, FiCheck, FiRotateCcw, FiAlertTriangle,
  FiUser, FiUsers, FiSend, FiPhone,
} from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import './Diputados.css';
import './DifusionWhatsapp.css';

const WA_WINDOW = 'wa_difusion';
const VARIABLES = ['{nombre}', '{partido}', '{departamento}'];

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

const norm = (s) =>
  (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const clave = (s) => norm(s).replace(/\s+/g, ' ').trim();

// Teléfono hondureño → 504XXXXXXXX (o null si no es válido)
function normalizarTelefono(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 8) return `504${digits}`;
  if (digits.length === 11 && digits.startsWith('504')) return digits;
  return null;
}

function titulo(s) {
  return (s || '').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function iniciales(nombre) {
  return (nombre || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function armarMensaje(plantilla, d) {
  return plantilla
    .replace(/\{nombre\}/gi, titulo(d.nombre))
    .replace(/\{partido\}/gi, titulo(d.partido))
    .replace(/\{departamento\}/gi, titulo(d.departamento));
}

function urlWhatsapp(d, plantilla) {
  const tel = normalizarTelefono(d.telefono);
  if (!tel) return null;
  return `https://web.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(armarMensaje(plantilla, d))}`;
}

export default function DifusionWhatsapp() {
  const [datos, setDatos]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [modo, setModo]       = useState('individual'); // 'individual' | 'difusion'
  const [mensaje, setMensaje] = useState('');

  // individual
  const [busca, setBusca]     = useState('');
  const [elegido, setElegido] = useState(null);

  // difusión
  const [fPartido, setFPartido] = useState('ALL');
  const [fDept, setFDept]       = useState('ALL');
  const [fTipo, setFTipo]       = useState('ALL');
  const [excluidos, setExcluidos] = useState({}); // id → true
  const [abiertos, setAbiertos]   = useState({}); // id → true
  const [pagina, setPagina]       = useState(1);
  const PAGE_SIZE = 30;

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/diputados', { headers: authHeaders() });
        setDatos(res.data.filter((d) => d.activo));
      } catch {
        setError('Error al cargar los diputados. Intente de nuevo.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Agrupa variantes del mismo texto (mayúsculas, tildes, espacios de más)
  const opciones = (campo) => {
    const mapa = new Map();
    datos.forEach((d) => {
      const texto = (d[campo] || '').trim();
      const k = clave(texto);
      if (!k) return;
      const actual = mapa.get(k);
      if (!actual || (texto === texto.toUpperCase() && actual !== actual.toUpperCase())) mapa.set(k, texto);
    });
    return [...mapa.entries()]
      .map(([k, label]) => ({ k, label: label.toUpperCase() }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  };
  const partidos = useMemo(() => opciones('partido'), [datos]); // eslint-disable-line react-hooks/exhaustive-deps
  const departamentos = useMemo(() => opciones('departamento'), [datos]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Individual ───────────────────────────────────────────
  const resultadosBusqueda = useMemo(() => {
    const palabras = norm(busca).split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    return datos
      .filter((d) => {
        const texto = norm(`${d.nombre} ${d.identidad} ${d.partido} ${d.departamento}`);
        return palabras.every((p) => texto.includes(p));
      })
      .slice(0, 8);
  }, [busca, datos]);

  // ── Difusión ─────────────────────────────────────────────
  const filtrados = useMemo(
    () =>
      datos.filter(
        (d) =>
          (fPartido === 'ALL' || clave(d.partido) === fPartido) &&
          (fDept === 'ALL' || clave(d.departamento) === fDept) &&
          (fTipo === 'ALL' || d.tipo === fTipo)
      ),
    [datos, fPartido, fDept, fTipo]
  );

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const safePage   = Math.min(pagina, totalPages);
  const paginados  = filtrados.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const seleccionados = filtrados.filter((d) => !excluidos[d.id]);
  const conTelefono   = seleccionados.filter((d) => normalizarTelefono(d.telefono));
  const sinTelefono   = seleccionados.length - conTelefono.length;
  const enviados      = conTelefono.filter((d) => abiertos[d.id]).length;
  const siguiente     = conTelefono.find((d) => !abiertos[d.id]);
  const progreso      = conTelefono.length ? Math.round((enviados / conTelefono.length) * 100) : 0;

  const abrirChat = (d) => {
    const url = urlWhatsapp(d, mensaje);
    if (!url) return;
    window.open(url, WA_WINDOW);
    setAbiertos((prev) => ({ ...prev, [d.id]: true }));
  };

  const mensajeVacio = !mensaje.trim();
  const insertarVariable = (v) =>
    setMensaje((m) => (m && !/\s$/.test(m) ? `${m} ${v}` : `${m}${v}`));

  // Destinatario que se usa para la vista previa
  const ejemplo = modo === 'individual' ? elegido : (siguiente || conTelefono[0] || seleccionados[0] || null);
  const textoPrevio = mensajeVacio
    ? ''
    : ejemplo ? armarMensaje(mensaje, ejemplo) : mensaje;
  const hora = new Date().toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });

  const telElegido = elegido ? normalizarTelefono(elegido.telefono) : null;

  return (
    <>
      <Navbar />
      <div className="page-content" style={{ maxWidth: 1200 }}>

        {/* ── Banner ── */}
        <div className="dif-hero">
          <div className="dif-hero-icon"><FaWhatsapp size={30} /></div>
          <div className="dif-hero-text">
            <h1>Mensajes por WhatsApp</h1>
            <p>Escriba a un diputado o envíe una difusión por partido o departamento usando WhatsApp Web.</p>
          </div>
          <div className="dif-hero-stats">
            <div><strong>{datos.length}</strong><span>Diputados activos</span></div>
            <div><strong>{datos.filter((d) => normalizarTelefono(d.telefono)).length}</strong><span>Con teléfono válido</span></div>
          </div>
        </div>

        {error && <div className="dif-alert dif-alert--error">{error}</div>}

        {/* ── Selector de modo ── */}
        <div className="dif-modes">
          <button className={`dif-mode${modo === 'individual' ? ' active' : ''}`} onClick={() => setModo('individual')}>
            <span className="dif-mode-icon"><FiUser size={18} /></span>
            <span><strong>Mensaje individual</strong><small>A un solo diputado</small></span>
          </button>
          <button className={`dif-mode${modo === 'difusion' ? ' active' : ''}`} onClick={() => setModo('difusion')}>
            <span className="dif-mode-icon"><FiUsers size={18} /></span>
            <span><strong>Mensaje de difusión</strong><small>Por partido, departamento o tipo</small></span>
          </button>
        </div>

        {loading ? (
          <div className="dip-empty">Cargando diputados…</div>
        ) : (
          <div className="dif-layout">
            {/* ─────────── Columna izquierda ─────────── */}
            <div className="dif-main">

              {/* Paso 1 — Destinatarios */}
              <section className="dif-card">
                <h2 className="dif-step"><span>1</span>{modo === 'individual' ? 'Destinatario' : 'Destinatarios'}</h2>

                {modo === 'individual' ? (
                  elegido ? (
                    <div className="dif-chosen">
                      <div className="dif-avatar">{iniciales(elegido.nombre)}</div>
                      <div className="dif-chosen-info">
                        <strong>{elegido.nombre}</strong>
                        <div className="dif-sub">
                          {elegido.departamento} · {titulo(elegido.tipo)} · {elegido.partido || 'Sin partido'}
                        </div>
                        <div className="dif-sub">
                          {telElegido
                            ? <><FiPhone size={12} /> +{telElegido}</>
                            : <span className="dif-bad"><FiAlertTriangle size={12} /> Sin teléfono válido ({elegido.telefono || 'vacío'})</span>}
                        </div>
                      </div>
                      <button className="dif-icon-btn" onClick={() => { setElegido(null); setBusca(''); }} title="Cambiar">
                        <FiX size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="dif-search">
                        <FiSearch size={16} />
                        <input
                          placeholder="Buscar diputado por nombre, DNI, partido o departamento…"
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                          autoFocus
                        />
                      </div>
                      {resultadosBusqueda.length > 0 && (
                        <ul className="dif-results">
                          {resultadosBusqueda.map((d) => (
                            <li key={d.id}>
                              <button onClick={() => setElegido(d)}>
                                <span className="dif-avatar dif-avatar--sm">{iniciales(d.nombre)}</span>
                                <span className="dif-result-text">
                                  <strong>{d.nombre}</strong>
                                  <span>{d.departamento} · {d.partido || 'Sin partido'}</span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {busca.trim() && resultadosBusqueda.length === 0 && (
                        <p className="dif-hint">No se encontró ningún diputado activo con esa búsqueda.</p>
                      )}
                    </>
                  )
                ) : (
                  <>
                    <div className="dif-filters">
                      <label className="dif-field">
                        <span>Partido</span>
                        <select value={fPartido} onChange={(e) => { setFPartido(e.target.value); setAbiertos({}); setPagina(1); }}>
                          <option value="ALL">Todos los partidos</option>
                          {partidos.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
                        </select>
                      </label>
                      <label className="dif-field">
                        <span>Departamento</span>
                        <select value={fDept} onChange={(e) => { setFDept(e.target.value); setAbiertos({}); setPagina(1); }}>
                          <option value="ALL">Todos los departamentos</option>
                          {departamentos.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
                        </select>
                      </label>
                      <label className="dif-field">
                        <span>Tipo</span>
                        <select value={fTipo} onChange={(e) => { setFTipo(e.target.value); setAbiertos({}); setPagina(1); }}>
                          <option value="ALL">Propietarios y suplentes</option>
                          <option value="PROPIETARIO">Solo propietarios</option>
                          <option value="SUPLENTE">Solo suplentes</option>
                        </select>
                      </label>
                    </div>

                    <div className="dif-tiles">
                      <div className="dif-tile"><strong>{seleccionados.length}</strong><span>Seleccionados</span></div>
                      <div className="dif-tile dif-tile--ok"><strong>{conTelefono.length}</strong><span>Con teléfono válido</span></div>
                      <div className={`dif-tile${sinTelefono ? ' dif-tile--bad' : ''}`}><strong>{sinTelefono}</strong><span>Se omiten (sin teléfono)</span></div>
                    </div>
                  </>
                )}
              </section>

              {/* Paso 2 — Mensaje */}
              <section className="dif-card">
                <h2 className="dif-step"><span>2</span>Mensaje</h2>
                <textarea
                  className="dif-textarea"
                  rows={6}
                  maxLength={1000}
                  placeholder="Escriba el mensaje que desea enviar…"
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                />
                <div className="dif-textarea-foot">
                  <div className="dif-vars">
                    <span>Insertar:</span>
                    {VARIABLES.map((v) => (
                      <button key={v} type="button" className="dif-chip" onClick={() => insertarVariable(v)}>{v}</button>
                    ))}
                  </div>
                  <span className="dif-count">{mensaje.length}/1000</span>
                </div>
                <p className="dif-hint">
                  Las variables se reemplazan con los datos de cada diputado. WhatsApp Web solo permite texto en el enlace;
                  para adjuntar un archivo, hágalo a mano en el chat.
                </p>
              </section>
            </div>

            {/* ─────────── Columna derecha: vista previa y envío ─────────── */}
            <aside className="dif-side">
              <section className="dif-card dif-preview-card">
                <h2 className="dif-step"><span>3</span>Vista previa y envío</h2>

                <div className="dif-phone">
                  <div className="dif-phone-top">
                    <div className="dif-avatar dif-avatar--sm">{ejemplo ? iniciales(ejemplo.nombre) : <FiUser size={14} />}</div>
                    <div>
                      <strong>{ejemplo ? titulo(ejemplo.nombre) : 'Destinatario'}</strong>
                      <small>{ejemplo && normalizarTelefono(ejemplo.telefono) ? `+${normalizarTelefono(ejemplo.telefono)}` : 'WhatsApp'}</small>
                    </div>
                  </div>
                  <div className="dif-phone-body">
                    {textoPrevio ? (
                      <div className="dif-bubble">
                        <p>{textoPrevio}</p>
                        <span>{hora} <FiCheck size={11} /></span>
                      </div>
                    ) : (
                      <div className="dif-bubble-empty">Aquí verá cómo queda su mensaje</div>
                    )}
                  </div>
                </div>

                {modo === 'individual' ? (
                  <button
                    className="dif-send"
                    disabled={!elegido || mensajeVacio || !telElegido}
                    onClick={() => { const url = urlWhatsapp(elegido, mensaje); if (url) window.open(url, WA_WINDOW); }}
                  >
                    <FaWhatsapp size={19} /> Abrir WhatsApp Web
                  </button>
                ) : (
                  <>
                    <div className="dif-progress">
                      <div className="dif-progress-head">
                        <span>Progreso</span>
                        <strong>{enviados} de {conTelefono.length}</strong>
                      </div>
                      <div className="dif-bar"><div style={{ width: `${progreso}%` }} /></div>
                    </div>
                    <button
                      className="dif-send"
                      disabled={!siguiente || mensajeVacio}
                      onClick={() => siguiente && abrirChat(siguiente)}
                    >
                      <FaWhatsapp size={19} />
                      {enviados === 0 ? 'Abrir WhatsApp Web' : 'Siguiente chat'}
                    </button>
                    {siguiente && <p className="dif-next">Siguiente: <strong>{titulo(siguiente.nombre)}</strong></p>}
                    {enviados > 0 && (
                      <button className="dif-reset" onClick={() => setAbiertos({})}>
                        <FiRotateCcw size={13} /> Reiniciar cola
                      </button>
                    )}
                    {conTelefono.length > 0 && !siguiente && (
                      <div className="dif-alert dif-alert--ok">Se recorrieron todos los destinatarios.</div>
                    )}
                    <p className="dif-hint">
                      Envíe el mensaje en WhatsApp, vuelva aquí y pulse «Siguiente chat». La primera vez inicie sesión
                      en WhatsApp Web con su celular.
                    </p>
                  </>
                )}
                {mensajeVacio && <p className="dif-hint dif-hint--warn">Escriba un mensaje para habilitar el envío.</p>}
              </section>
            </aside>
          </div>
        )}

        {/* ── Tabla de difusión ── */}
        {!loading && modo === 'difusion' && (
          <div className="dif-card dif-table-card">
            <h2 className="dif-step dif-step--plain">Lista de destinatarios <small>({filtrados.length})</small></h2>
            <div style={{ overflowX: 'auto' }}>
              {filtrados.length === 0 ? (
                <div className="dip-empty">No hay diputados con esos filtros.</div>
              ) : (
                <table className="dip-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}></th>
                      <th>Nombre</th>
                      <th>Departamento</th>
                      <th>Partido</th>
                      <th>Teléfono</th>
                      <th>Estado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginados.map((d) => {
                      const tel = normalizarTelefono(d.telefono);
                      const incluido = !excluidos[d.id];
                      return (
                        <tr key={d.id} className={!incluido ? 'dip-row-inactive' : ''}>
                          <td>
                            <input type="checkbox" checked={incluido}
                              onChange={() => setExcluidos((p) => ({ ...p, [d.id]: incluido }))} />
                          </td>
                          <td><strong>{d.nombre}</strong></td>
                          <td>{d.departamento}</td>
                          <td>{d.partido || '—'}</td>
                          <td>{tel ? `+${tel}` : <span className="dif-bad">{d.telefono || 'Sin teléfono'}</span>}</td>
                          <td>
                            {!tel ? <span className="dif-pill dif-pill--bad">Inválido</span>
                              : abiertos[d.id] ? <span className="dif-pill dif-pill--ok"><FiCheck size={11} /> Abierto</span>
                              : <span className="dif-pill">Pendiente</span>}
                          </td>
                          <td>
                            <button className="dif-icon-btn" disabled={!tel || mensajeVacio} onClick={() => abrirChat(d)} title="Abrir este chat">
                              <FiSend size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {filtrados.length > PAGE_SIZE && (
              <div className="std-pg" style={{ marginTop: 14 }}>
                <span className="std-pg-info">
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtrados.length)} de <strong>{filtrados.length}</strong>
                </span>
                <div className="std-pg-controls">
                  <button className="std-pg-btn" disabled={safePage === 1} onClick={() => setPagina(1)}>«</button>
                  <button className="std-pg-btn" disabled={safePage === 1} onClick={() => setPagina(safePage - 1)}>‹</button>
                  {(() => {
                    const maxBtns = 7;
                    let start = Math.max(1, safePage - Math.floor(maxBtns / 2));
                    let end   = Math.min(totalPages, start + maxBtns - 1);
                    if (end - start < maxBtns - 1) start = Math.max(1, end - maxBtns + 1);
                    const nums = [];
                    if (start > 1) {
                      nums.push(<button key={1} className="std-pg-btn std-pg-num" onClick={() => setPagina(1)}>1</button>);
                      if (start > 2) nums.push(<span key="el" className="std-pg-ellipsis">…</span>);
                    }
                    for (let p = start; p <= end; p++) {
                      nums.push(
                        <button key={p} className={`std-pg-btn std-pg-num${safePage === p ? ' std-pg-num--active' : ''}`} onClick={() => setPagina(p)}>{p}</button>
                      );
                    }
                    if (end < totalPages) {
                      if (end < totalPages - 1) nums.push(<span key="er" className="std-pg-ellipsis">…</span>);
                      nums.push(<button key={totalPages} className="std-pg-btn std-pg-num" onClick={() => setPagina(totalPages)}>{totalPages}</button>);
                    }
                    return nums;
                  })()}
                  <button className="std-pg-btn" disabled={safePage >= totalPages} onClick={() => setPagina(safePage + 1)}>›</button>
                  <button className="std-pg-btn" disabled={safePage >= totalPages} onClick={() => setPagina(totalPages)}>»</button>
                </div>
                <span className="std-pg-total">Pág. <strong>{safePage}</strong> / {totalPages}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
