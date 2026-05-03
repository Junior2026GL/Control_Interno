import { useEffect, useState, useContext } from 'react';
import {
  FiPlus, FiSearch, FiEdit2, FiUserX, FiUserCheck,
  FiX, FiUser, FiMail, FiLock, FiUnlock, FiShield, FiAtSign, FiKey, FiCheck,
  FiEye, FiEyeOff, FiUsers, FiFilter,
} from 'react-icons/fi';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './Usuarios.css';

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];

const MODULOS_LABELS = {
  'caja':          'Caja Chica',
  'usuarios':      'Gestión de Usuarios',
  'base-datos':    'Base de Datos',
  'autorizaciones':'Autorizaciones de Pago',
  'asistente-ia':  'Asistente IA',
  'diputados':     'Diputados',
  'viaticos':           'Viáticos',
  'reportes-presupuesto': 'Reportes Presupuesto',
};

const ROL_META = {
  SUPER_ADMIN: { label: 'Super Admin',  color: '#7c3aed', bg: '#f3f0ff' },
  ADMIN:       { label: 'Administrador', color: '#2563eb', bg: '#eff6ff' },
  ASISTENTE:   { label: 'Asistente',    color: '#059669', bg: '#ecfdf5' },
};

const EMPTY_FORM = { nombre: '', username: '', email: '', password: '', confirmPassword: '', rol: 'ASISTENTE' };

const EMAIL_REGEX    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

function clientValidate(form, isCreate) {
  const nombre = form.nombre.trim();
  const username = form.username.trim();
  const email = form.email.trim();
  const pass = form.password;

  if (!nombre || nombre.length < 2) return 'El nombre debe tener al menos 2 caracteres.';
  if (!USERNAME_REGEX.test(username)) return 'El username solo puede tener letras, n\u00fameros y gui\u00f3n bajo (3-30 caracteres).';
  if (!EMAIL_REGEX.test(email)) return 'El correo electr\u00f3nico no tiene un formato v\u00e1lido.';
  if (isCreate) {
    if (!pass || pass.length < 8) return 'La contrase\u00f1a debe tener al menos 8 caracteres.';
    if (!/[A-Z]/.test(pass)) return 'La contrase\u00f1a debe incluir al menos una letra may\u00fascula.';
    if (!/[0-9]/.test(pass)) return 'La contrase\u00f1a debe incluir al menos un n\u00famero.';
    if (pass !== form.confirmPassword) return 'Las contrase\u00f1as no coinciden.';
  } else if (pass.trim()) {
    if (pass.length < 8) return 'La contrase\u00f1a debe tener al menos 8 caracteres.';
    if (!/[A-Z]/.test(pass)) return 'La contrase\u00f1a debe incluir al menos una letra may\u00fascula.';
    if (!/[0-9]/.test(pass)) return 'La contrase\u00f1a debe incluir al menos un n\u00famero.';
  }
  return null;
}

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
  const [showModalPass, setShowModalPass]       = useState(false);
  const [showConfirmPass, setShowConfirmPass]   = useState(false);
  const [permsUser, setPermsUser]     = useState(null);  // user whose modules we edit
  const [allModulos, setAllModulos]   = useState([]);    // all available modules
  const [selectedMods, setSelectedMods] = useState(new Set());
  const [permsSaving, setPermsSaving] = useState(false);
  const [toast, setToast]             = useState(null);
  const [filterRol, setFilterRol]     = useState('ALL');
  const [filterActivo, setFilterActivo] = useState('ALL');
  const [unlockTarget, setUnlockTarget] = useState(null);

  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };
  // ── fetch ────────────────────────────────────────────────
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users', { headers: authHeaders() });
      setUsers(res.data);
    } catch {
      showToast('Error al cargar los datos. Intente de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  // ── filtered list ─────────────────────────────────────────
  const stats = {
    total:      users.length,
    admins:     users.filter(u => u.rol === 'ADMIN' && u.activo).length,
    asistentes: users.filter(u => u.rol === 'ASISTENTE' && u.activo).length,
    inactivos:  users.filter(u => !u.activo).length,
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || u.nombre.toLowerCase().includes(q)
      || u.username.toLowerCase().includes(q)
      || u.email.toLowerCase().includes(q);
    const matchRol    = filterRol === 'ALL'    || u.rol === filterRol;
    const matchActivo = filterActivo === 'ALL'
      || (filterActivo === 'activo' ? u.activo : !u.activo);
    return matchSearch && matchRol && matchActivo;
  });

  // ── open modals ───────────────────────────────────────────
  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormErr('');
    setShowModalPass(false);
    setShowConfirmPass(false);
    setModal('create');
  };

  const openEdit = (u) => {
    setSelected(u);
    setForm({ nombre: u.nombre, username: u.username, email: u.email, password: '', confirmPassword: '', rol: u.rol });
    setFormErr('');
    setShowModalPass(false);
    setShowConfirmPass(false);
    setModal('edit');
  };

  const closeModal = () => { setModal(null); setSelected(null); };

  // ── permissions ───────────────────────────────────────────
  const openPerms = async (u) => {
    try {
      const [allRes, userRes] = await Promise.all([
        api.get('/modulos', { headers: authHeaders() }),
        api.get(`/modulos/usuario/${u.id}`, { headers: authHeaders() }),
      ]);
      setAllModulos(allRes.data);
      setSelectedMods(new Set(userRes.data));
      setPermsUser(u);
    } catch {
      showToast('Error al cargar módulos.');
    }
  };

  const toggleMod = (clave) => {
    setSelectedMods(prev => {
      const next = new Set(prev);
      next.has(clave) ? next.delete(clave) : next.add(clave);
      return next;
    });
  };

  const savePerms = async () => {
    setPermsSaving(true);
    try {
      await api.put(
        `/modulos/usuario/${permsUser.id}`,
        { modulos: [...selectedMods] },
        { headers: authHeaders() }
      );
      setPermsUser(null);
      showToast('Módulos guardados correctamente.', 'ok');
    } catch {
      showToast('Error al guardar módulos.');
    } finally {
      setPermsSaving(false);
    }
  };

  // ── save ──────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setFormErr('');

    const validErr = clientValidate(form, modal === 'create');
    if (validErr) { setFormErr(validErr); return; }

    setSaving(true);
    try {
      if (modal === 'create') {
        const { confirmPassword, ...payload } = form;
        await api.post('/users', payload, { headers: authHeaders() });
        showToast('Usuario creado correctamente.', 'ok');
      } else {
        const { confirmPassword, ...payload } = form;
        if (!payload.password) delete payload.password;
        await api.put(`/users/${selected.id}`, payload, { headers: authHeaders() });
        showToast('Usuario actualizado correctamente.', 'ok');
      }
      closeModal();
      fetchUsers();
    } catch (err) {
      const msg = err.response?.data?.message || 'Error al guardar. Intente de nuevo.';
      setFormErr(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── unlock account ──────────────────────────────────────────
  const handleUnlock = async (u) => {
    try {
      await api.post(`/users/${u.id}/unlock`, {}, { headers: authHeaders() });
      setUnlockTarget(null);
      fetchUsers();
      showToast(`${u.nombre} desbloqueado correctamente.`, 'ok');
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al desbloquear.');
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
      showToast(u.activo ? `${u.nombre} desactivado.` : `${u.nombre} activado.`, u.activo ? 'warn' : 'ok');
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al cambiar estado.');
    }
  };

  // ── render ────────────────────────────────────────────────
  return (
    <div className="page-shell">
      <Navbar />

      <div className="page-content" style={{ maxWidth: 1200 }}>
        {/* ── Header ── */}
        <div className="usr-page-header">
          <div className="usr-page-header-left">
            <div className="usr-page-header-icon"><FiUsers size={22} /></div>
            <div>
              <h1>Gestión de Usuarios</h1>
              <p>{users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button className="btn-primary" onClick={openCreate}>
            <FiPlus size={16} /> Nuevo Usuario
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="usr-stats">
          <div className="usr-stat-card">
            <span className="usr-stat-value">{stats.total}</span>
            <span className="usr-stat-label">Total</span>
          </div>
          <div className="usr-stat-card admin">
            <span className="usr-stat-value">{stats.admins}</span>
            <span className="usr-stat-label">Administradores</span>
          </div>
          <div className="usr-stat-card asistente">
            <span className="usr-stat-value">{stats.asistentes}</span>
            <span className="usr-stat-label">Asistentes</span>
          </div>
          <div className="usr-stat-card inactivo">
            <span className="usr-stat-value">{stats.inactivos}</span>
            <span className="usr-stat-label">Inactivos</span>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="usr-toolbar">
          <div className="usr-search-wrap">
            <FiSearch className="usr-search-icon" size={15} />
            <input
              className="usr-search"
              placeholder="Buscar por nombre, usuario o correo…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="usr-search-clear" onClick={() => setSearch('')}>
                <FiX size={13} />
              </button>
            )}
          </div>

          <div className="usr-toolbar-filters">
            <FiFilter size={13} style={{ color: '#8a99aa', flexShrink: 0 }} />
            {['ALL', 'SUPER_ADMIN', 'ADMIN', 'ASISTENTE'].map(r => (
              <button
                key={r}
                className={`usr-filter-btn${filterRol === r ? ' active' : ''}`}
                onClick={() => setFilterRol(r)}
              >
                {r === 'ALL' ? 'Todos' : ROL_META[r]?.label || r}
              </button>
            ))}
            <div className="usr-filter-sep" />
            <select
              className="usr-filter-select"
              value={filterActivo}
              onChange={e => setFilterActivo(e.target.value)}
            >
              <option value="ALL">Todos los estados</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
            </select>
          </div>
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
                          <div className="usr-name-cell-info">
                            <span className="usr-name-cell-name">{u.nombre}</span>
                            <span className="usr-name-cell-email">{u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td><span className="usr-username">@{u.username}</span></td>
                      <td>
                        <span className="usr-role-badge" style={{ color: meta.color, background: meta.bg }}>
                          {meta.label}
                        </span>
                      </td>
                      <td>
                        <div className="usr-status-cell">
                          <span className={`usr-status ${u.activo ? 'active' : 'inactive'}`}>
                            {u.activo ? 'Activo' : 'Inactivo'}
                          </span>
                          {!!u.bloqueado && (
                            <span className="usr-status blocked">Bloqueado</span>
                          )}
                        </div>
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
                          {u.rol !== 'SUPER_ADMIN' && (
                            <button
                              className="action-btn perms"
                              title="Asignar módulos"
                              onClick={() => openPerms(u)}
                            >
                              <FiKey size={15} />
                            </button>
                          )}
                          {u.id !== me?.id && (
                            <button
                              className={`action-btn ${u.activo ? 'deactivate' : 'activate'}`}
                              title={u.activo ? 'Desactivar usuario' : 'Activar usuario'}
                              onClick={() => setConfirm(u)}
                            >
                              {u.activo ? <FiUserX size={15} /> : <FiUserCheck size={15} />}
                            </button>
                          )}
                          {me?.rol === 'SUPER_ADMIN' && !!u.bloqueado && (
                            <button
                              className="action-btn unlock"
                              title="Desbloquear cuenta"
                              onClick={() => setUnlockTarget(u)}
                            >
                              <FiUnlock size={15} />
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
          <div className="modal-box usr-edit-modal" onClick={e => e.stopPropagation()}>

            {/* ── Header ── */}
            <div className="usr-mhead">
              <div className="usr-mhead-left">
                <div className="usr-mhead-avatar">
                  {modal === 'edit' && form.nombre
                    ? form.nombre.trim().charAt(0).toUpperCase()
                    : <FiUser size={24} />}
                </div>
                <div className="usr-mhead-texts">
                  <h2>{modal === 'create' ? 'Nuevo Usuario' : 'Editar Usuario'}</h2>
                  <p className="usr-mhead-sub">
                    {modal === 'create'
                      ? 'Completa los datos para crear la cuenta'
                      : form.nombre || 'Modifica la información del usuario'}
                  </p>
                </div>
              </div>
              <button className="usr-mhead-close" onClick={closeModal} aria-label="Cerrar">
                <FiX size={18} />
              </button>
            </div>

            <form className="usr-modal-body" onSubmit={handleSave}>

              {/* — Card: Información personal — */}
              <div className="usr-card">
                <div className="usr-card-title"><FiUser size={13} />Información personal</div>
                <div className="form-group">
                  <label>Nombre completo</label>
                  <div className="usr-field-wrap">
                    <FiUser className="usr-field-icon" size={14} />
                    <input
                      required
                      placeholder="Ej: Juan Pérez"
                      value={form.nombre}
                      onChange={e => setForm({ ...form, nombre: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Usuario</label>
                  <div className="usr-field-wrap">
                    <FiAtSign className="usr-field-icon" size={14} />
                    <input
                      required
                      placeholder="Ej: jperez"
                      value={form.username}
                      onChange={e => setForm({ ...form, username: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Correo electrónico</label>
                  <div className="usr-field-wrap">
                    <FiMail className="usr-field-icon" size={14} />
                    <input
                      type="email"
                      required
                      placeholder="correo@ejemplo.com"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* — Card: Acceso y permisos — */}
              <div className="usr-card">
                <div className="usr-card-title"><FiLock size={13} />Acceso y permisos</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>
                      Contraseña
                      {modal === 'edit' && <span className="label-hint">vacío = sin cambios</span>}
                    </label>
                    <div className="usr-field-wrap usr-field-pass">
                      <FiLock className="usr-field-icon" size={14} />
                      <input
                        type={showModalPass ? 'text' : 'password'}
                        required={modal === 'create'}
                        placeholder={modal === 'edit' ? '••••••••' : 'Mín. 8 car., 1 may., 1 núm.'}
                        value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                      />
                      <button type="button" className="pass-eye-btn" onClick={() => setShowModalPass(v => !v)} tabIndex={-1}>
                        {showModalPass ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Rol</label>
                    <div className="usr-field-wrap">
                      <FiShield className="usr-field-icon" size={14} />
                      <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}>
                        {getRolesParaSelector(me?.rol).map(r => (
                          <option key={r} value={r}>{ROL_META[r]?.label || r}</option>
                        ))}
                      </select>
                    </div>
                    {form.rol && (
                      <span className="usr-rol-preview" style={{ color: ROL_META[form.rol]?.color, background: ROL_META[form.rol]?.bg }}>
                        {ROL_META[form.rol]?.label}
                      </span>
                    )}
                  </div>
                </div>

                {modal === 'create' && (
                  <div className="form-group">
                    <label>Confirmar Contraseña</label>
                    <div className="usr-field-wrap usr-field-pass">
                      <FiLock className="usr-field-icon" size={14} />
                      <input
                        type={showConfirmPass ? 'text' : 'password'}
                        required
                        placeholder="Repite la contraseña"
                        value={form.confirmPassword}
                        onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                      />
                      <button type="button" className="pass-eye-btn" onClick={() => setShowConfirmPass(v => !v)} tabIndex={-1}>
                        {showConfirmPass ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {formErr && <div className="form-error">{formErr}</div>}

              <div className="usr-modal-footer">
                <button type="button" className="btn-secondary" onClick={closeModal}>Cancelar</button>
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

      {/* ── Unlock Confirmation Modal ── */}
      {unlockTarget && (
        <div className="modal-overlay" onClick={() => setUnlockTarget(null)}>
          <div className="modal-box modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Desbloquear Cuenta</h2>
              <button className="modal-close" onClick={() => setUnlockTarget(null)}><FiX size={18} /></button>
            </div>
            <div className="confirm-body">
              ¿Deseas desbloquear la cuenta de <strong>{unlockTarget.nombre}</strong>? Podrá volver a iniciar sesión.
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setUnlockTarget(null)}>Cancelar</button>
              <button className="btn-success" onClick={() => handleUnlock(unlockTarget)}>
                <FiUnlock size={14} /> Desbloquear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Permissions Modal ── */}
      {permsUser && (
        <div className="modal-overlay" onClick={() => setPermsUser(null)}>
          <div className="modal-box perms-modal" onClick={e => e.stopPropagation()}>

            {/* Header con gradiente */}
            <div className="perms-mhead">
              <div className="perms-mhead-icon"><FiKey size={20} /></div>
              <div className="perms-mhead-texts">
                <h2>Acceso a Módulos</h2>
                <p>{permsUser.nombre}</p>
              </div>
              <button className="perms-mhead-close" onClick={() => setPermsUser(null)} aria-label="Cerrar">
                <FiX size={18} />
              </button>
            </div>

            {/* Contador */}
            <div className="perms-count-bar">
              <span className="perms-count-badge">{selectedMods.size}</span>
              <span className="perms-count-label"> de {allModulos.length} módulos activados</span>
            </div>

            {/* Lista */}
            <div className="perms-body">
              <div className="perms-list">
                {allModulos.map(m => {
                  const active = selectedMods.has(m.clave);
                  return (
                    <label key={m.clave} className={`perms-item${active ? ' perms-item--on' : ''}`}>
                      <div className={`perms-item-check${active ? ' perms-item-check--on' : ''}`}>
                        {active && <FiCheck size={12} />}
                      </div>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleMod(m.clave)}
                        style={{ display: 'none' }}
                      />
                      <span className="perms-item-name">{MODULOS_LABELS[m.clave] || m.nombre}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="perms-mfooter">
              <button className="perms-btn-cancel" onClick={() => setPermsUser(null)}>Cancelar</button>
              <button className="perms-btn-save" onClick={savePerms} disabled={permsSaving}>
                {permsSaving ? 'Guardando…' : <><FiCheck size={15} /> Guardar Módulos</>}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Toast ────────────────────────────────────────── */}
      {toast && (
        <div className={`usr-toast usr-toast--${toast.type}`} role="alert">
          <span className="usr-toast-msg">{toast.msg}</span>
          <button className="usr-toast-close" onClick={() => setToast(null)} aria-label="Cerrar">×</button>
        </div>
      )}
    </div>
  );
}