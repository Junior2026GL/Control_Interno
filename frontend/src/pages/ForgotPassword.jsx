import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiUser, FiMail, FiLock, FiEye, FiEyeOff,
  FiAlertCircle, FiCheckCircle, FiArrowLeft,
  FiShield, FiKey,
} from 'react-icons/fi';
import api from '../api/axios';
import './ForgotPassword.css';

// ── Step indicators ────────────────────────────────────────────
const STEPS = [
  { num: 1, label: 'Verificar identidad' },
  { num: 2, label: 'Nueva contraseña'    },
  { num: 3, label: 'Completado'          },
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

// ── Password strength ──────────────────────────────────────────
function getStrength(pwd) {
  if (!pwd) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { score, label: 'Muy débil',  color: '#ef4444' };
  if (score === 2) return { score, label: 'Débil',      color: '#f97316' };
  if (score === 3) return { score, label: 'Regular',    color: '#eab308' };
  if (score === 4) return { score, label: 'Fuerte',     color: '#22c55e' };
  return              { score, label: 'Muy fuerte',  color: '#16a34a' };
}

export default function ForgotPassword() {
  const navigate = useNavigate();

  // Step 1 state
  const [username, setUsername] = useState('');
  const [email,    setEmail]    = useState('');
  const [step1Err, setStep1Err] = useState('');
  const [step1Loading, setStep1Loading] = useState(false);

  // Step 2 state
  const [resetToken,    setResetToken]    = useState('');
  const [userName,      setUserName]      = useState('');
  const [newPass,       setNewPass]       = useState('');
  const [confirmPass,   setConfirmPass]   = useState('');
  const [showNew,       setShowNew]       = useState(false);
  const [showConfirm,   setShowConfirm]   = useState(false);
  const [step2Err,      setStep2Err]      = useState('');
  const [step2Loading,  setStep2Loading]  = useState(false);

  // Step tracking
  const [step, setStep] = useState(1);

  const strength = getStrength(newPass);

  // ── Step 1: verify identity ───────────────────────────────────
  const handleVerify = async e => {
    e.preventDefault();
    setStep1Err('');
    setStep1Loading(true);
    try {
      const res = await api.post('/auth/forgot-password', { username, email });
      setResetToken(res.data.resetToken);
      setUserName(res.data.nombre);
      setStep(2);
    } catch (err) {
      setStep1Err(err.response?.data?.message || 'Error al verificar identidad.');
    } finally {
      setStep1Loading(false);
    }
  };

  // ── Step 2: reset password ────────────────────────────────────
  const handleReset = async e => {
    e.preventDefault();
    setStep2Err('');
    if (newPass !== confirmPass) {
      setStep2Err('Las contraseñas no coinciden.');
      return;
    }
    if (newPass.length < 8) {
      setStep2Err('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setStep2Loading(true);
    try {
      await api.post('/auth/reset-password', { resetToken, newPassword: newPass });
      setStep(3);
    } catch (err) {
      setStep2Err(err.response?.data?.message || 'Error al restablecer la contraseña.');
    } finally {
      setStep2Loading(false);
    }
  };

  return (
    <div className="fp-bg">
      <div className="blob blob-1" />
      <div className="blob blob-2" />

      <div className="fp-card">
        <div className="fp-card-accent" />

        {/* Header */}
        <div className="fp-header">
          <div className="fp-icon-ring">
            <FiKey size={26} strokeWidth={1.8} />
          </div>
          <h1>Recuperar contraseña</h1>
          <span className="fp-subtitle">Sistema de Control Interno</span>
        </div>

        {/* Step bar */}
        {step < 3 && <StepBar current={step} />}

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <form className="fp-form" onSubmit={handleVerify} noValidate>
            <p className="fp-desc">
              Ingresa tu <strong>usuario</strong> y el <strong>correo</strong> asociado
              a tu cuenta para verificar tu identidad.
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
                ? <><span className="fp-spinner" /> Verificando…</>
                : <><FiShield size={15} /> Verificar identidad</>}
            </button>

            <div className="fp-back-row">
              <button type="button" className="fp-back-btn" onClick={() => navigate('/login')}>
                <FiArrowLeft size={14} /> Volver al inicio de sesión
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <form className="fp-form" onSubmit={handleReset} noValidate>
            <div className="fp-welcome-pill">
              <FiCheckCircle size={15} />
              <span>Identidad verificada · Hola, <strong>{userName}</strong></span>
            </div>
            <p className="fp-desc">
              Crea una nueva contraseña segura para tu cuenta.
            </p>

            <div className="fp-field-group">
              <label htmlFor="fp-newpass">Nueva contraseña</label>
              <div className="fp-field-wrap">
                <FiLock className="fp-field-icon" size={16} />
                <input
                  id="fp-newpass"
                  type={showNew ? 'text' : 'password'}
                  placeholder="Mínimo 8 caracteres"
                  value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  required
                  disabled={step2Loading}
                />
                <button type="button" className="fp-toggle-pass" onClick={() => setShowNew(v => !v)} tabIndex={-1}>
                  {showNew ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
              </div>
              {/* Strength bar */}
              {newPass && (
                <div className="fp-strength">
                  <div className="fp-strength-bar">
                    {[1,2,3,4,5].map(n => (
                      <div
                        key={n}
                        className="fp-strength-seg"
                        style={{ background: n <= strength.score ? strength.color : '#e2e8f0' }}
                      />
                    ))}
                  </div>
                  <span style={{ color: strength.color }}>{strength.label}</span>
                </div>
              )}
            </div>

            <div className="fp-field-group">
              <label htmlFor="fp-confirm">Confirmar contraseña</label>
              <div className="fp-field-wrap">
                <FiLock className="fp-field-icon" size={16} />
                <input
                  id="fp-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Repite la contraseña"
                  value={confirmPass}
                  onChange={e => setConfirmPass(e.target.value)}
                  required
                  disabled={step2Loading}
                />
                <button type="button" className="fp-toggle-pass" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}>
                  {showConfirm ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
              </div>
              {/* Match indicator */}
              {confirmPass && (
                <span className={`fp-match ${newPass === confirmPass ? 'ok' : 'ko'}`}>
                  {newPass === confirmPass
                    ? <><FiCheckCircle size={13} /> Las contraseñas coinciden</>
                    : <><FiAlertCircle  size={13} /> No coinciden</>}
                </span>
              )}
            </div>

            {step2Err && (
              <div className="fp-error-pill">
                <FiAlertCircle size={15} />
                <span>{step2Err}</span>
              </div>
            )}

            <button type="submit" className="fp-btn" disabled={step2Loading}>
              {step2Loading
                ? <><span className="fp-spinner" /> Guardando…</>
                : <><FiLock size={15} /> Establecer nueva contraseña</>}
            </button>

            <div className="fp-back-row">
              <button type="button" className="fp-back-btn" onClick={() => setStep(1)}>
                <FiArrowLeft size={14} /> Volver al paso anterior
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 3 – Success ── */}
        {step === 3 && (
          <div className="fp-success">
            <div className="fp-success-icon">
              <FiCheckCircle size={44} />
            </div>
            <h2>¡Contraseña actualizada!</h2>
            <p>Tu contraseña ha sido restablecida exitosamente.<br />Ya puedes iniciar sesión con tu nueva contraseña.</p>
            <button className="fp-btn fp-btn--success" onClick={() => navigate('/login')}>
              Ir al inicio de sesión
            </button>
          </div>
        )}

        <footer className="fp-footer">
          © 2026 Sistema Control Interno · Todos los derechos reservados
        </footer>
      </div>
    </div>
  );
}
