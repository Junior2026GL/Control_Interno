import { useContext, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LuWallet, LuUsers, LuClipboardCheck,
  LuDatabase, LuBrainCircuit, LuShieldCheck, LuSquareActivity,
  LuSun, LuSunset, LuMoon, LuLandmark, LuBell, LuFileSpreadsheet, LuHandCoins, LuHeartHandshake,
  LuUserCheck, LuArrowLeftRight, LuMapPin, LuVote, LuStore,
} from 'react-icons/lu';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './Dashboard.css';

const ALL_MODULES = [
  {
    path: '/caja',
    label: 'Caja Chica',
    clave: 'caja',
    description: 'Gestión de fondos y movimientos',
    icon: LuWallet,
    gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  },
  {
    path: '/autorizaciones',
    label: 'Autorizaciones de Pago',
    clave: 'autorizaciones',
    description: 'Emisión y firma digital de pagos',
    icon: LuClipboardCheck,
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  },
  {
    path: '/usuarios',
    label: 'Usuarios',
    clave: 'usuarios',
    description: 'Administración de usuarios y roles',
    icon: LuUsers,
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
  },
  {
    path: '/base-datos',
    label: 'Base de Datos',
    clave: 'base-datos',
    description: 'Backups, exportación e importación',
    icon: LuDatabase,
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%)',
  },
  {
    path: '/chat',
    label: 'Asistente IA',
    clave: 'asistente-ia',
    description: 'Consulta datos por texto o voz con IA',
    icon: LuBrainCircuit,
    gradient: 'linear-gradient(135deg, #059669 0%, #0ea5e9 100%)',
  },
  {
    path: '/diputados',
    label: 'Diputados',
    clave: 'diputados',
    description: 'Gestión de diputados propietarios y suplentes',
    icon: LuLandmark,
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
  },
  {
    path: '/presupuesto-social',
    label: 'Presupuesto Social',
    clave: 'presupuesto-social',
    description: 'Control del presupuesto de ayudas sociales por diputado',
    icon: LuHeartHandshake,
    gradient: 'linear-gradient(135deg, #065f46 0%, #274C8D 100%)',
  },
  {    path: '/reportes-presupuesto',
    label: 'Reportes Presupuesto',
    clave: 'reportes-presupuesto',
    description: 'Estadísticas y reportes de ayudas sociales por año',
    icon: LuFileSpreadsheet,
    gradient: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
  },
  {    path: '/viaticos',
    label: 'Viáticos',
    clave: 'viaticos',
    description: 'Cuadro de cálculos de viáticos — Pagaduía Especial',
    icon: LuFileSpreadsheet,
    gradient: 'linear-gradient(135deg, #065f46 0%, #059669 100%)',
  },
  {
    path: '/constancia-transferencia',
    label: 'Constancia Transferencia',
    clave: 'constancia-transferencia',
    description: 'Constancia de recepción de transferencia electrónica',
    icon: LuArrowLeftRight,
    gradient: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
  },
  {
    path: '/ayudas',
    label: 'Ayudas',
    clave: 'ayudas',
    description: 'Registro de ayudas otorgadas a beneficiarios',
    icon: LuHandCoins,
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
  },
  {
    path: '/ayudas-alcaldias',
    label: 'Ayudas Alcaldías',
    clave: 'ayudas_alcaldias',
    description: 'Registro de ayudas sociales otorgadas a alcaldías',
    icon: LuMapPin,
    gradient: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
  },
  {
    path: '/mapa-alcaldias',
    label: 'Mapa Alcaldías',
    clave: 'mapa-alcaldias',
    description: 'Mapa y estadísticas de distribución geográfica de ayudas',
    icon: LuMapPin,
    gradient: 'linear-gradient(135deg, #134e4a 0%, #0f766e 100%)',
  },
  {
    path: '/alcaldes',
    label: 'Alcaldes Municipales',
    clave: 'alcaldes',
    description: 'Directorio de alcaldes por departamento y partido político',
    icon: LuVote,
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #274C8D 100%)',
  },
  {
    path: '/proveedores',
    label: 'Base de Datos Proveedores',
    clave: 'proveedores',
    description: 'Directorio y evaluación de proveedores',
    icon: LuStore,
    gradient: 'linear-gradient(135deg, #0f2744 0%, #274C8D 100%)',
  },
  {
    path: '/ip-whitelist',
    label: 'Acceso por IP',
    clave: null,
    description: 'Control de acceso por IP y rangos CIDR',
    icon: LuShieldCheck,
    gradient: 'linear-gradient(135deg, #f7971e 0%, #f59e0b 100%)',
    soloSuperAdmin: true,
  },
  {
    path: '/auditoria',
    label: 'Auditoría',
    clave: null,
    description: 'Registro de accesos, acciones y eventos de seguridad',
    icon: LuSquareActivity,
    gradient: 'linear-gradient(135deg, #dc2626 0%, #9333ea 100%)',
    soloSuperAdmin: true,
  },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return { text: 'Buenos días',    Icon: LuSun,     color: '#f59e0b' };
  if (h >= 12 && h < 20) return { text: 'Buenas tardes', Icon: LuSunset,  color: '#ef4444' };
  return                        { text: 'Buenas noches', Icon: LuMoon,    color: '#6366f1' };
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const DIAS   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatDate(d) {
  const dia  = DIAS[d.getDay()];
  const num  = d.getDate();
  const mes  = MESES[d.getMonth()];
  const anio = d.getFullYear();
  return `${dia.charAt(0).toUpperCase() + dia.slice(1)}, ${num} de ${mes} de ${anio}`;
}

function formatTime(d) {
  return d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

export default function Dashboard() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const greeting = useMemo(getGreeting, []);
  const now      = useClock();

  const modules = ALL_MODULES.filter(m => {
    if (m.soloSuperAdmin) return user?.rol === 'SUPER_ADMIN';
    if (user?.rol === 'SUPER_ADMIN') return true;
    return user?.modulos?.includes(m.clave);
  });

  return (
    <div className="app-shell">
      <Navbar />
      <main className="launcher-main">
        <div className="launcher-header">
          <div className="launcher-avatar">
            <LuUserCheck size={32} color="white" />
            <span className="launcher-avatar-badge">✓</span>
          </div>
          <div className="launcher-header-info">
            <h2>
              <greeting.Icon size={22} color={greeting.color} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              {greeting.text}, <span>{user?.nombre}</span>
            </h2>
            <div className="launcher-datetime">
              <span className="launcher-date">{formatDate(now)}</span>
              <span className="launcher-sep">·</span>
              <span className="launcher-time">{formatTime(now)}</span>
            </div>
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