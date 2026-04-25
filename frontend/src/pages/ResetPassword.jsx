import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  FiLock, FiEye, FiEyeOff,
  FiAlertCircle, FiCheckCircle, FiKey,
} from 'react-icons/fi';
import api from '../api/axios';
import './ForgotPassword.css';

// ── Password strength ──────────────────────────────────────────
function getStrength(pwd) {
  if (!pwd) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pwd.length >= 8)          score++;
  if (pwd.length >= 12)         score++;
  if (/[A-Z]/.test(pwd))        score++;
  if (/[0-9]/.test(pwd))        score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { score, label: 'Muy débil',  color: '#ef4444' };
  if (score === 2) return { score, label: 'Débil',      color: '#f97316' };
  if (score === 3) return { score, label: 'Regular',    color: '#eab308' };
  if (score === 4) return { score, label: 'Fuerte',     color: '#22c55e' };
  return              { score, label: 'Muy fuerte',  color: '#16a34a' };
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const token          = searchParams.get('token');

  const [newPass,      setNewPass]      = useState('');
  const [confirmPass,  setConfirmPass]  = useState('');
  const [showNew,      setShowNew]      = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState(false);

  const strength = getStrength(newPass);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');

    if (newPass !== confirmPass) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (newPass.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { resetToken: token, newPassword: newPass });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 4000);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al restablecer la contraseña.');
    } finally {
      setLoading(false);
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
            <h1>Nueva contraseña</h1>
            <span className="fp-subtitle">Sistema de Control Interno</span>
          </div>

          {/* Token inválido / faltante */}
          {!token && (
            <div className="fp-form" style={{ paddingTop: 8 }}>
              <div className="fp-error-pill">
                <FiAlertCircle size={15} />
                <span>Enlace inválido o expirado. Solicita uno nuevo.</span>
              </div>
              <button className="fp-btn" onClick={() => navigate('/forgot-password')}>
                Solicitar nuevo enlace
              </button>
            </div>
          )}

          {/* Formulario */}
          {token && !success && (
            <form className="fp-form" onSubmit={handleSubmit} noValidate>
              <p className="fp-desc">
                Crea una nueva contraseña segura para tu cuenta.
              </p>

              {/* Nueva contraseña */}
              <div className="fp-field-group">
                <label htmlFor="rp-newpass">Nueva contraseña</label>
                <div className="fp-field-wrap">
                  <FiLock className="fp-field-icon" size={16} />
                  <input
                    id="rp-newpass"
                    type={showNew ? 'text' : 'password'}
                    placeholder="Mínimo 8 caracteres"
                    value={newPass}
                    onChange={e => setNewPass(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="fp-toggle-pass"
                    onClick={() => setShowNew(v => !v)}
                    tabIndex={-1}
                  >
                    {showNew ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                  </button>
                </div>
                {/* Barra de fortaleza */}
                {newPass && (
                  <div className="fp-strength">
                    <div className="fp-strength-bar">
                      {[1, 2, 3, 4, 5].map(n => (
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

              {/* Confirmar contraseña */}
              <div className="fp-field-group">
                <label htmlFor="rp-confirm">Confirmar contraseña</label>
                <div className="fp-field-wrap">
                  <FiLock className="fp-field-icon" size={16} />
                  <input
                    id="rp-confirm"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Repite la contraseña"
                    value={confirmPass}
                    onChange={e => setConfirmPass(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="fp-toggle-pass"
                    onClick={() => setShowConfirm(v => !v)}
                    tabIndex={-1}
                  >
                    {showConfirm ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                  </button>
                </div>
                {confirmPass && (
                  <span className={`fp-match ${newPass === confirmPass ? 'ok' : 'ko'}`}>
                    {newPass === confirmPass
                      ? <><FiCheckCircle size={13} /> Las contraseñas coinciden</>
                      : <><FiAlertCircle  size={13} /> No coinciden</>}
                  </span>
                )}
              </div>

              {error && (
                <div className="fp-error-pill">
                  <FiAlertCircle size={15} />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" className="fp-btn" disabled={loading}>
                {loading
                  ? <><span className="fp-spinner" /> Guardando…</>
                  : <><FiLock size={15} /> Establecer nueva contraseña</>}
              </button>
            </form>
          )}

          {/* Éxito */}
          {success && (
            <div className="fp-success">
              <div className="fp-success-icon">
                <FiCheckCircle size={44} />
              </div>
              <h2>¡Contraseña actualizada!</h2>
              <p>
                Tu contraseña ha sido restablecida exitosamente.<br />
                Serás redirigido al inicio de sesión en unos segundos.
              </p>
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
    </div>
  );
}
