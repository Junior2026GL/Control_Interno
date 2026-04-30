import { useState, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiMenu, FiX, FiHome, FiDollarSign, FiUsers, FiLogOut, FiFileText, FiMessageSquare, FiShield, FiEye, FiBriefcase, FiUserCheck, FiRepeat, FiGift, FiMapPin } from 'react-icons/fi';
import { AuthContext } from '../context/AuthContext';
import './Sidebar.css';

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  const ALL_ITEMS = [
    { path: '/dashboard',               label: 'Dashboard',                 icon: FiHome,          clave: null,                        soloSuperAdmin: false },
    { path: '/caja',                    label: 'Caja Chica',                icon: FiDollarSign,    clave: 'caja',                      soloSuperAdmin: false },
    { path: '/autorizaciones',          label: 'Autorizaciones',            icon: FiFileText,      clave: 'autorizaciones',            soloSuperAdmin: false },
    { path: '/usuarios',                label: 'Usuarios',                  icon: FiUsers,         clave: 'usuarios',                  soloSuperAdmin: false },
    { path: '/chat',                    label: 'Asistente IA',              icon: FiMessageSquare, clave: 'asistente-ia',              soloSuperAdmin: false },
    { path: '/diputados',               label: 'Diputados',                 icon: FiUserCheck,     clave: 'diputados',                 soloSuperAdmin: false },
    { path: '/presupuesto-social',      label: 'Presupuesto Social',        icon: FiBriefcase,     clave: 'presupuesto-social',        soloSuperAdmin: false },
    { path: '/reportes-presupuesto',    label: 'Reportes Presupuesto',      icon: FiEye,           clave: 'reportes-presupuesto',      soloSuperAdmin: false },
    { path: '/viaticos',                label: 'Viáticos',                  icon: FiDollarSign,    clave: 'viaticos',                  soloSuperAdmin: false },
    { path: '/constancia-transferencia',label: 'Constancia Transferencia',  icon: FiRepeat,        clave: 'constancia-transferencia',  soloSuperAdmin: false },
    { path: '/ayudas',                  label: 'Ayudas',                    icon: FiGift,          clave: 'ayudas',                    soloSuperAdmin: false },
    { path: '/ayudas-alcaldias',         label: 'Ayudas Alcaldías',          icon: FiMapPin,        clave: 'ayudas_alcaldias',          soloSuperAdmin: false },
    { path: '/mapa-alcaldias',           label: 'Mapa Alcaldías',            icon: FiMapPin,        clave: 'mapa-alcaldias',            soloSuperAdmin: false },
    { path: '/alcaldes',                 label: 'Alcaldes Municipales',      icon: FiUserCheck,     clave: 'alcaldes',                  soloSuperAdmin: false },
    { path: '/ip-whitelist',            label: 'Acceso por IP',             icon: FiShield,        clave: null,                        soloSuperAdmin: true  },
    { path: '/auditoria',               label: 'Auditoría',                 icon: FiEye,           clave: null,                        soloSuperAdmin: true  },
  ];

  const menuItems = ALL_ITEMS.filter(item => {
    if (item.soloSuperAdmin) return user?.rol === 'SUPER_ADMIN';
    if (!item.clave) return true; // Dashboard siempre
    if (user?.rol === 'SUPER_ADMIN') return true;
    return user?.modulos?.includes(item.clave);
  });

  const handleLogout = () => {
    logout();
    localStorage.removeItem('token');
    navigate('/login');
  };

  const handleNavClick = () => {
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  };

  return (
    <>
      <div className={`sidebar ${collapsed ? 'collapsed' : ''} ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-toggle">
            <button 
              onClick={() => setCollapsed(!collapsed)}
              className="toggle-btn"
              title={collapsed ? 'Expandir' : 'Contraer'}
            >
              {collapsed ? <FiMenu /> : <FiX />}
            </button>
          </div>
          {!collapsed && <h2 className="sidebar-title">Control Interno</h2>}
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={handleNavClick}
                className={`nav-item ${isActive ? 'active' : ''}`}
                title={collapsed ? item.label : ''}
              >
                <span className="nav-icon">
                  <Icon size={20} />
                </span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {!collapsed && user && (
            <div className="user-info">
              <div className="user-avatar">
                {user.nombre.charAt(0).toUpperCase()}
              </div>
              <div className="user-details">
                <p className="user-name">{user.nombre}</p>
                <p className="user-role">{user.rol}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <button 
        className="sidebar-mobile-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        title={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
      >
        <FiMenu size={24} />
      </button>
    </>
  );
}
