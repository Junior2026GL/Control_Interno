import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import './Navbar.css';

export default function Navbar() {
  const { user } = useContext(AuthContext);

  return (
    <nav className="navbar">
      <div className="navbar-content">
        <div className="navbar-brand">
          <h1>Control Interno</h1>
        </div>
        
        {user && (
          <div className="navbar-user">
            <div className="user-badge">
              <span className="user-initial">
                {user.nombre.charAt(0).toUpperCase()}
              </span>
              <div className="user-info-navbar">
                <p className="username">{user.nombre}</p>
                <p className="userrole">{user.rol}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}