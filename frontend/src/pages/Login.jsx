import { useState, useContext } from 'react';
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
  const { login }    = useContext(AuthContext);
  const navigate     = useNavigate();

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
      {/* decorative blobs */}
      <div className="blob blob-1" />
      <div className="blob blob-2" />

      <div className="login-card">
        {/* top accent bar */}
        <div className="card-accent" />

        <div className="login-header">
          <div className="logo-ring">
            <FiUser size={28} strokeWidth={1.8} />
          </div>
          <h1>Control Interno</h1>
          <span className="subtitle">Sistema de Gestión</span>
        </div>

        <form onSubmit={handleSubmit} className="login-form" noValidate>

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
        </footer>
      </div>
    </div>
  );
}
