import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiDollarSign, FiUsers, FiBarChart2, FiSettings,
  FiFileText, FiShield, FiDatabase,
} from 'react-icons/fi';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './Dashboard.css';

const ALL_MODULES = [
  {
    path: '/caja',
    label: 'Caja Chica',
    description: 'Gestión de fondos y movimientos',
    icon: FiDollarSign,
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    roles: ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'],
  },
  {
    path: '/usuarios',
    label: 'Usuarios',
    description: 'Administración de usuarios y roles',
    icon: FiUsers,
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    roles: ['SUPER_ADMIN', 'ADMIN'],
  },
  {
    path: null,
    label: 'Reportes',
    description: 'Informes y estadísticas del sistema',
    icon: FiBarChart2,
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    roles: ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'],
    disabled: true,
  },
  {
    path: null,
    label: 'Documentos',
    description: 'Gestión documental y archivos',
    icon: FiFileText,
    gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    roles: ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'],
    disabled: true,
  },
  {
    path: null,
    label: 'Auditoría',
    description: 'Registro y trazabilidad de acciones',
    icon: FiShield,
    gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    roles: ['SUPER_ADMIN', 'ADMIN'],
    disabled: true,
  },
  {
    path: null,
    label: 'Configuración',
    description: 'Parámetros generales del sistema',
    icon: FiSettings,
    gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    roles: ['SUPER_ADMIN'],
    disabled: true,
  },
  {
    path: '/base-datos',
    label: 'Base de Datos',
    description: 'Backups, exportación e importación',
    icon: FiDatabase,
    gradient: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
    roles: ['SUPER_ADMIN'],
  },
];

export default function Dashboard() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const modules = ALL_MODULES.filter(m => m.roles.includes(user?.rol));

  return (
    <div className="app-shell">
      <Navbar />
      <main className="launcher-main">
        <div className="launcher-header">
          <div className="launcher-avatar">
            {user?.nombre.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2>Bienvenido, <span>{user?.nombre}</span></h2>
            <p>Selecciona un módulo para comenzar</p>
          </div>
        </div>

        <div className="modules-grid">
          {modules.map((mod, i) => {
            const Icon = mod.icon;
            return (
              <div
                key={i}
                className={`module-card${mod.disabled ? ' is-disabled' : ''}`}
                onClick={() => !mod.disabled && mod.path && navigate(mod.path)}
              >
                <div className="module-icon-wrap" style={{ background: mod.gradient }}>
                  <Icon size={34} color="white" />
                </div>
                <div className="module-info">
                  <h3>{mod.label}</h3>
                  <p>{mod.description}</p>
                </div>
                {mod.disabled && (
                  <span className="coming-soon-badge">Próximamente</span>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}