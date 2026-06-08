import { useContext, useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiHome, FiLogOut, FiKey, FiChevronDown } from 'react-icons/fi';
import { LuUserCheck, LuSun, LuMoon } from 'react-icons/lu';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ChangePasswordModal from './ChangePasswordModal';
import './Navbar.css';

export default function Navbar() {
  const { user, logout } = useContext(AuthContext);
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === '/dashboard';
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showChangePass, setShowChangePass] = useState(false);
  const dropdownRef = useRef(null);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-content">
        <div className="navbar-brand">
          {!isDashboard && (
            <Link to="/dashboard" className="navbar-home-btn" title="Ir al inicio">
              <FiHome size={18} />
            </Link>
          )}
          <h1>Control Interno - Pagaduría Especial</h1>
        </div>

        {user && (
          <div className="navbar-user">
            {/* User badge con dropdown */}
            <div className="navbar-user-dropdown" ref={dropdownRef}>
              <div className="user-badge" onClick={() => setDropdownOpen(o => !o)}>
                <div className="user-initial">
                  <LuUserCheck size={22} color="white" />
                  <span className="user-check-badge">✓</span>
                </div>
                <div className="user-info-navbar">
                  <p className="username">{user.nombre}</p>
                  <p className="userrole">{user.rol.replace('_', ' ')}</p>
                </div>
                <FiChevronDown size={14} className={`navbar-chevron${dropdownOpen ? ' open' : ''}`} />
              </div>

              {dropdownOpen && (
                <div className="navbar-dropdown">
                  <button className="navbar-dropdown-item" onClick={() => { setDropdownOpen(false); setShowChangePass(true); }}>
                    <FiKey size={14} /> Cambiar Contraseña
                  </button>
                  <div className="navbar-dropdown-sep" />
                  <button className="navbar-dropdown-item danger" onClick={handleLogout}>
                    <FiLogOut size={14} /> Cerrar Sesión
                  </button>
                </div>
              )}
            </div>

            <button className="theme-toggle-btn" onClick={toggleTheme} title={isDark ? 'Modo claro' : 'Modo oscuro'}>
              {isDark ? <LuSun size={18} /> : <LuMoon size={18} />}
            </button>
          </div>
        )}
      </div>

      {showChangePass && <ChangePasswordModal onClose={() => setShowChangePass(false)} />}
    </nav>
  );
}