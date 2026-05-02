import { useState, useEffect, useContext } from 'react';
import api from '../api/axios';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FiUser, FiLock, FiEye, FiEyeOff, FiAlertCircle } from 'react-icons/fi';
import './Login.css';

export default function Login() {
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState('');
  const [sessionMsg, setSessionMsg] = useState('');
  const { login }    = useContext(AuthContext);
  const navigate     = useNavigate();

  useEffect(() => {
    const msg = sessionStorage.getItem('session_msg');
    if (msg) { setSessionMsg(msg); sessionStorage.removeItem('session_msg'); }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { username, password });
      login(res.data.user);
      localStorage.setItem('token', res.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Credenciales incorrectas. Intente de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">

      {/* ── Panel izquierdo ── */}
      <div className="login-left" />

      {/* ── Panel derecho ── */}
      <div className="login-right">
        <div className="login-card">
          <div className="card-accent" />

          <div className="login-header">
            <div className="logo-ring">
              <FiUser size={28} strokeWidth={1.8} />
            </div>
            <span className="system-badge">SCICN</span>
            <h1>Iniciar Sesión</h1>
            <span className="subtitle">Ingresa tus credenciales</span>
          </div>

          <form onSubmit={handleSubmit} className="login-form" noValidate>

            {sessionMsg && (
              <div className="login-session-warn">
                <FiAlertCircle size={15}/> {sessionMsg}
              </div>
            )}

            <div className="field-group">
              <label htmlFor="username">Usuario</label>
              <div className="field-wrap">
                <FiUser className="field-icon" size={16} />
                <input
                  id="username"
                  type="text"
                  placeholder="Ingresa tu usuario"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="password">Contraseña</label>
              <div className="field-wrap">
                <FiLock className="field-icon" size={16} />
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="toggle-pass"
                  onClick={() => setShowPass(v => !v)}
                  tabIndex={-1}
                >
                  {showPass ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="error-pill">
                <FiAlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading
                ? <><span className="btn-spinner" /> Verificando…</>
                : 'Iniciar Sesión'
              }
            </button>

            <div className="forgot-row">
              <a href="/forgot-password" className="forgot-link">¿Olvidaste tu contraseña?</a>
            </div>
          </form>

          <footer className="login-footer">
            © 2026 Sistema Control Interno · Todos los derechos reservados
            <span className="login-version">v1.0.0</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
