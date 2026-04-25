import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiUser, FiMail,
  FiAlertCircle, FiCheckCircle, FiArrowLeft,
  FiShield, FiKey, FiSend, FiRefreshCw, FiLogIn,
} from 'react-icons/fi';
import api from '../api/axios';
import './ForgotPassword.css';

// ── Step indicators ────────────────────────────────────────────
const STEPS = [
  { num: 1, label: 'Verificar identidad' },
  { num: 2, label: 'Revisa tu correo'    },
];

function StepBar({ current }) {
  return (
    <div className="fp-stepbar">
      {STEPS.map((s, i) => (
        <div key={s.num} className="fp-step-item">
          <div className={`fp-step-circle ${current >= s.num ? 'done' : ''} ${current === s.num ? 'active' : ''}`}>
            {current > s.num ? <FiCheckCircle size={14} /> : s.num}
          </div>
          <span className={`fp-step-label ${current === s.num ? 'active' : ''}`}>{s.label}</span>
          {i < STEPS.length - 1 && (
            <div className={`fp-step-line ${current > s.num ? 'done' : ''}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [username,     setUsername]     = useState('');
  const [email,        setEmail]        = useState('');
  const [step1Err,     setStep1Err]     = useState('');
  const [step1Loading, setStep1Loading] = useState(false);
  const [step,         setStep]         = useState(1);
  const [resending,    setResending]    = useState(false);
  const [resendMsg,    setResendMsg]    = useState('');

  // ── Reenviar correo ────────────────────────────────────────────
  const handleResend = async () => {
    setResending(true);
    setResendMsg('');
    try {
      await api.post('/auth/forgot-password', { username, email });
      setResendMsg('¡Correo reenviado!');
    } catch {
      setResendMsg('No se pudo reenviar. Intenta de nuevo.');
    } finally {
      setResending(false);
    }
  };

  // ── Step 1: send reset email ───────────────────────────────────
  const handleVerify = async e => {
    e.preventDefault();
    setStep1Err('');
    setStep1Loading(true);
    try {
      await api.post('/auth/forgot-password', { username, email });
      setStep(2);
    } catch (err) {
      setStep1Err(err.response?.data?.message || 'Error al verificar identidad.');
    } finally {
      setStep1Loading(false);
    }
  };

  return (
    <div className="fp-bg">
      <div className="fp-left" />
      <div className="fp-right">
        <div className="fp-card">
          <div className="fp-card-accent" />

          {/* Header */}
          <div className="fp-header">
            <div className="fp-icon-ring">
              <FiKey size={26} strokeWidth={1.8} />
            </div>
            <span className="fp-system-badge">SCICN</span>
            <h1>Recuperar contraseña</h1>
            <span className="fp-subtitle">Sistema de Control Interno</span>
          </div>

          {/* Step bar */}
          <StepBar current={step} />

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <form className="fp-form" onSubmit={handleVerify} noValidate>
              <p className="fp-desc">
                Ingresa tu <strong>usuario</strong> y el <strong>correo</strong> asociado
                a tu cuenta. Te enviaremos un enlace para restablecer tu contraseña.
              </p>

              <div className="fp-field-group">
                <label htmlFor="fp-username">Usuario</label>
                <div className="fp-field-wrap">
                  <FiUser className="fp-field-icon" size={16} />
                  <input
                    id="fp-username"
                    type="text"
                    placeholder="Ingresa tu usuario"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    disabled={step1Loading}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="fp-field-group">
                <label htmlFor="fp-email">Correo electrónico</label>
                <div className="fp-field-wrap">
                  <FiMail className="fp-field-icon" size={16} />
                  <input
                    id="fp-email"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={step1Loading}
                    autoComplete="email"
                  />
                </div>
              </div>

              {step1Err && (
                <div className="fp-error-pill">
                  <FiAlertCircle size={15} />
                  <span>{step1Err}</span>
                </div>
              )}

              <button type="submit" className="fp-btn" disabled={step1Loading}>
                {step1Loading
                  ? <><span className="fp-spinner" /> Enviando…</>
                  : <><FiShield size={15} /> Enviar enlace de recuperación</>}
              </button>

              <div className="fp-back-row">
                <button type="button" className="fp-back-btn" onClick={() => navigate('/login')}>
                  <FiArrowLeft size={14} /> Volver al inicio de sesión
                </button>
              </div>
            </form>
          )}

          {/* ── STEP 2 – Check email ── */}
          {step === 2 && (
            <div className="fp-email-sent">
              {/* Icono animado */}
              <div className="fp-sent-icon">
                <FiSend size={34} />
              </div>

              <h2 className="fp-sent-title">¡Revisa tu correo!</h2>

              <div className="fp-sent-info">
                <p className="fp-sent-desc">
                  Enviamos un enlace a <strong>{email}</strong> para
                  restablecer tu contraseña.
                </p>
                <div className="fp-sent-badge">
                  <FiCheckCircle size={14} />
                  <span>El enlace expira en <strong>15 minutos</strong></span>
                </div>
              </div>

              {/* Botón principal */}
              <button className="fp-btn fp-btn--primary" onClick={() => navigate('/login')}>
                <FiLogIn size={16} /> Ir al inicio de sesión
              </button>

              {/* Reenviar */}
              <div className="fp-resend-row">
                <span>¿No llegó el correo?</span>
                <button
                  className="fp-resend-btn"
                  onClick={handleResend}
                  disabled={resending}
                >
                  {resending
                    ? <><span className="fp-spinner fp-spinner--sm" /> Reenviando…</>
                    : <><FiRefreshCw size={13} /> Reenviar correo</>}
                </button>
              </div>
              {resendMsg && (
                <span className={`fp-resend-msg ${
                  resendMsg.includes('!') ? 'ok' : 'ko'
                }`}>{resendMsg}</span>
              )}

              <p className="fp-sent-spam">
                Si no lo encuentras, revisa la carpeta de <strong>spam</strong> o correo no deseado.
              </p>
            </div>
          )}

          <footer className="fp-footer">
            © 2026 Sistema Control Interno · Todos los derechos reservados
          </footer>
        </div>
      </div>
    </div>
  );
}
