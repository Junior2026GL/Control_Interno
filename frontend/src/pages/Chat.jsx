import { useState, useRef, useEffect } from 'react';
import { FiSend, FiMic, FiMicOff, FiVolume2, FiVolumeX, FiTrash2, FiHeadphones } from 'react-icons/fi';
import { RiRobot2Line } from 'react-icons/ri';
import Navbar from '../components/Navbar';
import api from '../api/axios';
import './Chat.css';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const fmtHora = ts => new Date(ts).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });

function renderMarkdown(text) {
  return text.split('\n').map((line, i, arr) => {
    const parts = line.split(/\*\*(.+?)\*\*/g);
    return (
      <span key={i}>
        {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
        {i < arr.length - 1 && <br />}
      </span>
    );
  });
}

const SUGERENCIAS = [
  'Ayudas sin liquidar',
  'Resumen del presupuesto',
  '¿Qué diputado tiene más disponible?',
  'Ayudas registradas hoy',
  'Total ejecutado este año',
];

const BIENVENIDA = {
  id: 0,
  rol: 'assistant',
  ts: Date.now(),
  contenido: '¡Hola! Soy el asistente del módulo de Presupuesto Social 📊\n\nPuedo ayudarte con información precisa sobre:\n• Presupuesto asignado, ejecutado y disponible por diputado\n• Registro de ayudas: beneficiario, monto, número de orden y cheque\n• Estado de liquidación: sin liquidar, en proceso, liquidadas\n• Búsquedas por beneficiario, diputado o número de cheque\n• Totales, resúmenes y cálculos en tiempo real\n\n¿Qué deseas consultar?',
};

export default function Chat() {
  const [mensajes, setMensajes]                     = useState([BIENVENIDA]);
  const [input, setInput]                            = useState('');
  const [cargando, setCargando]                      = useState(false);
  const [escuchando, setEscuchando]                  = useState(false);
  const [reproduciendo, setReproduciendo]            = useState(null);
  const [mostrarSugerencias, setMostrarSugerencias]  = useState(true);
  const [modoVoz, setModoVoz]                        = useState(false);
  const modoVozRef                                   = useRef(false);

  const messagesEndRef   = useRef(null);
  const reconocimientoRef = useRef(null);
  const audioRef         = useRef(null);
  const inputRef         = useRef(null);
  const enviarRef        = useRef(null);
  const activarMicRef    = useRef(null);
  const reproducirVozRef = useRef(null);
  const lastAutoPlayId   = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, cargando]);

  // ── Auto-play TTS cuando llega respuesta en Modo Voz ────────────────────
  useEffect(() => {
    if (!modoVozRef.current) return;
    const asistente = mensajes.filter(m => m.rol === 'assistant' && m.id !== 0);
    if (!asistente.length) return;
    const ultimo = asistente[asistente.length - 1];
    if (ultimo.id === lastAutoPlayId.current) return;
    lastAutoPlayId.current = ultimo.id;
    reproducirVozRef.current?.(ultimo.id, ultimo.contenido, true);
  }, [mensajes]);

  // ── Enviar mensaje ──────────────────────────────────────────────────────────
  const enviar = async (textoDirecto) => {
    const msg = (textoDirecto ?? input).trim();
    if (!msg || cargando) return;

    setInput('');
    setMostrarSugerencias(false);
    const historial = mensajes.map(m => ({ rol: m.rol, contenido: m.contenido }));
    setMensajes(prev => [...prev, { id: Date.now(), ts: Date.now(), rol: 'user', contenido: msg }]);
    setCargando(true);

    try {
      const { data } = await api.post('/chat/message', { mensaje: msg, historial }, { headers: authHeader() });
      setMensajes(prev => [...prev, { id: Date.now(), ts: Date.now(), rol: 'assistant', contenido: data.respuesta }]);
    } catch {
      setMensajes(prev => [...prev, { id: Date.now(), ts: Date.now(), rol: 'assistant', contenido: 'Hubo un error al procesar tu consulta. Por favor intenta de nuevo.' }]);
    } finally {
      setCargando(false);
      if (!modoVozRef.current) setTimeout(() => inputRef.current?.focus(), 100);
    }
  };
  enviarRef.current = enviar;

  // ── Activar micrófono (reutilizable desde Modo Voz y manual) ───────────────
  const activarMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || cargando) return;
    const rec = new SR();
    rec.lang = 'es-GT';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    reconocimientoRef.current = rec;
    rec.onstart  = () => setEscuchando(true);
    rec.onresult = e => {
      const texto = e.results[0][0].transcript;
      setEscuchando(false);
      if (modoVozRef.current) {
        enviarRef.current?.(texto);
      } else {
        setInput(prev => prev ? prev + ' ' + texto : texto);
      }
    };
    rec.onerror = () => setEscuchando(false);
    rec.onend   = () => setEscuchando(false);
    rec.start();
  };
  activarMicRef.current = activarMic;

  // ── Toggle micrófono manual ───────────────────────────────────────────
  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.'); return; }
    if (escuchando) { reconocimientoRef.current?.stop(); setEscuchando(false); return; }
    activarMic();
  };

  // ── Text-to-Speech con soporte Modo Voz (ElevenLabs) ────────────────────
  const reproducirVoz = async (id, texto, autoPlay = false) => {
    if (!autoPlay && reproduciendo === id) { audioRef.current?.pause(); setReproduciendo(null); return; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setReproduciendo(id);
    try {
      const textoTTS = autoPlay ? texto.slice(0, 700) : texto;
      const response = await api.post('/chat/tts', { texto: textoTTS }, { responseType: 'blob', headers: authHeader() });
      const url = URL.createObjectURL(response.data);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play();
      audio.onended = () => {
        setReproduciendo(null);
        URL.revokeObjectURL(url);
        if (modoVozRef.current) setTimeout(() => activarMicRef.current?.(), 700);
      };
    } catch { setReproduciendo(null); }
  };
  reproducirVozRef.current = reproducirVoz;

  // ── Toggle Modo Voz ────────────────────────────────────────────────
  const toggleModoVoz = () => {
    const nuevo = !modoVozRef.current;
    modoVozRef.current = nuevo;
    setModoVoz(nuevo);
    if (!nuevo) {
      reconocimientoRef.current?.stop();
      audioRef.current?.pause();
      setEscuchando(false);
      setReproduciendo(null);
    }
  };

  // ── Limpiar chat ────────────────────────────────────────────
  const limpiarChat = () => {
    audioRef.current?.pause();
    reconocimientoRef.current?.stop();
    modoVozRef.current = false;
    setModoVoz(false);
    setEscuchando(false);
    setReproduciendo(null);
    setMensajes([BIENVENIDA]);
    setMostrarSugerencias(true);
  };

  return (
    <div className="page-shell">
      <Navbar />
      <div className="chat-wrapper">

        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-left">
            <div className="chat-avatar-icon"><RiRobot2Line size={24} /></div>
            <div>
              <h2 className="chat-title">Presupuesto Social IA</h2>
              <div className="chat-status">
                <span className="status-dot" />
                <p className="chat-subtitle">En línea · datos en tiempo real</p>
              </div>
            </div>
          </div>
          <div className="chat-header-actions">
            <button className={`voice-mode-btn ${modoVoz ? 'active' : ''}`} onClick={toggleModoVoz}
              title={modoVoz ? 'Desactivar Modo Voz' : 'Activar Modo Voz — respuestas en audio automático'}>
              <FiHeadphones size={16} />
              <span>{modoVoz ? 'Voz ON' : 'Modo Voz'}</span>
            </button>
            <button className="chat-clear-btn" onClick={limpiarChat} title="Limpiar conversación">
              <FiTrash2 size={16} /><span>Limpiar</span>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {mensajes.map(m => (
            <div key={m.id} className={`chat-row ${m.rol}`}>
              {m.rol === 'assistant' && <div className="chat-bot-avatar"><RiRobot2Line size={16} /></div>}
              <div className={`chat-bubble ${m.rol}`}>
                <p className="bubble-text">{m.rol === 'assistant' ? renderMarkdown(m.contenido) : m.contenido}</p>
                <div className="bubble-footer">
                  <span className="bubble-time">{fmtHora(m.ts)}</span>
                  {m.rol === 'assistant' && (
                    <button className={`tts-btn ${reproduciendo === m.id ? 'active' : ''}`}
                      onClick={() => reproducirVoz(m.id, m.contenido)}
                      title={reproduciendo === m.id ? 'Detener' : 'Escuchar respuesta'}>
                      {reproduciendo === m.id ? <FiVolumeX size={12} /> : <FiVolume2 size={12} />}
                    </button>
                  )}
                </div>
                {m.id === 0 && mostrarSugerencias && (
                  <div className="sugerencias">
                    {SUGERENCIAS.map(s => (
                      <button key={s} className="chip" onClick={() => enviar(s)}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {cargando && (
            <div className="chat-row assistant">
              <div className="chat-bot-avatar"><RiRobot2Line size={16} /></div>
              <div className="chat-bubble assistant typing-bubble">
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          {(escuchando || (modoVoz && !cargando)) && (
            <div className={`listening-bar ${modoVoz ? 'voice-mode-bar' : ''}`}>
              <span className="listening-dot" />
              {modoVoz
                ? escuchando    ? 'Escuchando… habla ahora'
                : reproduciendo ? 'Reproduciendo respuesta…'
                                : 'Modo Voz activo — presiona 🎤 para hablar'
                : 'Escuchando...'}
            </div>
          )}
          <div className="chat-input-row">
            <button className={`mic-btn ${escuchando ? 'active' : ''}`} onClick={toggleMic}
              title={escuchando ? 'Detener grabación' : 'Hablar por voz'}>
              {escuchando ? <FiMicOff size={19} /> : <FiMic size={19} />}
            </button>
            <textarea ref={inputRef} className="chat-input"
              placeholder="Consulta sobre presupuesto, ayudas, liquidaciones… (Enter para enviar)"
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
              rows={1} disabled={cargando} />
            <button className="send-btn" onClick={() => enviar()} disabled={!input.trim() || cargando} title="Enviar">
              <FiSend size={19} />
            </button>
          </div>
          <p className="chat-hint">Shift+Enter para nueva línea · Enter para enviar</p>
        </div>

      </div>
    </div>
  );
}
