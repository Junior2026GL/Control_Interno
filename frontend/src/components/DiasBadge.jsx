import { FiCalendar } from 'react-icons/fi';

/* Cuadro con los días de viático: el último día (regreso) cuenta como medio día
   (estilos vs-dias-badge en pages/ViaticosSeguridad.css) */
export default function DiasBadge({ n }) {
  const pagados = n > 1 ? n - 0.5 : n;
  return (
    <div className="vs-dias-badge" title="Dias de viatico: el ultimo dia (regreso) cuenta como medio dia">
      <FiCalendar size={17} />
      <strong>{pagados}</strong>
      <span>{pagados === 1 ? 'dia' : 'dias'}</span>
      {n > 1 && <small>{n} de calendario · ultimo dia medio</small>}
    </div>
  );
}
