import { useState, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiMenu, FiX, FiHome, FiDollarSign, FiUsers, FiLogOut } from 'react-icons/fi';
import { AuthContext } from '../context/AuthContext';
import './Sidebar.css';

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: FiHome },
    { path: '/caja', label: 'Caja Chica', icon: FiDollarSign },
    { path: '/usuarios', label: 'Usuarios', icon: FiUsers },
  ];

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
