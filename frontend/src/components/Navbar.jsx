import { useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiHome, FiLogOut } from 'react-icons/fi';
import { LuUserCheck, LuSun, LuMoon } from 'react-icons/lu';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import './Navbar.css';

export default function Navbar() {
  const { user, logout } = useContext(AuthContext);
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === '/dashboard';

  const handleLogout = () => {
    logout();
    localStorage.removeItem('token');
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
          <h1>Control Interno</h1>
        </div>

        {user && (
          <div className="navbar-user">
            <div className="user-badge">
              <div className="user-initial">
                <LuUserCheck size={22} color="white" />
                <span className="user-check-badge">✓</span>
              </div>
              <div className="user-info-navbar">
                <p className="username">{user.nombre}</p>
                <p className="userrole">{user.rol.replace('_', ' ')}</p>
              </div>
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Cerrar sesión">
              <FiLogOut size={16} />
              <span>Salir</span>
            </button>
            <button className="theme-toggle-btn" onClick={toggleTheme} title={isDark ? 'Modo claro' : 'Modo oscuro'}>
              {isDark ? <LuSun size={18} /> : <LuMoon size={18} />}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}