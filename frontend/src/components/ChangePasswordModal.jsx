import { useState } from 'react';
import { FiX, FiLock, FiEye, FiEyeOff, FiCheck } from 'react-icons/fi';
import api from '../api/axios';
import './ChangePasswordModal.css';

export default function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ actual: '', nueva: '', confirmar: '' });
  const [showActual, setShowActual]     = useState(false);
  const [showNueva, setShowNueva]       = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.actual || !form.nueva || !form.confirmar)
      return setError('Todos los campos son requeridos.');
    if (form.nueva.length < 8)
      return setError('La nueva contraseña debe tener al menos 8 caracteres.');
    if (!/[A-Z]/.test(form.nueva))
      return setError('La nueva contraseña debe incluir al menos una letra mayúscula.');
    if (!/[0-9]/.test(form.nueva))
      return setError('La nueva contraseña debe incluir al menos un número.');
    if (form.nueva !== form.confirmar)
      return setError('Las contraseñas no coinciden.');

    setSaving(true);
    try {
      await api.post('/users/change-password', {
        passwordActual: form.actual,
        passwordNueva: form.nueva,
      });
      setSuccess(true);
      setTimeout(onClose, 1800);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al cambiar la contraseña.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="cp-modal" onClick={e => e.stopPropagation()}>

        <div className="cp-header">
          <div className="cp-header-icon"><FiLock size={18} /></div>
          <div>
            <h2>Cambiar Contraseña</h2>
            <p>Ingresa tu contraseña actual y la nueva</p>
          </div>
          <button className="cp-close" onClick={onClose}><FiX size={16} /></button>
        </div>

        {success ? (
          <div className="cp-success">
            <FiCheck size={32} />
            <p>¡Contraseña actualizada correctamente!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="cp-body">
            <div className="cp-field">
              <label>Contraseña actual</label>
              <div className="cp-input-wrap">
                <FiLock size={14} className="cp-icon" />
                <input
                  type={showActual ? 'text' : 'password'}
                  placeholder="Tu contraseña actual"
                  value={form.actual}
                  onChange={e => setForm({ ...form, actual: e.target.value })}
                  autoFocus
                />
                <button type="button" className="cp-eye" onClick={() => setShowActual(v => !v)}>
                  {showActual ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                </button>
              </div>
            </div>

            <div className="cp-field">
              <label>Nueva contraseña</label>
              <div className="cp-input-wrap">
                <FiLock size={14} className="cp-icon" />
                <input
                  type={showNueva ? 'text' : 'password'}
                  placeholder="Mínimo 8 caracteres, 1 mayúscula, 1 número"
                  value={form.nueva}
                  onChange={e => setForm({ ...form, nueva: e.target.value })}
                />
                <button type="button" className="cp-eye" onClick={() => setShowNueva(v => !v)}>
                  {showNueva ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                </button>
              </div>
            </div>

            <div className="cp-field">
              <label>Confirmar nueva contraseña</label>
              <div className="cp-input-wrap">
                <FiLock size={14} className="cp-icon" />
                <input
                  type={showConfirmar ? 'text' : 'password'}
                  placeholder="Repite la nueva contraseña"
                  value={form.confirmar}
                  onChange={e => setForm({ ...form, confirmar: e.target.value })}
                />
                <button type="button" className="cp-eye" onClick={() => setShowConfirmar(v => !v)}>
                  {showConfirmar ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                </button>
              </div>
            </div>

            {error && <div className="cp-error">{error}</div>}

            <div className="cp-footer">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Guardando…' : <><FiCheck size={14} /> Guardar</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
