import { useEffect, useMemo, useState } from 'react';
import { FiSearch, FiX, FiSend, FiCheck, FiRotateCcw, FiAlertTriangle } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import './Diputados.css';
import './DifusionWhatsapp.css';

const WA_WINDOW = 'wa_difusion';

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

const norm = (s) =>
  (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Teléfono hondureño → 504XXXXXXXX (o null si no es válido)
function normalizarTelefono(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 8) return `504${digits}`;
  if (digits.length === 11 && digits.startsWith('504')) return digits;
  return null;
}

function titulo(s) {
  return (s || '')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
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
  const [modo, setModo]       = useState('difusion'); // 'individual' | 'difusion'
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

  const partidos = useMemo(
    () => [...new Set(datos.map((d) => (d.partido || '').trim()).filter(Boolean))].sort(),
    [datos]
  );
  const departamentos = useMemo(
    () => [...new Set(datos.map((d) => (d.departamento || '').trim()).filter(Boolean))].sort(),
    [datos]
  );

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
          (fPartido === 'ALL' || (d.partido || '').trim() === fPartido) &&
          (fDept === 'ALL' || (d.departamento || '').trim() === fDept) &&
          (fTipo === 'ALL' || d.tipo === fTipo)
      ),
    [datos, fPartido, fDept, fTipo]
  );

  const seleccionados = filtrados.filter((d) => !excluidos[d.id]);
  const conTelefono   = seleccionados.filter((d) => normalizarTelefono(d.telefono));
  const sinTelefono   = seleccionados.length - conTelefono.length;
  const enviados      = conTelefono.filter((d) => abiertos[d.id]).length;
  const siguiente     = conTelefono.find((d) => !abiertos[d.id]);

  const abrirChat = (d) => {
    const url = urlWhatsapp(d, mensaje);
    if (!url) return;
    window.open(url, WA_WINDOW);
    setAbiertos((prev) => ({ ...prev, [d.id]: true }));
  };

  const mensajeVacio = !mensaje.trim();

  return (
    <>
      <Navbar />
      <div className="page-content" style={{ maxWidth: 1100 }}>
        <div className="dip-page-header">
          <div>
            <h1>Mensajes por WhatsApp</h1>
            <p>Envío individual o de difusión a diputados activos mediante WhatsApp Web</p>
          </div>
        </div>

        {error && <div className="dif-alert dif-alert--error">{error}</div>}

        <div className="dif-tabs">
          <button
            className={`dif-tab${modo === 'individual' ? ' active' : ''}`}
            onClick={() => setModo('individual')}
          >
            Mensaje individual
          </button>
          <button
            className={`dif-tab${modo === 'difusion' ? ' active' : ''}`}
            onClick={() => setModo('difusion')}
          >
            Mensaje de difusión
          </button>
        </div>

        {/* ── Mensaje ── */}
        <div className="dif-card">
          <label className="dif-label">Mensaje</label>
          <textarea
            className="dif-textarea"
            rows={5}
            placeholder={
              modo === 'difusion'
                ? 'Escriba el mensaje. Puede usar {nombre}, {partido} y {departamento}.'
                : 'Escriba el mensaje. Puede usar {nombre}.'
            }
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
          />
          <p className="dif-hint">
            WhatsApp Web solo permite texto en el enlace. Si necesita adjuntar un archivo, hágalo a mano en el chat.
          </p>
        </div>

        {loading ? (
          <div className="dip-empty">Cargando diputados…</div>
        ) : modo === 'individual' ? (
          /* ───────────── INDIVIDUAL ───────────── */
          <div className="dif-card">
            <label className="dif-label">Destinatario</label>
            {elegido ? (
              <div className="dif-chosen">
                <div>
                  <strong>{elegido.nombre}</strong>
                  <div className="dif-sub">
                    {elegido.departamento} · {titulo(elegido.tipo)} · {elegido.partido || 'Sin partido'}
                  </div>
                  <div className="dif-sub">
                    {normalizarTelefono(elegido.telefono)
                      ? `+${normalizarTelefono(elegido.telefono)}`
                      : <span className="dif-bad"><FiAlertTriangle size={12} /> Sin teléfono válido ({elegido.telefono || 'vacío'})</span>}
                  </div>
                </div>
                <button className="dip-btn-secondary" onClick={() => { setElegido(null); setBusca(''); }}>
                  <FiX size={14} /> Cambiar
                </button>
              </div>
            ) : (
              <>
                <div className="dip-search-wrap" style={{ maxWidth: 'none' }}>
                  <FiSearch className="dip-search-icon" size={15} />
                  <input
                    className="dip-search"
                    placeholder="Buscar diputado por nombre, DNI, partido o departamento…"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
                {resultadosBusqueda.length > 0 && (
                  <ul className="dif-results">
                    {resultadosBusqueda.map((d) => (
                      <li key={d.id}>
                        <button onClick={() => setElegido(d)}>
                          <strong>{d.nombre}</strong>
                          <span>{d.departamento} · {d.partido || 'Sin partido'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            <div className="dif-actions">
              <button
                className="dip-btn-primary dif-wa-btn"
                disabled={!elegido || mensajeVacio || !normalizarTelefono(elegido?.telefono)}
                onClick={() => {
                  const url = urlWhatsapp(elegido, mensaje);
                  if (url) window.open(url, WA_WINDOW);
                }}
              >
                <FaWhatsapp size={17} /> Abrir WhatsApp Web
              </button>
            </div>
          </div>
        ) : (
          /* ───────────── DIFUSIÓN ───────────── */
          <>
            <div className="dif-card">
              <label className="dif-label">Destinatarios</label>
              <div className="dif-filters">
                <select className="dip-filter-select" value={fPartido}
                  onChange={(e) => { setFPartido(e.target.value); setAbiertos({}); }}>
                  <option value="ALL">Todos los partidos</option>
                  {partidos.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <select className="dip-filter-select" value={fDept}
                  onChange={(e) => { setFDept(e.target.value); setAbiertos({}); }}>
                  <option value="ALL">Todos los departamentos</option>
                  {departamentos.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <select className="dip-filter-select" value={fTipo}
                  onChange={(e) => { setFTipo(e.target.value); setAbiertos({}); }}>
                  <option value="ALL">Propietarios y suplentes</option>
                  <option value="PROPIETARIO">Solo propietarios</option>
                  <option value="SUPLENTE">Solo suplentes</option>
                </select>
              </div>

              <div className="dif-summary">
                <span><strong>{seleccionados.length}</strong> seleccionados</span>
                <span><strong>{conTelefono.length}</strong> con teléfono válido</span>
                {sinTelefono > 0 && (
                  <span className="dif-bad"><FiAlertTriangle size={12} /> {sinTelefono} sin teléfono válido (se omiten)</span>
                )}
                <span><strong>{enviados}</strong> de {conTelefono.length} abiertos</span>
              </div>

              <div className="dif-actions">
                <button
                  className="dip-btn-primary dif-wa-btn"
                  disabled={!siguiente || mensajeVacio}
                  onClick={() => siguiente && abrirChat(siguiente)}
                >
                  <FaWhatsapp size={17} />
                  {enviados === 0 ? 'Abrir WhatsApp Web' : 'Siguiente chat'}
                  {siguiente && <small> — {titulo(siguiente.nombre)}</small>}
                </button>
                {enviados > 0 && (
                  <button className="dip-btn-secondary" onClick={() => setAbiertos({})}>
                    <FiRotateCcw size={14} /> Reiniciar cola
                  </button>
                )}
              </div>
              {conTelefono.length > 0 && !siguiente && (
                <div className="dif-alert dif-alert--ok">Se recorrieron todos los destinatarios.</div>
              )}
              <p className="dif-hint">
                Se abre un chat a la vez en la pestaña de WhatsApp Web: envíe el mensaje, vuelva aquí y pulse
                «Siguiente chat». La primera vez inicie sesión en WhatsApp Web con su celular.
              </p>
            </div>

            <div className="dip-table-wrap" style={{ overflowX: 'auto' }}>
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
                    {filtrados.map((d) => {
                      const tel = normalizarTelefono(d.telefono);
                      const incluido = !excluidos[d.id];
                      return (
                        <tr key={d.id} className={!incluido ? 'dip-row-inactive' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={incluido}
                              onChange={() => setExcluidos((p) => ({ ...p, [d.id]: incluido }))}
                            />
                          </td>
                          <td><strong>{d.nombre}</strong></td>
                          <td>{d.departamento}</td>
                          <td>{d.partido || '—'}</td>
                          <td>
                            {tel ? `+${tel}` : <span className="dif-bad">{d.telefono || 'Sin teléfono'}</span>}
                          </td>
                          <td>
                            {!tel ? <span className="dif-pill dif-pill--bad">Inválido</span>
                              : abiertos[d.id] ? <span className="dif-pill dif-pill--ok"><FiCheck size={11} /> Abierto</span>
                              : <span className="dif-pill">Pendiente</span>}
                          </td>
                          <td>
                            <button
                              className="dip-btn-secondary dif-row-btn"
                              disabled={!tel || mensajeVacio}
                              onClick={() => abrirChat(d)}
                              title="Abrir este chat"
                            >
                              <FiSend size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
