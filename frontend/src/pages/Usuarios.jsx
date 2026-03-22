import { useEffect, useState, useContext } from 'react';
import {
  FiPlus, FiSearch, FiEdit2, FiUserX, FiUserCheck,
  FiX, FiUser, FiMail, FiLock, FiShield, FiAtSign,
} from 'react-icons/fi';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './Usuarios.css';

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];

const ROL_META = {
  SUPER_ADMIN: { label: 'Super Admin',  color: '#7c3aed', bg: '#f3f0ff' },
  ADMIN:       { label: 'Administrador', color: '#2563eb', bg: '#eff6ff' },
  ASISTENTE:   { label: 'Asistente',    color: '#059669', bg: '#ecfdf5' },
};

const EMPTY_FORM = { nombre: '', username: '', email: '', password: '', rol: 'ASISTENTE' };

function getRolesParaSelector(miRol) {
  if (miRol === 'SUPER_ADMIN') return ROLES;
  return ROLES.filter(r => r !== 'SUPER_ADMIN');
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

export default function Usuarios() {
  const { user: me } = useContext(AuthContext);
  const [users, setUsers]       = useState([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);   // null | 'create' | 'edit'
  const [selected, setSelected] = useState(null);   // user being edited
  const [form, setForm]         = useState(EMPTY_FORM);
  const [formErr, setFormErr]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [confirm, setConfirm]   = useState(null);   // user to toggle active

  // ── fetch ────────────────────────────────────────────────
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users', { headers: authHeaders() });
      setUsers(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  // ── filtered list ─────────────────────────────────────────
  const filtered = users.filter(u =>
    u.nombre.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  // ── open modals ───────────────────────────────────────────
  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormErr('');
    setModal('create');
  };

  const openEdit = (u) => {
    setSelected(u);
    setForm({ nombre: u.nombre, username: u.username, email: u.email, password: '', rol: u.rol });
    setFormErr('');
    setModal('edit');
  };

  const closeModal = () => { setModal(null); setSelected(null); };

  // ── save ──────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setFormErr('');
    setSaving(true);
    try {
      if (modal === 'create') {
        await api.post('/users', form, { headers: authHeaders() });
      } else {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await api.put(`/users/${selected.id}`, payload, { headers: authHeaders() });
      }
      closeModal();
      fetchUsers();
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Error al guardar. Intente de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // ── toggle activo ─────────────────────────────────────────
  const handleToggle = async (u) => {
    try {
      if (u.activo) {
        await api.delete(`/users/${u.id}`, { headers: authHeaders() });
      } else {
        await api.put(`/users/${u.id}`,
          { nombre: u.nombre, username: u.username, email: u.email, rol: u.rol, activo: 1 },
          { headers: authHeaders() }
        );
      }
      setConfirm(null);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al cambiar estado.');
    }
  };

  // ── render ────────────────────────────────────────────────
  return (
    <div className="page-shell">
      <Navbar />

      <div className="page-content">
        {/* Header */}
        <div className="usr-page-header">
          <div>
            <h1>Gestión de Usuarios</h1>
            <p>{users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}</p>
          </div>
          <button className="btn-primary" onClick={openCreate}>
            <FiPlus size={16} /> Nuevo Usuario
          </button>
        </div>

        {/* Search bar */}
        <div className="usr-search-wrap">
          <FiSearch className="usr-search-icon" size={16} />
          <input
            className="usr-search"
            placeholder="Buscar por nombre, usuario o correo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="usr-search-clear" onClick={() => setSearch('')}>
              <FiX size={14} />
            </button>
          )}
        </div>

        {/* Table */}
        <div className="usr-table-wrap">
          {loading ? (
            <div className="usr-empty">Cargando usuarios…</div>
          ) : filtered.length === 0 ? (
            <div className="usr-empty">No se encontraron usuarios.</div>
          ) : (
            <table className="usr-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Username</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const meta = ROL_META[u.rol] || ROL_META.ASISTENTE;
                  return (
                    <tr key={u.id} className={!u.activo ? 'row-inactive' : ''}>
                      <td>
                        <div className="usr-name-cell">
                          <div className="usr-avatar" style={{ background: meta.bg, color: meta.color }}>
                            {u.nombre.charAt(0).toUpperCase()}
                          </div>
                          <span>{u.nombre}</span>
                        </div>
                      </td>
                      <td><span className="usr-username">@{u.username}</span></td>
                      <td className="usr-email">{u.email}</td>
                      <td>
                        <span
                          className="usr-role-badge"
                          style={{ color: meta.color, background: meta.bg }}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td>
                        <span className={`usr-status ${u.activo ? 'active' : 'inactive'}`}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div className="usr-actions">
                          <button
                            className="action-btn edit"
                            title="Editar usuario"
                            onClick={() => openEdit(u)}
                          >
                            <FiEdit2 size={15} />
                          </button>
                          {u.id !== me?.id && (
                            <button
                              className={`action-btn ${u.activo ? 'deactivate' : 'activate'}`}
                              title={u.activo ? 'Desactivar usuario' : 'Activar usuario'}
                              onClick={() => setConfirm(u)}
                            >
                              {u.activo ? <FiUserX size={15} /> : <FiUserCheck size={15} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Create / Edit Modal ── */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modal === 'create' ? 'Nuevo Usuario' : 'Editar Usuario'}</h2>
              <button className="modal-close" onClick={closeModal}><FiX size={18} /></button>
            </div>

            <form className="modal-form" onSubmit={handleSave}>
              <div className="form-row">
                <div className="form-group">
                  <label><FiUser size={13} /> Nombre completo</label>
                  <input
                    required
                    placeholder="Ej: Juan Pérez"
                    value={form.nombre}
                    onChange={e => setForm({ ...form, nombre: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label><FiAtSign size={13} /> Username</label>
                  <input
                    required
                    placeholder="Ej: jperez"
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label><FiMail size={13} /> Correo electrónico</label>
                <input
                  type="email"
                  required
                  placeholder="correo@ejemplo.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>
                    <FiLock size={13} /> Contraseña
                    {modal === 'edit' && <span className="label-hint">(dejar vacío para no cambiar)</span>}
                  </label>
                  <input
                    type="password"
                    required={modal === 'create'}
                    placeholder={modal === 'edit' ? '••••••••' : 'Mínimo 8 caracteres'}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label><FiShield size={13} /> Rol</label>
                  <select
                    value={form.rol}
                    onChange={e => setForm({ ...form, rol: e.target.value })}
                  >
                    {getRolesParaSelector(me?.rol).map(r => (
                      <option key={r} value={r}>{ROL_META[r]?.label || r}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formErr && <div className="form-error">{formErr}</div>}

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : modal === 'create' ? 'Crear Usuario' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirm Toggle Modal ── */}
      {confirm && (
        <div className="modal-overlay" onClick={() => setConfirm(null)}>
          <div className="modal-box modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{confirm.activo ? 'Desactivar Usuario' : 'Activar Usuario'}</h2>
              <button className="modal-close" onClick={() => setConfirm(null)}><FiX size={18} /></button>
            </div>
            <div className="confirm-body">
              {confirm.activo
                ? <>¿Deseas desactivar a <strong>{confirm.nombre}</strong>? No podrá iniciar sesión.</>
                : <>¿Deseas reactivar a <strong>{confirm.nombre}</strong>? Volverá a poder iniciar sesión.</>
              }
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setConfirm(null)}>Cancelar</button>
              <button
                className={confirm.activo ? 'btn-danger' : 'btn-success'}
                onClick={() => handleToggle(confirm)}
              >
                {confirm.activo ? 'Sí, desactivar' : 'Sí, activar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}