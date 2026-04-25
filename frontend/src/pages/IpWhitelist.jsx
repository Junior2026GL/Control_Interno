import { useEffect, useState } from 'react';
import { FiPlus, FiTrash2, FiToggleLeft, FiToggleRight, FiShield, FiX, FiWifi } from 'react-icons/fi';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import './IpWhitelist.css';

const IP_REGEX   = /^(\d{1,3}\.){3}\d{1,3}$/;
const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/(\d|[12]\d|3[0-2])$/;

function isValidEntry(ip) {
  return IP_REGEX.test(ip.trim()) || CIDR_REGEX.test(ip.trim());
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

const EMPTY_FORM = { ip: '', descripcion: '' };

export default function IpWhitelist() {
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [myIP, setMyIP]       = useState('');
  const [modal, setModal]     = useState(false);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving]   = useState(false);
  const [confirm, setConfirm] = useState(null); // { id, ip } a eliminar
  const [toast, setToast]     = useState(null);

  // ── toast ─────────────────────────────────────────────────
  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── fetch ─────────────────────────────────────────────────
  const fetchAll = async () => {
    try {
      setLoading(true);
      const [listRes, ipRes] = await Promise.all([
        api.get('/ip-whitelist',        { headers: authHeaders() }),
        api.get('/ip-whitelist/my-ip',  { headers: authHeaders() }),
      ]);
      setList(listRes.data);
      setMyIP(ipRes.data.ip);
    } catch {
      showToast('Error al cargar la lista de IPs.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // ── agregar IP ─────────────────────────────────────────────
  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormErr('');
    setModal(true);
  };

  const handleAddMyIP = () => {
    setForm({ ip: myIP, descripcion: 'Mi PC actual' });
    setFormErr('');
    setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ip = form.ip.trim();
    if (!ip) return setFormErr('La IP es requerida.');
    if (!isValidEntry(ip)) return setFormErr('Formato inválido. Ej: 192.168.1.10 o 192.168.1.0/24');

    setSaving(true);
    try {
      await api.post('/ip-whitelist', { ip, descripcion: form.descripcion }, { headers: authHeaders() });
      setModal(false);
      showToast('IP agregada correctamente.');
      fetchAll();
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Error al agregar la IP.');
    } finally {
      setSaving(false);
    }
  };

  // ── toggle activo ──────────────────────────────────────────
  const handleToggle = async (item) => {
    try {
      await api.put(
        `/ip-whitelist/${item.id}`,
        { descripcion: item.descripcion, activo: item.activo ? 0 : 1 },
        { headers: authHeaders() }
      );
      showToast(`IP ${item.activo ? 'desactivada' : 'activada'} correctamente.`);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al actualizar.', 'error');
    }
  };

  // ── eliminar ───────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirm) return;
    try {
      await api.delete(`/ip-whitelist/${confirm.id}`, { headers: authHeaders() });
      setConfirm(null);
      showToast('IP eliminada correctamente.');
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al eliminar.', 'error');
      setConfirm(null);
    }
  };

  const activeCount = list.filter(i => i.activo).length;

  return (
    <div className="page-wrapper">
      <Navbar />
      <main className="page-content">

        {/* Header */}
        <div className="ipw-header">
          <div>
            <h1><FiShield size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />Control de Acceso por IP</h1>
            <p>
              Solo las IPs activas en esta lista pueden acceder al sistema.&nbsp;
              {list.length === 0
                ? <span className="ipw-badge open">Sin restricción (acceso libre)</span>
                : <span className="ipw-badge restricted">{activeCount} IP{activeCount !== 1 ? 's' : ''} activa{activeCount !== 1 ? 's' : ''}</span>
              }
            </p>
          </div>
          <div className="ipw-header-actions">
            {myIP && (
              <button className="btn-secondary" onClick={handleAddMyIP} title="Agregar tu IP actual">
                <FiWifi size={15} /> Mi IP ({myIP})
              </button>
            )}
            <button className="btn-primary" onClick={openAdd}>
              <FiPlus size={15} /> Agregar IP
            </button>
          </div>
        </div>

        {/* Aviso cuando la lista está vacía */}
        {!loading && list.length === 0 && (
          <div className="ipw-notice">
            <FiShield size={18} />
            <span>La whitelist está vacía. Cualquier máquina puede acceder al sistema. Agrega al menos una IP para activar la restricción.</span>
          </div>
        )}

        {/* Tabla */}
        <div className="ipw-card">
          {loading ? (
            <div className="ipw-loading">Cargando...</div>
          ) : list.length === 0 ? (
            <div className="ipw-empty">No hay IPs registradas.</div>
          ) : (
            <table className="ipw-table">
              <thead>
                <tr>
                  <th>IP / Rango CIDR</th>
                  <th>Descripción</th>
                  <th>Estado</th>
                  <th>Agregada</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {list.map(item => (
                  <tr key={item.id} className={!item.activo ? 'ipw-row-inactive' : ''}>
                    <td className="ipw-ip-cell">
                      <code>{item.ip}</code>
                      {item.ip === myIP && <span className="ipw-mine-tag">mi IP</span>}
                    </td>
                    <td className="ipw-desc">{item.descripcion || <span className="ipw-no-desc">—</span>}</td>
                    <td>
                      <span className={`ipw-status ${item.activo ? 'active' : 'inactive'}`}>
                        {item.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="ipw-date">
                      {new Date(item.creado_en).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="ipw-actions">
                      <button
                        className={`ipw-btn-toggle ${item.activo ? 'on' : 'off'}`}
                        onClick={() => handleToggle(item)}
                        title={item.activo ? 'Desactivar' : 'Activar'}
                      >
                        {item.activo ? <FiToggleRight size={20} /> : <FiToggleLeft size={20} />}
                        {item.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        className="ipw-btn-delete"
                        onClick={() => setConfirm(item)}
                        title="Eliminar"
                      >
                        <FiTrash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal agregar */}
        {modal && (
          <div className="ipw-overlay" onClick={() => setModal(false)}>
            <div className="ipw-modal" onClick={e => e.stopPropagation()}>
              <div className="ipw-modal-header">
                <h3>Agregar IP autorizada</h3>
                <button className="ipw-modal-close" onClick={() => setModal(false)}><FiX /></button>
              </div>
              <form onSubmit={handleSubmit} className="ipw-form">
                <label>
                  Dirección IP o rango CIDR *
                  <input
                    type="text"
                    placeholder="Ej: 192.168.1.10 o 192.168.1.0/24"
                    value={form.ip}
                    onChange={e => { setForm(f => ({ ...f, ip: e.target.value })); setFormErr(''); }}
                    autoFocus
                  />
                </label>
                <label>
                  Descripción (opcional)
                  <input
                    type="text"
                    placeholder="Ej: PC de Contabilidad, Red de oficina..."
                    maxLength={120}
                    value={form.descripcion}
                    onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  />
                </label>
                {formErr && <p className="ipw-form-err">{formErr}</p>}
                <div className="ipw-form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Guardando...' : 'Agregar IP'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal confirmar eliminar */}
        {confirm && (
          <div className="ipw-overlay" onClick={() => setConfirm(null)}>
            <div className="ipw-modal ipw-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="ipw-modal-header">
                <h3>Confirmar eliminación</h3>
                <button className="ipw-modal-close" onClick={() => setConfirm(null)}><FiX /></button>
              </div>
              <p className="ipw-confirm-text">
                ¿Eliminar la IP <code>{confirm.ip}</code>? Esta acción no se puede deshacer.
              </p>
              <div className="ipw-form-actions">
                <button className="btn-secondary" onClick={() => setConfirm(null)}>Cancelar</button>
                <button className="btn-danger" onClick={handleDelete}>Eliminar</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`ipw-toast ${toast.type}`}>{toast.msg}</div>
        )}

      </main>
    </div>
  );
}
