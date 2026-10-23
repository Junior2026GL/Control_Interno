import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronRight } from 'react-icons/fi';
import { LuPlane, LuCar, LuChartColumn, LuLuggage } from 'react-icons/lu';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './ConstanciaTransferencia.css';
import './ViaticosMenu.css';

const OPCIONES = [
  {
    path: '/viaticos-nacionales',
    modulo: 'viaticos-nacionales',
    icon: <LuCar size={26} />,
    color: 'teal',
    titulo: 'Viáticos Nacionales',
    desc: 'Recibos de viáticos para empleados con consulta al censo nacional.',
  },
  {
    path: '/viaticos/internacional',
    modulo: 'viaticos',
    icon: <LuPlane size={26} />,
    color: 'blue',
    titulo: 'Viáticos Internacionales',
    desc: 'Cuadro de cálculos de viáticos al exterior de diputados — Pagaduría Especial.',
  },
  {
    path: '/viaticos/reportes',
    modulo: 'viaticos-reportes',
    icon: <LuChartColumn size={26} />,
    color: 'amber',
    titulo: 'Reportes de Viáticos',
    desc: 'Próximamente.',
    deshabilitado: true,
  },
];

export default function ViaticosMenu() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const visibles = OPCIONES.filter(
    op => user?.rol === 'SUPER_ADMIN' || user?.modulos?.includes(op.modulo)
  );

  return (
    <div className="page-shell">
      <Navbar />
      <div className="ct-page">
        <div className="ct-banner">
          <div className="ct-banner-icon"><LuLuggage size={26} /></div>
          <div>
            <h1 className="ct-banner-title">Viáticos</h1>
            <p className="ct-banner-sub">Seleccione el tipo de viático con el que desea trabajar</p>
          </div>
        </div>

        <div className="ct-selector-grid">
          {visibles.map(op => (
            <button
              key={op.path}
              type="button"
              className={`ct-type-card${op.deshabilitado ? ' vm-disabled' : ''}`}
              disabled={op.deshabilitado}
              onClick={() => navigate(op.path)}
            >
              <div className={`ct-type-card-icon ct-type-card-icon--${op.color}`}>{op.icon}</div>
              <div className="ct-type-card-body">
                <h3>{op.titulo}</h3>
                <p>{op.desc}</p>
              </div>
              <FiChevronRight className="ct-type-card-arrow" size={18} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
